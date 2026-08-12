import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import {
  type ConsumerDraftSnapshot,
  type ConsumerTransactionRepository,
  type SaveConsumerDraftMutation,
} from '../../../application/v1/consumer-transaction-service';
import { ApplicationError } from '../../../application/v1/errors';
import type { LegacyConsumerTransaction } from '../../../domain/v1/compatibility';
import { storedOutboxEvent } from './outbox';

function timestamp(value: unknown, field: string): Date {
  if (!(value instanceof Timestamp)) throw new Error(`Persisted consumer transaction has invalid ${field}.`);
  return value.toDate();
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string') : [];
}

function snapshot(id: string, data: DocumentData): ConsumerDraftSnapshot {
  if (typeof data.sellerId !== 'string' || typeof data.status !== 'string') {
    throw new Error('Persisted consumer transaction has invalid ownership or status.');
  }
  return {
    id,
    sellerId: data.sellerId,
    buyerId: typeof data.buyerId === 'string' ? data.buyerId : null,
    status: data.status as LegacyConsumerTransaction['status'],
    handoffConfirmedBy: stringArray(data.handoffConfirmedBy),
    completedBy: stringArray(data.completedBy),
    createdAt: timestamp(data.createdAt, 'createdAt'),
  };
}

export class FirestoreConsumerTransactionRepository implements ConsumerTransactionRepository {
  constructor(private readonly firestore: Firestore) {}

  allocateTransactionId(): string {
    return this.firestore.collection('transactions').doc().id;
  }

  async hasActiveTransactionForSeller(sellerId: string, statuses: readonly LegacyConsumerTransaction['status'][]): Promise<boolean> {
    const result = await this.firestore.collection('transactions')
      .where('sellerId', '==', sellerId)
      .where('status', 'in', [...statuses])
      .limit(1)
      .get();
    return !result.empty;
  }

  async findDraft(transactionId: string): Promise<ConsumerDraftSnapshot | null> {
    const result = await this.firestore.collection('transactions').doc(transactionId).get();
    return result.exists ? snapshot(result.id, result.data()!) : null;
  }

  async saveDraft(mutation: SaveConsumerDraftMutation): Promise<void> {
    const transactionRef = this.firestore.collection('transactions').doc(mutation.transactionId);
    const eventRef = transactionRef.collection('events').doc(mutation.event.id);
    const outboxRef = this.firestore.collection('domainOutbox').doc(mutation.event.id);
    await this.firestore.runTransaction(async (tx) => {
      const [current, event, outbox] = await Promise.all([tx.get(transactionRef), tx.get(eventRef), tx.get(outboxRef)]);
      if (mutation.expected.exists && !current.exists) {
        throw new ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'PackProof draft not found.');
      }
      if (!mutation.expected.exists && current.exists) {
        throw new ApplicationError('CONFLICT', 'TRANSACTION_ID_CONFLICT', 'The reserved transaction identifier is already in use.');
      }
      if (current.exists) {
        const data = current.data()!;
        if (data.sellerId !== mutation.expected.sellerId) {
          throw new ApplicationError('FORBIDDEN', 'SELLER_REQUIRED', 'Only the seller can edit this draft.');
        }
        if (!mutation.expected.editableStatuses.includes(data.status as LegacyConsumerTransaction['status'])) {
          throw new ApplicationError('FAILED_PRECONDITION', 'TERMS_ALREADY_LOCKED', 'Locked terms cannot be edited.');
        }
      }

      const record = mutation.record;
      tx.set(transactionRef, {
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
        lockedAt: null,
        updatedAt: Timestamp.fromDate(record.updatedAt),
        ...(current.exists ? {} : { createdAt: Timestamp.fromDate(record.createdAt) }),
      }, { merge: true });
      if (!event.exists) {
        tx.create(eventRef, {
          actorId: mutation.event.actor.id,
          type: mutation.event.type,
          summary: mutation.event.type === 'DRAFT_UPDATED' ? 'Seller updated the proposed terms.' : 'Seller created the PackProof.',
          metadata: { applicationEventId: mutation.event.id, schemaVersion: mutation.event.schemaVersion },
          createdAt: Timestamp.fromDate(mutation.event.occurredAt),
        });
      }
      if (!outbox.exists) tx.create(outboxRef, storedOutboxEvent(mutation.event));
    });
  }
}
