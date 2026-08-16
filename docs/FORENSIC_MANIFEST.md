# Evidence manifest schema 2

The historical filename is retained for links, but version 0.9.0 calls this an **evidence manifest**. “Forensic” in a filename or technical context is not a claim of laboratory accreditation, legal admissibility, authenticity, or evidentiary weight.

Every accepted or integrity-quarantined evidence object produces canonical private JSON at `manifests/{transactionId}/{uploadId}.json`. Camera-originated records include a capture manifest; a supporting PDF has `capture: null` and remains explicitly distinguishable.

## Exact-byte and media checks

The Storage finalizer:

1. validates the one-time pending reservation, participant, path, type, expiry, and size;
2. streams SHA-256 over the exact stored object;
3. reads a small prefix and detects JPEG, PNG, MP4, or PDF magic bytes;
4. compares the server digest and length with the client values when provided;
5. compares declared content type with detected media type; and
6. records every result before any workflow transition.

A hash, length, or media-type mismatch produces `EVIDENCE_INTEGRITY_MISMATCH`, `INTEGRITY_MISMATCH_REVIEW`, and byte-integrity `MISMATCH`. The object and manifest are retained for review, but the record does not advance packing, buyer-review, or return states.

## Canonical manifest and bundle

Schema 2 uses:

- canonicalization profile `PACKPROOF_JCS_1`;
- RFC 8785 JCS semantics with the stricter input gate documented in [`EVIDENCE_FORMAT_V2.md`](EVIDENCE_FORMAT_V2.md);
- SHA-256 over the exact UTF-8 canonical manifest bytes; and
- bundle-binding profile `PACKPROOF_EVIDENCE_BUNDLE_V2`.

The v2 bundle uses domain-separated, fixed-length binary digests:

```text
SHA256(
  UTF8("PACKPROOF-EVIDENCE-BUNDLE\0v2\0sha256\0") ||
  RAW32(fileSha256) ||
  UTF8("\0sha256\0") ||
  RAW32(manifestSha256)
)
```

Historical schema-1 records used `SHA256(fileSha256Hex + "\n" + manifestSha256Hex)`. They must remain labeled `LEGACY_V1` and must never be reinterpreted as v2.

## Service authentication

The backend computes HMAC-SHA256 over the canonical manifest using `MANIFEST_SIGNING_SECRET`. Metadata records:

- `type: SERVICE_MAC`;
- `algorithm: HMAC-SHA256`;
- the non-secret `MANIFEST_SIGNING_KEY_ID`;
- the base64url MAC; and
- `verificationScope: PACKPROOF_SERVICE_ONLY`.

This is not a publicly verifiable digital signature. A reviewer without the secret can verify the original-file hash, canonical-manifest hash, and bundle binding, but cannot independently establish PackProof service origin from the MAC. Production operations must preserve retired key versions for the records they cover. A future public-origin feature requires a separately reviewed KMS/HSM-backed asymmetric signature and published key/version status.

## Provenance-bearing fields

The manifest separates:

- evidence identity, transaction, uploader role, evidence type, original filename, declared/detected media type, byte length, SHA-256, and Storage generation;
- client capture data and explicit client provenance, or `null` for non-camera documents;
- normalized app/device context, server-computed nonce-signature validity, and client-reported hardware-backing signal;
- carrier/tracking observation context;
- server bucket/path/generation, object creation time, and privacy-minimized ingress context;
- client/server hash and length results, media-type result, and wall/monotonic duration consistency;
- six independent assurance dimensions;
- access, retention-policy, and legal-hold status labels; and
- format and authentication profiles.

No field converts a later server receipt into a trusted capture timestamp. Client wall time is labeled `CLIENT_OBSERVED_UNTRUSTED`; monotonic elapsed time is relative only. Optional precise location is included only after user opt-in and is omitted from the presentation dossier by default.

## Capture-context interpretation

- App Check / Play Integrity is provider-backed application/request context, not proof of the physical scene.
- A valid ECDSA nonce signature proves possession of the presented Keystore private key. Full Android Key Attestation chain/root/security-level/revocation validation is not implemented.
- Motion statistics report `MOTION_DETECTED`, `LOW_MOTION`, or `INSUFFICIENT_DATA` with `CONTEXT_SIGNAL_ONLY`. They do not prove a human held the device or that the scene was honest.
- A barcode match reports equality under the documented normalization rule. It does not establish carrier acceptance, weight, route, possession, delivery, or custody.
- Acquisition quality is `NOT_EVALUATED` in this release.
- Physical correspondence is `NOT_AVAILABLE` with `NO_VALIDATED_PHYSICAL_MATCHER_ENABLED`.
- Business/legal relevance is `REVIEW_REQUIRED`.

## Independent verification

Known-answer vectors are in `docs/test-vectors/evidence-format-v2.json`. The producer and standalone verifier are separate implementations exercised by `npm run test:evidence-format`.

Run the clean-room verifier with exported files:

```powershell
node tools/verify-evidence.mjs manifest.json original-file --expected-manifest-sha256 HEX --expected-bundle-sha256 HEX
```

`npm run test:evidence-verifier` checks a positive fixture and proves that a one-byte mutation fails. Authorized service environments can additionally verify a supplied MAC with `PACKPROOF_MANIFEST_HMAC_SECRET`; that secret must never be distributed with a dossier.
