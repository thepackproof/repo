# ADR 0002 — Physical-Feature Matcher and Claim Discipline

Status: Confirmed (agentic). Decision date: 2026-08-11

Context
- The whitepaper proposes a probabilistic physical-feature matcher for package-surface comparison but the repository does not include a validated matcher or a PackProof-specific blind validation corpus.
- Scientific validation is required before product claims about physical correspondence can be made.

Decision
- Physical correspondence remains `NOT_AVAILABLE` in production until an independent, phase-gated validation program completes with a frozen matcher, pre-registered metrics, and a blind test set.
- The API and UI will expose a conservative result model with values: `MATCH`, `NON_MATCH`, `INCONCLUSIVE`, `FAILURE_TO_ACQUIRE` and will always include `modelVersion`, `captureProfileId`, and `confidenceBounds`.

Consequences
- Pros:
  - Avoids overstating capabilities and prevents legal/operational risk.
  - Provides clear gating for R&D and independent validation.
- Cons:
  - Some marketing claims must be delayed until validation is complete.

Implementation notes (agentic tasks)
- Create an R&D pipeline to generate synthetic datasets, ingest real-world samples, and compute metrics (FMR/FNMR/FTA).
- Implement model-versioned API fields and a manifest extension to record matcher inputs and outputs.
- Require a documented `validation/` directory with pre-registration artifacts before enabling `MATCH` in any operator-facing automation.

