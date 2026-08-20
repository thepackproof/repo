# PackProof Web Portal

Authenticated browser presentation surface over the canonical PackProof core. It is not a second backend, transaction system, Proof implementation, or an Expo-web port of the native evidence engine.

Governing decision: [ADR 0014](../docs/adr/0014-web-portal-presentation-surface.md). Product boundary: [WEB_PORTAL_V1](../docs/architecture/WEB_PORTAL_V1.md).

## What this package may do

- Sign in with Firebase Authentication and App Check
- Read Home, PackProofs, transaction workspace, timeline, evidence metadata, and Proof JSON through `/v1/portal`
- Hand packing/unboxing capture to the native app (QR / App Link / `packproof://`)

## What this package must not do

- Call Firestore or Cloud Storage from the browser
- Embed merchant API keys or other server secrets
- Assemble a Proof in JavaScript
- Treat a webcam or file upload as native PackProof capture
- Reinterpret transaction lifecycle independently of `shared/ux`

Removing `portal/` must not affect mobile or `functions/` builds.

## Local development

```powershell
copy portal\.env.example portal\.env.local
npm --prefix portal ci
npm --prefix portal run dev
```

Vite serves the SPA on `http://127.0.0.1:5173` and proxies `/v1` to the Firebase Hosting emulator (`http://127.0.0.1:5000`), which rewrites `/v1/**` to `packproofApi`. Same-origin production calls do not use CORS.

```powershell
npm --prefix portal run test
npm --prefix portal run build
```

Deploy uses the Firebase Hosting target `portal` (`app.thepackproof.com`). Apply site targets from `.firebaserc.example`.
