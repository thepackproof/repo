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

API keys are returned only when an administrator provisions an integration. Only their SHA-256 hashes are stored. `idempotencyKey` is scoped to the integration; a replay with the same normalized payload returns the original session, while the same key with different data returns HTTP 409.

Seller redemption is a one-time grant exchange, not an implicit consume-on-sight. PackProof looks up the session without mutating it, then validates client, exact callback/redirect, optional PKCE, and the handoff token. Only after those checks pass does a Firestore transaction compare-and-set the unused token hash to consumed. A request that holds a valid token but supplies the wrong client, redirect, PKCE verifier, or token leaves the grant usable. Exact actor replay after a successful consume returns the same transaction. Session handoff tokens are stored only as hashes and removed after that successful consumption.

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

Both states remain bounded to the digital evidence path. `statusReasonCodes` and the six `assurance` dimensions remain authoritative for policy decisions. In version 0.8.5.0, physical correspondence is always `NOT_AVAILABLE` and business/legal relevance is always `REVIEW_REQUIRED`.

## Provisioning

`provisionConnectIntegration` is an App-Check-protected callable restricted to accounts with the custom claim `packproofAdmin: true`. It returns an API key and webhook signing secret once, plus a non-secret Button `publishableKey` and normalized `allowedOrigins`. Store the API and webhook secrets in a secrets manager; put only the publishable key in browser code. The current per-integration webhook secret is held in a server-only Firestore collection; production environments with stricter key-management requirements should envelope-encrypt it with Cloud KMS.

For staging and vendor demonstrations, an authorized operator can provision directly with Application Default Credentials:

```bash
gcloud auth application-default login
npm --prefix functions run provision:connect -- --project YOUR_FIREBASE_PROJECT --name "Vendor sandbox" --platform vendor-slug --environment SANDBOX --callback https://vendor.example/packproof/webhook
```

The CLI applies the same public-HTTPS and DNS restrictions, writes only the API-key hash, and prints the API key and callback-signing secret once.

See `docs/openapi/packproof-connect.yaml` and `sdk/javascript/`.

## Headless v1 merchant API

Merchants, commerce platforms, and claims-review tools that already hold a PackProof merchant credential can use the versioned `/v1` contract instead of, or in addition to, the legacy `/api/connect/orders` route. The v1 routes are documented in `docs/openapi/packproof-api-v1.json`.

### E-commerce platforms

`POST /v1/connect/sessions` creates the same order-bound Connect session as the legacy route when the API client is bound to an active Connect integration (`integrationId` on the API client). The response is a v1 `connect_session` plus one-time `captureInstructions`. `GET /v1/connect/sessions/{sessionId}` returns status and the redeemed `transactionId` without the handoff token.

Bind the client at provision time:

```powershell
npm.cmd --prefix functions run provision:api-client -- --organization-id org_example --organization-name 'Example Merchant' --client-id client_example_backend --client-name 'Example backend' --environment sandbox --scopes transactions:read,transactions:write,evidence:read,shipments:read,shipments:write --integration-id YOUR_CONNECT_INTEGRATION_ID
```

The public PackProof Button remains `PAGE_DECLARED` and cannot create these sessions.

### Merchants

After participants capture and the Storage trigger finalizes evidence, merchant credentials with `evidence:read` can list artifacts, read hashes and layered assurance, request a presentation dossier, and read return passports. `POST /v1/transactions/{transactionId}/shipment` records merchant-asserted tracking only after a server-finalized packing video and seal reference are present with no recorded byte-integrity mismatch.

### Claims specialists

`GET /v1/transactions/{transactionId}/review-package` organizes terms, protocol completeness, hashed evidence, shipment/return records, and the audit timeline for authorized human review. Documentation categories are filing labels only. The package always states `physicalCorrespondence: NOT_AVAILABLE` and `businessLegalRelevance: REVIEW_REQUIRED`. It does not decide fraud, fault, authenticity, custody, or a card-network, carrier, marketplace, or payment outcome.

General merchant webhook registration remains feature-gated and is not part of this headless slice. Connect's existing bounded `packproof.evidence.finalized` callback is unchanged.
