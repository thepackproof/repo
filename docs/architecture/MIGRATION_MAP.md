# PackProof current-to-target migration map

Status: Section 1 planning baseline. This is a migration map, not a claim that the target modules already exist.

Section 3 activation note: merchant REST transaction create/get/list, consumer draft save, Connect order ingestion and Connect redemption now use `functions/src/application/v1` with Firebase adapters under `functions/src/infrastructure`. Other rows remain migration targets unless explicitly identified in `APPLICATION_SERVICES_V1.md`.

## Migration method

PackProof will use a strangler-style migration:

1. define a domain type, policy and application-service port;
2. wrap the current implementation behind an adapter;
3. add characterization and transition tests;
4. migrate one caller at a time;
5. compare old and new observable behavior where both paths temporarily exist;
6. remove the legacy path only after all callers and persistence compatibility tests pass.

Existing Firestore data, encrypted queue records, Connect integrations and public response aliases remain readable throughout migration.

## Current module map

| Current area | Current responsibility/coupling | Target destination | Migration note |
|---|---|---|---|
| `src/app/**` | Expo Router screens; some workflow eligibility and command selection in components | `presentation/mobile/**` | Keep routes; move state-transition policy and orchestration into typed application commands/queries |
| `src/components/**` | Shared UI plus some status presentation | `presentation/components/**` | Remain presentation-only; consume explicit view models and claim-safe copy |
| `src/providers/auth-provider.tsx` | Firebase/provider orchestration, profile calls and UI context | `presentation/providers` plus identity application port and Firebase adapter | Preserve feature-gated dynamic optional-provider imports |
| `src/providers/offline-evidence-provider.tsx` | Starts queue synchronization and publishes counts | Presentation provider over an evidence-sync application interface | Keep UI context small; move retry policy and events out of React lifecycle |
| `src/providers/purchases-provider.tsx` | RevenueCat initialization, entitlements and purchase UI state | Entitlement application service plus RevenueCat infrastructure adapter | Billing controls product entitlement only; it never changes evidence truth |
| `src/lib/api.ts` | Callable transport, Firestore subscriptions, upload and finalization polling | Mobile transport adapter, query repositories and evidence application client | Split network transport from application orchestration; direct reads remain behind authorized query adapters |
| `src/lib/offline-evidence-queue.ts` | Queue domain states, encrypted metadata persistence, retry orchestration and native/file/network calls | Evidence-sync domain/application service plus React Native/FileSystem/NetInfo/native adapters | Preserve current container compatibility and queue identities while extracting pure transition policy |
| `src/lib/capture-telemetry.ts` and `capture-profiles.ts` | Capture observations and frozen physical plan | Capture domain types/policies plus device adapter | Measurements remain signals until validation establishes thresholds |
| `src/lib/firebase.ts` | First-party Firebase composition | `infrastructure/firebase/mobile` composition adapter | No domain policy belongs here |
| `src/types/models.ts` and `telemetry.ts` | Client persistence/view/domain types mixed together | Versioned domain types, API DTOs and presentation view models | Introduce translation functions; do not rename persistence fields in place without migration |
| `modules/packproof-secure-file/**` | Android Keystore encryption, hashing, image signals and challenge signing | `infrastructure/device/android-secure-file` implementing crypto/device ports | Android remains the supported secure-capture platform; iOS requires a separate native adapter |
| `functions/src/transactions.ts` | Callable transport, validation, authorization, transaction state logic, upload reservation and persistence | Transaction, participant and evidence-reservation application services plus callable adapters | Characterize every transition before splitting the monolith |
| `functions/src/evidence.ts` | Storage trigger, hashing, manifest/finalization, packets and signed URLs | Evidence finalization, manifest and report services plus Storage/Firebase adapters | Preserve at-least-once idempotency, quarantine behavior and deterministic manifest bytes |
| `functions/src/attestation.ts` | Callable capture-session issuance | Capture-session service plus callable/REST adapters | Extend through the canonical evidence-session model rather than adding a second session type |
| `functions/src/returns.ts` | Callable transport and Return Passport workflow | Return Passport domain/application service plus callable/REST adapters | Preserve original-evidence hash snapshots and participant authorization |
| `functions/src/platform-webhooks.ts` | Connect provisioning, ingestion, claim, trigger, callback and retry logic | Connect compatibility adapter over commerce-context, transaction, capture-session and webhook services | Do not remove legacy response aliases until SDK and integrations migrate |
| `functions/src/api/v1/**` | Well-separated merchant transaction REST slice, ports and Firestore controls | Versioned HTTP adapter and reusable application ports | Retain strict boundary controls; migrate its transaction service to the canonical transaction service instead of expanding parallel logic |
| `functions/src/physical-correspondence.ts` | Capture-set completeness and validation-gated status | Physical acquisition query service and future matcher port | Matcher implementation remains disabled until independent validation |
| `functions/src/accounts.ts` and `web-deletion.ts` | Export/deletion callables, schedules and public endpoints | Account lifecycle service plus callable/HTTP/scheduled adapters | Add shared-record retention, legal-hold and audit policy before broad deployment |
| `functions/src/billing.ts` and `billing-state.ts` | RevenueCat webhook and entitlement reducer | Entitlement service plus RevenueCat HTTP adapter | Keep reducer deterministic and independent of evidence/transaction verdicts |
| `functions/src/tiktok.ts` | OAuth flow and deletion endpoint | Identity provider adapter | Remains optional and initialization-gated |
| `functions/src/helpers.ts` | Shared Firebase helpers, events and best-effort notifications | Repository adapters, audit/event service and notification consumer | Replace inline notification side effects with outbox/event consumption |
| `functions/src/evidence-format.ts` and `tools/evidence-format.mjs` | Producer and clean-room verifier format logic | Versioned evidence-format package with independent verifier package | Maintain implementation independence for mutation/conformance testing |
| `firestore.rules`, `storage.rules`, indexes | Client authorization and query/index policy | Infrastructure policy controlled by canonical resource authorization matrix | Every new collection/resource requires positive and negative emulator tests |
| `docs/openapi/packproof-api-v1.json` | Current five-route merchant contract | Canonical public `/v1` contract | Add resources incrementally; no undocumented route or breaking in-place schema change |
| `docs/openapi/packproof-connect.yaml` | Legacy Connect contract | Compatibility contract layered over `/v1` services | Preserve until migration/deprecation policy is accepted |
| `sdk/javascript/**` | Connect client and webhook verifier | Versioned TypeScript/Node SDK with Connect compatibility namespace | Add retries only where idempotency makes them safe |
| `public/**` | Policies, deletion, invitation/Connect fallback | Public presentation over authorized APIs | No public Storage tokens or private record serialization |
| `portal/**` | Authenticated browser SPA | Presentation adapter over `/v1/portal` | No Firestore/Storage from the browser; no merchant API keys; native capture stays native ([ADR 0014](../adr/0014-web-portal-presentation-surface.md)) |
| `shared/ux/**` | Next Action Engine | Shared presentation-state rules | No React Native or DOM; mobile and portal consume the same engine |
| `.github/workflows/ci.yml` | Source/API/emulator/security regression gates | Required baseline and later deploy/release pipelines | Add clean-checkout and artifact provenance gates before production delivery |

## Target service boundaries

| Service | Owns | Does not own |
|---|---|---|
| Commerce Context | External catalog/listing/cart/order assertions, provenance, immutable snapshots, order binding | Participant identity, payment truth, physical truth |
| Passport/Transaction | Agreed terms, participants, workflow state | Raw media processing, provider-specific payloads |
| Participant Claim | Bounded mapping from external references/handoff to authenticated actors | General transaction access based on labels or URLs |
| Evidence Session | Capture purpose, actor, allowed artifacts, session states and expiry | File encryption implementation or HTTP transport |
| Evidence Reservation | Deterministic upload identity, exact path/type/actor bounds | Final evidence success |
| Evidence Finalization | Server hashing, type comparison, manifest, assurance and evidence record | Physical-authenticity or legal verdicts |
| Shipment | Carrier/tracking assertions and associations | Carrier custody claims without adapter evidence |
| Return Passport | Return workflow and return evidence relationships | Physical sameness inference |
| Report | Authorized presentation derivative and lineage | Replacement of original evidence/manifests |
| Event/Webhook | Versioned events, endpoint config, delivery, replay and history | Core state-transition decisions |
| Audit | Security/evidence event history and chain/export interface | Secrets or raw sensitive media |
| Entitlement | Plan/access capabilities | Evidence or transaction truth |

## Persistence compatibility sequence

1. Add explicit schema/version/source fields to newly written records.
2. Read current consumer and merchant shapes through compatibility mappers.
3. Dual-read before any field relocation; dual-write only when a rollback plan and tests exist.
4. Backfill through idempotent, resumable jobs with counts and failure records.
5. Compare resource totals, participant authorization, evidence hashes and workflow states before switching reads.
6. Retire legacy fields only after a documented retention window and rollback checkpoint.

## First extraction order

1. Domain identifiers, errors, clocks and state-transition results.
2. Transaction/passport policy characterized from `transactions.ts` and the REST transaction service.
3. Commerce-context and field-provenance types, because they influence every external creation path.
4. Repository and audit/event ports.
5. Transaction application service and adapters for callable, REST and Connect.
6. Evidence-session/reservation service, followed by finalization/report services.
7. Shipment, returns, notification, account and entitlement services.

This order supplies Section 2 and Section 3 without rewriting the functioning Android evidence path first.
