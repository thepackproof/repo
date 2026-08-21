import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewQueryFromCase, reviewQueryString } from '../force-app/main/default/lwc/packProofProof/disputeMap.js';

test('maps INR language onto Visa merchandise-not-received overlay', () => {
  const query = reviewQueryFromCase({
    framework: 'visa',
    subject: 'Item not received',
    type: 'chargeback',
    reason: 'INR',
  });
  assert.deepEqual(query, { framework: 'VISA', category: 'MERCHANDISE_NOT_RECEIVED' });
  assert.equal(reviewQueryString(query), '?framework=VISA&category=MERCHANDISE_NOT_RECEIVED');
});

test('maps SNAD language onto PayPal overlay and defaults unknown frameworks', () => {
  const paypal = reviewQueryFromCase({
    framework: 'paypal',
    description: 'Customer says significantly not as described',
  });
  assert.deepEqual(paypal, { framework: 'PAYPAL', category: 'SIGNIFICANTLY_NOT_AS_DESCRIBED' });
  const unknown = reviewQueryFromCase({
    framework: 'not-a-network',
    subject: 'General question',
  });
  assert.deepEqual(unknown, { framework: 'GENERIC', category: 'DEFAULT' });
});
