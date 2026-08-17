# PackProof API

PackProof API (formerly PackProof Connect) is the partner API for binding an external commerce order to a native PackProof capture session and receiving a signed digital-evidence callback. The callback is not a physical-authenticity, fraud, carrier, payment, or legal verdict.

Technical identifiers still use Connect; the product name is PackProof API. Paths such as `/v1/connect/sessions`, `/api/connect/orders`, and `/connect/capture`, the SDK package `@packproof/connect`, the class `PackProofConnect`, the `connectSessions` collection, `User-Agent: PackProof-Connect/1.0`, and callables such as `redeemConnectSession` are unchanged.

Recommended partner path: **Merchant API v1**. Keep `/api/connect/orders` only for existing v0.2 clients.

Contract: [`docs/openapi/packproof-api-v1.json`](openapi/packproof-api-v1.json)  
SDK: [`sdk/javascript`](../sdk/javascript)  
Copyable server: [`sdk/javascript/examples/partner-server.mjs`](../sdk/javascript/examples/partner-server.mjs)

The public PackProof Button is a separate, lower-trust entry path. It imports structured product-page data into an editable passport draft and is always labeled `PAGE_DECLARED`. It cannot create an order-bound Connect session. See `docs/architecture/PUBLIC_COMMERCE_HANDOFF_V1.md`.

## Partner implementation

### 1. Credentials

A PackProof operator provisions a sandbox integration and binds your merchant API client. You receive once:

| Secret | Where it lives | Used for |
|---|---|---|
| `pp_sandbox_{credentialId}.{secret}` or `pp_live_...` | Your secret manager | `Authorization: Bearer` on `/v1` |
| `whsec_...` | Your secret manager | HMAC verification of callbacks |
| `pp_pub_{sandbox\|live}_...` | Browser markup only | PackProof Button, never Connect |

Do not put the API key or webhook secret in a mobile app, storefront script, or repository.

Required scopes: `transactions:read`, `transactions:write`. After capture, `evidence:read`, `shipments:read`, and `shipments:write` are needed for review packages, dossiers, tracking association, and delivery association.

### 2. Create a capture session

`POST /v1/connect/sessions` with `Idempotency-Key` and `schemaVersion: 1`.

```http
POST /v1/connect/sessions
Authorization: Bearer pp_sandbox_...
Idempotency-Key: fulfillment-order-123-v1
Content-Type: application/json

{
  "schemaVersion": 1,
  "platform": "custom",
  "externalOrderId": "order-123",
  "externalSellerId": "merchant-42",
  "itemTitle": "Vintage camera",
  "amount": { "currency": "USD", "minorUnits": 129900 },
  "callbackUrl": "https://merchant.example/webhooks/packproof"
}
```

Store `data.id`. Give the seller only `captureInstructions.captureUrl`. The token is one-time and returned only on create and exact idempotent replay. `GET` never returns it.

Exact replay of the same key and payload returns HTTP 200 with `Idempotent-Replayed: true`. The same key with a different payload returns HTTP 409 `IDEMPOTENCY_KEY_REUSED`.

`callbackUrl` must be public HTTPS, contain no embedded credentials, match the integration allowlist, and resolve only to public IP space.

### 3. Seller capture

The capture URL opens the native PackProof workflow through Android App Links. The seller signs in, redeems the handoff, and records packing evidence. You do not embed PackProof's camera stack.

Poll `GET /v1/connect/sessions/{sessionId}` or `GET /v1/connect/sessions?externalOrderId=order-123` until `status` is `READY_FOR_CAPTURE` and `transactionId` is present.

| Status | Meaning |
|---|---|
| `PENDING_REDEMPTION` | Handoff issued; seller has not claimed it |
| `READY_FOR_CAPTURE` | Seller redeemed; `transactionId` is set |
| `EXPIRED` | Unredeemed session past `expiresAt` (computed on read) |
| `CANCELLED` | Merchant revoked an unredeemed session |

Cancel an unused session with `POST /v1/connect/sessions/{sessionId}/cancel` and `{ "schemaVersion": 1 }`. Redeemed sessions cannot be cancelled.

### 4. Receive `packproof.evidence.finalized`

After the Storage trigger independently hashes, inspects, and finalizes the packing-video record, PackProof posts to `callbackUrl`:

```
X-PackProof-Timestamp: 1786039200
X-PackProof-Signature: v1=<hex HMAC-SHA256>
X-PackProof-Delivery: <stable delivery id>
User-Agent: PackProof-Connect/1.0
```

Signed input: `<timestamp>.<exact raw request body>`.

Partner checks:

1. Read the raw body before JSON parsing.
2. Reject timestamps outside a short replay window (SDK default 300 seconds).
3. Compare `v1=` HMAC-SHA256 in constant time.
4. Deduplicate `X-PackProof-Delivery`.
5. Download `dossierUrl` before `dossierUrlExpiresAt` (15 minutes, fresh URL per attempt). Hash-check against `dossierSha256` and store under your retention policy.

Use `parsePackProofWebhook` from `@packproof/connect`. Do not parse and re-serialize the body before verification.

Failed deliveries retry every five minutes with bounded exponential backoff. DNS is re-checked before each delivery.

### 5. Read evidence for human review

After `transactionId` is known:

- `GET /v1/transactions/{transactionId}/review-package`
- `GET /v1/transactions/{transactionId}/evidence`
- `POST /v1/transactions/{transactionId}/reports` then `GET .../reports/{reportId}`
- `POST /v1/transactions/{transactionId}/shipment` after packing video and seal reference are server-finalized with no byte-integrity mismatch
- `POST /v1/transactions/{transactionId}/delivery` after a server-finalized arrival photograph exists
- `POST /v1/transactions/{transactionId}/returns` to request a return passport; after authorization plus return packing and seal evidence, `POST .../returns/{id}/shipment`

None of these writes decide fraud, fault, custody, or a refund.

The review package always states `physicalCorrespondence: NOT_AVAILABLE` and `businessLegalRelevance: REVIEW_REQUIRED`. Documentation categories are filing labels only. The package does not decide fraud, fault, authenticity, custody, or a card-network, carrier, marketplace, or payment outcome.

## Callback fields

`evidenceStatus` is `DIGITAL_EVIDENCE_READY` only when all of the following are true:

- server finalization recorded
- strongest implemented online app/device context
- exact client/server file-hash and byte-length matches
- declared/detected media-type match
- when the Connect order supplied tracking context, a matching observed barcode

Otherwise the callback is `DIGITAL_EVIDENCE_WITH_LIMITATIONS`.

Permanent reason codes on every callback:

- `PHYSICAL_CORRESPONDENCE_NOT_AVAILABLE`
- `BUSINESS_LEGAL_REVIEW_REQUIRED`

Additional codes appear when a gate did not pass. `statusReasonCodes` and the six `assurance` dimensions remain authoritative for policy decisions.

## SDK

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

// In the webhook handler, pass the exact raw body:
const event = parsePackProofWebhook({
  rawBody,
  timestamp: req.headers['x-packproof-timestamp'],
  signature: req.headers['x-packproof-signature'],
  secret: process.env.PACKPROOF_WEBHOOK_SECRET,
});
```

`createEvidenceSession` / `createVerification` remain as the legacy `/api/connect/orders` client. New integrations should use `createConnectSession`.

## Compatibility route

Existing v0.2 clients may keep `POST /api/connect/orders` with a Connect integration API key (`pp_test_...` / `pp_live_...`). The response field `verificationUrl` is the capture URL. See [`docs/openapi/packproof-connect.yaml`](openapi/packproof-connect.yaml). Behavior is the same commerce-context ingestion path as v1; the HTTP envelope is not the v1 error contract.

## Provisioning (PackProof operators)

`provisionConnectIntegration` is an App-Check-protected callable restricted to accounts with `packproofAdmin: true`. It returns an API key and webhook signing secret once, plus a non-secret Button `publishableKey` and normalized `allowedOrigins`.

For staging:

```powershell
gcloud auth application-default login
npm --prefix functions run provision:connect -- --project YOUR_FIREBASE_PROJECT --name "Vendor sandbox" --platform vendor-slug --environment SANDBOX --callback https://vendor.example/packproof/webhook
```

Bind a v1 merchant credential:

```powershell
npm.cmd --prefix functions run provision:api-client -- --organization-id org_example --organization-name 'Example Merchant' --client-id client_example_backend --client-name 'Example backend' --environment sandbox --scopes transactions:read,transactions:write,evidence:read,evidence:write,shipments:read,shipments:write --integration-id YOUR_CONNECT_INTEGRATION_ID
```

The CLI prints secrets once. Store them in a secrets manager.

## Out of partner scope

General merchant webhook registration, verification verdict APIs, and commerce-platform adapters (Shopify/WooCommerce) are not part of this PackProof API slice. The bounded `packproof.evidence.finalized` callback is the supported notification. Merchant return and delivery writes are available on `/v1` after the matching packing, seal, or arrival evidence is server-finalized.
