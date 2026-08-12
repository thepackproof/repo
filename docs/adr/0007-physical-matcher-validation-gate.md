# ADR 0007: Physical matcher validation gate

- Status: Accepted
- Date: 2026-08-11

## Context

PackProof has a structured 15-frame physical acquisition protocol and measurement signals, but no independently validated production matcher or thresholds. Acquisition completeness is not physical correspondence.

## Decision

Keep the matcher behind a production-disabled capability interface. Until a frozen extractor/model, eligibility policy, calibration, two-threshold decision policy and independent blind validation pass:

- physical correspondence is `NOT_AVAILABLE` or the acquisition attempt is `NOT_EVALUATED`/`FTA` as applicable;
- completed reference and verification sets may return `INCONCLUSIVE` with no score;
- no API, report, webhook, UI or marketing path may emit `MATCH` or `NON_MATCH`.

Validation must separately report FMR, FNMR, FTA, inconclusive rate, attack outcomes, package-level independence, subgroup results and confidence bounds.

## Consequences

Research acquisition can progress without contaminating production claims. Enabling a matcher requires a new release decision, versioned artifacts/thresholds, claim-regression updates and independent acceptance evidence.
