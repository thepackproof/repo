# ADR 0017: Salesforce Service Cloud is a claims-review presentation surface over PackProof API

- Status: Accepted
- Date: 2026-08-21

## Context

PackProof already exposes a canonical Proof (Passport) JSON projection and a claims-review package on the merchant/Connect API ([ADR 0014](0014-web-portal-presentation-surface.md), [ADR 0015](0015-proof-is-the-passport.md), [ADR 0016](0016-zendesk-claims-presentation-surface.md), [`PACKPROOF_API.md`](../PACKPROOF_API.md)). Many merchants work dispute tickets in Salesforce Service Cloud Cases, not in Zendesk or the PackProof portal. Agents currently leave Salesforce, hunt for an order ID, and reconstruct context by hand.

Merchant API keys are server-side secrets. A Lightning Web Component is a browser surface. Putting `pp_sandbox_` / `pp_live_` material in the LWC bundle, or creating a second Proof store inside Salesforce, would violate the existing credential and Passport boundaries.

Salesforce Named Credentials with an External Credential principal can inject the merchant bearer token on Apex callouts. That is sufficient to call PackProof API without a new PackProof principal class.

## Decision

The PackProof Salesforce app is a Service Cloud Case-record presentation surface over PackProof API / Connect. It receives the live Proof JSON for an order-bound Connect session or merchant transaction and renders it for authorized human review. It may write an internal Case note that quotes those facts.

```text
Salesforce Case record page (LWC)
  -> Apex PackProofController (with sharing)
  -> Named Credential PackProof_API + External Credential principal
  -> PackProof API /v1/connect/sessions and /v1/transactions/{id}/proof
  -> existing merchant application services
  -> canonical Proof (Passport) projection
```

### Layout and credentials

- The app lives in `integrations/salesforce/` as an unpackaged Salesforce DX source tree. Removing that directory must not affect mobile, Functions, portal, or Zendesk builds.
- The merchant API key is an External Credential Named Principal (`api_key`). Apex references only the merge field `{!$Credential.PackProof_API.api_key}`. The LWC never reads it and never issues CORS requests to PackProof.
- The Named Credential URL is the PackProof API origin. A private installer whose host differs from the default must edit that URL in Setup. The app does not embed a PackProof origin secret.
- Case identifiers, Contact email, and Salesforce user identity do not grant PackProof access. Organization isolation remains the merchant credential’s organization.

### Lookup

Primary path: commerce `externalOrderId` → `GET /v1/connect/sessions?externalOrderId=` → `transactionId` → `GET /v1/transactions/{transactionId}/proof`. Direct Proof IDs (`ppt_…`, `PP-…`) and `txn_…` IDs are accepted. `merchantReference` is a fallback when no Connect session exists.

`PASSPORT_NOT_READY` and unredeemed Connect sessions are displayed as “Proof is not available yet.” The app must not emit an empty or inauthentic Proof.

Optional `framework` / `category` query parameters fill Proof `reviewContext` from Case subject/description/type/reason and an install-time receiving framework. That overlay is a filing label only.

### Deliberate non-goals

Do not: add a Salesforce-specific Proof schema; store native evidence in Salesforce; put merchant keys in the LWC; authenticate as `PortalPrincipal` from Salesforce; receive `packproof.evidence.finalized` inside the app (Connect callbacks remain a merchant-server concern); auto-approve, auto-deny, or recommend a refund; file a card-network or PayPal claim; treat Case comments as capture evidence; call Firestore or Cloud Storage.

## Consequences

- Time-to-Proof for a claims agent becomes one Case-page lookup plus an optional internal note.
- Webhook-to-Case updates remain a merchant-server concern using the existing Connect callback, not this app.
- A later signed-URL / PackProof-hosted Canvas app would need a new principal and ADR; this decision uses Salesforce Named Credentials instead.
