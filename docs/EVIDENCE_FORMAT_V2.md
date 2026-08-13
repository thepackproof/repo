# PackProof evidence format v2

This specification defines the evidence manifest produced by PackProof 0.8.5.0. It is an implementation contract, not a certification, a physical-authenticity result, or a legal conclusion.

## Profiles

- Manifest schema: `2`
- Canonicalization: `PACKPROOF_JCS_1`, a strict I-JSON input gate followed by RFC 8785 JSON Canonicalization Scheme semantics
- File digest: SHA-256 over the exact original byte stream received by the app and independently over the stored object
- Bundle binding: `PACKPROOF_EVIDENCE_BUNDLE_V2`
- Manifest authentication: HMAC-SHA256 with an explicit non-secret key ID and `PACKPROOF_SERVICE_ONLY` verification scope

The current HMAC is not a publicly verifiable digital signature. A reviewer without the service secret can independently verify the original file hash, canonical manifest hash, and bundle binding, but cannot establish PackProof service origin from the MAC alone.

## Canonicalization

`PACKPROOF_JCS_1` accepts only JSON null, booleans, well-formed Unicode strings, finite IEEE-754 numbers, dense arrays, and plain objects. It rejects undefined values, sparse arrays, non-finite numbers, unpaired UTF-16 surrogates, non-plain objects, BigInt, functions, and symbols. Object keys use UTF-16 code-unit order. Strings and numbers use ECMAScript `JSON.stringify` serialization as required by JCS.

The canonical manifest is UTF-8 with no BOM, indentation, or trailing newline. Test vectors live in `docs/test-vectors/evidence-format-v2.json`. The Cloud Functions producer and standalone verifier are intentionally separate implementations exercised by the same vectors.

## Bundle binding

Let `F` be the 32 raw bytes of the original file SHA-256 digest and `M` the 32 raw bytes of the canonical manifest SHA-256 digest. The v2 bundle digest is:

```text
SHA256(
  UTF8("PACKPROOF-EVIDENCE-BUNDLE\\0v2\\0sha256\\0") ||
  F ||
  UTF8("\\0sha256\\0") ||
  M
)
```

The NUL bytes and fixed-length binary digests make the domain and fields unambiguous. Historical version-1 records used `SHA256(fileSha256Hex + "\\n" + manifestSha256Hex)` and must remain labeled as legacy rather than silently reinterpreted.

## Layered assurance

The manifest reports these dimensions independently:

- acquisition quality;
- app/device context;
- byte integrity;
- physical correspondence;
- carrier context;
- business/legal relevance.

PackProof 0.8.5.0 reports physical correspondence as `NOT_AVAILABLE` with reason `NO_VALIDATED_PHYSICAL_MATCHER_ENABLED`. It does not produce a production `MATCH` or `NON_MATCH` result.

## Verification

Run:

```powershell
node tools/verify-evidence.mjs manifest.json original-file --expected-manifest-sha256 HEX --expected-bundle-sha256 HEX
```

The utility confirms canonical bytes, original-file SHA-256, the file digest recorded inside the manifest, and the v2 bundle digest. Authorized PackProof service environments may additionally provide `PACKPROOF_MANIFEST_HMAC_SECRET` and `--expected-mac-base64url`; do not distribute that secret with a dossier.
