# Section 4 Completion Record — 2026-08-11

Section: Public Commerce-Context/Handoff API and PackProof Button Contract.

## Implemented

- Additive OpenAPI v1 public handoff operation with a publishable key, exact Origin, strict v1 item context, idempotency, stable error envelopes, bounded payload, and selective CORS.
- Public commerce application service with page-declared trust cap, same-origin product enforcement, field provenance, deterministic retry identity, short expiration, one-user claim, and consumer-plan quota preservation.
- Firestore adapter that atomically persists contexts, passport drafts, handoffs, transactions, state changes, token consumption, timeline events, and domain outbox events.
- Dedicated public-handoff signing secret and hash-only bearer-token storage.
- App-Check-protected authenticated redemption callable.
- Native review route, App Link/deep-link bridge, sign-in redirect preservation, and editable transaction-form hydration with a page-declared warning.
- Browser ES-module SDK with explicit-data, Product JSON-LD, and narrow Open Graph extraction; secret-free request behavior; popup/opener containment; reference custom-checkout integration; and cross-origin static-module headers.
- Integration provisioning support for publishable keys and exact button origins.
- Explicit Firestore client-deny rules for passport drafts and public handoffs.

## Current evidence

`SOURCE_CHECKED` gates passed on 2026-08-11:

- `npm run typecheck`
- `npm run lint`
- `npm --prefix functions run build`
- `npm run test:domain` — 28/28 tests
- `npm run test:application` — 6/6 tests
- `npm run test:api` — 13/13 tests, including HTTP and OpenAPI public-handoff checks
- `npm run test:sdk` — Connect HMAC, Product JSON-LD extraction, explicit overrides, publishable request, and no-Authorization checks
- `npm run test:api:functions` — Gen 2 export, both secret declarations, Hosting rewrite, and cross-origin SDK headers
- `npm run test:evidence-format`
- `npm run test:evidence-verifier`
- `npm run test:claims`
- `npm run test:billing`
- syntax checks for the provisioner, source SDK, and generated public SDK
- byte-identical SHA-256 check between source and generated public SDK
- `git diff --check` — clean except existing Windows line-ending warnings

`EMULATOR_CHECKED` gates passed on 2026-08-11:

- `npm run test:application:firestore` — 3/3 tests, including atomic Button issuance, redemption, token consumption, free-user replay, and second-account denial
- `npm run test:api:firestore` — 3/3 tests, including public HTTP-to-Firestore create and exact replay
- `npm run test:rules` — Firestore and Storage rule suite, including explicit draft/handoff client denials

The Firebase CLI reported that it was not authenticated while starting local emulators. The emulator processes and all named suites still completed successfully. This does not establish access to or configuration of any remote Firebase project.

Passing these gates establishes source and local-emulator behavior only. It does not establish a deployment, browser run on a real merchant domain, App Link association, mobile-device behavior, or live Firebase behavior.

## Known remaining boundaries

- `domainOutbox` events remain `PENDING`; there is no dispatcher in this section.
- Browser Origin is a useful embedding and CORS boundary, not merchant cryptographic authentication. Public handoffs therefore remain permanently `PAGE_DECLARED`.
- The current consumer active-transaction quota check follows the existing query-before-write behavior; a future quota-counter command can harden extremely concurrent claims.
- Production bot defense, monitoring, load testing, CSP integration guidance per merchant, sandbox deployment, and browser/device compatibility tests remain external proof gates.
- Merchant-authoritative order ingestion remains the separate server-to-server Connect/API path.
- The current legacy consumer draft is seller-initiated. The Button redeemer becomes the seller; a role-neutral buyer-initiated draft needs the later participant-claim migration rather than a misleading role assignment.
- Physical correspondence remains unavailable and production-disabled.
