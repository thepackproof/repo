# ADR 0001 — Manifest Authentication: HMAC Service MAC (current) vs Public Signature (future)

Status: Confirmed (agentic). Decision date: 2026-08-11

Context
- Existing implementation creates canonical manifests and authenticates them using an HMAC-SHA256 service MAC bound to a service-only secret (see `functions` infrastructure and `production.ts`).
- A publicly verifiable signature (e.g., RSASSA or ECDSA with a verifiable public key) would enable external verification without the service secret, but requires key lifecycle, distribution, and stronger non-repudiation guarantees.

Decision
- Continue with HMAC-SHA256 service MAC for manifest authentication as the primary production mechanism. Treat HMAC as `PACKPROOF_SERVICE_ONLY` authentication scope.
- Plan and design an optional future migration path to a public-key signature model (detached signature) as an enhancement. This path is gated by: independent key custody, key rotation tooling, public key distribution endpoint, and legal/operational controls.

Consequences
- Pros:
  - Simpler key management during initial rollout (single secret in Secret Manager).
  - Matches current code and test surface (no breaking changes required).
- Cons:
  - Third parties cannot independently verify manifests without PackProof cooperation.
  - Requires strong operational controls to prevent secret compromise.

Implementation notes (agentic tasks)
- Ensure `PUBLIC_HANDOFF_SIGNING_SECRET` and `PARTICIPANT_HANDOFF_SIGNING_SECRET` are stored as Firebase Secrets and not in source.
- Add rotation scripts and an automated test that verifies both old- and new-key verification behavior for rolling key rotations.
- Add an ADR for public-key migration detailing API and storage changes when ready.

