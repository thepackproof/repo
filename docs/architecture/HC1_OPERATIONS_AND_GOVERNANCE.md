# HC-1 operations and governance

Status: `SOURCE_CHECKED` scaffolding on 2026-08-22. Not a live-ops, device, or warehouse claim.

Named notes: [`INTERNAL_SLOS_HC1.md`](INTERNAL_SLOS_HC1.md), [`DATA_GOVERNANCE_HC1.md`](DATA_GOVERNANCE_HC1.md), [`KEY_REGISTRY_V1.md`](KEY_REGISTRY_V1.md), [`DISASTER_RECOVERY_HC1.md`](DISASTER_RECOVERY_HC1.md). Progress: [`HARDENING_PROGRESS_2026-08-22.md`](HARDENING_PROGRESS_2026-08-22.md).

## Internal SLOs

Thresholds stay unset until live HC-1 telemetry exists. Source helpers: `functions/src/application/v1/telemetry.ts` and `operation-log.ts`. Track, do not advertise:

| Signal | First measurement |
|---|---|
| API availability | Function success / total |
| Proof retrieval availability | `proof.getCurrent` OK / total |
| Evidence finalization success | FINALIZED / (FINALIZED + QUARANTINED + failed) |
| Portal availability | `/v1/portal` 2xx rate |
| Finalization latency | p50 / p95 of Storage trigger to evidence record |
| Webhook delivery latency | existing Connect callback metrics |

## Feature flags

Backend: `functions/src/application/v1/feature-flags.ts` (`PACKPROOF_FLAG_*`).
Mobile: `src/constants/features.ts`.

Flags are not evidence facts. Historical evidence keeps the policy/version used at capture.

## Privacy and retention

Imported receipts may contain name, address, email, and payment metadata. HC-1 intake stores the correspondence digest, parser version, and populated item fields. Do not expand raw-artifact retention without a written evidentiary purpose.

Account export/delete remains the consumer path. Legal hold is not implemented.

## Key registry

| keyId | purpose | algorithm | verification policy |
|---|---|---|---|
| `packproof-manifest-v1` | Evidence manifest MAC | HMAC-SHA256 | `PACKPROOF_SERVICE_ONLY` |
| Connect callback HMAC | Partner callbacks | HMAC-SHA256 | service verification |
| Merchant API credential pepper | API secret verify | HMAC | server-only |

HMAC records must not be reinterpreted as public digital signatures.

## Disaster recovery

Documented, not drilled on this SHA:

1. Freeze deploys.
2. Restore the last accepted Functions revision and rules SHA from `release-manifest.hc1.json`.
3. Replay pending evidence finalization; do not mark incomplete objects FINALIZED.
4. Rotate compromised keys by adding a new keyId; keep historical verification policy.

Live Firestore/Storage/region drills remain owner-operated.

## Definition of Done

Follow [`HARDENING_AND_RELEASE_ARCHITECTURE_PLAN.md`](HARDENING_AND_RELEASE_ARCHITECTURE_PLAN.md) §17 for domain-behavior changes.
