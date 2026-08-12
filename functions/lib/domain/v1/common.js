"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resourceIdPrefixes = exports.resourceKinds = void 0;
exports.parseResourceId = parseResourceId;
exports.parseMoney = parseMoney;
exports.canTransition = canTransition;
exports.assertTransition = assertTransition;
const runtime_1 = require("./runtime");
exports.resourceKinds = [
    'organization',
    'integration',
    'api_client',
    'commerce_context',
    'passport_draft',
    'transaction',
    'participant_claim',
    'evidence_session',
    'evidence_artifact',
    'evidence_manifest',
    'shipment',
    'return_passport',
    'evidence_report',
    'webhook_endpoint',
    'webhook_event',
    'webhook_delivery',
    'audit_event',
];
exports.resourceIdPrefixes = {
    organization: 'org_',
    integration: 'int_',
    api_client: 'client_',
    commerce_context: 'ctx_',
    passport_draft: 'draft_',
    transaction: 'txn_',
    participant_claim: 'claim_',
    evidence_session: 'es_',
    evidence_artifact: 'art_',
    evidence_manifest: 'manifest_',
    shipment: 'shipment_',
    return_passport: 'return_',
    evidence_report: 'report_',
    webhook_endpoint: 'wh_',
    webhook_event: 'evt_',
    webhook_delivery: 'delivery_',
    audit_event: 'audit_',
};
const canonicalIdPattern = /^[a-z][a-z_]*[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
const legacyFirestoreIdPattern = /^[A-Za-z0-9_-]{10,128}$/;
function parseResourceId(kind, value, path = `${kind}Id`, options = {}) {
    const result = (0, runtime_1.stringValue)(value, path, { min: 10, max: 160 });
    const prefix = exports.resourceIdPrefixes[kind];
    const canonical = result.startsWith(prefix) && canonicalIdPattern.test(result);
    if (!canonical && !(options.allowLegacy && legacyFirestoreIdPattern.test(result))) {
        throw new runtime_1.DomainValidationError({ path, code: 'FORMAT', message: `must use the ${prefix} identifier format${options.allowLegacy ? ' or an accepted legacy identifier' : ''}` });
    }
    return result;
}
function parseMoney(value, path) {
    const input = (0, runtime_1.strictObject)(value, path, ['currency', 'minorUnits']);
    return {
        currency: (0, runtime_1.stringValue)(input.currency, `${path}.currency`, { min: 3, max: 3, pattern: /^[A-Z]{3}$/ }),
        minorUnits: (0, runtime_1.integerValue)(input.minorUnits, `${path}.minorUnits`, 0, 10_000_000_000),
    };
}
function canTransition(table, from, to) {
    return table[from].includes(to);
}
function assertTransition(table, from, to, resource) {
    if (!canTransition(table, from, to)) {
        throw new runtime_1.DomainValidationError({ path: `${resource}.status`, code: 'FORMAT', message: `cannot transition from ${from} to ${to}` });
    }
}
//# sourceMappingURL=common.js.map