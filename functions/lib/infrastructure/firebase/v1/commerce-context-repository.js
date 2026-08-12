"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreCommerceContextRepository = void 0;
const firestore_1 = require("firebase-admin/firestore");
const errors_1 = require("../../../application/v1/errors");
const outbox_1 = require("./outbox");
function storedCommerceContext(context) {
    return {
        id: context.id,
        object: context.object,
        schemaVersion: context.schemaVersion,
        integrationId: context.integrationId,
        source: { ...context.source, capturedAt: firestore_1.Timestamp.fromDate(new Date(context.source.capturedAt)) },
        item: context.item,
        fieldProvenance: Object.fromEntries(Object.entries(context.fieldProvenance).map(([field, provenance]) => [
            field,
            { ...provenance, importedAt: firestore_1.Timestamp.fromDate(new Date(provenance.importedAt)) },
        ])),
        canonicalPayloadSha256: context.canonicalPayloadSha256,
        status: context.status,
        supersedesCommerceContextId: context.supersedesCommerceContextId,
        expiresAt: context.expiresAt ? firestore_1.Timestamp.fromDate(new Date(context.expiresAt)) : null,
        createdAt: firestore_1.Timestamp.fromDate(new Date(context.createdAt)),
        updatedAt: firestore_1.Timestamp.fromDate(new Date(context.updatedAt)),
    };
}
class FirestoreCommerceContextRepository {
    firestore;
    constructor(firestore) {
        this.firestore = firestore;
    }
    async createOrReplay(mutation) {
        const sessionRef = this.firestore.collection('connectSessions').doc(mutation.sessionId);
        const contextRef = this.firestore.collection('commerceContexts').doc(mutation.commerceContext.id);
        const outboxRef = this.firestore.collection('domainOutbox').doc(mutation.event.id);
        return this.firestore.runTransaction(async (tx) => {
            const [existingSession, existingContext, existingOutbox] = await Promise.all([
                tx.get(sessionRef), tx.get(contextRef), tx.get(outboxRef),
            ]);
            if (existingSession.exists) {
                const data = existingSession.data();
                if (data.requestPayloadHash !== mutation.requestPayloadHash) {
                    throw new errors_1.ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'This idempotency key was already used with a different order payload.');
                }
                if (!(data.expiresAt instanceof firestore_1.Timestamp))
                    throw new Error('Persisted Connect session has invalid expiresAt.');
                if (!existingContext.exists)
                    tx.create(contextRef, storedCommerceContext(mutation.commerceContext));
                if (!existingOutbox.exists)
                    tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(mutation.event));
                if (!data.commerceContextId)
                    tx.update(sessionRef, { commerceContextId: mutation.commerceContext.id });
                return { created: false, expiresAt: data.expiresAt.toDate() };
            }
            if (existingContext.exists) {
                throw new errors_1.ApplicationError('CONFLICT', 'COMMERCE_CONTEXT_ID_CONFLICT', 'The derived commerce-context identifier is already in use.');
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
                createdAt: firestore_1.Timestamp.fromDate(mutation.event.occurredAt),
                expiresAt: firestore_1.Timestamp.fromDate(session.expiresAt),
            });
            tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(mutation.event));
            return { created: true, expiresAt: session.expiresAt };
        });
    }
}
exports.FirestoreCommerceContextRepository = FirestoreCommerceContextRepository;
//# sourceMappingURL=commerce-context-repository.js.map