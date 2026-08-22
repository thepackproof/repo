# PackProof demonstration operations

Use a dedicated sandbox Firebase project. Do not demo from a local development server or from production.

```text
npm run demo:reset
npm run demo:seed
npm run demo:verify
```

`demo:verify --source` checks repository files only. Live health checks run when `PACKPROOF_DEMO_API_BASE` is set.

API journey: `docs/demo/packproof-api-demo.postman.json`.

Scripted stories: `docs/demo/SCENARIOS.md`.

Device / E2E / INT: `docs/demo/DEVICE_AND_E2E_RUNBOOK.md`. Those remain unproven until an owner runs them on an exact APK.

Candidate checklist: `docs/demo/CANDIDATE_GATE.md`.
