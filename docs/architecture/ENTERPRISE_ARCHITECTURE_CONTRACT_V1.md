# PackProof Enterprise architecture contract v1

Status: accepted as the architectural boundary for PackProof Enterprise™ on 2026-08-17. Executable domain, Edge protocol, a single-station Edge runtime, application-layer Evidence Format v2 finalization, an Enterprise console projection, and simulated WMS ingest are `SOURCE_CHECKED`. Live Cloud Storage finalization, a hosted production console, a deployed warehouse, multi-station operation, and ENFORCE-mode customer pilots are not claimed.

This contract extends [`ARCHITECTURE_CONTRACT.md`](ARCHITECTURE_CONTRACT.md) and [`ADR 0012`](../adr/0012-packproof-enterprise-acquisition-surface.md). It does not authorize a rewrite of the evidence core, camera stack, or mobile application.

## Product definition

PackProof Enterprise transforms the cameras, scanners, scales, and fulfillment systems already present in commercial logistics operations into transaction-bound, independently finalized evidence—without requiring workers to perform a separate evidence workflow.

```text
                         PACKPROOF
                Neutral Evidence Infrastructure

                            │
           ┌────────────────┼────────────────┐
           │                │                │
     Native Capture   Enterprise Edge   Future Systems
           │                │                │
           └────────────────┼────────────────┘
                            │
                  Evidence Finalization
                            │
                     Evidence Format v2
                            │
                    PackProof Connect
                            │
          Marketplace / Merchant / Claims
```

Conceptual flow:

```text
WMS / OMS / Marketplace
  → PackProof Enterprise API
  → Fulfillment Session
  → PackProof Edge
  → Existing Camera + Scanner + Scale
  → Encrypted/hashed evidence
  → PackProof server finalization
  → Evidence Format v2
  → PackProof Connect / Claims API
```

## 1. Freeze the evidence core

Do not start Enterprise work by modifying native camera code, the Android queue, or Evidence Format v2.

The existing Storage finalizer may be extended so Enterprise reservations use the same hash, quarantine, and manifest-binding rules. It must not let Edge finalize evidence, must not treat station media as native App Check context, and must not add station artifact types to the handheld upload callable.

Enterprise may produce evidence. It may not bypass the controls already protecting mobile evidence:

- the client is untrusted;
- a Storage upload, local encryption, or upload grant is not completion;
- original bytes, hashes, manifests, bundle binding, and assurance dimensions remain distinguishable;
- integrity mismatch is preserved and quarantined;
- `PACKPROOF_JCS_1` and `PACKPROOF_EVIDENCE_BUNDLE_V2` remain the canonicalization and bundle-binding profiles;
- shipment association continues to fail closed unless required artifacts are server-finalized without a recorded byte-integrity mismatch, subject to the versioned policy that governed that shipment.

## 2. Acquisition is not finalization

```text
acquisition source ≠ authority to finalize evidence
```

The warehouse, Edge agent, camera, scanner, scale, and WMS can all submit observations. PackProof's backend remains the component that determines whether stored bytes were properly received and finalized.

An Edge agent must never be given a capability named or behaving like `finalizeEvidence`.

## 3. Acquisition classes are not interchangeable

| Class | Meaning | Typical context |
|---|---|---|
| `NATIVE_MOBILE` | Handheld PackProof capture | Firebase App Check / device-bound flow |
| `ENTERPRISE_EDGE` | PackProof-managed station capture | Edge certificate, installation identity, station binding |
| `EXTERNAL_DECLARED` | Outside system supplied the bytes or event | PackProof did not control acquisition |

These classes must never silently receive equal assurance. Substitution is exact-class only. `EXTERNAL_DECLARED` cannot satisfy an `ENTERPRISE_EDGE` requirement. `ENTERPRISE_EDGE` cannot be reported as native App Check context. `NATIVE_MOBILE` cannot be reported as station-bound Edge acquisition.

The six assurance dimensions stay independent. Acquisition class is a separate field; it is not collapsed into a universal verdict.

## 4. Enterprise domain boundary

Warehouse concepts are not added to the canonical 17-resource commerce catalog as aliases of `transaction`. They form a parallel Enterprise catalog that references existing `organization` and `transaction` identities.

Required entities:

- `EnterpriseOrganization` — capability profile on an existing PackProof organization; not a second tenant
- `EnterpriseSite`
- `PackingStation`
- `EdgeAgent`
- `StationDevice`
- `DeviceCredential`
- `FulfillmentSession`
- `StationEvent`
- `EnterpriseArtifact`
- `HardwareObservation`
- `WorkflowPolicy`
- `EnterpriseEvidenceSession`

The important object is the `FulfillmentSession`. It is the enterprise equivalent of today's bounded mobile evidence session.

## 5. PackProof Edge is a separate application

The Expo SDK 57 / React Native application remains the handheld client. Enterprise hardware integration must not be added to it. A warehouse daemon may need to run continuously for months, start before a worker signs in, and survive independently of a browser.

v1 Edge runtime is TypeScript/Node 22, matching the current backend toolchain. A second implementation language is not authorized until profiling of a real station justifies it.

Target process model:

- Windows Service on Windows packing stations
- systemd service on Linux appliances

Current activation: the Edge library compiles with the Functions TypeScript package so one Node 22 gate owns `SOURCE_CHECKED` behavior. The OS-service entry is `apps/edge-agent`. Extraction into `apps/` + `packages/` workspaces is a later mechanical checkpoint and must not change protocol semantics.

## 6. Hardware adapters emit normalized events

Do not encode vendor models into fulfillment or transaction policy. Adapters implement:

- `CameraAdapter`
- `BarcodeScannerAdapter`
- `ScaleAdapter`
- `WmsAdapter`
- `PrinterEventAdapter`

A scanner emits `BARCODE_OBSERVED`. A scale emits `WEIGHT_STABLE`. A camera emits stream/capture/segment events. Adding a manufacturer later must not require changes to transaction logic.

v1 generic transports: USB HID/keyboard-wedge scanners, serial/COM scanners, USB/serial scales, UVC cameras, RTSP cameras. Vendor SDKs are added only when a named pilot requires one. Simulated adapters are valid `SOURCE_CHECKED` stand-ins; they are not live-hardware proof.

## 7. Rolling capture is a derived segment

Do not retain an all-day warehouse recording as transaction evidence. Edge maintains an encrypted rolling buffer. A fulfillment session preserves pre-roll from bind time, records through packing complete, and retains a short post-roll.

The resulting artifact must not be described as an untouched camera-original file. Manifest/capture provenance must record `captureSource`, `sourceStreamId`, `segmentStart`, `segmentEnd`, `preRollDuration`, `postRollDuration`, `codec`, `originalSegmentHashes`, and `assemblyMethod`. Prefer independently hashed chunks whose transaction segment is a deterministic sequence of those chunks.

## 8. Edge trust is purpose-separated

Mobile App Check does not authorize an Edge appliance. Edge trust is:

```text
Enterprise organization credential
  + Edge device certificate
  + Edge installation identity
  + station binding
  + hardware-device registration
  + session capability
```

Each installed agent has a unique asymmetric keypair. Prefer TPM or platform keystore when available. The private key never leaves the device and never appears in a public DTO. Each request is bound to organization, site, edge agent, station, session, request, timestamp, and nonce.

Do not reuse `API_CREDENTIAL_PEPPER`, `MANIFEST_SIGNING_SECRET`, `PARTICIPANT_HANDOFF_SIGNING_SECRET`, `PUBLIC_HANDOFF_SIGNING_SECRET`, `WEBHOOK_SIGNING_SECRET`, participant handoff secrets, or mobile App Check as Edge credentials.

Mutual TLS is a later hardening step, not a silent reinterpretation of HMAC or App Check.

## 9. Offline spool is conceptually the same, operationally distinct

Reuse the mobile invariant, not the Android PPQ1 implementation: ciphertext is retained until server finalization is observable. A successful upload is not enough.

Edge spool folders:

```text
/acquisition/pending
/acquisition/uploading
/acquisition/awaiting-finalization
/acquisition/finalized
/acquisition/attention
```

Each evidence object receives a retry-stable identity before its first network attempt. Acquisition assurance (`ONLINE_ASSURED` / `OFFLINE_CAPTURED`) stays separate from transport state. Warehouse fulfillment is not required to stop because PackProof is offline; policy records the limitation instead of upgrading it later.

## 10. Bounded Enterprise evidence sessions

Edge must not impersonate a seller on the participant API. Merchant identity and PackProof user identity remain different trust domains.

`EnterpriseEvidenceSession` is a parallel capability bound to:

```text
organizationId, siteId, stationId, edgeAgentId, transactionId,
allowedDevices, allowedArtifactTypes, maxArtifacts, captureWindow, policyId
```

The backend issues exact upload reservations. Open-ended permission to upload arbitrary evidence to arbitrary transactions is forbidden.

## 11. Files and observations stay distinct

Do not overload `PACKING_VIDEO` with station telemetry.

File artifacts include `STATION_PACKING_VIDEO` and `STATION_SEAL_REFERENCE`. Structured observations include item barcode, tracking barcode, and package weight. A scale reading is not a fake evidence file. Observations are provenance-bound and included in the session/manifest record.

## 12. Versioned workflow policy

Keep the current fail-closed principle. Generalize it into frozen policy versions:

- `ENTERPRISE_STANDARD_OUTBOUND_V1` requires packing video, seal reference, and tracking observation; item barcodes and final weight are optional.
- `ENTERPRISE_HIGH_VALUE_V1` requires item barcode, item reference photo, packing video, seal reference, tracking observation, and stable weight.

Every evidence record stores the policy version that governed it. A later policy must not retroactively reinterpret a historical shipment.

## 13. Operating modes

| Mode | Warehouse effect |
|---|---|
| `OBSERVE` | Capture only. PackProof does not block fulfillment. |
| `ASSIST` | Report whether requirements passed. Authorized operators may override. |
| `ENFORCE` | PackProof-integrated shipment/state transition waits until requirements are satisfied. |

Default and required first-pilot mode: `OBSERVE`. Do not begin a customer pilot in `ENFORCE`.

## 14. Neutrality

Enterprise must not emit conclusions such as “seller did not commit fraud,” authenticity, uninterrupted custody, or recommended claim disposition.

It may report observations such as:

- packing video server-finalized;
- seal reference server-finalized;
- expected SKU barcode observed;
- expected tracking identifier observed;
- final package weight 842 g;
- no recorded byte-integrity mismatch.

Physical correspondence remains `NOT_AVAILABLE` unless a later approved scientific gate supersedes that state.

Computer vision is not a v1 dependency and must not become an invisible source of truth.

## 15. Control plane and burst ingestion

The Enterprise console is a separate web application, not mobile screens. Administrators may view station and queue health and must not alter finalized evidence. Administrative actions are audited.

`/v1` remains the merchant control-plane interface. High-frequency Edge telemetry should later travel through an idempotent ingestion path (API → Pub/Sub → session processor → Firestore/Storage → existing finalizer). The current single-document rate-limit window and audit-chain head remain correct for today's traffic; partitioning is documented in [`FIRESTORE_PARTITIONING_V1.md`](FIRESTORE_PARTITIONING_V1.md) and is not activated by this contract.

Fencing tokens already prevent a stale worker from publishing a late result after losing ownership. Enterprise ingestion must keep that primitive.

## 16. Activation order

1. Architecture contract (this document)
2. Enterprise domain
3. Edge protocol
4. Single Edge agent
5. Scanner / camera / scale adapters
6. Fulfillment state machine
7. Encrypted Edge queue
8. Enterprise server session/capability
9. Evidence finalization integration
10. Enterprise console
11. WMS integration
12. `OBSERVE` pilot → `ASSIST` pilot → `ENFORCE`
13. Multi-station scale testing

The first proof is one Windows packing station, one overhead camera, one barcode scanner, one USB scale, one WMS (simulated or real), and one shipping transaction—including connectivity loss, queue preservation, independent server finalization, and a Connect review package. No PackProof mobile UI is required during that fulfillment flow.

Current slice: steps 1–11 for the in-process application layer, Edge spool, console projection, and simulated WMS ingest. The Storage trigger accepts Enterprise grants when those fields are present, but live GCS / emulator finalization is not yet checked. A hosted production console and live WMS are not claimed. Steps 12–13 remain not yet activated.

## 17. Test vocabulary

Use only the architecture-contract gates: `SOURCE_CHECKED`, `EMULATOR_CHECKED`, passed on device/live environment with exact identity, failed with concrete evidence, or not yet tested. Simulated adapters are not live-hardware proof. A successful Edge upload is not server finalization.
