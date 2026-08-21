# PackProof 0.9.5.0 digital-evidence demonstration runbook

This runbook targets a real PackProof environment: a signed native Android app using live Firebase Authentication, Firestore, Storage, Cloud Functions, App Check, Hosting, evidence processing, PDF dossier generation, account export, and the two-party transaction state machine. Nothing in the acceptance path should mock uploads, hashes, server receipt/finalization times, invitations, callbacks, or account operations.

This is a digital-evidence demonstration. Physical correspondence is `NOT_AVAILABLE`, acquisition quality is `NOT_EVALUATED`, and no step authenticates an item, proves custody, or guarantees a legal, marketplace, carrier, payment, insurance, or dispute outcome.

The recommended partner-facing distribution is a Google Play internal-testing build. A sideloaded EAS preview APK is useful for fast team sessions, but Google Play Billing requires a Play install and Play Integrity has a stronger, simpler trust path through Play.

## What you need once

- A business-controlled Expo account.
- A Firebase project on the Blaze plan, with Firestore and Storage in the same chosen region.
- An Android app registered in that Firebase project using the permanent package name you will enter during configuration.
- Google as an enabled Firebase Authentication provider and a Google OAuth Web client ID.
- A Google Play Console app if the demonstration must include real subscriptions or the strongest Play Integrity configuration.
- Node.js 22, Java 21, and two physical Android phones or one phone plus a second Android tester.
- Two ordinary test Google accounts. Do not use production customer evidence in staging.

Facebook, TikTok, and RevenueCat are optional. The configuration helper hides any provider that is not fully enabled, so a Google-only environment still demonstrates the complete core PackProof transaction and evidence system without broken controls.

## 1. Install and authenticate the tooling

From the PackProof folder in PowerShell:

```powershell
npm.cmd ci
npm.cmd --prefix functions ci
npx.cmd --yes eas-cli@21.4.0 login
npx.cmd --yes firebase-tools@15.25.1 login
npx.cmd --yes eas-cli@21.4.0 init
```

Use Node 22 even if a newer Node version is installed. `nvm use 22` is sufficient when nvm-windows is available. Firebase Emulator Suite security tests require Java 21.

## 2. Configure the real staging services

In Firebase Console:

1. Register the Android package you intend to keep.
2. Enable Authentication > Google.
3. Create Firestore in production mode and enable Storage.
4. Download `google-services.json` into this folder beside `package.json`.
5. Create a Web application OAuth client in Google Cloud and retain its client ID.

Then run:

```powershell
npm.cmd run configure
```

The helper writes ignored `.env`, `.firebaserc`, and `functions/.env` files; finalizes the identity fields in the public pages; and asks which optional integrations should be visible. For the fastest reliable demonstration, enable Google only on the first pass. The helper is safe to rerun and retains prior values as defaults.

The public policy files remain legal templates. A staging operator name and support address are adequate for a private demonstration, but the remaining counsel-specific language must be reviewed before any public launch.

## 3. Create the signing key before the first real build

Run:

```powershell
npx.cmd --yes eas-cli@21.4.0 credentials --platform android
```

Create or select the Android build keystore. Copy its SHA-1 and SHA-256 certificate fingerprints into Firebase Console > Project settings > Your apps > Android. If using a Play internal track, also add the Play App Signing SHA-1 and SHA-256 fingerprints shown in Play Console > Setup > App integrity.

Download a fresh `google-services.json` after adding all fingerprints and replace the earlier copy. This step prevents Google sign-in `DEVELOPER_ERROR` failures.

Put every signing fingerprint that should open PackProof App Links into the comma-separated `ANDROID_APP_LINK_SHA256_CERT_FINGERPRINT` value in `.env`, then run:

```powershell
npm.cmd run generate:assetlinks
```

This generates `public/.well-known/assetlinks.json` for the configured package. The Firebase Hosting configuration intentionally publishes that directory.

## 4. Configure backend secrets

The evidence-manifest HMAC secret is mandatory:

```powershell
npx.cmd --yes firebase-tools@15.25.1 functions:secrets:set MANIFEST_SIGNING_SECRET
```

Paste a newly generated, high-entropy value into the hidden prompt. One way to generate it is:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Only when the corresponding feature was enabled in `npm run configure`, also set:

```powershell
npx.cmd --yes firebase-tools@15.25.1 functions:secrets:set TIKTOK_CLIENT_KEY
npx.cmd --yes firebase-tools@15.25.1 functions:secrets:set TIKTOK_CLIENT_SECRET
npx.cmd --yes firebase-tools@15.25.1 functions:secrets:set REVENUECAT_WEBHOOK_SECRET
```

Do not put any of these secret values in `.env`, `google-services.json`, source control, screenshots, or a shared demonstration document.

Set the non-secret manifest key identifier in ignored `functions/.env`, for example `MANIFEST_SIGNING_KEY_ID=manifest-hmac-v1`. Treat key rotation and historical-key retention as an operational release control; the identifier is not secret material.

## 5. Deploy the live backend and website

Run all local gates first:

```powershell
npm.cmd run doctor
npm.cmd run typecheck
npm.cmd --prefix functions run build
npm.cmd run lint
npm.cmd run test:evidence-format
npm.cmd run test:evidence-verifier
npm.cmd run test:claims
npm.cmd run test:rules
```

`doctor` must report zero blocking issues. It will retain a warning reminding you that deployed secrets and App Check cannot be proven from local files.

Deploy the actual backend, rules, indexes, files policy, and Hosting pages:

```powershell
npx.cmd --yes firebase-tools@15.25.1 deploy --only firestore,storage,functions,hosting
```

Install Firebase's Trigger Email extension with collection name `mail` and a verified SMTP sender if the demonstration includes the public email-based deletion flow. In-app account deletion and its seven-day grace period are handled directly by the deployed Functions.

## 6. Register and enforce App Check correctly

In Firebase Console > App Check, register the Android app with Play Integrity.

For the recommended Play internal-testing build, retain the normal requirements for a Play-recognized, licensed installation. Upload the AAB and install only through the tester link.

For a sideloaded EAS preview APK, use the Play Integrity provider's advanced settings to accept the integrity labels available to a signed app installed outside Google Play. Confirm valid App Check metrics before enabling enforcement. Do not weaken the production Play configuration merely to accommodate a sideloaded demo.

Enable App Check enforcement for callable Functions and Storage only after at least one signed build is returning valid metrics. The app uses the debug provider only in a development build; register the printed debug token in the staging App Check console when using `npm start` with a development client.

## 7. Build the native application

Sync the finalized mobile configuration and protected Firebase file to EAS:

```powershell
npm.cmd run sync:eas -- production
```

Choose one distribution path.

### Partner-facing, all integrations including billing

```powershell
npm.cmd run build:android:production
```

Upload the resulting AAB to Google Play Console > Testing > Internal testing, publish it to a tester list, and install from the Play testing URL. This is the authoritative demonstration path for Play Integrity and real Google Play purchases.

### Fast team install without a Play review step

```powershell
npm.cmd run build:android:preview
```

Share the EAS APK URL only with intended testers and use the sideload-compatible App Check settings described above. This is still the real application and live backend; the limitation is distribution trust and Google Play Billing, not simulated functionality.

Expo Go is not supported because PackProof uses native Firebase, App Check, social identity, billing, and the custom Android Keystore secure-file module.

## 8. Rehearse the real two-person story

Use two phones and two Google accounts. Keep both screens visible during a partner meeting.

1. Seller signs in, creates a PackProof, saves the item, price, identifiers, condition, shipping/return terms, and demonstrates editing the proposed terms.
2. Seller creates and shares the one-use buyer invite. Buyer opens it and joins. Reopening the consumed invite with a third account must fail.
3. Both participants confirm the same terms. Confirm that the record changes to `TERMS_LOCKED` only after both approvals.
4. Seller records a continuous packing video, shows the label barcode, and queues it. Wait for the server-finalized evidence record, then inspect byte integrity, app/device context, acquisition-quality, physical-correspondence, carrier-context, and business/legal-relevance states separately.
5. Seller records the carrier and tracking number. Show the packing-label match result.
6. Buyer records a continuous unboxing video or explicitly marks the shipment received without video.
7. Both mark the transaction complete. Generate and open the real server-built PDF evidence dossier.
8. Start a Return Passport, authorize it from the other account, record return repacking/shipping/unboxing, and complete it. Confirm that the flow documents digital evidence but does not claim a physical item match.
9. From Account, export the JSON account record. It includes profile, transaction, event, evidence metadata, return, and generated-packet metadata; evidence media remains available through its protected transaction views.
10. On a separate unlocked PackProof, demonstrate seller cancellation and show that the cancellation remains in the audit timeline.

Also test airplane mode during capture. Offline capture must remain explicitly `OFFLINE_UNATTESTED`, encrypted in app-private storage, and synchronized without later upgrading its capture-time assurance. A bounded provider-unavailable fallback must record `ATTESTATION_PROVIDER_UNAVAILABLE`; authorization, account, context, or validation failures must still block rather than masquerade as offline operation.

## 9. Demonstrate PackProof API to a vendor

Authenticate Application Default Credentials with an authorized staging operator:

```powershell
gcloud auth application-default login
```

Provision a sandbox integration whose callback hostname resolves publicly:

```powershell
npm.cmd --prefix functions run provision:connect -- --project YOUR_FIREBASE_PROJECT --name "Prospective vendor sandbox" --platform vendor-slug --environment SANDBOX --callback https://vendor.example/packproof/webhook
```

The command validates public HTTPS/DNS, creates the real Firestore integration, stores only the API-key hash, and prints the API key and webhook signing secret once. Move both directly into the vendor's secret manager.

The vendor then calls the versioned merchant API:

```text
POST https://YOUR_PROJECT.web.app/v1/connect/sessions
Authorization: Bearer pp_sandbox_...
Idempotency-Key: fulfillment-order-123-v1
Content-Type: application/json
```

Use `docs/PACKPROOF_API.md` and `docs/openapi/packproof-api-v1.json` for the payload. Existing v0.2 clients may keep `POST /api/connect/orders`. The JavaScript SDK in `sdk/javascript` verifies the exact-body HMAC on the `packproof.evidence.finalized` callback. The capture URL opens the native evidence-capture workflow through Android App Links, with the hosted fallback available when the app is not installed.

## 10. Five-minute pre-meeting check

1. Open the Hosting URL and the Android App Link on both phones.
2. Confirm Google sign-in works on both accounts.
3. Create and cancel one disposable draft.
4. Upload one small condition photo and wait for server finalization; inspect all assurance dimensions.
5. Generate one dossier and open it.
6. Confirm Firebase App Check metrics show valid traffic and Cloud Functions has no new errors.
7. Put both phones on chargers, enable Do Not Disturb, and keep one unused transaction ready at the first story step.

## Common failures

- Google sign-in `DEVELOPER_ERROR`: the installed signing certificate SHA-1/SHA-256 is missing in Firebase, or `google-services.json` was not refreshed and rebuilt.
- App Check or `unauthenticated` errors only in preview: the sideloaded certificate/integrity labels are not accepted. Use Play internal testing or adjust only the staging App Check advanced settings.
- Link opens in a browser: regenerate/deploy `assetlinks.json` with the exact installed signing certificate and verify the configured link domain.
- Evidence remains queued while online: inspect App Check, Functions logs, the Storage trigger, and the pending upload; the client now exposes online attestation failures.
- No subscription product: install from Google Play with a license tester and verify the RevenueCat `pro` entitlement and current offering. A sideloaded APK is not the billing-readiness test.
- Rules test will not start: install Java 21 and make it the active `JAVA_HOME` for that PowerShell session.

## Production boundary

This runbook gets a genuine staging application externally demonstrable. Public production still requires counsel-approved legal text, an evidence-retention policy, support/moderation operations, billing/error alerts, provider reviews, backup/incident procedures, Play data-safety disclosures, and an independent security assessment.
