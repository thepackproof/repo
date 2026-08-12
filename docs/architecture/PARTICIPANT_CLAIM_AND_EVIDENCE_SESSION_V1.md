# Participant claims and evidence sessions v1

Status: source-implemented and proven through unit, HTTP-boundary, Firestore emulator, rules, type, and Firebase export tests. Not deployed or real-device tested.

## Purpose

Merchant commerce data and PackProof identity are different trust domains. A merchant may know an email, marketplace ID, customer ID, or fulfillment reference, but none of those strings authorize a Firebase user or a device to act in PackProof. This slice adds an explicit, auditable bridge:

1. A merchant transaction declares a participant role and external reference.
2. An authorized merchant API client issues a short-lived claim capability for that exact declaration.
3. A signed-in PackProof user, from an App Check-verified app, consumes the capability and becomes the bound actor for that role.
4. The merchant creates an evidence session bounded to that claim, actor, transaction, purpose, artifact types, capture profile, expiry, and redemption count.
5. The same PackProof actor, again with App Check, consumes the session capability.
6. PackProof atomically issues a nonce-backed record in the existing native `captureSessions` pipeline.

```mermaid
sequenceDiagram
    participant M as Merchant backend
    participant A as PackProof API
    participant U as Authenticated PackProof user
    participant F as Firestore transaction boundary
    participant N as Existing native capture pipeline

    M->>A: Create transaction with declared participant label
    M->>A: Create participant invitation (merchant auth + scope)
    A->>F: Store claim and token digest atomically
    A-->>M: One-time claim link and plaintext token
    U->>A: Claim (Firebase ID + App Check + token)
    A->>F: Bind actor to role; consume digest; emit timeline/outbox
    M->>A: Create bounded evidence session
    A->>F: Store session and redemption-token digest atomically
    A-->>M: One-time redemption link and plaintext token
    U->>A: Redeem (same actor + Firebase ID + App Check + token)
    A->>F: Consume digest; create stable capture session; emit timeline/outbox
    A-->>U: Nonce, capture window, artifact/profile bounds
    U->>N: Capture using the existing signed-nonce path
```

## HTTP contract

Merchant-authenticated operations:

- `POST /v1/transactions/{transactionId}/participant-invitations` requires `participant_claims:write` and `Idempotency-Key`.
- `POST /v1/transactions/{transactionId}/evidence-sessions` requires `evidence:write` and `Idempotency-Key`.
- `GET /v1/evidence-sessions/{evidenceSessionId}` requires `evidence:read` and is organization-constrained.
- `POST /v1/evidence-sessions/{evidenceSessionId}/cancel` requires `evidence:write` and is organization-constrained.

Participant-authenticated operations:

- `POST /v1/participant-claims` requires a Firebase ID token, `X-Firebase-AppCheck`, claim ID, and claim token.
- `POST /v1/evidence-sessions/{evidenceSessionId}/redeem` requires a Firebase ID token, `X-Firebase-AppCheck`, session token, and stable operation key.

Native callable adapters expose the same application service for the installed app:

- `claimParticipantInvitation`
- `getMyEvidenceSession`
- `redeemEvidenceSession`

All three callables enforce App Check. The actor-facing lookup uses the authenticated UID and returns nothing for another actor; a link or session ID is not read authority.

## Authorization invariants

- Merchant credentials are environment-, organization-, client-, credential-, and scope-bound.
- An invitation can be created only for an external reference already declared on the same `MERCHANT_API` transaction.
- External references are hashed in the claim record and omitted from public claim DTOs. They never become user IDs.
- A participant claim may be completed only once. An exact retry by the same actor succeeds; a different actor is rejected after consumption.
- Evidence sessions can be created only from a completed claim belonging to the same transaction and merchant organization.
- The claim's actor and role are copied into immutable authorization bounds. Public evidence-session DTOs omit the actor ID.
- Session type is constrained by role. For example, `SELLER` may perform `OUTBOUND_PACK`, while `BUYER`/`RECEIVER` may perform `RECEIVER_OPEN`.
- Requested artifact types must be permitted by the transaction's merchant capture requirements when those requirements are present.
- Physical sessions require exactly 15 physical frame artifacts, `PP-PHYSICAL-MATTE-V1`, and an explicit capture group. Nonphysical sessions must not smuggle physical capture profiles or groups.
- Redemption checks actor, token digest, expiry, cancellation, and remaining redemption count before creating capture authority.
- The generated legacy capture session stores the exact artifact allowlist, evidence count, app ID, optional profile/group, runtime artifact hash, nonce, and capture window. The legacy upload reservation path rejects evidence types outside that allowlist.
- Upload reservation rechecks that the parent evidence session remains `CAPTURING`, actor-bound, and transaction-bound. Cancelling the evidence session therefore prevents an already issued but unused native nonce from reserving new evidence; it does not erase an upload already reserved or finalized.

`WITNESS` remains in the domain vocabulary for forward compatibility, but merchant invitation issuance rejects it until an authorized-witness policy exists. Return roles are likewise represented by the evidence-session policy but are not issuable from the current transaction-create request, which currently accepts only seller, buyer, and receiver declarations.

## Capability and replay model

Claim and evidence-session tokens are purpose-separated HMAC outputs:

```text
pp_claim_v1_<base64url>
pp_capture_v1_<base64url>
```

The HMAC key is `PARTICIPANT_HANDOFF_SIGNING_SECRET`, stored in Firebase Secret Manager and kept separate from the API credential pepper, public Button handoff key, and evidence-manifest signing key. Firestore stores only SHA-256 token digests. Verification is constant-time. The plaintext token is returned only as part of the creation/replay response and handoff URL.

Merchant creation operations derive stable resource identities from organization, operation key, and canonical request input. An exact retry returns the original resource and deterministic token; changing the request under the same operation key is rejected.

Redemption derives the native capture-session ID from evidence session, actor, and client operation key. If the exact operation is retried after token consumption, the existing capture record is returned with the same nonce. A different operation cannot use an exhausted one-time capability to mint another capture session.

## Persistence and event consistency

The Firestore repository uses transactions to keep each state change consistent with its related legacy fields and integration records:

| Action | Atomic writes |
| --- | --- |
| Invitation | `participantClaims`, transaction claim state, `domainOutbox` |
| Claim | claim status/token deletion, transaction actor/role binding, transaction timeline, `domainOutbox` |
| Session creation | `evidenceSessions`, transaction session linkage, `domainOutbox` |
| Redemption | session state/token deletion/App Check context, legacy `captureSessions`, transaction capture state, timeline, `domainOutbox` |
| Cancellation | session state/token deletion, transaction timeline, `domainOutbox` |

Stored documents contain internal ownership and authorization fields. Repository mapping explicitly selects the public DTO fields rather than spreading Firestore data into API responses. Firestore Security Rules deny client reads and writes to both `participantClaims` and `evidenceSessions`; access is mediated by trusted server code.

## Threat decisions

| Threat | Control | Remaining boundary |
| --- | --- | --- |
| Merchant email/ID impersonates a user | Explicit signed-in claim; external reference is only a label/hash | Merchant may still invite the wrong real-world person; business dispute handling is separate |
| Stolen link is used anonymously | Firebase identity and App Check are mandatory | A compromised authenticated device/account remains an account-security concern |
| App Check is treated as identity | User token and actor binding are independently required | App Check is app context, not proof of a human or physical item |
| Token database disclosure | Only digests are stored; purpose-separated secret-backed tokens | Active plaintext URLs must still be protected from merchant/client logs |
| Retry creates duplicate capture authority | Stable IDs, request fingerprints, atomic operations, exact replay | Distributed load/abuse capacity is not proven by emulator tests |
| Cross-tenant ID guessing | Every merchant read/mutation is organization-constrained and returns not found | Production IAM and logging still require deployment verification |
| Session authorizes arbitrary evidence | Role/type matrix, transaction requirement subset, capture allowlist | Authorization is not authenticity or relevance of submitted bytes |
| Cancellation erases evidence | Cancellation revokes future capability but does not delete captured records | Retention/deletion policy remains a separate lifecycle concern |

## Evidence meaning

An evidence session in `READY` or `CAPTURING` means that PackProof authorized a bounded acquisition attempt. A capture attestation means PackProof issued a native nonce after successful identity, app-context, actor, token, and lifecycle checks. Neither state means that media exists, uploaded successfully, passed byte-integrity checks, was server-finalized, physically matches another item, is scientifically validated, or is legally admissible.

Those stronger meanings must come only from the later evidence-upload/finalization/manifest and verification pipeline, with explicit assurance dimensions and failure states.

## Proof completed in this milestone

- Domain and application tests cover role/type/artifact/profile constraints, wrong tokens, wrong actors, exact claim replay, exact redemption replay, exhaustion, expiry/cancellation preconditions, and App Check app-ID propagation.
- HTTP tests cover all six operations, stable envelopes, missing App Check rejection, merchant versus participant security, and OpenAPI operation/security completeness.
- Firestore emulator application and HTTP tests prove hashed-at-rest token storage, consumption, actor binding, organization isolation, stable nonce replay, legacy capture allowlists, timeline/outbox linkage, and cancellation.
- Rules tests deny direct client access to claim and evidence-session collections.
- Firebase export smoke tests cover the HTTP function secret binding and App Check-enforced callable exports.

## Not proved here

- No Firebase function, Hosting bridge, rules, or secret was deployed by this work.
- No signed Android build or physical device followed the claim/redemption App Links.
- No real Firebase ID token or App Check token was accepted by a deployed HTTP endpoint.
- No evidence upload, server finalization, manifest generation, callback delivery, load test, penetration test, or production recovery exercise was completed.
- The outbox is written atomically, but production dispatch and callback delivery remain later work.
