# Symmetric Return Passport

A Return Passport creates a separate, participant-visible evidence lifecycle for authorized returns instead of overwriting the outbound shipment record.

## State flow

`REQUESTED → AUTHORIZED → PACKED → IN_TRANSIT → RECEIVED_REVIEW → COMPLETED`

Either transaction participant may request a return when the locked return terms allow it, or while the transaction is disputed. The other participant must authorize the request. The buyer is the physical returning participant and records a continuous return-repacking video before return shipment can be submitted, regardless of which participant originally requested the return. The recipient can record a continuous returned-item unboxing video or mark the return received, and both participants independently confirm completion.

## Evidence linkage

At request time, the server snapshots every existing server-verified evidence SHA-256 into `originalEvidenceHashes`. New return evidence includes a `returnPassportId` in its upload grant, signed manifest, evidence record and timeline event. Return evidence types are:

- `RETURN_CONDITION_PHOTO`
- `RETURN_PACKING_VIDEO`
- `RETURN_SHIPPING_LABEL`
- `RETURN_UNBOXING_VIDEO`

The barcode observed during return repacking is sealed into the original manifest. When the returning participant later submits the carrier tracking number, the server performs a separate reproducible comparison against that already-signed barcode. The later value and result are stored as post-capture audit fields; they are not misrepresented as part of the original signed capture. A mismatch is retained and flagged for review; it is never silently corrected.

## Product boundary

A Return Passport documents what participants captured and confirmed. It does not approve a refund, adjudicate condition, authenticate an item, determine counterfeit status or override marketplace return policy.
