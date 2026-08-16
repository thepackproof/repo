# Firestore partitioning v1

Status: designed before enterprise burst volume; not activated in the current runtime. Today's merchant and Connect traffic can keep a single rate-limit window document and a single audit-chain head per organization.

This is a scale plan, not a claim that production is under load or that the current API expansion has been live-accepted.

## Why partition later, not now

`FirestoreRateLimiter` writes one document per principal, policy, and fixed window. `FirestoreAuditWriter` advances one `apiAuditStreams/{organizationId}` head per append so each event can hash a canonical payload plus the previous event hash. Both are correct integrity and fairness primitives. Under a future high-volume integration they become serialization points: Firestore transactions on one document queue, and tail latency rises.

Do not wait until those hotspots appear in a live merchant burst to choose a split. Activate the plan below when an organization or principal approaches write contention, not by weakening hashing or dropping linkage.

## Rate-limit windows

Keep the existing identity:

```
sha256(principalId + policy + windowStart)
```

When a single window document contends, add a deterministic shard suffix:

```
sha256(principalId + policy + windowStart + shard)
```

`shard = hash(requestId or credentialId) mod N`, with `N` starting at 8 and only increased for that principal/policy. `consume()` increments one shard. Admission is the sum of shard counts versus `policy.limit`. Reads of sibling shards stay inside the same transaction or use a cached partial sum with a conservative reject (fail closed when the visible sum is already at the limit).

Do not put all organizations on a large `N` on day one. Default `N = 1` preserves the current document. Raise `N` per principal when `apiRateLimits` transaction retries or lock time exceed an operator threshold.

Window expiry and cleanup stay on `expiresAt`. Shards share the same expiry.

## Audit-chain heads

The chain is the product: sequence, previous hash, canonical payload, SHA-256 event hash. Partitioning must not create an unsigned gap or a rewritable head.

Time-partition the head, do not shard a single sequence across unlinked documents:

```
apiAuditStreams/{organizationId}/partitions/{yyyy-mm-dd}
apiAuditStreams/{organizationId}/partitions/{yyyy-mm-dd}/events/{eventId}
```

Each daily partition has its own `sequence` starting at 1 and a `headHash`. The first event of a new day sets `previousHash` to the prior day's closing `headHash`, or `GENESIS` for the organization's first event. Verification walks the day, then follows `previousHash` into the previous partition.

Do not use random shards for the audit head. Random shards would require a merge protocol and would weaken the "one successor" property.

Idempotent append by `eventId` stays unchanged: if the event document exists, return. The partition key is derived from the server `occurredAt` date in UTC so retries land on the same partition.

## Activation gates

1. Keep `N = 1` and a single live head until an organization or principal shows sustained transaction contention on these documents.
2. Ship the partition reader/verifier before writing a second shard or a second daily head.
3. Re-run audit-chain verification and rate-limit fairness tests against multi-document fixtures before enabling either split in a live project.
4. Do not treat partitioning as proof of physical correspondence, fraud decisions, or a live deploy.

## Out of scope

This document does not change evidence storage, Connect grant consumption, or merchant credential verification. Those paths have their own fail-closed rules.
