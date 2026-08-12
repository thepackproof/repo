# PackProof Connect JavaScript SDK

Server-side helper for creating PackProof evidence-capture sessions and validating callback signatures.

```js
import { PackProofConnect, verifyPackProofWebhook } from '@packproof/connect';

const client = new PackProofConnect({
  apiKey: process.env.PACKPROOF_API_KEY,
  baseUrl: 'https://YOUR_FIREBASE_PROJECT.web.app',
});

const session = await client.createEvidenceSession({
  platform: 'shopify',
  orderId: 'gid://shopify/Order/123',
  sellerId: 'merchant-42',
  trackingNumber: '1Z999AA10123456784',
  carrier: 'UPS',
  itemTitle: 'Vintage camera',
  declaredWeightGrams: 1650,
  priceMinor: 129900,
  currency: 'USD',
  callbackUrl: 'https://merchant.example/webhooks/packproof',
  idempotencyKey: 'fulfillment-123-v1',
});
```

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

The SDK prefers explicit `data` passed to `mountPackProofButton`, then reads Schema.org `Product` JSON-LD, and finally falls back to a narrow set of Open Graph product metadata. It does not scrape arbitrary page text. The resulting passport draft is labeled `PAGE_DECLARED` and must be reviewed in the PackProof app. Server-to-server Connect remains the authoritative path for binding an external order.

For callbacks, pass the exact raw HTTP body plus `X-PackProof-Timestamp`, `X-PackProof-Signature`, and the integration webhook secret to `verifyPackProofWebhook`. Do not parse and re-serialize the body before verification.

The callback event is `packproof.evidence.finalized`. Treat `evidenceStatus`, `statusReasonCodes`, and the layered `assurance` object as structured evidence metadata, not as item authentication or a guaranteed dispute outcome. `createVerification` remains as a deprecated v0.2 compatibility alias.
