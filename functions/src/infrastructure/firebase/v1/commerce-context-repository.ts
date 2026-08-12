import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import type { CommerceContextMutation, CommerceContextRepository } from '../../../application/v1/commerce-context-service';
import { ApplicationError } from '../../../application/v1/errors';
import type { CommerceContextDto } from '../../../domain/v1/commerce';
import { storedOutboxEvent } from './outbox';

function storedCommerceContext(context: CommerceContextDto): DocumentData {
  return {
    id: context.id,
    object: context.object,
    schemaVersion: context.schemaVersion,
    integrationId: context.integrationId,
    source: { ...context.source, capturedAt: Timestamp.fromDate(new Date(context.source.capturedAt)) },
    item: context.item,
    fieldProvenance: Object.fromEntries(Object.entries(context.fieldProvenance).map(([field, provenance]) => [
      field,
      { ...provenance, importedAt: Timestamp.fromDate(new Date(provenance.importedAt)) },
    ])),
    canonicalPayloadSha256: context.canonicalPayloadSha256,
    status: context.status,
    supersedesCommerceContextId: context.supersedesCommerceContextId,
    expiresAt: context.expiresAt ? Timestamp.fromDate(new Date(context.expiresAt)) : null,
    createdAt: Timestamp.fromDate(new Date(context.createdAt)),
    updatedAt: Timestamp.fromDate(new Date(context.updatedAt)),
  };
}

export class FirestoreCommerceContextRepository implements CommerceContextRepository {
  constructor(private readonly firestore: Firestore) {}

  async createOrReplay(mutation: CommerceContextMutation): Promise<{ created: boolean; expiresAt: Date }> {
    const sessionRef = this.firestore.collection('connectSessions').doc(mutation.sessionId);
    const contextRef = this.firestore.collection('commerceContexts').doc(mutation.commerceContext.id);
    const outboxRef = this.firestore.collection('domainOutbox').doc(mutation.event.id);
    return this.firestore.runTransaction(async (tx) => {
      const [existingSession, existingContext, existingOutbox] = await Promise.all([
        tx.get(sessionRef), tx.get(contextRef), tx.get(outboxRef),
      ]);
      if (existingSession.exists) {
        const data = existingSession.data()!;
        if (data.requestPayloadHash !== mutation.requestPayloadHash) {
          throw new ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used with a different order payload.');
        }
        if (!(data.expiresAt instanceof Timestamp)) throw new Error('Persisted Connect session has invalid expiresAt.');
        if (!existingContext.exists) tx.create(contextRef, storedCommerceContext(mutation.commerceContext));
        if (!existingOutbox.exists) tx.create(outboxRef, storedOutboxEvent(mutation.event));
        if (!data.commerceContextId) tx.update(sessionRef, { commerceContextId: mutation.commerceContext.id });
        return { created: false, expiresAt: data.expiresAt.toDate() };
      }
      if (existingContext.exists) {
        throw new ApplicationError('CONFLICT', 'COMMERCE_CONTEXT_ID_CONFLICT', 'The derived commerce-context identifier is already in use.');
      }
      const session = mutation.session;
      tx.create(contextRef, storedCommerceContext(mutation.commerceContext));
      tx.create(sessionRef, {
        id: mutation.sessionId,
        commerceContextId: mutation.commerceContext.id,
        integrationId: session.integrationId,
        platform: session.platform,
        externalOrderId: session.externalOrderId,
        externalSellerId: session.externalSellerId,
        trackingNumber: session.trackingNumber,
        carrier: session.carrier,
        itemTitle: session.itemTitle,
        itemDescription: session.itemDescription,
        itemDescriptor: mutation.commerceContext.item,
        declaredWeightGrams: session.declaredWeightGrams,
        priceMinor: session.priceMinor,
        currency: session.currency,
        callbackUrl: session.callbackUrl,
        tokenHash: mutation.sessionTokenHash,
        requestPayloadHash: mutation.requestPayloadHash,
        status: session.status,
        transactionId: null,
        claimedBy: null,
        createdAt: Timestamp.fromDate(mutation.event.occurredAt),
        expiresAt: Timestamp.fromDate(session.expiresAt),
      });
      tx.create(outboxRef, storedOutboxEvent(mutation.event));
      return { created: true, expiresAt: session.expiresAt };
    });
  }
}
