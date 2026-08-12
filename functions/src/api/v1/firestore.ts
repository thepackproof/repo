import { FieldPath, Timestamp, type DocumentData, type Firestore, type Query } from 'firebase-admin/firestore';
import { ApplicationError } from '../../application/v1/errors';
import type { ApplicationEvent } from '../../application/v1/events';
import { storedOutboxEvent } from '../../infrastructure/firebase/v1/outbox';
import {
  MerchantTransaction,
  captureArtifactTypes,
  decodeTransactionCursor,
  encodeTransactionCursor,
  merchantTransactionStatuses,
  transactionQueryHash,
  type ListTransactionsInput,
  type TransactionPage,
} from './core';
import type { ReadinessChecker, TransactionRepository } from './ports';

const captureStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE'] as const;
const shipmentStatuses = ['NOT_ASSOCIATED', 'ASSOCIATED'] as const;
const verificationStatuses = ['PENDING_EVIDENCE', 'PENDING', 'PROCESSING', 'COMPLETE'] as const;

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Persisted transaction has invalid ${field}.`);
  return value;
}

function date(value: unknown, field: string): Date {
  if (!(value instanceof Timestamp)) throw new Error(`Persisted transaction has invalid ${field}.`);
  return value.toDate();
}

function storedEnum<T extends string>(value: unknown, values: readonly T[], field: string): T {
  if (typeof value !== 'string' || !values.includes(value as T)) throw new Error(`Persisted transaction has invalid ${field}.`);
  return value as T;
}

function storedAmount(value: unknown): MerchantTransaction['amount'] {
  if (value === null) return null;
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Persisted transaction has invalid amount.');
  const amount = value as Record<string, unknown>;
  if (typeof amount.currency !== 'string' || !/^[A-Z]{3}$/.test(amount.currency)
    || !Number.isSafeInteger(amount.minorUnits) || (amount.minorUnits as number) < 0 || (amount.minorUnits as number) > 10_000_000_000) {
    throw new Error('Persisted transaction has invalid amount.');
  }
  return { currency: amount.currency, minorUnits: amount.minorUnits as number };
}

function storedParticipants(value: unknown): MerchantTransaction['participants'] {
  if (!Array.isArray(value) || value.length > 3) throw new Error('Persisted transaction has invalid apiParticipants.');
  const roles = new Set<string>();
  return value.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new Error('Persisted transaction has invalid apiParticipants.');
    const participant = entry as Record<string, unknown>;
    const role = storedEnum(participant.role, ['SELLER', 'BUYER', 'RECEIVER'] as const, 'apiParticipants.role');
    if (roles.has(role)) throw new Error('Persisted transaction has duplicate participant roles.');
    roles.add(role);
    return { role, externalReference: requiredString(participant.externalReference, 'apiParticipants.externalReference') };
  });
}

function storedCaptureRequirements(value: unknown): MerchantTransaction['captureRequirements'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Persisted transaction has invalid captureRequirements.');
  const requiredArtifactTypes = (value as Record<string, unknown>).requiredArtifactTypes;
  if (!Array.isArray(requiredArtifactTypes) || requiredArtifactTypes.length > captureArtifactTypes.length) {
    throw new Error('Persisted transaction has invalid captureRequirements.');
  }
  const entries = requiredArtifactTypes.map((entry) => storedEnum(entry, captureArtifactTypes, 'captureRequirements.requiredArtifactTypes'));
  if (new Set(entries).size !== entries.length) throw new Error('Persisted transaction has duplicate capture requirements.');
  return { requiredArtifactTypes: entries };
}

function toMerchantTransaction(id: string, value: DocumentData): MerchantTransaction {
  return {
    id,
    organizationId: requiredString(value.organizationId, 'organizationId'),
    merchantReference: requiredString(value.merchantReference, 'merchantReference'),
    title: requiredString(value.title, 'title'),
    description: typeof value.description === 'string' ? value.description : '',
    category: value.category === null ? null : requiredString(value.category, 'category'),
    amount: storedAmount(value.amount),
    participants: storedParticipants(value.apiParticipants),
    captureRequirements: storedCaptureRequirements(value.captureRequirements),
    status: storedEnum(value.apiStatus, merchantTransactionStatuses, 'apiStatus'),
    captureStatus: storedEnum(value.captureStatus, captureStatuses, 'captureStatus'),
    shipmentStatus: storedEnum(value.shipmentStatus, shipmentStatuses, 'shipmentStatus'),
    receiverStatus: storedEnum(value.receiverStatus, captureStatuses, 'receiverStatus'),
    returnStatus: storedEnum(value.returnStatus, captureStatuses, 'returnStatus'),
    verificationStatus: storedEnum(value.verificationStatus, verificationStatuses, 'verificationStatus'),
    createdByApiClientId: requiredString(value.createdByApiClientId, 'createdByApiClientId'),
    createdAt: date(value.createdAt, 'createdAt'),
    updatedAt: date(value.updatedAt, 'updatedAt'),
  };
}

function toStoredTransaction(transaction: MerchantTransaction): DocumentData {
  return {
    apiVersion: 'v1',
    sourceType: 'MERCHANT_API',
    organizationId: transaction.organizationId,
    createdByApiClientId: transaction.createdByApiClientId,
    merchantReference: transaction.merchantReference,
    apiStatus: transaction.status,
    captureStatus: transaction.captureStatus,
    shipmentStatus: transaction.shipmentStatus,
    receiverStatus: transaction.receiverStatus,
    returnStatus: transaction.returnStatus,
    verificationStatus: transaction.verificationStatus,
    apiParticipants: transaction.participants,
    captureRequirements: transaction.captureRequirements,
    title: transaction.title,
    category: transaction.category,
    description: transaction.description,
    amount: transaction.amount,
    priceMinor: transaction.amount?.minorUnits ?? 0,
    currency: transaction.amount?.currency ?? 'USD',
    identifiers: [{ label: 'Merchant reference', value: transaction.merchantReference }],
    conditionNotes: '',
    terms: {
      saleType: 'SHIPPED',
      shippingResponsibility: 'SELLER',
      returns: 'PLATFORM_POLICY',
      returnWindowDays: 0,
      customTerms: 'Terms are governed by the originating merchant workflow.',
    },
    // Merchant API records are deliberately invisible to consumer queries until
    // a future, authenticated participant-claim operation binds Firebase users.
    sellerId: null,
    buyerId: null,
    participantIds: [],
    status: 'DRAFT',
    confirmedBy: [],
    handoffConfirmedBy: [],
    completedBy: [],
    lockedAt: null,
    createdAt: Timestamp.fromDate(transaction.createdAt),
    updatedAt: Timestamp.fromDate(transaction.updatedAt),
  };
}

export class FirestoreTransactionRepository implements TransactionRepository {
  constructor(private readonly firestore: Firestore) {}

  async create(transaction: MerchantTransaction, event: ApplicationEvent): Promise<MerchantTransaction> {
    const ref = this.firestore.collection('transactions').doc(transaction.id);
    const outboxRef = this.firestore.collection('domainOutbox').doc(event.id);
    return this.firestore.runTransaction(async (tx) => {
      const [existing, outbox] = await Promise.all([tx.get(ref), tx.get(outboxRef)]);
      if (existing.exists) {
        const record = toMerchantTransaction(existing.id, existing.data()!);
        if (record.organizationId !== transaction.organizationId
          || record.merchantReference !== transaction.merchantReference
          || record.createdByApiClientId !== transaction.createdByApiClientId) {
          throw new ApplicationError('CONFLICT', 'TRANSACTION_ID_CONFLICT', 'The reserved transaction identifier is already in use.');
        }
        if (!outbox.exists) tx.create(outboxRef, storedOutboxEvent(event));
        return record;
      }
      tx.create(ref, toStoredTransaction(transaction));
      if (!outbox.exists) tx.create(outboxRef, storedOutboxEvent(event));
      return transaction;
    });
  }

  async findByIdForOrganization(id: string, organizationId: string): Promise<MerchantTransaction | null> {
    const snap = await this.firestore.collection('transactions').doc(id).get();
    if (!snap.exists || snap.data()?.sourceType !== 'MERCHANT_API' || snap.data()?.organizationId !== organizationId) return null;
    return toMerchantTransaction(snap.id, snap.data()!);
  }

  async listForOrganization(organizationId: string, input: ListTransactionsInput): Promise<TransactionPage> {
    const queryHash = transactionQueryHash(organizationId, input);
    let query: Query<DocumentData> = this.firestore.collection('transactions')
      .where('sourceType', '==', 'MERCHANT_API')
      .where('organizationId', '==', organizationId);
    if (input.status) query = query.where('apiStatus', '==', input.status);
    if (input.merchantReference) query = query.where('merchantReference', '==', input.merchantReference);
    if (input.createdAfter) query = query.where('createdAt', '>=', Timestamp.fromDate(input.createdAfter));
    if (input.createdBefore) query = query.where('createdAt', '<', Timestamp.fromDate(input.createdBefore));
    query = query.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
    if (input.cursor) {
      const cursor = decodeTransactionCursor(input.cursor);
      if (cursor.queryHash !== queryHash) {
        throw new ApplicationError('INVALID_ARGUMENT', 'CURSOR_QUERY_MISMATCH', 'This cursor belongs to a different transaction query.');
      }
      query = query.startAfter(Timestamp.fromDate(new Date(cursor.createdAt)), cursor.id);
    }
    const snap = await query.limit(input.limit + 1).get();
    const hasMore = snap.docs.length > input.limit;
    const pageDocs = hasMore ? snap.docs.slice(0, input.limit) : snap.docs;
    const transactions = pageDocs.map((doc) => toMerchantTransaction(doc.id, doc.data()));
    const last = pageDocs.at(-1);
    const nextCursor = hasMore && last
      ? encodeTransactionCursor({ createdAt: date(last.data().createdAt, 'createdAt').toISOString(), id: last.id, queryHash })
      : null;
    return { transactions, nextCursor };
  }
}

export class FirestoreReadinessChecker implements ReadinessChecker {
  constructor(private readonly firestore: Firestore) {}

  async check(): Promise<void> {
    await this.firestore.collection('_packproofSystem').doc('readiness').get();
  }
}
