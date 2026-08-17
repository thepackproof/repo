# PackProof architecture governance

> Current execution authority: follow [`../../agent.md`](../../agent.md) for launch sequencing, readiness status, demonstration gates, Play acceptance, and production rollout. This directory provides architecture and historical evidence; it does not override the current execution plan.

This directory records the controlled migration of the current PackProof 0.9.5.0 working tree into a unified, API-first commerce evidence platform.

## Section 1 artifacts

- [Architecture contract](ARCHITECTURE_CONTRACT.md) - mandatory dependency, security, evidence, API, provenance and claim boundaries.
- [Baseline evidence](BASELINE_2026-08-11.md) - exact local source/emulator results and known open risks for the uncommitted 0.3.0 working tree.
- [Migration map](MIGRATION_MAP.md) - current modules, current coupling and their target architectural destinations.
- [Checkpoint plan](CHECKPOINT_PLAN.md) - historical disposition of the now-resolved uncommitted-baseline problem.
- [Architecture decisions](../adr/README.md) - accepted decisions that later sections must preserve.

## Section 2 artifacts

- [Canonical domain model v1](DOMAIN_MODEL_V1.md) - 17 versioned resource contracts, identifiers, DTO boundaries, state machines, trust rules, compatibility mappings and current activation limits.
- [Section 2 completion report](SECTION_2_COMPLETION_2026-08-11.md) - delivered scope, executed gates and activation limits.
- Executable source: `functions/src/domain/v1`.
- Contract gate: `npm run test:domain`.

## Section 3 artifacts

- [Shared application services v1](APPLICATION_SERVICES_V1.md) - active REST/callable/Connect service boundaries, ports, atomic outbox writes, compatibility guarantees and remaining legacy paths.
- [Section 3 completion report](SECTION_3_COMPLETION_2026-08-11.md) - delivered migration slice, verification evidence and operational limits.
- Executable source: `functions/src/application/v1` and `functions/src/infrastructure`.
- Gates: `npm run test:application` and `npm run test:application:firestore`.

## Section 4 artifacts

- [Public commerce handoff and PackProof Button v1](PUBLIC_COMMERCE_HANDOFF_V1.md) - publishable browser protocol, page-declared trust boundary, origin and replay controls, atomic persistence, app review handoff, SDK integration, threat model and deployment gates.
- [Section 4 completion report](SECTION_4_COMPLETION_2026-08-11.md) - delivered surface, validation evidence and remaining live-proof limits.
- [Participant claims and evidence sessions v1](PARTICIPANT_CLAIM_AND_EVIDENCE_SESSION_V1.md) - explicit identity binding, actor- and purpose-bounded capture authorization, token/replay model, native capture reuse, threat decisions and proof limits.
- [Section 5 completion report](SECTION_5_COMPLETION_2026-08-11.md) - delivered participant/capture-session surface, emulator evidence, discovered projection fix and remaining live-proof limits.
- Executable source: `functions/src/application/v1/public-commerce-handoff-service.ts`, `functions/src/infrastructure/firebase/v1/public-commerce-handoff-repository.ts`, `functions/src/api/v1`, `sdk/javascript/browser.js`, and `src/app/handoff/review.tsx`.
- Gates: `npm run test:application`, `npm run test:application:firestore`, `npm run test:api`, `npm run test:api:firestore`, `npm run test:sdk`, and `npm run test:rules`.

## Scale and integrity

- [Firestore partitioning v1](FIRESTORE_PARTITIONING_V1.md) - reserved shard and time-partition strategy for API rate-limit windows and organization audit-chain heads before enterprise burst volume. Hash-chain integrity is preserved.

## Camera acquisition checkpoint

- [Camera acquisition milestones 1 and 2 completion](CAMERA_ACQUISITION_MILESTONE_1_2_COMPLETION_2026-08-13.md) - native-preview readiness, bounded capture controls, raw and normalized barcode provenance, claim-disciplined framing guidance, interruption and temporary-file cleanup, source gates, Android bundleability evidence, and the remaining signed-device boundary.

## Authority and scope

The canonical editable source is `C:\src\PackProof\repo`. The workspace `build/`, `releases/`, `documentation/` and `archives/` directories are not alternate source trees.

These documents describe architectural intent and source/emulator evidence. They do not establish that a Firebase environment is deployed correctly, that an APK corresponds to the current dirty tree, that an exact binary passed on a device, or that a third-party integration is accepted.

## Change rule

An implementation may refine an accepted decision, but it must not silently contradict it. A material reversal requires a superseding ADR, migration impact analysis, compatibility plan and tests.
