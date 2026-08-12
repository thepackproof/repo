# PackProof real PC demonstration

This is the shortest repeatable path for demonstrating the real PackProof application from a Windows PC. It does not introduce mock users, fake uploads, a demo database, or client-side substitutes for Firebase Functions. The PC drives an Android device or emulator; PackProof itself remains a native Android application.

## Know the boundary

- The source is complete enough to build the Android client and deploy the Firebase backend, but owner-specific Firebase, Expo, Google OAuth, signing, DNS, App Check, email, social-provider, and billing credentials cannot be embedded in a distributable archive.
- A feature-complete core transaction demonstration uses a real staging Firebase project and at least two real identities. A full integration demonstration also requires approved Facebook/TikTok applications, RevenueCat/Google Play products, transactional email, a Connect integration, and the relevant secrets.
- Expo Go and the web target cannot demonstrate PackProof. The application depends on React Native Firebase, Play Integrity, Android Keystore encryption, native camera capture, and the local secure-file module.
- A Play internal-test build is required for the strongest Play Integrity and real Google Play Billing path. An EAS preview APK is still the real application against live services, but sideload distribution changes Play trust and billing behavior.

## Supported PC toolchain

- Node.js 22 (the Functions runtime and root package both declare Node 22).
- JDK 21 or newer for the current pinned Firebase Emulator Suite and local Android builds.
- Android SDK Platform-Tools (`adb`) to install/open an APK or address a connected emulator/device.
- For local Gradle builds only: Android SDK Platform 36, Build Tools 36.0.0, NDK 27.1.12297006, and CMake 3.22.1. EAS installs these in its builder, so Android Studio is not required for the recommended cloud-build path.

On Windows, keep a local Gradle build in a short, nonsynchronized path such as `C:\src\packproof`. Deep OneDrive paths can exceed CMake/Ninja object-path limits. Source checks and EAS cloud builds may still be run from OneDrive.

## One-time real staging setup

1. Open PowerShell in this folder and confirm Node 22 is active:

   ```powershell
   node --version
   npm.cmd --version
   ```

2. Install exactly from the lockfiles:

   ```powershell
   npm.cmd ci
   npm.cmd --prefix functions ci
   ```

3. Follow `EXTERNAL_DEMO.md` through service configuration, secret creation, Firebase deployment, App Check registration, and the first EAS build. At minimum this produces the ignored local files `.env`, `.firebaserc`, `functions/.env`, and the real Firebase `google-services.json`.

4. Run the PC-oriented preflight:

   ```powershell
   npm.cmd run demo:pc -- check
   ```

5. Run all deterministic local gates. JDK 21+ is required because this includes Firestore and Storage emulator tests:

   ```powershell
   npm.cmd run verify:pc
   npm.cmd run doctor
   ```

6. Build the installable real staging APK:

   ```powershell
   npm.cmd run build:android:preview
   ```

   Use `npm.cmd run build:android:production` and Play internal testing when the demonstration includes production Play Integrity labels or real subscription purchases.

## Repeatable demonstration-day launch

Connect one authorized Android device with USB debugging enabled, or start one Android emulator. Confirm it appears as `device` (not `offline` or `unauthorized`):

```powershell
adb devices
```

Install and open a previously built, real staging APK:

```powershell
npm.cmd run demo:pc -- install C:\path\to\packproof-preview.apk
```

If the configured package name is not available in the local `.env`, pass it explicitly:

```powershell
npm.cmd run demo:pc -- install C:\path\to\packproof-preview.apk com.yourcompany.packproof
```

For source-driven UI work, first install an EAS development-client build created from the same configuration. Then run:

```powershell
npm.cmd run demo:pc -- start
```

That command checks the live configuration and connected Android target before starting Metro and opening the development client.

## Fast real rehearsal

Use two staging identities and preferably two Android devices. Rehearse this exact path before the meeting:

1. Seller signs in, creates a shipped PackProof, saves exact item/condition/return terms, and invites the buyer.
2. Buyer redeems the one-use link; both identities confirm the same terms.
3. Seller records one continuous packing video. Show the encrypted queue status and wait for the server-finalized record, exact-byte checks, manifest and bundle hashes, and six separately reported assurance dimensions.
4. Seller adds tracking; buyer records continuous unboxing and both complete the transaction.
5. Generate and open the PDF evidence packet.
6. Start, authorize, pack, ship, receive, and complete a Return Passport if returns are in the meeting scope.
7. For Connect, provision a staging integration, create the same idempotent order twice, redeem the universal link, capture packing evidence, and verify the exact-body HMAC on the layered `packproof.evidence.finalized` callback with the SDK.
8. If billing or optional identity providers are in scope, use the Play internal-test build and preapproved provider test accounts. Do not enable controls backed by placeholder credentials.

`docs/TEST_PLAN.md` remains the release acceptance matrix. The commands above verify builds, types, rules, and SDK behavior; they do not replace real-device, two-identity, App Check, provider, billing, email, or webhook acceptance tests.

## Troubleshooting

- `firebase-tools no longer supports Java version before 21`: install a full JDK 21+ and ensure both `java -version` and `javac -version` resolve to it.
- `build.ninja still dirty after 100 tries` or CMake object-path warnings: copy the project to a short non-OneDrive path, reinstall from the lockfiles, prebuild again, and retry.
- `adb` shows `unauthorized`: unlock the Android device and accept the USB debugging prompt.
- `npm.ps1 cannot be loaded because running scripts is disabled`: use `npm.cmd` and `npx.cmd`, as shown above; changing the machine execution policy is unnecessary.
- Expo Go opens but PackProof native modules are unavailable: install the PackProof preview/development APK. Expo Go is not a supported runtime.
