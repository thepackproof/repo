# PackProof 0.8.5.0

PackProof is an Android application and Firebase backend for documenting high-value private and platform-originated transactions. It connects mutually confirmed terms, native packing/unboxing capture, return evidence, shipping-label context, exact-byte fingerprints, private evidence manifests, and presentation dossiers in one participant-restricted record.

PackProof is a documentation system. It does **not** authenticate an item or person, prove that a physical package is the same object seen earlier, establish uninterrupted custody, provide escrow or insurance, decide fraud, guarantee a dispute outcome, or promise that a carrier, marketplace, payment provider, insurer, court, or other third party will accept a record.

## Scientific and claim boundary

Version 0.8.5.0 implements the digital-evidence path described below. It deliberately reports physical correspondence as `NOT_AVAILABLE` because this repository contains no validated physical feature extractor, matcher, calibrated thresholds, or PackProof-specific blind validation corpus. Acquisition quality is `NOT_EVALUATED` until a versioned, calibrated quality gate exists.

The source includes:

- [`docs/WHITEPAPER_COMPLIANCE.md`](docs/WHITEPAPER_COMPLIANCE.md), which translates the 7 August 2026 technical white paper into release gates;
- [`docs/CLAIMS_REGISTER.json`](docs/CLAIMS_REGISTER.json), which records bounded, prohibited, research-only, and runtime-dependent claims;
- [`docs/EVIDENCE_FORMAT_V2.md`](docs/EVIDENCE_FORMAT_V2.md), which specifies canonicalization, hashing, bundle binding, manifest authentication, and layered assurance; and
- [`docs/architecture/ARCHITECTURE_CONTRACT.md`](docs/architecture/ARCHITECTURE_CONTRACT.md), which governs the incremental migration to one commerce, mobile, API, evidence, event, and integration core; and
- a production-source claim-language test (`npm run test:claims`).

These controls are not certification, scientific validation, a penetration test, laboratory accreditation, or a legal opinion.

## Current 0.8.5.0 candidate scope

- Removed the disabled Facebook integration's eager native import, which previously prevented the supplied Android build from reaching its startup UI.
- Added an explicit encrypted-queue state machine and retry-stable client evidence identity. Ciphertext is retained until the Firestore evidence record confirms server finalization.
- Upgraded PPQ1 offline containers to version 2, authenticating the magic/version/IV-length header as AES-GCM associated data while retaining version-1 decryption compatibility.
- Disabled Android application-data backup because queue ciphertext is bound to a non-exportable, installation-specific Android Keystore key.
- Published manifest schema 2, `PACKPROOF_JCS_1`, `PACKPROOF_EVIDENCE_BUNDLE_V2`, deterministic known-answer vectors, and an independent command-line verifier.
- Labeled manifest authentication as an HMAC service MAC with explicit key ID and `PACKPROOF_SERVICE_ONLY` scope—not a publicly verifiable digital signature.
- Added exact client/server byte-length comparison, media magic-byte inspection, declared/detected media-type comparison, and fail-closed workflow transitions for integrity mismatches.
- Split assurance into acquisition quality, app/device context, byte integrity, physical correspondence, carrier context, and business/legal relevance. Missing dimensions never collapse into one green verdict.
- Routed supporting PDFs through the same encrypted, idempotent queue as camera evidence.
- Changed PackProof Connect to emit `packproof.evidence.finalized`, bounded digital-evidence states, reason codes, layered assurance, and a freshly generated 15-minute dossier URL for each callback attempt.

## Architecture included

- Expo SDK 57 / React Native 0.86 Android client targeting API 36.
- Firebase Authentication, Firestore, Cloud Storage, Cloud Functions, Hosting, and App Check / Play Integrity.
- Default-deny database and object rules with participant-only reads and server-authoritative writes.
- One-use buyer invitations, mutually locked terms, and controlled transaction/return state machines.
- Continuous packing, unboxing, return-repacking, and return-unboxing capture.
- Android Keystore AES-256-GCM app-private offline queue with streaming SHA-256.
- Server-side authorization, exact-path upload grants, independent hashing, media sniffing, JCS manifest creation, and HMAC service authentication.
- Private native evidence and manifests plus separately labeled, source-linked PDF presentation dossiers.
- PackProof Connect order ingestion, idempotent handoff, exact-body webhook HMAC, and retry delivery.
- Contract-first PackProof Merchant API v1 foundation with scoped merchant credentials, organization-isolated transaction create/read/list, idempotency, rate controls, structured errors/logs, and hash-linked audit events. See [`docs/API_ARCHITECTURE.md`](docs/API_ARCHITECTURE.md).
- Google Play / RevenueCat subscription scaffolding and policy templates.

## Start here

Use Node 22 and Java 21. Expo Go is not supported because the application uses native Firebase modules and a custom Android Keystore module.

1. Read the authoritative [`agent.md`](agent.md) launch and demonstration execution plan, then the [`architecture governance index`](docs/architecture/README.md). Use [`PC_DEMO.md`](PC_DEMO.md) for a Windows launch and [`EXTERNAL_DEMO.md`](EXTERNAL_DEMO.md) for live-service staging only within the gate currently authorized by `agent.md`.
2. Run `npm ci` and `npm --prefix functions ci`.
3. Run `npm run configure`, then place the matching Firebase `google-services.json` beside `package.json`.
4. Configure `MANIFEST_SIGNING_SECRET` in Firebase Secret Manager and set a non-secret `MANIFEST_SIGNING_KEY_ID` in `functions/.env`.
5. Register the signed Android app with Firebase App Check / Play Integrity and configure Android App Links for the actual signing certificate.
6. Run every applicable automated and manual gate in [`docs/TEST_PLAN.md`](docs/TEST_PLAN.md).
7. Treat compilation, APK assembly, installation, and prior build reports as intermediate evidence. A release label depends on real-device startup, log inspection, and live-backend evidence finalization.

## Common commands

```powershell
npm.cmd run configure
npm.cmd run doctor
npm.cmd run typecheck
npm.cmd run lint
npm.cmd --prefix functions run build
npm.cmd run test:evidence-format
npm.cmd run test:evidence-verifier
npm.cmd run test:claims
npm.cmd run test:rules
npm.cmd run test:billing
npm.cmd run test:api
npm.cmd run test:api:firestore
npm.cmd run test:api:functions
npm.cmd run test:sdk
npm.cmd run verify:pc
npm.cmd run build:android:preview
```

## Evidence verification

Given an exported native manifest and original file:

```powershell
node tools/verify-evidence.mjs manifest.json original-file --expected-manifest-sha256 HEX --expected-bundle-sha256 HEX
```

The verifier checks canonical bytes, required format profiles, exact original-file SHA-256, the digest recorded in the manifest, and the v2 bundle binding. It cannot publicly prove PackProof service origin because HMAC verification requires the service secret. See [`docs/EVIDENCE_FORMAT_V2.md`](docs/EVIDENCE_FORMAT_V2.md).

## Deployment boundary

Source code cannot embed or prove owner credentials, approved OAuth applications, Play signing, App Check enforcement, deployed secrets, alerting, retention and legal-hold policy, regional controls, support/moderation operations, public DNS, marketplace/carrier agreements, independent security review, or scientific validation. Clear every launch placeholder and attach current deployment/runtime evidence before onboarding real customer evidence.

The supplied [`BUILD_REPORT.md`](BUILD_REPORT.md) and [`REMEDIATION_REPORT.md`](REMEDIATION_REPORT.md) are historical 0.2.1 records. They are not evidence that 0.8.5.0 is deployed or runtime-accepted.
