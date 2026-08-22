# PackProof Hardening & Release Architecture Plan

**Status:** accepted as the controlling development sequence on 2026-08-22.

**Milestone:** Hardening Candidate 1 (`HC-1`). Package identity for the first implementation slice is `0.9.6.0`. This is a release-series transition, not a `1.0.0` claim.

**Baseline:** commit `db69eef11890fc5d566795d92d40740a21f82308`. Snapshot: [`HARDENING_BASELINE_2026-08-22.md`](HARDENING_BASELINE_2026-08-22.md).

**Architectural decision:** [`ADR 0016`](../adr/0016-one-fact-one-state-one-eligibility-one-proof.md).

## 1. Authority

This file is the controlling development and hardening sequence for PackProof until the [release-gate statements](#16-release-gate) are demonstrably true.

Owner-approved on 2026-08-22. It does not repeal the architecture contract, ADRs, or the launch-claim vocabulary in [`../../agent.md`](../../agent.md). It does replace those documents as the order of work.

| Document | Role during HC-1 |
|---|---|
| This plan | Development sequence, freeze, and hardening Definition of Done |
| [`ARCHITECTURE_CONTRACT.md`](ARCHITECTURE_CONTRACT.md) | Standing law. Incremental migration. No wholesale rewrite |
| [`ADR 0003`](../adr/0003-one-core-multiple-transports.md) / [`ADR 0015`](../adr/0015-proof-is-the-passport.md) / [`ADR 0016`](../adr/0016-one-fact-one-state-one-eligibility-one-proof.md) | One core, Proof meaning, and the four canonical models |
| [`../../agent.md`](../../agent.md) | `DEMO_READY` / `LAUNCH_READY` / `LAUNCHED` vocabulary and G-gates after the hardening gate |
| [`../TEST_PLAN.md`](../TEST_PLAN.md) | AUTO / AND / E2E / INT procedure catalog. Do not invent a second catalog |
| [`../product/PACKPROOF_UX_FLOW_V1.md`](../product/PACKPROOF_UX_FLOW_V1.md) | Presentation contract. Next Action copy and one-CTA rules. Not a second workflow engine |

If another implementation proposal conflicts with this plan, this plan controls until a superseding ADR and owner-recorded replacement exist.

## 2. Governing principle

> **One fact model. One state model. One eligibility model. One Proof. Many presentation surfaces.**

Mobile, REST, Portal, commerce adapters, jobs, reports, and other transports invoke the same application-service core. They do not implement their own product rules.

```text
                    Commerce Sources
                         │
        ┌────────────────┼────────────────┐
        │                │                │
 Merchant API      User Artifact      Page Declared
 authoritative      asserted only      prefill only
        │                │                │
        └────────────────┼────────────────┘
                         ▼
                Commerce Context
                         │
                         ▼
                   Transaction
                         │
              ┌──────────┴──────────┐
              │                     │
        Native Evidence       Enterprise Evidence
              │                     │
              └──────────┬──────────┘
                         ▼
              Server Finalization Core
                         │
                         ▼
                 Canonical State
                  Application Layer
                 /               \
                /                 \
 Transaction Workspace        Proof Service
 Projection                     │
        │                        │
   ┌────┼─────┐          Canonical Proof
   │    │     │             │       │
 Mobile Portal API            JSON    PDF
```

Everything above the application layer is a presentation or transport mechanism. Everything below it is a source of facts. The application and domain core decide what those facts mean technically. Nobody except the eventual claims decision-maker decides what they mean commercially or legally.

## 3. Phase 0 — Freeze before changing product meaning

For the duration of this work:

| Frozen | Still allowed |
|---|---|
| Major new product surfaces | Bug fixes that close a named hardening defect |
| New evidence semantics | UX simplification that removes local reasoning |
| New Proof meaning | Observability and release engineering |
| New Enterprise modes or warehouse expansion | Compatibility adapters required by a hardening slice |
| Speculative AI / CV functionality | Documentation, tests, and architecture enforcement |
| Large redesign of the evidence core | Incremental strangler moves that delete a duplicate rule |

Enterprise stays in `OBSERVE`. `physicalCorrespondence` stays `NOT_AVAILABLE`. SISV remains a post-launch research program.

### 3.1 Current seams this freeze exists to close

These are source observations on `db69eef`. They are not live-device claims.

| ID | Defect | Why it recurs |
|---|---|---|
| HD-01 | Mobile Home `transactionUx()` calls `resolveNextRequiredAction` without protocol | `src/components/transaction-card.tsx` treats missing protocol as valid. `EMPTY_PROTOCOL` in `shared/ux/next-action.ts` turns absence into “no packing / no seal” |
| HD-02 | Portal Home list maps transactions without evidence | `PortalWorkspaceApplicationService.listTransactions` uses `toPortalTransactionDto(record)` and the default `EMPTY_PROTOCOL`. `getTransaction` hydrates. Home and Workspace can disagree |
| HD-03 | `View Proof` is inferred from lifecycle | `passportReady()` in `shared/ux/next-action.ts` is true when `passportId` exists **or** status is `PACKED` / `SHIPPED` / `BUYER_REVIEW` / `COMPLETED` |
| HD-04 | An `externalOrderId` can short-circuit commerce trust | `passportHasAuthoritativeOrderSource` and `passportHasIdentifiedCommerceSource` in `functions/src/domain/v1/passport.ts` return true when `externalOrderId` is present |
| HD-05 | Proof eligibility hydration differs by transport | Merchant `assertPassportEligible(transaction, records, commerce)` loads commerce first. Portal and `getPackProofPassport` assert eligibility, then load commerce |
| HD-06 | Intake stamps one provenance onto overlaid fields | `ingestArtifact` overlays `command.confirmed` onto parsed fields, then assigns every populated field the imported artifact’s source |
| HD-07 | Proof GET binds identity | `getPackProofPassport` and `PortalWorkspaceApplicationService.getPassport` call `boundOrIssuedIdentity` and persist on first read |
| HD-08 | Presentation layers still own resolver invocation | Portal `TaskCard`, `Workspace`, `Activity`, `Library`, `Handoff` and several mobile screens call `resolveNextRequiredAction` with locally assembled input |
| HD-09 | Process | PR #27 merged on this SHA with no requested reviewer. Branch protection exists; required approving review count is 0 |
| HD-10 | Working-tree secrets | Untracked `functions/.env.thepackproof-prod` and `google-services.production.local.json` must not be committed |

## 4. Phase 1 — Canonical Transaction Workspace Projection

Highest priority.

Presentation layers must stop assembling workflow truth. The application layer creates one object. Mobile Home, Mobile Task, Portal Home, and Portal Workspace consume it.

### 4.1 Target shape

Exact fields may change. Ownership may not.

```ts
type TransactionWorkspaceProjectionV1 = {
  schemaVersion: 1;
  projectionVersion: string;
  transactionId: string;
  viewer: { actorId: string; role: ParticipantRole };
  lifecycle: { transactionStatus: ConsumerState; humanState: HumanState };
  protocol: PackageSealProtocolStatus; // required, never defaulted
  evidenceProcessing: {
    state: 'IDLE' | 'LOCAL_PENDING' | 'UPLOADING' | 'FINALIZING' | 'ATTENTION_REQUIRED';
    pendingCount: number;
  };
  nextAction: NextRequiredAction;
  proof: {
    availability: ProofAvailability;
    passportId: string | null;
    displayId: string | null;
  };
  returnWorkflow: ReturnWorkspaceSlice | null;
  generatedAt: string;
};
```

Load path:

```text
transaction
+ finalized evidence
+ shipment
+ delivery
+ returns
+ commerce context
+ Proof identity
+ processing state when relevant
        ↓
canonical resolver (application-owned input)
        ↓
TransactionWorkspaceProjection
```

### 4.2 Critical rule

No UI component may call `resolveNextRequiredAction` with a partial structure.

Either:

- the resolver becomes application-layer-only and surfaces receive the projection; or
- its required input type is impossible to construct without canonical protocol state.

Replace optional `protocol?: ProtocolState` with required `protocol: ProtocolState`. Delete default `EMPTY_PROTOCOL` as a business-truth stand-in. Tests may still construct an explicit all-false protocol when that is the fixture.

### 4.3 Current files to strangler-migrate

| Surface | Current call site | Required change |
|---|---|---|
| Shared engine | `shared/ux/next-action.ts` | Required protocol; consume Proof availability; stop lifecycle Proof inference |
| Mobile Home | `src/components/transaction-card.tsx` | Render projection only |
| Mobile Task / detail | `src/app/task/[id].tsx`, `src/app/transaction/[id].tsx` | Same projection as Home |
| Portal Home | `portal/src/TaskCard.tsx` via `listTransactions` | List DTO must include hydrated protocol and next action from the service |
| Portal Workspace | `portal/src/pages/Workspace.tsx` | Consume the same projection |
| Portal service | `functions/src/application/v1/portal-workspace-service.ts` | Stop defaulting protocol on list |

### 4.4 Acceptance

Golden fixtures for:

```text
TERMS_LOCKED
PACKED / packing only
PACKED / packing + seal
SHIPPED / no arrival
SHIPPED / arrival captured
SHIPPED / arrival + unboxing
COMPLETED
RETURN_REQUESTED
RETURN_PACKING
RETURN_IN_TRANSIT
RETURN_RECEIVED
```

For every fixture:

```text
Mobile workspace projection
= Portal workspace projection
= canonical application projection
```

No presentation-specific workflow expectations remain. This closes HD-01 and HD-02.

## 5. Phase 2 — One Proof application service

Create `ProofApplicationService` with operations conceptually:

```text
getCurrentProof(actor, transactionId)
getProofByIdentity(actor, proofId)
evaluateProofAvailability(actor, transactionId)
createProofSnapshot(actor, transactionId)
createProofPdf(actor, snapshotId)
```

Internal sequence:

```text
authorize
    ↓
load transaction
    ↓
load commerce context
    ↓
load evidence
    ↓
load shipment / delivery / returns / timeline
    ↓
evaluate canonical eligibility
    ↓
resolve deterministic Proof identity
    ↓
aggregate Proof
    ↓
return canonical object
```

### 5.1 Strong rule

Only this service may call:

```text
evaluatePassportEligibility()
assertPassportEligible()
aggregatePassport()
boundOrIssuedIdentity()
```

Merchant REST (`MerchantEvidenceApplicationService`), Portal (`getPassport`), and `getPackProofPassport` become transports. They must not keep private eligibility paths.

A later commerce source, evidence type, Enterprise artifact, assurance dimension, return artifact, or regulatory field updates **one service**.

This closes HD-05.

## 6. Phase 3 — Separate Proof availability from lifecycle

Remove this concept:

```text
PACKED  ⇒ Proof probably exists
SHIPPED ⇒ Proof probably exists
COMPLETED ⇒ Proof probably exists
```

Lifecycle asks what stage the transaction is in. Proof availability asks whether enough appropriately sourced, finalized evidence exists to construct a canonical Proof.

```ts
type ProofAvailability =
  | 'NOT_ELIGIBLE'
  | 'ELIGIBLE_NOT_ISSUED'
  | 'AVAILABLE';
```

Reserve `TEMPORARILY_UNAVAILABLE` and `QUARANTINED_INPUTS` for a later schema. Do not add them in v1.

The Proof service calculates availability. The workspace projection consumes it.

`View Proof` appears only when `proof.availability === 'AVAILABLE'`. No heuristics. No transaction-status fallbacks. No inferred secondary action from `PACKED` / `SHIPPED` / `COMPLETED`.

Delete `passportReady(status, passportId)` lifecycle fallbacks.

### 6.1 Missing regressions

| Fixture | Required availability |
|---|---|
| `PACKED` + no commerce + no evidence | `NOT_ELIGIBLE` |
| `PACKED` + eligible evidence + valid commerce | `AVAILABLE` or `ELIGIBLE_NOT_ISSUED` per bind policy |
| `PACKED` + quarantined evidence only | `NOT_ELIGIBLE` |
| `COMPLETED` + no qualifying evidence | `NOT_ELIGIBLE` |
| `SHIPPED` + valid Proof identity | `AVAILABLE` |

RC-S-07 already separates lifecycle from eligibility. It does not yet assert secondary `View Proof` availability. Close that gap. This closes HD-03.

## 7. Phase 4 — Commerce trust is provenance, not presence

> **A value never determines its own trust. Its provenance determines its trust.**

An `externalOrderId` must never become authoritative merely because it exists.

Centralize `canAuthoritativelyBindOrder(source)` and require `MERCHANT_SERVER_ATTESTED` or `PLATFORM_API_ATTESTED` before authoritative order binding.

| Source | Order ID present | Authoritative |
|---|---:|---:|
| Merchant API | yes | yes |
| Platform API | yes | yes |
| Email receipt | yes | no |
| Screenshot | yes | no |
| PDF | yes | no |
| Share sheet | yes | no |
| Browser extension | yes | no |
| PackProof Button / page data | yes | no |
| Seller typed manually | yes | no |

The commerce model already has the trust classes. Make the trust-aware helper the only exported path. Deprecate helpers that accept loosely associated strings.

This closes HD-04.

## 8. Phase 5 — Provenance is append-only

Corrections are separate assertions. They do not rewrite imported history ([architecture contract §5](ARCHITECTURE_CONTRACT.md), [ADR 0002](../adr/0002-commerce-context-and-field-provenance.md)).

Move toward:

```ts
type FieldAssertion = {
  field: string;
  value: unknown;
  assertedBy:
    | 'MERCHANT_API'
    | 'PLATFORM_API'
    | 'EMAIL_RECEIPT'
    | 'SCREENSHOT_IMPORT'
    | 'PDF_IMPORT'
    | 'SHARE_SHEET'
    | 'SELLER_ENTERED'
    | 'BUYER_ENTERED'
    | 'PACKPROOF_OBSERVED';
  trustLevel: CommerceTrustLevel | null;
  sourceArtifactSha256: string | null;
  assertedAt: string;
  supersedesAssertionId: string | null;
};
```

The UI may show only the current title. The Proof preserves lineage.

Fix intake immediately: `overlayIntakeItem` plus a single `fieldProvenance` map in `transaction-intake-service.ts` currently assigns the imported artifact’s source to every populated field, including participant-confirmed overlays. Parsed fields keep `EMAIL_RECEIPT` / share-sheet / screenshot / PDF provenance. Seller-changed fields become `SELLER_ENTERED` and supersede the imported assertion.

`SELLER_ENTERED` and `BUYER_ENTERED` already exist in the domain. This closes HD-06.

## 9. Phase 6 — Hash-assurance provenance

Every digest must say who computed it.

```ts
type DigestAssurance = {
  value: string;
  algorithm: 'SHA-256';
  computation: 'SERVER_RECOMPUTED' | 'CLIENT_COMPUTED' | 'THIRD_PARTY_DECLARED';
  boundArtifactAvailable: boolean;
};
```

| Case | Presentation |
|---|---|
| Native PackProof evidence | client digest + server digest + comparison |
| Receipt text sent to PackProof | `SERVER_RECOMPUTED` |
| Screenshot whose digest only reaches the backend | `CLIENT_COMPUTED` |

Do not present those as equivalent. Client-computed hashes remain useful. Their assurance class must be explicit.

## 10. Phase 7 — Retrieval should not create durable business state

Prefer:

```text
calculate deterministic identity
persist / bind identity
```

A GET-like read should not bind a Proof. Preferred model: eligibility emits `PROOF_AVAILABLE` and identity is atomically bound, then GET only retrieves.

Lazy binding may remain if it is explicit, idempotent, and auditable. The Firestore bind transaction already prevents duplicate identity writes. Keep that invariant.

Tests required:

- simultaneous first Proof requests;
- mobile + Portal first request simultaneously;
- API + mobile simultaneously;
- network timeout after identity bind;
- retry;
- duplicate snapshot requests.

Only one identity may ever exist. This closes HD-07 if GET is made side-effect-free, or documents and tests the lazy-bind exception.

## 11. Phase 8 — One-action UX on authoritative workspace state

After Phase 1, simplify clients.

Mobile Home displays only:

```text
one primary next action
optional View Proof   (availability === AVAILABLE)
quiet secondary metadata
```

No local “maybe they need X.”

Completed card: **View Proof** is primary. Not Open → transaction → View record → Proof.

Processing copy:

| State | Copy |
|---|---|
| Locally queued | Your recording is safe |
| Uploaded, finalizing | Finishing your Proof |
| Attention required | Evidence needs attention |

Do not confuse locally captured, uploaded, server finalized, and Proof available.

Banner language: **Authentic PackProof record**, not `AUTHENTIC PACKPROOF`. The Proof page already carries authenticity, custody, fraud, and liability limitations. Keep them.

Friction rules in `.cursor/rules/consumer-friction.mdc` remain. They must not reintroduce local workflow reasoning.

## 12. Phase 9 — Evidence-queue fault injection

The queue design is strong. Abuse every transition:

```text
CAPTURED → ENCRYPTING → QUEUED → DECRYPTING_FOR_UPLOAD
→ GRANT_REQUESTED → UPLOADING → AWAITING_FINALIZATION → FINALIZED
```

At every step: kill app, force stop, reboot, network off, Wi-Fi ↔ LTE, token expiry, App Check expiry, sign out, different account, disk full, storage permission change, clock change, server unavailable, Storage success / Function failure, Function success / lost response, duplicate Storage trigger, repeat upload, corrupt local metadata, corrupt ciphertext, Keystore unavailable.

Invariant:

> PackProof may fail visibly. It must never silently upgrade incomplete evidence into finalized evidence.

Encrypted evidence remains when backend finalization is pending. Preserve that.

## 13. Phase 10 — End-to-end idempotency

Audit every retryable mutation:

```text
transaction creation
receipt intake
buyer invitation
participant claim
terms confirmation
capture-session creation
upload reservation
shipment association
delivery association
return creation
return shipment
Proof snapshot
PDF generation
webhooks
Enterprise session creation
```

For each operation answer:

1. What is the stable request identity?
2. What happens if the response is lost?
3. What happens if two identical requests arrive simultaneously?
4. What happens if the same idempotency key has different data?
5. Can two workers execute the side effect?
6. Is the domain event duplicated?
7. Is the audit event duplicated?

Reuse the Merchant API / [ADR 0011](../adr/0011-idempotency-side-effect-fencing.md) pattern. Do not invent surface-specific implementations. Build a reusable concurrency harness.

## 14. Phase 11 — Cross-surface golden contract suite

This becomes a primary CI gate. Prefer 20–40 complete-state fixtures over another hundred isolated units.

Example fixture:

```text
Receipt-imported camera sale
Buyer joined
Terms confirmed
Packing video finalized
Seal image finalized
UPS tracking supplied
No delivery yet
```

Feed the same fixture through:

```text
canonical application service
mobile-facing adapter
Portal-facing adapter
merchant-facing adapter
Proof projection
PDF projection
```

Assert same transaction facts, provenance, Proof ID, Proof eligibility, next action, evidence states, limitations, and assurance. Rendering may differ. Meaning may not.

CI fails if:

```text
mobile says Proof ready / Portal says Proof unavailable
Portal says Add tracking / mobile says Photograph package
API says authoritative order / Proof says page-declared authoritative order
PDF order number differs from JSON order number
```

`npm run test:rc-e2e` (AUTO-19) is the seed, not the destination.

## 15. Phases 12–31 — Enforcement, release, operations, future gates

These phases stay in this plan. They are not permission to start them before P0 consistency work.

| Phase | Intent | Repo hook |
|---|---|---|
| 12 | Executable layer boundaries | No import linter today (`eslint.config.js` is Expo-only). Add dependency rules: domain ↛ Firebase/React/Express; application ↛ concrete Firebase repos; presentation ↛ persistence types or state transitions; portal ↛ Firestore/Storage; mobile UI ↛ Proof eligibility |
| 13 | Schema / version migration | Every persistent or public structure carries `schemaVersion` and relevant producer / parser / policy / renderer versions. Never silently reinterpret old evidence under new policy. Keep one fixture per released schema version |
| 14 | Release identity chain | Automate `release-manifest.json` from the fields already listed in [`../TEST_PLAN.md`](../TEST_PLAN.md) and [ADR 0005](../adr/0005-generated-artifacts-and-release-provenance.md) |
| 15 | Protect `master` | Keep required CI and up-to-date branches. Raise required approving reviews above 0. Add CODEOWNERS when more people merge routinely. Closes HD-09 |
| 16 | CI supply-chain | Pin Actions to commit SHAs; dependency review; SBOMs; secret scanning; lockfile integrity; separate sandbox/production credentials; environment-protected deploys. See [`../DEPLOYMENT_IDENTITY.md`](../DEPLOYMENT_IDENTITY.md) |
| 17 | Run the existing release gates | `SOURCE_CHECKED` → `EMULATOR_CHECKED` → AND-01..07 → E2E-01..10. RC source journey does not satisfy device or live gates |
| 18 | Destructive evidence tests | INT-01.. from [`../TEST_PLAN.md`](../TEST_PLAN.md). Quarantine is success. Never silently `FINALIZED` |
| 19 | Performance instrumentation before optimization | Capture, encrypt, upload, finalize, Proof-ready latencies. p50/p75/p95/p99. Do not change the evidence architecture until telemetry shows the bottleneck |
| 20 | Operational observability | Structured `requestId`, operation, duration, result, retry, error class, finalization state. Dashboards and alerts for finalization p95, quarantine rate, App Check, webhooks |
| 21 | Internal reliability SLOs | Choose thresholds from measurements. Track error budgets. Prevent “it works on my phone” |
| 22 | Feature flags and kill switches | Intake, parser version, carrier, capture policy, Enterprise, Proof renderer. Flags are not evidence facts. Historical evidence records the policy/version used at capture |
| 23 | Privacy and data governance | Minimum necessary intake. Receipts may contain name, address, email, payment metadata. Extract required fields; retain digest/provenance; discard unnecessary raw correspondence unless policy requires the artifact |
| 24 | Disaster recovery | Firestore/Storage/Functions/region/rules/index/credential drills. Rollback, backup, key rotation, incident communication. Run the drills |
| 25 | Key-management lifecycle | Registry of keyId, purpose, algorithm, created/activated/retired/revoked, historical verification policy. Never silently replace HMAC with public digital-signature semantics ([ADR 0008](../adr/0008-manifest-authentication-evolution.md)) |
| 26 | Enterprise freeze | No warehouse pilot until persistent Edge credentials, nonce replay protection, hardware key protection, rotation, revocation, restart survival, real camera/scanner/scale/WMS, live finalization, offline recovery, and multi-station collision tests exist. Start every real pilot in `OBSERVE` |
| 27 | Scale without premature redesign | Watch Firestore hotspots, retry storms, large media, webhook fan-out, Enterprise telemetry. Partition research may continue; redesign waits for load |
| 28 | Fuzz and property tests | Commerce parsers: missing beats guessed. Proof aggregation: quarantined evidence cannot satisfy workflow; `PAGE_DECLARED` / `USER_PROVIDED` never become authoritative; Proof never emits fraud, physical `MATCH`, or observed facts from missing facts |
| 29 | Neutrality as a tested property | Expand `npm run test:claims` / RC-S-11 across mobile, Portal, API, PDF, email, webhooks, Enterprise console. Forbidden: unqualified fraud confirmed, seller verified, authentic item, custody proven, liable, guilty. Context-sensitive allowlists only |
| 30 | AI / CV scientific gate | No `model output → MATCH`. Frozen model, criteria, eligible inputs, FP/FN analysis, thresholds, independent evaluation, versioned identity, human-review language. Until then `physicalCorrespondence = NOT_AVAILABLE` ([ADR 0007](../adr/0007-physical-matcher-validation-gate.md), [ADR 0009](../adr/0009-neutral-sisv-observation-boundary.md)) |
| 31 | Definition of Done | See [§17](#17-definition-of-done) |

## 16. Release gate

PackProof does **not** become the next release candidate until all of these statements are true:

1. The same transaction produces the same next action everywhere.
2. The same transaction produces the same Proof eligibility everywhere.
3. Imported information never becomes more authoritative simply because an order number exists.
4. User corrections retain their actual provenance.
5. Finalized evidence always means server-finalized evidence.
6. Corrupted evidence fails closed.
7. Lost responses and retries cannot duplicate evidence or transactions.
8. Mobile and Portal cannot independently invent business rules.
9. A Proof cannot accidentally become a fraud, authenticity, custody, or liability verdict.
10. The exact Android binary has been tested against the exact deployed backend it is supposed to use.
11. Two devices can complete the complete real flow.
12. Network loss, crashes, and retries do not destroy or falsely upgrade evidence.

Classification of those statements today: **not yet demonstrated** on `db69eef`. Source observations of HD-01 through HD-08 show several are currently false.

Once they are demonstrably true, development stops being the primary risk. The next unknown is adoption.

## 17. Definition of Done

A domain-behavior change is not done when it compiles.

Required:

```text
domain invariant identified
application behavior implemented
authorization checked
idempotency checked if mutating
provenance impact reviewed
neutrality impact reviewed
schema compatibility reviewed
unit tests
cross-surface test where applicable
negative test
failure / retry behavior
observability
documentation
```

Release-affecting changes additionally require exact build identity, CI pass, device validation where required, deployment validation where required, and a rollback path.

## 18. Recommended execution order

**P0 — Consistency (now)**

1. Canonical Transaction Workspace Projection.
2. Canonical Proof Application Service.
3. Move Proof eligibility behind that service.
4. Eliminate lifecycle-derived Proof readiness.
5. Move Mobile Home and Portal Home onto fully hydrated workspace state.

**P1 — Provenance**

6. Fix `externalOrderId` trust ordering.
7. Separate participant corrections from imported assertions.
8. Add digest-computation provenance.
9. Add exhaustive trust/provenance regression fixtures.

**P1 — Reliability**

10. Cross-surface golden test suite.
11. Queue fault testing.
12. Concurrency / idempotency testing.
13. Evidence corruption / quarantine testing.
14. Canonical Proof concurrency tests.

**P1 — Release**

15. New release identity (`HC-1` / `0.9.6.0`).
16. Required CI / branch protection.
17. Full automated candidate gate.
18. Exact Android build.
19. AND-01–07.
20. E2E-01–10.
21. Exact-byte negative testing.

**P2 — Operational**

22. Performance telemetry.
23. Backend observability.
24. Operational alerts / SLOs.
25. Feature flags.
26. Rollback / disaster recovery.
27. Privacy / retention hardening.

**P2 — Scale / future**

28. Key lifecycle management.
29. Fuzz / property testing.
30. Distributed retry / rate-limit hardening.
31. Enterprise production prerequisites.
32. Future CV scientific gate.

Do not start a P2 item because it is interesting. Start it because a P0/P1 gate requires it or the owner explicitly unfreezes it.

## 19. Compatibility

- Incremental strangler migration only ([ADR 0001](../adr/0001-incremental-layered-architecture.md)).
- Persistence records and public DTOs stay separate types.
- Proof remains the Passport projection (`object: packproof_passport`, `ppt_` / `PP-` ids) until a versioned schema change is accepted.
- Existing consumer records remain readable.
- Breaking external contracts require a new API or event version.
- This plan does not authorize `v1.0.0`, `DEMO_READY`, `LAUNCH_READY`, or Play promotion.
