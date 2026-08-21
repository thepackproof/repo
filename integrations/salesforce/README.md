# PackProof Salesforce app

Case-record component that receives the live PackProof Proof (Passport) through PackProof API / Connect so a claims agent can review recorded facts without leaving Salesforce Service Cloud.

It is a presentation surface. It is not a second Proof implementation, not a Salesforce-hosted evidence store, and not a claim-decision engine.

Governing decision: [ADR 0017](../../docs/adr/0017-salesforce-claims-presentation-surface.md). Partner API: [`docs/PACKPROOF_API.md`](../../docs/PACKPROOF_API.md).

## What it does

On a Case it:

1. Reads an order ID from `PackProof_Order_Id__c` (or another configured Case field), or a Proof / transaction / order identifier from Subject, Description, Type, and Reason.
2. Calls PackProof Connect `GET /v1/connect/sessions?externalOrderId=…` with the merchant credential (External Credential principal → Apex Named Credential callout).
3. When a `transactionId` is present, receives `GET /v1/transactions/{id}/proof` (Passport alias remains).
4. Renders that JSON: integrity banner, order/item, evidence inventory, expected ↔ observed comparisons, optional review overlay, and permanent limitations.
5. Can record those facts as an **internal** Case note (Chatter `InternalUsers`, or a private Case comment if Chatter is off). It does not recommend approve/deny/refund.

If capture is still `PENDING_REDEMPTION`, or the transaction is `PASSPORT_NOT_READY`, the panel says the Proof is not available yet. It does not invent one.

## What it must not do

- Embed `pp_sandbox_` / `pp_live_` keys, webhook secrets, or other merchant credentials in the LWC
- Call Firestore or Cloud Storage
- Assemble a Proof in JavaScript or Apex
- File a card-network, PayPal, carrier, or marketplace claim
- Decide fraud, fault, authenticity, or any commercial or legal outcome
- Treat Salesforce user identity, Contact email, or a Case identifier as PackProof authority

## Install (source deploy)

Required PackProof scopes: `transactions:read`, `evidence:read`. Bind the credential to the Connect integration if agents look up by commerce order ID.

1. Authenticate Salesforce CLI against the Service Cloud org.

```powershell
sf org login web --alias packproof-claims
```

2. Deploy this directory:

```powershell
npm --prefix integrations/salesforce test
sf project deploy start --source-dir integrations/salesforce/force-app --target-org packproof-claims
```

3. In Setup → Named Credentials → External Credentials → **PackProof API** → Principal **Merchant**, set authentication parameter `api_key` to the merchant credential (`pp_sandbox_…` or `pp_live_…`). Salesforce stores it encrypted; the LWC never sees it.
4. If your PackProof API hostname is not `packproof-4cf53.web.app`, edit Named Credential **PackProof API** URL to `https://YOUR_HOST` (HTTPS only).
5. Assign permission set **PackProof Claims Review** to claims agents.
6. Lightning App Builder → Case Record Page → add **PackProof Proof** to the sidebar.
7. Optional: Custom Metadata **PackProof Config / Default**
   - `Order_Id_Field__c` — Case field API name if you already store the order ID somewhere other than `PackProof_Order_Id__c`
   - `Receiving_Framework__c` — `GENERIC` (default), `VISA`, `MASTERCARD`, or `PAYPAL`. Fills Proof `reviewContext` only.

Salesforce must be able to reach the PackProof API over public HTTPS. The merchant key still authorizes every read; a Case identifier does not grant access.

Connect callbacks (`packproof.evidence.finalized`) stay on the merchant server. This app does not host a webhook.

## Local tests

```powershell
npm --prefix integrations/salesforce test
```

Apex tests (`PackProofCalloutTest`, `PackProofControllerTest`) run in the org after deploy:

```powershell
sf apex run test --tests PackProofCalloutTest,PackProofControllerTest --synchronous --target-org packproof-claims
```

Removing `integrations/salesforce/` must not affect mobile, `functions/`, portal, or Zendesk builds.
