import { FieldValue, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import type {
  ConnectHandoffRepository,
  ConnectRedemptionDecision,
  ConnectSessionSnapshot,
} from '../../../application/v1/connect-handoff-service';
import { storedOutboxEvent } from './outbox';

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Persisted Connect session has invalid ${field}.`);
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function finiteInteger(value: unknown, field: string, fallback: number): number {
  if (value === undefined || value === null) return fallback;
  if (!Number.isSafeInteger(value)) throw new Error(`Persisted Connect session has invalid ${field}.`);
  return value as number;
}

function toSession(id: string, data: DocumentData): ConnectSessionSnapshot {
  if (!(data.expiresAt instanceof Timestamp)) throw new Error('Persisted Connect session has invalid expiresAt.');
  return {
    id,
    commerceContextId: optionalString(data.commerceContextId),
    integrationId: requiredString(data.integrationId, 'integrationId'),
    platform: requiredString(data.platform, 'platform'),
    externalOrderId: requiredString(data.externalOrderId, 'externalOrderId'),
    externalSellerId: requiredString(data.externalSellerId, 'externalSellerId'),
    trackingNumber: optionalString(data.trackingNumber),
    carrier: optionalString(data.carrier),
    itemTitle: requiredString(data.itemTitle, 'itemTitle'),
    itemDescription: typeof data.itemDescription === 'string' ? data.itemDescription : '',
    declaredWeightGrams: data.declaredWeightGrams === null || data.declaredWeightGrams === undefined
      ? null
      : finiteInteger(data.declaredWeightGrams, 'declaredWeightGrams', 0),
    priceMinor: finiteInteger(data.priceMinor, 'priceMinor', 0),
    currency: requiredString(data.currency ?? 'USD', 'currency'),
    callbackUrl: requiredString(data.callbackUrl, 'callbackUrl'),
    tokenHash: optionalString(data.tokenHash),
    status: requiredString(data.status, 'status'),
    transactionId: optionalString(data.transactionId),
    claimedBy: optionalString(data.claimedBy),
    expiresAt: data.expiresAt.toDate(),
  };
}

function storedTransaction(decision: Extract<ConnectRedemptionDecision, { type: 'CREATE' }>): DocumentData {
  const record = decision.transaction;
  return {
    sellerId: record.sellerId,
    buyerId: record.buyerId,
    participantIds: record.participantIds,
    status: record.status,
    title: record.title,
    category: record.category,
    description: record.description,
    priceMinor: record.priceMinor,
    currency: record.currency,
    identifiers: record.identifiers,
    conditionNotes: record.conditionNotes,
    terms: record.terms,
    confirmedBy: record.confirmedBy,
    handoffConfirmedBy: record.handoffConfirmedBy,
    completedBy: record.completedBy,
    lockedAt: Timestamp.fromDate(record.lockedAt),
    createdAt: Timestamp.fromDate(record.createdAt),
    updatedAt: Timestamp.fromDate(record.updatedAt),
    source: record.source,
  };
}

export class FirestoreConnectHandoffRepository implements ConnectHandoffRepository {
  constructor(private readonly firestore: Firestore) {}

  async redeem(
    sessionId: string,
    decide: (session: ConnectSessionSnapshot | null, transactionId: string) => ConnectRedemptionDecision,
  ): Promise<{ transactionId: string; connectSessionId: string }> {
    const sessionRef = this.firestore.collection('connectSessions').doc(sessionId);
    const transactionRef = this.firestore.collection('transactions').doc();
    return this.firestore.runTransaction(async (tx) => {
      const sessionDocument = await tx.get(sessionRef);
      const session = sessionDocument.exists ? toSession(sessionDocument.id, sessionDocument.data()!) : null;
      const decision = decide(session, transactionRef.id);
      if (decision.type === 'REPLAY') return decision.result;

      const eventRef = transactionRef.collection('events').doc(decision.event.id);
      const outboxRef = this.firestore.collection('domainOutbox').doc(decision.event.id);
      const [existingEvent, existingOutbox] = await Promise.all([tx.get(eventRef), tx.get(outboxRef)]);
      tx.create(transactionRef, storedTransaction(decision));
      tx.update(sessionRef, {
        claimedBy: decision.transaction.sellerId,
        transactionId: transactionRef.id,
        status: 'READY_FOR_CAPTURE',
        claimedAt: Timestamp.fromDate(decision.event.occurredAt),
        tokenHash: FieldValue.delete(),
      });
      if (!existingEvent.exists) {
        tx.create(eventRef, {
          actorId: decision.event.actor.id,
          type: 'CONNECT_SESSION_REDEEMED',
          summary: 'Seller claimed an imported commerce order.',
          metadata: { applicationEventId: decision.event.id, connectSessionId: sessionId, schemaVersion: 1 },
          createdAt: Timestamp.fromDate(decision.event.occurredAt),
        });
      }
      if (!existingOutbox.exists) tx.create(outboxRef, storedOutboxEvent(decision.event));
      return { transactionId: transactionRef.id, connectSessionId: sessionId };
    });
  }
}
