# PackProof architecture

## Product boundary

PackProof creates a private transaction passport for high-value sales and authorized returns. It records participant-entered terms, original media as received, server-computed fingerprints, runtime telemetry, label context and workflow events. It does not authenticate an item or person, provide escrow or insurance, guarantee real-world truth or resolve a dispute.

## Components

| Layer | Technology | Responsibility |
|---|---|---|
| Android client | Expo SDK 57, React Native, Expo Router | Guided transaction, return and capture flows; deep links; authenticated private views |
| Native evidence security | Expo local Android module, Android Keystore | Streaming AES-256-GCM queue encryption, streaming SHA-256 and ECDSA nonce signing |
| Identity / app attestation | Firebase Authentication + App Check / Play Integrity | User identity and provider-backed app/device request attestation |
| API | Firebase callable/HTTP Cloud Functions, Node 22 | Validation, authorization, state machines, Connect ingestion and callback delivery |
| Records | Cloud Firestore | Private transaction, return, evidence, manifest reference and audit metadata |
| Media | Cloud Storage | Create-only evidence, canonical manifests, dossiers and user exports |
| Billing | Google Play Billing + RevenueCat | Subscription UI and server entitlement webhook |
| Public web | Firebase Hosting | Policies, deletion, invitations and Connect app-opening fallback |

## Evidence path

```text
Camera capture
  → app-private temporary file
  → streaming SHA-256 + Android Keystore AES-256-GCM queue
  → six-hour exact-path upload grant when online (retry-bound to one immutable path for attested captures)
  → private create-only Cloud Storage object
  → Storage finalization trigger streams independent SHA-256
  → canonical manifest + manifest SHA-256 + bundle SHA-256 + server HMAC
  → immutable evidence metadata + append-only timeline
```

The mobile app is untrusted. It cannot directly write Firestore records. Offline queueing does not retain grant credentials. For an attested capture, reconnect reissues or extends the one reserved exact path bound to the immutable request fingerprint; offline-unattested captures receive a fresh server-authorized path when synchronization starts. Clients cannot update or delete accepted evidence.

## Just-in-time capture attestation

The record action force-refreshes App Check before calling `beginCaptureSession`. The server issues a random nonce, a ten-minute capture window and a 30-day redemption deadline. The Android app signs the nonce with a persistent Keystore EC key. Upload authorization verifies caller/context, capture timestamps, runtime fingerprint continuity and the ECDSA signature before atomically consuming the receipt.

If the device is offline, capture still proceeds and is safely queued, but the manifest is explicitly marked `OFFLINE_UNATTESTED`. Synchronization does not falsely reclassify it as a live-attested capture.

## State machines

Outbound transaction:

```text
DRAFT → AWAITING_BUYER → TERMS_REVIEW → TERMS_LOCKED
TERMS_LOCKED → PACKED → SHIPPED → BUYER_REVIEW → COMPLETED
```

Symmetric return:

```text
REQUESTED → AUTHORIZED → PACKED → IN_TRANSIT → RECEIVED_REVIEW → COMPLETED
```

Return evidence is linked by `returnPassportId` and preserves a snapshot of original evidence hashes.

## PackProof Connect

```text
Marketplace order webhook
  → authenticated/idempotent Connect API
  → seven-day hashed handoff token + universal URL
  → native session redemption and locked transaction
  → normal PackProof capture/evidence pipeline
  → generated dossier + signed callback + retry scheduler
```

A platform receives standardized verification metadata and a time-limited dossier URL without hosting PackProof media or rebuilding the native capture pipeline.

## Core collections

| Path | Client access | Purpose |
|---|---|---|
| `users/{uid}` | owner read | Private profile, plan and deletion state |
| `publicProfiles/{uid}` | authenticated read | Minimal display identity |
| `transactions/{id}` | participants read | Shared item, source, terms and workflow state |
| `transactions/{id}/events/{id}` | participants read | Append-only audit timeline |
| `transactions/{id}/evidence/{id}` | participants read | Server-verified evidence and manifest fingerprints |
| `transactions/{id}/returns/{id}` | participants read | Symmetric Return Passport |
| `transactions/{id}/packets/{id}` | participants read | Generated dossier records |
| `pendingUploads/{id}` | server only | Short-lived exact-path upload grant and validated client manifest |
| `captureSessions/{id}` | server only | JIT nonce receipt and redemption status |
| `connectSessions/{id}` | server only | External order handoff and claim status |
| `platformIntegrations/{id}` | server only | Hashed API key, callback allowlist and signing secret |
| `webhookDeliveries/{id}` | server only | Idempotent callback and retry state |

## Deployment units

- EAS produces Android development, preview and Play App Bundle builds.
- Firebase deploys Firestore/Storage rules, indexes, Functions and Hosting.
- `packproof.link` or the selected Connect domain must host Android App Links association data and point `/connect/capture` at the fallback page.
