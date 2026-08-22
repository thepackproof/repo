# HC-1 progress — 2026-08-22

Classification: source implementation record for Hardening Candidate 1. Not `DEMO_READY`, not `LAUNCH_READY`, not a device or live-backend claim.

Package identity: `0.9.6.0`. Baseline SHA: `db69eef11890fc5d566795d92d40740a21f82308`.

## Closed in source

| ID | Defect | Source disposition |
|---|---|---|
| HD-01 | Home invented protocol | Mobile Home waits for workspace slices. Cards render `projectTransactionWorkspace` only. |
| HD-02 | Portal list vs get | List and get both call `toHydratedDto` → protocol + proof. |
| HD-03 | Lifecycle `View Proof` | `proofCanBeViewed` is `AVAILABLE` only. Golden fixtures lock PACKED / SHIPPED / COMPLETED without Proof. |
| HD-04 | `externalOrderId` trust short-circuit | Authoritative bind requires attested trust plus a commerce context or merchant reference. |
| HD-05 | Uneven Proof hydration | Merchant, Portal, and callable GET go through `ProofApplicationService`. |
| HD-06 | Intake overlay provenance | Seller-changed fields stamp `SELLER_ENTERED` and supersede the imported assertion. |
| HD-07 | GET binds identity | Bind is explicit, idempotent, and documented. Read-only GET throws `PROOF_IDENTITY_NOT_BOUND`. List/workspace hydration does not bind. |
| HD-08 | UI called the resolver | Architecture lint forbids `resolveNextRequiredAction` in mobile UI and Portal pages. |
| HD-09 | PR process | Branch protection still requires CI. Raising required reviewers above 0 needs GitHub admin and is not done here. |
| HD-10 | Working-tree secrets | `functions/.env.thepackproof-prod` and `google-services.production.local.json` remain untracked and must stay uncommitted. |

## Source-only phases completed

P0 workspace projection, Proof service, lifecycle-independent availability, and hydrated Home/Workspace surfaces.

P1 trust, intake assertions, digest assurance, golden workspace fixtures, queue fail-closed script, Proof property script, architecture lint, `0.9.6.0` identity, and `release-manifest.hc1.json`.

Additional P1 reliability on this branch after the initial seam close:

- Concurrent first Proof GET/bind requests converge on one identity (`functions/tests/hardening-hc1.test.mjs`).
- Corrupted / quarantined / incomplete evidence never yields `AVAILABLE`.
- Phase 8 Portal UX: when Proof is `AVAILABLE` and capture is not required, **View Proof** is the primary Home/Workspace CTA; Open becomes Details.

P2 scaffolding only: operation log, feature flags, claims vocabulary expansion, and the operations notes linked from [`README.md`](README.md). Thresholds, live drills, and production environment protection are not claimed.

## Intentionally not done

- AND-01–07 and E2E-01–10
- Exact Android binary vs deployed backend
- Live disaster-recovery drills
- Production GitHub environment
- Tagging `v1.0.0`, `DEMO_READY`, or `LAUNCH_READY`
- Enterprise unfreeze / warehouse pilot
- Changing HMAC records into public digital signatures
