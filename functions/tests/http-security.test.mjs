import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { constantTimeSecretEquals, PACKPROOF_SECURITY_HEADERS } = require('../lib/http-security.js');

test('secret comparison is length-stable and rejects short or mismatched secrets', () => {
  const secret = 'pp_live_credential-secret-value-32b';
  assert.equal(constantTimeSecretEquals(secret, secret), true);
  assert.equal(constantTimeSecretEquals('wrong-secret-value-32b-xxxxxx', secret), false);
  assert.equal(constantTimeSecretEquals('', secret), false);
  assert.equal(constantTimeSecretEquals(secret, 'short'), false);
});

test('HTTP security headers include HSTS, framing, and referrer controls', () => {
  assert.equal(PACKPROOF_SECURITY_HEADERS['Strict-Transport-Security'], 'max-age=31536000; includeSubDomains');
  assert.equal(PACKPROOF_SECURITY_HEADERS['X-Frame-Options'], 'DENY');
  assert.equal(PACKPROOF_SECURITY_HEADERS['Referrer-Policy'], 'no-referrer');
  assert.match(PACKPROOF_SECURITY_HEADERS['Content-Security-Policy'], /frame-ancestors 'none'/);
});
