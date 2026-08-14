# ADR 0009: Neutral SISV observation boundary

- Status: Accepted
- Date: 2026-08-13

## Context

PackProof is neutral, evidence-based infrastructure for e-commerce. It preserves participant submissions, observable capture context, byte-integrity results, service-authenticated manifests, timeline events, and presentation artifacts. It does not advocate for a party or determine fraud, fault, liability, authenticity, custody, risk, or dispute outcomes.

Earlier physical-comparison ADRs used generic research terms such as `MATCH`, `NON_MATCH`, `matcher`, and `decision`. Even when scientifically qualified, those terms can be interpreted as identity, tamper, fraud, or adjudication conclusions. They also leave open the possibility that a future comparison output could directly control a transaction or external claim process.

## Decision

SISV is a bounded observation and measurement component of PackProof's evidence infrastructure. It is not an adjudication component.

After all applicable implementation and validation gates pass, PackProof may expose only these categorical observations:

- `CONSISTENT_WITH_REFERENCE`;
- `VARIANCE_OBSERVED`;
- `INCONCLUSIVE`; and
- `NOT_EVALUATED`.

Every observation is limited to the named evidence groups, capture profile, supported device/material population, quality policy, comparison artifact, observation policy, and recorded operating conditions.

PackProof SISV must never infer or imply:

- cause or timing of an observed variance;
- the actor responsible for an observation;
- opening, substitution, reproduction, or intentional alteration as a fact;
- identity or authenticity of an item, package, label, or person;
- uninterrupted custody;
- honesty, deception, fraud, abuse, fault, liability, or participant risk; or
- a recommended or automatic transaction, shipment, return, payment, refund, chargeback, account, marketplace, insurance, claim, or legal disposition.

SISV output has no workflow authority. It may not automatically advance, block, cancel, quarantine, score, or adjudicate any business process. Digital byte-integrity mismatches remain a separate technical control and may continue to fail closed because they compare actual uploaded bytes against an authenticated reservation, not participant conduct.

An auditable SISV observation must retain reference and verification evidence identities and hashes, per-region measurements, acquisition and eligibility results, comparison artifact and policy versions, supported-population statement, uncertainty, limitations, and provenance. A single consumer-facing identity probability, authenticity score, tamper likelihood, fraud score, participant risk score, or recommended action is prohibited.

## Consequences

- SISV can add measurable physical observations without making PackProof a party, investigator, insurer, marketplace adjudicator, or decision-maker.
- Authorized humans and external processes remain responsible for interpretation and action.
- Research may retain conventional statistical notation internally for reproducibility, but product APIs, UI, dossiers, callbacks, documentation, and marketing must use the neutral PackProof vocabulary.
- Existing schema reason codes may be retained for backward compatibility when their displayed interpretation remains bounded. New contracts must follow this ADR.
- ADR 0002 and ADR 0007 are superseded where they contemplated future PackProof `MATCH` or `NON_MATCH` product decisions. Their validation and claim-discipline requirements otherwise remain applicable.
