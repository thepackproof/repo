const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
const PHONE = /\b(?:\+?1[-.\s]?)?(?:\(?\d{3}\)?[-.\s]?)\d{3}[-.\s]?\d{4}\b/g;
const CARD = /\b(?:\d[ -]*?){13,19}\b/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;

export type IntakeRetentionPolicy = {
  retainRawCorrespondence: false;
  retainDigestAndProvenance: true;
  retainPopulatedItemFields: true;
};

export const HC1_INTAKE_RETENTION: IntakeRetentionPolicy = {
  retainRawCorrespondence: false,
  retainDigestAndProvenance: true,
  retainPopulatedItemFields: true,
};

export function redactUnnecessaryPersonalData(value: string): string {
  return value
    .replace(EMAIL, '[REDACTED_EMAIL]')
    .replace(PHONE, '[REDACTED_PHONE]')
    .replace(CARD, '[REDACTED_PAYMENT]')
    .replace(SSN, '[REDACTED_IDENTIFIER]');
}

export function sanitizeRetainedText(value: string | null | undefined): string {
  if (!value) return '';
  return redactUnnecessaryPersonalData(value).trim();
}

export function shouldRetainRawCorrespondence(_evidentiaryPurpose: string | null): boolean {
  return false;
}
