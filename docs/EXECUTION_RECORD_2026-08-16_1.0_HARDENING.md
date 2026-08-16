# PackProof execution record - 2026-08-16 1.0 source hardening

Controlling plan: [`../agent.md`](../agent.md)  
Assessment: PackProof 1.0 Codebase Assessment and Release Hardening Plan (reviewed SHA `22d8a65`)

This record does **not** replace [`EXECUTION_RECORD_2026-08-16.md`](EXECUTION_RECORD_2026-08-16.md). RC.3 sandbox deploy evidence stays as written. This tranche implements the assessment's in-repository hardening items on a dirty working tree descended from `22d8a65`.

## Implemented in source

| Assessment item | Result |
|---|---|
| 1. Dependency-advisory matrix | `SOURCE_CHECKED` policy: [`DEPENDENCY_ADVISORY_MATRIX_2026-08-16.md`](DEPENDENCY_ADVISORY_MATRIX_2026-08-16.md), [`DEPENDENCY_ADVISORY_POLICY.json`](DEPENDENCY_ADVISORY_POLICY.json), CI `test:dependency-advisories`. Unique GHSAs: `GHSA-w3rx-r6r6-pgpr`, `GHSA-5p2g-fcmc-qvqq` (accepted high through 2026-11-13), `GHSA-w5hq-g745-h8pq` (moderate). No `npm audit fix --force`. |
| 2. Plaintext temp-file lifecycle | Startup/foreground/sync scrub; source delete after successful enqueue except physical multi-frame series; crash-recovery tests; unreadable encrypted metadata remains a visible local fault |
| 3. Connect callback retry selection | Due-time query + `status`/`nextAttemptAt` index; starvation unit and emulator tests |
| 4. Idempotency fencing for side effects | [`adr/0011-idempotency-side-effect-fencing.md`](adr/0011-idempotency-side-effect-fencing.md); report/sign/audit/transaction-created effects are fence-checked; stale-worker integration test |
| 5. Generated-artifact drift | CI `git diff --exit-code` on OpenAPI SDK and hosted contract; local generation matched committed contract content |
| 6. Repository hygiene | `.attachments` removed from git; Word decks moved to `docs/business/`; general webhook dispatcher retained behind existing feature-gate (not deleted) |
| 7. Large mobile workflows | Capture guides/workflow extracted and wired into digital + physical capture routes; transaction labels extracted; queue discard/secure rules tested |
| 8. Deployment identity | [`DEPLOYMENT_IDENTITY.md`](DEPLOYMENT_IDENTITY.md); deploy job requests OIDC `id-token`; `FIREBASE_TOKEN` not switched. Branch protection is now **verified** (see that file). |

## Source and emulator gates rerun on this working tree

| Gate | Result |
|---|---|
| `tsc --noEmit` | Pass |
| `expo lint` | 0 errors; pre-existing warning in `src/app/transaction/new.tsx` (`Array<T>` vs `T[]`) |
| `test:dependency-advisories` | Pass (root 3 unique GHSA, functions 1) |
| Functions `audit --omit=dev --audit-level=high` | Pass (7 moderate uuid nodes only) |
| Capture/queue/runtime/seal/android-config/claims/billing/verifier | Pass |
| Functions application (20), API (18), domain (28) | Pass |
| API Firestore integration | 12 pass, including Connect retry and stale-worker fence |
| Application Firestore integration | 6 pass |
| Firestore/Storage rules | Pass |
| API Hosting/export smoke, evidence format, Connect SDK | Pass |
| OpenAPI SDK regeneration vs committed contract | `git diff --exit-code` pass (CRLF checkout noise only) |

Classification for this working tree: **`SOURCE_CHECKED` and `EMULATOR_CHECKED`**. It is **not** a frozen SHA.

## Explicitly not claimed

| Gate | Status |
|---|---|
| G0 production project / counsel-approved legal text | Unchanged blockers |
| G1 WIF cutover / production GitHub environment | Branch protection verified; `production` environment absent; only Firebase project is `packproof-4cf53`; `FIREBASE_TOKEN` still in use |
| G2 frozen candidate SHA | Hardening is uncommitted; HEAD remains `22d8a65` |
| G3 `SANDBOX_CHECKED` | Not rerun against this working tree. Live `/v1/health` and `/v1/ready` on `packproof-4cf53` still return 200 from the **RC.3** deploy |
| G4 signed APK / G5 two-device proof | No ADB devices; keystore remains interactive; no second Android 8+ device |
| G8/G9 Play and production | Unauthorized; no production Firebase project |
| Tag `v1.0.0` | **Not created.** A 1.0 tag requires the accepted SHA to pass live sandbox, signed-device, and remaining launch gates. |
| `DEMO_READY` / `LAUNCH_READY` | **Not recorded.** |

## Resume point

1. Review and commit this working tree if the owner wants a new candidate SHA (do not treat `22d8a65` as containing this hardening).
2. Deploy **that** SHA to `packproof-4cf53` and complete Gate 3 live acceptance (BOLA, App Check, App Links, alerts, rollback rehearsal).
3. Resume Gate 4/5 from [`EXECUTION_RECORD_2026-08-16.md`](EXECUTION_RECORD_2026-08-16.md): make `R5CX52CK06Z` visible to ADB, inspect the queue, sandbox-sign an APK whose cert SHA-256 is `BE4712525FB40E8C3C06F58CE87349B63A6BF1DB3BB7EACD5D10972EB9AD7136`, then two-device proof.
4. Do not tag `v1.0.0` until those gates pass on the exact candidate.
