# PackProof execution record - 2026-08-12

Controlling plan: [`../agent.md`](../agent.md)

Requested objective: begin bringing PackProof to evidence-backed completion using the master agent guide
Initial source: `7acf79489e9b5b6c78f9a6b8ae64d529cd9b0e3b` (`master`, matching `origin/master` at inspection time)

## Preflight evidence

| Check | Result | Classification |
|---|---|---|
| Repository destination | `https://github.com/thepackproof/repo.git`; local and remote `master` at `7acf794` | Observed locally; remote administration not authenticated |
| Working tree | Existing documentation edits, four tracked DOCX deletions, untracked controlling `agent.md`, execution-plan DOCX and Firebase debug log | Dirty; no release candidate may be tagged or built from this state |
| GitHub CLI | Installed, but `gh auth status` reports no authenticated host | `FAILED_WITH_EVIDENCE` for Gate 1 GitHub access |
| Firebase CLI | Version 15.25.1 runs; cached account is named, but project listing reports expired credentials | `FAILED_WITH_EVIDENCE` for Gate 1 Firebase access |
| Local Firebase alias | `.firebaserc` maps `default` to `packproof-4cf53` | Configuration observation only; sandbox/production role is not established |
| EAS | `@packproof-llc/packproof`, project `0196c3f7-cb3a-472c-99be-825558f227e8`; current account has PackProof organization owner roles | Account/project visibility observed; credentials and build ownership audit pending |
| Android toolchain | Node 22.23.2, npm 10.9.8, Java 21.0.12 and ADB available | Local prerequisite observed |
| Connected Android hardware | `adb devices -l` returned no device | `NOT_YET_TESTED` for every current physical-device gate |
| Configuration doctor | 0 blockers, 8 warnings | Local configuration check only |

No Firebase deployment, EAS build, Play action, secret/IAM mutation, data deletion, device-data clearing, commit, push or tag was performed in this tranche.

## Gate 0 work performed

- Added [`LAUNCH_SCOPE_2026-08-12.md`](LAUNCH_SCOPE_2026-08-12.md) with the recommended Google-only, billing-disabled, general-webhook-gated release contract.
- Limited Android support language to API 26+ Google Play-certified phones pending the required physical device matrix.
- Froze one two-account, two-device packing/unboxing/return/dossier demonstration scenario and its negative integrity/authorization cases.
- Preserved physical matching, carrier telemetry and automatic dispute decisions as post-launch scope with no production claim.
- Aligned public privacy and Play/Data Safety drafts with disabled Facebook, TikTok and RevenueCat runtime defaults.

Gate 0 remains `FAILED_WITH_EVIDENCE` pending the approvals and exact environment identities listed in the launch-scope record.

## Next authorized proof

1. Restore GitHub and Firebase web authorization without recording credentials or tokens.
2. Inventory accessible Firebase projects and explicitly designate isolated sandbox and production destinations.
3. Reconcile the two GitHub Actions workflows and default-branch policy after authenticated repository inspection.
4. Run the complete clean-install source and emulator suite from an immutable clean checkout.
5. Record vulnerability reachability, secret scan, generated-artifact reproducibility and SBOM evidence before any release-candidate tag.

## Clean-room baseline evidence

An isolated detached worktree was created at exact commit `7acf79489e9b5b6c78f9a6b8ae64d529cd9b0e3b`. Fresh `npm ci` installations were used for both the root/mobile tree and Functions. The following commands passed:

- `npm.cmd run typecheck`
- `npm.cmd run lint`
- `npm.cmd --prefix functions run build`
- `npm.cmd run generate:openapi-sdk`
- `npm.cmd run test:domain` - 28 tests passed
- `npm.cmd run test:application` - 8 tests passed
- `npm.cmd run test:api`
- `npm.cmd run test:api:firestore`
- `npm.cmd run test:application:firestore`
- `npm.cmd run test:api:functions`
- `npm.cmd run test:rules`
- `npm.cmd run test:evidence-format`
- `npm.cmd run test:evidence-verifier`
- `npm.cmd run test:claims`
- `npm.cmd run test:billing`
- `npm.cmd run test:sdk`
- `git diff --check`

The temporary clean-room worktree and its dependency tree were removed after evidence collection; only the primary `C:\src\PackProof\repo` worktree remains registered.

Classification:

- Static/build/unit/contract portions: `SOURCE_CHECKED` for commit `7acf794` only.
- Local Firestore and Storage emulator portions: `EMULATOR_CHECKED` for commit `7acf794` only.
- Live sandbox, current APK, physical devices and Play delivery: `NOT_YET_TESTED`.

The generated Functions and OpenAPI files had the same normalized Git blob content as the committed files, and `git diff --stat` was empty. However, Windows global `core.autocrlf=true` caused the regenerated files to remain marked modified in the clean-room worktree. This is `FAILED_WITH_EVIDENCE` for a clean generated-artifact/repository-hygiene gate until a repository-owned line-ending policy and isolated renormalization are implemented.

## Dependency and secret triage

Fresh installation reported:

| Tree | Critical | High | Moderate | Gate effect |
|---|---:|---:|---:|---|
| Root/mobile | 0 | 15 | 9 | Gate 2 remains open |
| Functions | 0 | 0 | 7 | Requires owner, target version and revalidation date |

The root high findings collapse to two `image-size <= 2.0.2` infinite-loop denial-of-service advisories reached through Metro/Expo build tooling. They are not evidence of an exploitable code path inside an installed APK, but the build pipeline still processes repository image assets and the findings require either a compatible patched dependency or explicit time-bounded build-tooling risk acceptance. No `npm audit fix --force` or dependency mutation was performed.

The Functions moderate findings include the `uuid < 11.1.1` supplied-buffer bounds advisory through Firebase Admin / Google Cloud Storage request dependencies. Reachability for the specific vulnerable UUID call forms is not established by this run; remediation must stay in the Firebase Functions dependency cohort and be followed by emulator, export and live-sandbox revalidation.

A filename-only tracked-source scan found no private-key block, GitHub token, Slack token, AWS access-key ID, live Stripe key or Google API-key pattern. Only `.env.example` and `functions/.env.example` matched the tracked configuration-file inventory; no live `.env`, service-account JSON, keystore or PEM file is tracked. This is a bounded pattern scan, not a complete secret-scanning product or history scan.

The root CycloneDX inventory contained 1,009 dependency components. The Functions package does not currently produce a usable npm CycloneDX component list, so the release SBOM requirement remains incomplete for the backend tree.

## Current stop boundary

No `v0.3.0-rc.1` tag is authorized. Gate 2 remains open because:

1. Gate 0 owner/environment approvals are missing.
2. GitHub and Firebase administrative access is not restored.
3. Root high dependency findings need compatible remediation or approved build-tooling risk acceptance.
4. Functions moderate findings need a recorded cohort decision.
5. Generated outputs do not leave a clean Windows worktree under the inherited line-ending configuration.
6. Public legal placeholders and App Links signing association remain unresolved.

## Owner decisions recorded on 2026-08-13

The repository owner explicitly approved these initial Android release defaults:

- Google-only authentication;
- PackProof Pro and billing disabled; and
- general merchant webhooks feature-gated.

Facebook sign-in, TikTok sign-in, RevenueCat billing and the general webhook product promise remain outside the initial active launch surface. Their code is preserved behind the documented runtime and proof boundaries.

The repository owner also confirmed `nericollin@thepackproof.com` as the single release captain and rollback decision owner for the initial Android release. That identity owns release acceptance, production promotion, pause and rollback decisions; legal and independent security sign-off remain separate responsibilities.

The repository owner designated Firebase project `packproof-4cf53` as the sandbox candidate and confirmed that no separate production Firebase project currently exists. The candidate is not classified as an isolated sandbox until authenticated inventory establishes its users, data, deployments, secrets, App Check registrations, IAM, billing and external dependencies. No production Firebase project creation or deployment is authorized by this designation.

The repository owner confirmed `nericollin@thepackproof.com` as the internal security acceptance owner. This establishes internal accountability but is not evidence of an independent security assessment.

The repository owner identified LegalZoom and its associated small-business legal services as retained counsel. LegalZoom is recorded as the legal-services channel, not yet as the individual PackProof legal/privacy sign-off owner. Completion requires the name of the licensed participating attorney or firm, relevant jurisdiction, a professional contact route, and confirmation that the attorney or firm accepted the PackProof privacy, terms, data-lifecycle and launch-review matter. Privileged legal advice and engagement documents are not required in this repository record.

GitHub CLI authentication was restored on 2026-08-13 as account `thepackproof` using the operating-system keyring. The token has `repo`, `read:org` and `gist` scopes; its value was not recorded. Read-only verification established administrator access to the public `thepackproof/repo` repository, default branch `master`, and remote commit `7acf79489e9b5b6c78f9a6b8ae64d529cd9b0e3b` matching the inspected local baseline.

The GitHub inventory also established that `master` is unprotected. GitHub Actions is enabled with read-only default workflow permissions. The prior `PackProof quality gates` run at `b7a9785` succeeded, but the push at `7acf794` ended in `startup_failure` before jobs or check runs were created. `.github/workflows/agent-ci.yml` targets only `main` while the repository default is `master`, and only `PackProof quality gates` appears in the registered workflow inventory. These findings require a reviewed CI consolidation and branch-protection change; authentication itself did not mutate remote state.

The pending assignment of a specific LegalZoom network attorney remains a production legal sign-off gate. It does not block coding, local or emulator testing, sandbox inventory/deployment, preview builds, or controlled demonstrations conducted with draft legal materials and bounded claims.

Firebase CLI reauthentication was restored on 2026-08-13 for `nericollin@thepackproof.com`. Read-only project inventory found exactly one accessible active Firebase project: `packproof-4cf53` (`PackProof`, project number `572691138698`). No production project exists in the accessible inventory.

The candidate is an active live sandbox, not an empty test shell. It contains one Android app (`com.packproof.app`), one default Hosting site, a native Firestore database with nine composite indexes, and 47 active Gen 2 Node.js 22 Functions in `us-east1`. Deployed runtime metadata explicitly sets `API_ENVIRONMENT=sandbox`, `ENABLE_TIKTOK_AUTH=false`, and `ENABLE_REVENUECAT_BILLING=false`. Four secret binding names and versions were verified without accessing their values: `API_CREDENTIAL_PEPPER` v2, `MANIFEST_SIGNING_SECRET` v4, `PARTICIPANT_HANDOFF_SIGNING_SECRET` v2 and `PUBLIC_HANDOFF_SIGNING_SECRET` v2.

Firebase Console verification showed the Google sign-in provider enabled and the Android PackProof app registered with App Check. Storage, Firestore and Authentication App Check enforcement are currently off. The project uses the Blaze pay-as-you-go billing plan; the Firestore database reports free-tier status, PITR disabled and deletion protection disabled. The Console also requires Google-account MFA by 2026-09-07. No deployment, secret mutation, App Check enforcement, user/data enumeration or production-project creation occurred during this inventory.

Because deployed Functions span four deployment hashes and the latest Hosting release cannot be cryptographically tied to the current Git commit from this metadata alone, the environment is not classified as an exact-source `SANDBOX_DEPLOYED` candidate. It remains a configured live sandbox whose exact deployment provenance and user/data isolation must be established before destructive or release-like testing.

## One-device Android validation - 2026-08-13

One physical Android device was connected non-destructively:

- serial `R5CX52CK06Z`;
- Samsung `SM-S928U` (`e3q`);
- Android 16 / API 36;
- locked bootloader, green verified-boot state and non-debuggable production firmware.

Before installation, Android user 0 was the only device user. Package-manager queries, including uninstalled/archived records, found no `com.packproof.app` package, and neither `/sdcard/Android/data/com.packproof.app` nor `/data/user/0/com.packproof.app` existed. Therefore there was no detectable PackProof installation or queue for this run to overwrite. This does not prove what happened to any installation or offline captures observed during an earlier experiment.

A fresh four-ABI release-variant APK was built from the current primary working tree after stale generated CMake/Ninja caches were moved into a recoverable timestamped quarantine. Gradle completed 1,233 tasks successfully. This build is a device-test artifact from a dirty working tree, not a release candidate and not a production-signed Play artifact.

The first APK used the repository debug certificate. Its identity was:

- package `com.packproof.app`;
- version `0.3.0` / code 4;
- min SDK 26 and target SDK 36;
- SHA-256 `D0F5B44D577D54B0996227A7016F2772502DC7E7512410A135EF30F5C75A877A`.

It installed and cold-started successfully, but Google sign-in failed with an application-visible `DEVELOPER_ERROR`. The exact cause was a signing-credential mismatch: the APK certificate SHA-1 was not the Android OAuth certificate registered for Firebase app `1:572691138698:android:b9b179891e7b2cbff40573`. Firebase also reported that this package/certificate pair already had an OAuth client in a different project.

A new ignored sandbox-only keystore was generated, and an optional Gradle signing profile was added to the locally generated, repository-ignored native Android project. That Gradle change is local build state and must be reproduced through a tracked config plugin or release-credential workflow before it can be treated as durable source configuration. The new key's SHA-1 and SHA-256 fingerprints were registered to the existing `packproof-4cf53` Android app. A partial SHA record left behind by the rejected conflicting-certificate request was deleted after its exact record ID was verified. The final Firebase inventory contains only the pre-existing SHA-1/SHA-256 pair and the new working sandbox SHA-1/SHA-256 pair. No production project, billing feature, webhook feature, App Check enforcement or application data was changed by this credential repair.

The corrected sandbox-signed APK passed signature verification and ZIP alignment checks:

- package `com.packproof.app`;
- version `0.3.0` / code 4;
- signer `CN=PackProof Sandbox Device Test, OU=Development, O=PackProof, C=US`;
- APK SHA-256 `6EEF8AF803FBC69AAAB347E41B4A260C30FACA1FFC7B0754AEBCEABE2462DF31`.

Android cannot update an installed package across signing identities. The first installation, created during this run and never authenticated or used for capture, was removed; the sandbox-signed APK was then installed. The corrected APK cold-started in 450 ms, completed Google authentication, received notification permission, remained alive and foregrounded, and rendered the authenticated home screen for `Collin`. The screen displayed live account state including one active PackProof and the `Capture smoke test` draft. No fatal process, Firebase Auth failure, Firestore permission/authentication failure, App Check failure, Storage exception or Functions exception was found in the bounded post-authentication log scan.

Classification:

- exact sandbox-signed APK installation and startup on `R5CX52CK06Z`: `PASSED_ON_DEVICE`;
- Google-only authentication on `R5CX52CK06Z`: `PASSED_ON_DEVICE`;
- authenticated read/render of existing sandbox account state: `PASSED_ON_DEVICE`;
- camera capture, Keystore-backed offline queue, upload, finalization, dossier generation and verifier round-trip for this APK: `NOT_YET_TESTED`;
- second-device and two-account handoff/return scenario: `NOT_YET_TESTED` because only one physical device is presently available;
- Play internal-track delivery and production signing: `NOT_YET_TESTED`.

## Execution continuation - 2026-08-13

### Reproducible Android sandbox signing

The machine-local Gradle signing repair was promoted into tracked Expo prebuild configuration in `plugins/with-packproof-gradle-properties.js`. The generated release signing profile now reads an explicit profile, external keystore path, alias and passwords from the build process environment. It rejects unsupported profiles, missing values and missing keystore files. No private key, password or machine-specific key path is generated into Gradle or tracked source.

The first implementation incorrectly replaced Expo's first `signingConfig signingConfigs.debug` occurrence, which affected the debug build type while leaving release on the debug certificate. Direct APK certificate inspection detected the error. The transformation and regression fixture were corrected to preserve debug signing and replace the release occurrence specifically.

Proof after correction:

- tracked plugin regression test: passed;
- missing-value fail-closed Gradle test: passed with exit 1;
- unsupported-profile fail-closed Gradle test: passed with exit 1;
- clean `expo prebuild --platform android --clean --no-install`: passed;
- Gradle release signing report: `Config: sandbox` with SHA-1 `42:2E:BD:C1:40:BD:95:20:0A:58:C4:8E:F6:C1:C8:08:A3:B6:FC:C9`;
- clean regenerated arm64 release build: 1,197 tasks passed in 4 minutes 34 seconds;
- APK Signature Scheme v2 and ZIP alignment verification: passed;
- package/version: `com.packproof.app` 0.3.0 code 4, min SDK 26, target SDK 36;
- corrected arm64 APK SHA-256: `E2130FF7EB67BB3E59391C21F034A7980CD516F25009A37DB73BA7E1A6CD465C`.

The corrected APK was preserved outside the generated native tree at `C:\src\PackProof\artifacts\device-test-2026-08-13\app-release-arm64-tracked-sandbox-signing.apk`. It has not yet been installed because the Samsung is not currently connected to ADB. Existing application data was not changed.

### Firebase Functions provenance and live API boundary

Predeployment validation passed the Functions build, 28 domain tests, 8 application tests, 14 API/OpenAPI tests, Function export/secret-binding/Hosting rewrite smoke test, evidence-format vectors, clean-room verifier mutation test, claims vocabulary test, 8 Firestore-backed API/idempotency/webhook tests and 4 Firestore-backed application persistence tests.

Live/local export comparison found 47 compiled local exports and 47 active live Functions, with no name difference. All live Functions are Node.js 22 in `us-east1`; all report `API_ENVIRONMENT=sandbox`, `ENABLE_TIKTOK_AUTH=false` and `ENABLE_REVENUECAT_BILLING=false`. A controlled Functions-only Firebase deployment reported all 47 endpoints `Skipped (No changes detected)`, providing deployment-engine evidence that the local source/config matched the deployed endpoint definitions at that point. No Hosting, Firestore rule, Storage rule, index, secret, billing or App Check change was made.

Post-provenance live checks found HTTP 403 on `/v1/health` and `/v1/readiness` at the Cloud Run IAM boundary. Those routes pass locally as intentionally unauthenticated API health endpoints. `packproofApi` was updated in source to declare `invoker: 'public'`, with the expected `{ invoker: ['public'] }` endpoint metadata enforced by the Function smoke test. API, typecheck and lint regressions passed.

Firebase uploaded and activated the updated `packproofApi` source as hash `a92564cc62c10372cbf90cb70963349cacd64327`, preserving its three secret bindings. The deployment then failed while setting the Cloud Run IAM policy, and the service still returns HTTP 403 through its Cloud Run URL, Cloud Functions URL and Hosting rewrite. The authenticated Firebase CLI identity lacks the required IAM authority or a higher-level policy blocks public invokers. No repeated deploy was attempted.

Current classification:

- tracked, clean-regenerated sandbox signing: `PASSED`;
- corrected APK installation/update on the Samsung: `NOT_YET_TESTED` because the device is disconnected;
- live/local Function export parity before the API repair: `PASSED`;
- `packproofApi` application source and local unauthenticated health/readiness contract: `PASSED`;
- live `packproofApi` transport reachability: `FAILED_WITH_EVIDENCE` (Cloud Run IAM 403);
- remaining 46 Functions: unchanged by the API repair;
- evidence capture through server finalization: `NOT_YET_TESTED` in this continuation.

### Cloud Run public-invocation repair verification

The Cloud Run `packproofapi` service was subsequently configured to allow unauthenticated invocation while leaving Identity-Aware Proxy, Binary Authorization and Security Command Center threat detection disabled. This change exposes the HTTPS transport only; PackProof's route-level credential and authorization middleware remains responsible for protected API operations.

Independent requests through the Firebase Hosting rewrite then established:

- `GET /v1/health`: HTTP 200 with `service=packproof-api`, `apiVersion=v1` and `status=OK`;
- `GET /v1/readiness` without a merchant API credential: HTTP 401 `INVALID_API_CREDENTIAL` from PackProof;
- `GET /v1/transactions` without a merchant API credential: HTTP 401 `INVALID_API_CREDENTIAL` from PackProof.

These results distinguish successful public transport reachability from application authorization: the former Cloud Run IAM 403 is resolved, and protected merchant routes continue to fail closed inside PackProof. A fresh Firebase inventory reports 47 of 47 Functions `ACTIVE`, all 47 on Node.js 22 in `us-east1`. `packproofApi` remains active at hash `a92564cc62c10372cbf90cb70963349cacd64327` with `API_ENVIRONMENT=sandbox`, `ENABLE_TIKTOK_AUTH=false`, `ENABLE_REVENUECAT_BILLING=false`, and the expected three API secret bindings.

Updated classification:

- live `packproofApi` transport reachability: `PASSED`;
- PackProof route-level unauthenticated rejection: `PASSED`;
- Firebase live Function inventory and sandbox feature gates: `PASSED`;
- corrected APK installation/update on the Samsung: `NOT_YET_TESTED` because no device is currently visible to ADB;
- evidence capture through server finalization: `NOT_YET_TESTED`.

### Corrected tracked APK installation and cold-start proof

The Samsung `R5CX52CK06Z` (`SM-S928U`, Android 16) was reconnected. Before changing the installation, the installed APK was copied from the device and its certificate compared with the corrected tracked arm64 APK. Both APKs had the same signing certificate SHA-256 `c2281ae304a5d77809ddb221b28957108687dabd534edded3f2f9b0083f3a741`, so an in-place update was safe.

`adb install -r` completed successfully. No uninstall or application-storage clear was performed. Post-installation proof established:

- the device-installed base APK SHA-256 is exactly `E2130FF7EB67BB3E59391C21F034A7980CD516F25009A37DB73BA7E1A6CD465C`, matching the preserved corrected artifact;
- package/version remains `com.packproof.app` 0.3.0 code 4;
- the original first-install time and application-data inode were preserved;
- previously granted camera and notification permissions remained granted;
- a cold launch completed successfully in 462 ms;
- the PackProof process remained alive and foregrounded;
- a bounded post-launch scan found no fatal Android, React Native, Firebase Auth, Firestore, Storage or PackProof error signature;
- the authenticated home screen rendered `Collin`, one active PackProof and the existing `Capture smoke test` record.

Updated classification:

- corrected tracked arm64 APK installation on `R5CX52CK06Z`: `PASSED_ON_DEVICE`;
- application-data-preserving in-place update: `PASSED_ON_DEVICE`;
- cold start and preserved authenticated session: `PASSED_ON_DEVICE`;
- fresh capture, upload, finalization, dossier and verifier round-trip: `NOT_YET_TESTED`.

### Real-device capture, retained queue recovery and finalization

Using the corrected installed APK, an original item photo was captured directly through PackProof on `R5CX52CK06Z`. The review screen explicitly offered `Encrypt, hash and sync`; accepting it placed the original into the Android Keystore-backed encrypted queue before network transfer. The first automatic synchronization reported a non-retryable attention dialog while retaining the ciphertext. No uninstall, application-data clear or queue deletion was performed.

The Capture hub subsequently reported two retained encrypted captures. A manual `Sync now` retry successfully decrypted both retained items, obtained upload grants and completed two Firebase Storage uploads to distinct exact evidence paths beneath transaction `vsx0JxO6hkTQLQiV5Efd`. The queue remained visible during processing and then disappeared only after the client observed each Firestore evidence document.

Independent transaction-detail rendering then showed two new `EVIDENCE FINALIZED` timeline events at 2026-08-13 10:59 America/New_York. Each states that the item photo was server-hashed and sealed into a service-authenticated manifest. The visible evidence presentation reported a 2.3 MB original and retained the bounded trust labels `ONLINE APP CHECK + KEY POSSESSION`, `ACQUISITION NOT EVALUATED`, `PHYSICAL NOT AVAILABLE`, `CARRIER CONTEXT NONE` and `BUSINESS/LEGAL REVIEW REQUIRED`.

Updated classification:

- fresh direct camera acquisition: `PASSED_ON_DEVICE`;
- Keystore encryption and ciphertext retention across an interrupted synchronization attempt: `PASSED_ON_DEVICE`;
- upload-grant and Firebase Storage upload for both retained queue items: `PASSED_ON_DEVICE`;
- server finalization and Firestore-observable evidence/timeline records: `PASSED_ON_DEVICE`;
- local queue removal after observable finalization: `PASSED_ON_DEVICE`;
- fresh evidence packet/dossier generation: `FAILED_WITH_EVIDENCE` because the `createEvidencePacket` Cloud Run transport returned `UNAUTHENTICATED` before Firebase callable verification.

Backend logs distinguish the dossier failure from Firebase account or App Check rejection: an earlier successful `createEvidencePacket` invocation logged both `auth=VALID` and `app=VALID`, while the new attempt started the Cloud Run service but produced no callable-verification entry. Firebase callable declarations do not emit an `invoker` option into deployment metadata, so the required repair is the Cloud Run service's unauthenticated-invocation IAM binding. PackProof's function-level Firebase Auth, App Check and transaction-participant authorization remain mandatory after transport entry.

The `createEvidencePacket` Cloud Run public-invocation binding was subsequently repaired. An unauthenticated transport probe reached the callable and was rejected inside Firebase with HTTP 401 `UNAUTHENTICATED`, proving public transport without bypassing application authentication. Two authenticated device attempts then logged `auth=VALID` and `app=VALID` and produced new `PACKET GENERATED` timeline events at 11:13 and 11:17 America/New_York.

The end-to-end UI operation still displayed `UNAUTHENTICATED` after packet creation because its second callable, `createPrivateDownloadUrl`, remains blocked at the Cloud Run IAM boundary. An independent probe returned HTTP 403 with `text/html` and `Your client does not have permission to get URL /createPrivateDownloadUrl from this server`, distinguishing the transport rejection from a Firebase Auth, App Check or participant-authorization rejection. The generated dossiers therefore exist, but private download and independent verifier proof remain pending the public-invocation binding for only the `createprivatedownloadurl` Cloud Run service.

The client was also hardened to force-refresh both the Firebase ID token and App Check token before packet generation and private download. Typecheck, lint and the production claims check pass. This hardening does not replace or weaken any backend enforcement.

### Live dossier download, preservation and bounded verification

The `createPrivateDownloadUrl` Cloud Run service was subsequently configured to allow unauthenticated transport. An unauthenticated probe then reached Firebase callable enforcement and returned application JSON with HTTP 401 `UNAUTHENTICATED`, replacing the prior Cloud Run HTML 403. This establishes that the transport boundary is reachable while Firebase Auth, App Check and transaction-participant authorization remain enforced inside the callable.

On Samsung `R5CX52CK06Z`, PackProof generated a fresh dossier for transaction `vsx0JxO6hkTQLQiV5Efd`, obtained a private signed download URL and opened the resulting PDF in Microsoft Edge. The exact file was downloaded on the device and pulled without uninstalling, clearing application storage or disclosing the signed URL. Preserved artifacts are:

- `C:\src\PackProof\artifacts\device-test-2026-08-13\PackProof-Evidence-Dossier-vsx0JxO6hkTQLQiV5Efd-20260813T152335Z.pdf`;
- `C:\src\PackProof\artifacts\device-test-2026-08-13\packproof-dossier-browser.png`.

The preserved PDF has SHA-256 `CCC301663B58265C45157C9807FC66032BE223763B9EF3B241BBF2995B69426F`. Structural inspection reports PDF 1.7, two unencrypted US Letter pages, no form and no embedded JavaScript. Machine-readable extraction confirmed three evidence entries, three distinct file SHA-256 values, three manifest SHA-256 values, three bundle SHA-256 values, the transaction identifier, bounded claims language, `physical correspondence: NOT_AVAILABLE` and the audit timeline. Both pages were independently rendered and inspected with no clipping, overlap, unreadable glyphs or missing content.

The evidence-format producer/verifier conformance vectors passed, and the clean-room verifier passed its positive fixture and rejected a one-byte mutation. This validates the independent verifier implementation and its tamper-detection behavior. It does not cryptographically verify the three live evidence bundles from the presentation PDF alone: that requires each retained original plus its canonical manifest, which the PDF intentionally inventories but does not embed. The service HMAC also remains service-only and cannot be publicly verified without an authorized verification environment.

Updated classification:

- `createPrivateDownloadUrl` public transport with callable-level authentication retained: `PASSED`;
- fresh authenticated packet generation and signed private download on `R5CX52CK06Z`: `PASSED_ON_DEVICE`;
- exact live dossier preservation and SHA-256 provenance: `PASSED_ON_DEVICE`;
- PDF structural, machine-readable and rendered-page QA: `PASSED`;
- evidence-format conformance and verifier mutation behavior: `PASSED`;
- cryptographic verification of each live original/manifest pair represented in the dossier: `NOT_YET_TESTED` because the presentation PDF does not contain those source artifacts.

### Exact verification of all live original/manifest pairs

Using the restored Firebase CLI identity `nericollin@thepackproof.com`, a read-only Google Cloud Storage inventory was constrained to transaction `vsx0JxO6hkTQLQiV5Efd` beneath its exact `evidence/` and `manifests/` prefixes in sandbox project `packproof-4cf53`. The inventory returned exactly three retained JPEG originals and exactly three canonical JSON manifests. Each manifest upload ID had one matching original upload ID; no unmatched object was observed in the scoped inventory. No IAM, Storage rule, object metadata or deployed service was changed.

All six source objects were exported to `C:\src\PackProof\artifacts\device-test-2026-08-13\live-bundles\vsx0JxO6hkTQLQiV5Efd`. The standalone `packproof-evidence-verifier` version 2.0.0 was then run against all three live pairs, using the manifest and bundle SHA-256 expectations printed in the device-downloaded dossier. Every pair passed all public checks:

- manifest schema version 2;
- `PACKPROOF_JCS_1` canonicalization profile;
- `PACKPROOF_EVIDENCE_BUNDLE_V2` binding profile;
- the service-MAC authentication profile declaration;
- byte-for-byte canonical manifest encoding;
- original SHA-256 equality with the digest recorded inside the manifest;
- exact manifest SHA-256 equality with the dossier;
- exact domain-separated bundle SHA-256 equality with the dossier.

The three verified tuples were:

| Original bytes | Original SHA-256 | Manifest SHA-256 | Bundle SHA-256 |
| ---: | --- | --- | --- |
| 1734715 | `5fdc22f6f4f38c1375014d63c32e86b65347bad3d8f3e16643ad5925cbc15cc6` | `5089c6d5b420acf9df8f9599e03c4c5ff1331210b6731bfe15422a6cc5cc0f9f` | `abfeb5fc48d413d475f9bc0548d3949f9fb915f6596a619a4c814946ebf5b893` |
| 1977495 | `ca98daaf6c1469902781e24676ec0e4f388f65f8b364a8c2c3b8660572b5f1b4` | `10e6e6f0831aa31eb2e37ec3d32221e02bef1af7d6e847a5515e6ba758a1a9f1` | `b9efcdb6612d0a601a47807d14ae3668a3fc2e6603cd644035ed32954d75326a` |
| 2362818 | `cc228960745e9d756d038a8d6de8c583e0113d629d12ec2bbdce8daf8518f0be` | `d9a04ccfee0a7f3575dc147aa25e2a7335840cc2e9046b2515a2652b88d16045` | `8bc98a910d47dd765dafc97eb819f8d0c413f3e051153f7d6419837f42f2b515` |

A disposable copy of the third live original was changed by one bit. The verifier then reported both `manifestFileHashMatched=false` and `expectedBundleSha256Matched=false`, returned exit 1 and classified the result `passed=false`. The disposable mutation was removed, and the preserved original was rehashed to confirm it remained unchanged.

The durable verification summary is `C:\src\PackProof\artifacts\device-test-2026-08-13\live-bundles\vsx0JxO6hkTQLQiV5Efd\live-bundle-verification-summary.json`, SHA-256 `04F5CB051D5BA10405A71281318561C7E6523CB4ABA11BB9683BEBFC4B15EF87`.

The service HMAC remains `NOT_VERIFIED` by the public verifier. This is the intended boundary: the manifest declares a symmetric HMAC-SHA256 with `PACKPROOF_SERVICE_ONLY` scope, so its origin cannot be publicly verified without access to the service secret. The secret was not retrieved, printed or exported during this gate. Physical correspondence remains `NOT_AVAILABLE` with reason `NO_VALIDATED_PHYSICAL_MATCHER_ENABLED`.

Updated classification:

- scoped sandbox export of all three retained originals and canonical manifests: `PASSED`;
- independent byte, canonical-manifest and v2 bundle verification for all three dossier entries: `PASSED`;
- live-original one-bit mutation rejection: `PASSED`;
- preserved-source immutability after the mutation control: `PASSED`;
- PackProof service-origin HMAC verification: `NOT_YET_TESTED` and intentionally restricted to an authorized service-secret environment;
- physical correspondence: `NOT_AVAILABLE` by design; no validated physical matcher is enabled.

### Isolated release-candidate validation and security triage

Gate 2 validation was run in detached worktree `C:\src\PackProof\gate2-clean` based on commit `7acf79489e9b5b6c78f9a6b8ae64d529cd9b0e3b`, with the current tracked source diff and required untracked plan/test inputs overlaid. The development checkout and installed Android application were not reset, cleaned or replaced.

Deterministic root and Functions `npm ci` completed successfully. The full compiler, lint, Functions build, OpenAPI, domain, application, API/OpenAPI, Function metadata, Firestore/Storage rules, Firestore-backed API/application, evidence-format, verifier mutation, claims, billing, SDK/browser and Android signing-plugin suites passed. A fresh Android Expo export bundled 2,325 modules into a 6.9 MB Hermes bundle. Direct Expo configuration parsing also passed for package `com.packproof.app` version `0.3.0`.

The redacting secret-pattern scan covered 513 text files. It found no recognized private key or provider-credential pattern. Three generic literal findings in `scripts/test-sdk.mjs` were reviewed as explicit test fixtures.

Dependency audit disposition and reproducibility details are recorded in `docs/RELEASE_SECURITY_TRIAGE_2026-08-13.md`. There are zero critical findings and zero high Functions runtime findings. The 15 root high package nodes collapse to two `image-size@1.2.1` infinite-loop advisories reached through Metro's Node-side asset tooling; no patched registry version exists through current `image-size@2.0.2`. They require a time-bounded build-tooling acceptance or upstream fix before immutable candidate approval. Functions has seven moderate package nodes collapsing to a transitive `uuid@9.0.1` advisory through current Google HTTP/Storage dependencies.

CycloneDX runtime inventories were produced with 388 root/mobile components and 281 Functions components. Functions package metadata was repaired to declare version `0.3.0`, enabling a valid package URL and SBOM; fresh `npm ci`, build and Function export-metadata checks passed afterward. Repeated builds produced identical tree digests for `functions/lib`, the OpenAPI client and the Button SDK. A repository `.gitattributes` policy now defines line endings without mass-renormalizing the dirty checkout.

Current classification:

- isolated complete clean validation suite: `PASSED`;
- generated-artifact determinism: `PASSED`;
- secret-pattern scan: `PASSED_WITH_THREE_TEST_FIXTURES_REVIEWED`;
- critical findings and high Functions runtime findings: `PASSED` at zero;
- root/mobile high findings: `NEEDS_TIME_BOUNDED_ACCEPTANCE_OR_UPSTREAM_FIX`;
- public terms placeholders: `PENDING_EXTERNAL_REVIEW`, non-blocking for coding/internal testing but blocking public release;
- immutable candidate commit/tag: `NOT_YET_CREATED`;
- fresh signed APK from the exact post-hardening snapshot: `BLOCKED_BY_PROTECTED_SIGNING_INPUTS`; all four required signing environment variables are absent.

### Metro image-size time-bounded security acceptance

On 2026-08-13, internal security acceptance owner `nericollin@thepackproof.com` approved a time-bounded acceptance for `GHSA-w3rx-r6r6-pgpr` and `GHSA-5p2g-fcmc-qvqq`, affecting `image-size@1.2.1` through PackProof's Metro build-tooling dependency path. The acceptance expires on 2026-11-13 or immediately when a compatible patched release becomes available, whichever occurs first.

The acceptance is conditional on repository-controlled Metro assets, no untrusted image inputs to Metro, no production exposure of the development server, advisory/version rechecks on every dependency update, and inspection of the exact signed APK to confirm that Node-side Metro and `image-size` code are not shipped. It automatically ends if a condition becomes false, the advisory scope materially changes, the affected code becomes runtime-reachable, or a compatible fix becomes available. It does not classify the advisories as fixed and does not authorize `npm audit fix --force` or an unvalidated override.

The controlling decision record is `docs/RISK_ACCEPTANCE_IMAGE_SIZE_2026-08-13.md`.

Updated classification:

- Metro/`image-size` build-tooling advisories: `TIME_BOUNDED_ACCEPTANCE_APPROVED` through 2026-11-13 subject to all recorded conditions;
- dependency-policy blocker for immutable-candidate preparation: `RESOLVED_CONDITIONALLY`;
- exact-APK Metro/`image-size` absence inspection: `NOT_YET_TESTED` and mandatory before candidate acceptance;
- protected Android signing environment: `BLOCKED`; the keystore file exists, but the profile, alias and both passwords are not present in the build-process environment.

### Immutable candidate branch preparation

The fully tested source set was reconciled in isolated worktree `C:\src\PackProof\gate2-clean` onto branch `agent/android-release-candidate-0.3.0`, based on `master` commit `7acf79489e9b5b6c78f9a6b8ae64d529cd9b0e3b`. Thirty files were staged explicitly. The staged set contained zero deletions and excluded the unrelated Word-document deletions, unreviewed DOCX export, temporary renders, SBOM output, APKs, evidence artifacts, credentials, dependency directories and generated Android native state from the development checkout.

The candidate includes the launch authority and execution records, Cloud Run public-invoker source/compiled output, Firebase ID/App Check refresh hardening, tracked sandbox signing profile and regression test, Functions version/SBOM metadata repair, line-ending policy, security triage, bounded `image-size` risk acceptance and non-persisting interactive signing wrapper.

Immediately before the final commit amendment, typecheck, lint, Function export/secret-binding/Hosting rewrite metadata checks, Android signing-plugin tests and staged `git diff --check` passed. The containing Git commit is the authoritative immutable source identity; its final commit and tree IDs are recorded in the draft pull request and external release provenance after publication.

Current classification:

- intentionally scoped candidate source commit: `CREATED_ON_CANDIDATE_BRANCH`;
- unrelated user document deletions and local artifacts: `EXCLUDED`;
- remote candidate branch and draft pull request: `PENDING_PUBLICATION`;
- annotated release-candidate tag: `DEFERRED` until exact signed APK inspection and device regression pass.

### Neutral SISV evidence-scope correction - 2026-08-13

The repository owner reaffirmed that PackProof is neutral, evidence-based infrastructure for e-commerce and must not point the finger or determine who is at fault. The candidate's SISV plan, API vocabulary, UI copy, claims register, physical-observation architecture, and ADR authority were narrowed accordingly.

SISV is now expressly an observation and measurement component, not a fraud detector, tamper detector, truth engine, authenticity service, custody proof, participant risk model, or adjudication engine. After validation, the only permitted PackProof product observations are `CONSISTENT_WITH_REFERENCE`, `VARIANCE_OBSERVED`, `INCONCLUSIVE`, and `NOT_EVALUATED`, each bounded to its named evidence, capture profile, supported population, quality policy, comparison artifact, observation policy, conditions, uncertainty, and limitations.

SISV output has no workflow authority. It may not automatically advance, block, cancel, quarantine, score, or adjudicate a transaction, shipment, return, payment, refund, chargeback, account, marketplace case, insurance matter, claim, or legal process. Digital byte-integrity mismatch handling remains a separate fail-closed technical control and is not evidence of participant misconduct.

ADR 0009 supersedes the earlier ADR language that contemplated future PackProof `MATCH` or `NON_MATCH` product decisions. The current callable now returns neutral `observationStatus` and `comparison` fields, with `COMPARISON_NOT_ENABLED` and no aggregate measurement. The Android UI describes the route as SISV observation research and does not display a match, identity, authenticity, tamper, fraud, fault, risk, or disposition result.

Verification passed:

- claims-register JSON parsing;
- root TypeScript typecheck;
- Expo lint;
- Firebase Functions build;
- Firebase Function export/secret-binding/Hosting rewrite metadata smoke test;
- PackProof production claim vocabulary check; and
- `git diff --check`.

Current classification: `SOURCE_CHECKED`. No Firebase deployment, APK build, physical-device test, commit, push, tag, or PR update was performed for this scope correction.

### Evidence-first go-to-market scope correction - 2026-08-13

The launch position was changed from an SISV-dependent physical-verification story to neutral evidence infrastructure for e-commerce. The visible `PP` label/package-boundary mark, tape/seal observations, high-resolution seller reference, buyer arrival/unboxing observations, resilient evidence vault, digital-integrity records, and review-ready dossier remain in the initial two-device scope. ADR 0010 removes an SISV algorithm from the release-candidate critical path while preserving ADR 0009's permanent neutral-observation and non-adjudication boundary.

Unsupported proposed claims were not adopted. PackProof does not publish a `95%` fraud-reduction claim, `90%` deterrence claim, fixed claims-agent review time, merchant-favorable outcome claim, current carrier-weight telemetry claim, or assertion that app/device signals prove continuous scene truth, GPS location, atomic capture time, physical custody, or non-alteration since sealing. Visa 13.1 and 13.3 are described only as Visa dispute conditions; Mastercard's separate current rules are not represented with Visa numbering.

Production evidence is not automatically a model-training dataset. Any future SISV research use requires separate affirmative opt-in consent, purpose limitation, minimization and redaction, operational/research separation, retention/deletion/withdrawal behavior, lineage, versioning, and audited access.

The controlling positioning is `docs/GO_TO_MARKET_EVIDENCE_FIRST_2026-08-13.md`. The claims register and production claim regression now include explicit boundaries for deterrence, human seam observations, carrier telemetry, training-data use, unsupported percentages, unsupported review-time statements, attestation, time/location, and attribution language.

Verification passed:

- claims-register JSON parsing;
- root TypeScript typecheck;
- Expo lint;
- Firebase Functions build;
- Firebase Function export, secret-binding and Hosting rewrite metadata smoke tests;
- PackProof production claim vocabulary check; and
- `git diff --check`.

Current classification: `SOURCE_CHECKED_GTM_SCOPE`. No Firebase deployment, signed APK build, real-device test, two-device workflow test, dossier visual QA, commit, push, tag, or PR update was performed for this GTM correction.
