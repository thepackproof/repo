"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inventoryCategories = exports.inventoryStates = exports.comparisonResults = exports.integrityStatuses = exports.trustClasses = exports.provenanceClasses = exports.PASSPORT_SNAPSHOT_ID_PATTERN = exports.PASSPORT_RESOURCE_ID_PATTERN = exports.PASSPORT_DISPLAY_ID_PATTERN = exports.CROCKFORD = exports.SHIPPING_TRACKER_INTERPRETATION = exports.REVIEW_CONTEXT_FOOTNOTE_COPY = exports.COMPARISON_FOOTNOTE_COPY = exports.PASSPORT_PAGE_ONE_FOOTER = exports.INTEGRITY_MEANING_LIMITED = exports.INTEGRITY_MEANING_VERIFIED = exports.PASSPORT_REVIEW_FOOTNOTE = exports.PASSPORT_COMPARISON_FOOTNOTE = exports.PASSPORT_DISPLAY_HASH_PREFIX = exports.PASSPORT_ID_HASH_PREFIX = exports.PASSPORT_PDF_RENDERER_VERSION = exports.PASSPORT_SCHEMA_VERSION = exports.PASSPORT_EXPORT_OBJECT = exports.PASSPORT_SNAPSHOT_OBJECT = exports.PASSPORT_OBJECT = void 0;
exports.issuePassportResourceId = issuePassportResourceId;
exports.displayIdFromPassportId = displayIdFromPassportId;
exports.issuePassportIdentity = issuePassportIdentity;
exports.issuePassportSnapshotId = issuePassportSnapshotId;
exports.normalizePassportDisplayId = normalizePassportDisplayId;
exports.isPassportResourceId = isPassportResourceId;
exports.isPassportDisplayId = isPassportDisplayId;
exports.isPassportSnapshotId = isPassportSnapshotId;
exports.normalizeIdentifier = normalizeIdentifier;
exports.fact = fact;
exports.compareExactIdentifier = compareExactIdentifier;
exports.compareIdentifierAttribute = compareIdentifierAttribute;
exports.evaluatePassportEligibility = evaluatePassportEligibility;
exports.inventoryStateFor = inventoryStateFor;
exports.aggregatePassport = aggregatePassport;
exports.verificationUrlFor = verificationUrlFor;
const node_crypto_1 = require("node:crypto");
exports.PASSPORT_OBJECT = 'packproof_passport';
exports.PASSPORT_SNAPSHOT_OBJECT = 'packproof_passport_snapshot';
exports.PASSPORT_EXPORT_OBJECT = 'packproof_passport_export';
exports.PASSPORT_SCHEMA_VERSION = 1;
exports.PASSPORT_PDF_RENDERER_VERSION = 'packproof-passport-pdf@1.0.0';
exports.PASSPORT_ID_HASH_PREFIX = 'packproof-passport-id-v1\n';
exports.PASSPORT_DISPLAY_HASH_PREFIX = 'packproof-passport-display-v1\n';
exports.PASSPORT_COMPARISON_FOOTNOTE = 'RELATIONSHIP_ONLY';
exports.PASSPORT_REVIEW_FOOTNOTE = 'CONFIGURATION_ONLY';
exports.INTEGRITY_MEANING_VERIFIED = "PackProof's evidence records and integrity bindings associated with this Passport successfully verify.";
exports.INTEGRITY_MEANING_LIMITED = "PackProof's evidence records and integrity bindings associated with this Passport successfully verify, with recorded limitations.";
exports.PASSPORT_PAGE_ONE_FOOTER = 'Review the evidence and provenance on the following pages. PackProof does not determine fraud, fault, or liability.';
exports.COMPARISON_FOOTNOTE_COPY = 'Comparisons report relationships between recorded data. They do not establish product authenticity, legal ownership, custody or liability.';
exports.REVIEW_CONTEXT_FOOTNOTE_COPY = 'Relevance categories reflect the configured receiving-party workflow. PackProof does not determine evidentiary weight or dispute outcome.';
exports.SHIPPING_TRACKER_INTERPRETATION = 'OPEN_SOURCE_TRACKING_NUMBER_VALIDATION_NOT_CARRIER_CUSTODY';
exports.CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
exports.PASSPORT_DISPLAY_ID_PATTERN = /^PP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/;
exports.PASSPORT_RESOURCE_ID_PATTERN = /^ppt_[a-f0-9]{40}$/;
exports.PASSPORT_SNAPSHOT_ID_PATTERN = /^pps_[a-f0-9]{40}$/;
exports.provenanceClasses = [
    'SOURCE_ASSERTION',
    'PARTICIPANT_ASSERTION',
    'PACKPROOF_OBSERVATION',
    'THIRD_PARTY_ASSERTION',
    'INTEGRITY_RESULT',
    'DERIVED_COMPARISON',
];
exports.trustClasses = [
    'MERCHANT_SERVER_ATTESTED',
    'PLATFORM_API_ATTESTED',
    'PAGE_DECLARED',
    'PACKPROOF_CAPTURE',
    'PACKPROOF_SERVICE',
];
exports.integrityStatuses = ['VERIFIED', 'RECORDED', 'LIMITED', 'FAILED'];
exports.comparisonResults = [
    'SAME',
    'DIFFERENT',
    'CONSISTENT_WITH_DECLARED',
    'NOT_CONSISTENT_WITH_DECLARED',
    'NOT_COMPARED',
];
exports.inventoryStates = ['AVAILABLE', 'NOT_AVAILABLE', 'NOT_APPLICABLE', 'REVIEW_REQUIRED'];
exports.inventoryCategories = [
    'COMMERCE_ORDER_RECORD',
    'ITEM_IDENTIFIER_EVIDENCE',
    'CONDITION_EVIDENCE',
    'PACKING_CAPTURE',
    'PACKAGE_SEALING',
    'SHIPPING_LABEL_EVIDENCE',
    'TRACKING_ASSOCIATION',
    'WEIGHT_OBSERVATION',
    'CARRIER_ACCEPTANCE',
    'DELIVERY_EVIDENCE',
    'RECEIVER_CAPTURE',
    'RETURN_EVIDENCE',
    'REFUND_EVIDENCE',
];
function sha256Hex(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value, 'utf8').digest('hex');
}
function issuePassportResourceId(transactionId) {
    return `ppt_${sha256Hex(`${exports.PASSPORT_ID_HASH_PREFIX}${transactionId}`).slice(0, 40)}`;
}
function displayIdFromPassportId(passportId) {
    const digest = (0, node_crypto_1.createHash)('sha256').update(`${exports.PASSPORT_DISPLAY_HASH_PREFIX}${passportId}`, 'utf8').digest();
    let bits = 0n;
    for (let index = 0; index < 8; index += 1)
        bits = (bits << 8n) | BigInt(digest[index]);
    bits >>= 4n;
    let encoded = '';
    for (let index = 0; index < 12; index += 1) {
        const shift = BigInt((11 - index) * 5);
        encoded += exports.CROCKFORD[Number((bits >> shift) & 31n)];
    }
    return `PP-${encoded.slice(0, 4)}-${encoded.slice(4, 8)}-${encoded.slice(8, 12)}`;
}
function issuePassportIdentity(transactionId) {
    const passportId = issuePassportResourceId(transactionId);
    return { passportId, displayId: displayIdFromPassportId(passportId) };
}
function issuePassportSnapshotId(passportId, snapshotVersion) {
    return `pps_${sha256Hex(`packproof-passport-snapshot-v1\n${passportId}\n${snapshotVersion}`).slice(0, 40)}`;
}
function normalizePassportDisplayId(value) {
    return value.trim().toUpperCase();
}
function isPassportResourceId(value) {
    return exports.PASSPORT_RESOURCE_ID_PATTERN.test(value);
}
function isPassportDisplayId(value) {
    return exports.PASSPORT_DISPLAY_ID_PATTERN.test(normalizePassportDisplayId(value));
}
function isPassportSnapshotId(value) {
    return exports.PASSPORT_SNAPSHOT_ID_PATTERN.test(value);
}
function normalizeIdentifier(value) {
    if (!value)
        return null;
    const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return normalized || null;
}
function fact(value, provenanceClass, extras = {}) {
    return {
        value,
        provenanceClass,
        assertingSource: extras.assertingSource ?? null,
        trustClass: extras.trustClass ?? null,
        recordedAt: extras.recordedAt ?? null,
        sourceRecordId: extras.sourceRecordId ?? null,
        sourceReference: extras.sourceReference ?? null,
        digestSha256: extras.digestSha256 ?? null,
    };
}
function compareExactIdentifier(expected, observed) {
    const left = normalizeIdentifier(expected);
    const right = normalizeIdentifier(observed);
    if (!left || !right)
        return 'NOT_COMPARED';
    return left === right ? 'SAME' : 'DIFFERENT';
}
function compareIdentifierAttribute(attribute, expected, observed) {
    return {
        attribute,
        expected,
        observed,
        result: compareExactIdentifier(expected, observed),
        method: expected && observed ? 'EXACT_NORMALIZED' : 'NOT_COMPARABLE',
        footnote: exports.PASSPORT_COMPARISON_FOOTNOTE,
    };
}
function interpretedComparison(attribute, expected, observed) {
    return {
        attribute,
        expected,
        observed,
        result: 'NOT_COMPARED',
        method: 'NOT_COMPARABLE',
        footnote: exports.PASSPORT_COMPARISON_FOOTNOTE,
    };
}
const OUTBOUND_PACKING = new Set(['PACKING_VIDEO', 'STATION_PACKING_VIDEO']);
const OUTBOUND_SEAL = new Set(['SHIPPING_LABEL', 'STATION_SEAL_REFERENCE']);
const ITEM_CAPTURE = new Set(['ITEM_PHOTO', 'PACKING_VIDEO', 'STATION_PACKING_VIDEO']);
const CONDITION = new Set(['CONDITION_PHOTO', 'RETURN_CONDITION_PHOTO']);
const IDENTIFIER = new Set(['IDENTIFIER_PHOTO']);
const ARRIVAL = new Set(['DELIVERY_PHOTO']);
const UNBOXING = new Set(['UNBOXING_VIDEO']);
const RETURN_TYPES = new Set(['RETURN_PACKING_VIDEO', 'RETURN_SHIPPING_LABEL', 'RETURN_UNBOXING_VIDEO', 'RETURN_CONDITION_PHOTO']);
const STATION_TYPES = new Set(['STATION_PACKING_VIDEO', 'STATION_SEAL_REFERENCE']);
function isFinalized(artifact) {
    return artifact.finalization === 'FINALIZED';
}
function isQuarantined(artifact) {
    return artifact.finalization === 'QUARANTINED';
}
function finalizedWithManifest(artifact) {
    return isFinalized(artifact) && Boolean(artifact.sha256) && Boolean(artifact.manifestSha256);
}
function evaluatePassportEligibility(input) {
    const failures = [];
    if (!input.transactionExists) {
        failures.push({ code: 'TRANSACTION_MISSING', message: 'A tenant-authorized PackProof transaction is required.' });
    }
    if (!input.commerceContextId && !input.externalOrderId && !input.merchantReference) {
        failures.push({
            code: 'NO_COMMERCE_SOURCE',
            message: 'A commerce context, Connect external order identifier, or merchant reference is required.',
        });
    }
    if (input.displayedUnattributedFacts > 0) {
        failures.push({
            code: 'UNATTRIBUTED_COMMERCIAL_FACT',
            message: 'Imported commercial facts that are displayed must carry source attribution.',
        });
    }
    if (!input.artifacts.some(finalizedWithManifest)) {
        failures.push({
            code: 'NO_FINALIZED_MANIFEST_ARTIFACT',
            message: 'At least one FINALIZED evidence artifact with sha256 and manifestSha256 is required.',
        });
    }
    return failures.length ? { ok: false, failures } : { ok: true };
}
function artifactSource(artifact) {
    if (artifact.acquisitionClass === 'ENTERPRISE_EDGE' || STATION_TYPES.has(artifact.type))
        return 'ENTERPRISE_EDGE';
    if (artifact.acquisitionClass === 'EXTERNAL_DECLARED')
        return 'EXTERNAL_DECLARED';
    if (artifact.sha256 || artifact.finalization === 'FINALIZED' || artifact.finalization === 'QUARANTINED')
        return 'PACKPROOF_CAPTURE';
    return 'UNKNOWN';
}
function firstOf(items, predicate) {
    return items.find(predicate);
}
function idsOf(artifacts, predicate) {
    return artifacts.filter(predicate).map((item) => item.id);
}
function latestIso(values) {
    const times = values.filter((value) => Boolean(value)).sort();
    return times.at(-1) ?? new Date(0).toISOString();
}
function observation(kind, value, artifact, extras = {}) {
    return {
        kind,
        result: fact(value, 'PACKPROOF_OBSERVATION', {
            assertingSource: 'PACKPROOF_CAPTURE',
            trustClass: 'PACKPROOF_CAPTURE',
            recordedAt: artifact?.finalizedAt ?? artifact?.clientCreatedAt ?? artifact?.createdAt ?? null,
            sourceRecordId: artifact?.id ?? null,
            sourceReference: artifact?.id ?? null,
            ...extras,
        }),
        artifactId: artifact?.id ?? null,
        evidenceSessionId: artifact?.evidenceSessionId ?? artifact?.captureSessionId ?? null,
        frameReference: null,
        capturedAt: artifact?.clientCreatedAt ?? artifact?.finalizedAt ?? artifact?.createdAt ?? null,
    };
}
function sourceFact(value, commerce, transaction, field) {
    if (commerce) {
        return fact(value, 'SOURCE_ASSERTION', {
            assertingSource: commerce.assertingSource ?? 'MERCHANT_API',
            trustClass: commerce.trustLevel,
            recordedAt: commerce.capturedAt,
            sourceRecordId: commerce.id,
            sourceReference: commerce.externalOrderId,
            digestSha256: commerce.canonicalPayloadSha256,
        });
    }
    if (transaction.externalOrderId || transaction.sourcePlatform) {
        return fact(value, 'SOURCE_ASSERTION', {
            assertingSource: 'MERCHANT_API',
            trustClass: 'MERCHANT_SERVER_ATTESTED',
            recordedAt: transaction.createdAt,
            sourceRecordId: transaction.id,
            sourceReference: transaction.externalOrderId,
        });
    }
    if (value !== null && transaction.merchantReference) {
        return fact(value, 'SOURCE_ASSERTION', {
            assertingSource: 'MERCHANT_API',
            trustClass: 'MERCHANT_SERVER_ATTESTED',
            recordedAt: transaction.createdAt,
            sourceRecordId: transaction.id,
            sourceReference: transaction.merchantReference,
        });
    }
    return fact(value, 'SOURCE_ASSERTION', {
        assertingSource: value === null ? null : 'MERCHANT_API',
        trustClass: value === null ? null : 'MERCHANT_SERVER_ATTESTED',
        recordedAt: value === null ? null : transaction.createdAt,
        sourceRecordId: value === null ? null : transaction.id,
        sourceReference: transaction.merchantReference,
    });
}
function trackerValue(artifact) {
    if (!artifact?.shippingTracker)
        return null;
    return {
        lookupStatus: artifact.shippingTracker.lookupStatus,
        courierCode: artifact.shippingTracker.courierCode,
        observationSha256: artifact.shippingTracker.observationSha256,
        hashMatched: artifact.shippingTracker.hashMatched,
        interpretation: exports.SHIPPING_TRACKER_INTERPRETATION,
    };
}
function inventoryStateFor(category, input) {
    switch (category) {
        case 'COMMERCE_ORDER_RECORD':
            if (input.unattributed)
                return { state: 'REVIEW_REQUIRED', artifactIds: [] };
            return { state: input.hasCommerceSource ? 'AVAILABLE' : 'NOT_AVAILABLE', artifactIds: [] };
        case 'ITEM_IDENTIFIER_EVIDENCE': {
            const quarantined = input.identifierArtifacts.filter(isQuarantined);
            if (quarantined.length && !input.identifierArtifacts.some(isFinalized)) {
                return { state: 'REVIEW_REQUIRED', artifactIds: idsOf(input.identifierArtifacts, () => true) };
            }
            const ready = input.identifierArtifacts.filter(isFinalized);
            return ready.length
                ? { state: 'AVAILABLE', artifactIds: ready.map((item) => item.id) }
                : { state: 'NOT_AVAILABLE', artifactIds: [] };
        }
        case 'CONDITION_EVIDENCE': {
            const ready = input.conditionArtifacts.filter(isFinalized);
            return ready.length
                ? { state: 'AVAILABLE', artifactIds: ready.map((item) => item.id) }
                : { state: 'NOT_AVAILABLE', artifactIds: [] };
        }
        case 'PACKING_CAPTURE': {
            const mismatch = input.packingArtifacts.filter((item) => item.clientHashMatched === false);
            if (mismatch.length)
                return { state: 'REVIEW_REQUIRED', artifactIds: mismatch.map((item) => item.id) };
            const ready = input.packingArtifacts.filter(isFinalized);
            return ready.length
                ? { state: 'AVAILABLE', artifactIds: ready.map((item) => item.id) }
                : { state: 'NOT_AVAILABLE', artifactIds: [] };
        }
        case 'PACKAGE_SEALING': {
            const ready = input.sealArtifacts.filter(isFinalized);
            return ready.length
                ? { state: 'AVAILABLE', artifactIds: ready.map((item) => item.id) }
                : { state: 'NOT_AVAILABLE', artifactIds: [] };
        }
        case 'SHIPPING_LABEL_EVIDENCE': {
            const ready = input.labelArtifacts.filter(isFinalized);
            return ready.length
                ? { state: 'AVAILABLE', artifactIds: ready.map((item) => item.id) }
                : { state: 'NOT_AVAILABLE', artifactIds: [] };
        }
        case 'TRACKING_ASSOCIATION':
            if (!input.shippingTerms)
                return { state: 'NOT_APPLICABLE', artifactIds: [] };
            if (input.trackingMismatch)
                return { state: 'REVIEW_REQUIRED', artifactIds: [] };
            return {
                state: input.trackingObserved || input.trackingSupplied ? 'AVAILABLE' : 'NOT_AVAILABLE',
                artifactIds: [],
            };
        case 'WEIGHT_OBSERVATION':
            return { state: 'NOT_AVAILABLE', artifactIds: [] };
        case 'CARRIER_ACCEPTANCE':
            return { state: 'NOT_AVAILABLE', artifactIds: [] };
        case 'DELIVERY_EVIDENCE': {
            const ready = input.deliveryArtifacts.filter(isFinalized);
            if (ready.length)
                return { state: 'AVAILABLE', artifactIds: ready.map((item) => item.id) };
            return { state: input.shipped ? 'NOT_AVAILABLE' : 'NOT_APPLICABLE', artifactIds: [] };
        }
        case 'RECEIVER_CAPTURE': {
            const ready = input.receiverArtifacts.filter(isFinalized);
            return ready.length
                ? { state: 'AVAILABLE', artifactIds: ready.map((item) => item.id) }
                : { state: 'NOT_AVAILABLE', artifactIds: [] };
        }
        case 'RETURN_EVIDENCE': {
            if (!input.hasReturn)
                return { state: 'NOT_APPLICABLE', artifactIds: [] };
            const ready = input.returnArtifacts.filter(isFinalized);
            return ready.length
                ? { state: 'AVAILABLE', artifactIds: ready.map((item) => item.id) }
                : { state: 'NOT_AVAILABLE', artifactIds: [] };
        }
        case 'REFUND_EVIDENCE':
            return { state: 'NOT_APPLICABLE', artifactIds: [] };
        default:
            return { state: 'NOT_AVAILABLE', artifactIds: [] };
    }
}
const REVIEW_RELEVANCE = {
    VISA: {
        MERCHANDISE_NOT_RECEIVED: [
            'PACKING_CAPTURE', 'PACKAGE_SEALING', 'SHIPPING_LABEL_EVIDENCE', 'TRACKING_ASSOCIATION', 'CARRIER_ACCEPTANCE', 'DELIVERY_EVIDENCE',
        ],
        NOT_AS_DESCRIBED: ['COMMERCE_ORDER_RECORD', 'ITEM_IDENTIFIER_EVIDENCE', 'CONDITION_EVIDENCE', 'PACKING_CAPTURE', 'RECEIVER_CAPTURE'],
    },
    MASTERCARD: {
        MERCHANDISE_NOT_RECEIVED: ['PACKING_CAPTURE', 'TRACKING_ASSOCIATION', 'DELIVERY_EVIDENCE'],
        NOT_AS_DESCRIBED: ['COMMERCE_ORDER_RECORD', 'CONDITION_EVIDENCE', 'RECEIVER_CAPTURE'],
    },
    PAYPAL: {
        ITEM_NOT_RECEIVED: ['PACKING_CAPTURE', 'TRACKING_ASSOCIATION', 'DELIVERY_EVIDENCE'],
        SIGNIFICANTLY_NOT_AS_DESCRIBED: ['COMMERCE_ORDER_RECORD', 'CONDITION_EVIDENCE', 'RECEIVER_CAPTURE'],
    },
    GENERIC: {
        DEFAULT: ['COMMERCE_ORDER_RECORD', 'PACKING_CAPTURE', 'PACKAGE_SEALING', 'TRACKING_ASSOCIATION', 'DELIVERY_EVIDENCE'],
    },
};
function reviewContext(query, inventory) {
    if (!query)
        return null;
    const framework = query.framework.trim().toUpperCase() || 'GENERIC';
    const category = query.category.trim().toUpperCase() || 'DEFAULT';
    const mapped = REVIEW_RELEVANCE[framework]?.[category]
        ?? REVIEW_RELEVANCE.GENERIC.DEFAULT;
    const byCategory = new Map(inventory.map((entry) => [entry.category, entry.state]));
    return {
        receivingFramework: framework,
        disputeCategory: category,
        relevance: mapped.map((item) => ({
            category: item,
            inventoryState: byCategory.get(item) ?? 'NOT_AVAILABLE',
        })),
        footnote: exports.PASSPORT_REVIEW_FOOTNOTE,
    };
}
function evaluateIntegrity(input, displayedUnattributed) {
    const finalized = input.artifacts.filter(isFinalized);
    const quarantined = input.artifacts.some(isQuarantined);
    const missingManifest = finalized.some((item) => !item.manifestSha256);
    const missingFile = finalized.some((item) => !item.sha256);
    const missingBundle = finalized.some((item) => !item.evidenceBundleSha256);
    const hashMismatch = input.artifacts.some((item) => item.clientHashMatched === false);
    const foreign = input.artifacts.some((item) => item.transactionId !== input.transaction.id);
    const auth = finalized.map((item) => item.manifestAuthentication).find((item) => item?.keyId || item?.algorithm) ?? null;
    const legacyBundle = finalized.some((item) => item.bundleBindingProfile === 'LEGACY_V1' || !item.evidenceBundleSha256);
    const legacyMac = auth?.type === 'LEGACY_SERVICE_MAC' || (auth?.algorithm && auth.algorithm !== 'HMAC-SHA256');
    const criteria = {
        passportRecord: 'VERIFIED',
        evidenceManifests: !finalized.length ? 'FAILED' : missingManifest ? 'LIMITED' : hashMismatch && missingManifest ? 'FAILED' : 'VERIFIED',
        evidenceFileDigests: !finalized.length ? 'FAILED' : missingFile ? 'LIMITED' : 'VERIFIED',
        bundleBindings: !finalized.length ? 'FAILED' : missingBundle ? 'LIMITED' : 'VERIFIED',
        finalization: !finalized.length ? 'FAILED' : quarantined ? 'LIMITED' : 'VERIFIED',
        provenance: displayedUnattributed > 0 ? 'FAILED' : 'VERIFIED',
        evidenceLineage: foreign ? 'FAILED' : 'VERIFIED',
    };
    const failed = Object.values(criteria).some((status) => status === 'FAILED');
    const limited = Object.values(criteria).some((status) => status === 'LIMITED');
    const authentic = !failed && finalized.length > 0 && !limited;
    return {
        banner: authentic ? 'AUTHENTIC_PACKPROOF' : 'PACKPROOF_RECORD_WITH_LIMITATIONS',
        summary: authentic ? 'PackProof record integrity verified' : 'PackProof record integrity verified with recorded limitations',
        meaning: authentic ? exports.INTEGRITY_MEANING_VERIFIED : exports.INTEGRITY_MEANING_LIMITED,
        criteria,
        manifestAuthentication: {
            type: legacyMac ? 'LEGACY_SERVICE_MAC' : 'SERVICE_MAC',
            algorithm: auth?.algorithm === 'HMAC-SHA256' || !auth?.algorithm ? 'HMAC-SHA256' : 'HMAC-SHA256',
            verificationScope: 'PACKPROOF_SERVICE_ONLY',
            keyId: auth?.keyId ?? null,
            publiclyVerifiable: false,
        },
        canonicalizationProfile: 'PACKPROOF_JCS_1',
        bundleBindingProfile: legacyBundle ? 'LEGACY_V1' : 'PACKPROOF_EVIDENCE_BUNDLE_V2',
    };
}
function fulfillmentEvents(input, packing, seal, label) {
    const events = [];
    const push = (eventId, occurredAt, source, provenanceClass, title, evidenceReference) => {
        if (!occurredAt)
            return;
        events.push({ eventId, occurredAt, source, provenanceClass, title, evidenceReference });
    };
    push('ORDER_CONTEXT', input.commerce?.capturedAt ?? input.transaction.createdAt, input.commerce?.assertingSource ?? 'PACKPROOF_SERVICE', 'SOURCE_ASSERTION', 'Order context recorded', input.commerce?.id ?? input.transaction.id);
    const sessionId = packing?.captureSessionId ?? packing?.evidenceSessionId;
    push('CAPTURE_SESSION_STARTED', packing?.createdAt ?? packing?.clientCreatedAt ?? null, 'PACKPROOF_CAPTURE', 'PACKPROOF_OBSERVATION', 'Capture session started', sessionId ?? null);
    const identifier = firstOf(input.artifacts, (item) => IDENTIFIER.has(item.type) && isFinalized(item));
    const trackingArtifact = firstOf(input.artifacts, (item) => Boolean(item.scannedTrackingNumber) && (isFinalized(item) || isQuarantined(item)));
    push('ITEM_IDENTIFIER_OBSERVED', identifier?.finalizedAt ?? trackingArtifact?.finalizedAt ?? null, 'PACKPROOF_CAPTURE', 'PACKPROOF_OBSERVATION', 'Item identifier observed', identifier?.id ?? trackingArtifact?.id ?? null);
    push('ITEM_PACKED', packing?.finalizedAt ?? null, 'PACKPROOF_CAPTURE', 'PACKPROOF_OBSERVATION', 'Item packed', packing?.id ?? null);
    push('PACKAGE_SEALED', seal?.finalizedAt ?? null, 'PACKPROOF_CAPTURE', 'PACKPROOF_OBSERVATION', 'Package sealed', seal?.id ?? null);
    push('LABEL_OBSERVED', label?.finalizedAt ?? null, 'PACKPROOF_CAPTURE', 'PACKPROOF_OBSERVATION', 'Shipping label observed', label?.id ?? null);
    const firstFinalized = firstOf(input.artifacts, isFinalized);
    push('EVIDENCE_FINALIZED', firstFinalized?.finalizedAt ?? null, 'PACKPROOF_SERVICE', 'INTEGRITY_RESULT', 'Evidence finalized', firstFinalized?.id ?? null);
    push('DELIVERY', input.delivery?.receivedAt ?? null, 'MERCHANT_API', 'SOURCE_ASSERTION', 'Delivery associated', input.delivery?.arrivalEvidenceId ?? null);
    return events;
}
function aggregatePassport(input) {
    const outbound = input.artifacts.filter((item) => !item.returnPassportId);
    const packing = firstOf(outbound, (item) => OUTBOUND_PACKING.has(item.type) && isFinalized(item))
        ?? firstOf(outbound, (item) => OUTBOUND_PACKING.has(item.type));
    const seal = firstOf(outbound, (item) => OUTBOUND_SEAL.has(item.type) && isFinalized(item))
        ?? firstOf(outbound, (item) => OUTBOUND_SEAL.has(item.type));
    const label = firstOf(outbound, (item) => item.type === 'SHIPPING_LABEL' && isFinalized(item))
        ?? firstOf(outbound, (item) => item.type === 'SHIPPING_LABEL');
    const trackingArtifact = firstOf(input.artifacts, (item) => Boolean(item.scannedTrackingNumber));
    const trackerArtifact = firstOf(input.artifacts, (item) => Boolean(item.shippingTracker));
    const arrival = firstOf(outbound, (item) => ARRIVAL.has(item.type) && isFinalized(item))
        ?? firstOf(outbound, (item) => ARRIVAL.has(item.type));
    const unboxing = firstOf(outbound, (item) => UNBOXING.has(item.type) && isFinalized(item))
        ?? firstOf(outbound, (item) => UNBOXING.has(item.type));
    const commerce = input.commerce;
    const platformValue = commerce?.platform ?? input.transaction.sourcePlatform;
    const orderValue = commerce?.externalOrderId ?? input.transaction.externalOrderId;
    const amountValue = commerce?.amount ?? input.transaction.amount;
    const sellerValue = commerce?.externalSellerId ?? input.transaction.externalSellerId;
    const titleValue = commerce?.title ?? input.transaction.title;
    const expectedTracking = input.shipment?.trackingNumber ?? input.transaction.sourceTrackingNumber ?? null;
    const observedTracking = trackingArtifact?.scannedTrackingNumber ?? null;
    const observations = [];
    for (const artifact of input.artifacts.filter((item) => ITEM_CAPTURE.has(item.type) && (isFinalized(item) || isQuarantined(item)))) {
        observations.push(observation('ITEM_CAPTURED', artifact.type, artifact));
    }
    if (observedTracking) {
        observations.push(observation('BARCODE_OBSERVED', observedTracking, trackingArtifact ?? null));
        observations.push(observation('TRACKING_OBSERVED', observedTracking, trackingArtifact ?? null));
    }
    for (const artifact of input.artifacts.filter((item) => CONDITION.has(item.type) && (isFinalized(item) || isQuarantined(item)))) {
        observations.push(observation('CONDITION_IMAGERY', artifact.type, artifact));
    }
    if (packing) {
        observations.push(observation('PACKING_CAPTURE', packing.type, packing));
        observations.push(observation('PACKAGE_INTERIOR', packing.type, packing));
    }
    if (seal)
        observations.push(observation('SEAL_EVENT', seal.type, seal));
    if (label) {
        observations.push(observation('SHIPPING_LABEL', label.shippingTracker?.stillSha256 ?? label.sha256, label, {
            digestSha256: label.shippingTracker?.stillSha256 ?? label.sha256,
        }));
    }
    for (const artifact of input.artifacts.filter((item) => item.appDeviceContextStatus)) {
        observations.push(observation('APP_DEVICE_CONTEXT', artifact.appDeviceContextStatus, artifact));
    }
    const expected = {
        title: sourceFact(titleValue ?? null, commerce, input.transaction, 'title'),
        sku: sourceFact(commerce?.sku ?? null, commerce, input.transaction, 'sku'),
        gtin: sourceFact(commerce?.gtin ?? null, commerce, input.transaction, 'gtin'),
        upc: sourceFact(commerce?.upc ?? null, commerce, input.transaction, 'upc'),
        variant: sourceFact(commerce?.variant ?? null, commerce, input.transaction, 'variant'),
        quantity: sourceFact(commerce?.quantity ?? null, commerce, input.transaction, 'quantity'),
        declaredCondition: sourceFact(commerce?.declaredCondition ?? null, commerce, input.transaction, 'declaredCondition'),
        serialExpected: sourceFact(commerce?.serialNumber ?? null, commerce, input.transaction, 'serialNumber'),
        merchantItemId: sourceFact(commerce?.merchantItemId ?? null, commerce, input.transaction, 'merchantItemId'),
        listingReference: sourceFact(commerce?.listingReference ?? null, commerce, input.transaction, 'listingReference'),
    };
    const comparisons = [
        compareIdentifierAttribute('UPC', expected.upc.value, null),
        compareIdentifierAttribute('GTIN', expected.gtin.value, null),
        compareIdentifierAttribute('SKU', expected.sku.value, null),
        compareIdentifierAttribute('SERIAL', expected.serialExpected.value, null),
        interpretedComparison('QUANTITY', expected.quantity.value === null ? null : String(expected.quantity.value), null),
        interpretedComparison('VARIANT', expected.variant.value, null),
        compareIdentifierAttribute('TRACKING', expectedTracking, observedTracking),
        interpretedComparison('TITLE', expected.title.value, null),
    ];
    const identifierArtifacts = input.artifacts.filter((item) => IDENTIFIER.has(item.type) || Boolean(item.scannedTrackingNumber));
    const packingArtifacts = outbound.filter((item) => OUTBOUND_PACKING.has(item.type));
    const sealArtifacts = outbound.filter((item) => OUTBOUND_SEAL.has(item.type));
    const labelArtifacts = outbound.filter((item) => item.type === 'SHIPPING_LABEL');
    const trackingMismatch = input.artifacts.some((item) => item.carrierTrackingMatchStatus === 'MISMATCH');
    const inventory = exports.inventoryCategories.map((category) => {
        const row = inventoryStateFor(category, {
            hasCommerceSource: Boolean(commerce?.id || input.transaction.externalOrderId || input.transaction.merchantReference),
            unattributed: false,
            identifierArtifacts,
            conditionArtifacts: input.artifacts.filter((item) => CONDITION.has(item.type)),
            packingArtifacts,
            sealArtifacts,
            labelArtifacts,
            trackingObserved: Boolean(observedTracking),
            trackingSupplied: Boolean(expectedTracking),
            trackingMismatch,
            shippingTerms: input.transaction.termsSaleType !== 'LOCAL_HANDOFF',
            deliveryArtifacts: outbound.filter((item) => ARRIVAL.has(item.type) || UNBOXING.has(item.type)),
            receiverArtifacts: outbound.filter((item) => UNBOXING.has(item.type)),
            returnArtifacts: input.artifacts.filter((item) => RETURN_TYPES.has(item.type) || Boolean(item.returnPassportId)),
            hasReturn: input.returns.length > 0,
            shipped: Boolean(input.shipment),
        });
        return { category, state: row.state, artifactIds: row.artifactIds };
    });
    const artifacts = input.artifacts.map((item) => ({
        artifactId: item.id,
        type: item.type,
        source: artifactSource(item),
        capturedAt: item.clientCreatedAt,
        finalizedAt: item.finalizedAt,
        contentType: item.contentType,
        sizeBytes: item.sizeBytes,
        sha256: item.sha256,
        manifestSha256: item.manifestSha256,
        evidenceBundleSha256: item.evidenceBundleSha256,
        finalization: item.finalization,
        evidenceSessionId: item.evidenceSessionId ?? item.captureSessionId,
        shippingTracker: item.shippingTracker ? { ...item.shippingTracker, interpretation: exports.SHIPPING_TRACKER_INTERPRETATION } : null,
    }));
    const derivedTimeline = fulfillmentEvents(input, packing, seal, label);
    const recordedTimeline = input.timeline.map((item) => ({
        eventId: item.id,
        occurredAt: item.occurredAt,
        source: 'PACKPROOF_SERVICE',
        provenanceClass: 'PACKPROOF_OBSERVATION',
        title: item.summary || item.type,
        evidenceReference: null,
    }));
    const timeline = [...derivedTimeline, ...recordedTimeline].sort((left, right) => left.occurredAt.localeCompare(right.occurredAt));
    const destination = fact(null, 'SOURCE_ASSERTION', {
        assertingSource: null,
        trustClass: null,
        recordedAt: null,
        sourceRecordId: null,
        sourceReference: null,
        digestSha256: null,
    });
    const transactionBlock = {
        commerceContextId: commerce?.id ?? input.transaction.commerceContextId,
        platform: sourceFact(platformValue ?? null, commerce, input.transaction, 'platform'),
        externalOrderId: sourceFact(orderValue ?? null, commerce, input.transaction, 'externalOrderId'),
        transactionDate: sourceFact(input.transaction.createdAt, commerce, input.transaction, 'transactionDate'),
        amount: sourceFact(amountValue, commerce, input.transaction, 'amount'),
        sellerReference: sourceFact(sellerValue ?? null, commerce, input.transaction, 'sellerReference'),
        destination,
        itemCount: sourceFact(commerce?.quantity ?? null, commerce, input.transaction, 'itemCount'),
        sourceTrustClass: commerce?.trustLevel ?? (input.transaction.externalOrderId ? 'MERCHANT_SERVER_ATTESTED' : input.transaction.merchantReference ? 'MERCHANT_SERVER_ATTESTED' : null),
        importedAt: commerce?.capturedAt ?? null,
        canonicalPayloadSha256: commerce?.canonicalPayloadSha256 ?? null,
    };
    const displayedUnattributed = [
        transactionBlock.platform,
        transactionBlock.externalOrderId,
        transactionBlock.amount,
        transactionBlock.sellerReference,
        expected.title,
        expected.sku,
        expected.gtin,
        expected.upc,
        expected.serialExpected,
    ].filter((item) => item.value !== null && item.value !== undefined && !item.assertingSource).length;
    const integrity = evaluateIntegrity(input, displayedUnattributed);
    const sourceUpdatedAt = latestIso([
        input.transaction.updatedAt,
        ...input.artifacts.map((item) => item.finalizedAt ?? item.createdAt),
        input.shipment?.shippedAt,
        input.delivery?.receivedAt,
        ...input.returns.map((item) => item.createdAt),
    ]);
    const verificationUrl = `${input.identity.verificationBaseUrl.replace(/\/$/, '')}/passport/${input.identity.displayId}`;
    const provenance = [];
    const pushProv = (field, item) => {
        provenance.push({ field, ...item });
    };
    pushProv('platform', transactionBlock.platform);
    pushProv('externalOrderId', transactionBlock.externalOrderId);
    if (amountValue) {
        pushProv('amount.currency', fact(amountValue.currency, transactionBlock.amount.provenanceClass, transactionBlock.amount));
        pushProv('amount.minorUnits', fact(amountValue.minorUnits, transactionBlock.amount.provenanceClass, transactionBlock.amount));
    }
    if (observedTracking)
        pushProv('trackingObserved', fact(observedTracking, 'PACKPROOF_OBSERVATION', { assertingSource: 'PACKPROOF_CAPTURE', trustClass: 'PACKPROOF_CAPTURE', sourceRecordId: trackingArtifact?.id ?? null }));
    if (expectedTracking)
        pushProv('trackingSupplied', fact(expectedTracking, 'SOURCE_ASSERTION', { assertingSource: 'MERCHANT_API', trustClass: 'MERCHANT_SERVER_ATTESTED', sourceRecordId: input.transaction.id }));
    const weight = commerce?.declaredWeightGrams ?? input.transaction.declaredWeightGrams;
    if (weight !== null && weight !== undefined) {
        pushProv('declaredWeightGrams', fact(weight, 'SOURCE_ASSERTION', {
            assertingSource: commerce?.assertingSource ?? 'MERCHANT_API',
            trustClass: commerce?.trustLevel ?? 'MERCHANT_SERVER_ATTESTED',
            sourceRecordId: commerce?.id ?? input.transaction.id,
        }));
    }
    const shipment = input.shipment ? {
        carrier: fact(input.shipment.carrier, 'SOURCE_ASSERTION', { assertingSource: 'MERCHANT_API', trustClass: 'MERCHANT_SERVER_ATTESTED', recordedAt: input.shipment.createdAt, sourceRecordId: input.transaction.id }),
        trackingSupplied: fact(input.shipment.trackingNumber, 'SOURCE_ASSERTION', { assertingSource: 'MERCHANT_API', trustClass: 'MERCHANT_SERVER_ATTESTED', recordedAt: input.shipment.createdAt, sourceRecordId: input.transaction.id }),
        trackingObserved: fact(observedTracking, observedTracking ? 'PACKPROOF_OBSERVATION' : 'SOURCE_ASSERTION', {
            assertingSource: observedTracking ? 'PACKPROOF_CAPTURE' : null,
            trustClass: observedTracking ? 'PACKPROOF_CAPTURE' : null,
            sourceRecordId: trackingArtifact?.id ?? null,
        }),
        trackingThirdParty: fact(null, 'THIRD_PARTY_ASSERTION', { assertingSource: null, trustClass: null }),
        labelObservedByPackProof: Boolean(label && isFinalized(label)),
        associatedAt: input.shipment.shippedAt ?? input.shipment.createdAt,
        packingEvidenceId: input.shipment.packingEvidenceId,
        sealEvidenceId: input.shipment.sealEvidenceId,
    } : null;
    const delivery = input.delivery ? {
        carrier: fact(input.delivery.carrier, 'SOURCE_ASSERTION', { assertingSource: 'MERCHANT_API', trustClass: 'MERCHANT_SERVER_ATTESTED', recordedAt: input.delivery.receivedAt }),
        trackingNumber: fact(input.delivery.trackingNumber, 'SOURCE_ASSERTION', { assertingSource: 'MERCHANT_API', trustClass: 'MERCHANT_SERVER_ATTESTED', recordedAt: input.delivery.receivedAt }),
        receivedAt: fact(input.delivery.receivedAt, 'SOURCE_ASSERTION', { assertingSource: 'MERCHANT_API', trustClass: 'MERCHANT_SERVER_ATTESTED', recordedAt: input.delivery.receivedAt }),
        arrivalArtifactId: input.delivery.arrivalEvidenceId,
        signatureAvailable: false,
        deliveryPhotoAvailable: Boolean(arrival),
    } : null;
    const receiver = arrival || unboxing ? {
        arrivalArtifactId: arrival?.id ?? null,
        unboxingArtifactId: unboxing?.id ?? null,
        observedAt: unboxing?.finalizedAt ?? arrival?.finalizedAt ?? null,
    } : null;
    return {
        object: exports.PASSPORT_OBJECT,
        schemaVersion: 1,
        identity: {
            passportId: input.identity.passportId,
            displayId: input.identity.displayId,
            schemaVersion: 1,
            rendererCompatibility: 'PASSPORT_WEB_V1',
            transactionId: input.transaction.id,
            state: 'CURRENT',
            issuedAt: input.identity.issuedAt,
            sourceUpdatedAt,
            merchantPlatform: platformValue ?? null,
            externalOrderId: orderValue ?? null,
            verificationUrl,
            qrPayload: verificationUrl,
        },
        integrity,
        transaction: transactionBlock,
        items: [{ index: 0, expected, observations, comparisons }],
        fulfillment: {
            captureSessionId: packing?.captureSessionId ?? packing?.evidenceSessionId ?? null,
            packingArtifactId: packing?.id ?? null,
            sealArtifactId: seal?.id ?? null,
            labelArtifactId: label?.id ?? null,
            trackingObserved: fact(observedTracking, observedTracking ? 'PACKPROOF_OBSERVATION' : 'PACKPROOF_OBSERVATION', {
                assertingSource: observedTracking ? 'PACKPROOF_CAPTURE' : null,
                trustClass: observedTracking ? 'PACKPROOF_CAPTURE' : null,
                sourceRecordId: trackingArtifact?.id ?? null,
            }),
            shippingTracker: fact(trackerValue(trackerArtifact), trackerArtifact ? 'PACKPROOF_OBSERVATION' : 'PACKPROOF_OBSERVATION', {
                assertingSource: trackerArtifact ? 'PACKPROOF_CAPTURE' : null,
                trustClass: trackerArtifact ? 'PACKPROOF_CAPTURE' : null,
                sourceRecordId: trackerArtifact?.id ?? null,
                digestSha256: trackerArtifact?.shippingTracker?.observationSha256 ?? null,
            }),
        },
        shipment,
        delivery,
        receiver,
        returns: input.returns.map((item) => ({
            returnPassportId: item.id,
            status: item.status,
            reason: item.reason,
            packingArtifactId: item.packingEvidenceId,
            sealArtifactId: item.sealEvidenceId,
            trackingSupplied: fact(item.shippingTrackingNumber, 'SOURCE_ASSERTION', {
                assertingSource: 'MERCHANT_API',
                trustClass: 'MERCHANT_SERVER_ATTESTED',
                sourceRecordId: item.id,
            }),
        })),
        evidenceInventory: inventory,
        artifacts,
        timeline,
        reviewContext: reviewContext(input.reviewQuery, inventory),
        provenance,
        limitations: {
            physicalCorrespondence: 'NOT_AVAILABLE',
            businessLegalRelevance: 'REVIEW_REQUIRED',
            doesNotAuthenticateItem: true,
            doesNotProveCustody: true,
            doesNotDecideFraudOrFault: true,
            doesNotGuaranteeDisputeOutcome: true,
            absenceOfEvidenceDoesNotAffectAuthenticity: true,
            noEvidentiaryWeightScore: true,
            presentationExportIsNotSource: true,
            manifestAuthenticationScope: 'PACKPROOF_SERVICE_ONLY',
            shippingTrackerInterpretation: exports.SHIPPING_TRACKER_INTERPRETATION,
            humanReviewDisclaimer: input.humanReviewDisclaimer,
        },
        createdAt: input.identity.issuedAt,
        updatedAt: sourceUpdatedAt,
    };
}
function verificationUrlFor(displayId, baseUrl) {
    return `${baseUrl.replace(/\/$/, '')}/passport/${displayId}`;
}
//# sourceMappingURL=passport.js.map