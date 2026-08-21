"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreConsumerTransactionRepository = void 0;
const firestore_1 = require("firebase-admin/firestore");
const errors_1 = require("../../../application/v1/errors");
const outbox_1 = require("./outbox");
function timestamp(value, field) {
    if (!(value instanceof firestore_1.Timestamp))
        throw new Error(`Persisted consumer transaction has invalid ${field}.`);
    return value.toDate();
}
function stringArray(value) {
    return Array.isArray(value) ? value.filter((entry) => typeof entry === 'string') : [];
}
function snapshot(id, data) {
    if (typeof data.sellerId !== 'string' || typeof data.status !== 'string') {
        throw new Error('Persisted consumer transaction has invalid ownership or status.');
    }
    return {
        id,
        sellerId: data.sellerId,
        buyerId: typeof data.buyerId === 'string' ? data.buyerId : null,
        status: data.status,
        handoffConfirmedBy: stringArray(data.handoffConfirmedBy),
        completedBy: stringArray(data.completedBy),
        createdAt: timestamp(data.createdAt, 'createdAt'),
    };
}
class FirestoreConsumerTransactionRepository {
    firestore;
    constructor(firestore) {
        this.firestore = firestore;
    }
    allocateTransactionId() {
        return this.firestore.collection('transactions').doc().id;
    }
    async hasActiveTransactionForSeller(sellerId, statuses) {
        const result = await this.firestore.collection('transactions')
            .where('sellerId', '==', sellerId)
            .where('status', 'in', [...statuses])
            .limit(1)
            .get();
        return !result.empty;
    }
    async findDraft(transactionId) {
        const result = await this.firestore.collection('transactions').doc(transactionId).get();
        return result.exists ? snapshot(result.id, result.data()) : null;
    }
    async saveDraft(mutation) {
        const transactionRef = this.firestore.collection('transactions').doc(mutation.transactionId);
        const eventRef = transactionRef.collection('events').doc(mutation.event.id);
        const outboxRef = this.firestore.collection('domainOutbox').doc(mutation.event.id);
        await this.firestore.runTransaction(async (tx) => {
            const [current, event, outbox] = await Promise.all([tx.get(transactionRef), tx.get(eventRef), tx.get(outboxRef)]);
            if (mutation.expected.exists && !current.exists) {
                throw new errors_1.ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'PackProof draft not found.');
            }
            if (!mutation.expected.exists && current.exists) {
                throw new errors_1.ApplicationError('CONFLICT', 'TRANSACTION_ID_CONFLICT', 'The reserved transaction identifier is already in use.');
            }
            if (current.exists) {
                const data = current.data();
                if (data.sellerId !== mutation.expected.sellerId) {
                    throw new errors_1.ApplicationError('FORBIDDEN', 'SELLER_REQUIRED', 'Only the seller can edit this draft.');
                }
                if (!mutation.expected.editableStatuses.includes(data.status)) {
                    throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'TERMS_ALREADY_LOCKED', 'Locked terms cannot be edited.');
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
                updatedAt: firestore_1.Timestamp.fromDate(record.updatedAt),
                ...(current.exists ? {} : { createdAt: firestore_1.Timestamp.fromDate(record.createdAt), proofReady: false }),
            }, { merge: true });
            if (!event.exists) {
                tx.create(eventRef, {
                    actorId: mutation.event.actor.id,
                    type: mutation.event.type,
                    summary: mutation.event.type === 'DRAFT_UPDATED' ? 'Seller updated the proposed terms.' : 'Seller created the PackProof.',
                    metadata: { applicationEventId: mutation.event.id, schemaVersion: mutation.event.schemaVersion },
                    createdAt: firestore_1.Timestamp.fromDate(mutation.event.occurredAt),
                });
            }
            if (!outbox.exists)
                tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(mutation.event));
        });
    }
}
exports.FirestoreConsumerTransactionRepository = FirestoreConsumerTransactionRepository;
//# sourceMappingURL=consumer-transaction-repository.js.map