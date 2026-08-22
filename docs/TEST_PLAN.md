# PackProof 0.9.5.0 verification and release plan

This plan distinguishes automated source checks, emulator checks, native build evidence, real-device behavior, live-backend behavior, and controls that require independent or operational evidence. No single passing layer authorizes a broader claim.

## Required evidence record

Record the following for every candidate:

- source commit and source-archive SHA-256;
- dependency lock hashes, Node/Java/Android/Gradle/Kotlin versions, and SBOM or dependency inventory;
- Firebase project/environment identity and exact rules/Functions/Hosting deployment time;
- Android package, version name/code, ABI set, signing-certificate SHA-256, APK/AAB SHA-256, and build log;
- device manufacturer/model, Android version/API, install source, and App Check mode;
- each test ID, operator, start/end time, result, logs/screenshots/artifacts, and linked defect;
- manifest/canonicalization/bundle/capture-profile/queue-container/key ID versions;
- explicitly unavailable, research-only, conditional, and validated capabilities; and
- residual findings, accepted risk owner, rollback path, and revalidation trigger.

Compilation, a prior `BUILD_REPORT.md`, and successful installation are intermediate evidence. Native readiness additionally requires startup UI evidence and logcat review. End-to-end readiness requires a live finalization record and clean-room verification of exported source artifacts.

## Automated local gates

Use Node 22 and Java 21.

```powershell
npm.cmd ci
npm.cmd --prefix functions ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd --prefix functions run build
npm.cmd --prefix functions run lint
npm.cmd run test:evidence-format
npm.cmd run test:evidence-verifier
npm.cmd run test:claims
npm.cmd run test:rules
npm.cmd run test:billing
npm.cmd run test:sdk
npm.cmd run test:api
npm.cmd run test:api:firestore
npm.cmd run test:api:functions
npm.cmd run test:domain
npm.cmd run test:application
npm.cmd run test:ux-flow
npm.cmd run test:rc-e2e
npm.cmd --prefix portal ci
npm.cmd --prefix portal test
npm.cmd --prefix portal run build
npm.cmd run doctor
npx.cmd expo-doctor
```

| ID | Gate | Required result |
|---|---|---|
| AUTO-01 | TypeScript/mobile lint/Functions build | Zero errors; warnings reviewed |
| AUTO-02 | Evidence format vectors | Producer and independent verifier agree on canonicalization, bundle, and deterministic upload identities; malformed inputs fail |
| AUTO-03 | Clean-room verifier | Valid fixture passes; one-byte original mutation fails |
| AUTO-04 | Claim vocabulary | No unbounded prohibited production phrase in scanned runtime surfaces |
| AUTO-05 | Firestore/Storage rules | Cross-participant access fails; client writes fail; reservation/type/path/expiry/size checks and create-only objects pass |
| AUTO-06 | Billing reducer | Idempotency, ordering, entitlement isolation, expiration, transfer, and malformed payload tests pass |
| AUTO-07 | Connect SDK | Request/error path plus exact-body HMAC positive, body mutation, signature mutation, and replay-window tests pass |
| AUTO-08 | Configuration doctor | No missing required project/app/service file or unresolved public placeholder for the target environment |
| AUTO-09 | Expo dependency alignment | Expo Doctor reports compatible dependency/config state |
| AUTO-10 | Merchant API unit/HTTP/OpenAPI | Contract parses; strict request/error/response behavior, scopes, BOLA denial, exact/conflicting/concurrent idempotency, cursor binding, request limits, rate responses, and request IDs pass |
| AUTO-11 | Merchant API Firestore integration | Real emulator transactions/queries preserve one stable retry ID, exact replay, failed-attempt recovery, org isolation, credential revocation, no raw credential/key storage, rate counters, and recomputable audit hashes |
| AUTO-12 | Firebase Function/Hosting configuration smoke | The compiled Firebase entrypoint loads; the Gen 2 HTTP export metadata, region, Secret Manager declaration, resource settings, and Hosting rewrite target are correct |
| AUTO-13 | Web portal independent build | `portal/` typecheck, Next Action/invariant tests, and Vite build pass without compiling the Expo app; portal source does not import Firestore or Storage |
| AUTO-19 | Release-candidate source journey | One fixture walks intake, Next Action roles, eligibility, Proof JSON, PDF, stranger denial, and non-verdict copy. Passing this gate does not satisfy E2E-01..10 or AND-01..07 |

## Release-candidate source journey

`npm run test:rc-e2e` is source evidence that Android, backend, portal, intake, and Proof still describe the same transaction. It is not a live two-device run, not a sandbox deploy, and not a launch claim.

| ID | Invariant | Required result |
|---|---|---|
| RC-S-01 | Order information enters | Labeled receipt fields parse; an unlabeled money token does not invent a title |
| RC-S-02 | Source is preserved | User-provided correspondence is `USER_PROVIDED_COMMERCE_ARTIFACT` and cannot authoritatively bind an order |
| RC-S-03 | Participants agree to terms | Seller invites and packs; buyer confirms; `TERMS_LOCKED` does not open a Proof |
| RC-S-04 | Native capture records evidence | Finalized packing artifact carries file and manifest SHA-256 |
| RC-S-05 | Interrupted uploads recover | Queue crash recovery retains ciphertext |
| RC-S-06 | Backend finalizes evidence | `QUARANTINED` is not a finalized manifest artifact |
| RC-S-07 | Canonical eligibility | `PACKED` without a commerce source and artifact is not eligible; the same transaction with both is |
| RC-S-08 | Proof is issued | `ppt_` / `PP-` identity is stable for the transaction |
| RC-S-09 | Same Proof everywhere | PDF title contains the same display ID as canonical JSON |
| RC-S-10 | Unauthorized retrieval fails | Only `participantIds` may read the Proof; `getPackProofPassport` enforces that |
| RC-S-11 | No surface declares who is right | Comparisons are never `MATCH`; limitations refuse fraud, fault, and authenticity |

## Merchant API deployment acceptance

Source and emulator tests do not prove that the HTTP function, Hosting rewrite, Secret Manager binding, indexes, IAM, or monitoring work in a deployed environment. For each sandbox and production candidate, record these separately.

| ID | Scenario | Required result |
|---|---|---|
| API-01 | Deploy `packproofApi`, `/v1/**` Hosting rewrite, and indexes to the named environment | Deployment revision, project, region, index state, and configuration recorded |
| API-02 | Call health and readiness through both Hosting and direct function origins | Stable v1 response and request ID; readiness fails closed when Firestore is unavailable |
| API-03 | Provision a scoped credential; inspect persisted documents | Raw secret absent; verifier, client/org/environment/scope/status binding present; one-time key stored only in merchant secret manager |
| API-04 | Missing, malformed, wrong-environment, wrong-secret, expired, revoked, and insufficient-scope credential | Rejected with the documented status/envelope; no sensitive detail or raw token appears in application logs |
| API-05 | Create, exact replay, same-key/different-payload, simultaneous replay, and lost-response retry | Exactly one transaction/audit event; exact result replayed; conflict and in-progress behavior match contract |
| API-06 | Retrieve/list as owning org, unrelated org, guessed ID, malformed ID, and modified cursor/filter | Only owning org succeeds; no cross-tenant metadata is disclosed |
| API-07 | Burst each operation beyond its documented threshold | `429`, retry/rate headers, counters, logs, latency, and recovery are correct; no dependency saturation |
| API-08 | Recompute every event hash and stream linkage after create workload | Every sequence and hash link verifies; duplicate retries do not add duplicate creation events |
| API-09 | Load and failure injection at expected onboarding volume | Latency/error budgets hold; Firestore hot-key, audit-stream, credential-usage, and index behavior are measured |
| API-10 | Dependency/advisory, secret, and static scans | Findings recorded with severity, reachability, owner, disposition, expiry, and revalidation trigger |

## Native build and startup

| ID | Procedure | Required evidence |
|---|---|---|
| AND-01 | Generate a clean Android project from the exact candidate at a short Windows path | Prebuild log and candidate commit |
| AND-02 | Build ARM64 debug/preview APK with JDK 21 and target API 36 | Successful Gradle log, APK metadata, hash, and ABI inspection |
| AND-03 | Install on a physical API-26+ Android device | `adb install` result and installed package/version/signature |
| AND-04 | Cold-start with disabled optional Facebook/TikTok/RevenueCat flags | Visible startup/sign-in UI; no missing native-module exception |
| AND-05 | Inspect logcat from process launch through first interaction | No fatal exception, native module load failure, Firebase package mismatch, or repeated React error |
| AND-06 | Exercise Google sign-in and sign-out | Account screen evidence and clean auth logs |
| AND-07 | Verify App Link from an external source | Exact domain/package/signing-certificate association and native route |

Do not label an APK externally demonstrable if AND-03 through AND-05 have not passed on the artifact being handed off.

## Two-party live-backend journey

Use two ordinary test accounts and preferably two physical devices. Do not use customer evidence. AUTO-19 does not satisfy this section.

| ID | Scenario | Expected result |
|---|---|---|
| E2E-01 | Seller creates/edits unlocked terms and issues invitation | Server writes record; one-use invite contains no reusable plaintext secret in Firestore |
| E2E-02 | Buyer joins; third account replays invitation | Buyer succeeds once; replay/third account fails |
| E2E-03 | Each participant confirms terms | State reaches `TERMS_LOCKED` only after both confirmations |
| E2E-04 | Seller performs online packing-video capture | Capture receipt uses fresh App Check; manifest records v2 capture/time/profile/context fields |
| E2E-05 | Queue uploads and Storage finalizer completes | Ciphertext remains until Firestore evidence exists; record has exact hashes/length/type, service MAC/key ID, and six assurance dimensions |
| E2E-06 | Submit shipment | Requires a finalized packing record without byte-integrity mismatch; barcode comparison remains separately labeled |
| E2E-07 | Buyer unboxes/receives; both complete | Authorized states and events only; no client-side workflow writes |
| E2E-08 | Generate presentation dossier | PDF opens, has source bundle hashes/derivative metadata, excludes precise location, and contains required limitations |
| E2E-09 | Start, authorize, ship, receive, and complete return | Correct physical roles; finalized integrity-acceptable return packing required before shipping |
| E2E-10 | Export and delete test account | Export inventories metadata; deletion behavior matches policy, holds, and object/report cleanup expectations |

## Exact-byte and media negative tests

These tests should run in a controlled staging harness or emulator integration fixture; never alter real customer evidence.

| ID | Mutation | Expected result |
|---|---|---|
| INT-01 | Upload exact original | Client/server SHA-256 and byte length match; type detected; byte integrity `MATCHED` |
| INT-02 | Flip one original byte after client hash | Finalized quarantine record, `MISMATCH`, no workflow advance |
| INT-03 | Truncate/append one byte | Length/hash mismatch, quarantine, no workflow advance |
| INT-04 | Declare JPEG for PNG/PDF/MP4 bytes | Media-type mismatch, quarantine, no workflow advance |
| INT-05 | Unknown/polyglot prefix under an allowed declaration | Type not established/mismatch; no workflow advance; parser review logged |
| INT-06 | Reuse one `clientEvidenceId` with a changed manifest/name/hash | `failed-precondition`; original reservation/evidence unchanged |
| INT-07 | Repeat the same request before upload, during processing, and after finalization | Same upload ID/path; `READY`, `PROCESSING`, then `FINALIZED`; no duplicate record |
| INT-08 | Deliver duplicate Storage finalizer events concurrently | Identical canonical manifest/digests; one evidence/event/state transition |
| INT-09 | Crash after object creation but before client observes Firestore | Queue retained; next sync polls the same identity and eventually completes without overwrite |

## Canonicalization and verifier tests

Cover valid and invalid cases across the producer plus at least one genuinely independent language/runtime before a high-assurance external-verification claim:

- key ordering including non-ASCII UTF-16 order;
- string escaping, control characters, valid surrogate pairs, and rejection of unpaired surrogates;
- nulls, booleans, dense arrays, nested objects, and rejection of sparse/undefined/non-plain values;
- zero, negative zero, decimal/exponent boundaries, IEEE-754 rounding, and rejection of NaN/infinity;
- UTF-8 bytes with no BOM/trailing newline;
- exact schema/profile/version labels;
- fixed-length binary digest binding, domain separation, wrong algorithm, wrong digest length, and downgrade attempts;
- historical v1 verification kept separate from v2; and
- correct and incorrect expected manifest/bundle/MAC values.

The repository's current automated producer/verifier test uses two independent JavaScript implementations plus known-answer values. Cross-language conformance remains a release gate for claims requiring it.

## Offline queue fault matrix

| ID | Fault point | Expected result |
|---|---|---|
| Q-01 | Airplane mode before capture | Capture can be explicitly `OFFLINE_UNATTESTED`; encrypted item is visible; no upload claim |
| Q-02 | App Check/provider unavailable online | Bounded fallback records `ATTESTATION_PROVIDER_UNAVAILABLE`, or a non-provider error blocks capture |
| Q-03 | Kill process during encryption | No referenced partial container/plaintext; next launch reports only committed records |
| Q-04 | Kill after queue commit/before original deletion | No plaintext remains after recovery cleanup; ciphertext persists |
| Q-05 | Lose network during upload | Create-only object is never overwritten; retry uses same identity |
| Q-06 | Kill while awaiting finalization | Ciphertext persists; next launch obtains `PROCESSING`/`FINALIZED` and reconciles |
| Q-07 | Expire reservation | Same fingerprint extends expiry without rewriting original grant context |
| Q-08 | Mutate PPQ1 v2 magic/version/IV length/tag/ciphertext | Decryption fails closed; no committed plaintext; attention-required remains visible |
| Q-09 | Migrate a valid PPQ1 v1 item | Decrypts with `authenticatedHeader: false`; re-encryption policy is explicit |
| Q-10 | Invalidate/delete Keystore key | Terminal/attention state; no success claim; support/removal decision required |
| Q-11 | Device reboot and multiple accounts/items | Correct owner items sync; cross-account item cannot upload |
| Q-12 | App update, backup/restore, clear, uninstall/reinstall | Backup is disabled; unrecoverable-loss behavior matches warnings |
| Q-13 | Disk exhaustion at each write | Atomic failure; no partial referenced file or ambiguous finalized state |

## Attestation and time tests

| ID | Scenario | Expected result |
|---|---|---|
| AT-01 | Valid online token/session/nonce/context | Online App Check state; key possession only if server signature verification passes |
| AT-02 | Replayed consumed App Check token | Session issuance fails |
| AT-03 | Expired capture receipt | Grant fails |
| AT-04 | Changed user/transaction/return/Connect context | Grant fails |
| AT-05 | Changed runtime metadata fingerprint after issuance | Grant fails |
| AT-06 | Forged device-key signature | Grant fails |
| AT-07 | Software key or forged `hardwareBacked` Boolean | May remain a client signal; must never become remotely proven hardware attestation |
| AT-08 | Clock moves during offline capture | Wall time stays untrusted; monotonic inconsistency is explicit; later receipt does not upgrade capture time |
| AT-09 | Delayed offline synchronization | Remains `OFFLINE_UNATTESTED`; server receipt is later and separately labeled |

## Connect tests

| ID | Scenario | Expected result |
|---|---|---|
| CON-01 | Same idempotency key/payload | Same session and capture URL |
| CON-02 | Same key/different payload | HTTP 409 |
| CON-03 | Non-HTTPS, credentialed, non-allowlisted, private, or mixed DNS destination | Rejected |
| CON-04 | Ready digital evidence | `packproof.evidence.finalized`, bounded ready status, reason codes including unavailable physical correspondence |
| CON-05 | Any hash/length/type/attestation/tracking limitation | `DIGITAL_EVIDENCE_WITH_LIMITATIONS`; no collapsed positive verdict |
| CON-06 | Callback body/signature/timestamp/delivery replay mutation | Recipient rejects |
| CON-07 | Callback fails repeatedly | Stable delivery ID, leased retries, fresh 15-minute dossier URL, delivered-payload digest on success |
| CON-08 | Dossier byte mutation | Recipient's `dossierSha256` comparison fails |

## Privacy, governance, and privileged-operation tests

- Cross-participant and cross-tenant Firestore/Storage reads fail.
- Signed dossier URLs expire; higher-assurance revocation requirements are documented.
- Optional location denied/disabled still permits capture, and dossiers omit coordinates.
- Account export/deletion, linked object/manifest/report cleanup, retention, legal hold, regional policy, and backup expiry reconcile.
- Privileged administrator mutation is detected by independently administered audit export.
- Manifest key rotation preserves historical verification and records key ID; compromised key response is exercised.
- Restore a backup into an isolated environment, rehash every original/manifest/dossier, and reconcile record counts/digests.
- Generate and review an SBOM/dependency audit; resolve or accept findings with an owner and expiry.

Several of these are deployment/organizational controls and are not satisfied by the repository alone.

## Physical/scientific release gate

Version 0.9.5.0 must show:

- `physicalCorrespondence.status = NOT_AVAILABLE`;
- `acquisitionQuality.status = NOT_EVALUATED`;
- no production `MATCH` or `NON_MATCH` output;
- no accuracy, liveness, uniqueness, authenticity, legal, chargeback, or guaranteed-outcome claim.

Do not enable a physical result until every applicable `MUST-PHYSICAL`, `VALIDATION`, and independent gate in [`WHITEPAPER_COMPLIANCE.md`](WHITEPAPER_COMPLIANCE.md) has current evidence for the exact frozen build/model/protocol/population.

## Release labels

| Label | Minimum meaning |
|---|---|
| `SOURCE_CHECKED` | Automated source gates passed only |
| `APK_BUILT` | Exact source assembled; metadata and checksum recorded |
| `DEVICE_STARTUP_CHECKED` | Exact APK installed, startup UI observed, and logcat reviewed on a named device |
| `LIVE_DIGITAL_PATH_CHECKED` | Exact APK completed a live upload/finalization/export verification with recorded artifacts |
| `EXTERNAL_DEMO_CANDIDATE` | Two-party journey and relevant failure paths passed; known limitations disclosed |
| `PRODUCTION_APPROVED` | Organization-defined operational, privacy, legal, security, provider, and independent gates approved in addition to the above |

No label in this plan authorizes a physical-matching or scientific-performance claim.
