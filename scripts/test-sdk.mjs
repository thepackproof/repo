import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { PackProofConnect, PackProofConnectError, verifyPackProofWebhook } from '../sdk/javascript/index.js';
import { buildCommerceContext, createCommerceHandoff, extractStructuredProduct } from '../sdk/javascript/browser.js';

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

const result = await client.createEvidenceSession(request);
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

const legacyResult = await client.createVerification(request);
assert.deepEqual(legacyResult, { success: true, sessionId: 'session-123' });

let v1Observed;
const v1Client = new PackProofConnect({
  apiKey: 'pp_sandbox_validation.secret',
  baseUrl: 'https://packproof.example',
  fetchImpl: async (url, init) => {
    v1Observed = { url, init };
    return new Response(JSON.stringify({
      data: { id: 'a'.repeat(64), object: 'connect_session', externalOrderId: 'order-123' },
      captureInstructions: { state: 'PENDING_REDEMPTION', captureUrl: 'https://packproof.example/connect/capture', token: 'token', expiresAt: '2026-08-18T12:00:00.000Z' },
    }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  },
});
const v1Session = await v1Client.createConnectSession({
  platform: 'custom',
  externalOrderId: 'order-123',
  externalSellerId: 'seller-42',
  itemTitle: 'Collectible camera',
  amount: { currency: 'USD', minorUnits: 129900 },
  callbackUrl: 'https://merchant.example/webhooks/packproof',
  idempotencyKey: 'fulfillment-order-123-v1',
});
assert.equal(v1Session.data.object, 'connect_session');
assert.equal(v1Observed.url, 'https://packproof.example/v1/connect/sessions');
assert.equal(v1Observed.init.headers['Idempotency-Key'], 'fulfillment-order-123-v1');
assert.equal(JSON.parse(v1Observed.init.body).schemaVersion, 1);
assert.equal(JSON.parse(v1Observed.init.body).idempotencyKey, undefined);

const rawBody = JSON.stringify({ event: 'packproof.evidence.finalized', orderId: 'order-123', evidenceStatus: 'DIGITAL_EVIDENCE_WITH_LIMITATIONS' });
const secret = 'whsec_validation_secret';
const timestamp = '1786039200';
const signature = `v1=${createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex')}`;
const now = Number(timestamp) * 1000;
assert.equal(verifyPackProofWebhook({ rawBody, timestamp, signature, secret, now }), true);
assert.equal(verifyPackProofWebhook({ rawBody: `${rawBody} `, timestamp, signature, secret, now }), false);
assert.equal(verifyPackProofWebhook({ rawBody, timestamp, signature, secret, now: now + 301_000 }), false);
const tamperedSignature = `${signature.slice(0, -1)}${signature.endsWith('0') ? '1' : '0'}`;
assert.equal(verifyPackProofWebhook({ rawBody, timestamp, signature: tamperedSignature, secret, now }), false);

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Product',
  productID: 'product-42',
  name: 'Structured collectible camera',
  description: 'Full listing description with lens, case, strap, and disclosed base-plate wear.',
  category: 'Vintage cameras',
  brand: { '@type': 'Brand', name: 'Example Optics' },
  model: 'RF-50',
  sku: 'RF50-42',
  image: ['https://cdn.merchant.example/camera-front.jpg'],
  additionalProperty: [{ '@type': 'PropertyValue', name: 'Finish', value: 'Black' }],
  offers: { '@type': 'Offer', price: '1299.00', priceCurrency: 'USD', sku: 'RF50-BLACK' },
};
const metadata = new Map([
  ['meta[name="generator"]', 'Shopify'],
  ['meta[property="og:url"]', 'https://merchant.example/products/rf50'],
]);
const documentRef = {
  title: 'Fallback title',
  querySelectorAll(selector) { return selector === 'script[type="application/ld+json"]' ? [{ textContent: JSON.stringify(jsonLd) }] : []; },
  querySelector(selector) {
    const content = metadata.get(selector);
    return content ? { getAttribute: (name) => name === 'content' ? content : null } : null;
  },
};
const locationRef = { href: 'https://merchant.example/products/rf50' };
const extracted = extractStructuredProduct(documentRef, locationRef);
assert.equal(extracted.schemaVersion, 1);
assert.equal(extracted.source.platform, 'SHOPIFY');
assert.equal(extracted.source.productUrl, locationRef.href);
assert.equal(extracted.source.externalProductId, 'product-42');
assert.equal(extracted.item.title, jsonLd.name);
assert.equal(extracted.item.description, jsonLd.description);
assert.deepEqual(extracted.item.amount, { currency: 'USD', minorUnits: 129900 });
assert.deepEqual(extracted.item.selectedOptions, [{ name: 'Finish', value: 'Black' }]);
assert.equal(extracted.item.imageReferences[0].url, 'https://cdn.merchant.example/camera-front.jpg');

const explicit = buildCommerceContext({
  documentRef,
  locationRef,
  data: { item: { title: 'Selected black RF-50 variant', quantity: 2 }, source: { externalVariantId: 'variant-black' } },
});
assert.equal(explicit.item.title, 'Selected black RF-50 variant');
assert.equal(explicit.item.quantity, 2);
assert.equal(explicit.item.description, jsonLd.description);
assert.equal(explicit.source.externalVariantId, 'variant-black');

let buttonRequest;
const publishableKey = `pp_pub_sandbox_${'A'.repeat(24)}`;
const handoff = await createCommerceHandoff({
  publishableKey,
  context: explicit,
  operationKey: 'button-operation-123',
  apiBaseUrl: 'https://packproof.example/',
  fetchImpl: async (url, init) => {
    buttonRequest = { url, init };
    return new Response(JSON.stringify({ data: {
      id: `hnd_${'a'.repeat(40)}`,
      object: 'commerce_handoff',
      schemaVersion: 1,
      commerceContextId: `ctx_${'b'.repeat(40)}`,
      passportDraftId: `draft_${'c'.repeat(40)}`,
      trustLevel: 'PAGE_DECLARED',
      status: 'PENDING_CLAIM',
      reviewUrl: 'https://packproof.example/handoff/review?redacted-for-test',
      expiresAt: '2026-08-11T12:30:00.000Z',
    } }), { status: 201, headers: { 'Content-Type': 'application/json' } });
  },
});
assert.equal(handoff.trustLevel, 'PAGE_DECLARED');
assert.equal(buttonRequest.url, `https://packproof.example/v1/public/integrations/${publishableKey}/handoffs`);
assert.equal(buttonRequest.init.method, 'POST');
assert.equal(buttonRequest.init.credentials, 'omit');
assert.equal(buttonRequest.init.headers['Idempotency-Key'], 'button-operation-123');
assert.equal('Authorization' in buttonRequest.init.headers, false);
assert.equal(JSON.parse(buttonRequest.init.body).source.externalOrderId, undefined);
assert.equal(JSON.parse(buttonRequest.init.body).item.description, jsonLd.description);

process.stdout.write('PackProof Connect SDK, browser extraction, and publishable-button request tests passed.\n');
