# ADR 0014: PackProof Web Portal is a presentation surface over the canonical core

- Status: Accepted
- Date: 2026-08-19

## Context

PackProof already has one domain and application-service core serving mobile callables, merchant REST, PackProof API, commerce adapters, reports, and webhooks ([ADR 0003](0003-one-core-multiple-transports.md), architecture contract). A browser product is a legitimate additional transport. It is not a second backend, transaction system, Passport implementation, or a React Native Web build of the native evidence engine.

The Expo tree technically has web support, but it also binds Firebase native, Android Keystore, camera, App Check / Play Integrity, RevenueCat, and other device-only capabilities. Shipping that bundle as “the portal” would mix native evidence acquisition with a desktop presentation surface.

PackProof API credentials are server-side secrets. Browser and mobile bundles must not embed merchant secrets, API credentials, webhook secrets, signing secrets, or unrestricted bearer tokens.

## Decision

PackProof Web Portal is a browser presentation and interaction surface over the canonical PackProof domain and application-service core. It may introduce browser-specific authentication, rendering, navigation, and transport adapters. It may not introduce independent transaction, evidence, Passport, provenance, assurance, or workflow semantics.

```text
presentation (portal SPA, mobile, reports)
        -> transport adapters (/v1/portal, callables, merchant REST, Connect)
        -> application services
        -> domain / ports
        -> Firebase and crypto infrastructure
```

### Layout and delivery

- The portal lives in `portal/` as a sibling React 19 + TypeScript + Vite SPA. It is not an Expo web target and not an npm-workspace conversion of the repository.
- The portal builds and deploys independently. Removing `portal/` must have zero effect on mobile or backend builds.
- Hosting uses a dedicated Firebase Hosting target (`portal`) on `app.thepackproof.com`. `thepackproof.com` remains the public/marketing site. `/v1/**` remains the existing PackProof API rewrite. `packproof.link` remains the existing handoff/deep-link system. Existing PackProof links and Passport IDs are not rewritten for the portal.

### Authentication

Browser callers authenticate as `PortalPrincipal`:

```text
Firebase Web Authentication + Firebase Web App Check
  -> server-side PackProof actor resolution
  -> resource authorization
  -> organization membership/scopes when that resource is activated
  -> existing application services
```

Merchant API keys are forbidden in the browser. A transaction ID, Passport URL, email, marketplace username, or organization ID does not grant access.

Legitimate principal classes are therefore:

- `ParticipantPrincipal` (`PACKPROOF_USER`) — native/participant claim and capture transports
- `MerchantApiPrincipal` (`MERCHANT_API_CLIENT`) — server-side merchant API
- `PortalPrincipal` (`PORTAL_USER`, `channel: WEB_PORTAL`) — authenticated browser portal

Different authentication mechanisms; the same domain.

### Portal HTTP facade

`/v1/portal/**` is a transport adapter: authenticate, resolve actor, authorize resource, invoke application service, map canonical DTO, respond. It does not own workflow policy.

Portal components never query Firestore collections or Cloud Storage object paths. Native Storage locations are never exposed; authorized media is streamed or issued as tightly scoped, short-lived access.

Mutations retain actor, `channel: WEB_PORTAL`, request ID, idempotency key, resource, organization where applicable, server time, and event.

### Passport and Next Action

JSON Passport remains the canonical representation. The portal renders `PackProofPassportV1`; it does not assemble a Passport in JavaScript. Mobile Passport = Web Passport = PDF Passport = the same PackProof record.

The Next Action Engine is shared, platform-neutral code under `shared/ux`. Screens must not independently reinterpret backend states. Capture-class actions on web hand off to the native client (QR / App Link / `packproof://`). Browser capture is not equivalent to native capture in this activation. A future browser acquisition source would need its own assurance profile.

### Organization membership

The canonical catalog already has organizations, integrations, and API clients. Those are not a human membership database. Slice G requires an explicit `organization_membership` resource (`membership_...`, actor, role, scopes, status). Custom claims, API clients, and merchant references are not the permanent authorization database. This ADR records that decision; membership persistence and portal organization workspace remain inactive until Slice G.

### Deliberate non-goals

Do not: build a second Passport database; invent browser-specific transaction states; write raw Firestore from the web app; expose API client secrets to the browser; recreate evidence finalization in JavaScript; let browser uploads masquerade as native capture; create a separate claims evidence format; recreate mobile workflow decisions independently on web; turn Enterprise into an alternate backend; convert the repository into a monorepo before a portal screen ships.

## Consequences

- Portal Slice A–B vertical slice (foundation, home/library, transaction workspace, Passport render, native handoff) is the immediate activation. Merchant dashboards, analytics, integrations, and claims tooling wait.
- Shared packages `@packproof/contracts`, `@packproof/ux`, and `@packproof/brand` may be extracted later. This ADR does not authorize an npm-workspace migration. `shared/ux` is the first pure extract.
- Organization membership is catalogued as a canonical resource with no live persistence or API in this slice.
- Activation is `SOURCE_CHECKED` through domain, application, API, portal build, and Hosting configuration tests. It is not a deployed-environment, E2E browser, or device claim until Slice J evidence exists.
