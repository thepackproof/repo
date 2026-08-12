# Agentic Roadmap (First-phase focus)

This roadmap is tailored for autonomous AI-driven execution on the existing code base. Each step is automatable by the agent; human input is required only for secure secret values and external account credentials.

Phase A — Foundation (automated)
- Inventory & ADRs: (done) produce `docs/agentic-inventory.md` and ADRs for manifest auth, matcher claims, outbox, and idempotency.
- CI generation: create GitHub Actions workflows to run lint, `tsc`, unit tests, and Firestore emulator integration tests. Create nightly runners for heavy tests.
- Test stabilization: run tests, auto-classify flaky tests, and where safe, apply code fixes or add mocks to stabilize.
- Secrets provisioning scripts: `infra/provision-secrets.mjs` to prepare `firebase functions:secrets:set` commands (requires user-supplied secret values).

Phase B — API completion & Finalizer
- Implement evidence finalizer: storage finalizer that computes server SHA-256, creates canonical manifest, computes HMAC, and atomically writes Firestore evidence record + outbox event.
- Harden idempotency and audit writers across finalizer and transaction creation.
- Add automated OpenAPI generation and client SDK stubs.

Phase C — Delivery, Rules, Mobile harness
- Outbox delivery worker and webhook retry logic with emulator tests.
- Generate Firestore rules and required composite indexes, and add emulator rule tests.
- Mobile test harness improvements: instrumented capture scripts, PPQ1 v2 compatibility verification, and local CI device emulator tests.

Phase D — Matcher R&D and Validation Automation
- Synthetic data generator, ingestion pipeline, and model training harness inside `validation/`.
- Implement prototype matcher and automated evaluation producing pre-registered metrics and model version artifacts.
- Blind-run harness that can create a reproducible test and output PR-ready validation reports.

Phase E — Infra and Release
- Generate infra-as-code templates (Terraform or Firebase JSON) for staging and production.
- Create deployable scripts and CI/CD flows including canary releases and health checks.
- Monitoring-as-code and alerting (Stackdriver/Cloud Monitoring configs) with SLOs.

Agentic constraints and safety
- The agent will never store or print secret values; secrets must be injected by the user into CI/Secret Manager.
- Remote operations that require credentialed access (Play Console, GitHub push, Firebase project owner operations) will produce scripts and `gh`/`gcloud` commands for the user to run.

Artifacts produced by agentic runs
- CI manifests (`.github/workflows/ci.yml`), provisioning scripts (`infra/provision-secrets.mjs`), evidence finalizer code and tests (`functions/src/infrastructure/finalizer`), outbox delivery worker (`functions/src/infrastructure/webhook`), Firestore rule and index definitions, synthetic dataset generator and evaluation scripts under `validation/`, and `docs/` updates.

Next immediate action (agentic)
- Generate the GitHub Actions CI workflow and `infra/provision-secrets.mjs`. These are safe to create and test locally. The CI workflow will be created in `.github/workflows/ci.yml` and will be configured to run `npm ci`, `npm --prefix functions ci`, `npm --prefix functions run build`, `npm --prefix functions run test:api` and the emulator job as an optional job.

