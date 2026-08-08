# PackProof

PackProof is a production-oriented Android application and Firebase backend for documenting high-value private and platform-originated transactions. It connects locked transaction terms, continuous packing/unboxing evidence, return evidence, shipping-label context, server-computed hashes, signed forensic manifests and exportable dossiers in one private record.

PackProof deliberately **does not** authenticate items, provide escrow, move sale funds, insure shipments or decide disputes.

## What is new in 0.2.1

- Android Keystore-backed AES-256-GCM offline evidence queue with streaming SHA-256 and reconnect synchronization.
- Symmetric Return Passports for authorized return repacking, return shipment and returned-item unboxing.
- Just-in-time Firebase App Check / Play Integrity refresh at the record action, a server nonce receipt and an Android Keystore ECDSA challenge signature.
- Canonical forensic manifests with runtime metadata fingerprint, final-three-second sensor statistics, network telemetry, optional location and camera barcode context.
- Server-computed file, manifest and evidence-bundle SHA-256 values plus server HMAC authentication.
- PackProof Connect: idempotent order API, universal/deep-link handoff, locked order context, signed webhook callbacks, retry delivery, OpenAPI definition and JavaScript SDK.

## Start here

No Android Studio is required for the recommended EAS cloud-build path. For a repeatable Windows launch, start with [`PC_DEMO.md`](PC_DEMO.md); for the complete real-service setup, follow [`EXTERNAL_DEMO.md`](EXTERNAL_DEMO.md). These paths build the native application against live staging services and do not substitute mock uploads or a demo database.

1. Read [`PC_DEMO.md`](PC_DEMO.md) and [`EXTERNAL_DEMO.md`](EXTERNAL_DEMO.md); use [`SETUP_WIZARD.md`](SETUP_WIZARD.md) for the longer production-launch checklist.
2. Use Node 22 and run `npm ci` plus `npm --prefix functions ci`.
3. Run `npm run configure` and provide the requested service values.
4. Place Firebase `google-services.json` in this folder.
5. Configure `MANIFEST_SIGNING_SECRET`, App Check and the PackProof Connect link domain as described below.
6. Run `npm run sync:eas`, then `npm run doctor`.
7. Build, deploy and execute [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md) before onboarding real evidence.

## Included architecture

- Expo SDK 57 / React Native 0.86 Android client targeting API 36.
- Firebase Authentication, Firestore, Storage, Cloud Functions and App Check with Play Integrity.
- Server-authoritative state changes and default-deny security rules.
- One-use buyer invitations and mutual locked terms.
- Continuous packing, unboxing, return-repacking and return-unboxing capture.
- Encrypted offline queue under app-private storage.
- Server-side validation, timestamps, SHA-256 fingerprints and signed manifests.
- PackProof Connect order ingestion and signed callback framework.
- Private shipment tracking context, reports, blocking, notifications and account export.
- PDF forensic evidence dossier generation.
- Google Play/RevenueCat subscription scaffolding and policy templates.

## Required 0.2.1 deployment configuration

```bash
npx firebase-tools@15.25.1 functions:secrets:set MANIFEST_SIGNING_SECRET
```

`npm run configure` writes `CONNECT_LINK_BASE_URL`, `PUBLIC_APP_URL`, and `TIKTOK_REDIRECT_URI` into the ignored `functions/.env` file used by Firebase deployment. Use a high-entropy, independently generated manifest secret. Register the Android app with Firebase App Check / Play Integrity, enable enforcement after internal testing, and publish Android App Links association data for the configured domain. See:

- [`docs/OFFLINE_EVIDENCE.md`](docs/OFFLINE_EVIDENCE.md)
- [`docs/RETURN_PASSPORT.md`](docs/RETURN_PASSPORT.md)
- [`docs/FORENSIC_MANIFEST.md`](docs/FORENSIC_MANIFEST.md)
- [`docs/PACKPROOF_CONNECT.md`](docs/PACKPROOF_CONNECT.md)

## Common commands

```bash
npm run configure
npm run sync:eas
npm run doctor
npm run demo:pc -- check
npm run verify:pc
npm run generate:assetlinks
npm run typecheck
npm --prefix functions run build
npm run test:rules
npm run test:billing
npm run test:sdk
npm run build:android:preview
npm run build:android:production
npm run submit:android
```

## Launch boundary

Third-party credentials, approved OAuth apps, Play Console products, final legal identity, support operations, retention policy, production DNS and marketplace/carrier agreements cannot be embedded in this source handoff. Clear every setup placeholder, complete real-device and emulator testing, and obtain independent legal/security review before public production use.

See [`REMEDIATION_REPORT.md`](REMEDIATION_REPORT.md) for the 0.2.0-to-0.2.1 correction summary.
