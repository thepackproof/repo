# HC-1 progress — 2026-08-22

Classification: source implementation record for Hardening Candidate 1. Not `DEMO_READY`, not `LAUNCH_READY`, not a device or live-backend claim.

Package identity: `0.9.6.0`. Baseline SHA: `db69eef11890fc5d566795d92d40740a21f82308`.

## Closed in source

| ID | Defect | Source disposition |
|---|---|---|
| HD-01 | Home invented protocol | Android and Portal render the server `TransactionWorkspaceProjectionV1`. They do not project next action locally. |
| HD-02 | Portal list vs get | List and get both return the same `workspace` object from `TransactionWorkspaceApplicationService`. |
| HD-03 | Lifecycle `View Proof` | `proofCanBeViewed` is `AVAILABLE` only. Golden fixtures lock PACKED / SHIPPED / COMPLETED without Proof. |
| HD-04 | `externalOrderId` trust short-circuit | Authoritative bind requires attested trust plus a commerce context or merchant reference. |
| HD-05 | Uneven Proof hydration | Merchant, Portal, and callable GET go through `ProofApplicationService`. |
| HD-06 | Intake overlay provenance | Seller-changed fields stamp `SELLER_ENTERED` and supersede the imported assertion. |
| HD-07 | GET binds identity | `issueProofIdentity()` is the write path. GET Proof is read-only and throws `PROOF_IDENTITY_NOT_BOUND` until bind. Eligible server finalization may issue. |
| HD-08 | UI called the resolver | Architecture lint forbids `resolveNextRequiredAction` in mobile UI and Portal pages. |
| HD-09 | PR process | Branch protection still requires CI. Raising required reviewers above 0 needs GitHub admin and is not done here. |
| HD-10 | Working-tree secrets | `functions/.env.thepackproof-prod` and `google-services.production.local.json` remain untracked and must stay uncommitted. |

## Phase status

| Phase | Source status |
|---|---|
| 0 Freeze + baseline | Done |
| 1 Workspace projection | Done. Callables and Portal/API return the complete projection, not slices. |
| 2 Proof application service | Done |
| 3 Proof availability ≠ lifecycle | Done |
| 4 Commerce trust from provenance | Done |
| 5 Append-only intake assertions | Done |
| 6 Digest-assurance provenance | Done |
| 7 Explicit identity bind | Done in source. GET is read-only. Issue is atomic, idempotent, and tested under concurrent first access |
| 8 One-action UX | Done for Home/Portal: View Proof primary when `AVAILABLE` |
| 9 Queue fault matrix | Done in source (`queueFaultOutcome` × every state/fault) |
| 10 Idempotency contract | Done in source for the named mutation list. Merchant API already fences side effects |
| 11 Cross-surface golden fixtures | Done (`test:hardening-contracts` + 20 golden journeys + HC-1 tests) |
| 12 Architecture lint | Done (`test:architecture`) |
| 13 Schema/policy pinning | Done (`evaluationPolicyForRecord` keeps capture policy) |
| 14 Release identity | Done (`release-manifest.hc1.json`) |
| 15 Protect master | CI required. Reviewer count still 0 (admin) |
| 16 Supply-chain CI | Existing advisory/audit/OpenAPI drift gates remain |
| 17 Automated candidate gate | `npm run test:hc1-source-gate` is the source gate. AND/E2E stay owner-operated |
| 18 Exact Android build | Not produced on this SHA |
| 19 AND-01–07 | Not run |
| 20 E2E-01–10 | Not run |
| 21 Exact-byte negative tests | Source: verifier + `finalizationOutcomeFromIntegrity`. Live INT harness remains |
| 22 Telemetry percentiles | Source helper only. No production export |
| 23 Operation log | Structured `withOperationLog` on Proof GET/issue and workspace list/detail/hydrate (reads, summary hits, hydration ms) |
| 24 Internal SLO list | Measurement list only. No advertised budgets |
| 25 Feature flags | Intake and high-risk flags are killable without an Android release |
| 26 Disaster recovery | Documented. Not drilled live |
| 27 Privacy/retention | Digest + fields only. Email/phone/payment redacted from retained text |
| 28 Key registry | Executable HMAC registry. No public-signature reinterpretation |
| 29 Fuzz / property | Commerce missing-beats-guessed + Proof properties |
| 30 Retry/backoff | Bounded retry + jitter + Retry-After |
| 31 Enterprise prerequisites | Checklist fails. Mode stays `OBSERVE`. ENFORCE not allowed |
| 32 CV scientific gate | `physicalCorrespondence` stays `NOT_AVAILABLE`. Model `MATCH` rejected |

## Intentionally not done

- AND-01–07 and E2E-01–10
- Exact Android binary vs deployed backend
- Live disaster-recovery drills
- Production GitHub environment
- Raising required approving reviews above 0
- Tagging `v1.0.0`, `DEMO_READY`, or `LAUNCH_READY`
- Enterprise warehouse pilot / ENFORCE
- Changing HMAC records into public digital signatures
