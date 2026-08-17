# PackProof no-code launch wizard

This guide takes PackProof from this folder to an internal Android test, then to Google Play production. You do not need Android Studio. For the shorter real staging path used in team and partner demonstrations, start with `EXTERNAL_DEMO.md`. Budget one focused afternoon for accounts and configuration, plus any review time required by the optional Meta and TikTok providers.

Do the sections in order. Keep the package name `com.packproof.app` unless you already own another permanent reverse-domain name. A package name cannot be changed after the first Play upload.

## 1. Create the owner accounts

Create or sign in to these accounts. Use a business-controlled email and enable two-factor authentication everywhere.

1. [Google Play Console](https://play.google.com/console/) — Android distribution and subscriptions.
2. [Firebase Console](https://console.firebase.google.com/) — authentication, database, files, backend and website.
3. [Expo](https://expo.dev/signup) — cloud Android builds.
4. [RevenueCat](https://app.revenuecat.com/) — optional subscription entitlement syncing.
5. [Google Cloud Console](https://console.cloud.google.com/) — OAuth credentials.
6. [Meta for Developers](https://developers.facebook.com/) — optional Facebook Login.
7. [TikTok for Developers](https://developers.tiktok.com/) — optional TikTok Login Kit.

Also obtain a real domain, support email, legal entity, and qualified privacy/terms review before production. The included legal pages are templates, not legal advice.

## 2. Install the local tools

Install Node.js 22, Java 21, and Git. Open a terminal in this `packproof` folder, then run:

```bash
npm ci
npm --prefix functions ci
npx eas-cli@21.4.0 login
npx firebase-tools login
```

You can run every `npx` command by copying it exactly; a global installation is not required.

On Windows, use `npm.cmd` and `npx.cmd` if the PowerShell execution policy blocks the `.ps1` shims. Keep local Gradle/CMake builds in a short non-OneDrive path such as `C:\src\packproof`; see `PC_DEMO.md`. EAS cloud builds do not have this local path limitation.

## 3. Create Firebase

1. In Firebase Console choose **Add project**, name it `PackProof`, and turn Analytics off for the first release unless you intentionally want it.
2. Upgrade to the **Blaze** pay-as-you-go plan. Cloud Functions and file processing require billing. Set billing-budget alerts immediately.
3. Project settings → **Your apps** → Android → package name `com.packproof.app` → register.
4. Download `google-services.json` and place it directly inside this folder, beside `package.json`.
5. Build → Authentication → Get started. Enable **Google**. Enable **Facebook** only if you choose it in `npm run configure`. TikTok is optional and uses the included secure custom-token bridge, so it will not appear as a native Firebase provider.
6. Build → Firestore Database → Create database → choose your primary region → start in production mode.
7. Build → Storage → Get started → use the same region.
8. Build → App Check → register the Android app with **Play Integrity**. Enforcement is enabled only after a signed build is installed from a Play test track and you have confirmed valid requests.

Do not paste service-account JSON or private keys into source files, chat, email, or Git.

## 4. Initialize Expo and the local configuration

Run:

```bash
npx eas-cli@21.4.0 init
npm run configure
```

The helper asks for the Firebase project ID, Expo owner/project ID, permanent Android package, Google Web OAuth client ID, public website/link domain, staging identity, and which optional Facebook, TikTok, and RevenueCat integrations should appear. The helper writes local files that are excluded from version control and hides integrations that are intentionally disabled.

If you do not have a value yet, finish the relevant section below and run `npm run configure` again. Once all values and `google-services.json` are present, sync them to Expo’s protected cloud-build environments:

```bash
npm run sync:eas
```

Run that command again whenever any mobile configuration value or `google-services.json` changes. These identifiers are embedded in the released app and are not server secrets; the Firebase file is uploaded as a protected EAS file variable.

## 5. Configure Google sign-in

1. Firebase Authentication → Sign-in method → Google → enable and select the support email.
2. Google Cloud Console → APIs & Services → OAuth consent screen. Supply the PackProof name, real support email, privacy-policy URL and terms URL.
3. Credentials → Create credentials → OAuth client ID → **Web application**. Copy this value into `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` when the configuration helper asks.
4. After your first EAS build, copy its SHA-1 and SHA-256 signing fingerprints into Firebase Project Settings → Android app. For Play builds, also add the fingerprints shown under Play Console → Setup → App integrity → App signing.
5. Download a fresh `google-services.json` after adding fingerprints and replace the local file.

Google may require verification if you later add sensitive scopes. PackProof requests only basic identity.

## 6. Configure Facebook sign-in (optional)

1. Meta for Developers → Create app → choose a consumer/business-compatible app type → add **Facebook Login for Android**.
2. Basic settings: add the package `com.packproof.app`, the PackProof privacy-policy URL, terms URL, data-deletion URL (`https://YOUR_PROJECT.web.app/delete.html`), app icon and category.
3. Add the default activity shown by Meta for React Native Android: `com.facebook.FacebookActivity` is injected by the included build plugin.
4. Add the key hashes for the EAS build certificate and the Google Play App Signing certificate. Expo’s build-credentials page and Play Console’s App integrity page expose the required certificate information.
5. Copy the **App ID** and the non-secret **Client Token** into `npm run configure`.
6. Keep the Meta app in development while testing with listed testers; request Live mode only when policy pages and deletion work.

Never put the Facebook App Secret in the mobile app.

## 7. Configure TikTok sign-in (optional)

1. TikTok for Developers → create an app → add **Login Kit**.
2. Request the `user.info.basic` scope.
3. Add the exact redirect URI:

   `https://us-east1-YOUR_FIREBASE_PROJECT.cloudfunctions.net/tiktokAuthCallback`

4. Add Android package `com.packproof.app`, privacy URL, terms URL and required branding.
5. Set the backend secrets from this folder:

```bash
npx firebase-tools functions:secrets:set TIKTOK_CLIENT_KEY
npx firebase-tools functions:secrets:set TIKTOK_CLIENT_SECRET
```

Paste each value only into the hidden terminal prompt. The backend uses state, PKCE, expiring one-use grants and Firebase custom tokens. TikTok must approve the app before the general public can use this sign-in route.

## 8. Configure subscriptions (optional)

The app never handles card data. Android subscriptions are purchased with Google Play Billing through RevenueCat; the backend accepts plan changes only from a signed, secret-protected RevenueCat webhook.

1. Google Play Console → create the PackProof app using package `com.packproof.app`.
2. Monetize → Products → Subscriptions → create products such as `packproof_pro_monthly` and `packproof_pro_yearly`; activate their base plans.
3. RevenueCat → new project → add Google Play app. Follow RevenueCat’s service-account instructions and grant only the required Play permissions.
4. RevenueCat → Products: import the Play product IDs.
5. Create entitlement exactly named `pro`, attach both products, then create a current offering.
6. Copy RevenueCat’s public Google SDK key (normally starts `goog_`) into `npm run configure`.
7. Generate a long random webhook secret locally:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
npx firebase-tools functions:secrets:set REVENUECAT_WEBHOOK_SECRET
```

8. RevenueCat → Integrations → Webhooks. URL:

   `https://us-east1-YOUR_FIREBASE_PROJECT.cloudfunctions.net/revenueCatWebhook`

   Authorization header: `Bearer THE_SAME_RANDOM_SECRET`

9. Test purchases only from a Play internal-testing install using a Play license tester. Do not use a sideloaded APK to judge billing readiness.

## 9. Configure transactional email

The public deletion page uses Firebase’s official **Trigger Email** extension to send confirmation links without exposing email credentials.

1. Firebase Console → Extensions → install **Trigger Email**.
2. Configure an SMTP provider you control, a verified From address, and collection `mail`.
3. In Firebase Authentication → Templates, also set the real sender name/domain.
4. Send a test request from `/delete.html`, confirm the link, and verify the account becomes scheduled for deletion. Also test **Continue with TikTok** using a TikTok-only disposable account.

## 10. Finalize public pages

`npm run configure` replaces the legal-identity, date, and support-address placeholders in:

- `public/privacy.html`
- `public/terms.html`
- `public/community.html`
- `public/delete.html`

Have counsel review the privacy policy, terms, liability language, content policy, retention, dispute provisions, age eligibility and international transfer text. Then deploy:

```bash
npx firebase-tools deploy --only firestore,storage,functions,hosting
```

Copy the resulting `https://YOUR_PROJECT.web.app` URL into Play Console and all social-provider consoles.

## 11. Run the checks

```bash
npm run doctor
npm run typecheck
npm --prefix functions run build
npm run lint
npm run test:rules
```

The first rules test downloads Firebase emulator components and can take several minutes. Do not continue while `doctor` reports blocking issues. Legal-placeholder warnings must also be cleared before production.

## 12. Build an installable preview

```bash
npm run build:android:preview
```

EAS returns a link to an APK. Install it on a physical Android phone. The app uses native Firebase, social-login and purchase libraries, so Expo Go is not sufficient.

Test the complete two-person flow with two real devices/accounts:

1. Seller creates a PackProof and shares a one-use invite.
2. Buyer joins; a second buyer cannot reuse the invite.
3. Both confirm identical terms.
4. Seller records a continuous packing video and adds tracking.
5. Buyer records a continuous unboxing video.
6. Both complete; either side can export the evidence PDF.
7. Test report, block, notification, data export, email deletion, TikTok-only web deletion, cancellation during the grace period and final purge.
8. Try to open the transaction and evidence as a third unrelated account; access must fail.

## 13. Make the Play release

1. Read `docs/PLAY_CONSOLE_CHECKLIST.md` and complete every box.
2. Build the signed Android App Bundle:

```bash
npm run build:android:production
```

3. Download the `.aab` from Expo, upload to Play Console → Testing → Internal testing, add testers and publish the test track.
4. Install only through the Play testing link. Confirm Play Integrity, Google sign-in, Facebook, TikTok, purchases, restore, webhook, notifications, evidence uploads and deletion.
5. Promote Internal → Closed → Production only after the test plan passes and the social providers are live.

After the first AAB is manually uploaded and the Play app exists, future builds can also be submitted with `npm run submit:android` after configuring EAS Submit with a narrowly scoped Google Play service account.

## Safe operations after launch

- Review Firebase billing and error alerts weekly; configure hard operational alerts even though Google Cloud budgets are not hard spending caps.
- Never manually edit transaction, evidence, billing-event or provider-link documents unless following a written incident procedure.
- Re-run security-rule tests before every rules change.
- Keep Expo, Firebase, React Native and all identity/payment SDKs updated on a regular release cycle.
- Export legal and accounting records according to counsel’s retention policy; do not retain user evidence “just in case.”

If something fails, run `npm run doctor` and copy only its output. Never share `.env`, `google-services.json`, service-account JSON, SMTP passwords or Firebase secret values.

## 14. PackProof 0.9.5.0 evidence security and Connect setup

1. Generate and store the evidence-manifest HMAC secret, then set a non-secret key identifier in `functions/.env` (for example, `MANIFEST_SIGNING_KEY_ID=manifest-hmac-v1`):

```bash
openssl rand -base64 48
npx firebase-tools functions:secrets:set MANIFEST_SIGNING_SECRET
```

Generate a different secret for short-lived public Button handoffs. Do not reuse the manifest key or merchant credential pepper:

```bash
openssl rand -base64 48
npx firebase-tools functions:secrets:set PUBLIC_HANDOFF_SIGNING_SECRET
```

Generate one more independent secret for participant claims and actor-bound evidence-session redemption. Do not reuse any other PackProof key:

```bash
openssl rand -base64 48
npx firebase-tools functions:secrets:set PARTICIPANT_HANDOFF_SIGNING_SECRET
```

2. Set the verified link base used in Connect order responses:

```bash
Open `functions/.env` and verify `CONNECT_LINK_BASE_URL=https://YOUR_LINK_DOMAIN` (the configuration helper normally writes it).
```

3. Put the EAS and/or Play App Signing SHA-256 certificate fingerprints in `ANDROID_APP_LINK_SHA256_CERT_FINGERPRINT` inside `.env`, run `npm run generate:assetlinks`, and deploy Hosting. The package has HTTPS intent filters for `/connect/capture`, `/handoff/review`, `/invite`, `/claim/participant`, and `/evidence-session/redeem`; without valid association, users can still use the hosted fallback but Android may open the browser first.

4. Install a signed internal-test build from Google Play, verify valid App Check metrics, then enable enforcement for Functions. Test the record action after the app has been idle, after an App Check token expires and while offline.

5. Run the offline queue and Return Passport cases in `docs/TEST_PLAN.md`. Because the Keystore key is local to the installation, uninstalling/clearing app data can make queued evidence unrecoverable. Android data backup is disabled so ciphertext is not restored without its key.

6. Provision Connect integrations either from an admin account carrying custom claim `packproofAdmin: true` or with the authorized staging CLI documented in `docs/PACKPROOF_CONNECT.md`. Save the returned API key and webhook signing secret in the marketplace’s secret manager. Review the OpenAPI file and JavaScript SDK before exposing the endpoint.
