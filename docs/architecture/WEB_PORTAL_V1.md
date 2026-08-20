# PackProof Web Portal v1

Status: `SOURCE_CHECKED` foundation slice on 2026-08-19. This is not a deployed `app.thepackproof.com` claim, not browser-capture activation, and not an organization-workspace product.

Governing decision: [ADR 0014](../adr/0014-web-portal-presentation-surface.md).

## Boundary

The portal is a browser presentation surface over the existing PackProof core. Commands such as retrieve Passport, list the actor's transactions, or start native capture reach the same application services used by other transports.

```text
PORTAL COMPONENT
      -> Portal client / query layer
      -> PackProof /v1/portal transport
      -> Application service
      -> Domain / repository port
      -> Firebase infrastructure
```

Forbidden: React → Firestore; React → Storage object path; React → duplicated lifecycle logic; browser → merchant API key.

## Current activation

| Surface | Status |
|---|---|
| `portal/` React 19 + Vite SPA | Source present; independent `npm --prefix portal run build` |
| Firebase Hosting target `portal` | Configured in `firebase.json`; site/DNS apply is operational |
| `PortalPrincipal` + `/v1/portal/**` | Application + HTTP tests |
| Home / PackProofs / transaction workspace / Passport JSON renderer / native handoff | Slice A–C source |
| Browser evidence acquisition | Not authorized |
| Organization membership persistence / merchant workspace | Catalogued only; Slice G |
| Reviewer/claims and Enterprise portal modules | Later slices |
| E2E browser, CSP production proof, live App Check | Slice J |

## Independent delivery

```powershell
npm --prefix portal ci
npm --prefix portal run build
npm --prefix functions run test:api
npm run test:ux-flow
```

Removing `portal/` must not break mobile or `functions/` builds. Root Expo scripts do not compile the portal.

## Hosting

| Host | Role |
|---|---|
| `thepackproof.com` | Existing public/marketing Hosting target `public` |
| `app.thepackproof.com` | Portal Hosting target `portal` |
| `/v1/**` | Existing `packproofApi` rewrite (also on the portal site so the SPA can call same-origin `/v1`) |
| `packproof.link/...` | Existing handoff/deep-link system, unchanged |

Apply targets once per Firebase project (`.firebaserc` is local):

```powershell
npx --yes firebase-tools@15.25.1 hosting:sites:create packproof-portal
npx --yes firebase-tools@15.25.1 target:apply hosting public YOUR_DEFAULT_SITE
npx --yes firebase-tools@15.25.1 target:apply hosting portal packproof-portal
```

See `.firebaserc.example`.

## Auth

The portal sends a Firebase ID token and App Check token. The server resolves `PORTAL_USER` / `WEB_PORTAL`, checks account status, then authorizes each resource. Functions emulator skips App Check cryptographic verification but still requires the header so clients stay honest about the production shape.

A transaction ID, Passport URL, email, marketplace username, or organization ID does not grant access.

## First vertical slice

```text
app.thepackproof.com
  -> sign in
  -> Home (What needs you?)
  -> PackProofs
  -> Transaction workspace (Activity / Evidence metadata / Passport JSON)
  -> Continue on phone (QR + App Link)
```

After native capture finalizes, the portal refetches the same PackProof record. Browser capture is not authorized in this slice.

Portal mutations record `channel: WEB_PORTAL` with actor, request ID, resource, organization where applicable, server time, and event.

## Local Vite

`npm --prefix portal run dev` proxies `/v1` to the Hosting emulator on port 5000 (`public` target), which already rewrites `/v1/**` to `packproofApi`. Production portal Hosting uses the same rewrite on `app.thepackproof.com`, so the SPA stays same-origin and does not need CORS.

