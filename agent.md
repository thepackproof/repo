# PackProof Launch-Readiness and Demonstration Execution Plan

**Authority (updated 2026-08-22):** Development and hardening sequencing is controlled by [`docs/architecture/HARDENING_AND_RELEASE_ARCHITECTURE_PLAN.md`](docs/architecture/HARDENING_AND_RELEASE_ARCHITECTURE_PLAN.md) and [`ADR 0016`](docs/adr/0016-one-fact-one-state-one-eligibility-one-proof.md). This file remains the controlling document for `DEMO_READY` / `LAUNCH_READY` / `LAUNCHED` claim vocabulary, Play/sandbox G-gates, and stop conditions after the hardening release gate is met.

**Effective date:** 2026-08-13  
**Hardening override:** 2026-08-22 (owner-approved replacement of development order)

**Repository:** `C:\src\PackProof\repo`

**Initial platform:** Android

**Current default branch:** `master`
**Current planning baseline:** commit `db69eef11890fc5d566795d92d40740a21f82308` ([`docs/architecture/HARDENING_BASELINE_2026-08-22.md`](docs/architecture/HARDENING_BASELINE_2026-08-22.md))

New product surfaces, evidence semantics, Proof meanings, Enterprise modes, and AI/CV work are frozen until the hardening release-gate statements are demonstrably true. Launch claims in this file still use the evidence vocabulary below. They are not a permission to add features during HC-1.

Historical baselines, completion records, ADRs, architecture documents, test plans, Play checklists, and demo runbooks remain evidence and technical references. They do not override the hardening development order or this file’s claim vocabulary.

## 1. Mission and required outcomes

Bring PackProof to two distinct, evidence-backed states in order:

1. **DEMO_READY:** A repeatable two-party PackProof transaction runs on signed Android builds against an isolated live Firebase sandbox. The run includes invitation or claim, mutual terms, native capture, offline queue recovery, upload, observable server finalization, manifest and dossier generation, and negative security and integrity cases.
2. **LAUNCH_READY:** The exact accepted source is rebuilt as a production Android App Bundle, delivered through Google Play testing, validated with Play signing, App Check, App Links, legal and store declarations, monitoring, rollback controls, and closed-test acceptance.
3. **LAUNCHED:** The accepted Play artifact is promoted through a monitored staged production rollout without crossing a rollback threshold.

These states are not interchangeable. A polished walkthrough is not production proof. A successful build is not device proof. A Storage upload is not evidence finalization. A source test is not a live-service test.

## 2. Claims and trust boundary

PackProof is neutral, evidence-based infrastructure for e-commerce. It records participant submissions, observable capture context, integrity results, bounded comparison measurements, and an auditable history. It does not advocate for a seller, buyer, merchant, carrier, marketplace, payment provider, or claimant, and it does not convert evidence into an accusation, risk label, recommended disposition, or finding of fault.

PackProof may describe itself as a system for creating a shared, private record of transaction terms, capture context, server-computed byte hashes, service-authenticated manifests, timeline events, and presentation dossiers when those functions have passed the applicable gates.

PackProof must not claim, imply, or visually suggest that it:

- authenticates an item or person;
- proves that a physical package is the same object observed earlier;
- establishes uninterrupted physical custody;
- independently determines fraud, ownership, condition, value, or legal responsibility;
- identifies which participant caused an observed condition, discrepancy, interruption, or variance;
- labels a participant or transaction as honest, dishonest, suspicious, fraudulent, abusive, or at fault;
- recommends or automatically determines a refund, return, chargeback, account action, claim outcome, or other commercial/legal disposition;
- provides escrow, insurance, shipping, appraisal, or payment protection;
- guarantees recovery, dispute outcomes, carrier acceptance, marketplace acceptance, insurer acceptance, or legal admissibility; or
- operates a validated physical matcher unless implementation-specific scientific validation has passed and production activation is separately approved.

Physical correspondence remains `NOT_AVAILABLE` unless a later approved plan supersedes that state with evidence.

## 3. Current baseline snapshot

This table is a dated planning snapshot. Reverify every row before relying on it during execution.

| Area | Status on 2026-08-13 | Launch implication |
|---|---|---|
| Repository | Clean `master`; local and remote `master` at `7acf794` | Suitable starting source identity |
| Current source gates | Typecheck, lint, Functions build, 28 domain tests, 8 application tests, 14 API/OpenAPI tests, evidence, verifier, claims, billing, and SDK tests passed | `SOURCE_CHECKED` only |
| Emulator gates | Previously documented as passed; not rerun during plan creation | Must rerun from the candidate |
| GitHub CLI | Installed but not authenticated | Cannot verify Actions, protection, environments, or secrets |
| Firebase CLI | Stored credentials expired | Cannot verify projects, deployments, IAM, secrets, App Check, or logs |
| EAS | Authenticated under the PackProof organization | Build management is available |
| Existing production AAB | EAS build 5 completed from commit `b7a9785` | Historical build evidence; not the final accepted artifact |
| Connected Android devices | None visible through ADB | Physical-device gates are pending |
| Configuration doctor | Zero blockers and eight warnings | Legal placeholders, App Links, billing, and cloud verification remain |
| Root/mobile audit | 15 high and 9 moderate findings | Fix or document runtime reachability before release |
| Functions audit | 7 moderate findings | Remediate or explicitly accept with evidence |
| Public pages | Five legal or launch placeholders | Public and Play launch blocker |
| Android App Links | Signing-certificate association missing | Deep-link flows are not launch-proven |
| App Check | Source integration exists; live registration and enforcement unverified | Sandbox and production acceptance blocker |
| Canonical domain outbox | Atomic records exist; general dispatcher is incomplete | Do not claim general webhook delivery |
| Billing | Disabled while draft store copy describes Pro | Must either activate and test or remove claims |

## 4. Intended initial release scope

### 4.1 Required baseline

The initial Android launch baseline includes:

- Google sign-in;
- Firebase Authentication and App Check;
- seller transaction creation;
- buyer invitation or participant claim;
- mutual terms confirmation;
- packing and unboxing capture;
- continuous packing capture that records the observable item, placement into the package, closure, label application, a human-reviewable `PP` mark spanning the label/package boundary, tape sealing, and a high-resolution end-of-capture reference image;
- recipient arrival/unboxing capture that preserves a high-resolution observation of the corresponding package and seal regions for side-by-side human review without an automated physical conclusion;
- Android Keystore-backed offline evidence retention;
- live upload and observable server finalization;
- server SHA-256 and service-authenticated manifest generation;
- explicit digital byte, size, or media-type mismatch quarantine or failure;
- transaction timeline and shipment recording;
- Return Passport workflow;
- evidence dossier generation and private download;
- concern reporting and participant blocking;
- account export and deletion;
- the public PackProof Button or handoff on an allowlisted demonstration origin;
- merchant transaction API authentication, authorization, idempotency, and tenant isolation; and
- monitoring, retention, incident, and rollback controls.

### 4.2 Feature-gated scope

The following functions remain in the product roadmap but must be hidden and excluded from launch claims until their separate gates pass:

- Meta sign-in;
- TikTok sign-in;
- PackProof Pro and RevenueCat billing;
- general merchant webhook delivery;
- commerce-platform-specific adapters; and
- production activation of SISV comparison measurements before the implementation-specific comparison engine, supported-device/material policy, thresholds, and validation gates pass. SISV algorithm development is a post-launch research program and is not a day-one release blocker. The launch workflow preserves consent-governed originals that may support later research, but customer evidence may not be used for model development without a separate affirmative research consent and approved retention/governance policy. SISV may never emit or drive fault, fraud, tamper-cause, authenticity, custody, risk, enforcement, payment, refund, claim, or liability conclusions, even after validation.

Do not delete future-scope work merely to pass a gate. Preserve it behind an explicit configuration boundary and test that the disabled path cannot break startup or core behavior.

### 4.3 Required product decisions

Record these decisions before freezing the first release candidate:

1. **Pro at initial launch:** Recommended default is disabled with every Pro and pricing claim removed. If enabled, purchase, restore, renewal, cancellation, expiration, transfer, localized price, webhook authorization, and Firebase UID binding become release blockers.
2. **General webhooks at initial launch:** If advertised, implement the complete dispatcher described in Gate 6. Otherwise, confine callback claims to the exact PackProof API behavior that is tested.
3. **Live auth providers:** Recommended baseline is Google sign-in only. Any additional provider must pass provider approval, redirect, deletion, account-linking, and non-admin-user tests.

## 5. Evidence vocabulary

Use only these statuses in plans, issue reports, release records, and handoffs:

| Status | Meaning |
|---|---|
| `SOURCE_CHECKED` | Static, build, unit, contract, or local source test passed |
| `EMULATOR_CHECKED` | Required behavior passed against named local emulators |
| `SANDBOX_DEPLOYED` | Exact source was deployed to the named live sandbox |
| `SANDBOX_CHECKED` | Required live sandbox behavior passed with traceable evidence |
| `PASSED_ON_DEVICE` | Exact identified binary passed on the named physical device |
| `PLAY_INTERNAL_CHECKED` | Play-delivered internal-test artifact passed acceptance |
| `CLOSED_TEST_CHECKED` | Closed-test artifact and operating thresholds passed |
| `LAUNCH_READY` | Every pre-production gate and sign-off passed |
| `LAUNCHED` | Staged production rollout completed within thresholds |
| `FAILED_WITH_EVIDENCE` | Gate failed and the concrete evidence is recorded |
| `NOT_YET_TESTED` | No valid evidence exists for the claimed environment |
| `NO_VALIDATED_PHYSICAL_MATCHER_ENABLED` | Physical correspondence remains unavailable |

Never convert an unknown or untested state into a pass because source looks correct, a prior version passed, or a UI reports success.

## 6. Ownership and change control

### 6.1 Single release captain

One named release captain owns:

- Firebase writes and deployments;
- Secret Manager and IAM changes;
- GitHub production environment approvals;
- EAS production builds;
- Play submissions and staged rollout;
- schema or rules migrations;
- physical-device state; and
- release acceptance and rollback decisions.

Parallel work may inspect or test independent surfaces. Do not allow multiple agents to mutate Firebase, secrets, deployments, EAS credentials, Play state, or the same device concurrently.

### 6.2 Agent authority

Agents may, within an approved gate:

- inspect source and external state;
- implement scoped repository changes;
- run local and emulator tests;
- prepare infrastructure and release scripts;
- create sandbox data and perform sandbox deployment after the release captain confirms the target;
- build preview artifacts; and
- assemble proof records.

Agents must stop for owner action or explicit authority before:

- accepting a materially new legal or commercial obligation;
- selecting an unknown production project;
- provisioning or rotating a production secret without a confirmed destination;
- enabling App Check enforcement in production;
- submitting or promoting a Play production release;
- deleting production data;
- clearing application data or uninstalling from a device that may hold unsynchronized evidence; or
- changing launch scope in a way that materially alters product claims.

### 6.3 Secret handling

- Never store or print raw secrets, passwords, OAuth tokens, API keys, signing keys, or unrestricted signed URLs.
- Record secret names, key IDs, versions, destinations, and rotation status only.
- Prefer short-lived workload identity for CI over long-lived deployment tokens.
- Never place merchant secrets, webhook secrets, or service-signing secrets in browser or mobile bundles.

## 7. Gate execution protocol

For every gate, the acting agent must:

1. Reconfirm target environment, source commit, and owner.
2. State the objective and exact proof required.
3. Record preconditions and any assumptions.
4. Run the smallest useful vertical proof before broadening.
5. Preserve logs, IDs, hashes, screenshots, and negative results.
6. Classify the result using the evidence vocabulary.
7. Stop on a failure that invalidates downstream work.
8. Record rollback instructions before any external mutation.
9. Update this plan's separate execution record; do not rewrite historical evidence.
10. Advance only when every exit criterion is satisfied.

## 8. Critical path

The required order is:

1. Gate 0 - Launch contract
2. Gate 1 - Access and environment control
3. Gate 2 - Release-quality source baseline
4. Gate 3 - Live sandbox deployment
5. Gate 4 - Exact signed Android candidate
6. Gate 5 - Evidence-vault two-party live core flow
7. Gate 6 - Security and operations acceptance
8. Gate 7 - Repeatable stakeholder demonstration
9. Gate 8 - Play internal and closed testing
10. Gate 9 - Staged production rollout

If a later gate reveals an assumption failure, return to the earliest affected gate. Do not patch around a shared blocker in the demonstration environment.

# Gate 0 - Freeze the launch contract

**Objective:** Establish one precise initial-release promise and prevent unproved features from entering public claims.

**Estimated effort:** 0.5 to 1 working day.

## Required work

1. Confirm Android as the first production platform.
2. Record sandbox and production Firebase project IDs.
3. Decide Pro-at-launch, webhook-at-launch, and live auth providers.
4. Define supported Android versions and device classes.
5. Freeze the demonstration scenario and evidence types.
6. Reconcile website, in-app, API, SDK, demo, and Play claims with `docs/CLAIMS_REGISTER.json`.
7. Name the release captain and sign-off owners.

## Required evidence

- Approved launch-scope record.
- Feature matrix containing `IN_SCOPE`, `FEATURE_GATED`, or `POST_LAUNCH` for every visible feature.
- Approved claim vocabulary.
- Named release captain and legal/product/security sign-off owners.

## Pass criteria

- Every visible feature has an owner, runtime boundary, test path, and claim boundary.
- Billing and webhook decisions are explicit.
- No launch surface describes an unavailable function.

## Stop conditions

- Production and sandbox cannot be named exactly.
- Feature claims remain inconsistent across app, website, SDK, or store copy.
- No owner will accept release and rollback responsibility.

# Gate 1 - Restore access and establish environment control

**Objective:** Make every cloud, repository, signing, and store destination explicit and recoverable.

**Estimated effort:** 0.5 to 2 working days.

## GitHub work

1. Authenticate GitHub CLI and verify repository ownership and visibility.
2. Inspect recent Actions runs and required checks.
3. Resolve the `master` versus `main` mismatch intentionally.
4. Consolidate duplicate CI workflows.
5. Protect the default branch and require the complete quality workflow.
6. Create protected sandbox and production deployment environments.
7. Require release-captain approval for production.

## Firebase and Google Cloud work

1. Reauthenticate Firebase CLI.
2. Inventory Firebase and Google Cloud projects, billing accounts, owners, regions, and service accounts.
3. Confirm complete sandbox and production data separation.
4. Inventory deployments, rules, indexes, Hosting releases, App Check registrations, and Secret Manager metadata.
5. Review least-privilege IAM.
6. Replace long-lived `FIREBASE_TOKEN` deployment where practical with GitHub OIDC and Google Cloud Workload Identity Federation.
7. Establish distinct sandbox and production deployment identities.

## EAS and Play work

1. Confirm the `packproof-llc` project owner.
2. Audit build credentials and keystore ownership.
3. Verify package identity and Play Console application.
4. Confirm Play App Signing.
5. Record upload-certificate and Play app-signing SHA-256 fingerprints.
6. Confirm at least two secured company owners.

## Required secret and configuration inventory

- `MANIFEST_SIGNING_SECRET`
- `WEBHOOK_SIGNING_SECRET`
- `API_CREDENTIAL_PEPPER`
- `PUBLIC_HANDOFF_SIGNING_SECRET`
- `PARTICIPANT_HANDOFF_SIGNING_SECRET`
- Optional-provider secrets only when enabled
- `API_ENVIRONMENT`
- `MANIFEST_SIGNING_KEY_ID`
- `PUBLIC_APP_URL`
- `CONNECT_LINK_BASE_URL`
- Provider redirect URLs

## Required evidence

- Access and ownership matrix.
- Exact project and environment IDs.
- IAM review record.
- CI protection and approval configuration.
- Secret name and version matrix without secret values.
- Signing fingerprint record.
- Branch and workflow decision.
- Tested rollback identity.

## Pass criteria

- Every destination is explicit.
- CI cannot deploy production from an unprotected branch.
- Sandbox and production are separate.
- Signing and deployment identities have accountable owners.

## Stop conditions

- A secret is present in source, logs, browser code, or mobile code.
- Production depends on an unknown or unowned personal account.
- Signing-key or package ownership is unclear.
- The release operator cannot identify a safe rollback identity.

# Gate 2 - Produce a release-quality source baseline

**Objective:** Turn current source into a reproducible, reviewable, security-triaged release candidate.

**Estimated effort:** 2 to 6 working days.

## Clean-room validation

Run from a clean checkout:

```powershell
npm.cmd ci
npm.cmd --prefix functions ci
npm.cmd run typecheck
npm.cmd run lint
npm.cmd --prefix functions run build
npm.cmd run generate:openapi-sdk
npm.cmd run test:domain
npm.cmd run test:application
npm.cmd run test:api
npm.cmd run test:api:firestore
npm.cmd run test:application:firestore
npm.cmd run test:api:functions
npm.cmd run test:rules
npm.cmd run test:evidence-format
npm.cmd run test:evidence-verifier
npm.cmd run test:claims
npm.cmd run test:billing
npm.cmd run test:sdk
git diff --check
```

Also run secret-pattern scanning, dependency audit, generated-artifact reproducibility, and an SBOM or equivalent shipped-dependency inventory.

## Dependency remediation cohorts

Do not run `npm audit fix --force`.

1. Expo, Metro, configuration, and build tooling.
2. React Native, Reanimated, Worklets, and native runtime dependencies.
3. RevenueCat and billing dependencies.
4. Firebase Admin, Firebase Functions, Cloud Storage, UUID, and retry dependencies.

After each cohort, rerun the clean suite and build a preview artifact. If native runtime dependencies changed, repeat device startup, camera, and secure-file tests before accepting the cohort.

## Release threshold

- Zero unresolved critical vulnerabilities.
- Zero unresolved high vulnerabilities reachable in shipped mobile or backend runtime.
- Any high finding shown to be build-time-only or unreachable has written, time-bounded risk acceptance.
- Moderate findings have named owners and target versions.
- No unreviewed secret-pattern result.
- No untracked release input.

## Repository hygiene

1. Decide whether `functions/lib` remains tracked or is reproducibly generated by CI and predeploy.
2. Establish a line-ending policy in an isolated mechanical change if needed.
3. Verify OpenAPI and Button SDK generation is deterministic.
4. Generate release provenance containing commit, tree, lockfile hashes, tool versions, build profile, app version, version code, artifact digest, signing fingerprint, and deployment IDs.

## Legal and product consistency

Replace all placeholders in:

- `public/index.html`
- `public/privacy.html`
- `public/terms.html`
- `public/community.html`
- `public/delete.html`

Obtain approval for entity identity, privacy, retention, deletion, shared-record redaction, legal hold, international processing, moderation, and billing terms when applicable.

## Pass criteria

- Complete clean CI and emulator suite passes.
- Dependency findings meet the threshold.
- Public placeholders are gone.
- Feature flags, runtime behavior, and public claims agree.
- Candidate commit is clean and immutable.
- An annotated release-candidate tag identifies the source.

## Stop conditions

- A gate passes only with a populated or modified local dependency tree.
- The candidate cannot reproduce generated artifacts.
- A reachable high or critical vulnerability remains unresolved without approval.
- A release binary would be built from a dirty or unidentified tree.

# Gate 3 - Deploy and prove an isolated live sandbox

**Objective:** Establish live backend behavior without risking production data or users.

**Estimated effort:** 1 to 3 working days after access restoration.

## Deployment order

1. Verify sandbox IAM, billing, budgets, and rollback identity.
2. Provision required secret versions.
3. Deploy Firestore indexes.
4. Deploy Firestore rules.
5. Deploy Storage rules.
6. Deploy Functions.
7. Deploy Hosting and `/v1/**` rewrite.
8. Seed controlled test users, organization, API client, integration, publishable key, and exact demo origin.
9. Record source commit, configuration identity, and every deployed revision.

## Live API and rules acceptance

- Health and readiness.
- Merchant credential success and rejection.
- Scope rejection.
- Transaction create, get, and list.
- Exact idempotency replay and conflicting reuse.
- Cross-organization not-found behavior.
- Public handoff CORS and exact-Origin enforcement.
- Participant invitation and claim.
- Evidence-session issue, read, redeem, and cancel.
- Expired, invalid, wrong-actor, and replayed tokens.
- Firestore and Storage unauthorized access.
- Oversized, malformed, and wrong-media requests.
- Hosting rewrites, SDK headers, and signed link behavior.
- Rate limiting and log sanitization.

## App Check and App Links

1. Link the correct Play and Firebase projects.
2. Register the actual preview or internal-test signing SHA-256 fingerprint.
3. Run with enforcement disabled and observe App Check metrics.
4. Confirm valid legitimate traffic and distinguish invalid builds.
5. Enable enforcement in sandbox.
6. Rerun protected Firestore, Storage, callable, and evidence paths.
7. Generate and host `assetlinks.json` from the actual signing identity.
8. Test every supported HTTPS route.

## Observability baseline

Create and test alerts for API 5xx, Function exceptions, finalizer failures, pending evidence age, invalid App Check traffic, Firestore denials, outbox or callback backlog, authentication anomalies, deletion/export failures, and budget thresholds.

## Required evidence

- Deployment manifest.
- Live HTTP transcripts with request IDs.
- App Check registration and metrics.
- Negative authorization and rules results.
- Sanitized log examples.
- Alert test events.
- Rollback commands and prior revision IDs.

## Pass criteria

- Exact candidate source is deployed to the named sandbox.
- Readiness fails closed when required configuration is missing.
- Tenant, token, Origin, App Check, and rules boundaries reject invalid access.
- The deployment can be rolled back by a named owner.

## Stop conditions

- Any cross-tenant access succeeds.
- A wrong Origin receives a public handoff.
- An unregistered build retains protected access after sandbox enforcement.
- The deployment cannot be traced to the candidate commit.
- Production data is required for the demonstration.

# Gate 4 - Build an exact signed Android candidate

**Objective:** Prove the native application from an exact source identity on physical Android devices.

**Estimated effort:** 1 to 3 working days.

## Preview artifact

1. Build a preview APK from the release-candidate tag with production-equivalent native code and sandbox endpoints.
2. Record EAS build ID, Git commit, EAS fingerprint, app version, version code, APK SHA-256, signing-certificate SHA-256, and build environment.
3. Download and independently hash the artifact.
4. Confirm the EAS source commit equals the tagged candidate.

## Device matrix

Use at least:

- one current supported Android device; and
- one lower-bound device, currently Android 8 or later.

Prefer two physical devices at the same time for seller and buyer roles.

For each device record model, OS, security patch, app version, version code, artifact digest, and installation time.

## Device acceptance

- Cold start and logcat.
- Google sign-in.
- App Check or Play Integrity token success.
- Camera and microphone behavior.
- Optional-location behavior.
- Native secure-file module initialization.
- Keystore-backed queue creation and restart survival.
- Network loss and recovery.
- Background and foreground transitions.
- All supported App Links.
- Private signed downloads.
- Account export and deletion entry points.

Do not clear application data or uninstall from a device that may hold unfinalized evidence. Use clean designated devices or profiles.

## Pass criteria

- Exact APK passes on both device classes.
- No startup or native module failure.
- Provenance and signing identity are complete.
- App Check works with the installed artifact.
- Camera and encrypted queue pass on device.
- Device logs contain no tokens or secrets.

## Stop conditions

- APK provenance is incomplete.
- The installed certificate is not the registered App Check or App Links identity.
- The secure queue fails across restart.
- Native startup, camera, or evidence encryption fails.

# Gate 5 - Prove the evidence-vault two-party live core flow

**Objective:** Demonstrate the complete neutral PackProof evidence path with observable server evidence, a human-reviewable package-seal protocol, and expected failures. The day-one value proposition is a structured, tamper-evident digital record that is easier for authorized humans and external processes to review; no SISV algorithmic comparison is required for this gate.

**Estimated effort:** 2 to 5 working days, excluding defect repair.

## Gate 5A - Human-reviewable package-seal evidence

The continuous video is the event-context layer. The seller must visibly place the item in the package, close the package, apply the shipping label, draw the designated `PP` mark across the label/package boundary, apply the prescribed clear tape or seal, and finish with a steady high-resolution view of the marked boundary. The buyer records the corresponding arrival and unboxing observations. PackProof preserves both sets for authorized human review; it does not state whether the package is the same, altered, authentic, or attributable to either participant.

### Required work

1. Add clear in-app instructions for the seller's item-to-package sequence, `PP` boundary mark, tape/seal application, and high-resolution end frame.
2. Bind the seller's continuous packing video and reference still to one transaction, participant, evidence session, and finalized timeline.
3. Add buyer guidance for recording the received package, label/package boundary, visible seams, tape, and unboxing sequence before disposal or alteration of the packaging.
4. Preserve every original through the Android encrypted queue, exact-path upload, server hashing, manifest, and observable finalization path.
5. Present the reference and arrival observations together in the dossier or review view with timestamps and provenance clearly labeled, without a system-generated physical verdict.
6. State that human visual review is contextual and may identify visible similarities or differences but does not establish cause, actor, authenticity, custody, fraud, fault, liability, or disposition.
7. Keep the 15-frame SISV acquisition profile optional and research-only. It is not required to complete a day-one PackProof transaction.

### Gate 5A pass boundary

Gate 5A passes when an exact Android APK produces one server-finalized seller packing video and reference image plus one server-finalized buyer arrival/unboxing record, and an authorized reviewer can locate both records and their provenance without PackProof producing an automated physical conclusion.

## Gate 5B - Two-party live core proof

## Golden-path run

1. Reset the isolated demo tenant with an audited tool that cannot target production.
2. Open the demonstration merchant page.
3. Create a page-declared public handoff through the PackProof Button.
4. Open the handoff on the seller device through an HTTPS App Link.
5. Sign in and redeem the handoff.
6. Review and edit the page-declared transaction details.
7. Create the transaction and participant invitation.
8. Open the invitation or claim link on the buyer device.
9. Sign in and bind the buyer to the intended role.
10. Have both participants review and confirm terms.
11. Create and redeem a packing evidence session.
12. Record native packing evidence, including the visible `PP` label/package boundary mark, tape/seal application, and high-resolution reference view.
13. Interrupt network access.
14. Confirm that encrypted evidence remains queued.
15. Restart the app and restore networking.
16. Synchronize the queue.
17. Observe Storage upload completion.
18. Observe the `onEvidenceUploaded` finalizer.
19. Verify server SHA-256, size comparison, media comparison, manifest digest, bundle digest, service authentication, evidence record, pending-upload consumption, capture-session finalization, timeline event, and correct workflow state.
20. Submit shipment and tracking information.
21. Repeat the session, capture, upload, and finalization path for buyer arrival and unboxing, including clear observations of the received package, boundary mark, tape, and seams.
22. Generate and privately download the evidence dossier.
23. Run the clean-room verifier.
24. Mutate one byte and demonstrate rejection.
25. Complete a Return Passport flow.
26. Exercise concern reporting and participant blocking.
27. Export one account.
28. Complete deletion on a disposable test account.

## Required negative runs

- Cross-organization transaction read.
- Wrong actor, role, purpose, or artifact.
- Expired and replayed tokens.
- Cancelled session attempting capture reservation.
- Wrong public Origin.
- Idempotency key reused with changed input.
- Unauthorized evidence-object access.
- Attempted overwrite of finalized evidence.
- Client hash mismatch.
- Client size mismatch.
- Declared and detected media mismatch.
- Missing or invalid App Check.
- App termination during queue synchronization.
- Duplicate Storage finalization event.
- Invalid callback HMAC when callbacks are in scope.

## Pass criteria

- Three complete golden-path runs pass from clean state.
- At least one run includes offline queue recovery.
- Every capture resolves to observable finalized, failed, or quarantined server state.
- No offline ciphertext is removed before server finalization is observable.
- Every negative case fails as designed.
- Dossier, stored evidence, and verifier results agree.
- The dossier or review view places seller reference and buyer arrival observations in a human-reviewable sequence without an automated physical verdict.
- No hidden Firestore edit is needed.

## Stop conditions

- UI completion is based only on local encryption or upload.
- A queued capture disappears after restart or network failure.
- Duplicate finalizer delivery creates duplicate records or events.
- A mismatch advances the workflow as accepted evidence.
- A role, tenant, token, or object boundary can be crossed.

# Gate 6 - Security, reliability, and operational acceptance

**Objective:** Establish that PackProof can be operated, monitored, recovered, and honestly supported.

**Estimated effort:** 3 to 8 working days.

## General outbox requirement

If general webhooks are in launch scope, implement and test:

- atomic outbox creation;
- leased dispatch and safe lease takeover;
- stable event and delivery identities;
- signed exact-byte payloads;
- idempotent receiver contract;
- bounded exponential retry;
- dead-letter state;
- manual replay;
- endpoint disablement;
- secret rotation;
- delivery history;
- backlog monitoring; and
- retention cleanup.

If this is not completed, remove general webhook claims.

## Security acceptance

1. Threat-model mobile, browser handoff, REST API, callables, Storage finalizer, signed downloads, deployment, and administrative tools.
2. Review least-privilege IAM.
3. Rotate any secret whose provenance cannot be established.
4. Verify log redaction for credentials, tokens, signed URLs, and personal data.
5. Verify no signing or merchant secret ships in APK or browser SDK.
6. Run live sandbox BOLA, replay, concurrency, malformed media, size, rate, and resource-exhaustion tests.
7. Verify deletion, shared-record redaction, retention, and legal hold.
8. Obtain independent security review before unrestricted public rollout where feasible.

## Reliability acceptance

- Duplicate finalizer delivery.
- Crash between Storage work and Firestore commit.
- Idempotency lease expiry.
- Firestore transaction contention.
- Slow or failed callback endpoint.
- Network loss and app termination during upload.
- Signed URL expiration.
- Secret version rollback.
- Rules, index, Functions, and Hosting rollback.
- Partial deployment recovery.
- Export and deletion retry.

## Proposed launch thresholds

- Zero known cross-tenant access defects.
- Zero unexplained evidence loss.
- Zero silently accepted integrity mismatches.
- Every accepted test upload reaches finalized or explicit failed or quarantined state.
- API 5xx below 0.5 percent during the acceptance soak.
- At least 99.5 percent crash-free users during closed testing.
- At least 99.5 percent ANR-free users during closed testing.
- No outbox item exceeds the accepted retry or dead-letter window.
- Alerts reach at least two monitored recipients.
- Restore and rollback rehearsal passes.

## Required evidence

- Threat model.
- Security test report.
- Load and soak report.
- Alert evidence.
- Operations and incident runbooks.
- Rollback rehearsal.
- Data lifecycle test record.
- Residual risk register with owner and deadline.

## Stop conditions

- Any critical or high-severity security or privacy issue is open.
- The system can lose evidence without an explicit failed state.
- Required alerts or rollback procedures are untested.
- Deletion, retention, or shared-record handling contradicts public policy.

# Gate 7 - Package and rehearse the demonstration

**Objective:** Make the accepted core path repeatable for stakeholders without hidden operator intervention.

**Estimated effort:** 1 to 2 working days after Gate 6.

## Demo kit

- Resettable sandbox tenant.
- Two dedicated demonstration accounts.
- One merchant API client.
- One publishable Button integration.
- One approved HTTPS demonstration origin.
- Two designated Android devices.
- Preflight and reset scripts.
- Twelve-minute live runbook.
- Expected IDs and state transitions.
- Troubleshooting decision tree.
- Architecture and claim-boundary visuals.
- Backup recording from the same accepted build and sandbox.
- Prior accepted rehearsal evidence bundle.

A backup recording is contingency material. It is not a substitute for the required live proof.

## Twelve-minute demonstration runbook

| Time | Action | Evidence shown |
|---|---|---|
| 0:00-1:00 | Show build identity, sandbox, and readiness | Commit, version, artifact digest, `/ready` |
| 1:00-2:30 | Merchant page creates handoff | Exact Origin and request ID |
| 2:30-4:00 | Seller opens link, signs in, reviews, and creates transaction | App Link, actor, transaction ID |
| 4:00-5:00 | Buyer claims invitation on second device | One-time claim and role binding |
| 5:00-6:00 | Both participants confirm terms | Mutual confirmation and state |
| 6:00-8:00 | Seller captures while network is interrupted | Native capture and retained encrypted queue |
| 8:00-9:30 | Network returns and server finalizes | Upload, finalizer, manifest, timeline |
| 9:30-10:30 | Show assurance dimensions and hashes | Byte integrity and bounded claims |
| 10:30-11:30 | Generate, download, and verify dossier | Private URL, dossier hash, verifier |
| 11:30-12:00 | Mutate one byte and show rejection | Negative integrity proof |

## Demo-ready pass criteria

- Three consecutive rehearsals pass from clean state.
- At least one rehearsal is independently witnessed.
- No manual database edit is required.
- Server finalization is visible in both app and backend evidence.
- Backup recording matches the accepted build.
- Presenter accurately explains what PackProof proves and does not prove.

When these conditions pass, record `DEMO_READY`. Do not record `LAUNCH_READY` yet.

# Gate 8 - Google Play internal and closed-test acceptance

**Objective:** Validate the exact production artifact as delivered by Google Play and complete launch policy obligations.

**Estimated effort:** 3 to 10 engineering days plus external testing or review time.

## Production artifact

1. Freeze the accepted commit.
2. Build a production AAB from that exact commit.
3. Record EAS ID, commit, version, version code, fingerprint, SHA-256, and signing identity.
4. Upload to internal testing.
5. Install the Play-delivered artifact and rerun the essential live core path.

## Play signing, App Check, and App Links

1. Register the Play app-signing SHA-256 fingerprint in Firebase.
2. Regenerate and publish `assetlinks.json`.
3. Verify every App Link with the Play-delivered build.
4. Observe valid App Check metrics from Play installs.
5. Enable production enforcement only after the impact is understood.
6. Rerun protected Firestore, Storage, Functions, and evidence paths.

## Play content and policy

Complete and verify:

- privacy policy and public deletion page;
- Data Safety declaration based on the final AAB and SDK list;
- content rating and target audience;
- UGC moderation, reporting, and blocking;
- reviewer access instructions;
- financial-features declaration;
- ads and permission declarations;
- support contacts;
- store listing, icon, feature graphic, and final-build screenshots;
- countries and pricing; and
- subscription declarations and license tests if Pro is enabled.

## Testing

- Current Android physical device.
- Supported lower-bound physical device.
- Two-account and two-device core flow.
- Update from prior internal build.
- Offline queue and restart.
- Play pre-launch stability, compatibility, performance, accessibility, and deep-link coverage.
- Actual testing requirement for the developer account.
- License-tester billing flows when applicable.

## Launch-ready pass criteria

- Exact production AAB is accepted on the intended Play test track.
- Play-delivered binary passes the core live flow.
- Pre-launch report has no release-blocking finding.
- Data Safety, permissions, legal text, and store claims match the final binary.
- App Check and App Links work with Play signing.
- Monitoring and rollback are operational.
- Closed-test thresholds pass.
- Legal, product, security, and release owners sign the acceptance record.

When these conditions pass, record `LAUNCH_READY`.

# Gate 9 - Staged production rollout

**Objective:** Release to real users without losing rollback control.

## Rollout sequence

1. Promote to 5 percent.
2. Observe for an approved operating cycle.
3. Promote to 25 percent.
4. Observe.
5. Promote to 50 percent.
6. Observe.
7. Promote to 100 percent.

Use managed publishing so timing is deliberate.

## Monitor during every stage

- Crash-free and ANR-free users.
- API 4xx and 5xx rates.
- Function exceptions.
- Upload and finalization latency.
- Pending evidence age.
- Integrity mismatch rate.
- App Check valid and invalid ratios.
- Authentication failures.
- Firestore and Storage denials.
- Outbox or callback backlog.
- Deletion and export failures.
- Billing discrepancies when enabled.
- Support volume.
- Cloud spend and storage growth.

## Immediate rollback triggers

- Any cross-account data exposure.
- Evidence loss or premature local deletion.
- Silently accepted integrity mismatch.
- Repeated finalizer duplication or corruption.
- Widespread sign-in or App Check rejection.
- Crash or ANR threshold breach.
- Account deletion malfunction.
- Unexpected cost spike.
- Store-policy or legal issue requiring withdrawal.

Mobile rollback cannot instantly remove installed binaries. Backend changes must remain compatible with the current and immediately previous accepted mobile versions.

When staged rollout reaches 100 percent without crossing a threshold, record `LAUNCHED`.

## 9. Completion proof package

The release evidence bundle must contain:

- launch scope and claim register;
- Git commit and annotated tag;
- clean-worktree record;
- CI run links and test counts;
- emulator results;
- dependency audit, SBOM, and risk acceptance;
- Firebase project and deployment IDs;
- Functions, Hosting, rules, and index revisions;
- secret names, key IDs, and version identifiers without values;
- live API transcripts with request IDs;
- App Check metrics;
- APK and AAB hashes;
- EAS build IDs and fingerprints;
- signing-certificate fingerprints;
- device and OS matrix;
- installation and logcat records;
- golden-path transaction and session IDs;
- Storage paths and generations;
- evidence, manifest, bundle, and dossier hashes;
- finalizer logs;
- verifier and one-byte mutation results;
- authorization and replay negatives;
- alerts and rollback rehearsal;
- Play pre-launch report;
- store, policy, legal, security, and product sign-offs;
- demo rehearsal records; and
- production rollout decision log.

## 10. Release decision matrix

| Condition | Demo | Play testing | Production |
|---|---:|---:|---:|
| Source and emulator gates pass | Required | Required | Required |
| Named live sandbox passes | Required | Required | Required |
| Exact APK passes on physical devices | Required | Required | Required |
| Three golden-path runs pass | Required | Required | Required |
| Security and rollback acceptance passes | Required | Required | Required |
| Legal and public placeholders resolved | Recommended | Required | Required |
| Play-delivered AAB passes | Not required | Required | Required |
| Closed-test thresholds pass | Not required | Required to exit | Required |
| Production approval | Not required | Not required | Required |

## 11. First execution tranche

The first authorized execution tranche is limited to:

1. Reauthenticate GitHub and Firebase.
2. Inventory sandbox and production projects and current deployments.
3. Resolve the `master` and `main` workflow mismatch.
4. Decide Pro-at-launch and webhook-at-launch.
5. Replace public legal placeholders with approved content.
6. Run the complete clean-install CI and emulator baseline.
7. Triage root/mobile high advisories by shipped runtime reachability.
8. Freeze and tag `v0.8.5.0-rc.1` only after the gate passes.
9. Deploy only the named sandbox.
10. Produce a traceable preview APK and connect two designated test devices.

This tranche does not authorize production deployment, Play production submission, production App Check enforcement, device-data clearing, or deletion of evidence queues.

## 12. Schedule forecast

These are planning ranges, not promises.

| Milestone | Focused effort |
|---|---:|
| Access, governance, and launch contract | 1-3 working days |
| Release-quality source and dependency baseline | 2-6 working days |
| Live sandbox and exact Android preview | 2-5 working days |
| Two-party core proof and defect repair | 2-6 working days |
| Security and operational acceptance | 3-8 working days |
| Repeatable stakeholder demo | 1-2 working days |
| Play internal and closed acceptance | 3-10 engineering days plus external time |
| Staged production rollout | Approved soak intervals after review |

Working forecast:

- `DEMO_READY`: approximately 7 to 12 focused working days after access and devices are available, if no foundational live defect appears.
- `LAUNCH_READY`: approximately 3 to 6 additional weeks including dependency, legal, Play, security, and soak work.
- `LAUNCHED`: dependent on Play account requirements, review, and staged-rollout results.

## 13. Controlling and supporting documents

This file controls execution order and status.

Supporting technical and acceptance references include:

- `docs/architecture/ARCHITECTURE_CONTRACT.md`
- `docs/CLAIMS_REGISTER.json`
- `docs/TEST_PLAN.md`
- `docs/PLAY_CONSOLE_CHECKLIST.md`
- `docs/DATA_SAFETY_WORKSHEET.md`
- `docs/GOOGLE_PLAY_LISTING.md`
- `docs/SECURITY.md`
- `docs/OFFLINE_EVIDENCE.md`
- `docs/EVIDENCE_FORMAT_V2.md`
- `docs/PHYSICAL_CORRESPONDENCE.md`
- `EXTERNAL_DEMO.md`
- `PC_DEMO.md`

Official platform references:

- Firebase App Check with Play Integrity: <https://firebase.google.com/docs/app-check/android/play-integrity-provider>
- Google Cloud Workload Identity Federation: <https://cloud.google.com/iam/docs/workload-identity-federation>
- Expo Android build and submission: <https://docs.expo.dev/submit/android/>
- Google Play pre-launch reports: <https://support.google.com/googleplay/android-developer/answer/9842757>
- Google Play Data Safety: <https://support.google.com/googleplay/android-developer/answer/10787469>

## 14. Final instruction to the acting agent

Lead with proof. Preserve full intended scope, but activate it through ordered gates. Never claim a later state from an earlier form of evidence. Stop when a required identity, environment, owner, or rollback path is ambiguous. When a gate passes, record the exact source, binary, environment, actor, device, request, artifact, and negative evidence that made it pass.
