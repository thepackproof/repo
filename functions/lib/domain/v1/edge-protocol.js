"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.weightStableEventSchema = exports.barcodeObservedEventSchema = exports.edgeRequestBindingSchema = exports.edgeQueueFolderForTransport = exports.edgeTransportStates = exports.edgeAcquisitionAssurances = exports.edgeQueueFolders = exports.wmsEventTypes = exports.hardwareEventTypes = void 0;
exports.syncLabelForQueueObject = syncLabelForQueueObject;
exports.uploadSuccessIsServerFinalization = uploadSuccessIsServerFinalization;
exports.classifyBarcode = classifyBarcode;
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
    };
});
exports.weightStableEventSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'weightStable', ['type', 'grams', 'deviceId', 'measurementSequence', 'monotonicTimestamp']);
    (0, runtime_1.literalValue)(input.type, 'weightStable.type', 'WEIGHT_STABLE');
    return {
        type: 'WEIGHT_STABLE',
        grams: (0, runtime_1.integerValue)(input.grams, 'weightStable.grams', 0, 1_000_000_000),
        deviceId: (0, runtime_1.stringValue)(input.deviceId, 'weightStable.deviceId', { min: 2, max: 160 }),
        measurementSequence: (0, runtime_1.integerValue)(input.measurementSequence, 'weightStable.measurementSequence', 1, 1_000_000_000),
        monotonicTimestamp: (0, runtime_1.integerValue)(input.monotonicTimestamp, 'weightStable.monotonicTimestamp', 0, Number.MAX_SAFE_INTEGER),
    };
});
function classifyBarcode(normalizedValue, expectedSkus, expectedTrackingNumber) {
    if (expectedTrackingNumber && normalizedValue === expectedTrackingNumber)
        return 'TRACKING_OBSERVED';
    if (expectedSkus.includes(normalizedValue))
        return 'ITEM_OBSERVED';
    return 'UNRECOGNIZED';
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