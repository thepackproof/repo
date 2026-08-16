"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreMerchantConnectAdapter = exports.FirestoreMerchantEvidenceRepository = void 0;
const firestore_1 = require("firebase-admin/firestore");
const merchant_transaction_service_1 = require("../../../application/v1/merchant-transaction-service");
const outbox_1 = require("./outbox");
function dateValue(value, fallback) {
    if (value instanceof firestore_1.Timestamp)
        return value.toDate();
    if (typeof value === 'string' && Number.isFinite(Date.parse(value)))
        return new Date(value);
    return fallback;
}
function optionalString(value) {
    return typeof value === 'string' && value ? value : null;
}
function optionalInteger(value) {
    return Number.isSafeInteger(value) ? value : null;
}
function shipmentIdFor(transactionId) {
    return `shipment_${(0, merchant_transaction_service_1.sha256)(transactionId).slice(0, 40)}`;
}
function toShipment(transactionId, shipping, createdAt, updatedAt) {
    if (!shipping || typeof shipping !== 'object')
        return null;
    const carrier = optionalString(shipping.carrier);
    const trackingNumber = optionalString(shipping.trackingNumber);
    if (!carrier || !trackingNumber)
        return null;
    const match = shipping.labelEvidenceMatchStatus;
    return {
        id: shipmentIdFor(transactionId),
        object: 'shipment',
        schemaVersion: 1,
        transactionId,
        carrier,
        trackingNumber,
        assertionSource: 'MERCHANT',
        status: 'ASSOCIATED',
        packingEvidenceId: optionalString(shipping.packingEvidenceId),
        sealEvidenceId: optionalString(shipping.sealEvidenceId),
        labelEvidenceMatchStatus: match === 'MATCHED' || match === 'MISMATCH' || match === 'NOT_SCANNED' ? match : null,
        shippedAt: shipping.shippedAt ? dateValue(shipping.shippedAt, updatedAt).toISOString() : null,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
    };
}
function toAccessible(id, data) {
    const createdAt = dateValue(data.createdAt, new Date(0));
    const updatedAt = dateValue(data.updatedAt, createdAt);
    const amount = data.amount && typeof data.amount === 'object' && !Array.isArray(data.amount)
        ? data.amount
        : null;
    const terms = data.terms && typeof data.terms === 'object' && !Array.isArray(data.terms)
        ? data.terms
        : null;
    const source = data.source && typeof data.source === 'object' && !Array.isArray(data.source)
        ? data.source
        : null;
    return {
        id,
        organizationId: optionalString(data.organizationId),
        integrationId: optionalString(source?.integrationId) ?? optionalString(data.integrationId),
        merchantReference: optionalString(data.merchantReference),
        title: optionalString(data.title) ?? 'Untitled transaction',
        description: typeof data.description === 'string' ? data.description : '',
        category: optionalString(data.category),
        status: optionalString(data.apiStatus) ?? optionalString(data.status) ?? 'UNKNOWN',
        consumerStatus: optionalString(data.status) ?? 'UNKNOWN',
        amount: amount && typeof amount.currency === 'string' && Number.isSafeInteger(amount.minorUnits)
            ? { currency: amount.currency, minorUnits: amount.minorUnits }
            : Number.isSafeInteger(data.priceMinor) && typeof data.currency === 'string'
                ? { currency: data.currency, minorUnits: data.priceMinor }
                : null,
        terms: terms ? {
            saleType: optionalString(terms.saleType) ?? 'SHIPPED',
            shippingResponsibility: optionalString(terms.shippingResponsibility) ?? 'SELLER',
            returns: optionalString(terms.returns) ?? 'PLATFORM_POLICY',
            returnWindowDays: Number.isSafeInteger(terms.returnWindowDays) ? terms.returnWindowDays : 0,
            customTerms: typeof terms.customTerms === 'string' ? terms.customTerms : '',
        } : null,
        shipment: toShipment(id, data.shipping, createdAt, updatedAt),
        createdAt,
        updatedAt,
    };
}
function principalCanAccess(transaction, principal) {
    if (transaction.organizationId && transaction.organizationId === principal.organizationId)
        return true;
    if (transaction.integrationId && principal.integrationId && transaction.integrationId === principal.integrationId)
        return true;
    return false;
}
function toEvidence(transactionId, id, data) {
    const createdAt = dateValue(data.createdAt, new Date(0));
    const updatedAt = dateValue(data.updatedAt ?? data.serverReceivedAt, createdAt);
    const finalizedAt = data.serverFinalized === true || data.serverVerified === true
        ? dateValue(data.serverReceivedAt ?? data.createdAt, createdAt)
        : null;
    const authentication = data.manifestAuthentication && typeof data.manifestAuthentication === 'object'
        ? data.manifestAuthentication
        : null;
    return {
        id,
        transactionId,
        type: optionalString(data.type) ?? 'SUPPORTING_DOCUMENT',
        role: optionalString(data.role),
        contentType: optionalString(data.contentType) ?? optionalString(data.detectedContentType),
        sizeBytes: optionalInteger(data.sizeBytes),
        sha256: optionalString(data.sha256),
        manifestSha256: optionalString(data.manifestSha256),
        evidenceBundleSha256: optionalString(data.evidenceBundleSha256),
        manifestAuthenticationScope: optionalString(authentication?.verificationScope),
        returnPassportId: optionalString(data.returnPassportId),
        serverFinalized: data.serverFinalized === true,
        serverVerified: data.serverVerified === true,
        clientHashMatched: typeof data.clientHashMatched === 'boolean' ? data.clientHashMatched : null,
        clientSizeMatched: typeof data.clientSizeMatched === 'boolean' ? data.clientSizeMatched : null,
        contentTypeMatched: typeof data.contentTypeMatched === 'boolean' ? data.contentTypeMatched : null,
        assurance: data.assurance && typeof data.assurance === 'object' ? data.assurance : null,
        carrierTrackingMatchStatus: optionalString(data.carrierTrackingMatchStatus),
        scannedTrackingNumber: optionalString(data.scannedTrackingNumber),
        createdAt,
        updatedAt,
        finalizedAt,
    };
}
function toReturn(transactionId, id, data) {
    const createdAt = dateValue(data.createdAt, new Date(0));
    const updatedAt = dateValue(data.updatedAt, createdAt);
    const shipping = data.shipping && typeof data.shipping === 'object' ? data.shipping : null;
    const hashes = Array.isArray(data.originalEvidenceHashes)
        ? data.originalEvidenceHashes.filter((value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
        : [];
    return {
        id,
        object: 'return_passport',
        schemaVersion: 1,
        transactionId,
        reason: typeof data.reason === 'string' ? data.reason : '',
        status: optionalString(data.status) ?? 'REQUESTED',
        originalEvidenceHashes: hashes,
        shippingCarrier: optionalString(shipping?.carrier),
        shippingTrackingNumber: optionalString(shipping?.trackingNumber),
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
    };
}
function toTimeline(transactionId, id, data) {
    return {
        id,
        object: 'timeline_event',
        schemaVersion: 1,
        transactionId,
        type: optionalString(data.type) ?? 'UNKNOWN',
        summary: typeof data.summary === 'string' ? data.summary : '',
        occurredAt: dateValue(data.createdAt, new Date(0)).toISOString(),
    };
}
function toReport(transactionId, id, data) {
    const sha256Value = optionalString(data.sha256);
    const storagePath = optionalString(data.storagePath);
    if (!sha256Value || !storagePath)
        return null;
    return {
        id,
        transactionId,
        sha256: sha256Value,
        storagePath,
        evidenceCount: optionalInteger(data.evidenceCount) ?? 0,
        createdAt: dateValue(data.createdAt, new Date(0)),
    };
}
class FirestoreMerchantEvidenceRepository {
    firestore;
    constructor(firestore) {
        this.firestore = firestore;
    }
    async findAccessibleTransaction(transactionId, principal) {
        const snap = await this.firestore.collection('transactions').doc(transactionId).get();
        if (!snap.exists)
            return null;
        const transaction = toAccessible(snap.id, snap.data());
        return principalCanAccess(transaction, principal) ? transaction : null;
    }
    async listEvidence(transactionId) {
        const snap = await this.firestore.collection('transactions').doc(transactionId).collection('evidence').orderBy('createdAt', 'asc').get();
        return snap.docs.map((doc) => toEvidence(transactionId, doc.id, doc.data()));
    }
    async findEvidence(transactionId, artifactId) {
        const snap = await this.firestore.collection('transactions').doc(transactionId).collection('evidence').doc(artifactId).get();
        if (!snap.exists)
            return null;
        return toEvidence(transactionId, snap.id, snap.data());
    }
    async listTimeline(transactionId) {
        const snap = await this.firestore.collection('transactions').doc(transactionId).collection('events').orderBy('createdAt', 'asc').get();
        return snap.docs.map((doc) => toTimeline(transactionId, doc.id, doc.data()));
    }
    async listReturns(transactionId) {
        const snap = await this.firestore.collection('transactions').doc(transactionId).collection('returns').orderBy('createdAt', 'asc').get();
        return snap.docs.map((doc) => toReturn(transactionId, doc.id, doc.data()));
    }
    async findReturn(transactionId, returnPassportId) {
        const snap = await this.firestore.collection('transactions').doc(transactionId).collection('returns').doc(returnPassportId).get();
        if (!snap.exists)
            return null;
        return toReturn(transactionId, snap.id, snap.data());
    }
    async listReports(transactionId) {
        const snap = await this.firestore.collection('transactions').doc(transactionId).collection('packets').orderBy('createdAt', 'asc').get();
        return snap.docs.map((doc) => toReport(transactionId, doc.id, doc.data())).filter((item) => item !== null);
    }
    async findReport(transactionId, reportId) {
        const snap = await this.firestore.collection('transactions').doc(transactionId).collection('packets').doc(reportId).get();
        if (!snap.exists)
            return null;
        return toReport(transactionId, snap.id, snap.data());
    }
    async associateShipment(transactionId, record, event) {
        const ref = this.firestore.collection('transactions').doc(transactionId);
        const eventRef = ref.collection('events').doc(event.id);
        const outboxRef = this.firestore.collection('domainOutbox').doc(event.id);
        return this.firestore.runTransaction(async (tx) => {
            const [snap, existingEvent, existingOutbox] = await Promise.all([tx.get(ref), tx.get(eventRef), tx.get(outboxRef)]);
            if (!snap.exists)
                throw new Error('Transaction disappeared before shipment association.');
            const data = snap.data();
            const createdAt = dateValue(data.createdAt, record.occurredAt);
            tx.update(ref, {
                shipmentStatus: 'ASSOCIATED',
                ...(record.markConsumerShipped ? { status: 'SHIPPED' } : {}),
                shipping: {
                    carrier: record.carrier,
                    trackingNumber: record.trackingNumber,
                    shippedAt: firestore_1.Timestamp.fromDate(record.occurredAt),
                    labelEvidenceMatchStatus: record.labelEvidenceMatchStatus,
                    scannedTrackingNumber: record.scannedTrackingNumber,
                    packingEvidenceId: record.packingEvidenceId,
                    sealEvidenceId: record.sealEvidenceId,
                },
                updatedAt: firestore_1.Timestamp.fromDate(record.occurredAt),
            });
            if (!existingEvent.exists) {
                tx.create(eventRef, {
                    actorId: event.actor.id,
                    type: event.type,
                    summary: `Merchant recorded shipment with ${record.carrier}.`,
                    metadata: { applicationEventId: event.id, schemaVersion: 1, labelEvidenceMatchStatus: record.labelEvidenceMatchStatus },
                    createdAt: firestore_1.Timestamp.fromDate(record.occurredAt),
                });
            }
            if (!existingOutbox.exists)
                tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(event));
            return toShipment(transactionId, {
                carrier: record.carrier,
                trackingNumber: record.trackingNumber,
                packingEvidenceId: record.packingEvidenceId,
                sealEvidenceId: record.sealEvidenceId,
                labelEvidenceMatchStatus: record.labelEvidenceMatchStatus,
                shippedAt: firestore_1.Timestamp.fromDate(record.occurredAt),
            }, createdAt, record.occurredAt);
        });
    }
}
exports.FirestoreMerchantEvidenceRepository = FirestoreMerchantEvidenceRepository;
function connectSessionIsAccessible(session, principal) {
    return (session.organizationId !== null && session.organizationId === principal.organizationId)
        || (Boolean(session.integrationId) && Boolean(principal.integrationId) && session.integrationId === principal.integrationId);
}
function toStoredConnectSession(id, data) {
    if (!(data.expiresAt instanceof firestore_1.Timestamp))
        return null;
    return {
        id,
        organizationId: optionalString(data.organizationId),
        integrationId: optionalString(data.integrationId) ?? '',
        platform: optionalString(data.platform) ?? 'custom',
        externalOrderId: optionalString(data.externalOrderId) ?? '',
        status: optionalString(data.status) ?? 'PENDING_REDEMPTION',
        transactionId: optionalString(data.transactionId),
        commerceContextId: optionalString(data.commerceContextId),
        itemTitle: optionalString(data.itemTitle) ?? '',
        currency: optionalString(data.currency) ?? 'USD',
        priceMinor: optionalInteger(data.priceMinor) ?? 0,
        trackingNumber: optionalString(data.trackingNumber),
        carrier: optionalString(data.carrier),
        expiresAt: data.expiresAt.toDate(),
        createdAt: dateValue(data.createdAt, data.expiresAt.toDate()),
    };
}
class FirestoreMerchantConnectAdapter {
    firestore;
    constructor(firestore) {
        this.firestore = firestore;
    }
    async findBoundIntegration(principal) {
        if (!principal.integrationId)
            return null;
        const snap = await this.firestore.collection('platformIntegrations').doc(principal.integrationId).get();
        if (!snap.exists)
            return null;
        const data = snap.data();
        if (data.status !== 'ACTIVE')
            return null;
        const organizationId = optionalString(data.organizationId);
        if (organizationId && organizationId !== principal.organizationId)
            return null;
        const secret = optionalString(data.webhookSigningSecret);
        const platform = optionalString(data.platform);
        if (!secret || !platform)
            return null;
        const origins = Array.isArray(data.callbackOrigins)
            ? data.callbackOrigins.filter((value) => typeof value === 'string')
            : [];
        return { id: snap.id, platform, webhookSigningSecret: secret, callbackOrigins: origins };
    }
    async findAccessibleSession(sessionId, principal) {
        const snap = await this.firestore.collection('connectSessions').doc(sessionId).get();
        if (!snap.exists)
            return null;
        const session = toStoredConnectSession(snap.id, snap.data());
        if (!session || !connectSessionIsAccessible(session, principal))
            return null;
        return session;
    }
    async listAccessibleSessions(principal, externalOrderId) {
        let query = this.firestore.collection('connectSessions').where('externalOrderId', '==', externalOrderId);
        query = principal.integrationId
            ? query.where('integrationId', '==', principal.integrationId)
            : query.where('organizationId', '==', principal.organizationId);
        const snap = await query.limit(25).get();
        return snap.docs
            .map((doc) => toStoredConnectSession(doc.id, doc.data()))
            .filter((session) => session !== null && connectSessionIsAccessible(session, principal));
    }
    async cancelAccessibleSession(sessionId, principal, decide) {
        const sessionRef = this.firestore.collection('connectSessions').doc(sessionId);
        return this.firestore.runTransaction(async (tx) => {
            const snap = await tx.get(sessionRef);
            const loaded = snap.exists ? toStoredConnectSession(snap.id, snap.data()) : null;
            const accessible = loaded && connectSessionIsAccessible(loaded, principal) ? loaded : null;
            const decision = decide(accessible);
            if (decision.type === 'REPLAY')
                return decision.session;
            const outboxRef = this.firestore.collection('domainOutbox').doc(decision.event.id);
            const existingOutbox = await tx.get(outboxRef);
            tx.update(sessionRef, {
                status: 'CANCELLED',
                tokenHash: firestore_1.FieldValue.delete(),
                codeChallenge: firestore_1.FieldValue.delete(),
                cancelledAt: firestore_1.Timestamp.fromDate(decision.event.occurredAt),
                updatedAt: firestore_1.Timestamp.fromDate(decision.event.occurredAt),
            });
            if (!existingOutbox.exists)
                tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(decision.event));
            return decision.session;
        });
    }
}
exports.FirestoreMerchantConnectAdapter = FirestoreMerchantConnectAdapter;
//# sourceMappingURL=merchant-evidence-repository.js.map