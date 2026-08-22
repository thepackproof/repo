"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.finalizationOutcomeFromIntegrity = finalizationOutcomeFromIntegrity;
exports.mutationNeverFinalizes = mutationNeverFinalizes;
function finalizationOutcomeFromIntegrity(input) {
    if (input.bytesMutatedAfterClientHash)
        return 'QUARANTINED';
    if (input.clientHashMatched === false)
        return 'QUARANTINED';
    if (input.clientSizeMatched === false)
        return 'QUARANTINED';
    if (!input.contentTypeMatched)
        return 'QUARANTINED';
    return 'FINALIZED';
}
function mutationNeverFinalizes(kind) {
    void kind;
    return 'QUARANTINED';
}
//# sourceMappingURL=finalization-outcome.js.map