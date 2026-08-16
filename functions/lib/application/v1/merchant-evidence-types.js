"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.merchantConnectSessionStatuses = exports.reviewDocumentationCategories = exports.protocolPresenceStates = exports.merchantEvidenceStatuses = void 0;
exports.merchantEvidenceStatuses = ['RESERVED', 'UPLOADED', 'FINALIZED', 'QUARANTINED', 'FAILED'];
exports.protocolPresenceStates = ['ABSENT', 'PRESENT', 'PRESENT_WITH_LIMITATIONS'];
exports.reviewDocumentationCategories = [
    'TERMS_AND_CONDITIONS',
    'ITEM_AND_ORDER_DESCRIPTION',
    'PACKING_AND_SEAL_REFERENCE',
    'ARRIVAL_OR_DELIVERY_OBSERVATION',
    'RETURN_DOCUMENTATION',
    'HASHED_EVIDENCE_INVENTORY',
    'AUDIT_TIMELINE',
];
exports.merchantConnectSessionStatuses = [
    'PENDING_REDEMPTION',
    'READY_FOR_CAPTURE',
    'CANCELLED',
    'EXPIRED',
];
//# sourceMappingURL=merchant-evidence-types.js.map