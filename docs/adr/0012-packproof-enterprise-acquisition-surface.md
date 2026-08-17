# ADR 0012: PackProof Enterprise as an acquisition surface

- Status: Accepted
- Date: 2026-08-17

## Context

PackProof already has an organization-isolated Merchant API, Connect sessions, bounded evidence sessions, retry-stable idempotency, fencing tokens, audit chaining, server-side evidence finalization, Evidence Format v2, offline preservation, and fail-closed shipment rules. Native mobile capture remains the current handheld acquisition path.

Commercial logistics operations already have cameras, scanners, scales, and WMS/OMS events. Requiring warehouse workers to perform a separate mobile evidence workflow would limit adoption. Rewriting the evidence core, or treating Enterprise as a larger copy of the Expo application, would put that core at risk and create a second evidence system.

Mobile App Check and Android Keystore do not map onto a Windows or Linux packing-station daemon. Warehouse hardware also must not be coded into transaction logic.

## Decision

PackProof Enterprise is another trusted evidence-acquisition channel that feeds the same PackProof evidence model. It is not a second evidence system, not a rewrite, and not a warehouse mode of the React Native application.

Invariant:

```text
acquisition source ≠ authority to finalize evidence
```

The warehouse, Edge agent, camera, scanner, scale, and WMS may submit observations. PackProof's backend remains the component that determines whether stored bytes were properly received and finalized.

Three acquisition classes are first-class and never silently equivalent:

- `NATIVE_MOBILE` — today's App Check / device-bound handheld flow
- `ENTERPRISE_EDGE` — PackProof-managed station acquisition
- `EXTERNAL_DECLARED` — evidence supplied by an outside system without PackProof controlling acquisition

PackProof Edge is a separate Node 22 operating-system service with hardware adapters that emit normalized events. Fulfillment sessions are the enterprise equivalent of bounded mobile evidence sessions. Structured observations are distinct from evidence files. Workflow policy is versioned and never applied retroactively. Operating modes are `OBSERVE`, `ASSIST`, and `ENFORCE`; pilots start in `OBSERVE`. Computer vision is not a v1 dependency. Enterprise statements remain observations, not fraud, authenticity, custody, or disposition verdicts.

Existing secrets stay purpose-separated. Edge credentials must not reuse `API_CREDENTIAL_PEPPER`, `MANIFEST_SIGNING_SECRET`, `PARTICIPANT_HANDOFF_SIGNING_SECRET`, `PUBLIC_HANDOFF_SIGNING_SECRET`, `WEBHOOK_SIGNING_SECRET`, or mobile App Check.

## Consequences

- Native capture, Connect, Evidence Format v2, and the transaction/dossier model remain the evidence core.
- New warehouse concepts live in a dedicated Enterprise domain, not inside `transactions`.
- Camera, scanner, and scale vendors can be added behind adapters without changing fulfillment or finalization policy.
- Assurance dimensions stay independent. An Enterprise packing video does not inherit native App Check context, and an external file drop does not inherit Edge station binding.
- HTTP ingestion, a hosted production console, live WMS enforcement, and multi-station scale-out remain later activation slices. A SOURCE_CHECKED console projection and simulated WMS ingest are in the working tree; this ADR does not claim a live warehouse deployment.
