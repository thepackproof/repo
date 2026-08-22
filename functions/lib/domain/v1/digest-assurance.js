"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.digestComputations = exports.digestAlgorithms = void 0;
exports.digestAssurance = digestAssurance;
exports.compareClientAndServerDigests = compareClientAndServerDigests;
exports.digestAlgorithms = ['SHA-256'];
exports.digestComputations = ['SERVER_RECOMPUTED', 'CLIENT_COMPUTED', 'THIRD_PARTY_DECLARED'];
function digestAssurance(input) {
    return {
        value: input.value,
        algorithm: 'SHA-256',
        computation: input.computation,
        boundArtifactAvailable: input.boundArtifactAvailable,
    };
}
function compareClientAndServerDigests(input) {
    if (!input.client || !input.server)
        return 'NOT_COMPARED';
    return input.client === input.server ? 'MATCHED' : 'MISMATCH';
}
//# sourceMappingURL=digest-assurance.js.map