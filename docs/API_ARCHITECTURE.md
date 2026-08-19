# PackProof API v1 architecture

Status: source-implemented and locally tested; not yet deployed or live-credential accepted.

The partner product name is PackProof API (formerly PackProof Connect). Technical identifiers still use Connect (`/v1/connect/sessions`, `@packproof/connect`, and related collections/callables). Partner guide: [`PACKPROOF_API.md`](PACKPROOF_API.md).

The canonical API contract is [`openapi/packproof-api-v1.json`](openapi/packproof-api-v1.json). The implemented production-pattern slices now include:

- `GET /v1/health`
- `GET /v1/ready`
- `POST /v1/transactions`
- `GET /v1/transactions`
- `GET /v1/transactions/{transactionId}`
- `POST /v1/public/integrations/{publishableKey}/handoffs` (plus browser CORS preflight)
- `POST /v1/transactions/{transactionId}/participant-invitations`
- `POST /v1/participant-claims`
- `POST /v1/transactions/{transactionId}/evidence-sessions`
- `GET /v1/evidence-sessions/{evidenceSessionId}`
- `POST /v1/evidence-sessions/{evidenceSessionId}/redeem`
- `POST /v1/evidence-sessions/{evidenceSessionId}/cancel`
- `GET /v1/transactions/{transactionId}/evidence`
- `GET /v1/transactions/{transactionId}/evidence/{artifactId}`
- `GET /v1/transactions/{transactionId}/timeline`
- `GET /v1/transactions/{transactionId}/review-package`
- `POST /v1/transactions/{transactionId}/reports`
- `GET /v1/transactions/{transactionId}/reports/{reportId}`
- `GET /v1/transactions/{transactionId}/shipment`
- `POST /v1/transactions/{transactionId}/shipment`
- `GET /v1/transactions/{transactionId}/returns`
- `POST /v1/transactions/{transactionId}/returns`
- `GET /v1/transactions/{transactionId}/returns/{returnPassportId}`
- `POST /v1/transactions/{transactionId}/returns/{returnPassportId}/shipment`
- `GET /v1/transactions/{transactionId}/delivery`
- `POST /v1/transactions/{transactionId}/delivery`
- `POST /v1/connect/sessions`
- `GET /v1/connect/sessions`
- `GET /v1/connect/sessions/{sessionId}`
- `POST /v1/connect/sessions/{sessionId}/cancel`

The public operation produces only a page-declared editable passport-draft handoff; it is not merchant authentication or order binding. Participant claims and evidence-session redemption bridge merchant transactions into the existing native capture-session path, but they do not prove that a capture was completed, uploaded, or server-finalized. Evidence list/read, review-package, presentation-dossier, shipment association, receiver-arrival association, return-passport request and return-shipment association, and v1 Connect session routes are now implemented as organization-isolated merchant projections. They reuse the existing ports, package-seal fail-closed rule, and layered-assurance fields. They do not authenticate items, prove custody, decide fraud or fault, or enable the general webhook dispatcher. Verification verdict APIs and general merchant webhook registration remain subsequent milestones. The Connect callback remains the bounded `packproof.evidence.finalized` event documented as an OpenAPI webhook.

## Boundaries

The implementation lives under `functions/src/api/v1`:

- `core.ts` owns API/domain types, stable errors, canonical JSON, identifiers, DTO mapping, and opaque cursors.
- `validation.ts` is the strict runtime boundary. Unknown fields are rejected; TypeScript types are never treated as input validation.
- `security.ts` verifies environment-scoped merchant credentials and centralizes scope checks.
- `participant-security.ts` verifies both Firebase user identity and Firebase App Check context for participant HTTP operations.
- `ports.ts` defines persistence, idempotency, audit, authentication, rate-limit, and readiness interfaces.
- `transaction-service.ts` contains use-case rules and has no Express or Firestore dependency.
- `firestore.ts` is the organization-constrained transaction adapter and explicit persistence-to-DTO boundary.
- `controls.ts` implements Firestore idempotency leases, fixed-window rate counters, and organization audit hash chains.
- `app.ts` owns HTTP transport, request IDs, security headers, structured request logs, error mapping, and `/v1` routing.
- `production.ts` is the Firebase Functions composition root.
- `application/v1/public-commerce-handoff-service.ts` owns public-origin authorization, trust, lifecycle, replay, claim, quota, and draft-prefill rules without Express or Firestore dependencies.
- `infrastructure/firebase/v1/public-commerce-handoff-repository.ts` owns atomic context/draft/handoff/outbox persistence and one-user redemption.
- `application/v1/participant-capture-service.ts` owns declared-reference claims, role/purpose/artifact bounds, expiry, cancellation, one-time redemption, and native capture-session issuance.
- `application/v1/merchant-evidence-service.ts` owns tenant-isolated evidence inventory, timeline, claims-review package, presentation-dossier request, shipment association, receiver-arrival association, return-passport request, and return-shipment association.
- `application/v1/merchant-connect-service.ts` owns v1 Connect session create/get/list/cancel for API clients bound to an active integration.
- `infrastructure/firebase/v1/participant-capture-repository.ts` owns atomic claim/session/capture/timeline/outbox persistence and explicit public projections.
- `infrastructure/crypto/participant-handoff-token-issuer.ts` creates deterministic, purpose-separated claim and redemption tokens while persisting only SHA-256 digests.

HTTP handlers are deliberately thin. Firestore documents are never serialized directly to merchants.

## Authentication and authorization

Merchant keys use this shape:

```text
pp_{sandbox|live}_{credentialId}.{32-byte-base64url-secret}
```

The secret is emitted once. Firestore stores an HMAC-SHA-256 verifier produced with the separately managed `API_CREDENTIAL_PEPPER`, never the raw secret. Authentication also verifies all of the following:

- credential status, environment, expiry, and revocation state;
- API client status, environment, organization binding, and allowed scopes;
- organization status; and
- the intersection of credential and client scopes.

Every transaction lookup is constrained by the authenticated `organizationId`. A valid transaction ID from another organization returns `TRANSACTION_NOT_FOUND`; possession of an ID never grants access.

Participant claim and redemption operations require both a valid, non-revoked Firebase ID token and a valid `X-Firebase-AppCheck` token. App Check supplies app context; it does not replace user identity, role binding, token verification, expiry, cancellation, or redemption-limit checks. The claim link, redemption link, claim ID, session ID, merchant email, and merchant external participant reference are all non-authorizing by themselves. Participant responses never expose internal actor IDs, organization ownership, external references, or stored token digests.

Authentication attempts are rate-controlled by a one-way hash of the request network signal; raw network addresses are not written to the limiter collection. Authenticated operations receive separate organization/client/operation limits.

## Idempotency and offline retries

`POST /v1/transactions` requires `Idempotency-Key`. The record is bound to principal, operation, key hash, and a canonical request fingerprint. The first reservation creates a stable PackProof transaction ID. Exact replays return the stored response. Reuse with different input is rejected. In-flight concurrent retries return a retryable conflict. A failed attempt retains its stable operation ID so a later retry cannot create a second transaction.

Idempotency reservations use an ownership/fencing token and an operation-specific processing lease. Ordinary writes default to 120 seconds. Evidence-report construction uses a 900-second lease because dossier generation can exceed a short window. The owner renews the lease while the operation is running. Completion is transactional and succeeds only if the completing invocation still owns the fence. An expired processing lease can be reclaimed only after that fence is no longer live; a stale owner cannot publish a late result. Completed transaction idempotency records currently have no time-based expiry: they must remain at least as long as the linked transaction so a delayed offline retry cannot create a duplicate. A future cleanup job may remove a record only under the same resource-aware retention/legal-hold policy as its transaction and audit history.

Credential last-used bookkeeping is best-effort and must not fail a request after authorization has already succeeded. Authorization itself remains fail-closed.

Connect handoff redemption is a one-time grant exchange: non-destructive lookup, client and exact-redirect checks, PKCE when a challenge is bound, token verification, then transactional compare-and-set consumption. A request that possesses a valid code but supplies the wrong client, redirect, PKCE verifier, or token must not burn the grant.

Sliding-window rate counters and the per-organization audit-chain head remain single Firestore documents at today's volume. The partition strategy for later enterprise bursts is in [`architecture/FIRESTORE_PARTITIONING_V1.md`](architecture/FIRESTORE_PARTITIONING_V1.md). Do not weaken canonical payload hashing or previous-hash linkage when that strategy is activated.

Participant invitation and evidence-session creation derive stable resource IDs and purpose-separated tokens from the merchant operation identity. An exact retry returns the original resource and token; reuse with different input is rejected. Participant claim is replay-safe only for the actor who completed it. Evidence-session redemption derives a stable legacy capture-session ID from session, actor, and operation key; an exact retry returns the same nonce, while a different actor or exhausted/cancelled/expired capability is rejected.

## Audit integrity

`TRANSACTION_CREATED` is written to an organization-specific append stream with sequence, previous hash, and event hash. The hash covers a canonicalized event payload and uses SHA-256. This is tamper-evident history, not proof against a cloud administrator capable of rewriting the stream and every downstream copy. Production hardening still requires independently administered audit export, least-privilege IAM, alerting, retention policy, and restoration/rehash exercises.

## Persistence compatibility

Merchant-created records use the existing `transactions` collection with `sourceType: MERCHANT_API`, `apiVersion: v1`, and API-specific lifecycle fields. `sellerId`, `buyerId`, and `participantIds` remain empty until an authenticated PackProof user successfully consumes the matching participant-claim capability. The repository then records a role binding atomically with the claim event and outbox event. A merchant-provided participant reference is never interpreted as a Firebase identity.

Merchant participant references are labels only. They do not authorize capture or evidence access.

The public Button uses a non-secret publishable installation key, exact HTTPS Origin allowlisting, network and installation/origin rate limits, strict unknown-field rejection, and a dedicated short-lived handoff signing secret. Origin is not treated as cryptographic merchant proof; the domain permanently caps this route at `PAGE_DECLARED`, forbids an external order field, and creates an editable `DRAFT`. The full boundary and threat model are in [`architecture/PUBLIC_COMMERCE_HANDOFF_V1.md`](architecture/PUBLIC_COMMERCE_HANDOFF_V1.md).

Transaction creation still returns `captureInstructions.state = NOT_ISSUED` and `reason = CAPTURE_SESSION_REQUIRED`; transaction creation alone never authorizes capture. After explicit participant claim, the merchant may create a bounded evidence session. Redemption requires that same PackProof actor plus App Check and the short-lived session token, and atomically creates a legacy `captureSessions` record with allowed artifact types, evidence count, optional physical profile/group, nonce, app ID, and capture window. Legacy evidence upload now rejects artifact types outside that server-issued allowlist. The detailed boundary and threat model are in [`architecture/PARTICIPANT_CLAIM_AND_EVIDENCE_SESSION_V1.md`](architecture/PARTICIPANT_CLAIM_AND_EVIDENCE_SESSION_V1.md).

## Operational configuration

Required before deployment:

1. Set `API_ENVIRONMENT` to exactly `sandbox` or `live`.
2. Generate a strong environment-specific pepper and set it with `firebase functions:secrets:set API_CREDENTIAL_PEPPER` without placing it in source or `.env.example`.
3. Generate a separate public-handoff signing key and set it with `firebase functions:secrets:set PUBLIC_HANDOFF_SIGNING_SECRET`; do not reuse the API credential pepper or evidence-manifest key.
4. Generate a third independent participant-handoff key and set it with `firebase functions:secrets:set PARTICIPANT_HANDOFF_SIGNING_SECRET`; do not reuse another PackProof secret.
5. Deploy the `packproofApi` function, participant callables, Hosting rewrite and SDK headers, Firestore rules/indexes, and static claim/redemption bridges to the intended Firebase project.
6. Provision the first organization/client/credential using an authorized workstation and Application Default Credentials, including only the scopes it needs (`participant_claims:write`, `evidence:read`, and/or `evidence:write`).
7. Put the one-time API key in the merchant's secret manager. Put only a Button publishable key in browser code and bind it to exact HTTPS origins.
8. Exercise health, readiness, merchant create/replay/read/list/isolation, public preflight/create/replay/origin denial, participant claim, evidence-session issue/read/redeem/cancel, App Link routing, logs, rate counters, audit/outbox linkage, and token consumption in that environment.

Provisioning command shape (values are examples, not production credentials):

```powershell
$env:PACKPROOF_API_CREDENTIAL_PEPPER='<same value securely set in Firebase Secret Manager>'
npm.cmd --prefix functions run provision:api-client -- --organization-id org_example --organization-name 'Example Merchant' --client-id client_example_backend --client-name 'Example backend' --environment sandbox --scopes transactions:read,transactions:write,participant_claims:write,evidence:read,evidence:write,shipments:read,shipments:write --integration-id YOUR_CONNECT_INTEGRATION_ID
```

The command prints the API key once. Do not paste it into source, chat, issue trackers, build logs, or ordinary documentation.

## Validation commands

```powershell
npm.cmd run test:api
npm.cmd run test:api:firestore
npm.cmd run test:api:functions
npm.cmd --prefix functions run build
```

`test:api` runs merchant, public-handoff, participant-claim, and evidence-session transport, validation, authentication, authorization/origin-negative, BOLA, replay, cursor, error-contract, size-limit, and OpenAPI consistency tests. `test:api:firestore` runs the core paths through real Firestore emulator transactions and queries. `test:api:functions` loads the compiled Firebase entrypoint and asserts the Gen 2 HTTP/callable export metadata, region, three API Secret Manager declarations, App Check enforcement on participant callables, resource settings, Hosting `/v1/**` rewrite target, and cross-origin SDK headers. HTTP behavior is exercised separately by `test:api`, and Firestore behavior is exercised by `test:api:firestore`.

Passing these source/emulator gates is not evidence of live deployment, live IAM, secret configuration, production index readiness, load capacity, penetration-test acceptance, or real merchant integration.
