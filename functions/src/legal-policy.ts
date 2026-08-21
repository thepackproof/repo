import { createHash } from 'node:crypto';

export const CURRENT_TERMS_VERSION = '2026.08.20';
export const CURRENT_PRIVACY_VERSION = '2026.08.20';
export const LEGAL_POLICY_EFFECTIVE_DATE = '2026-08-20';
export const LEGAL_AFFIRMATION = 'I AGREE';

export type LegalAcceptanceInput = {
  termsVersion: string;
  privacyVersion: string;
  appVersion: string;
  affirmation: string;
};

export function parseLegalAcceptanceInput(value: unknown): LegalAcceptanceInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Legal acceptance is required.');
  const input = value as Record<string, unknown>;
  const allowed = new Set(['termsVersion', 'privacyVersion', 'appVersion', 'affirmation']);
  if (Object.keys(input).some((key) => !allowed.has(key))) throw new Error('Legal acceptance contains an unsupported field.');
  if (input.termsVersion !== CURRENT_TERMS_VERSION || input.privacyVersion !== CURRENT_PRIVACY_VERSION) {
    throw new Error('The current Terms of Use and Privacy Policy must be accepted.');
  }
  if (input.affirmation !== LEGAL_AFFIRMATION) throw new Error('Affirmative agreement is required.');
  if (typeof input.appVersion !== 'string' || !/^\d+\.\d+\.\d+\.\d+$/.test(input.appVersion) || input.appVersion.length > 32) {
    throw new Error('A valid PackProof app version is required.');
  }
  return input as LegalAcceptanceInput;
}

export function legalAcceptanceId(uid: string): string {
  return `acceptance_${createHash('sha256').update(`${uid}\n${CURRENT_TERMS_VERSION}\n${CURRENT_PRIVACY_VERSION}`).digest('hex').slice(0, 40)}`;
}
