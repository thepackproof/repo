"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evaluationPolicyForRecord = evaluationPolicyForRecord;
exports.maySilentlyReinterpret = maySilentlyReinterpret;
function evaluationPolicyForRecord(captured, current) {
    return {
        schemaVersion: captured.schemaVersion,
        policyVersion: captured.policyVersion,
        producerVersion: captured.producerVersion ?? null,
        parserVersion: captured.parserVersion ?? null,
    };
}
function maySilentlyReinterpret(captured, current) {
    return captured.schemaVersion === current.schemaVersion && captured.policyVersion === current.policyVersion;
}
//# sourceMappingURL=schema-policy.js.map