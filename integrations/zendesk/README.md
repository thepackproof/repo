# PackProof Zendesk app

Ticket-sidebar app that receives the live PackProof Proof (Passport) through PackProof API / Connect so a claims agent can review recorded facts without leaving Zendesk.

It is a presentation surface. It is not a second Proof implementation, not a Zendesk-hosted evidence store, and not a claim-decision engine.

Governing decision: [ADR 0016](../../docs/adr/0016-zendesk-claims-presentation-surface.md). Partner API: [`docs/PACKPROOF_API.md`](../../docs/PACKPROOF_API.md).

## What it does

On a Support ticket it:

1. Reads an order ID from a configured custom field, or a Proof / transaction / order identifier from the subject and description.
2. Calls PackProof Connect `GET /v1/connect/sessions?externalOrderId=…` with the merchant credential (Zendesk secure setting → Zendesk proxy).
3. When a `transactionId` is present, receives `GET /v1/transactions/{id}/proof` (Passport alias remains).
4. Renders that JSON: integrity banner, order/item, evidence inventory, expected ↔ observed comparisons, optional review overlay, and permanent limitations.
5. Can record those facts as an **internal** Zendesk note. It does not recommend approve/deny/refund.

If capture is still `PENDING_REDEMPTION`, or the transaction is `PASSPORT_NOT_READY`, the panel says the Proof is not available yet. It does not invent one.

## What it must not do

- Embed `pp_sandbox_` / `pp_live_` keys, webhook secrets, or other merchant credentials in the iframe
- Call Firestore or Cloud Storage
- Assemble a Proof in JavaScript
- File a card-network, PayPal, carrier, or marketplace claim
- Decide fraud, fault, authenticity, or any commercial or legal outcome

## Install (private app)

Required PackProof scopes: `transactions:read`, `evidence:read`. Bind the credential to the Connect integration if agents look up by commerce order ID.

1. If your API hostname is not already in `manifest.json` `domainWhitelist`, add it (hostname only, no `https://`) and keep this file in the zip.
2. Package:

```powershell
npm --prefix integrations/zendesk test
npm --prefix integrations/zendesk run package
```

3. In Zendesk Admin → Apps and integrations → Zendesk Support apps → Upload private app, upload `integrations/zendesk/dist/packproof-zendesk.zip`.
4. Settings:

| Setting | Value |
|---|---|
| PackProof API key | Merchant credential. Zendesk stores this as a secure setting; the iframe never sees it. |
| PackProof API host | Example `packproof-4cf53.web.app`. Must match a `domainWhitelist` entry. |
| Order ID ticket field | Optional numeric custom field ID. |
| Receiving framework | `GENERIC` (default), `VISA`, `MASTERCARD`, or `PAYPAL`. Fills Proof `reviewContext` only. |

Zendesk’s proxy must be able to reach the PackProof API over public HTTPS. The merchant key still authorizes every read; a ticket identifier does not grant access.

Secure settings do not work in `zcli apps:server`. Use a packaged private-app upload to exercise live lookup.

## Local tests

```powershell
npm --prefix integrations/zendesk test
```

Removing `integrations/zendesk/` must not affect mobile, `functions/`, or portal builds.
