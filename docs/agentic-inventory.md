# Agentic Codebase Inventory

This document summarizes the repository structure and the main components for autonomous (agentic) development.

Repository root highlights:
- `package.json` — root scripts and developer commands.
- `functions/` — Firebase Cloud Functions source and tests. Primary API implementation under `functions/src/api/v1`.
- `src/` — Expo/React Native mobile app (`src/app`, `src/components`, `src/lib`).
- `modules/packproof-secure-file/` — local native module for secure file handling used by the mobile client.
- `docs/` — architectural docs, whitepaper, claims register, test plans, ADRs (new agentic ADRs will be added here).
- `scripts/` and `tools/` — utility scripts (build, test, verifier, validation helpers).

Key service components (functions/src):
- `api/v1/` — express app (`app.ts`), validation, security, firestore adapters, controls (rate limiting, idempotency, audit), production composition root.
- `application/v1/` — domain services (merchant-transaction-service, participant-capture-service, public-commerce-handoff-service).
- `infrastructure/firebase/v1/` — Firestore repositories, outbox persistence, crypto token issuers.
- `infrastructure/crypto/` — token issuers/verifiers (HMAC/SHA256-based tokens).

Mobile client:
- `src/app` — Expo-router entrypoints and capture UI.
- `modules/packproof-secure-file` — PPQ1 v2 encrypted queue, Android Keystore integration.

Tests and CI-relevant artifacts:
- `functions/package.json` includes `test:api`, `test:api:firestore`, `test:application`, and build scripts.
- Root `package.json` includes commands to run `npm --prefix functions` tests and tools like `verify-evidence.mjs`.
- Emulator-based tests use `firebase-tools emulators:exec` and expect Firestore emulator available.

Secrets and deployment prerequisites (agent note):
- Required secrets: `API_CREDENTIAL_PEPPER`, `PUBLIC_HANDOFF_SIGNING_SECRET`, `PARTICIPANT_HANDOFF_SIGNING_SECRET` (stored in Firebase Secret Manager for production). The agent can prepare provisioning scripts, but the secrets must be supplied by the repository owner in a secure environment.
- App Check / Play Integrity: production App Check setup requires Play Console/App linking and cannot be fully provisioned by an agent without the owner's credentials.

Local artifacts created during inspection:
- `.attachments/pitch.txt`
- `.attachments/api-plan.txt`
- `.attachments/whitepaper.txt`

Agentic execution boundaries:
- The AI agent can: modify code, create CI pipelines, run tests in this workspace, generate infra-as-code, and create validation scripts.
- The AI agent cannot (without user action): provision production secrets in secret manager, push to remote protected repositories, register Play Console App Check keys, or provide external credentials.

Execution authority:
- The repository's current launch, demonstration, ownership, proof-gate, and rollout instructions are in [`../agent.md`](../agent.md).
- The ADRs and architecture documents listed here remain technical references, but they do not select the next launch action.
- Historical readiness statements must be reverified against the exact current source, binary, environment, and device before reuse.

