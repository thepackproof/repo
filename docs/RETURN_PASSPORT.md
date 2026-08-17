# Return Passport

A Return Passport applies the same participant-restricted digital-evidence workflow to an authorized buyer-to-seller return. “Symmetric” means both outbound and return legs can retain packing, shipping-label, condition, and unboxing records; it is not a claim that the evidence proves physical identity or condition.

## Roles and states

- Either participant can request a return when the locked terms/state allow it.
- The other participant must authorize it.
- The buyer is the returning participant and the seller is the recipient, independently of who requested the workflow.
- Only the returning participant can record return packing/shipping evidence.
- Only the recipient can record returned-item unboxing and acknowledge receipt.

```text
REQUESTED -> AUTHORIZED -> PACKED -> IN_TRANSIT -> RECEIVED_REVIEW -> COMPLETED
```

Cancelled and disputed branches remain explicit. Both participants must confirm completion.

## Digital linkage

At request time, the backend snapshots the SHA-256 values of existing server-finalized evidence (plus labeled historical v0.2 compatibility records) into `originalEvidenceHashes`. New return records carry `returnPassportId` through the upload reservation, manifest, evidence metadata, and timeline event.

Return evidence types are:

- `RETURN_CONDITION_PHOTO`;
- `RETURN_PACKING_VIDEO`;
- `RETURN_SHIPPING_LABEL`; and
- `RETURN_UNBOXING_VIDEO`.

Return shipping requires a server-finalized return packing video with no recorded byte-integrity mismatch. A hash/length/media mismatch is retained for review but cannot advance the return state.

The original-hash snapshot binds digital source records; it does not by itself show that the same physical item was returned. Version 0.9.5.0 reports physical correspondence as `NOT_AVAILABLE`.

## Carrier and dossier semantics

If a barcode was observed during capture, a later submitted return tracking number is compared under the documented normalization rule and stored as a separate post-submission result. It is not backdated into the original manifest and is not a live carrier-custody assertion.

Presentation dossiers inventory the outbound and return evidence, hashes, manifest authentication, assurance dimensions, timeline, and return roles. They do not approve a refund, adjudicate condition, authenticate an item, determine counterfeit status, establish custody, or override marketplace/payment/carrier policy.
