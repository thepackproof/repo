# ADR 0006: Android secure-capture boundary

- Status: Accepted
- Date: 2026-08-11

## Context

The core offline evidence guarantees rely on the local Android module for Keystore AES-256-GCM, streaming hashes, private files, image signals and device-key challenge signatures. Web, Expo Go and the current iOS path do not implement this boundary.

## Decision

Android is the supported secure-capture platform until another platform has an equivalent native adapter and passes the same vectors and lifecycle tests.

Cross-platform presentation may exist, but it cannot claim native evidence capture. A future iOS implementation must use a separately reviewed Keychain/Secure Enclave design, explicit container/version compatibility and device tests. It must not silently fall back to JavaScript keys or unencrypted shared storage.

## Consequences

Hosted/button flows hand off to Android for production capture. Platform capability is explicit in API/UI responses. Clearing app data, uninstalling or invalidating the installation key can make unsynchronized ciphertext unrecoverable and remains disclosed.
