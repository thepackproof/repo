# ADR 0016: Zendesk Support is a claims-review presentation surface over PackProof API

- Status: Accepted
- Date: 2026-08-20

## Context

PackProof already exposes a canonical Proof (Passport) JSON projection and a claims-review package on the merchant/Connect API ([ADR 0014](0014-web-portal-presentation-surface.md), [ADR 0015](0015-proof-is-the-passport.md), [`PACKPROOF_API.md`](../PACKPROOF_API.md)). Claims and dispute work often starts in Zendesk, not in the PackProof portal. Agents currently leave Zendesk, hunt for an order ID, and reconstruct context by hand.

Merchant API keys are server-side secrets. A Zendesk iframe is a browser surface. Putting `pp_sandbox_` / `pp_live_` material in the app bundle, or creating a second Proof store inside Zendesk, would violate the existing credential and Passport boundaries.

Zendesk Apps Framework v2 can proxy HTTPS requests and inject **secure settings** outside the browser. That is sufficient to call PackProof API without a new PackProof principal class.

## Decision

The PackProof Zendesk app is a Support ticket-sidebar presentation surface over PackProof API / Connect. It receives the live Proof JSON for an order-bound Connect session or merchant transaction and renders it for authorized human review. It may write an internal ticket note that quotes those facts.

```text
Zendesk ticket sidebar (iframe)
  -> ZAF client.request (secure setting + Zendesk proxy)
  -> PackProof API /v1/connect/sessions and /v1/transactions/{id}/proof
  -> existing merchant application services
  -> canonical Proof (Passport) projection
```

### Layout and credentials

- The app lives in `integrations/zendesk/` as a private ZAF v2 app. Removing that directory must not affect mobile, Functions, or portal builds.
- The merchant API key is a Zendesk secure parameter (`{{setting.api_key}}`) with header scope. The iframe never reads it. CORS-mode requests are forbidden for PackProof calls.
- `domainWhitelist` lists PackProof API hosts. A private installer whose host is missing must add it to the manifest before packaging. The app does not embed a PackProof origin secret.
- Ticket identifiers, requester email, and Zendesk user identity do not grant PackProof access. Organization isolation remains the merchant credential’s organization.

### Lookup

Primary path: commerce `externalOrderId` → `GET /v1/connect/sessions?externalOrderId=` → `transactionId` → `GET /v1/transactions/{transactionId}/proof`. Direct Proof IDs (`ppt_…`, `PP-…`) and `txn_…` IDs are accepted. `merchantReference` is a fallback when no Connect session exists.

`PASSPORT_NOT_READY` and unredeemed Connect sessions are displayed as “Proof is not available yet.” The app must not emit an empty or inauthentic Proof.

Optional `framework` / `category` query parameters fill Proof `reviewContext` from Zendesk tags/subject and an install-time receiving framework. That overlay is a filing label only.

### Deliberate non-goals

Do not: add a Zendesk-specific Proof schema; store native evidence in Zendesk; put merchant keys in the iframe; authenticate as `PortalPrincipal` from Zendesk; receive `packproof.evidence.finalized` inside the app (the iframe cannot host a webhook); auto-approve, auto-deny, or recommend a refund; file a card-network or PayPal claim; treat Zendesk comments as capture evidence.

## Consequences

- Time-to-Proof for a claims agent becomes one ticket-sidebar lookup plus an optional internal note.
- Webhook-to-Zendesk ticket updates remain a merchant-server concern using the existing Connect callback, not this app.
- A later signed-URL / PackProof-hosted Zendesk app would need a new principal and ADR; this decision uses the Zendesk proxy instead.
