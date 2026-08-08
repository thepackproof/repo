import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { PackProofConnect, PackProofConnectError, verifyPackProofWebhook } from '../sdk/javascript/index.js';

const request = {
  platform: 'marketplace',
  orderId: 'order-123',
  sellerId: 'seller-42',
  itemTitle: 'Collectible camera',
  itemDescription: 'Complete with case.',
  priceMinor: 129_900,
  currency: 'USD',
  callbackUrl: 'https://merchant.example/webhooks/packproof',
  idempotencyKey: 'fulfillment-order-123-v1',
};

let observed;
const client = new PackProofConnect({
  apiKey: 'pp_test_validation',
  baseUrl: 'https://packproof.example/',
  fetchImpl: async (url, init) => {
    observed = { url, init };
    return new Response(JSON.stringify({ success: true, sessionId: 'session-123' }), {
      status: 201,
      headers: { 'Content-Type': 'application/json' },
    });
  },
});

const result = await client.createVerification(request);
assert.deepEqual(result, { success: true, sessionId: 'session-123' });
assert.equal(observed.url, 'https://packproof.example/api/connect/orders');
assert.equal(observed.init.method, 'POST');
assert.equal(observed.init.headers.Authorization, 'Bearer pp_test_validation');
assert.deepEqual(JSON.parse(observed.init.body), request);

const conflictClient = new PackProofConnect({
  apiKey: 'pp_test_validation',
  baseUrl: 'https://packproof.example',
  fetchImpl: async () => new Response(JSON.stringify({ error: 'idempotency_conflict', message: 'Conflict' }), {
    status: 409,
    headers: { 'Content-Type': 'application/json' },
  }),
});
await assert.rejects(
  conflictClient.createVerification(request),
  (error) => error instanceof PackProofConnectError && error.status === 409 && error.code === 'idempotency_conflict',
);

const rawBody = JSON.stringify({ event: 'packproof.verification.completed', orderId: 'order-123' });
const secret = 'whsec_validation_secret';
const timestamp = '1786039200';
const signature = `v1=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
const now = Number(timestamp) * 1000;
assert.equal(verifyPackProofWebhook({ rawBody, timestamp, signature, secret, now }), true);
assert.equal(verifyPackProofWebhook({ rawBody: `${rawBody} `, timestamp, signature, secret, now }), false);
assert.equal(verifyPackProofWebhook({ rawBody, timestamp, signature, secret, now: now + 301_000 }), false);
const tamperedSignature = `${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`;
assert.equal(verifyPackProofWebhook({ rawBody, timestamp, signature: tamperedSignature, secret, now }), false);

process.stdout.write('PackProof Connect SDK request and exact-body HMAC tests passed.\n');
