# ADR 0003: One core with multiple transports

- Status: Accepted
- Date: 2026-08-11

## Context

Consumer callable functions, PackProof Connect and `/v1` currently expose overlapping transaction and evidence concepts. Expanding each independently would produce incompatible authorization, idempotency, state and audit behavior.

## Decision

All transports invoke the same application services and domain policies.

- `/v1` is the canonical external resource contract.
- Firebase callable functions remain the authenticated first-party mobile transport.
- Connect becomes a compatibility facade over canonical commerce-context, transaction, claim, evidence-session and webhook services.
- Platform plugins and SDKs call `/v1` or a documented hosted handoff; they never write persistence directly.
- DTO mapping and runtime validation occur at every transport boundary.

## Consequences

Transport-specific authentication and response compatibility remain valid, but business rules cannot live only in an Express route or callable handler. The existing REST boundary controls are retained while its current transaction service converges with the consumer domain model.
