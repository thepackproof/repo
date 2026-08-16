# ADR 0011: Idempotency fencing for external side effects

- Status: Accepted
- Date: 2026-08-16

## Context

Merchant writes already use stable operation identities, request fingerprints, processing leases, owner tokens, and fence tokens. Completing an idempotency record is rejected when the caller no longer owns the lease. External non-transactional work (report generation, signed download URLs, audit publication, and similar network or storage effects) can still run after a stale lease has been reclaimed unless those effects check the fence immediately beforehand.

## Decision

Every idempotent merchant operation receives an `IdempotencyFence` bound to the current `operationId`, `ownerToken`, and `fenceToken`.

- Deterministic resource identifiers continue to derive from the operation identity.
- Any external non-Firestore side effect must run through `fence.runSideEffect` or `fence.assertOwned` immediately before the effect.
- A stale owner that lost the lease cannot publish API completion and cannot start a new externally visible effect.
- Recipient-side idempotency (stable report IDs, audit event IDs, Connect delivery IDs) remains required because delivery is still at least once.

## Consequences

Tests must reclaim an expired lease while the original worker is still running and prove the original worker cannot perform a later side effect. Connect callbacks keep their existing deterministic delivery IDs, HMAC, SSRF, and retry-lease behavior; retry discovery is a separate due-time query change.
