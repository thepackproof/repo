# ADR 0016: One fact, one state, one eligibility, one Proof

- Status: Accepted
- Date: 2026-08-22

## Context

PackProof already has a shared Next Action engine, a Passport/Proof aggregator, commerce trust classes, and an architecture contract that requires one application core. Surfaces still assemble those pieces independently.

On baseline `db69eef`:

- Mobile Home and Portal Home can omit protocol state and the resolver defaults to empty protocol.
- Proof eligibility is invoked from merchant, portal, and callable paths with different commerce hydration.
- `View Proof` can follow transaction status rather than Proof eligibility.
- An `externalOrderId` can short-circuit trust checks.
- Intake can stamp imported-artifact provenance onto participant-confirmed overlays.

Those are the same category of bug repeating at different seams.

## Decision

PackProof adopts four exclusive models:

1. **One fact model** — commerce, evidence, shipment, delivery, returns, and timeline facts are loaded and interpreted in the application/domain core.
2. **One state model** — a `TransactionWorkspaceProjection` is the only workflow object presentation layers consume.
3. **One eligibility model** — only a `ProofApplicationService` may evaluate Proof eligibility, bind or resolve Proof identity, and aggregate a Proof.
4. **One Proof** — the Passport projection remains the Proof ([ADR 0015](0015-proof-is-the-passport.md)). JSON and PDF are presentations of that object.

Proof availability is not a function of `PACKED` / `SHIPPED` / `COMPLETED`. A value never determines its own trust; its provenance does.

Presentation layers may not call `resolveNextRequiredAction` with a partial input. Transports may not call `evaluatePassportEligibility`, `assertPassportEligible`, `aggregatePassport`, or `boundOrIssuedIdentity` except through the Proof application service.

The execution sequence and freeze are recorded in [`../architecture/HARDENING_AND_RELEASE_ARCHITECTURE_PLAN.md`](../architecture/HARDENING_AND_RELEASE_ARCHITECTURE_PLAN.md). This ADR is the decision. That file is the order of work.

## Consequences

- New product surfaces, evidence semantics, Proof meanings, Enterprise modes, and AI/CV features are frozen until the plan’s release-gate statements are true.
- Incremental strangler migration remains required ([ADR 0001](0001-incremental-layered-architecture.md)). A rewrite of the evidence core is not authorized.
- Existing ADRs on commerce provenance, neutrality, HMAC vs signatures, and Enterprise acquisition stay in force.
- UX copy and one-CTA rules remain valid, but they consume the workspace projection instead of reconstructing it.
