# PackProof Connect JavaScript SDK

Server-side helper for creating PackProof verification sessions and validating callback signatures.

```js
import { PackProofConnect, verifyPackProofWebhook } from '@packproof/connect';

const client = new PackProofConnect({
  apiKey: process.env.PACKPROOF_API_KEY,
  baseUrl: 'https://YOUR_FIREBASE_PROJECT.web.app',
});

const session = await client.createVerification({
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

For callbacks, pass the exact raw HTTP body plus `X-PackProof-Timestamp`, `X-PackProof-Signature`, and the integration webhook secret to `verifyPackProofWebhook`. Do not parse and re-serialize the body before verification.
