# PackProof 0.9.5.0 architecture

## Canonical-domain and application-service migration status

The pure canonical v1 domain contracts are implemented under `functions/src/domain/v1` and documented in [`docs/architecture/DOMAIN_MODEL_V1.md`](architecture/DOMAIN_MODEL_V1.md). Shared services and ports are implemented under `functions/src/application/v1` and documented in [`docs/architecture/APPLICATION_SERVICES_V1.md`](architecture/APPLICATION_SERVICES_V1.md). The browser-safe, page-declared commerce-context and editable passport-draft handoff is documented in [`docs/architecture/PUBLIC_COMMERCE_HANDOFF_V1.md`](architecture/PUBLIC_COMMERCE_HANDOFF_V1.md).

The REST transaction create/get/list paths, consumer draft save callable, Connect order-ingestion path, Connect redemption callable, public Button handoff, and Button redemption callable now invoke the shared application layer and legacy-compatible Firebase adapters. Their source gates pass; the final Section 4 completion record names the emulator evidence separately. Remaining transaction transitions, evidence, shipping, returns, reports, notifications, account operations and mobile reads have not yet migrated, so the architecture below continues to describe those active legacy paths. No Section 3 or Section 4 deployment, storefront, or device test has been performed.

PackProof Enterprise™ is a parallel acquisition surface around this core. See [`docs/architecture/ENTERPRISE_ARCHITECTURE_CONTRACT_V1.md`](architecture/ENTERPRISE_ARCHITECTURE_CONTRACT_V1.md). It is `SOURCE_CHECKED` for domain, Edge protocol, a simulated single-station runtime, and application-layer Evidence Format v2 finalization. It is not a live warehouse deployment.

## Product boundary

PackProof creates a participant-restricted transaction record for high-value sales and authorized returns. It stores participant-entered terms, original media as received, server-computed fingerprints, capture-context telemetry, label observations, and workflow events.

The architecture does not authenticate an item or person; determine scene truth, ownership, custody, fraud, or legal relevance; provide escrow, shipping, insurance, or payment services; or guarantee third-party acceptance. There is no production physical matcher in this release. Physical correspondence is always `NOT_AVAILABLE`.

## Components

| Layer | Technology | Responsibility |
|---|---|---|
| Android client | Expo SDK 57, React Native, Expo Router | Guided terms, transaction, return, native capture, queue, and participant views |
| Native evidence security | Local Expo Android module, Android Keystore | Streaming SHA-256, PPQ1 AES-256-GCM encryption/decryption, private-file controls, device-key challenge signing |
| Identity and app context | Firebase Authentication, App Check / Play Integrity | Account identity and provider-backed app/request context; not physical-scene truth |
| API | Firebase callable/HTTP Cloud Functions, Node 22 | Input validation, authorization, state transitions, upload reservations, Connect ingestion and callback delivery |
| Records | Cloud Firestore | Private transaction, evidence, assurance, return, packet, and timeline metadata |
| Objects | Cloud Storage | Create-only native evidence, canonical private manifests, presentation dossiers, and account exports; authenticated reads plus short-lived app links |
| Public web | Firebase Hosting | Policies, deletion flow, invitation fallback, Connect app-opening fallback |
| Optional billing | Google Play Billing / RevenueCat | Feature-gated subscription UI and server entitlement reducer |

## Digital evidence path

```text
Native camera output or selected supporting PDF
  -> app-private staging file
  -> streaming plaintext SHA-256 + PPQ1 v2 Android Keystore AES-256-GCM
  -> encrypted media and encrypted metadata queue record
  -> retry-stable clientEvidenceId and immutable request fingerprint
  -> six-hour participant/type/path-bound upload reservation
  -> private create-only Cloud Storage object
  -> Storage finalizer independently streams SHA-256 and reads magic bytes
  -> client/server hash, length, and declared/detected media-type comparison
  -> JCS manifest schema 2 + manifest SHA-256 + domain-separated bundle SHA-256
  -> HMAC-SHA256 service MAC with explicit key ID and service-only verification scope
  -> Firestore evidence record + deterministic timeline event in one transaction
  -> encrypted local copy deleted only after that Firestore record is observable
```

The client is untrusted and cannot directly write Firestore workflow records. A retry can extend a reservation expiry, but cannot rewrite the first grant's request, capture, attestation, or ingress context. The upload identifier is deterministic for the transaction, uploader, and client evidence identity. If the same identity is presented with a different request fingerprint, the server rejects it.

During finalization, the backend removes any client-upload Firebase download-token metadata. The app opens evidence, dossiers, and exports through an App-Check-protected callable that rechecks participant/owner authorization and returns a five-minute signed URL. Direct authenticated Storage reads remain governed by participant rules.

Cloud Storage finalization is at-least-once. Manifest inputs are deterministic and do not contain the trigger delivery ID, so duplicate finalizer deliveries produce the same canonical bytes, digests, and MAC. Firestore creation and workflow transitions are transactional and idempotent.

## Queue state machine

```text
ENCRYPTING -> QUEUED -> DECRYPTING_FOR_UPLOAD -> GRANT_REQUESTED
           -> UPLOADING -> AWAITING_FINALIZATION -> FINALIZED

Any retryable failure -> FAILED_RETRYABLE -> DECRYPTING_FOR_UPLOAD
Non-retryable/local-integrity failure -> FAILED_TERMINAL (ciphertext retained)
```

PPQ1 version 2 authenticates the magic, format version, and IV-length header as GCM associated data. Version-1 containers remain decryptable for migration. Android application-data backup is disabled because restored ciphertext would not have its installation-specific Keystore key. Clearing data, uninstalling, losing the device, or invalidating the key can make an unsynchronized queue unrecoverable.

## Capture and time context

Before a supported online capture, the app force-refreshes App Check and requests a server nonce, ten-minute capture window, and 30-day redemption deadline. The Android app may sign the nonce with a persistent Keystore EC key. The backend verifies possession of the corresponding private key, but the client-reported hardware-backing Boolean is only a signal; full Android Key Attestation chain validation is not implemented.

The manifest separates:

- client-observed wall-clock start/finish times, labeled untrusted;
- client monotonic elapsed duration, labeled relative only;
- server receipt/finalization time, added later and never backdated into capture time; and
- a wall/monotonic duration-consistency status.

If network or the attestation provider is unavailable under the bounded fallback conditions, capture may continue as `OFFLINE_UNATTESTED` with an explicit reason code. Later synchronization does not upgrade that capture to an online-attested state.

## Layered assurance

Each evidence record reports independent dimensions:

| Dimension | Current semantics |
|---|---|
| Acquisition quality | `NOT_EVALUATED`; no calibrated focus/blur/glare/coverage gate is enabled |
| App/device context | Online App Check plus key possession, online App Check only, offline/unattested, or not provided |
| Byte integrity | Client/server hash and length plus media-type comparison; mismatch is explicit |
| Physical correspondence | `NOT_AVAILABLE`; no validated matcher is enabled |
| Carrier context | Barcode/tracking observation status only; no live carrier-custody assertion |
| Business/legal relevance | `REVIEW_REQUIRED`; external policy and human interpretation are required |

An integrity mismatch preserves a quarantined record and manifest but does not advance the transaction or return workflow. Shipping requires a finalized packing record with no recorded byte-integrity mismatch.

## Workflow state machines

Outbound transaction:

```text
DRAFT -> AWAITING_BUYER -> TERMS_REVIEW -> TERMS_LOCKED
TERMS_LOCKED -> PACKED -> SHIPPED -> BUYER_REVIEW -> COMPLETED
```

Return Passport:

```text
REQUESTED -> AUTHORIZED -> PACKED -> IN_TRANSIT -> RECEIVED_REVIEW -> COMPLETED
```

Return evidence is linked by `returnPassportId`. A return record snapshots the SHA-256 values of existing finalized/legacy evidence for historical comparison. That snapshot documents digital records; it does not determine whether a physical item was swapped.

## PackProof Connect

```text
External order
  -> bearer-authenticated, idempotent Connect API
  -> seven-day hashed handoff token and app URL
  -> signed-in native session redemption
  -> normal encrypted evidence pipeline
  -> layered digital-evidence callback
  -> exact-body webhook HMAC and retry-stable delivery ID
```

The callback event is `packproof.evidence.finalized`. It uses `DIGITAL_EVIDENCE_READY` or `DIGITAL_EVIDENCE_WITH_LIMITATIONS`, always carries reason codes and layered assurance, and always reports physical correspondence unavailable. Each attempt receives a fresh dossier URL expiring after 15 minutes. The dossier is a presentation derivative linked to source bundle hashes; it does not replace native evidence or manifests.

## Core collections

| Path | Client access | Purpose |
|---|---|---|
| `users/{uid}` | owner read | Private profile, plan, and deletion state |
| `publicProfiles/{uid}` | authenticated read | Minimal display identity |
| `transactions/{id}` | participants read | Terms, source, and workflow state |
| `transactions/{id}/events/{id}` | participants read | Server-written audit timeline |
| `transactions/{id}/evidence/{id}` | participants read | Finalized/quarantined evidence metadata and layered assurance |
| `transactions/{id}/returns/{id}` | participants read | Return Passport state and original-hash snapshot |
| `transactions/{id}/packets/{id}` | participants read | Presentation dossier lineage and digest |
| `pendingUploads/{id}` | server only | Short-lived exact-path reservation and immutable request inputs |
| `captureSessions/{id}` | server only | Online nonce receipt, context, and redemption state |
| `connectSessions/{id}` | server only | External order handoff and claim state |
| `platformIntegrations/{id}` | server only | API-key hash, callback allowlist, and webhook secret |
| `webhookDeliveries/{id}` | server only | Delivery template, dossier source path, retry lease, and delivered-payload digest |

## Operational controls outside source

The deployment still needs explicit environment separation, secret/key rotation and historical-key retention, retention/legal-hold policy, regional placement, administrator/elevation audit, backup restore-and-rehash drills, monitoring, incident response, SBOM and release provenance, and independent security review. Source architecture alone does not prove those controls are operating.
