# HC-1 internal SLOs

Status: measurement list only. No numeric error budget is accepted on this SHA.

Track, do not advertise:

| Signal | First measurement |
|---|---|
| API availability | Function success / total |
| Proof retrieval availability | `proof.getCurrent` OK / total |
| Evidence finalization success | FINALIZED / (FINALIZED + QUARANTINED + failed) |
| Portal availability | `/v1/portal` 2xx rate |
| Finalization latency | p50 / p95 of Storage trigger to evidence record |
| Webhook delivery latency | existing Connect callback metrics |

Choose thresholds only after those series exist. See [`HC1_OPERATIONS_AND_GOVERNANCE.md`](HC1_OPERATIONS_AND_GOVERNANCE.md).
