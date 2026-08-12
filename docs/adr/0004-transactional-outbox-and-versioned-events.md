# ADR 0004: Transactional outbox and versioned events

- Status: Accepted
- Date: 2026-08-11

## Context

Notifications, report generation, webhook callbacks and commerce synchronization are fallible side effects. Performing them inline can make committed state appear failed or lose an external update after a process crash. Cloud triggers and HTTP retries are at least once.

## Decision

Commit a versioned domain event/outbox record atomically with each externally relevant state transition. Dispatch and consumption are at least once and idempotent.

Every event includes a stable event ID, schema version, type, tenant, actor where applicable, resource, request/correlation ID and server time. Delivery attempts have leases, retry policy, terminal/dead-letter state and inspectable history. Secret material, raw media and unnecessary personal data are excluded.

## Consequences

Consumers must deduplicate by event ID. Exactly-once external effects are not claimed. Firestore transactions impose document/contention constraints that must be tested. Existing Connect callbacks migrate without changing their documented HMAC and retry-stable delivery identity until a versioned contract supersedes them.
