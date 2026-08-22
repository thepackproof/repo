"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreConnectHandoffRepository = void 0;
const firestore_1 = require("firebase-admin/firestore");
const errors_1 = require("../../../application/v1/errors");
const outbox_1 = require("./outbox");
function requiredString(value, field) {
    if (typeof value !== 'string' || !value)
        throw new Error(`Persisted Connect session has invalid ${field}.`);
    return value;
}
function optionalString(value) {
    return typeof value === 'string' && value ? value : null;
}
function finiteInteger(value, field, fallback) {
    if (value === undefined || value === null)
        return fallback;
    if (!Number.isSafeInteger(value))
        throw new Error(`Persisted Connect session has invalid ${field}.`);
    return value;
}
function toSession(id, data) {
    if (!(data.expiresAt instanceof firestore_1.Timestamp))
        throw new Error('Persisted Connect session has invalid expiresAt.');
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
        codeChallenge: optionalString(data.codeChallenge),
        status: requiredString(data.status, 'status'),
        transactionId: optionalString(data.transactionId),
        claimedBy: optionalString(data.claimedBy),
        expiresAt: data.expiresAt.toDate(),
    };
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
        lockedAt: firestore_1.Timestamp.fromDate(record.lockedAt),
        createdAt: firestore_1.Timestamp.fromDate(record.createdAt),
        updatedAt: firestore_1.Timestamp.fromDate(record.updatedAt),
        source: record.source,
        proofReady: false,
    };
}
class FirestoreConnectHandoffRepository {
    firestore;
    constructor(firestore) {
        this.firestore = firestore;
    }
    async redeem(sessionId, decide) {
        const sessionRef = this.firestore.collection('connectSessions').doc(sessionId);
        const transactionRef = this.firestore.collection('transactions').doc();
        return this.firestore.runTransaction(async (tx) => {
            const sessionDocument = await tx.get(sessionRef);
            const session = sessionDocument.exists ? toSession(sessionDocument.id, sessionDocument.data()) : null;
            const decision = decide(session, transactionRef.id);
            if (decision.type === 'REPLAY')
                return decision.result;
            if (!session?.tokenHash || session.status !== 'PENDING_REDEMPTION') {
                throw new errors_1.ApplicationError('RETRYABLE_CONFLICT', 'CONNECT_GRANT_CONSUME_CONFLICT', 'The Connect grant changed before it could be consumed.', [], 1);
            }
            const current = sessionDocument.data();
            if (!current || current.status !== 'PENDING_REDEMPTION' || optionalString(current.tokenHash) !== session.tokenHash) {
                throw new errors_1.ApplicationError('RETRYABLE_CONFLICT', 'CONNECT_GRANT_CONSUME_CONFLICT', 'The Connect grant changed before it could be consumed.', [], 1);
            }
            const eventRef = transactionRef.collection('events').doc(decision.event.id);
            const outboxRef = this.firestore.collection('domainOutbox').doc(decision.event.id);
            const [existingEvent, existingOutbox] = await Promise.all([tx.get(eventRef), tx.get(outboxRef)]);
            tx.create(transactionRef, storedTransaction(decision));
            tx.update(sessionRef, {
                claimedBy: decision.transaction.sellerId,
                transactionId: transactionRef.id,
                status: 'READY_FOR_CAPTURE',
                claimedAt: firestore_1.Timestamp.fromDate(decision.event.occurredAt),
                tokenHash: firestore_1.FieldValue.delete(),
                codeChallenge: firestore_1.FieldValue.delete(),
            });
            if (!existingEvent.exists) {
                tx.create(eventRef, {
                    actorId: decision.event.actor.id,
                    type: 'CONNECT_SESSION_REDEEMED',
                    summary: 'Seller claimed an imported commerce order.',
                    metadata: { applicationEventId: decision.event.id, connectSessionId: sessionId, schemaVersion: 1 },
                    createdAt: firestore_1.Timestamp.fromDate(decision.event.occurredAt),
                });
            }
            if (!existingOutbox.exists)
                tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(decision.event));
            return { transactionId: transactionRef.id, connectSessionId: sessionId };
        });
    }
}
exports.FirestoreConnectHandoffRepository = FirestoreConnectHandoffRepository;
//# sourceMappingURL=connect-handoff-repository.js.map