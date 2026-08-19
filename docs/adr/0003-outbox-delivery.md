# ADR 0003 — Outbox/Webhook Delivery Model

Status: Confirmed (agentic). Decision date: 2026-08-11

Product-name note: PackProof Connect is now the user-facing product **PackProof API**. Technical identifiers still use Connect. The decision below is unchanged.

Context
- The application uses an outbox pattern for domain events. Webhook delivery must be reliable, idempotent, and auditable for merchant integrations and PackProof Connect callbacks.

Decision
- Implement an idempotent outbox delivery service with the following properties:
  - Each delivery attempt stores a delivery record (`webhookDeliveries/{id}`) containing: target URL, payload digest, retry count, nextAttemptAt, lastError, and deliveredAt.
  - Deliveries are HMAC-signed per-attempt using a rotating webhook secret stored in Secret Manager.
  - Retry policy: exponential backoff with jitter, move to a `poison` collection after N attempts (configurable, default 5).
  - All attempts append audit events to `domainOutbox` and create a separate `deliveryLogs/{deliveryId}/attempts/{id}` subcollection.

Consequences
- Pros:
  - Transparent delivery history and idempotency guarantees for receivers.
  - Easier debugging and replayability.
- Cons:
  - More Firestore writes; cost/throughput considerations must be monitored.

Implementation notes (agentic tasks)
- Implement `infrastructure/webhook/delivery-worker` in functions to poll `webhookDeliveries` and perform deliveries.
- Add automated tests that run against the Firestore emulator to assert retry semantics and HMAC header correctness.
- Create an admin callable to requeue poison deliveries after manual inspection.

