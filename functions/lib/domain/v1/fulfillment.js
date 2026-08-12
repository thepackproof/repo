"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.returnPassportDtoSchema = exports.returnPassportTransitions = exports.returnPassportStatuses = exports.shipmentDtoSchema = exports.carrierAssertionSources = exports.shipmentTransitions = exports.shipmentStatuses = void 0;
exports.returnSnapshotDocumentsDigitalHistoryOnly = returnSnapshotDocumentsDigitalHistoryOnly;
exports.shipmentHasExternalCustodyProof = shipmentHasExternalCustodyProof;
exports.normalizeCarrierLabel = normalizeCarrierLabel;
const common_1 = require("./common");
const runtime_1 = require("./runtime");
exports.shipmentStatuses = ['PENDING', 'PACKED', 'IN_TRANSIT', 'DELIVERED', 'RECEIVER_REVIEW', 'COMPLETED', 'DISPUTED', 'CANCELLED'];
exports.shipmentTransitions = {
    PENDING: ['PACKED', 'IN_TRANSIT', 'CANCELLED'],
    PACKED: ['IN_TRANSIT', 'CANCELLED'],
    IN_TRANSIT: ['DELIVERED', 'DISPUTED'],
    DELIVERED: ['RECEIVER_REVIEW', 'COMPLETED', 'DISPUTED'],
    RECEIVER_REVIEW: ['COMPLETED', 'DISPUTED'],
    COMPLETED: ['DISPUTED'],
    DISPUTED: ['COMPLETED', 'CANCELLED'],
    CANCELLED: [],
};
exports.carrierAssertionSources = ['PARTICIPANT', 'MERCHANT', 'PLATFORM_ADAPTER', 'CARRIER_ADAPTER', 'PACKPROOF_BARCODE_OBSERVATION'];
exports.shipmentDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'shipment', [
        'id', 'object', 'schemaVersion', 'transactionId', 'carrier', 'trackingNumber', 'assertionSource', 'status',
        'packingEvidenceSessionId', 'receiverEvidenceSessionId', 'shippedAt', 'deliveredAt', 'createdAt', 'updatedAt',
    ]);
    (0, runtime_1.literalValue)(input.object, 'shipment.object', 'shipment');
    (0, runtime_1.literalValue)(input.schemaVersion, 'shipment.schemaVersion', 1);
    return {
        id: (0, common_1.parseResourceId)('shipment', input.id, 'shipment.id'),
        object: 'shipment',
        schemaVersion: 1,
        transactionId: (0, common_1.parseResourceId)('transaction', input.transactionId, 'shipment.transactionId', { allowLegacy: true }),
        carrier: (0, runtime_1.stringValue)(input.carrier, 'shipment.carrier', { min: 1, max: 120 }),
        trackingNumber: (0, runtime_1.stringValue)(input.trackingNumber, 'shipment.trackingNumber', { min: 3, max: 160 }),
        assertionSource: (0, runtime_1.enumValue)(input.assertionSource, 'shipment.assertionSource', exports.carrierAssertionSources),
        status: (0, runtime_1.enumValue)(input.status, 'shipment.status', exports.shipmentStatuses),
        packingEvidenceSessionId: input.packingEvidenceSessionId === undefined || input.packingEvidenceSessionId === null ? null : (0, common_1.parseResourceId)('evidence_session', input.packingEvidenceSessionId, 'shipment.packingEvidenceSessionId'),
        receiverEvidenceSessionId: input.receiverEvidenceSessionId === undefined || input.receiverEvidenceSessionId === null ? null : (0, common_1.parseResourceId)('evidence_session', input.receiverEvidenceSessionId, 'shipment.receiverEvidenceSessionId'),
        shippedAt: (0, runtime_1.optionalIsoDateTime)(input.shippedAt, 'shipment.shippedAt'),
        deliveredAt: (0, runtime_1.optionalIsoDateTime)(input.deliveredAt, 'shipment.deliveredAt'),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'shipment.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'shipment.updatedAt'),
    };
});
exports.returnPassportStatuses = ['REQUESTED', 'AUTHORIZED', 'PACKED', 'IN_TRANSIT', 'RECEIVED_REVIEW', 'COMPLETED', 'CANCELLED', 'DISPUTED'];
exports.returnPassportTransitions = {
    REQUESTED: ['AUTHORIZED', 'CANCELLED', 'DISPUTED'],
    AUTHORIZED: ['PACKED', 'CANCELLED', 'DISPUTED'],
    PACKED: ['IN_TRANSIT', 'CANCELLED', 'DISPUTED'],
    IN_TRANSIT: ['RECEIVED_REVIEW', 'DISPUTED'],
    RECEIVED_REVIEW: ['COMPLETED', 'DISPUTED'],
    COMPLETED: ['DISPUTED'],
    CANCELLED: [],
    DISPUTED: ['COMPLETED', 'CANCELLED'],
};
exports.returnPassportDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'returnPassport', [
        'id', 'object', 'schemaVersion', 'transactionId', 'reason', 'status', 'originalEvidenceHashes', 'shipmentId',
        'authorizedAt', 'completedAt', 'createdAt', 'updatedAt',
    ]);
    (0, runtime_1.literalValue)(input.object, 'returnPassport.object', 'return_passport');
    (0, runtime_1.literalValue)(input.schemaVersion, 'returnPassport.schemaVersion', 1);
    return {
        id: (0, common_1.parseResourceId)('return_passport', input.id, 'returnPassport.id', { allowLegacy: true }),
        object: 'return_passport',
        schemaVersion: 1,
        transactionId: (0, common_1.parseResourceId)('transaction', input.transactionId, 'returnPassport.transactionId', { allowLegacy: true }),
        reason: (0, runtime_1.stringValue)(input.reason, 'returnPassport.reason', { min: 1, max: 5000, trim: false }),
        status: (0, runtime_1.enumValue)(input.status, 'returnPassport.status', exports.returnPassportStatuses),
        originalEvidenceHashes: (0, runtime_1.arrayValue)(input.originalEvidenceHashes, 'returnPassport.originalEvidenceHashes', { max: 1000, parse: (hash, path) => (0, runtime_1.stringValue)(hash, path, { min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ }), uniqueBy: (hash) => hash }),
        shipmentId: input.shipmentId === undefined || input.shipmentId === null ? null : (0, common_1.parseResourceId)('shipment', input.shipmentId, 'returnPassport.shipmentId'),
        authorizedAt: (0, runtime_1.optionalIsoDateTime)(input.authorizedAt, 'returnPassport.authorizedAt'),
        completedAt: (0, runtime_1.optionalIsoDateTime)(input.completedAt, 'returnPassport.completedAt'),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'returnPassport.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'returnPassport.updatedAt'),
    };
});
function returnSnapshotDocumentsDigitalHistoryOnly(returnPassport) {
    return returnPassport.originalEvidenceHashes.length > 0;
}
function shipmentHasExternalCustodyProof(_shipment) {
    return false;
}
function normalizeCarrierLabel(value) {
    return (0, runtime_1.optionalString)(value, 'carrier', { min: 1, max: 120 });
}
//# sourceMappingURL=fulfillment.js.map