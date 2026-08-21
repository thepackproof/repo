"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LEGAL_AFFIRMATION = exports.LEGAL_POLICY_EFFECTIVE_DATE = exports.CURRENT_PRIVACY_VERSION = exports.CURRENT_TERMS_VERSION = void 0;
exports.parseLegalAcceptanceInput = parseLegalAcceptanceInput;
exports.legalAcceptanceId = legalAcceptanceId;
const node_crypto_1 = require("node:crypto");
exports.CURRENT_TERMS_VERSION = '2026.08.20';
exports.CURRENT_PRIVACY_VERSION = '2026.08.20';
exports.LEGAL_POLICY_EFFECTIVE_DATE = '2026-08-20';
exports.LEGAL_AFFIRMATION = 'I AGREE';
function parseLegalAcceptanceInput(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        throw new Error('Legal acceptance is required.');
    const input = value;
    const allowed = new Set(['termsVersion', 'privacyVersion', 'appVersion', 'affirmation']);
    if (Object.keys(input).some((key) => !allowed.has(key)))
        throw new Error('Legal acceptance contains an unsupported field.');
    if (input.termsVersion !== exports.CURRENT_TERMS_VERSION || input.privacyVersion !== exports.CURRENT_PRIVACY_VERSION) {
        throw new Error('The current Terms of Use and Privacy Policy must be accepted.');
    }
    if (input.affirmation !== exports.LEGAL_AFFIRMATION)
        throw new Error('Affirmative agreement is required.');
    if (typeof input.appVersion !== 'string' || !/^\d+\.\d+\.\d+\.\d+$/.test(input.appVersion) || input.appVersion.length > 32) {
        throw new Error('A valid PackProof app version is required.');
    }
    return input;
}
function legalAcceptanceId(uid) {
    return `acceptance_${(0, node_crypto_1.createHash)('sha256').update(`${uid}\n${exports.CURRENT_TERMS_VERSION}\n${exports.CURRENT_PRIVACY_VERSION}`).digest('hex').slice(0, 40)}`;
}
//# sourceMappingURL=legal-policy.js.map