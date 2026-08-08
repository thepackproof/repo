# Forensic manifest

Every new camera-originated evidence file can produce a canonical private JSON manifest at `manifests/{transactionId}/{uploadId}.json`.

## Signed bundle

The Storage finalization function independently streams the uploaded file through SHA-256. It then canonicalizes the manifest, computes `manifestSha256`, computes `evidenceBundleSha256 = SHA256(fileSha256 + "\n" + manifestSha256)`, and authenticates the canonical JSON with HMAC-SHA256 using `MANIFEST_SIGNING_SECRET`.

HMAC is a server-authenticated signature shared by PackProof infrastructure; it is not a publicly verifiable asymmetric signature. A future external-verification product should replace or supplement it with Cloud KMS asymmetric signing and publish key-version metadata.

## Capture fields

The client manifest includes:

- capture start and finish times;
- app version, native build, application ID, Expo runtime/update identifiers, device model and OS;
- a SHA-256 fingerprint of those runtime metadata fields;
- accelerometer and gyroscope statistics from the final three seconds;
- a conservative micro-motion assessment (`HANDHELD_LIKELY`, `FIXED_OR_LOW_MOTION`, or `INSUFFICIENT_DATA`);
- connection type and reachability;
- optional, explicit-opt-in coordinates and accuracy;
- a camera barcode observation for supported shipping-label flows;
- the just-in-time App Check receipt and optional Android Keystore challenge signature.

The runtime fingerprint is not represented as a self-proving native binary hash. Play Integrity/App Check is the provider-backed app/device attestation. The Android Keystore key proves possession of a persistent private key and the server verifies its ECDSA nonce signature; the Boolean hardware-backing field is client-reported unless a full Android Key Attestation certificate-chain verifier is added.

## Server-only fields

The server adds the verified Storage path/generation, server receipt time, server-computed file size and hash, client/server hash comparison, privacy-preserving HMAC of the request ingress subnet, expected tracking context, barcode match status and attestation classification.

Raw ingress IP addresses are not stored. Exact location is omitted unless the user opts in before capture. If a tracking number is submitted only after the packing video, the backend stores a distinct post-submission comparison on the evidence and shipment records. That later comparison is reproducible against the barcode already sealed in the manifest, but it is not included in or backdated into the original manifest signature.
