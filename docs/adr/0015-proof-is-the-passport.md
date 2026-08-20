# ADR 0015: Proof is the product name for the Passport projection

- Status: Accepted
- Date: 2026-08-19

## Context

PackProof already has a canonical aggregation of a transaction’s existing records: the PackProof Passport. It is a live JSON projection, a web and mobile render of that JSON, and a presentation-only PDF export. It is not a second evidence store, not a transaction, and not an adjudication.

Customer, operator, and developer language still said Passport. That name does not teach the product boundary: PackProof records facts; the recipient decides what they mean. “Proof” is ordinary English for that artifact. Renaming the persisted `transaction` resource, inventing a `proofs` collection, or collapsing Return Passport into the same kind would mix workflow identity with the evidence object.

## Decision

**Proof is a rename of Passport.** Same projection, same eligibility, same `ppt_` resource ids, same `PP-XXXX-XXXX-XXXX` display ids, same snapshots and PDF exports.

```text
PackProof (platform)
  transaction (commerce agreement and workflow)
    evidence artifacts / sessions / manifests (source records)
    timeline / audit events (source records)
    return_passport (reverse-logistics workflow; contributes facts)
    Proof (Passport projection of those records)
```

Governing product sentence:

> PackProof creates the Proof. The Proof contains the facts. The recipient makes the decision.

PackProof records, preserves, and presents. PackProof does not adjudicate.

Proof status is capture completeness (and, later, satisfaction of an adopter Proof Policy). It is never claim validity. Forbidden product-status words on a Proof: Verified, Approved, Legitimate, Fraudulent, Valid claim. Technical integrity results (hash matched, manifest authenticated for PackProof-service verification) remain technical results, not Proof status.

### Compatibility (schemaVersion 1)

Public JSON keeps `object: packproof_passport`, `identity.passportId`, and error code `PASSPORT_NOT_READY`. Human messages, UI, OpenAPI titles, and PDF chrome say Proof. HTTP paths `/v1/transactions/{id}/passport` and `/v1/passports/{id}` remain; `/proof` and `/proofs` are aliases that invoke the same handlers. Issued verification URLs under `/passport/{displayId}` remain valid; newly constructed URLs prefer `/proof/{displayId}`.

Changing the discriminator or field names to `packproof_proof` / `proofId` requires `schemaVersion: 2` and a later ADR.

`return_passport` and `passport_draft` stay those resource kinds. Return Passport is a workflow resource that contributes facts to a Proof. The PackProofs library tab stays PackProofs (records), not “Proofs.”

### Time-to-Proof

“Where’s the Proof?” is a UX test. Each persona reaches the live Proof in one primary interaction (View Proof). Measuring Time-to-Proof as analytics is out of this decision.

## Consequences

- Surfaces and Next Action copy use View Proof / Proof Ready / Proof Incomplete.
- Merchant and portal transports expose Proof path aliases without a second projection implementation.
- ADR 0009’s non-adjudication boundary applies to the Proof by name, not only to SISV.
- Proof Policy, webhook `proof.*` type names, schema v2 field rename, and Proof Analytics remain later work.
- Do not treat this as authority to rename `transaction`, to persist a `proofs` collection, or to make the portal assemble a Proof in JavaScript.

### Schema v2 follow-up (not now)

Schema v1 keeps `object: packproof_passport`, `identity.passportId`, `ppt_...`, `PP-...`, `PASSPORT_NOT_READY`, and `/passport` routes. A later ADR may introduce `schemaVersion: 2` that makes `PackProofPassportV1`, `passportId`, and legacy `/passport` paths deprecated aliases rather than permanent naming. Do not start that migration while v1 consumers exist. Preserve v1 exactly as this decision records.
