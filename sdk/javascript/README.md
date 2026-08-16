# PackProof Connect JavaScript SDK

Server-side helper for PackProof Connect v1 and the legacy `/api/connect/orders` route.

New partners should use merchant credentials (`pp_sandbox_` / `pp_live_`) bound to a Connect integration. See [`docs/PACKPROOF_CONNECT.md`](../../docs/PACKPROOF_CONNECT.md) and the copyable server in [`examples/partner-server.mjs`](examples/partner-server.mjs).

```js
import { PackProofConnect, parsePackProofWebhook } from '@packproof/connect';

const client = new PackProofConnect({
  apiKey: process.env.PACKPROOF_API_KEY,
  baseUrl: 'https://YOUR_PACKPROOF_DOMAIN.example',
});

const session = await client.createConnectSession({
  platform: 'custom',
  externalOrderId: 'order-123',
  externalSellerId: 'merchant-42',
  itemTitle: 'Vintage camera',
  amount: { currency: 'USD', minorUnits: 129900 },
  callbackUrl: 'https://merchant.example/webhooks/packproof',
  idempotencyKey: 'fulfillment-123-v1',
});

// Give the seller only session.captureInstructions.captureUrl.
const current = await client.getConnectSession(session.data.id);
const byOrder = await client.listConnectSessions('order-123');
```

After `transactionId` is present:

```js
const review = await client.getReviewPackage(current.data.transactionId);
```

`getReviewPackage` organizes hashes, protocol completeness, and limitations for human review. It does not decide fraud, fault, or a dispute outcome.

## Webhooks

Pass the exact raw HTTP body plus `X-PackProof-Timestamp`, `X-PackProof-Signature`, and the integration webhook secret. Do not parse and re-serialize the body before verification.

```js
const event = parsePackProofWebhook({
  rawBody,
  timestamp: request.headers['x-packproof-timestamp'],
  signature: request.headers['x-packproof-signature'],
  secret: process.env.PACKPROOF_WEBHOOK_SECRET,
});
```

`verifyPackProofWebhook` returns a boolean. `parsePackProofWebhook` verifies, then returns the `packproof.evidence.finalized` payload or throws `PackProofConnectError`. Deduplicate `X-PackProof-Delivery`. Download `dossierUrl` before `dossierUrlExpiresAt`.

Treat `evidenceStatus`, `statusReasonCodes`, and `assurance` as structured evidence metadata, not item authentication or a guaranteed dispute outcome.

## Legacy v0.2

```js
const session = await client.createEvidenceSession({
  platform: 'shopify',
  orderId: 'gid://shopify/Order/123',
  sellerId: 'merchant-42',
  itemTitle: 'Vintage camera',
  callbackUrl: 'https://merchant.example/webhooks/packproof',
  idempotencyKey: 'fulfillment-123-v1',
});
```

`createVerification` remains as a deprecated alias of `createEvidenceSession`.

## Browser button

The browser entry point uses a publishable installation key and exact-origin allowlist. It never accepts or sends a merchant API key, webhook secret, order identifier, or payment credential.

```html
<div
  data-packproof-button
  data-packproof-publishable-key="pp_pub_live_YOUR_PUBLIC_KEY"
  data-packproof-label="Create passport with PackProof"></div>
<script type="module">
  import { autoMountPackProofButtons } from 'https://packproof.link/sdk/packproof-button-v1.js';
  autoMountPackProofButtons();
</script>
```

The resulting passport draft is labeled `PAGE_DECLARED`. Server-to-server Connect remains the authoritative path for binding an external order.
