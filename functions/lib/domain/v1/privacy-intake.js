"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HC1_INTAKE_RETENTION = void 0;
exports.redactUnnecessaryPersonalData = redactUnnecessaryPersonalData;
exports.sanitizeRetainedText = sanitizeRetainedText;
exports.shouldRetainRawCorrespondence = shouldRetainRawCorrespondence;
const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const CARD = /\b(?:\d[ -]*?){13,19}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
exports.HC1_INTAKE_RETENTION = {
    retainRawCorrespondence: false,
    retainDigestAndProvenance: true,
    retainPopulatedItemFields: true,
};
function redactUnnecessaryPersonalData(value) {
    return value
        .replace(EMAIL, '[REDACTED_EMAIL]')
        .replace(PHONE, '[REDACTED_PHONE]')
        .replace(CARD, '[REDACTED_PAYMENT]')
        .replace(SSN, '[REDACTED_IDENTIFIER]');
}
function sanitizeRetainedText(value) {
    if (!value)
        return '';
    return redactUnnecessaryPersonalData(value).trim();
}
function shouldRetainRawCorrespondence(_evidentiaryPurpose) {
    return false;
}
//# sourceMappingURL=privacy-intake.js.map