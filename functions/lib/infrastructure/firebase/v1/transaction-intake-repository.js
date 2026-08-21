"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreTransactionIntakeRepository = void 0;
const firestore_1 = require("firebase-admin/firestore");
const errors_1 = require("../../../application/v1/errors");
const commerce_1 = require("../../../domain/v1/commerce");
const outbox_1 = require("./outbox");
function timestamp(value, field) {
    if (!(value instanceof firestore_1.Timestamp))
        throw new Error(`Persisted consumer intake has invalid ${field}.`);
    return value.toDate();
}
function requiredString(value, field) {
    if (typeof value !== 'string' || !value)
        throw new Error(`Persisted consumer intake has invalid ${field}.`);
    return value;
}
function optionalString(value) {
    return typeof value === 'string' && value ? value : null;
}
function storedCommerceContext(context) {
    return {
        ...context,
        source: { ...context.source, capturedAt: firestore_1.Timestamp.fromDate(new Date(context.source.capturedAt)) },
        fieldProvenance: Object.fromEntries(Object.entries(context.fieldProvenance).map(([field, provenance]) => [field, {
                ...provenance,
                importedAt: firestore_1.Timestamp.fromDate(new Date(provenance.importedAt)),
            }])),
        expiresAt: context.expiresAt ? firestore_1.Timestamp.fromDate(new Date(context.expiresAt)) : null,
        createdAt: firestore_1.Timestamp.fromDate(new Date(context.createdAt)),
        updatedAt: firestore_1.Timestamp.fromDate(new Date(context.updatedAt)),
    };
}
function storedPassportDraft(draft) {
    return {
        ...draft,
        expiresAt: draft.expiresAt ? firestore_1.Timestamp.fromDate(new Date(draft.expiresAt)) : null,
        createdAt: firestore_1.Timestamp.fromDate(new Date(draft.createdAt)),
        updatedAt: firestore_1.Timestamp.fromDate(new Date(draft.updatedAt)),
    };
}
function contextDto(id, data) {
    const fieldProvenance = Object.fromEntries(Object.entries(data.fieldProvenance ?? {}).map(([field, raw]) => {
        const provenance = raw;
        return [field, { ...provenance, importedAt: timestamp(provenance.importedAt, `fieldProvenance.${field}.importedAt`).toISOString() }];
    }));
    return commerce_1.commerceContextDtoSchema.parse({
        ...data,
        id,
        source: { ...data.source, capturedAt: timestamp(data.source?.capturedAt, 'source.capturedAt').toISOString() },
        fieldProvenance,
        expiresAt: data.expiresAt instanceof firestore_1.Timestamp ? data.expiresAt.toDate().toISOString() : null,
        createdAt: timestamp(data.createdAt, 'createdAt').toISOString(),
        updatedAt: timestamp(data.updatedAt, 'updatedAt').toISOString(),
    });
}
function draftDto(id, data) {
    return commerce_1.passportDraftDtoSchema.parse({
        ...data,
        id,
        expiresAt: data.expiresAt instanceof firestore_1.Timestamp ? data.expiresAt.toDate().toISOString() : null,
        createdAt: timestamp(data.createdAt, 'draft.createdAt').toISOString(),
        updatedAt: timestamp(data.updatedAt, 'draft.updatedAt').toISOString(),
    });
}
function storedPending(pending, createdAt) {
    return {
        ...pending,
        createdAt: firestore_1.Timestamp.fromDate(createdAt),
    };
}
function pendingRecord(data) {
    return {
        commerceContextId: requiredString(data.commerceContextId, 'commerceContextId'),
        passportDraftId: requiredString(data.passportDraftId, 'passportDraftId'),
        title: requiredString(data.title, 'title'),
        variant: optionalString(data.variant),
        quantity: typeof data.quantity === 'number' ? data.quantity : 1,
        amount: data.amount && typeof data.amount === 'object' ? data.amount : null,
        orderNumber: optionalString(data.orderNumber),
        intakeSourceType: optionalString(data.intakeSourceType),
        platformIdentifier: optionalString(data.platformIdentifier),
        importedAt: typeof data.importedAt === 'string' ? data.importedAt : timestamp(data.createdAt, 'createdAt').toISOString(),
        missingFields: Array.isArray(data.missingFields) ? data.missingFields.filter((value) => typeof value === 'string') : [],
    };
}
class FirestoreTransactionIntakeRepository {
    firestore;
    constructor(firestore) {
        this.firestore = firestore;
    }
    async createOrReplay(mutation) {
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
                const data = record.data();
                if (data.requestFingerprint !== mutation.requestFingerprint) {
                    throw new errors_1.ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'This import was already used with different purchase details.');
                }
                if (requiredString(data.actorId, 'actorId') !== mutation.actorId) {
                    throw new errors_1.ApplicationError('CONFLICT', 'INTAKE_IDENTITY_CONFLICT', 'This import identity is already bound to another account.');
                }
                if (!context.exists)
                    tx.create(contextRef, storedCommerceContext(mutation.commerceContext));
                if (!draft.exists)
                    tx.create(draftRef, storedPassportDraft(mutation.passportDraft));
                if (!outbox.exists)
                    tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(mutation.event));
                if (data.status === 'PENDING' && !pending.exists) {
                    tx.create(pendingRef, storedPending(mutation.pending, mutation.event.occurredAt));
                }
                return { created: false };
            }
            if (context.exists || draft.exists) {
                throw new errors_1.ApplicationError('CONFLICT', 'INTAKE_RESOURCE_CONFLICT', 'A derived intake resource identifier is already in use.');
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
                expiresAt: firestore_1.Timestamp.fromDate(new Date(mutation.commerceContext.expiresAt ?? mutation.event.occurredAt)),
                createdAt: firestore_1.Timestamp.fromDate(mutation.event.occurredAt),
                updatedAt: firestore_1.Timestamp.fromDate(mutation.event.occurredAt),
            });
            tx.create(pendingRef, storedPending(mutation.pending, mutation.event.occurredAt));
            tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(mutation.event));
            return { created: true };
        });
    }
    async listPendingForActor(actorId) {
        const result = await this.firestore.collection('users').doc(actorId).collection('pendingIntakes')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
        return result.docs.map((doc) => pendingRecord({ ...doc.data(), commerceContextId: doc.data().commerceContextId ?? doc.id }));
    }
    async hasActiveTransactionForSeller(sellerId, statuses) {
        const result = await this.firestore.collection('transactions')
            .where('sellerId', '==', sellerId)
            .where('status', 'in', [...statuses])
            .limit(1)
            .get();
        return !result.empty;
    }
    async claim(commerceContextId, decide) {
        const recordRef = this.firestore.collection('consumerIntakeRecords').doc(commerceContextId);
        const transactionRef = this.firestore.collection('transactions').doc();
        return this.firestore.runTransaction(async (tx) => {
            const recordDocument = await tx.get(recordRef);
            let snapshot = null;
            let contextRef = null;
            let draftRef = null;
            let pendingRef = null;
            if (recordDocument.exists) {
                const data = recordDocument.data();
                const actorId = requiredString(data.actorId, 'actorId');
                contextRef = this.firestore.collection('commerceContexts').doc(requiredString(data.commerceContextId, 'commerceContextId'));
                draftRef = this.firestore.collection('passportDrafts').doc(requiredString(data.passportDraftId, 'passportDraftId'));
                pendingRef = this.firestore.collection('users').doc(actorId).collection('pendingIntakes').doc(commerceContextId);
                const [contextDocument, draftDocument] = await Promise.all([tx.get(contextRef), tx.get(draftRef)]);
                if (!contextDocument.exists || !draftDocument.exists)
                    throw new Error('Consumer intake references missing context or draft data.');
                snapshot = {
                    actorId,
                    status: requiredString(data.status, 'status'),
                    transactionId: optionalString(data.transactionId),
                    expiresAt: timestamp(data.expiresAt, 'expiresAt'),
                    commerceContext: contextDto(contextDocument.id, contextDocument.data()),
                    passportDraft: draftDto(draftDocument.id, draftDocument.data()),
                };
            }
            const decision = decide(snapshot, transactionRef.id);
            if (decision.type === 'REPLAY')
                return decision.result;
            if (!snapshot || !contextRef || !draftRef || !pendingRef)
                throw new Error('Create decision requires an existing consumer intake record.');
            const transactionEvent = decision.events.find((event) => event.resourceType === 'transaction');
            if (!transactionEvent)
                throw new Error('Intake start requires a transaction event.');
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
                createdAt: firestore_1.Timestamp.fromDate(record.createdAt),
                updatedAt: firestore_1.Timestamp.fromDate(record.updatedAt),
                proofReady: false,
            });
            tx.update(recordRef, {
                status: 'CLAIMED',
                transactionId: transactionRef.id,
                updatedAt: firestore_1.Timestamp.fromDate(transactionEvent.occurredAt),
            });
            tx.update(contextRef, { status: 'CLAIMED', updatedAt: firestore_1.Timestamp.fromDate(transactionEvent.occurredAt) });
            tx.update(draftRef, {
                status: 'BOUND',
                transactionId: transactionRef.id,
                item: decision.draftItem,
                updatedAt: firestore_1.Timestamp.fromDate(transactionEvent.occurredAt),
            });
            if (pendingDocument.exists)
                tx.delete(pendingRef);
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
                    createdAt: firestore_1.Timestamp.fromDate(transactionEvent.occurredAt),
                });
            }
            decision.events.forEach((event, index) => {
                if (!existingOutboxes[index].exists)
                    tx.create(outboxRefs[index], (0, outbox_1.storedOutboxEvent)(event));
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
exports.FirestoreTransactionIntakeRepository = FirestoreTransactionIntakeRepository;
//# sourceMappingURL=transaction-intake-repository.js.map