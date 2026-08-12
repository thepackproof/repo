# Offline evidence queue

PackProof 0.3.0 treats loss of connectivity as a synchronization delay. It does not label a locally encrypted file as uploaded or server-finalized.

## Android storage design

1. The camera or document picker places an original in app-private cache.
2. The local native module streams the file through plaintext SHA-256 and AES-256-GCM without loading a large video into JavaScript memory.
3. A non-exportable AES-256 key is generated and retained by Android Keystore under `packproof_offline_evidence_v1`.
4. PPQ1 container version 2 writes magic, version, and IV length, authenticates those header bytes as GCM associated data, writes a fresh random IV, then writes ciphertext and tag.
5. The encrypted media container and separately encrypted metadata container are durably committed under the app-private document directory.
6. The temporary original is deleted only after both encrypted queue artifacts and the queue index are committed.
7. Synchronization decrypts into an unreferenced app-private temporary file. AES-GCM tag verification must succeed before that temporary file is committed to the upload path.
8. The client requests a participant/type/path-bound reservation, uploads only when the server reports `READY`, and waits for the corresponding Firestore evidence record.
9. Temporary plaintext is always removed after the attempt. Queue ciphertext is removed only after server finalization is observable.

PPQ1 version-1 containers remain decryptable for migration, but their header was not authenticated as associated data. Metadata records `encryptionContainerVersion` and `encryptionHeaderAuthenticated` so that distinction is preserved.

## Explicit states

```text
ENCRYPTING
QUEUED
DECRYPTING_FOR_UPLOAD
GRANT_REQUESTED
UPLOADING
AWAITING_FINALIZATION
FINALIZED
FAILED_RETRYABLE
FAILED_TERMINAL
```

Each encrypted metadata record retains a bounded state history, state-change time, attempt count, last-attempt time, error class, server upload ID, and reserved path when known. A finalization timeout is retryable: the original remains encrypted and the next attempt asks the server whether the deterministic upload is already processing or finalized.

Network reconnection and app foregrounding trigger retry. A target-specific synchronization waits for any active global synchronization, then performs another pass when the newly queued target was not attempted by that pass.

## Retry and server idempotency

The queue ID is the `clientEvidenceId`. The server derives the upload ID from a domain-separated SHA-256 of transaction ID, uploader ID, and client evidence ID. It also binds the reservation to a canonical request fingerprint containing evidence type, content type, name, client time/hash/length, capture and return context, and the parsed manifest.

- The same client identity and fingerprint receives the same path.
- The same client identity with a different fingerprint is rejected.
- Reservation expiry may be extended, but the first request, attestation, and ingress inputs are not rewritten.
- If the object already exists but Firestore finalization is pending, the server returns `PROCESSING`; the client does not overwrite the create-only object.
- An online-attested capture receipt can be redeemed only for its original context and fingerprint.

## Failure and recovery behavior

- Connectivity and transient server failures move an item to `FAILED_RETRYABLE`; the ciphertext remains.
- Corrupt header/tag, invalidated/missing key, cross-account ownership, invalid request, or authorization failure moves an item to `FAILED_TERMINAL`; automatic retry stops and ciphertext remains for review.
- An unreadable encrypted metadata record is counted as a local attention condition instead of disappearing from the UI.
- The queue view distinguishes retryable items from attention-required items and does not describe terminal failures as automatic success.
- There is intentionally no silent “discard corrupt queue” behavior. A recovery/removal UI and support procedure must be separately authorized because deletion can destroy the only retained original.

## Key loss, backup, and platform scope

The queue key is installation/device-bound. Uninstalling, clearing application data, losing the device, or invalidating the Keystore key can make unsynchronized evidence unrecoverable. Android `allowBackup` is disabled so ciphertext is not restored onto an installation that lacks the key. This also means backup is not a queue recovery mechanism.

The repository is Android-only and requires API 26 or newer. An iOS distribution must implement and validate an equivalent native encrypted container before enabling evidence queueing; unsupported platforms fail closed.

## Required runtime tests

Before external reliance, exercise at least:

- airplane mode before capture and provider outage during attestation;
- network loss before, during, and after object upload;
- process termination at every state boundary;
- reboot with multiple queued items;
- expired reservation and repeated synchronization;
- duplicate finalizer delivery and partial server failure;
- one-byte ciphertext, tag, header-version, and IV-length mutation;
- missing/invalidated Keystore key;
- storage exhaustion during encryption/decryption;
- app update, data clear, uninstall/reinstall, and backup/restore behavior; and
- 500 MB-class video memory/disk behavior.

Static inspection and compilation do not satisfy these device/runtime gates.
