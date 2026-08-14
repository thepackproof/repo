# PackProof API development status - 2026-08-10

> Historical snapshot only. The API surface expanded after this record. Use [`../agent.md`](../agent.md) for current launch sequencing and proof requirements, and the current OpenAPI contract for the implemented HTTP surface.

> Historical checkpoint: this file records the initial merchant-transaction slice. Section 4 added the public page-declared commerce-handoff operation on 2026-08-11 without changing the merchant transaction contract. Its current implementation, 13-test HTTP/OpenAPI suite, three-test API Firestore suite, three-test application Firestore suite, browser SDK, app review handoff, security boundary, and unproved live gates are recorded in [`architecture/SECTION_4_COMPLETION_2026-08-11.md`](architecture/SECTION_4_COMPLETION_2026-08-11.md).

## Outcome

The first merchant API vertical slice is **implemented and passed at source and emulator level**. This is not a claim of live deployment or production readiness.

Implemented endpoints:

- `GET /v1/health`
- `GET /v1/ready`
- `POST /v1/transactions`
- `GET /v1/transactions`
- `GET /v1/transactions/{transactionId}`

The capture-session, evidence-upload, finalization, and verification-result API phases remain intentionally outside this slice. Transaction creation returns `CAPTURE_SESSION_REQUIRED`; it does not manufacture a usable capture URL.

## Gate evidence

| Gate | Result | What it proves |
|---|---|---|
| TypeScript app typecheck | PASS | Application TypeScript compiles under the repository configuration |
| Expo lint | PASS | Configured application lint rules pass |
| Functions TypeScript build | PASS | Cloud Functions source compiles |
| API HTTP/unit/OpenAPI suite | PASS — 11 tests | Boundary behavior, validation, scopes, BOLA denial, cursor binding, idempotency, error envelopes, size limits, and contract controls |
| Firestore API integration | PASS — 2 tests | Real emulator transactions/queries, stable retry identity, exact replay, organization isolation, credential rejection/revocation, audit linkage, and fail-closed corrupt-record handling |
| Firebase export/rewrite smoke | PASS | Compiled Gen 2 function export metadata, region, resource settings, Secret Manager declaration, and Hosting rewrite target |
| Firestore and Storage rules | PASS | Existing client security-rule regression suite |
| Evidence format/verifier/claims/billing/SDK regressions | PASS | Existing non-API regression suites remain green |
| Functions production dependency audit | PASS at high-severity threshold | No reported high or critical production advisory in the Functions dependency tree |
| Root application dependency audit | OPEN — 15 high, 9 moderate | Pre-existing/transitive application dependency advisories remain; the suggested force-fix is breaking and was not applied |

## Security and persistence controls delivered

- Contract-first OpenAPI 3.1 schema under `/v1`.
- High-entropy merchant API credentials with HMAC-SHA-256 verifiers and a separate Secret Manager pepper; raw credentials are never persisted.
- Central scope authorization and organization-constrained repository access.
- Exact idempotent replay, payload-conflict detection, stable transaction identity across retries, and an in-flight processing lease.
- Fixed-window network and principal/operation throttles without raw IP persistence.
- Strict unknown-field rejection, bounded JSON bodies, opaque filter-bound cursors, stable error envelopes, request IDs, security headers, and sanitized structured logs.
- Append-only audit events linked by previous-event hashes. This is tamper-evident inside the data model, not independently immutable against a privileged Firebase administrator.
- A one-time credential provisioning utility that stores only the verifier. It has not been run against a live project.

## Not yet proven

- No sandbox or production deployment, live Secret Manager binding, IAM review, index-build verification, Hosting routing call, monitoring alert, merchant integration, load test, or penetration test was performed.
- The repository-wide application dependency advisories above remain unresolved.
- The capture-session/evidence/verification API phases have not started.
- No Android device, installed application, queued capture, or live Firebase state was changed during this API work.

Accordingly, the defensible status is: **SOURCE_CHECKED and FIRESTORE_EMULATOR_CHECKED for the first merchant transaction slice; NOT_LIVE_DEPLOYMENT_CHECKED.**
