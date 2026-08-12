# ADR 0005: Generated artifacts and release provenance

- Status: Accepted
- Date: 2026-08-11

## Context

The repository currently tracks compiled `functions/lib` output, while Firebase predeploy and tests already build from `functions/src`. The workspace also contains APKs and historical archives outside the editable repository. Git HEAD does not yet represent the current 0.3.0 source.

## Decision

- `functions/src` is the backend source of truth.
- The target is to generate `functions/lib` in deterministic CI/predeploy and remove it from tracking only after a clean-checkout rehearsal.
- Build outputs remain outside source control unless a narrowly documented distribution requirement says otherwise.
- Line-ending normalization occurs in a dedicated mechanical checkpoint.
- A source checkpoint is not a release.
- Release evidence records source commit, clean/dirty status, lockfile digests, configuration/Firebase identity, signing identity, binary digest and acceptance results for that exact binary.

## Consequences

The current generated files are not deleted in Section 1. The consolidation and tracking-policy changes are separate checkpoints. Existing APKs remain test candidates until their provenance and acceptance gates are established.
