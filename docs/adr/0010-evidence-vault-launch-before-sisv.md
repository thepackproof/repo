# ADR 0010: Launch the evidence vault before SISV

Status: Accepted

Date: 2026-08-13

Supersedes: Any release-plan language that makes a production SISV comparison algorithm a prerequisite for the initial two-device release candidate. This decision does not supersede ADR 0009's permanent neutral-observation boundary.

## Context

PackProof can deliver a structured two-party evidence workflow without making an automated physical-correspondence measurement. The release-critical product is the shared transaction record: confirmed terms, guided seller packing, a visible `PP` mark spanning the label/package boundary, tape or seal observations, a high-resolution seller reference, buyer arrival and unboxing observations, resilient preservation, server-side byte integrity, a timeline, and a source-linked dossier.

A production SISV implementation would require a frozen acquisition and comparison protocol, representative datasets, device and substrate scope, attack studies, independent validation, and continuing drift controls. Making that research program a launch prerequisite would delay testable workflow value without changing PackProof's obligation to remain neutral.

Operational customer evidence also cannot be treated as a research dataset by default. Later SISV research requires separate affirmative consent and data governance.

## Decision

The initial release candidate will implement and validate the evidence vault and human-reviewable two-device protocol. It will not require an SISV algorithm, automated physical comparison, physical match/non-match result, fraud or tamper classification, participant risk score, or workflow disposition.

The release may preserve seller reference and buyer arrival observations and present them side by side. Human reviewers may describe visible continuity, variance, or inability to assess. PackProof does not infer cause, actor, intent, authenticity, custody, fraud, fault, liability, or case outcome from those observations.

Automated physical comparison remains hidden and `NOT_AVAILABLE` in the launch product. Any later SISV capability must satisfy ADR 0009, the claims register, the physical-correspondence validation plan, and separate release approval.

Production evidence may enter an SISV research corpus only under separate, affirmative, purpose-specific opt-in consent and the approved privacy, minimization, redaction, retention, withdrawal, deletion, lineage, separation, and access-control policies.

## Consequences

- The weekend release-candidate critical path is reduced to the exact evidence-vault and two-device workflow.
- The visible boundary protocol remains useful as a repeatable capture and human-review aid without an algorithmic conclusion.
- GTM language emphasizes record quality, retrieval, transparency, and integration rather than fear, accusation, efficacy percentages, or guaranteed dispute outcomes.
- Carrier telemetry remains a future sourced-context integration, not a current fraud-detection backstop.
- SISV becomes a consent-governed research and validation program rather than a day-one product dependency.
