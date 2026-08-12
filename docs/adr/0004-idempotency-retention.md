# ADR 0004 — Idempotency Records and Retention

Status: Confirmed (agentic). Decision date: 2026-08-11

Context
- `POST /v1/transactions` and other operations require idempotency. The repository contains an `IdempotencyStore` implementation that is kept alongside transaction records.

Decision
- Keep idempotency records versioned and retained at least as long as the primary resource lifetime and audit retention policy. Default policy: retain idempotency and audit records for the same retention window as transactions (configurable).
- Idempotency key hashing: store only a hash (SHA-256) of the provided `Idempotency-Key` along with the operation fingerprint. Do not store raw idempotency keys in cleartext.

Consequences
- Pros:
  - Prevents replays from creating duplicate business resources.
  - Limits sensitive data stored in Firestore.
- Cons:
  - Requires periodic cleanup jobs if retention periods are shortened.

Implementation notes (agentic tasks)
- Ensure `FirestoreIdempotencyStore` uses `sha256(Idempotency-Key)` as the persisted key and includes `operationFingerprint` in the lookup.
- Provide a cleanup script that can be run by the agent to garbage collect idempotency records older than retention window according to policy and legal hold exceptions.

