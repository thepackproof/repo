"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HC1_SCIENTIFIC_GATE = void 0;
exports.scientificGatePassed = scientificGatePassed;
exports.physicalCorrespondenceStatus = physicalCorrespondenceStatus;
exports.rejectModelMatchShortcut = rejectModelMatchShortcut;
exports.HC1_SCIENTIFIC_GATE = {
    frozenModelId: null,
    frozenEvaluationCriteria: false,
    documentedEligibleInputs: false,
    falsePositiveAnalysis: false,
    independentEvaluation: false,
    versionedModelIdentity: false,
    humanReviewLanguage: true,
};
function scientificGatePassed(gate) {
    return Boolean(gate.frozenModelId
        && gate.frozenEvaluationCriteria
        && gate.documentedEligibleInputs
        && gate.falsePositiveAnalysis
        && gate.independentEvaluation
        && gate.versionedModelIdentity
        && gate.humanReviewLanguage);
}
function physicalCorrespondenceStatus(gate = exports.HC1_SCIENTIFIC_GATE) {
    if (!scientificGatePassed(gate))
        return 'NOT_AVAILABLE';
    return 'NOT_AVAILABLE';
}
function rejectModelMatchShortcut(modelOutput) {
    const forbidden = /^(MATCH|NON_MATCH|AUTHENTIC|FRAUD)$/i;
    if (forbidden.test(modelOutput.trim())) {
        throw new Error('Model output cannot become a physical MATCH or authenticity verdict.');
    }
}
//# sourceMappingURL=scientific-gate.js.map