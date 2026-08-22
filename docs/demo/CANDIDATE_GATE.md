# Demonstratable-build candidate gate

This is a checklist, not a readiness claim. Do not tag `1.0.0`, `DEMO_READY`, or `LAUNCH_READY` from this document.

| Area | Requirement | Source in repo | Live / device |
| --- | --- | --- | --- |
| Architecture | One server-owned workspace projection | `TransactionWorkspaceApplicationService` | Same projection on deployed Functions |
| Proof | One eligibility service and one identity | `ProofApplicationService`; GET read-only | Issue-on-finalization + races on staging |
| Android | Exact candidate on S24 + A16 | AND runbook | Unproven here |
| Auth | Two independent accounts | Auth + invitation code | Unproven here |
| Consumer | Seller → buyer journey | Golden fixtures + E2E runbook | Unproven here |
| Evidence | Real media server-finalizes | Finalization domain + trigger | Unproven here |
| Recovery | Crash/network recovers | Queue fault matrix | Unproven here |
| Integrity | Corruption quarantines | Verifier + INT runbook | Unproven here |
| Portal | Same workspace as mobile | Portal consumes `item.workspace` | Unproven here |
| API | Sandbox API journey | OpenAPI + Postman collection | Unproven here |
| Enterprise | OBSERVE journey | Console labeled Observe Mode | Unproven here |
| Proof representations | JSON and PDF agree | Passport + PDF tests | Unproven here |
| Returns | Full return path | Golden return fixtures | Unproven here |
| Security | Unauthorized access denied | API + rules tests | Unproven here |
| Neutrality | No adjudicative wording | `npm run test:claims` | Re-scan demo copy |
| Performance | Known measurements | Operation logs + phone timings | Unproven here |
| Environment | Exact identity recorded | Identity template | Fill before demo |
| Reset | Reset / seed / verify | `npm run demo:reset` / `seed` / `verify` | Use a dedicated sandbox |
| CI | Source candidate gate green | `npm run test:hc1-source-gate` | Required |

No known P0 or P1 demo-blocking defects. P2 production-readiness work may remain.

Performance timings to record on both phones (p50 / p75 / p95, even from ~20 internal runs):

- app cold start
- workspace load
- camera open
- recording stop → encryption complete
- encryption → upload start
- upload duration
- upload → server finalization
- finalization → Proof available
- Proof JSON load
- Proof PDF generation
- Portal Home load
- Portal workspace load

Do not guess which stage is slow. Read `workspace.list`, `workspace.detail`, `workspace.hydrate`, `proof.issueIdentity`, and `proof.getCurrent` operation logs.
