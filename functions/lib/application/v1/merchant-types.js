"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.captureArtifactTypes = exports.merchantTransactionStatuses = exports.apiScopes = void 0;
exports.apiScopes = [
    'transactions:read',
    'transactions:write',
    'participant_claims:write',
    'evidence:read',
    'evidence:write',
    'verification:read',
    'shipments:read',
    'shipments:write',
    'webhooks:read',
    'webhooks:write',
    'support:read',
    'support:write',
    'admin:organization',
];
exports.merchantTransactionStatuses = [
    'CREATED',
    'CAPTURE_PENDING',
    'CAPTURE_IN_PROGRESS',
    'EVIDENCE_RECEIVED',
    'VERIFICATION_PENDING',
    'COMPLETED',
    'CANCELLED',
];
exports.captureArtifactTypes = [
    'ITEM_PHOTO',
    'CONDITION_PHOTO',
    'IDENTIFIER_PHOTO',
    'PACKING_VIDEO',
    'SHIPPING_LABEL',
    'UNBOXING_VIDEO',
    'DELIVERY_PHOTO',
    'SUPPORTING_DOCUMENT',
];
//# sourceMappingURL=merchant-types.js.map