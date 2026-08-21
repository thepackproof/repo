"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestorePublicCommerceHandoffRepository = void 0;
const firestore_1 = require("firebase-admin/firestore");
const errors_1 = require("../../../application/v1/errors");
const commerce_1 = require("../../../domain/v1/commerce");
const merchant_transaction_service_1 = require("../../../application/v1/merchant-transaction-service");
const outbox_1 = require("./outbox");
function timestamp(value, field) {
    if (!(value instanceof firestore_1.Timestamp))
        throw new Error(`Persisted public commerce handoff has invalid ${field}.`);
    return value.toDate();
}
function requiredString(value, field) {
    if (typeof value !== 'string' || !value)
        throw new Error(`Persisted public commerce handoff has invalid ${field}.`);
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
function storedTransaction(decision) {
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
        lockedAt: null,
        source: record.source,
        listingImageReferences: record.listingImageReferences,
        createdAt: firestore_1.Timestamp.fromDate(record.createdAt),
        updatedAt: firestore_1.Timestamp.fromDate(record.updatedAt),
        proofReady: false,
    };
}
class FirestorePublicCommerceHandoffRepository {
    firestore;
    constructor(firestore) {
        this.firestore = firestore;
    }
    async findIntegrationByPublishableKey(publishableKey) {
        const result = await this.firestore.collection('platformIntegrations')
            .where('publishableKeyHash', '==', (0, merchant_transaction_service_1.sha256)(publishableKey))
            .limit(2)
            .get();
        if (result.empty)
            return null;
        if (result.size !== 1)
            throw new Error('Publishable PackProof Button key is not unique.');
        const doc = result.docs[0];
        const data = doc.data();
        const rawEnvironment = String(data.environment ?? '');
        const environment = rawEnvironment === 'SANDBOX' || rawEnvironment === 'sandbox' ? 'sandbox'
            : rawEnvironment === 'PRODUCTION' || rawEnvironment === 'live' ? 'live'
                : null;
        if (!environment)
            throw new Error('PackProof Button integration has an invalid environment.');
        const status = data.status === 'ACTIVE' || data.status === 'DISABLED' || data.status === 'REVOKED' ? data.status : null;
        if (!status)
            throw new Error('PackProof Button integration has an invalid status.');
        const origins = Array.isArray(data.allowedOrigins) ? data.allowedOrigins : data.buttonOrigins;
        if (!Array.isArray(origins) || origins.some((value) => typeof value !== 'string')) {
            throw new Error('PackProof Button integration has invalid allowed origins.');
        }
        return { id: doc.id, environment, status, allowedOrigins: origins };
    }
    async createOrReplay(mutation) {
        const handoffRef = this.firestore.collection('publicCommerceHandoffs').doc(mutation.handoffId);
        const contextRef = this.firestore.collection('commerceContexts').doc(mutation.commerceContext.id);
        const draftRef = this.firestore.collection('passportDrafts').doc(mutation.passportDraft.id);
        const outboxRefs = mutation.events.map((event) => this.firestore.collection('domainOutbox').doc(event.id));
        return this.firestore.runTransaction(async (tx) => {
            const [handoff, context, draft, ...outboxes] = await Promise.all([
                tx.get(handoffRef), tx.get(contextRef), tx.get(draftRef), ...outboxRefs.map((ref) => tx.get(ref)),
            ]);
            if (handoff.exists) {
                const data = handoff.data();
                if (data.requestFingerprint !== mutation.requestFingerprint) {
                    throw new errors_1.ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used with different listing data.');
                }
                if (data.origin !== mutation.origin || data.integrationId !== mutation.commerceContext.integrationId) {
                    throw new errors_1.ApplicationError('CONFLICT', 'PUBLIC_HANDOFF_IDENTITY_CONFLICT', 'The public handoff identity is already bound to another installation or origin.');
                }
                if (data.commerceContextId !== mutation.commerceContext.id || data.passportDraftId !== mutation.passportDraft.id) {
                    throw new Error('Persisted public handoff has inconsistent derived resource identifiers.');
                }
                if (context.exists) {
                    const data = context.data();
                    if (data.integrationId !== mutation.commerceContext.integrationId
                        || data.canonicalPayloadSha256 !== mutation.commerceContext.canonicalPayloadSha256) {
                        throw new Error('Persisted public commerce context conflicts with the handoff request.');
                    }
                }
                if (draft.exists && draft.data().commerceContextId !== mutation.commerceContext.id) {
                    throw new Error('Persisted public passport draft conflicts with the handoff context.');
                }
                if (!context.exists)
                    tx.create(contextRef, storedCommerceContext(mutation.commerceContext));
                if (!draft.exists)
                    tx.create(draftRef, storedPassportDraft(mutation.passportDraft));
                mutation.events.forEach((event, index) => {
                    if (!outboxes[index].exists)
                        tx.create(outboxRefs[index], (0, outbox_1.storedOutboxEvent)(event));
                });
                return { created: false, expiresAt: timestamp(data.expiresAt, 'expiresAt') };
            }
            if (context.exists || draft.exists) {
                throw new errors_1.ApplicationError('CONFLICT', 'PUBLIC_HANDOFF_RESOURCE_CONFLICT', 'A derived public commerce resource identifier is already in use.');
            }
            tx.create(contextRef, storedCommerceContext(mutation.commerceContext));
            tx.create(draftRef, storedPassportDraft(mutation.passportDraft));
            tx.create(handoffRef, {
                id: mutation.handoffId,
                schemaVersion: 1,
                integrationId: mutation.commerceContext.integrationId,
                commerceContextId: mutation.commerceContext.id,
                passportDraftId: mutation.passportDraft.id,
                operationKeyHash: (0, merchant_transaction_service_1.sha256)(mutation.operationKey),
                requestFingerprint: mutation.requestFingerprint,
                origin: mutation.origin,
                status: 'PENDING_CLAIM',
                tokenHash: mutation.tokenHash,
                claimedBy: null,
                transactionId: null,
                expiresAt: firestore_1.Timestamp.fromDate(mutation.expiresAt),
                createdAt: firestore_1.Timestamp.fromDate(mutation.events[0].occurredAt),
                updatedAt: firestore_1.Timestamp.fromDate(mutation.events[0].occurredAt),
            });
            mutation.events.forEach((event, index) => tx.create(outboxRefs[index], (0, outbox_1.storedOutboxEvent)(event)));
            return { created: true, expiresAt: mutation.expiresAt };
        });
    }
    async hasActiveTransactionForSeller(sellerId, statuses) {
        const result = await this.firestore.collection('transactions')
            .where('sellerId', '==', sellerId)
            .where('status', 'in', [...statuses])
            .limit(1)
            .get();
        return !result.empty;
    }
    async redeem(handoffId, decide) {
        const handoffRef = this.firestore.collection('publicCommerceHandoffs').doc(handoffId);
        const transactionRef = this.firestore.collection('transactions').doc();
        return this.firestore.runTransaction(async (tx) => {
            const handoffDocument = await tx.get(handoffRef);
            let snapshot = null;
            let contextRef = null;
            let draftRef = null;
            if (handoffDocument.exists) {
                const data = handoffDocument.data();
                contextRef = this.firestore.collection('commerceContexts').doc(requiredString(data.commerceContextId, 'commerceContextId'));
                draftRef = this.firestore.collection('passportDrafts').doc(requiredString(data.passportDraftId, 'passportDraftId'));
                const [contextDocument, draftDocument] = await Promise.all([tx.get(contextRef), tx.get(draftRef)]);
                if (!contextDocument.exists || !draftDocument.exists)
                    throw new Error('Public commerce handoff references missing context or draft data.');
                snapshot = {
                    id: handoffDocument.id,
                    integrationId: requiredString(data.integrationId, 'integrationId'),
                    commerceContextId: contextDocument.id,
                    passportDraftId: draftDocument.id,
                    origin: requiredString(data.origin, 'origin'),
                    status: requiredString(data.status, 'status'),
                    tokenHash: optionalString(data.tokenHash),
                    claimedBy: optionalString(data.claimedBy),
                    transactionId: optionalString(data.transactionId),
                    expiresAt: timestamp(data.expiresAt, 'expiresAt'),
                    context: contextDto(contextDocument.id, contextDocument.data()),
                    draft: draftDto(draftDocument.id, draftDocument.data()),
                };
            }
            const decision = decide(snapshot, transactionRef.id);
            if (decision.type === 'REPLAY')
                return decision.result;
            if (!snapshot || !contextRef || !draftRef)
                throw new Error('Create decision requires an existing public commerce handoff.');
            const transactionEvent = decision.events.find((event) => event.resourceType === 'transaction');
            if (!transactionEvent)
                throw new Error('Public handoff redemption requires a transaction event.');
            const transactionEventRef = transactionRef.collection('events').doc(transactionEvent.id);
            const outboxRefs = decision.events.map((event) => this.firestore.collection('domainOutbox').doc(event.id));
            const [existingEvent, ...existingOutboxes] = await Promise.all([
                tx.get(transactionEventRef), ...outboxRefs.map((ref) => tx.get(ref)),
            ]);
            tx.create(transactionRef, storedTransaction(decision));
            tx.update(handoffRef, {
                status: 'CLAIMED',
                claimedBy: decision.transaction.sellerId,
                transactionId: transactionRef.id,
                claimedAt: firestore_1.Timestamp.fromDate(transactionEvent.occurredAt),
                updatedAt: firestore_1.Timestamp.fromDate(transactionEvent.occurredAt),
                tokenHash: firestore_1.FieldValue.delete(),
            });
            tx.update(contextRef, { status: 'CLAIMED', updatedAt: firestore_1.Timestamp.fromDate(transactionEvent.occurredAt) });
            tx.update(draftRef, {
                status: 'BOUND',
                transactionId: transactionRef.id,
                updatedAt: firestore_1.Timestamp.fromDate(transactionEvent.occurredAt),
            });
            if (!existingEvent.exists) {
                tx.create(transactionEventRef, {
                    actorId: transactionEvent.actor.id,
                    type: 'TRANSACTION_CREATED',
                    summary: 'Seller created an editable PackProof draft from page-declared listing data.',
                    metadata: {
                        applicationEventId: transactionEvent.id,
                        publicHandoffId: handoffId,
                        commerceContextId: snapshot.commerceContextId,
                        passportDraftId: snapshot.passportDraftId,
                        trustLevel: 'PAGE_DECLARED',
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
                publicHandoffId: handoffId,
                commerceContextId: snapshot.commerceContextId,
                passportDraftId: snapshot.passportDraftId,
            };
        });
    }
}
exports.FirestorePublicCommerceHandoffRepository = FirestorePublicCommerceHandoffRepository;
//# sourceMappingURL=public-commerce-handoff-repository.js.map