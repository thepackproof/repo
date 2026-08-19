"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FirestoreMerchantConnectAdapter = exports.FirestoreMerchantEvidenceRepository = void 0;
const firestore_1 = require("firebase-admin/firestore");
const errors_1 = require("../../../application/v1/errors");
const merchant_transaction_service_1 = require("../../../application/v1/merchant-transaction-service");
const shipping_tracker_1 = require("../../../shipping-tracker");
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
function deliveryIdFor(transactionId) {
    return `delivery_${(0, merchant_transaction_service_1.sha256)(transactionId).slice(0, 40)}`;
}
function matchStatus(value) {
    return value === 'MATCHED' || value === 'MISMATCH' || value === 'NOT_SCANNED' ? value : null;
}
function trackingComparisonPatch(match, trackingNumber, occurredAt, existing) {
    const expected = trackingNumber ? trackingNumber.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
    return {
        ...(match ? { postSubmissionTrackingMatchStatus: match } : {}),
        ...(expected ? { postSubmissionExpectedTrackingNumber: expected } : {}),
        postSubmissionComparedAt: firestore_1.Timestamp.fromDate(occurredAt),
        ...(match === 'MISMATCH' && existing?.moderationStatus === 'UNREVIEWED'
            ? { moderationStatus: 'TRACKING_MISMATCH_REVIEW' }
            : {}),
    };
}
function toShipment(transactionId, shipping, createdAt, updatedAt) {
    if (!shipping || typeof shipping !== 'object')
        return null;
    const carrier = optionalString(shipping.carrier);
    const trackingNumber = optionalString(shipping.trackingNumber);
    if (!carrier || !trackingNumber)
        return null;
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
        labelEvidenceMatchStatus: matchStatus(shipping.labelEvidenceMatchStatus),
        shippedAt: shipping.shippedAt ? dateValue(shipping.shippedAt, updatedAt).toISOString() : null,
        createdAt: createdAt.toISOString(),
        updatedAt: updatedAt.toISOString(),
    };
}
function toDelivery(transactionId, delivery, createdAt, updatedAt) {
    if (!delivery || typeof delivery !== 'object')
        return null;
    const arrivalEvidenceId = optionalString(delivery.arrivalEvidenceId);
    if (!arrivalEvidenceId)
        return null;
    return {
        id: deliveryIdFor(transactionId),
        object: 'delivery',
        schemaVersion: 1,
        transactionId,
        assertionSource: 'MERCHANT',
        status: 'ASSOCIATED',
        arrivalEvidenceId,
        carrier: optionalString(delivery.carrier),
        trackingNumber: optionalString(delivery.trackingNumber),
        labelEvidenceMatchStatus: matchStatus(delivery.labelEvidenceMatchStatus),
        receivedAt: delivery.receivedAt ? dateValue(delivery.receivedAt, updatedAt).toISOString() : updatedAt.toISOString(),
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
    const declaredWeight = source?.declaredWeightGrams;
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
        sellerId: optionalString(data.sellerId),
        buyerId: optionalString(data.buyerId),
        participantIds: Array.isArray(data.participantIds)
            ? data.participantIds.filter((value) => typeof value === 'string')
            : [],
        shipment: toShipment(id, data.shipping, createdAt, updatedAt),
        delivery: toDelivery(id, data.delivery, createdAt, updatedAt),
        commerceContextId: optionalString(source?.commerceContextId) ?? optionalString(data.commerceContextId),
        sourceType: optionalString(source?.type),
        sourcePlatform: optionalString(source?.platform),
        externalOrderId: optionalString(source?.externalOrderId),
        externalSellerId: optionalString(source?.externalSellerId),
        declaredWeightGrams: Number.isFinite(declaredWeight) ? Number(declaredWeight) : null,
        sourceTrackingNumber: optionalString(source?.trackingNumber),
        sourceTrustLevel: source?.trustLevel === 'MERCHANT_SERVER_ATTESTED' || source?.trustLevel === 'PLATFORM_API_ATTESTED' || source?.trustLevel === 'PAGE_DECLARED'
            ? source.trustLevel
            : optionalString(source?.type) === 'PACKPROOF_BUTTON'
                ? 'PAGE_DECLARED'
                : null,
        passportId: optionalString(data.passportId),
        passportDisplayId: optionalString(data.passportDisplayId),
        passportIssuedAt: data.passportIssuedAt ? dateValue(data.passportIssuedAt, createdAt) : null,
        createdAt,
        updatedAt,
    };
}
function toPassportSnapshot(id, data) {
    const passport = data.passport && typeof data.passport === 'object' ? data.passport : null;
    const digest = optionalString(data.canonicalPayloadSha256);
    if (!passport || !digest)
        return null;
    return {
        snapshotId: optionalString(data.snapshotId) ?? id,
        passportId: optionalString(data.passportId) ?? '',
        transactionId: optionalString(data.transactionId) ?? '',
        snapshotVersion: optionalInteger(data.snapshotVersion) ?? 1,
        passport,
        canonicalPayloadSha256: digest,
        rendererVersion: optionalString(data.rendererVersion) ?? 'packproof-passport-pdf@1.0.0',
        generatedAt: dateValue(data.generatedAt, new Date(0)),
        pdfStoragePath: optionalString(data.pdfStoragePath),
        pdfSha256: optionalString(data.pdfSha256),
    };
}
function toCommerce(id, data) {
    const source = data.source && typeof data.source === 'object' ? data.source : null;
    const item = data.item && typeof data.item === 'object' ? data.item : null;
    const amount = item?.amount && typeof item.amount === 'object' ? item.amount : null;
    const options = Array.isArray(item?.selectedOptions)
        ? item.selectedOptions.filter((entry) => Boolean(entry && typeof entry === 'object'))
        : [];
    const variant = options
        .map((entry) => `${typeof entry.name === 'string' ? entry.name : ''}: ${typeof entry.value === 'string' ? entry.value : ''}`.trim())
        .filter(Boolean)
        .join('; ') || null;
    const trust = source?.trustLevel === 'MERCHANT_SERVER_ATTESTED' || source?.trustLevel === 'PLATFORM_API_ATTESTED' || source?.trustLevel === 'PAGE_DECLARED'
        ? source.trustLevel
        : null;
    return {
        id,
        platform: optionalString(source?.platform),
        trustLevel: trust,
        assertingSource: trust === 'PAGE_DECLARED' ? 'PAGE_DECLARED' : trust === 'PLATFORM_API_ATTESTED' ? 'PLATFORM_API' : 'MERCHANT_API',
        externalOrderId: optionalString(source?.externalOrderId),
        externalSellerId: optionalString(data.externalSellerId),
        capturedAt: source?.capturedAt ? dateValue(source.capturedAt, new Date(0)).toISOString() : null,
        canonicalPayloadSha256: optionalString(data.canonicalPayloadSha256),
        title: optionalString(item?.title),
        sku: optionalString(item?.sku),
        gtin: optionalString(item?.gtin),
        upc: optionalString(item?.upc),
        serialNumber: optionalString(item?.serialNumber),
        quantity: item && Number.isSafeInteger(item.quantity) ? item.quantity : null,
        amount: amount && typeof amount.currency === 'string' && Number.isSafeInteger(amount.minorUnits)
            ? { currency: amount.currency, minorUnits: amount.minorUnits }
            : null,
        variant,
        listingReference: optionalString(source?.externalListingId) ?? optionalString(source?.productUrl),
        merchantItemId: optionalString(source?.externalProductId) ?? optionalString(source?.externalLineItemId),
        declaredCondition: null,
        declaredWeightGrams: Number.isFinite(data.declaredWeightGrams) ? Number(data.declaredWeightGrams) : null,
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
        shippingTracker: (0, shipping_tracker_1.asShippingTrackerObservation)(data.shippingTracker),
        captureSessionId: optionalString(data.captureSessionId),
        clientCreatedAt: optionalString(data.clientCreatedAt),
        acquisitionClass: optionalString(data.acquisitionClass),
        bundleBindingProfile: optionalString(data.bundleBindingProfile),
        manifestAuthentication: authentication ? {
            type: optionalString(authentication.type),
            algorithm: optionalString(authentication.algorithm),
            keyId: optionalString(authentication.keyId),
            verificationScope: optionalString(authentication.verificationScope),
        } : null,
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
        packingEvidenceId: optionalString(shipping?.packingEvidenceId),
        sealEvidenceId: optionalString(shipping?.sealEvidenceId),
        labelEvidenceMatchStatus: matchStatus(shipping?.labelEvidenceMatchStatus),
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
    async loadTransaction(transactionId) {
        const snap = await this.firestore.collection('transactions').doc(transactionId).get();
        if (!snap.exists)
            return null;
        return toAccessible(snap.id, snap.data());
    }
    async loadTransactionByPassportIdentity(passportIdentity) {
        const field = passportIdentity.startsWith('ppt_') ? 'passportId' : 'passportDisplayId';
        const value = field === 'passportDisplayId' ? passportIdentity.toUpperCase() : passportIdentity;
        const snap = await this.firestore.collection('transactions').where(field, '==', value).limit(1).get();
        if (snap.empty)
            return null;
        return toAccessible(snap.docs[0].id, snap.docs[0].data());
    }
    async findAccessibleTransactionByPassportIdentity(passportIdentity, principal) {
        const field = passportIdentity.startsWith('ppt_') ? 'passportId' : 'passportDisplayId';
        const value = field === 'passportDisplayId' ? passportIdentity.toUpperCase() : passportIdentity;
        const snap = await this.firestore.collection('transactions').where(field, '==', value).limit(1).get();
        if (snap.empty)
            return null;
        const transaction = toAccessible(snap.docs[0].id, snap.docs[0].data());
        return principalCanAccess(transaction, principal) ? transaction : null;
    }
    async bindPassportIdentity(transactionId, identity) {
        const ref = this.firestore.collection('transactions').doc(transactionId);
        return this.firestore.runTransaction(async (tx) => {
            const snap = await tx.get(ref);
            if (!snap.exists)
                throw new Error('Transaction disappeared during Passport issuance.');
            const data = snap.data();
            const existingId = optionalString(data.passportId);
            const existingDisplay = optionalString(data.passportDisplayId);
            if (existingId && existingDisplay) {
                return {
                    passportId: existingId,
                    displayId: existingDisplay,
                    issuedAt: data.passportIssuedAt ? dateValue(data.passportIssuedAt, identity.issuedAt) : identity.issuedAt,
                };
            }
            tx.update(ref, {
                passportId: identity.passportId,
                passportDisplayId: identity.displayId,
                passportIssuedAt: firestore_1.Timestamp.fromDate(identity.issuedAt),
            });
            return identity;
        });
    }
    async findCommerceContext(commerceContextId) {
        const snap = await this.firestore.collection('commerceContexts').doc(commerceContextId).get();
        if (!snap.exists)
            return null;
        return toCommerce(snap.id, snap.data());
    }
    async listPassportSnapshots(transactionId) {
        const snap = await this.firestore.collection('transactions').doc(transactionId).collection('passportSnapshots').orderBy('snapshotVersion', 'asc').get();
        return snap.docs.map((doc) => toPassportSnapshot(doc.id, doc.data())).filter((item) => item !== null);
    }
    async findPassportSnapshot(transactionId, snapshotId) {
        const snap = await this.firestore.collection('transactions').doc(transactionId).collection('passportSnapshots').doc(snapshotId).get();
        if (!snap.exists)
            return null;
        return toPassportSnapshot(snap.id, snap.data());
    }
    async createPassportSnapshot(transactionId, build) {
        const txnRef = this.firestore.collection('transactions').doc(transactionId);
        const snapshots = txnRef.collection('passportSnapshots');
        return this.firestore.runTransaction(async (tx) => {
            const snap = await tx.get(txnRef);
            if (!snap.exists) {
                throw new errors_1.ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'The requested transaction was not found.');
            }
            const latest = await tx.get(snapshots.orderBy('snapshotVersion', 'desc').limit(1));
            const lastVersion = latest.empty ? 0 : (optionalInteger(latest.docs[0].data().snapshotVersion) ?? 0);
            const counter = optionalInteger(snap.data().passportSnapshotVersion) ?? 0;
            const version = Math.max(lastVersion, counter) + 1;
            const record = build(version);
            tx.update(txnRef, { passportSnapshotVersion: version });
            tx.create(snapshots.doc(record.snapshotId), {
                id: record.snapshotId,
                object: 'packproof_passport_snapshot',
                schemaVersion: 1,
                snapshotId: record.snapshotId,
                passportId: record.passportId,
                transactionId: record.transactionId,
                snapshotVersion: record.snapshotVersion,
                passport: record.passport,
                canonicalPayloadSha256: record.canonicalPayloadSha256,
                rendererVersion: record.rendererVersion,
                generatedAt: firestore_1.Timestamp.fromDate(record.generatedAt),
                pdfStoragePath: record.pdfStoragePath,
                pdfSha256: record.pdfSha256,
                createdAt: firestore_1.Timestamp.fromDate(record.generatedAt),
            });
            return record;
        });
    }
    async savePassportExport(transactionId, snapshotId, record) {
        await this.firestore.collection('transactions').doc(transactionId).collection('passportSnapshots').doc(snapshotId).update({
            pdfStoragePath: record.storagePath,
            pdfSha256: record.sha256,
        });
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
        const packingRef = ref.collection('evidence').doc(record.packingEvidenceId);
        const sealRef = ref.collection('evidence').doc(record.sealEvidenceId);
        const eventRef = ref.collection('events').doc(event.id);
        const outboxRef = this.firestore.collection('domainOutbox').doc(event.id);
        return this.firestore.runTransaction(async (tx) => {
            const [snap, packingSnap, sealSnap, existingEvent, existingOutbox] = await Promise.all([
                tx.get(ref), tx.get(packingRef), tx.get(sealRef), tx.get(eventRef), tx.get(outboxRef),
            ]);
            if (!snap.exists)
                throw new Error('Transaction disappeared before shipment association.');
            if (!packingSnap.exists || !sealSnap.exists)
                throw new Error('Shipment evidence disappeared before association.');
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
            tx.update(packingRef, trackingComparisonPatch(record.labelEvidenceMatchStatus, record.trackingNumber, record.occurredAt, packingSnap.data()));
            tx.update(sealRef, trackingComparisonPatch(record.labelEvidenceMatchStatus, record.trackingNumber, record.occurredAt, sealSnap.data()));
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
    async createReturn(transactionId, record, event) {
        const ref = this.firestore.collection('transactions').doc(transactionId);
        const returnRef = ref.collection('returns').doc(record.id);
        const eventRef = ref.collection('events').doc(event.id);
        const outboxRef = this.firestore.collection('domainOutbox').doc(event.id);
        return this.firestore.runTransaction(async (tx) => {
            const [snap, existingReturn, existingEvent, existingOutbox] = await Promise.all([
                tx.get(ref), tx.get(returnRef), tx.get(eventRef), tx.get(outboxRef),
            ]);
            if (!snap.exists)
                throw new Error('Transaction disappeared before return creation.');
            if (existingReturn.exists)
                return toReturn(transactionId, existingReturn.id, existingReturn.data());
            tx.create(returnRef, {
                id: record.id,
                transactionId,
                initiatedBy: record.initiatedBy,
                returningParticipantId: record.returningParticipantId,
                recipientId: record.recipientId,
                authorizedBy: null,
                participantIds: record.participantIds,
                status: 'REQUESTED',
                reason: record.reason,
                originalEvidenceHashes: record.originalEvidenceHashes,
                completedBy: [],
                createdAt: firestore_1.Timestamp.fromDate(record.occurredAt),
                updatedAt: firestore_1.Timestamp.fromDate(record.occurredAt),
            });
            tx.update(ref, {
                returnStatus: 'IN_PROGRESS',
                updatedAt: firestore_1.Timestamp.fromDate(record.occurredAt),
            });
            if (!existingEvent.exists) {
                tx.create(eventRef, {
                    actorId: event.actor.id,
                    type: event.type,
                    summary: 'A merchant requested a return passport.',
                    metadata: { applicationEventId: event.id, schemaVersion: 1, returnPassportId: record.id },
                    createdAt: firestore_1.Timestamp.fromDate(record.occurredAt),
                });
            }
            if (!existingOutbox.exists)
                tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(event));
            return toReturn(transactionId, record.id, {
                reason: record.reason,
                status: 'REQUESTED',
                originalEvidenceHashes: record.originalEvidenceHashes,
                createdAt: firestore_1.Timestamp.fromDate(record.occurredAt),
                updatedAt: firestore_1.Timestamp.fromDate(record.occurredAt),
            });
        });
    }
    async associateReturnShipment(transactionId, returnPassportId, record, event) {
        const ref = this.firestore.collection('transactions').doc(transactionId);
        const returnRef = ref.collection('returns').doc(returnPassportId);
        const packingRef = ref.collection('evidence').doc(record.packingEvidenceId);
        const sealRef = ref.collection('evidence').doc(record.sealEvidenceId);
        const eventRef = ref.collection('events').doc(event.id);
        const outboxRef = this.firestore.collection('domainOutbox').doc(event.id);
        return this.firestore.runTransaction(async (tx) => {
            const [returnSnap, packingSnap, sealSnap, existingEvent, existingOutbox] = await Promise.all([
                tx.get(returnRef), tx.get(packingRef), tx.get(sealRef), tx.get(eventRef), tx.get(outboxRef),
            ]);
            if (!returnSnap.exists)
                throw new Error('Return passport disappeared before shipping association.');
            if (!packingSnap.exists || !sealSnap.exists)
                throw new Error('Return evidence disappeared before shipping association.');
            const shipping = {
                carrier: record.carrier,
                trackingNumber: record.trackingNumber,
                shippedAt: firestore_1.Timestamp.fromDate(record.occurredAt),
                labelEvidenceMatchStatus: record.labelEvidenceMatchStatus,
                scannedTrackingNumber: record.scannedTrackingNumber,
                packingEvidenceId: record.packingEvidenceId,
                sealEvidenceId: record.sealEvidenceId,
            };
            tx.update(returnRef, {
                status: 'IN_TRANSIT',
                shipping,
                updatedAt: firestore_1.Timestamp.fromDate(record.occurredAt),
            });
            tx.update(packingRef, trackingComparisonPatch(record.labelEvidenceMatchStatus, record.trackingNumber, record.occurredAt, packingSnap.data()));
            tx.update(sealRef, trackingComparisonPatch(record.labelEvidenceMatchStatus, record.trackingNumber, record.occurredAt, sealSnap.data()));
            tx.update(ref, {
                returnStatus: 'IN_PROGRESS',
                updatedAt: firestore_1.Timestamp.fromDate(record.occurredAt),
            });
            if (!existingEvent.exists) {
                tx.create(eventRef, {
                    actorId: event.actor.id,
                    type: event.type,
                    summary: `Merchant recorded return shipment with ${record.carrier}.`,
                    metadata: { applicationEventId: event.id, schemaVersion: 1, returnPassportId, labelEvidenceMatchStatus: record.labelEvidenceMatchStatus },
                    createdAt: firestore_1.Timestamp.fromDate(record.occurredAt),
                });
            }
            if (!existingOutbox.exists)
                tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(event));
            return toReturn(transactionId, returnPassportId, {
                ...returnSnap.data(),
                status: 'IN_TRANSIT',
                shipping,
                updatedAt: firestore_1.Timestamp.fromDate(record.occurredAt),
            });
        });
    }
    async associateDelivery(transactionId, record, event) {
        const ref = this.firestore.collection('transactions').doc(transactionId);
        const arrivalRef = ref.collection('evidence').doc(record.arrivalEvidenceId);
        const eventRef = ref.collection('events').doc(event.id);
        const outboxRef = this.firestore.collection('domainOutbox').doc(event.id);
        return this.firestore.runTransaction(async (tx) => {
            const [snap, arrivalSnap, existingEvent, existingOutbox] = await Promise.all([
                tx.get(ref), tx.get(arrivalRef), tx.get(eventRef), tx.get(outboxRef),
            ]);
            if (!snap.exists)
                throw new Error('Transaction disappeared before delivery association.');
            if (!arrivalSnap.exists)
                throw new Error('Arrival evidence disappeared before delivery association.');
            const data = snap.data();
            const createdAt = dateValue(data.createdAt, record.occurredAt);
            const delivery = {
                arrivalEvidenceId: record.arrivalEvidenceId,
                carrier: record.carrier,
                trackingNumber: record.trackingNumber,
                scannedTrackingNumber: record.scannedTrackingNumber,
                labelEvidenceMatchStatus: record.labelEvidenceMatchStatus,
                receivedAt: firestore_1.Timestamp.fromDate(record.occurredAt),
            };
            tx.update(ref, {
                receiverStatus: 'IN_PROGRESS',
                delivery,
                updatedAt: firestore_1.Timestamp.fromDate(record.occurredAt),
            });
            tx.update(arrivalRef, trackingComparisonPatch(record.labelEvidenceMatchStatus, record.trackingNumber, record.occurredAt, arrivalSnap.data()));
            if (!existingEvent.exists) {
                tx.create(eventRef, {
                    actorId: event.actor.id,
                    type: event.type,
                    summary: 'Merchant associated receiver arrival observation.',
                    metadata: { applicationEventId: event.id, schemaVersion: 1, arrivalEvidenceId: record.arrivalEvidenceId },
                    createdAt: firestore_1.Timestamp.fromDate(record.occurredAt),
                });
            }
            if (!existingOutbox.exists)
                tx.create(outboxRef, (0, outbox_1.storedOutboxEvent)(event));
            return toDelivery(transactionId, delivery, createdAt, record.occurredAt);
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