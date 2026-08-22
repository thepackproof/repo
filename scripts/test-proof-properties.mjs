import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const passport = require('../functions/lib/domain/v1/passport.js');

const trusts = [null, 'PAGE_DECLARED', 'USER_PROVIDED_COMMERCE_ARTIFACT', 'MERCHANT_SERVER_ATTESTED', 'PLATFORM_API_ATTESTED'];
const finals = ['UPLOADED', 'QUARANTINED', 'FINALIZED'];

for (let i = 0; i < 80; i += 1) {
  const trust = trusts[i % trusts.length];
  const finalization = finals[i % finals.length];
  const hasManifest = i % 2 === 0;
  const result = passport.evaluatePassportEligibility({
    transactionExists: true,
    merchantReference: i % 5 === 0 ? 'order-1' : null,
    commerceContextId: trust && trust !== 'PAGE_DECLARED' ? 'ctx_1' : null,
    commerceTrustLevel: trust,
    sourceTrustLevel: trust,
    externalOrderId: i % 3 === 0 ? `ORDER-${i}` : null,
    artifacts: [{
      id: 'art_1',
      type: 'PACKING_VIDEO',
      finalization,
      sha256: finalization === 'FINALIZED' ? 'a'.repeat(64) : null,
      manifestSha256: finalization === 'FINALIZED' && hasManifest ? 'b'.repeat(64) : null,
      acquisitionClass: null,
    }],
    displayedUnattributedFacts: i % 7 === 0 ? 1 : 0,
  });
  if (finalization === 'QUARANTINED') {
    assert.equal(result.ok, false);
    assert.equal(result.failures.some((item) => item.code === 'NO_FINALIZED_MANIFEST_ARTIFACT'), true);
  }
  if (trust === 'PAGE_DECLARED' && !result.ok) {
    assert.equal(result.failures.some((item) => item.code === 'NO_COMMERCE_SOURCE' || item.code === 'NO_FINALIZED_MANIFEST_ARTIFACT' || item.code === 'UNATTRIBUTED_COMMERCIAL_FACT'), true);
  }
  const authoritative = passport.passportHasAuthoritativeOrderSource({
    merchantReference: null,
    commerceContextId: null,
    commerceTrustLevel: trust,
    sourceTrustLevel: trust,
    externalOrderId: 'ORDER-EXISTS',
  });
  assert.equal(authoritative, false);
}

console.log('Proof property invariants passed.');
