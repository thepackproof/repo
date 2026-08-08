# Security model and operating controls

This is an implementation threat model, not a certification, external audit or penetration-test report. Obtain independent review before handling valuable evidence at enterprise scale.

## Implemented properties

- Default-deny Firestore and Storage rules; participant-only reads.
- No direct client Firestore writes; server-authoritative transitions.
- Firebase Authentication and App Check enforcement on private callable APIs.
- Replay-protected App Check consumption for JIT capture-session issuance.
- Strict project-owned validation with field, length, enum, timestamp, size and manifest limits.
- Android Keystore AES-256-GCM encrypted offline media and metadata.
- Persistent Android Keystore EC key; server-verifiable ECDSA signature over the capture nonce.
- Exact-path, six-hour evidence upload grants; create-only Storage and 600 MB cap.
- Independent streaming server SHA-256; canonical manifest hash; bundle hash; HMAC-SHA256 manifest authentication.
- Privacy-preserving HMAC of ingress subnet instead of raw IP retention.
- Explicit opt-in before precise location enters a manifest.
- Camera barcode comparison against server-side Connect tracking context at capture time, plus an explicitly separate post-submission comparison for standard outbound and return shipments when tracking is entered after packing.
- Hashed invitation, Connect handoff and API-key material.
- PackProof Connect callback origin allowlist, public-HTTPS/DNS checks, signed callbacks, idempotency and retries.
- Return evidence isolated by Return Passport and linked to an immutable original-hash snapshot.

## Important interpretation limits

- Play Integrity/App Check is the provider-backed app/device attestation. The runtime metadata fingerprint is not a self-proving hash of every native instruction or JavaScript byte.
- The Android Keystore ECDSA signature proves possession of the private key used for the server nonce. `hardwareBacked` is reported from Android `KeyInfo`; full Android Key Attestation certificate-chain verification is not included.
- Sensor micro-motion is supporting telemetry, not proof that a human honestly performed the shipment. A tripod or accessibility need is not fraud, and a handheld reading is not authenticity.
- HMAC manifests are verifiable by PackProof infrastructure holding the secret, not by arbitrary third parties. Use Cloud KMS asymmetric signing for public verification.
- Barcode matching confirms that normalized observed text agrees with normalized expected tracking context. Post-submission comparisons are stored separately and do not retroactively alter the signed capture manifest. Live carrier acceptance, weight and custody events require contracted carrier/aggregator APIs and credentials.
- SHA-256 confirms byte identity after server receipt, not the truth of the scene.

## Threat register

| Threat | Mitigation | Residual risk / next control |
|---|---|---|
| Dead-zone data loss | Keystore-encrypted queue, immutable retry-bound grants, reconnect/foreground sync | Lost/uninstalled device or deleted Keystore key makes local queue unrecoverable; communicate this and test backups/retention |
| Capture-session replay | Consumed App Check token, random nonce, atomic receipt redemption, timestamp window | Compromised genuine account/device can still stage a deceptive scene |
| Evidence replacement | Create-only random path, client hash and independent server hash | User can omit relevant evidence or stage events before capture |
| Modified client/runtime | App Check, runtime fingerprint continuity, release shrinking | Advanced compromise remains; add native anti-debug checks and Android Key Attestation only after independent review to avoid false confidence |
| Return item swap | Original-hash snapshot, return packing/unboxing streams, identifier prompts | PackProof documents comparison evidence but cannot determine authenticity |
| Connect API replay | Integration-scoped idempotency and payload conflict check | Stolen live API key can create sessions; rotate keys and add per-integration quotas |
| Callback forgery/replay | Timestamped HMAC, delivery ID and SDK verifier | Merchant must verify raw body before parsing and retain delivery IDs |
| Callback SSRF | HTTPS, origin allowlist, DNS/public-IP validation before delivery | DNS rebinding remains stronger against a pinned egress proxy than application checks alone |
| Secret exposure | Firebase secrets for global keys, server-only collections for integrations | Envelope-encrypt per-integration webhook secrets with Cloud KMS for stricter environments |
| Sensitive telemetry | Optional location, no raw ingress IP, private participant access | Define retention/deletion policy, regional storage and legal basis before launch |

## Required production operations

Use separate preview/production Firebase projects, named least-privilege accounts and hardware-key-protected break-glass owners. Enable Cloud Audit Logs, budget and Function error alerts, callback failure alerts, Storage anomaly monitoring and periodic restore drills. Rotate `MANIFEST_SIGNING_SECRET` under a documented key-version strategy; rotation without retaining old versions prevents later HMAC verification of historical manifests.

No automated contraband/malware/content classification or staff moderation console is included. Connect reports to a restricted operational process before public launch.
