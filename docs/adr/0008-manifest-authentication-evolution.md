# ADR 0008: Manifest authentication evolution

- Status: Accepted
- Date: 2026-08-11

## Context

Current evidence manifests use deterministic serialization, hashes, bundle binding and a service-held HMAC. An HMAC verifies only for parties holding the shared secret and therefore is not a publicly verifiable service signature.

## Decision

Preserve the current scheme with explicit authentication metadata:

- type `SERVICE_MAC`;
- algorithm `HMAC-SHA256`;
- key ID;
- verification scope `PACKPROOF_SERVICE_ONLY`.

A future public-origin scheme must be a separate versioned authentication type backed by reviewed asymmetric KMS/HSM signing. It includes algorithm, key/version ID, public verification material/status, retirement/revocation semantics and historical verification availability. It does not rewrite or relabel existing HMAC records.

## Consequences

Authorized PackProof infrastructure can authenticate current manifests while external reviewers can independently recompute file, manifest and bundle hashes. Public service-origin verification remains future work and cannot be claimed from the HMAC implementation.
