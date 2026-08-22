# PackProof scripted demonstration scenarios

These are rehearsal scripts, not product claims. PackProof inventories recorded facts. It does not decide who wins a dispute, authenticate an item, or assign fault.

Do not touch Firestore during a run. If something breaks, that is the defect.

## Demo A — Individual marketplace sale

1. Sign in as the seller.
2. Import a receipt and create the PackProof.
3. Invite the buyer. Confirm terms on both accounts.
4. Seller records packing and seal on the phone.
5. Add shipment.
6. Buyer records arrival and unboxing on the phone.
7. Complete the transaction.
8. Open Proof on Android and Portal. Same next action, same Proof identity.

## Demo B — Enterprise / API merchant

1. Create the transaction with the sandbox API (`POST /v1/transactions`).
2. Read `GET /v1/transactions/{id}/workspace`.
3. An employee performs only physical capture.
4. Poll workspace or receive the evidence-finalized webhook.
5. When Proof availability is `AVAILABLE`, `GET /proof` and export PDF.
6. Show the Enterprise console labeled **Enterprise Pilot — Observe Mode**.

## Demo C — Dispute investigation

Start from a completed Proof. Show:

- transaction terms
- commerce source and trust class
- packing, seal, shipment, and buyer evidence
- hash / finalization states
- timeline
- JSON and PDF

Then say: PackProof is not saying who wins. It is giving the decision-maker a standardized factual record.
