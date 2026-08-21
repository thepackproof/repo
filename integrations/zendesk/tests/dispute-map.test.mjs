import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reviewQueryFromTicket, reviewQueryString } from '../assets/lib/dispute-map.js';

test('maps INR language onto Visa merchandise-not-received overlay', () => {
  const query = reviewQueryFromTicket({
    framework: 'visa',
    subject: 'Item not received',
    tags: ['chargeback', 'inr'],
  });
  assert.deepEqual(query, { framework: 'VISA', category: 'MERCHANDISE_NOT_RECEIVED' });
  assert.equal(reviewQueryString(query), '?framework=VISA&category=MERCHANDISE_NOT_RECEIVED');
});

test('maps SNAD language onto PayPal overlay and defaults unknown frameworks', () => {
  const paypal = reviewQueryFromTicket({
    framework: 'paypal',
    description: 'Customer says significantly not as described',
  });
  assert.deepEqual(paypal, { framework: 'PAYPAL', category: 'SIGNIFICANTLY_NOT_AS_DESCRIBED' });
  const unknown = reviewQueryFromTicket({
    framework: 'not-a-network',
    subject: 'General question',
  });
  assert.deepEqual(unknown, { framework: 'GENERIC', category: 'DEFAULT' });
});
