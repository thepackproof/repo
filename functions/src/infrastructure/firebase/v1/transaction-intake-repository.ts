import { Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import type {
  IntakeClaimDecision,
  PendingIntakeRecord,
  PendingIntakeSnapshot,
  TransactionIntakeMutation,
  TransactionIntakeRepository,
  TransactionIntakeStartResult,
} from '../../../application/v1/transaction-intake-service';
import { ApplicationError } from '../../../application/v1/errors';
import { commerceContextDtoSchema, passportDraftDtoSchema, type CommerceContextDto, type PassportDraftDto } from '../../../domain/v1/commerce';
import { storedOutboxEvent } from './outbox';

function timestamp(value: unknown, field: string): Date {
  if (!(value instanceof Timestamp)) throw new Error(`Persisted consumer intake has invalid ${field}.`);
  return value.toDate();
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Persisted consumer intake has invalid ${field}.`);
  return value;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function storedCommerceContext(context: CommerceContextDto): DocumentData {
  return {
    ...context,
    source: { ...context.source, capturedAt: Timestamp.fromDate(new Date(context.source.capturedAt)) },
    fieldProvenance: Object.fromEntries(Object.entries(context.fieldProvenance).map(([field, provenance]) => [field, {
      ...provenance,
      importedAt: Timestamp.fromDate(new Date(provenance.importedAt)),
    }])),
    expiresAt: context.expiresAt ? Timestamp.fromDate(new Date(context.expiresAt)) : null,
    createdAt: Timestamp.fromDate(new Date(context.createdAt)),
    updatedAt: Timestamp.fromDate(new Date(context.updatedAt)),
  };
}

function storedPassportDraft(draft: PassportDraftDto): DocumentData {
  return {
    ...draft,
    expiresAt: draft.expiresAt ? Timestamp.fromDate(new Date(draft.expiresAt)) : null,
    createdAt: Timestamp.fromDate(new Date(draft.createdAt)),
    updatedAt: Timestamp.fromDate(new Date(draft.updatedAt)),
  };
}

function contextDto(id: string, data: DocumentData): CommerceContextDto {
  const fieldProvenance = Object.fromEntries(Object.entries(data.fieldProvenance ?? {}).map(([field, raw]) => {
    const provenance = raw as DocumentData;
    return [field, { ...provenance, importedAt: timestamp(provenance.importedAt, `fieldProvenance.${field}.importedAt`).toISOString() }];
  }));
  return commerceContextDtoSchema.parse({
    ...data,
    id,
    source: { ...data.source, capturedAt: timestamp(data.source?.capturedAt, 'source.capturedAt').toISOString() },
    fieldProvenance,
    expiresAt: data.expiresAt instanceof Timestamp ? data.expiresAt.toDate().toISOString() : null,
    createdAt: timestamp(data.createdAt, 'createdAt').toISOString(),
    updatedAt: timestamp(data.updatedAt, 'updatedAt').toISOString(),
  });
}

function draftDto(id: string, data: DocumentData): PassportDraftDto {
  return passportDraftDtoSchema.parse({
    ...data,
    id,
    expiresAt: data.expiresAt instanceof Timestamp ? data.expiresAt.toDate().toISOString() : null,
    createdAt: timestamp(data.createdAt, 'draft.createdAt').toISOString(),
    updatedAt: timestamp(data.updatedAt, 'draft.updatedAt').toISOString(),
  });
}

function storedPending(pending: PendingIntakeRecord, createdAt: Date): DocumentData {
  return {
    ...pending,
    createdAt: Timestamp.fromDate(createdAt),
  };
}

function pendingRecord(data: DocumentData): PendingIntakeRecord {
  return {
    commerceContextId: requiredString(data.commerceContextId, 'commerceContextId'),
    passportDraftId: requiredString(data.passportDraftId, 'passportDraftId'),
    title: requiredString(data.title, 'title'),
    variant: optionalString(data.variant),
    quantity: typeof data.quantity === 'number' ? data.quantity : 1,
    amount: data.amount && typeof data.amount === 'object' ? data.amount as PendingIntakeRecord['amount'] : null,
    orderNumber: optionalString(data.orderNumber),
    intakeSourceType: optionalString(data.intakeSourceType) as PendingIntakeRecord['intakeSourceType'],
    platformIdentifier: optionalString(data.platformIdentifier),
    importedAt: typeof data.importedAt === 'string' ? data.importedAt : timestamp(data.createdAt, 'createdAt').toISOString(),
    missingFields: Array.isArray(data.missingFields) ? data.missingFields.filter((value): value is string => typeof value === 'string') : [],
    heuristicFields: Array.isArray(data.heuristicFields)
      ? data.heuristicFields.filter((value): value is PendingIntakeRecord['heuristicFields'][number] => typeof value === 'string')
      : [],
  };
}

export class FirestoreTransactionIntakeRepository implements TransactionIntakeRepository {
  constructor(private readonly firestore: Firestore) {}

  async createOrReplay(mutation: TransactionIntakeMutation): Promise<{ created: boolean }> {
    const recordRef = this.firestore.collection('consumerIntakeRecords').doc(mutation.commerceContextId);
    const contextRef = this.firestore.collection('commerceContexts').doc(mutation.commerceContext.id);
    const draftRef = this.firestore.collection('passportDrafts').doc(mutation.passportDraft.id);
    const pendingRef = this.firestore.collection('users').doc(mutation.actorId).collection('pendingIntakes').doc(mutation.commerceContextId);
    const outboxRef = this.firestore.collection('domainOutbox').doc(mutation.event.id);
    return this.firestore.runTransaction(async (tx) => {
      const [record, context, draft, pending, outbox] = await Promise.all([
        tx.get(recordRef), tx.get(contextRef), tx.get(draftRef), tx.get(pendingRef), tx.get(outboxRef),
      ]);
      if (record.exists) {
        const data = record.data()!;
        if (data.requestFingerprint !== mutation.requestFingerprint) {
          throw new ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'This import was already used with different purchase details.');
        }
        if (requiredString(data.actorId, 'actorId') !== mutation.actorId) {
          throw new ApplicationError('CONFLICT', 'INTAKE_IDENTITY_CONFLICT', 'This import identity is already bound to another account.');
        }
        if (!context.exists) tx.create(contextRef, storedCommerceContext(mutation.commerceContext));
        if (!draft.exists) tx.create(draftRef, storedPassportDraft(mutation.passportDraft));
        if (!outbox.exists) tx.create(outboxRef, storedOutboxEvent(mutation.event));
        if (data.status === 'PENDING' && !pending.exists) {
          tx.create(pendingRef, storedPending(mutation.pending, mutation.event.occurredAt));
        }
        return { created: false };
      }
      if (context.exists || draft.exists) {
        throw new ApplicationError('CONFLICT', 'INTAKE_RESOURCE_CONFLICT', 'A derived intake resource identifier is already in use.');
      }
      tx.create(contextRef, storedCommerceContext(mutation.commerceContext));
      tx.create(draftRef, storedPassportDraft(mutation.passportDraft));
      tx.create(recordRef, {
        schemaVersion: 1,
        actorId: mutation.actorId,
        organizationId: mutation.organizationId,
        operationKey: mutation.operationKey,
        requestFingerprint: mutation.requestFingerprint,
        commerceContextId: mutation.commerceContextId,
        passportDraftId: mutation.passportDraftId,
        status: 'PENDING',
        transactionId: null,
        expiresAt: Timestamp.fromDate(new Date(mutation.commerceContext.expiresAt ?? mutation.event.occurredAt)),
        createdAt: Timestamp.fromDate(mutation.event.occurredAt),
        updatedAt: Timestamp.fromDate(mutation.event.occurredAt),
      });
      tx.create(pendingRef, storedPending(mutation.pending, mutation.event.occurredAt));
      tx.create(outboxRef, storedOutboxEvent(mutation.event));
      return { created: true };
    });
  }

  async listPendingForActor(actorId: string): Promise<PendingIntakeRecord[]> {
    const result = await this.firestore.collection('users').doc(actorId).collection('pendingIntakes')
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();
    return result.docs.map((doc) => pendingRecord({ ...doc.data(), commerceContextId: doc.data().commerceContextId ?? doc.id }));
  }

  async hasActiveTransactionForSeller(sellerId: string, statuses: readonly string[]): Promise<boolean> {
    const result = await this.firestore.collection('transactions')
      .where('sellerId', '==', sellerId)
      .where('status', 'in', [...statuses])
      .limit(1)
      .get();
    return !result.empty;
  }

  async claim(
    commerceContextId: string,
    decide: (snapshot: PendingIntakeSnapshot | null, transactionId: string) => IntakeClaimDecision,
  ): Promise<TransactionIntakeStartResult> {
    const recordRef = this.firestore.collection('consumerIntakeRecords').doc(commerceContextId);
    const transactionRef = this.firestore.collection('transactions').doc();
    return this.firestore.runTransaction(async (tx) => {
      const recordDocument = await tx.get(recordRef);
      let snapshot: PendingIntakeSnapshot | null = null;
      let contextRef: FirebaseFirestore.DocumentReference | null = null;
      let draftRef: FirebaseFirestore.DocumentReference | null = null;
      let pendingRef: FirebaseFirestore.DocumentReference | null = null;
      if (recordDocument.exists) {
        const data = recordDocument.data()!;
        const actorId = requiredString(data.actorId, 'actorId');
        contextRef = this.firestore.collection('commerceContexts').doc(requiredString(data.commerceContextId, 'commerceContextId'));
        draftRef = this.firestore.collection('passportDrafts').doc(requiredString(data.passportDraftId, 'passportDraftId'));
        pendingRef = this.firestore.collection('users').doc(actorId).collection('pendingIntakes').doc(commerceContextId);
        const [contextDocument, draftDocument] = await Promise.all([tx.get(contextRef), tx.get(draftRef)]);
        if (!contextDocument.exists || !draftDocument.exists) throw new Error('Consumer intake references missing context or draft data.');
        snapshot = {
          actorId,
          status: requiredString(data.status, 'status') as PendingIntakeSnapshot['status'],
          transactionId: optionalString(data.transactionId),
          expiresAt: timestamp(data.expiresAt, 'expiresAt'),
          commerceContext: contextDto(contextDocument.id, contextDocument.data()!),
          passportDraft: draftDto(draftDocument.id, draftDocument.data()!),
        };
      }
      const decision = decide(snapshot, transactionRef.id);
      if (decision.type === 'REPLAY') return decision.result;
      if (!snapshot || !contextRef || !draftRef || !pendingRef) throw new Error('Create decision requires an existing consumer intake record.');

      const transactionEvent = decision.events.find((event) => event.resourceType === 'transaction');
      if (!transactionEvent) throw new Error('Intake start requires a transaction event.');
      const transactionEventRef = transactionRef.collection('events').doc(transactionEvent.id);
      const outboxRefs = decision.events.map((event) => this.firestore.collection('domainOutbox').doc(event.id));
      const [existingEvent, pendingDocument, ...existingOutboxes] = await Promise.all([
        tx.get(transactionEventRef), tx.get(pendingRef), ...outboxRefs.map((ref) => tx.get(ref)),
      ]);
      const record = decision.transaction;
      tx.create(transactionRef, {
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
        source: record.source,
        createdAt: Timestamp.fromDate(record.createdAt),
        updatedAt: Timestamp.fromDate(record.updatedAt),
      });
      tx.update(recordRef, {
        status: 'CLAIMED',
        transactionId: transactionRef.id,
        updatedAt: Timestamp.fromDate(transactionEvent.occurredAt),
      });
      tx.update(contextRef, { status: 'CLAIMED', updatedAt: Timestamp.fromDate(transactionEvent.occurredAt) });
      tx.update(draftRef, {
        status: 'BOUND',
        transactionId: transactionRef.id,
        item: decision.draftItem,
        updatedAt: Timestamp.fromDate(transactionEvent.occurredAt),
      });
      if (pendingDocument.exists) tx.delete(pendingRef);
      if (!existingEvent.exists) {
        tx.create(transactionEventRef, {
          actorId: transactionEvent.actor.id,
          type: 'TRANSACTION_CREATED',
          summary: 'Seller created an editable PackProof draft from imported purchase correspondence.',
          metadata: {
            applicationEventId: transactionEvent.id,
            commerceContextId: snapshot.commerceContext.id,
            passportDraftId: snapshot.passportDraft.id,
            trustLevel: snapshot.commerceContext.source.trustLevel,
            intakeSourceType: snapshot.commerceContext.source.intakeSourceType,
            schemaVersion: 1,
          },
          createdAt: Timestamp.fromDate(transactionEvent.occurredAt),
        });
      }
      decision.events.forEach((event, index) => {
        if (!existingOutboxes[index].exists) tx.create(outboxRefs[index], storedOutboxEvent(event));
      });
      return {
        transactionId: transactionRef.id,
        commerceContextId: snapshot.commerceContext.id,
        passportDraftId: snapshot.passportDraft.id,
        replayed: false,
      };
    });
  }
}
