# PackProof initial Android launch scope

Status: `PARTIALLY_APPROVED`

Recorded: 2026-08-12

Controlling plan: [`../agent.md`](../agent.md)
Source baseline under review: `7acf79489e9b5b6c78f9a6b8ae64d529cd9b0e3b`

This record converts the master implementation guidance into an executable initial-release promise. It does not claim that the source, live service, binary, device flow, or Play release has passed.

Go-to-market positioning is controlled by [`GO_TO_MARKET_EVIDENCE_FIRST_2026-08-13.md`](GO_TO_MARKET_EVIDENCE_FIRST_2026-08-13.md). The launch product is the neutral evidence vault and human-reviewable two-party protocol. SISV algorithmic comparison is post-launch research, not a day-one requirement.

## Release decisions

| Decision | Initial-release choice | Runtime boundary | Required proof before the choice changes |
|---|---|---|---|
| First platform | Android | Package `com.packproof.app`; Expo SDK 57; target API 36; minimum API 26 | Exact signed build, physical-device matrix and Play-delivered acceptance |
| Live authentication | Google sign-in only - `OWNER_APPROVED_2026-08-13` | Facebook and TikTok flags remain false | Provider approval, redirect, deletion, account-linking and non-admin-user tests |
| PackProof Pro | `FEATURE_GATED` - `OWNER_APPROVED_2026-08-13` | RevenueCat billing flag remains false; no pricing or Pro promise may be public | Complete purchase lifecycle, webhook authorization and Firebase UID binding tests |
| General merchant webhooks | `FEATURE_GATED` - `OWNER_APPROVED_2026-08-13` | Do not advertise general delivery; document only exact Connect callback behavior that passes | Dispatcher, signature, replay, retry, dead-letter, tenant-isolation and operations acceptance |
| Physical correspondence | `POST_LAUNCH`; `NO_VALIDATED_PHYSICAL_MATCHER_ENABLED` | Production states remain `NOT_AVAILABLE` | Frozen implementation-specific independent validation and separate production approval |
| Carrier telemetry | `POST_LAUNCH` | No carrier integration or automated weight comparison is claimed | Contracted carrier source, provenance, error handling and live integration proof |
| Automated financial adjudication | `POST_LAUNCH` | PackProof organizes bounded evidence and does not decide disputes | Partner integration, latency, outcome-policy and operational validation |

## Firebase environment decision

| Environment | Project ID | Decision status | Deployment authority |
|---|---|---|---|
| Sandbox candidate | `packproof-4cf53` | `ACCESS_RESTORED_2026-08-13`; configured as `API_ENVIRONMENT=sandbox`, but user/data isolation and exact deployed-source provenance remain unproved | Sandbox deployment only after release-captain confirmation and rollback capture |
| Production | Not created or selected | `OWNER_CONFIRMED_NONE_EXISTS_2026-08-13` | No production deployment is authorized |

Authenticated inventory confirms that `packproof-4cf53` is an active live development environment explicitly configured as `sandbox`; it is not an empty project. The inventory did not enumerate Authentication users, Firestore documents or Storage objects, so absence of production users or irreplaceable data is not claimed. A separate production project must be deliberately created or selected, assigned accountable organizational owners, configured independently, and recorded here before any production deployment.

### Firebase sandbox inventory - 2026-08-13

| Surface | Verified state | Gate implication |
|---|---|---|
| Firebase access | `nericollin@thepackproof.com` can access active project `packproof-4cf53`, project number `572691138698` | Gate 1 Firebase login restored |
| Billing | Blaze pay-as-you-go plan; Firestore database currently marked free-tier | Budget and cost alerts required before broader live testing |
| Android app | One active app, `com.packproof.app` | Matches intended package identity |
| Authentication providers | Google enabled; no other provider shown enabled | Matches owner-approved Google-only launch default |
| App Check app | Android PackProof app registered | Registration exists; exact Play signing/provider configuration still requires acceptance proof |
| App Check enforcement | Storage, Firestore and Authentication all `Unenforced`; Functions enforcement is implemented per callable rather than a console-wide toggle | Do not claim enforced sandbox protection yet |
| Functions | 47 active Gen 2 Functions, Node.js 22, `us-east1`, across four deployment hashes | Active sandbox backend exists; exact source/deployment provenance is not established |
| Runtime feature configuration | `API_ENVIRONMENT=sandbox`; TikTok and RevenueCat billing disabled | Matches approved initial-release defaults |
| Secret bindings | `API_CREDENTIAL_PEPPER` v2, `MANIFEST_SIGNING_SECRET` v4, `PARTICIPANT_HANDOFF_SIGNING_SECRET` v2 and `PUBLIC_HANDOFF_SIGNING_SECRET` v2 | Names/versions verified; values were not accessed |
| Firestore | Native `(default)` database in `nam5`; nine composite indexes; PITR and deletion protection disabled | Backup/restore and deletion-protection decisions required before production |
| Hosting | Default live channel at `https://packproof-4cf53.web.app`; latest observed release on 2026-08-13 by the release-captain account | Live sandbox surface exists; legal placeholders and exact source provenance remain blockers |
| Account security | Firebase Console warns that Google-account MFA must be enabled before 2026-09-07 to retain access | Enable 2-Step Verification before the deadline and record recovery owners |

## GitHub access decision

| Control | Verified state on 2026-08-13 | Required follow-up |
|---|---|---|
| Authenticated identity | `thepackproof` via GitHub CLI keyring | Preserve organization-controlled recovery and add a second secured owner before production |
| Repository | Public `thepackproof/repo`; authenticated viewer has `ADMIN` | Confirm public visibility is intentional before release freeze |
| Default branch | `master` at `7acf79489e9b5b6c78f9a6b8ae64d529cd9b0e3b` | Keep or rename deliberately; do not maintain conflicting `master`/`main` policy |
| Branch protection | `master` is unprotected | Protect after the required workflow is repaired and stable |
| Actions | Enabled; default workflow token permission is read-only | Retain least privilege and use protected environments for deployments |
| Current CI | `PackProof quality gates` is registered; the `7acf794` push ended in `startup_failure` before any check ran | Repair the workflow/configuration failure and require the passing quality gate |
| Duplicate workflow | `.github/workflows/agent-ci.yml` targets only `main` and is not registered in the current workflow inventory | Consolidate or remove through a reviewed repository change |

Authentication restoration authorized read-only inventory only. No branch protection, workflow, repository visibility, environment, secret, commit, push, or deployment setting was changed.

The repository owner explicitly approved the Google-only authentication, billing-disabled, and general-webhook-gated defaults on 2026-08-13. Any later expansion requires its separate proof gate and an updated release decision.

## Supported device class for validation

The candidate support claim is limited to Google Play-certified Android phones running Android 8.0 / API 26 or later, with Google Play services, a rear camera, a secure screen lock, and Android Keystore support. Biometric and hardware-backed assurances must be reported from actual provider/device evidence and may not be inferred from this device-class definition.

The acceptance matrix must include at least one current Android physical phone and one physical Android 8+ lower-bound phone. No tablet, foldable, rugged-device, custom-ROM, rooted-device, emulator, or universal cross-device support claim is authorized without separate testing.

## Frozen demonstration scenario

The first demonstration is one high-value two-party private transaction using two dedicated Google accounts and two signed Android installations against one named isolated Firebase sandbox:

1. A merchant Button or API client creates a provenance-bearing handoff without exposing a private merchant credential to the browser.
2. The seller reviews imported data and creates the transaction.
3. The buyer claims a one-use invitation and both participants confirm the same terms.
4. The seller records a continuous `PACKING_VIDEO` showing the item-to-package sequence, `PP` mark across the label/package boundary, tape/seal application, and high-resolution reference view; interrupts connectivity; proves encrypted local retention; restores connectivity; and observes server finalization.
5. The seller records shipment only after finalized integrity-acceptable packing evidence exists.
6. The buyer records the received package, boundary mark, tape and seams, then records an `UNBOXING_VIDEO`; the transaction reaches the expected review/completion state without an automated physical verdict.
7. The seller and buyer exercise one Return Passport path using `RETURN_PACKING_VIDEO` and `RETURN_UNBOXING_VIDEO`.
8. An authorized participant generates and privately downloads the dossier/evidence packet and verifies its byte and manifest integrity.
9. A one-byte mutation is rejected, a replay is rejected or safely replayed according to its contract, and a cross-tenant read is denied.
10. Account export and deletion are exercised in the sandbox with the documented shared-record and cancellation behavior.

## Feature and claim matrix

| Surface | State | Owner | Runtime boundary | Acceptance path | Permitted claim boundary |
|---|---|---|---|---|---|
| Google sign-in | `IN_SCOPE` | Mobile/backend | Enabled configuration and Firebase provider | Live sandbox and exact-device sign-in | Establishes account/provider context, not civil identity or honesty |
| Seller transaction/passport | `IN_SCOPE` | Mobile/backend | Authenticated transaction services | Two-account golden path | Shared structured record of submitted terms |
| Buyer invitation/claim | `IN_SCOPE` | Mobile/backend | One-use, actor-bound handoff | Claim, expiry, replay and wrong-actor negatives | Role binding within the service only |
| Mutual confirmation | `IN_SCOPE` | Mobile/backend | Server-authoritative state transition | Both actors confirm identical terms | Records confirmations; does not establish truth of the terms |
| Packing/unboxing capture | `IN_SCOPE` | Mobile/backend | Native capture and server-authorized evidence session | Online, offline, restart and finalization cases | Records submitted media and bounded capture context |
| Human-reviewable `PP` boundary protocol | `IN_SCOPE` | Mobile/backend | Seller reference and buyer arrival/unboxing originals; no automated physical result | Exact two-device reference/arrival capture and dossier sequence | Preserves visible package observations for authorized human review; does not prove continuity, cause, actor, authenticity, fraud or fault |
| Offline encrypted queue | `IN_SCOPE` | Mobile | Android Keystore AES-256-GCM module | Physical-device process death, reboot, corruption and recovery | Encrypted local retention subject to key/device failure limits |
| Server hash and manifest | `IN_SCOPE` | Backend | Server-computed SHA-256 and service-authenticated manifest | Finalizer, mismatch quarantine and verifier tests | Byte integrity and service authentication within stated key controls |
| Shipment/timeline | `IN_SCOPE` | Mobile/backend | Finalized packing evidence prerequisite | Live state transition and authorization tests | Records service events and user-supplied carrier fields |
| Return Passport | `IN_SCOPE` | Mobile/backend | Authorized return state machine | Full live return path and negatives | Documents a return workflow; does not decide liability |
| Dossier/evidence packet | `IN_SCOPE` | Backend/mobile | Authorized short-lived private download | Generate, download, hash and verifier tests | Presentation artifact; not guaranteed admissibility or outcome |
| Concern reporting/blocking | `IN_SCOPE` | Mobile/backend/operations | Authenticated private controls | Report, block and future-interaction tests | Records a concern; does not determine fault |
| Account export/deletion | `IN_SCOPE` | Backend/mobile/operations | Authenticated export and scheduled deletion | Export, cancel, execute, retry and shared-record cases | User data lifecycle only within published limits |
| Public Button/handoff | `IN_SCOPE` for one allowlisted demo origin | API/web | Publishable key, exact-origin allowlist and short-lived handoff | Browser-to-app live golden path and origin/token negatives | Imports declared commerce context; it does not authenticate an order by itself |
| Merchant transaction API | `IN_SCOPE` | API/backend | Credential scopes, tenant isolation and idempotency | Emulator plus live sandbox transcripts | Headless transaction context within implemented v1 resources |
| Facebook sign-in | `FEATURE_GATED` | Mobile/backend | Disabled configuration | Separate provider gate | No launch claim |
| TikTok sign-in | `FEATURE_GATED` | Mobile/backend | Disabled configuration and deletion card | Separate provider gate | No launch claim |
| PackProof Pro/billing | `FEATURE_GATED` | Mobile/backend | Disabled configuration | Separate billing acceptance | No pricing or entitlement claim |
| General webhook delivery | `FEATURE_GATED` | API/backend/operations | Excluded from initial public promise | Separate reliability and security gate | No general callback claim |
| SISV algorithmic comparison | `POST_LAUNCH_RESEARCH` | Research/security | Production unavailable; core launch flow cannot depend on it | Consent-governed dataset, frozen implementation and independent validation | At most bounded neutral observations; never cause, actor, authenticity, fraud, fault, liability or disposition |
| Carrier weight/laser telemetry | `POST_LAUNCH` | Partnerships/backend | No active integration | Contracted provider, provenance, correction, semantics and live integration gate | Neutral carrier context only; no attribution, fraud conclusion or automatic disposition |
| Automatic dispute decision | `PERMANENTLY_OUT_OF_SCOPE` | External authorized decision-maker | PackProof has no adjudication authority | Not applicable | PackProof organizes evidence and does not approve, deny, score or recommend dispute outcomes |

## Required accountable sign-offs

| Responsibility | Proposed accountable identity | Status |
|---|---|---|
| Release captain and rollback decision | `nericollin@thepackproof.com` | `OWNER_CONFIRMED_2026-08-13` |
| Product scope and claims | `nericollin@thepackproof.com` | `OWNER_CONFIRMED_2026-08-13` |
| Internal security acceptance | `nericollin@thepackproof.com` | `OWNER_CONFIRMED_2026-08-13`; independent assessment remains unproved |
| Legal-services channel | LegalZoom Business Attorney services / associated attorney network | `PROVIDER_RETAINED_2026-08-13`; specific participating attorney or firm not yet assigned in this record |
| Legal/privacy/terms acceptance | Assigned licensed attorney or participating firm through LegalZoom | `SIGN_OFF_OWNER_REQUIRED`; must accept the PackProof privacy, terms, data-lifecycle and launch review matter |
| Production Firebase and Play ownership | PackProof organization owner not yet evidenced | `OWNER_ACTION_REQUIRED` |

## Gate 0 disposition

`FAILED_WITH_EVIDENCE`

The release defaults and feature boundaries are concrete, the authentication, billing and webhook defaults have owner approval, and the release captain and internal security acceptance owner are confirmed. `packproof-4cf53` is the owner-designated sandbox candidate, but its isolation is not yet verified and no production Firebase project exists. LegalZoom is the retained legal-services channel, but a participating licensed attorney or firm has not yet been recorded as accepting the PackProof sign-off matter. Gate 0 cannot pass until the production project is created or selected and the legal/privacy and production owners are complete. Public legal placeholders also remain and require approved content rather than agent-authored legal conclusions.
