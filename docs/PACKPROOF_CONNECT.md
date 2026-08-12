# PackProof Connect

PackProof Connect lets a commerce platform create a locked capture session, hand the seller into the native PackProof workflow and receive an HMAC-authenticated digital-evidence callback without embedding PackProof's camera or evidence-storage stack. The callback is not a physical-authenticity, fraud, carrier, payment, or legal verdict.

The public PackProof Button is a separate, lower-trust entry path. It imports structured product-page data into an editable passport draft and is always labeled `PAGE_DECLARED`; it cannot create an order-bound Connect session. See `docs/architecture/PUBLIC_COMMERCE_HANDOFF_V1.md`.

## Flow

1. An approved integration calls `POST /api/connect/orders` with a bearer API key, external order data, callback URL and idempotency key.
2. The API validates payload bounds, integration/platform match, callback-origin allowlist and public HTTPS DNS resolution.
3. It atomically creates one seven-day Connect session and returns a universal evidence-capture URL. The response field remains `verificationUrl` for v0.2 API compatibility.
4. The signed-in seller redeems the one-use handoff token. PackProof creates a locked `TERMS_LOCKED` platform transaction and opens the normal packing workflow.
5. The app performs just-in-time attestation, continuous capture, encrypted offline queueing, barcode collection and exact-path upload.
6. After the Storage trigger independently hashes, inspects, and finalizes the packing-video record, PackProof generates a presentation PDF dossier and posts `packproof.evidence.finalized` to the integration callback.

## Authentication and idempotency

API keys are returned only when an administrator provisions an integration. Only their SHA-256 hashes are stored. `idempotencyKey` is scoped to the integration; a replay with the same normalized payload returns the original session, while the same key with different data returns HTTP 409. Session handoff tokens are stored only as hashes and removed after first redemption.

## Callback security

Callbacks include:

- `X-PackProof-Timestamp`
- `X-PackProof-Signature: v1=<hex HMAC-SHA256>`
- `X-PackProof-Delivery`

The signed input is `<timestamp>.<exact raw request body>`. Reject timestamps outside a short replay window, deduplicate `X-PackProof-Delivery`, and compare signatures in constant time. The included JavaScript SDK provides `verifyPackProofWebhook`.

Each delivery attempt receives a freshly generated dossier URL that expires after 15 minutes. The expiry is carried in `dossierUrlExpiresAt`; integrations should download, hash-check, and store the dossier according to their own authorized retention policy. The native evidence and manifest remain the source records, and the dossier does not replace them.

Callback destinations must use HTTPS, contain no embedded credentials, match an integration allowlist and resolve only to public IP space. DNS is checked again before each delivery. Failed deliveries retry every five minutes with bounded exponential backoff. For the strongest DNS-rebinding protection at very high scale, route callbacks through a controlled egress proxy that pins the resolved address.

## Status meaning

`DIGITAL_EVIDENCE_READY` requires server finalization, the strongest implemented online app/device context, exact client/server file-hash and byte-length matches, a declared/detected media-type match and—when the Connect order supplied tracking context—a matching observed barcode. Otherwise the callback is `DIGITAL_EVIDENCE_WITH_LIMITATIONS`.

Both states remain bounded to the digital evidence path. `statusReasonCodes` and the six `assurance` dimensions remain authoritative for policy decisions. In version 0.3.0, physical correspondence is always `NOT_AVAILABLE` and business/legal relevance is always `REVIEW_REQUIRED`.

## Provisioning

`provisionConnectIntegration` is an App-Check-protected callable restricted to accounts with the custom claim `packproofAdmin: true`. It returns an API key and webhook signing secret once, plus a non-secret Button `publishableKey` and normalized `allowedOrigins`. Store the API and webhook secrets in a secrets manager; put only the publishable key in browser code. The current per-integration webhook secret is held in a server-only Firestore collection; production environments with stricter key-management requirements should envelope-encrypt it with Cloud KMS.

For staging and vendor demonstrations, an authorized operator can provision directly with Application Default Credentials:

```bash
gcloud auth application-default login
npm --prefix functions run provision:connect -- --project YOUR_FIREBASE_PROJECT --name "Vendor sandbox" --platform vendor-slug --environment SANDBOX --callback https://vendor.example/packproof/webhook
```

The CLI applies the same public-HTTPS and DNS restrictions, writes only the API-key hash, and prints the API key and callback-signing secret once.

See `docs/openapi/packproof-connect.yaml` and `sdk/javascript/`.
