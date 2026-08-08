# PackProof 0.2.1 review and validation report

Reviewed on August 6, 2026 from a clean extraction of `PackProof-Android-Full-Stack-v0.2.1-External-Demo-Ready.zip` (SHA-256 `EF070E665B8EC58575180FE5E2FED322A788FA49194D967A594EE8CA187FCB7E`).

## Material archive defect repaired

The supplied ZIP advertised an Android Keystore secure-file module, and `scripts/doctor.mjs` required it, but the archive contained only the module's TypeScript wrapper and Expo manifest. Its `android/build.gradle` and `PackProofSecureFileModule.kt` were absent. As supplied, the production native build and every camera/offline-evidence path depending on encryption, streaming hashing, decryption, deletion, or ECDSA nonce signing were not functional.

The Android module has been restored and hardened with:

- Android Keystore AES-256-GCM under the existing `packproof_offline_evidence_v1` alias.
- Backward-compatible PPQ1 version-1 containers.
- Streaming encryption, decryption, and SHA-256 without loading evidence files into JavaScript memory.
- Authenticated decryption into an unreferenced private temporary file, followed by a committed replacement only after GCM tag verification.
- Private-storage path enforcement and durable temporary-file writes.
- Android Keystore P-256 / SHA256withECDSA capture-nonce signing and hardware-backed-key reporting.
- Complete Expo Android-library metadata, including the version fields required by Expo's Gradle plugin.

## Passed local gates

- Root `npm ci` and Functions `npm ci` completed from the supplied lockfiles.
- Mobile `npm run typecheck` passed.
- Expo `npm run lint` passed.
- Expo Doctor passed all 20 checks.
- Functions TypeScript build and no-emit lint passed.
- Firestore and Storage emulator rule tests passed with JDK 21 and the pinned Firebase CLI.
- RevenueCat idempotency structure, out-of-order reduction, entitlement isolation, expiration, transfer, and invalid-payload tests passed.
- PackProof Connect SDK request/error handling and exact-body HMAC positive/tamper/expiry tests passed.
- Clean Expo Android prebuild completed with a disposable, non-live Firebase descriptor.
- Expo autolinking found `packproof-secure-file` 1.0.0 under the expected Kotlin class name.
- The secure-file module compiled against Android API 36, Kotlin 2.2.20, and Expo SDK 57.
- A complete x86_64 debug APK assembled successfully from a short nonsynchronized Windows path, exercising the Hermes bundle and full native dependency graph. The disposable validation Firebase descriptor was used only for build proof; that APK is not a functional staging deliverable.

## PC launch corrections

- Added `PC_DEMO.md` with an explicit real-staging, install, source-start, rehearsal, and troubleshooting path.
- Added `npm run demo:pc -- check`, `start`, and `install` helpers with Node/configuration/ADB/device checks.
- Added `npm run verify:pc` for deterministic local release gates.
- Documented JDK 21+ for the current Firebase emulator tooling and the Windows short-path requirement for local CMake/Ninja builds.
- Updated the PackProof Connect JavaScript package version to 0.2.1 and added a reproducible SDK smoke test.
- Corrected RevenueCat lifecycle ordering by its required event timestamp, added deterministic equal-timestamp precedence, isolated PackProof's `pro` entitlement from unrelated products, expired delayed lifecycle events safely, and accepted transfer payloads that legitimately omit `app_user_id`.

## Dependency audit status

- Root audit reports 20 moderate transitive advisories and no high or critical advisories. They are in the Expo/build-tool dependency graph; the available forced remediation changes supported major versions.
- Functions audit reports 7 moderate transitive advisories and no high or critical advisories. They are in the current Firebase Admin/Google Cloud dependency chain; npm proposes incompatible direct-package downgrades as the forced fix.
- No forced audit changes were applied because they would move the application off its declared Expo/Firebase compatibility set.

## What source-only validation cannot prove

Owner credentials and external services are still required for a genuine feature-complete acceptance run. This review did not claim live proof of EAS signing, Firebase deployment, Google/Facebook/TikTok provider approval, Play Integrity verdicts, Android Keystore behavior on physical hardware, Trigger Email delivery, RevenueCat purchases, Play subscription lifecycle, Android App Links verification, public DNS, marketplace callbacks, or the two-device transaction/return journeys.

Those are release acceptance gates, not source files. Complete `EXTERNAL_DEMO.md`, use `PC_DEMO.md` for the repeatable launch, and execute every applicable row in `docs/TEST_PLAN.md` against the signed staging/Play build before representing the environment as fully accepted.

The included emulator suite is a focused regression set for participant isolation, server-authoritative transaction writes, public-profile authentication, one-use/typed/unexpired Storage upload grants, immutable uploads, and participant-only evidence reads. It is not exhaustive branch coverage of every Firestore and Storage rule, so the staging acceptance matrix remains mandatory.
