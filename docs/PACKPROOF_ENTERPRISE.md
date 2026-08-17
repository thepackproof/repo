# PackProof Enterprise™

PackProof Enterprise is an additional acquisition and orchestration layer around the existing evidence core. It is not a rewrite, not a larger mobile app, and not a second evidence system.

**Definition:** PackProof Enterprise transforms the cameras, scanners, scales, and fulfillment systems already present in commercial logistics operations into transaction-bound, independently finalized evidence—without requiring workers to perform a separate evidence workflow.

Native capture, PackProof Connect, Evidence Format v2, and the transaction/dossier model stay. What Enterprise adds is a station Edge that can turn ordinary fulfillment events into bounded evidence sessions.

Authoritative architecture: [`docs/architecture/ENTERPRISE_ARCHITECTURE_CONTRACT_V1.md`](architecture/ENTERPRISE_ARCHITECTURE_CONTRACT_V1.md). Decision record: [`docs/adr/0012-packproof-enterprise-acquisition-surface.md`](adr/0012-packproof-enterprise-acquisition-surface.md).

## Current activation

| Area | Status |
|---|---|
| Architecture contract and ADR | Accepted |
| Enterprise domain and Edge protocol | `SOURCE_CHECKED` |
| Single-station Edge runtime with simulated adapters and encrypted spool | `SOURCE_CHECKED` |
| Bounded Enterprise evidence sessions (in-process application service) | `SOURCE_CHECKED` |
| HTTP Enterprise API, Pub/Sub ingestion, console, live WMS, real hardware | Not yet activated |
| Customer `OBSERVE` / `ASSIST` / `ENFORCE` pilots | Not yet tested |

Simulated scanners, cameras, and scales are not live-hardware proof. An Edge upload is not server finalization.

## What Enterprise will not say

PackProof remains neutral documentation infrastructure. Richer warehouse telemetry does not become a fraud, authenticity, custody, or claim-disposition verdict.
