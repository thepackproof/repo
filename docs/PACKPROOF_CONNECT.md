# PackProof Connect

PackProof Connect lets a commerce platform create a locked capture session, hand the seller into the native PackProof workflow and receive a signed verification callback without embedding PackProof's camera or evidence-storage stack.

## Flow

1. An approved integration calls `POST /api/connect/orders` with a bearer API key, external order data, callback URL and idempotency key.
2. The API validates payload bounds, integration/platform match, callback-origin allowlist and public HTTPS DNS resolution.
3. It atomically creates one seven-day Connect session and returns a universal verification URL.
4. The signed-in seller redeems the one-use handoff token. PackProof creates a locked `TERMS_LOCKED` platform transaction and opens the normal packing workflow.
5. The app performs just-in-time attestation, continuous capture, encrypted offline queueing, barcode collection and exact-path upload.
6. After the Storage trigger verifies the packing video, PackProof generates a PDF dossier and posts `packproof.verification.completed` to the integration callback.

## Authentication and idempotency

API keys are returned only when an administrator provisions an integration. Only their SHA-256 hashes are stored. `idempotencyKey` is scoped to the integration; a replay with the same normalized payload returns the original session, while the same key with different data returns HTTP 409. Session handoff tokens are stored only as hashes and removed after first redemption.

## Callback security

Callbacks include:

- `X-PackProof-Timestamp`
- `X-PackProof-Signature: v1=<hex HMAC-SHA256>`
- `X-PackProof-Delivery`

The signed input is `<timestamp>.<exact raw request body>`. Reject timestamps outside a short replay window and compare signatures in constant time. The included JavaScript SDK provides `verifyPackProofWebhook`.

Callback destinations must use HTTPS, contain no embedded credentials, match an integration allowlist and resolve only to public IP space. DNS is checked again before each delivery. Failed deliveries retry every five minutes with bounded exponential backoff. For the strongest DNS-rebinding protection at very high scale, route callbacks through a controlled egress proxy that pins the resolved address.

## Status meaning

`VERIFIED_FULFILLMENT` requires server finalization, the strongest implemented JIT attestation, an exact client/server file hash match, an exact client/server size match and—when the Connect order supplied tracking context—a matching captured barcode. Otherwise the callback is `VERIFIED_WITH_LIMITATIONS` and carries the individual attestation/tracking fields so the platform can apply its own policy.

## Provisioning

`provisionConnectIntegration` is an App-Check-protected callable restricted to accounts with the custom claim `packproofAdmin: true`. It returns an API key and webhook signing secret once. Store both in a secrets manager. The current per-integration webhook secret is held in a server-only Firestore collection; production environments with stricter key-management requirements should envelope-encrypt it with Cloud KMS.

For staging and vendor demonstrations, an authorized operator can provision directly with Application Default Credentials:

```bash
gcloud auth application-default login
npm --prefix functions run provision:connect -- --project YOUR_FIREBASE_PROJECT --name "Vendor sandbox" --platform vendor-slug --environment SANDBOX --callback https://vendor.example/packproof/webhook
```

The CLI applies the same public-HTTPS and DNS restrictions, writes only the API-key hash, and prints the API key and callback-signing secret once.

See `docs/openapi/packproof-connect.yaml` and `sdk/javascript/`.
