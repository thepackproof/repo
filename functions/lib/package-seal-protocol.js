"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HUMAN_REVIEW_DISCLAIMER = void 0;
exports.groupPackageSealObservations = groupPackageSealObservations;
exports.HUMAN_REVIEW_DISCLAIMER = 'These observations are preserved for authorized human review. Visible similarity or difference in the mark, tape, seams, label, or cardboard is contextual only. PackProof does not state that the package is the same or different, identify a cause or actor, or determine authenticity, custody, fraud, fault, liability, or any commercial or legal outcome.';
function groupPackageSealObservations(evidence) {
    return {
        sellerReference: evidence.filter((item) => ((item.type === 'PACKING_VIDEO' || item.type === 'SHIPPING_LABEL') && !item.returnPassportId)),
        buyerArrival: evidence.filter((item) => ((item.type === 'DELIVERY_PHOTO' || item.type === 'UNBOXING_VIDEO') && !item.returnPassportId)),
        returnReference: evidence.filter((item) => (item.type === 'RETURN_PACKING_VIDEO' || item.type === 'RETURN_SHIPPING_LABEL')),
        returnArrival: evidence.filter((item) => item.type === 'RETURN_UNBOXING_VIDEO'),
    };
}
//# sourceMappingURL=package-seal-protocol.js.map