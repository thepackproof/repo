# Security model and operating controls

This is an implementation threat model, not a certification, external audit, penetration-test report, FIPS claim, legal opinion, or guarantee of security. The exact signed build, Firebase configuration, privileged access, monitoring, backups, keys, dependencies, and incident operations require separate evidence and independent review.

## Implemented source controls

- Default-deny Firestore and Storage rules with participant-only reads.
- No direct client Firestore workflow writes; state transitions are server-authoritative.
- Firebase Authentication and App Check enforcement on private callable APIs.
- Consumed App Check token, random nonce, bounded capture window, context binding, expiry, and atomic capture-receipt redemption.
- Project-owned input validation for fields, sizes, enums, timestamps, identifiers, manifest shape, and content-type/evidence-type combinations.
- Android Keystore AES-256-GCM encrypted media and metadata; PPQ1 v2 authenticates its header as associated data.
- Atomic temporary-file handling: unauthenticated plaintext is never committed as a referenced queue file.
- Persistent Android Keystore P-256 key and server verification of an ECDSA signature over the server nonce.
- Retry-stable client evidence identity, immutable request fingerprint, exact-path six-hour reservations, create-only Storage, and a 600 MB limit.
- Independent server streaming SHA-256, byte-length comparison, JPEG/PNG/MP4/PDF magic-byte inspection, and declared/detected media-type comparison.
- Manifest schema 2, strict JCS profile, domain-separated bundle binding, known-answer vectors, and a standalone verifier.
- HMAC-SHA256 manifest service MAC with explicit key ID and service-only scope.
- Transactional, idempotent evidence-record creation; mismatches do not advance workflow states.
- Privacy-minimized ingress subnet HMAC instead of stored raw ingress IP.
- Explicit opt-in before precise location enters a private manifest; presentation dossiers omit it.
- Tracking-barcode observation stored separately from later submitted-tracking comparison.
- Hashed invitation, Connect handoff, and API-key material.
- Merchant API credentials with environment-bound key formats, a separately managed peppered verifier, client/credential scope intersection, revocation/expiry checks, and append-only usage records.
- Organization-constrained merchant transaction repositories, strict response DTOs, and cross-organization not-found behavior to reduce BOLA/IDOR disclosure.
- Required mutation idempotency, canonical request fingerprints, stable retry operation IDs, concurrent leases, payload-conflict rejection, and no time-based expiry while the linked transaction is retained.
- Merchant API request correlation, structured non-secret logs, strict unknown-field rejection, a 256 KiB body limit, security headers, explicit error envelopes, and per-client/operation rate counters.
- Organization audit streams with canonical SHA-256 event hashes and previous-hash linkage for merchant transaction creation.
- Connect callback-origin allowlist, public-HTTPS/DNS checks, exact-body HMAC, stable delivery ID, retry lease, delivered-payload digest, and 15-minute per-attempt dossier URL.
- Return evidence scoped to a Return Passport and linked to a snapshot of prior digital evidence hashes.
- Android data backup disabled because queue ciphertext is installation-key-bound.
- Finalizer removal of client-upload download-token metadata and App-Check/participant-authorized five-minute object links for the app.
- Account-export objects carry a 24-hour record expiry and an hourly server purge job.

## Interpretation limits

- Authentication establishes the signed-in account/provider context, not the person's civil identity, authority, ownership, or honesty.
- App Check / Play Integrity reports provider-backed application/request context, not physical-scene truth.
- The ECDSA result proves possession of the presented private key. `hardwareBacked` comes from client `KeyInfo`; full Android Key Attestation certificate-chain/root/challenge/security-level/revocation verification is absent.
- Motion, network, ingress region, and optional location are context signals. They do not prove human presence, custody, location truth, or an uninterrupted event.
- SHA-256 and GCM detect byte/container changes under their stated assumptions. They do not prove that the scene was truthful, complete, contemporaneous, or unmanipulated before capture.
- HMAC service MACs are not publicly verifiable signatures. The service must retain and govern historical key versions.
- A normalized barcode equality result is not live carrier acceptance, route, weight, possession, delivery, or custody evidence.
- There is no calibrated acquisition-quality gate and no validated physical correspondence matcher in 0.9.5.0.
- A PDF dossier is a presentation derivative. Native media and manifests remain the source records.

## Failure behavior

- Hash, length, or media-type mismatch: retain the object and manifest, mark byte integrity `MISMATCH`, raise an integrity-review event, and do not advance the workflow.
- App/device context unavailable: retain an explicit offline/unavailable reason; never upgrade it after synchronization.
- Queue finalization timeout: retain ciphertext and retry the deterministic server identity.
- Queue authentication/key/authorization failure: retain ciphertext, show attention-required, and stop automatic retry.
- Reused client evidence identity with changed request: reject.
- Replayed/changed capture receipt: reject.
- Missing physical/acquisition capability: emit `NOT_AVAILABLE` / `NOT_EVALUATED`, never an inferred positive result.

## Threat register

| Threat | Implemented mitigation | Residual risk / required next control |
|---|---|---|
| Dead-zone or interrupted upload | Authenticated local queue, explicit states, deterministic retry, ciphertext retained through finalization | Device/key loss is unrecoverable; complete the runtime fault matrix and support/removal procedure |
| Queue header/tag tampering | PPQ1 v2 AAD, GCM tag verification, atomic output | Rooted process/device compromise and availability attacks remain; perform independent mobile testing |
| Capture-session replay | Consumed App Check token, nonce, context/fingerprint binding, expiry, atomic use | A compromised genuine account/device can still stage a deceptive scene |
| Evidence replacement | Create-only path, deterministic identity, client/server hash/length and magic-byte checks | A user can omit relevant evidence or stage media before capture |
| Duplicate cloud triggers | Deterministic manifest bytes and transactional create/event/state changes | Exercise concurrent duplicate delivery and partial-failure recovery in staging |
| Modified client/runtime | App Check, runtime-metadata continuity, nonce proof | Advanced compromise remains; do not describe metadata fingerprint as a binary measurement |
| Physical package substitution | Human-guided regions and symmetric before/after evidence | No validated physical matcher; physical correspondence remains unavailable |
| Connect API replay | Integration-scoped idempotency and payload conflict detection | Stolen API key can create sessions; add quotas, monitoring, rotation, and environment separation |
| Merchant API BOLA/IDOR | Scope checks plus organization-constrained reads/lists; cross-organization IDs return not found | Extend the authorization matrix to every future evidence, shipment, webhook, and support representation; independently test deployed gateway behavior |
| Merchant credential theft/replay | High-entropy one-time secret, peppered verifier, environment/client/org/status/scope checks, revocation, usage records | Bearer credentials remain replayable if stolen; require rotation operations, anomaly alerting, incident response, and later OAuth/OIDC options |
| Merchant mutation retry/race | Required key, canonical fingerprint, stable operation ID, atomic lease/result, retry-safe create and audit IDs | Retention cleanup must never precede linked transaction/audit retention; exercise multi-region and dependency-failure behavior under load |
| API resource exhaustion | Body limit and Firestore-backed per-operation counters | Firestore counters and audit streams can become hot keys; load-test, alert, and add gateway/distributed enforcement before high-volume onboarding |
| Audit history rewrite | Sequence and previous-hash-linked events | A sufficiently privileged administrator can rewrite both head and history; export to an independently administered immutable sink and monitor chain continuity |
| Callback forgery/replay | Exact-body HMAC, timestamp, stable delivery ID, SDK verifier | Recipient must verify before parsing and persist deduplication state |
| Callback SSRF | HTTPS, origin allowlist, public-address DNS checks on each attempt | DNS rebinding/egress policy remain deployment risks; use controlled egress/address pinning for higher assurance |
| Public dossier leakage | Fresh 15-minute signed URL on each attempt | Recipient handling can leak the URL/file; add revocable authenticated exchange for higher-assurance integrations |
| Service MAC/key compromise | Secret Manager input, key ID, server-only scope | Rotation, historical verification, HSM/KMS, access audit, and compromise response are operational gaps |
| Privileged Firebase mutation | Client rules deny mutation | Project administrators bypass client rules; require separation of duties and independently administered audit export |
| Deletion/retention conflict | Account deletion/export paths and source-linked derivatives | Retention policy is currently `DEFAULT_UNCONFIGURED`; legal hold, regional policy, backup deletion, and restore drills remain gates |

## Deployment controls not proven by source

Before handling consequential evidence, establish and test:

- separate development/staging/production projects, service accounts, and secrets;
- least-privilege administrator/support roles, time-bounded elevation, and immutable external audit export;
- manifest-secret rotation with retained historical key material and a compromise/revocation runbook;
- object/record retention by class, legal hold, regional location, deletion propagation, and backup expiry;
- restore-and-rehash drills for originals, manifests, records, and dossiers;
- dependency/SBOM/vulnerability and signed-release provenance;
- alerting for rules, Functions, finalizer backlog, callbacks, keys, unusual access, and integrity mismatch;
- incident response for evidence, credentials, signing keys, callbacks, provider compromise, and privacy events; and
- an independent mobile/cloud configuration review and penetration test.
