# PackProof source-gate report — 2026-08-15

This report replaces any use of the historical [`BUILD_REPORT.md`](../../BUILD_REPORT.md) as evidence for the current API surface. That file is a 0.2.1 archive record. It does not attest 0.8.5.0, commit `a8a1db1`, or this working tree.

This report is source and emulator evidence only. It does not establish a live Firebase deploy, a current APK, two-device Gate 5, `DEMO_READY`, `LAUNCH_READY`, or `LAUNCHED`.

## Pinned commits

| Role | SHA | Notes |
| --- | --- | --- |
| Reviewed Connect API expansion (PR #6, `master`) | `a8a1db16e3c7b5cc016ffe83f7ecba7b9b92962e` | Headless merchant/Connect/claims-review routes. |
| This security-fix working tree | `cursor/fail-closed-grants-and-leases` on top of `a8a1db1` | Grant-consumption order, fenced idempotency leases, best-effort auth telemetry, Firestore partition design. |

Do not treat `a8a1db1` as having passed a complete release-validation matrix. GitHub's combined commit-status endpoint for `a8a1db1` returned `state: pending` with `total_count: 0` on 2026-08-15. Check runs on that SHA were:

| Check | Conclusion |
| --- | --- |
| `source-and-api` | success |
| `Analyze (javascript-typescript)` | success |
| `Analyze (actions)` | success |
| `deploy` | skipped |
| `Dependabot` | failure (dependency alert, not a PackProof product gate) |

Those check runs are not a substitute for the mobile, device, or live-backend matrix.

## Gates rerun on this working tree — 2026-08-15

Operator: local source workspace `C:\src\PackProof\repo`. Node 22. No live project. No APK rebuild. Installed device artifact remains RC.2 and was not replaced.

| Gate | Result |
| --- | --- |
| `npm --prefix functions run test:application` | pass |
| `npm --prefix functions run test:api` | pass |
| `npm --prefix functions run test:domain` | pass |
| `npm run test:claims` | pass |
| `npm run test:api:functions` | pass |
| `npm run test:sdk` | pass |
| `npm run test:application:firestore` | pass |
| `npm run test:api:firestore` | pass |

New coverage in those gates includes Connect grant compare-and-set (wrong client/redirect/PKCE/token does not consume; concurrent consume is one-winner), and idempotency fencing (live lease is not stolen; completion requires the owner token).

## Not rerun

- Mobile typecheck, Expo lint, native Android build, signed APK/AAB, and Play upload.
- Device install, startup UI, logcat, or camera capture on `SM-S928U`.
- Two-party Gate 5.
- Live sandbox or production Firebase deploy, App Check enforcement proof, or Hosting rewrite in a live project.
- Independent security review or scientific validation.

## Residual limits

Physical correspondence remains `NOT_AVAILABLE`. Business/legal relevance remains `REVIEW_REQUIRED`. Presentation dossiers remain presentation-only. General merchant webhooks remain feature-gated. Firestore rate-limit and audit-head partitioning is designed, not activated.
