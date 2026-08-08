# Offline evidence queue

PackProof 0.2.1 treats loss of connectivity as a synchronization delay, not a failed capture.

## Android storage design

1. The camera writes its temporary capture into the app cache.
2. The local native module streams that file through SHA-256 and AES-256-GCM without loading the whole video into JavaScript memory.
3. The AES key is generated and retained by Android Keystore under `packproof_offline_evidence_v1`.
4. The encrypted media container and separately encrypted metadata record are saved under the app-private document directory.
5. The original camera temporary file is deleted after the encrypted queue record is committed.
6. When connectivity returns, PackProof decrypts one item into private cache, requests a fresh exact-path upload grant, uploads, and deletes both the temporary plaintext and encrypted queue files only after Storage accepts the upload.

The queue index in AsyncStorage contains only opaque queue IDs. Transaction details, hashes, filenames, manifests and media paths remain inside encrypted metadata.

## Recovery behavior

- Network reconnection and app foregrounding both trigger synchronization.
- An attested capture is bound to one immutable request fingerprint and one reserved upload path. Retries reissue or extend that same exact-path six-hour grant; a different file cannot reuse the capture nonce. Offline-unattested captures receive a fresh exact-path grant when synchronization begins. Grant credentials themselves are never persisted in the queue.
- Capture-attestation receipts are redeemable for 30 days, while the server still verifies that the original capture began inside the ten-minute attestation window.
- Failed items remain encrypted with attempt count, last-attempt time and a bounded error message.
- The UI reports whether a selected item uploaded immediately or remains protected offline.

## Platform scope

This repository is the Android distribution. The encrypted file module is Android-only and requires API 26 or newer. An iOS release must implement an equivalent Keychain/Secure Enclave-backed file container before enabling the queue there; the TypeScript wrapper deliberately fails closed on unsupported platforms.

## Operational tests

Test at minimum: airplane mode before capture, connection loss during upload, process termination after encryption, device restart, expired upload grant, 500 MB video, corrupt encrypted header, invalid GCM tag, deleted Keystore key and a reconnect with two queued captures.
