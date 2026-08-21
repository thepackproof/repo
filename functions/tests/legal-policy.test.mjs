import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  LEGAL_AFFIRMATION,
  legalAcceptanceId,
  parseLegalAcceptanceInput,
} = require('../lib/legal-policy.js');

test('current legal clickwrap requires exact policy versions and affirmative agreement', () => {
  assert.deepEqual(parseLegalAcceptanceInput({
    termsVersion: CURRENT_TERMS_VERSION,
    privacyVersion: CURRENT_PRIVACY_VERSION,
    appVersion: '0.9.6.0',
    affirmation: LEGAL_AFFIRMATION,
  }), {
    termsVersion: '2026.08.20',
    privacyVersion: '2026.08.20',
    appVersion: '0.9.6.0',
    affirmation: 'I AGREE',
  });
  assert.throws(() => parseLegalAcceptanceInput({
    termsVersion: 'old', privacyVersion: CURRENT_PRIVACY_VERSION, appVersion: '0.9.6.0', affirmation: LEGAL_AFFIRMATION,
  }), /current Terms/);
  assert.throws(() => parseLegalAcceptanceInput({
    termsVersion: CURRENT_TERMS_VERSION, privacyVersion: CURRENT_PRIVACY_VERSION, appVersion: '0.9.6.0', affirmation: 'maybe',
  }), /Affirmative/);
});

test('legal acceptance ids are stable per account and current policy pair', () => {
  assert.equal(legalAcceptanceId('user-1'), legalAcceptanceId('user-1'));
  assert.notEqual(legalAcceptanceId('user-1'), legalAcceptanceId('user-2'));
  assert.match(legalAcceptanceId('user-1'), /^acceptance_[a-f0-9]{40}$/);
});
