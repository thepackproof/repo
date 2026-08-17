"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.barcodeClassifications = exports.weightStableEventSchema = exports.barcodeObservedEventSchema = exports.edgeRequestBindingSchema = exports.edgeQueueFolderForTransport = exports.edgeTransportStates = exports.edgeAcquisitionAssurances = exports.edgeQueueFolders = exports.wmsEventTypes = exports.hardwareEventTypes = void 0;
exports.syncLabelForQueueObject = syncLabelForQueueObject;
exports.uploadSuccessIsServerFinalization = uploadSuccessIsServerFinalization;
exports.classifyBarcode = classifyBarcode;
exports.edgeRequestSignedPayload = edgeRequestSignedPayload;
exports.edgeSpoolAad = edgeSpoolAad;
exports.edgeCapabilityAllows = edgeCapabilityAllows;
exports.assertOpenEndedEdgeCapabilityRejected = assertOpenEndedEdgeCapabilityRejected;
const runtime_1 = require("./runtime");
const enterprise_1 = require("./enterprise");
const common_1 = require("./common");
exports.hardwareEventTypes = [
    'BARCODE_OBSERVED',
    'WEIGHT_STABLE',
    'VIDEO_STREAM_AVAILABLE',
    'CAPTURE_STARTED',
    'CAPTURE_SEGMENT_FINALIZED',
    'STILL_CAPTURED',
    'STREAM_INTERRUPTED',
];
exports.wmsEventTypes = ['ORDER_ASSIGNED', 'ORDER_UNASSIGNED'];
exports.edgeQueueFolders = ['pending', 'uploading', 'awaiting-finalization', 'finalized', 'attention'];
exports.edgeAcquisitionAssurances = ['ONLINE_ASSURED', 'OFFLINE_CAPTURED'];
exports.edgeTransportStates = ['PENDING', 'UPLOADING', 'AWAITING_FINALIZATION', 'SERVER_FINALIZED', 'ATTENTION'];
exports.edgeQueueFolderForTransport = {
    PENDING: 'pending',
    UPLOADING: 'uploading',
    AWAITING_FINALIZATION: 'awaiting-finalization',
    SERVER_FINALIZED: 'finalized',
    ATTENTION: 'attention',
};
function syncLabelForQueueObject(object) {
    if (object.transportState === 'SERVER_FINALIZED')
        return 'SERVER_FINALIZED';
    if (object.transportState === 'AWAITING_FINALIZATION')
        return 'SYNCED';
    if (object.acquisitionAssurance === 'OFFLINE_CAPTURED' && (object.transportState === 'PENDING' || object.transportState === 'UPLOADING')) {
        return 'OFFLINE_PENDING_SYNC';
    }
    return object.acquisitionAssurance;
}
function uploadSuccessIsServerFinalization() {
    return false;
}
exports.edgeRequestBindingSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'edgeRequest', [
        'organizationId', 'siteId', 'edgeAgentId', 'stationId', 'sessionId', 'requestId', 'timestamp', 'nonce',
    ]);
    return {
        organizationId: (0, common_1.parseResourceId)('organization', input.organizationId, 'edgeRequest.organizationId'),
        siteId: (0, enterprise_1.parseEnterpriseResourceId)('enterprise_site', input.siteId, 'edgeRequest.siteId'),
        edgeAgentId: (0, enterprise_1.parseEnterpriseResourceId)('edge_agent', input.edgeAgentId, 'edgeRequest.edgeAgentId'),
        stationId: (0, enterprise_1.parseEnterpriseResourceId)('packing_station', input.stationId, 'edgeRequest.stationId'),
        sessionId: input.sessionId === undefined || input.sessionId === null
            ? null
            : (0, enterprise_1.parseEnterpriseResourceId)('fulfillment_session', input.sessionId, 'edgeRequest.sessionId'),
        requestId: (0, runtime_1.stringValue)(input.requestId, 'edgeRequest.requestId', { min: 8, max: 160, pattern: /^[A-Za-z0-9._:-]+$/ }),
        timestamp: (0, runtime_1.isoDateTime)(input.timestamp, 'edgeRequest.timestamp'),
        nonce: (0, runtime_1.stringValue)(input.nonce, 'edgeRequest.nonce', { min: 16, max: 128, pattern: /^[A-Za-z0-9_-]+$/ }),
    };
});
exports.barcodeObservedEventSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'barcodeObserved', [
        'type', 'format', 'normalizedValue', 'rawValueHash', 'deviceId', 'stationId', 'monotonicTimestamp',
        'wallClockUtc', 'bootId', 'eventSequence',
    ]);
    (0, runtime_1.literalValue)(input.type, 'barcodeObserved.type', 'BARCODE_OBSERVED');
    return {
        type: 'BARCODE_OBSERVED',
        format: (0, runtime_1.stringValue)(input.format, 'barcodeObserved.format', { min: 2, max: 40, pattern: /^[A-Za-z0-9_-]+$/ }),
        normalizedValue: (0, runtime_1.stringValue)(input.normalizedValue, 'barcodeObserved.normalizedValue', { min: 1, max: 160 }),
        rawValueHash: (0, runtime_1.sha256Value)(input.rawValueHash, 'barcodeObserved.rawValueHash'),
        deviceId: (0, runtime_1.stringValue)(input.deviceId, 'barcodeObserved.deviceId', { min: 2, max: 160 }),
        stationId: (0, runtime_1.stringValue)(input.stationId, 'barcodeObserved.stationId', { min: 2, max: 160 }),
        monotonicTimestamp: (0, runtime_1.integerValue)(input.monotonicTimestamp, 'barcodeObserved.monotonicTimestamp', 0, Number.MAX_SAFE_INTEGER),
        wallClockUtc: (0, runtime_1.isoDateTime)(input.wallClockUtc, 'barcodeObserved.wallClockUtc'),
        bootId: (0, runtime_1.stringValue)(input.bootId, 'barcodeObserved.bootId', { min: 8, max: 80, pattern: /^[A-Za-z0-9._:-]+$/ }),
        eventSequence: (0, runtime_1.integerValue)(input.eventSequence, 'barcodeObserved.eventSequence', 1, Number.MAX_SAFE_INTEGER),
    };
});
exports.weightStableEventSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'weightStable', [
        'type', 'grams', 'deviceId', 'measurementSequence', 'monotonicTimestamp', 'wallClockUtc', 'bootId', 'eventSequence',
    ]);
    (0, runtime_1.literalValue)(input.type, 'weightStable.type', 'WEIGHT_STABLE');
    return {
        type: 'WEIGHT_STABLE',
        grams: (0, runtime_1.integerValue)(input.grams, 'weightStable.grams', 0, 1_000_000_000),
        deviceId: (0, runtime_1.stringValue)(input.deviceId, 'weightStable.deviceId', { min: 2, max: 160 }),
        measurementSequence: (0, runtime_1.integerValue)(input.measurementSequence, 'weightStable.measurementSequence', 1, 1_000_000_000),
        monotonicTimestamp: (0, runtime_1.integerValue)(input.monotonicTimestamp, 'weightStable.monotonicTimestamp', 0, Number.MAX_SAFE_INTEGER),
        wallClockUtc: (0, runtime_1.isoDateTime)(input.wallClockUtc, 'weightStable.wallClockUtc'),
        bootId: (0, runtime_1.stringValue)(input.bootId, 'weightStable.bootId', { min: 8, max: 80, pattern: /^[A-Za-z0-9._:-]+$/ }),
        eventSequence: (0, runtime_1.integerValue)(input.eventSequence, 'weightStable.eventSequence', 1, Number.MAX_SAFE_INTEGER),
    };
});
exports.barcodeClassifications = [
    'EXPECTED_ITEM',
    'EXPECTED_TRACKING',
    'UNEXPECTED_ITEM',
    'UNEXPECTED_TRACKING',
    'UNRECOGNIZED',
];
function looksLikeTracking(value) {
    return /^1Z[A-Z0-9]+$/i.test(value);
}
function classifyBarcode(normalizedValue, expectedSkus, expectedTrackingNumber) {
    if (expectedTrackingNumber && normalizedValue === expectedTrackingNumber) {
        return { classification: 'EXPECTED_TRACKING', matchStatus: 'MATCHED', observationType: 'TRACKING_BARCODE_OBSERVATION' };
    }
    if (expectedSkus.includes(normalizedValue)) {
        return { classification: 'EXPECTED_ITEM', matchStatus: 'MATCHED', observationType: 'ITEM_BARCODE_OBSERVATION' };
    }
    if (expectedTrackingNumber && looksLikeTracking(normalizedValue)) {
        return { classification: 'UNEXPECTED_TRACKING', matchStatus: 'MISMATCH', observationType: 'TRACKING_BARCODE_OBSERVATION' };
    }
    if (expectedSkus.length) {
        return { classification: 'UNEXPECTED_ITEM', matchStatus: 'MISMATCH', observationType: 'ITEM_BARCODE_OBSERVATION' };
    }
    return { classification: 'UNRECOGNIZED', matchStatus: 'NOT_APPLICABLE', observationType: 'ITEM_BARCODE_OBSERVATION' };
}
function edgeRequestSignedPayload(binding, bodySha256) {
    return Buffer.from([
        'packproof-edge-request-v1',
        binding.organizationId,
        binding.siteId,
        binding.edgeAgentId,
        binding.stationId,
        binding.sessionId ?? '',
        binding.requestId,
        binding.timestamp,
        binding.nonce,
        bodySha256,
    ].join('\n'));
}
function edgeSpoolAad(input) {
    return Buffer.from([
        'packproof-edge-spool-aad-v1',
        input.clientEvidenceId,
        input.fulfillmentSessionId,
        input.artifactType,
        input.plaintextSha256,
        String(input.sizeBytes),
        input.acquisitionAssurance,
    ].join('\n'));
}
function edgeCapabilityAllows(scope, input) {
    return scope.organizationId === input.organizationId
        && scope.siteId === input.siteId
        && scope.stationId === input.stationId
        && scope.edgeAgentId === input.edgeAgentId
        && scope.transactionId === input.transactionId
        && scope.allowedDeviceIds.includes(input.deviceId)
        && scope.allowedArtifactTypes.includes(input.artifactType)
        && input.artifactCount < scope.maxArtifacts
        && Date.parse(input.now) <= Date.parse(scope.captureWindowEndsAt);
}
function assertOpenEndedEdgeCapabilityRejected(scope) {
    const unbounded = !scope.transactionId
        || !scope.stationId
        || !scope.allowedArtifactTypes?.length
        || !scope.allowedDeviceIds?.length
        || !scope.maxArtifacts
        || !scope.captureWindowEndsAt
        || !scope.policyId;
    if (unbounded) {
        throw new Error('Enterprise evidence sessions must be bound to organization, site, station, Edge agent, transaction, devices, artifact types, max artifacts, capture window, and policy.');
    }
}
//# sourceMappingURL=edge-protocol.js.map