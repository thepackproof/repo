"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SHIPMENT_PRECONDITION_MESSAGES = exports.HUMAN_REVIEW_DISCLAIMER = void 0;
exports.evidenceReadyForWorkflow = evidenceReadyForWorkflow;
exports.shipmentEvidenceDecision = shipmentEvidenceDecision;
exports.groupPackageSealObservations = groupPackageSealObservations;
exports.HUMAN_REVIEW_DISCLAIMER = 'These observations are preserved for authorized human review. Visible similarity or difference in the mark, tape, seams, label, or cardboard is contextual only. PackProof does not state that the package is the same or different, identify a cause or actor, or determine authenticity, custody, fraud, fault, liability, or any commercial or legal outcome.';
exports.SHIPMENT_PRECONDITION_MESSAGES = {
    PACKING_VIDEO: 'A server-finalized packing video with no recorded byte-integrity mismatch is required before shipment can be recorded.',
    SEAL_REFERENCE: 'A server-finalized high-resolution seal reference photograph with no recorded byte-integrity mismatch is required before shipment can be recorded.',
    RETURN_PACKING_VIDEO: 'A server-finalized return repacking video with no recorded byte-integrity mismatch is required first.',
    RETURN_SEAL_REFERENCE: 'A server-finalized high-resolution return seal reference photograph with no recorded byte-integrity mismatch is required first.',
    ARRIVAL_OBSERVATION: 'A server-finalized arrival photograph with no recorded byte-integrity mismatch is required before delivery can be associated.',
};
function evidenceReadyForWorkflow(value) {
    if (!value)
        return false;
    if (value.serverFinalized === true) {
        return value.clientHashMatched !== false
            && value.clientSizeMatched !== false
            && value.contentTypeMatched !== false
            && value.assurance?.byteIntegrity?.status !== 'MISMATCH';
    }
    return value.serverVerified === true && value.clientHashMatched !== false;
}
function shipmentEvidenceDecision(input) {
    const kind = input.kind ?? 'outbound';
    if (!input.packingReady)
        return { ok: false, missing: kind === 'return' ? 'RETURN_PACKING_VIDEO' : 'PACKING_VIDEO' };
    if (!input.sealReady)
        return { ok: false, missing: kind === 'return' ? 'RETURN_SEAL_REFERENCE' : 'SEAL_REFERENCE' };
    return { ok: true };
}
function groupPackageSealObservations(evidence) {
    return {
        sellerReference: evidence.filter((item) => ((item.type === 'PACKING_VIDEO' || item.type === 'SHIPPING_LABEL') && !item.returnPassportId)),
        buyerArrival: evidence.filter((item) => ((item.type === 'DELIVERY_PHOTO' || item.type === 'UNBOXING_VIDEO') && !item.returnPassportId)),
        returnReference: evidence.filter((item) => (item.type === 'RETURN_PACKING_VIDEO' || item.type === 'RETURN_SHIPPING_LABEL')),
        returnArrival: evidence.filter((item) => item.type === 'RETURN_UNBOXING_VIDEO'),
    };
}
//# sourceMappingURL=package-seal-protocol.js.map