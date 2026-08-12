"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.returnPassportStatuses = exports.evidenceTypes = exports.transactionStatuses = void 0;
exports.transactionStatuses = [
    'DRAFT',
    'AWAITING_BUYER',
    'TERMS_REVIEW',
    'TERMS_LOCKED',
    'PACKED',
    'SHIPPED',
    'BUYER_REVIEW',
    'COMPLETED',
    'DISPUTED',
    'CANCELLED',
    'ARCHIVED',
];
exports.evidenceTypes = [
    'ITEM_PHOTO',
    'CONDITION_PHOTO',
    'IDENTIFIER_PHOTO',
    'COA_PHOTO',
    'PACKING_VIDEO',
    'SHIPPING_LABEL',
    'UNBOXING_VIDEO',
    'DELIVERY_PHOTO',
    'SUPPORTING_DOCUMENT',
    'RETURN_CONDITION_PHOTO',
    'RETURN_PACKING_VIDEO',
    'RETURN_SHIPPING_LABEL',
    'RETURN_UNBOXING_VIDEO',
    'PHYSICAL_REFERENCE_FRAME',
    'PHYSICAL_VERIFICATION_FRAME',
];
exports.returnPassportStatuses = [
    'REQUESTED',
    'AUTHORIZED',
    'PACKED',
    'IN_TRANSIT',
    'RECEIVED_REVIEW',
    'COMPLETED',
    'CANCELLED',
    'DISPUTED',
];
//# sourceMappingURL=types.js.map