# Launch Readiness — Agent Execution Checklist

This file encodes the "Launch-Readiness Execution Plan" into a concise, agent-friendly checklist and gate template for PackProof.

## Summary
- Core rule: prove the live core product path first (sandbox → app → core flow), defer deep testing until polish.
- Gate-driven: only advance when previous gate passes.

## Phase checklist

### Phase 0 — Define Launch Target (Completed)
- Outcome: product scope and limits recorded.

### Phase 1 — Sandbox Infrastructure (In progress)
- Tasks:
  - Validate Firebase project configuration and secrets
  - Deploy Firestore rules and indexes
  - Deploy Storage rules
  - Deploy Cloud Functions and hosting rewrites
  - Verify auth providers and App Check
  - Smoke health/readiness checks
- Acceptance: backend reachable, auth works, smoke operations succeed

### Phase 2 — Native App Build & Startup
- Tasks:
  - Produce Android candidate (AAB/APK)
  - Code-sign / EAS build (if required)
  - Install on device via `adb` or TestLab
  - Confirm cold start and logcat free from native module errors
  - Verify Google sign-in and App Links

### Phase 3 — Core Product Flow Validation
- Tasks:
  - Seller creates transaction and invite
  - Buyer joins and confirms terms
  - Evidence capture/upload finalizes
  - Dossier generated and exportable
  - Return flow and deletion/export work
- Acceptance: end-to-end flow completes with correct server-side state

### Phase 4 — Minimal Security / Integrity Gate
- Tasks:
  - Verify authorization boundaries (no cross-account reads)
  - Reject replay/duplicate submissions
  - One-byte mismatch rejection test for artifacts
  - App Check / auth verification on server
  - Callback/HMAC verification

### Phase 5 — Vendor Demo Path (Optional)
- Tasks targeted only for partner demo support

### Phase 6 — Final Polish (Deferred)
- Deep testing, stress tests, legal/compliance review, runbooks

## Gate template (for each milestone)
- Objective
- Required evidence (artifacts/logs/screenshots)
- Success criteria
- Failure criteria
- Move-on rule

## Immediate next actions I will run now (confirm before I proceed):
1. Run backend smoke tests that do not require secrets: `npm --prefix functions run test:api`.
2. List required secrets and deploy steps; report any missing external creds.
3. If you want, I can continue with a CI-local run of the steps in `.github/workflows/agent-ci.yml` (install, typecheck, lint, build functions, run API tests).


---

Files created/updated by agent:
- `docs/LAUNCH_READINESS.md` (this file)

If you want me to proceed with the immediate next action (#1), reply "Proceed: run API tests" or ask me to run the CI-equivalent sequence.