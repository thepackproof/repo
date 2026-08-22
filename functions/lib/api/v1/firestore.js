"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreReadinessChecker = exports.FirestoreTransactionRepository = void 0;
const firestore_1 = require("firebase-admin/firestore");
const errors_1 = require("../../application/v1/errors");
const outbox_1 = require("../../infrastructure/firebase/v1/outbox");
const core_1 = require("./core");
const captureStatuses = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETE'];
const shipmentStatuses = ['NOT_ASSOCIATED', 'ASSOCIATED'];
const verificationStatuses = ['PENDING_EVIDENCE', 'PENDING', 'PROCESSING', 'COMPLETE'];
function requiredString(value, field) {
    if (typeof value !== 'string' || !value)
        throw new Error(`Persisted transaction has invalid ${field}.`);
    return value;
}
function date(value, field) {
    if (!(value instanceof firestore_1.Timestamp))
        throw new Error(`Persisted transaction has invalid ${field}.`);
    return value.toDate();
}
function storedEnum(value, values, field) {
    if (typeof value !== 'string' || !values.includes(value))
        throw new Error(`Persisted transaction has invalid ${field}.`);
    return value;
}
function storedAmount(value) {
    if (value === null)
        return null;
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Persisted transaction has invalid amount.');
    const amount = value;
    if (typeof amount.currency !== 'string' || !/^[A-Z]{3}$/.test(amount.currency)
        || !Number.isSafeInteger(amount.minorUnits) || amount.minorUnits < 0 || amount.minorUnits > 10_000_000_000) {
        throw new Error('Persisted transaction has invalid amount.');
    }
    return { currency: amount.currency, minorUnits: amount.minorUnits };
}
function storedParticipants(value) {
    if (!Array.isArray(value) || value.length > 3)
        throw new Error('Persisted transaction has invalid apiParticipants.');
    const roles = new Set();
    return value.map((entry) => {
        if (!entry || typeof entry !== 'object' || Array.isArray(entry))
            throw new Error('Persisted transaction has invalid apiParticipants.');
        const participant = entry;
        const role = storedEnum(participant.role, ['SELLER', 'BUYER', 'RECEIVER'], 'apiParticipants.role');
        if (roles.has(role))
            throw new Error('Persisted transaction has duplicate participant roles.');
        roles.add(role);
        return { role, externalReference: requiredString(participant.externalReference, 'apiParticipants.externalReference') };
    });
}
function storedCaptureRequirements(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Persisted transaction has invalid captureRequirements.');
    const requiredArtifactTypes = value.requiredArtifactTypes;
    if (!Array.isArray(requiredArtifactTypes) || requiredArtifactTypes.length > core_1.captureArtifactTypes.length) {
        throw new Error('Persisted transaction has invalid captureRequirements.');
    }
    const entries = requiredArtifactTypes.map((entry) => storedEnum(entry, core_1.captureArtifactTypes, 'captureRequirements.requiredArtifactTypes'));
    if (new Set(entries).size !== entries.length)
        throw new Error('Persisted transaction has duplicate capture requirements.');
    return { requiredArtifactTypes: entries };
}
function toMerchantTransaction(id, value) {
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
        status: storedEnum(value.apiStatus, core_1.merchantTransactionStatuses, 'apiStatus'),
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
function toStoredTransaction(transaction) {
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
        createdAt: firestore_1.Timestamp.fromDate(transaction.createdAt),
        updatedAt: firestore_1.Timestamp.fromDate(transaction.updatedAt),
        proofReady: false,
    };
}
class FirestoreTransactionRepository {
    firestore;
    constructor(firestore) {
        this.firestore = firestore;
    }
    async create(transaction, event) {
        const ref = this.firestore.collection('transactions').doc(transaction.id);
        const outboxRef = this.firestore.collection('domainOutbox').doc(event.id);
        return this.firestore.runTransaction(async (tx) => {
            const [existing, outbox] = await Promise.all([tx.get(ref), tx.get(outboxRef)]);
            if (existing.exists) {
                const record = toMerchantTransaction(existing.id, existing.data());
                if (record.organizationId !== transaction.organizationId
                    || record.merchantReference !== transaction.merchantReference
                    || record.createdByApiClientId !== transaction.createdByApiClientId) {
                    throw new errors_1.ApplicationError('CONFLICT', 'TRANSACTION_ID_CONFLICT', 'The reserved transaction identifier is already in use.');
                }
                if (!outbox.exists)
                    tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(event));
                return record;
            }
            tx.create(ref, toStoredTransaction(transaction));
            if (!outbox.exists)
                tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(event));
            return transaction;
        });
    }
    async findByIdForOrganization(id, organizationId) {
        const snap = await this.firestore.collection('transactions').doc(id).get();
        if (!snap.exists || snap.data()?.sourceType !== 'MERCHANT_API' || snap.data()?.organizationId !== organizationId)
            return null;
        return toMerchantTransaction(snap.id, snap.data());
    }
    async listForOrganization(organizationId, input) {
        const queryHash = (0, core_1.transactionQueryHash)(organizationId, input);
        let query = this.firestore.collection('transactions')
            .where('sourceType', '==', 'MERCHANT_API')
            .where('organizationId', '==', organizationId);
        if (input.status)
            query = query.where('apiStatus', '==', input.status);
        if (input.merchantReference)
            query = query.where('merchantReference', '==', input.merchantReference);
        if (input.createdAfter)
            query = query.where('createdAt', '>=', firestore_1.Timestamp.fromDate(input.createdAfter));
        if (input.createdBefore)
            query = query.where('createdAt', '<', firestore_1.Timestamp.fromDate(input.createdBefore));
        query = query.orderBy('createdAt', 'desc').orderBy(firestore_1.FieldPath.documentId(), 'desc');
        if (input.cursor) {
            const cursor = (0, core_1.decodeTransactionCursor)(input.cursor);
            if (cursor.queryHash !== queryHash) {
                throw new errors_1.ApplicationError('INVALID_ARGUMENT', 'CURSOR_QUERY_MISMATCH', 'This cursor belongs to a different transaction query.');
            }
            query = query.startAfter(firestore_1.Timestamp.fromDate(new Date(cursor.createdAt)), cursor.id);
        }
        const snap = await query.limit(input.limit + 1).get();
        const hasMore = snap.docs.length > input.limit;
        const pageDocs = hasMore ? snap.docs.slice(0, input.limit) : snap.docs;
        const transactions = pageDocs.map((doc) => toMerchantTransaction(doc.id, doc.data()));
        const last = pageDocs.at(-1);
        const nextCursor = hasMore && last
            ? (0, core_1.encodeTransactionCursor)({ createdAt: date(last.data().createdAt, 'createdAt').toISOString(), id: last.id, queryHash })
            : null;
        return { transactions, nextCursor };
    }
}
exports.FirestoreTransactionRepository = FirestoreTransactionRepository;
class FirestoreReadinessChecker {
    firestore;
    constructor(firestore) {
        this.firestore = firestore;
    }
    async check() {
        await this.firestore.collection('_packproofSystem').doc('readiness').get();
    }
}
exports.FirestoreReadinessChecker = FirestoreReadinessChecker;
//# sourceMappingURL=firestore.js.map