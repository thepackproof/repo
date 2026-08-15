# PackProof execution record - 2026-08-15

Controlling plan: [`../agent.md`](../agent.md)

Requested objective: complete work that can honestly advance completion while only one physical test device is available.

Starting source: `d1e07588eac152b22c1b5a43eda585939d330a68` (`master`, matching `origin/master` at inspection time)

## Constraint applied

One physical device is available: Samsung `SM-S928U` serial `R5CX52CK06Z`. Gate 5 two-party proof, Gate 7 demonstration, and any lower-bound device matrix therefore remain blocked. This tranche did not invent a second device, did not treat one account as both parties, and did not overwrite or uninstall the installed RC.2 artifact.

## Work deliberately not performed

| Action | Reason |
|---|---|
| Sandbox or production Firebase deploy | Gate 3 still requires explicit release-captain confirmation of rollback revision and exact candidate identity. Source changed in this tranche, so RC.2 is no longer the deployable candidate. |
| Legal-placeholder replacement | Public pages still contain `[PACKPROOF LEGAL ENTITY]` and related launch fields. Agent-authored legal conclusions are prohibited. |
| New APK install over RC.2 | Installing this uncommitted source would create a new candidate identity and risk the retained RC.2 device state. |
| Shutter capture, queue, or upload on the installed app | The installed binary is RC.2. These source changes are not in that binary. Creating evidence against the live sandbox would not prove this candidate. |
| Application-data clear or uninstall | Forbidden while unsynchronized queue state may exist. |
| Production project creation, Play submission, App Check enforcement | Outside the authorized first tranche and not unblocked by one-device work. |

## Source work completed

Gate 5A human-reviewable package-seal protocol is now implemented in source:

- Seller packing checklist requires item-to-package, label application, `PP` mark across the label/package boundary, tape/seal, and a steady high-resolution end view.
- A dedicated high-resolution seal-reference capture (`SHIPPING_LABEL`) is a first-class outbound step, not a hidden supporting choice.
- Buyer arrival observation (`DELIVERY_PHOTO`) is required before shipment completion is treated as protocol-complete; unboxing remains a separate continuous record.
- Return packing has the matching seal-reference step (`RETURN_SHIPPING_LABEL`).
- Transaction review shows seller reference and buyer arrival side by side with the permanent no-verdict disclaimer.
- Dossier PDF v2.1.0 adds the same human-reviewable observation section and disclaimer.
- `submitShipping` and `submitReturnShipping` fail closed unless both the continuous packing video and the high-resolution seal reference are server-finalized with no byte-integrity mismatch.
- SISV 15-frame capture remains available and is labeled optional research, not required.
- Return-unboxing copy no longer tells the operator to “detect substitutions or counterfeit swaps.”

## Source gates rerun on this working tree

| Check | Result | Classification |
|---|---|---|
| `npm run typecheck` | Passed | `SOURCE_CHECKED` |
| `npm run lint` | Passed | `SOURCE_CHECKED` |
| `npm --prefix functions run build` | Passed | `SOURCE_CHECKED` |
| `npm run test:package-seal-protocol` | Passed | `SOURCE_CHECKED` |
| `npm run test:runtime-display` | Passed | `SOURCE_CHECKED` |
| `npm run test:claims` | Passed | `SOURCE_CHECKED` |
| `npm run test:queue-attention` | Passed | `SOURCE_CHECKED` |
| `npm --prefix functions run test:application` | 9 passed, including the new observation-grouping test | `SOURCE_CHECKED` |
| `npm --prefix functions run test:domain` | 28 passed | `SOURCE_CHECKED` |
| Live sandbox, emulator matrix, APK, device capture | Not rerun for this candidate | `NOT_YET_TESTED` |

CI now also runs `test:runtime-display` and `test:package-seal-protocol` on pull requests and `master` pushes.

## One-device inspection

The existing RC.2 install was inspected only. No capture, upload, data clear, or reinstall occurred.

| Property | Observed 2026-08-15 |
|---|---|
| Device | Samsung `SM-S928U` / `R5CX52CK06Z` / Android 16 |
| Package | `com.packproof.app` |
| versionName / versionCode | `0.8.5.0` / `5` |
| firstInstallTime | `2026-08-13 13:08:50` |
| lastUpdateTime | `2026-08-14 22:47:49` |
| Signing SHA-256 | `BE4712525FB40E8C3C06F58CE87349B63A6BF1DB3BB7EACD5D10972EB9AD7136` |
| App Links host | `packproof-4cf53.web.app` domain-verified |

This remains the RC.2 binary recorded in [`RELEASE_PROGRESS_CLOSING_RECORD_2026-08-14.md`](RELEASE_PROGRESS_CLOSING_RECORD_2026-08-14.md). It does not contain this tranche’s protocol changes.

## Gate effect

| Gate | Effect of this tranche |
|---|---|
| Gate 0 | Unchanged. Production project and legal sign-off remain missing. |
| Gate 1 | Unchanged. |
| Gate 2 | Advanced: protocol completeness is now testable in source, and CI covers the new contract. Not formally closed. |
| Gate 3 | Still `NOT_ACCEPTED`. Do not deploy until this source is committed, tagged, and authorized. |
| Gate 4 | RC.2 one-device camera-entry proof still stands for that exact APK only. This source needs a new signed artifact. |
| Gate 5A | Source path is implemented. Live two-record proof still requires a new APK, authorized sandbox, and a second device or a later one-device seller-only subset. |
| Gates 6-9 | Unchanged. `DEMO_READY`, `LAUNCH_READY`, and `LAUNCHED` are not recorded. |

## Resume point

1. Review and commit this working tree if accepted, then tag a new release candidate. Do not reuse `v0.8.5.0-rc.2`.
2. Confirm whether `packproof-4cf53` is authorized for that new candidate and capture its rollback revision.
3. Deploy only the named sandbox from the exact tagged commit.
4. Build a new sandbox-signed APK. Install in place on `R5CX52CK06Z` without clearing data after checking for unsynchronized queue items.
5. On the single device, prove seller packing video, seal-reference still, offline queue retention, and server finalization. Do not claim two-party Gate 5 from a one-role run.
6. When a second device exists, complete buyer arrival/unboxing, dossier pairing, verifier, return path, and required negatives.

Working tree at close: dirty, uncommitted protocol and CI changes on `master`. No Firebase, EAS, Play, secret, or device-data mutation was performed.

## Continuation on `cursor/package-seal-protocol`

After the protocol commit `71f00de`, a second source increment aligned launch surfaces with the billing-gated 1.0 contract:

- Welcome, home, and account copy no longer advertise a timestamped-proof slogan or a visible Pro/plan state while RevenueCat is disabled.
- Transaction cards show the next human-reviewable protocol step from status and role.
- Shipping fail-closed rules now share one tested helper for workflow-ready packing and seal evidence.

Source gates rerun: typecheck, claims, package-seal protocol, and 10 application tests passed. Live sandbox, APK, and device capture remain `NOT_YET_TESTED` for this branch.

## Continuation on `cursor/connect-headless-api`

Headless PackProof Connect v1 routes for merchants, e-commerce platforms, and claims-review tools are now implemented in source:

- Evidence list/read, timeline, presentation-dossier create/get, shipment get/associate, and return-passport read.
- Claims-review package with protocol completeness, documentation-category labels, and permanent no-verdict limitations.
- `POST/GET /v1/connect/sessions` for merchant credentials bound to an active Connect integration.
- Shipment association reuses the packing-plus-seal fail-closed rule.
- General webhook registration remains unimplemented and is not advertised.

Source gates rerun: API/OpenAPI, application, domain, claims, SDK, and function-export smoke tests passed. No Firebase deploy, APK, or live credential exercise was performed.
