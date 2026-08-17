# PackProof execution record - 2026-08-16 (v0.9.5.0 sandbox + one device)

Controlling plan: [`../agent.md`](../agent.md)

Requested objective: with `SM-S928U` / `R5CX52CK06Z` connected, deploy `v0.9.5.0` to sandbox `packproof-4cf53`, inspect the offline queue, in-place install a matching sandbox-signed APK, and complete as much one-device seller proof as possible. A second Android 8+ device is not available until 2026-08-17.

Starting source: `91a4ea899544a846df6f37bf80071e1defcd898d` (`master`, tag `v0.9.5.0`)

## Device and queue inspection

`run-as` is unavailable because the installed release APK is not debuggable. Queue state was read from the signed-in Capture tab, which is the app's own encrypted-queue status path.

| Item | Observed |
|---|---|
| Serial / model | `R5CX52CK06Z` / `SM-S928U` |
| ADB state | `device` (unlocked, awake) |
| Package | `com.packproof.app` |
| Installed versionName / versionCode | `0.8.5.0` / `5` |
| Signing cert SHA-256 | `BE4712525FB40E8C3C06F58CE87349B63A6BF1DB3BB7EACD5D10972EB9AD7136` |
| Last update | 2026-08-15 22:02:17 |
| Signed-in user | Collin |
| Capture tab queue banner | Absent (no pending sync, no attention / unreadable ciphertext) |
| Evidence-stage count | 0 |
| Data cleared or uninstalled | **No** |

Classification: queue inspection **passed for the signed-in principal**. File-level listing remains impossible on this non-debuggable install. In-place `adb install -r` is allowed; uninstall and data-clear remain forbidden.

## Gate 3 pre-deploy rollback identity - packproof-4cf53

Inventory: `C:\src\PackProof\artifacts\v095-2026-08-16\pre-deploy-functions.json`

| Control | Observed |
|---|---|
| Project | `packproof-4cf53` only |
| Function count | 47 ACTIVE Gen 2, Node.js 22, `us-east1` |
| `API_ENVIRONMENT` | `sandbox` |
| Hosting health / ready | HTTP 200 `OK` / `READY` |

Pre-deploy hashes (exact RC.3 live set):

| Hash | Count |
|---|---:|
| `e9e3706581a33be50b5321d25ceb130d401fccd9` | 41 |
| `ddc4ed756362bfc38943835478b5d558b71230f3` | 3 (claim/session) |
| `f2d19b7cfb85acdd6cf0d8df7d193b2526ccf761` | 2 (evidence upload) |
| `01d3c1dccf89a03288239ca77769267a254f7f7f` | 1 (`packproofApi`) |

Rollback: redeploy the RC.3 source that produced those hashes. Secrets were not rotated (`--apply-secrets` not used).

## Gate 3 sandbox deploy

`npm.cmd run deploy:firebase -- packproof-4cf53` from `v0.9.5.0`. CLI exit `2`.

| Surface | Result |
|---|---|
| Firestore indexes | Deployed |
| Firestore rules | Uploaded and released |
| Storage rules | Released (already current) |
| Functions source upload | Succeeded |
| Hosting file upload | 27 files uploaded; **version not released** on this CLI run because functions IAM failed |
| 44 of 47 function updates | `Successful update operation` |
| IAM invoker CLI | Failed for `packproofApi`, `confirmWebDeletion`, `webDeletionRequest` — same class as 2026-08-12 / RC.3 |

Follow-up: `npx firebase-tools@15.25.1 deploy --only hosting --project packproof-4cf53` succeeded (`version finalized`, `release complete`, exit 0).

Post-deploy hashes (inventory: `C:\src\PackProof\artifacts\v095-2026-08-16\post-deploy-functions.json`):

| Hash | Count | Notes |
|---|---:|---|
| `6ce6986f197b5de0608aaeb89c0a82e6f0c34a80` | 41 | Includes `confirmWebDeletion` and `webDeletionRequest` |
| `c5b04d448b104fac6199efbff8373fa51b0cf5f1` | 3 | Claim/session trio |
| `f54bf98e98230ac392ddde1bafca332bda83078f` | 2 | `onEvidenceUploaded`, `requestEvidenceUpload` |
| `cbe4ee18fb2dfdb94a1f172cb7ae1647c1e90af1` | 1 | `packproofApi` |

All four hash groups changed from RC.3. Cloud Run `packproofApi` health remains HTTP 200, so existing public invoker policy was not removed.

## Live probes after Hosting release

Transcript: `C:\src\PackProof\artifacts\v095-2026-08-16\live-probes.json`

| Probe | Result |
|---|---|
| Hosting `/v1/health` and `/v1/ready` | 200 `OK` / `READY` |
| Cloud Run `/v1/health` | 200; API security headers from `http-security.ts` |
| `/deletion-confirm.html` | 200 (was 404 before Hosting release) |
| `assetlinks.json` | 200 with sandbox cert `BE:47:12:52:...` |
| GET `/api/request-deletion` | 405 |
| GET `/api/confirm-deletion` (no token) | 302 to `/deletion-invalid.html` (does not mutate) |
| GET `/v1/transactions` no credential | 401 `INVALID_API_CREDENTIAL` with request ID |
| POST `/v1/connect/sessions` no credential | 401 `INVALID_API_CREDENTIAL` with request ID |
| Public handoff missing Origin | 400 `ORIGIN_REQUIRED` |
| Public handoff `http://` Origin | 400 `INVALID_ORIGIN` |
| Public handoff unknown install + HTTPS Origin | 403 `BUTTON_INSTALLATION_NOT_AUTHORIZED` |
| Unauthenticated Firestore `users/{id}` and `publicProfiles` list | 403 `PERMISSION_DENIED` |

Classification: **`SANDBOX_DEPLOYED` for `v0.9.5.0`**. **Not** `SANDBOX_CHECKED` — live BOLA with two real merchant credentials, App Check enforcement, App Links on-device, alert tests, and rollback rehearsal were not completed.

## Gate 4 signed APK and in-place install

Keystore: `packproof-sandbox-device-test-20260813.jks` (passwords entered in a local Windows dialog; not recorded).

| Item | Value |
|---|---|
| Artifact | `C:\src\PackProof\artifacts\v095-2026-08-16\packproof-0.9.5.0-arm64.apk` |
| APK SHA-256 | `70DC49729F03CD6DD420910E918FCE7973183684CEDD48961466EE5C8BDDCD69` |
| Bytes | 51,325,056 |
| package / versionName / versionCode | `com.packproof.app` / `0.9.5.0` / `7` |
| ABI | `arm64-v8a` |
| APK signer | v2; cert SHA-256 `be4712525fb40e8c3c06f58ce87349b63a6bf1db3bb7eacd5d10972eb9ad7136` |
| `adb install -r` | Success |
| firstInstallTime | unchanged 2026-08-13 13:08:50 |
| lastUpdateTime | 2026-08-17 00:12:27 |
| Signed-in session after upgrade | Collin Neri / Google linked; Capture queue empty |

Classification: **`PASSED_ON_DEVICE`** for this current-class Samsung on the item-photo / queue / restart path. Not a two-device matrix pass.

## One-device seller proof (item photo; packing blocked without buyer)

Packing video and seal still require `TERMS_LOCKED`. Existing sandbox transaction `PackProof Gate 5 Demo Camera` remains `Awaiting buyer`. The reachable one-device path was original item-photo capture through the encrypted queue.

| Step | Result |
|---|---|
| Capture | Item photo 3060 × 4080, 384 KB, App Check context bound while online |
| Network interrupt | Airplane mode enabled via `cmd connectivity airplane-mode enable` before encrypt |
| Encrypt/sync offline | Alert: `Evidence secured in queue` |
| App force-stop + relaunch still offline | Capture tab: `1 encrypted capture waiting to sync` |
| Restore Wi-Fi + Sync now | Queue banner cleared |
| Server observation | Transaction evidence: Item photo **Aug 17, 2026, 12:15 AM · 0.4 MB**; `BYTE INTEGRITY MATCHED`; `ONLINE APP CHECK + KEY POSSESSION`; `PHYSICAL NOT AVAILABLE`; timeline `EVIDENCE FINALIZED` |

Screenshots: `screen-queued.png`, `screen-queue-restart.png`, `screen-finalized.png` under `C:\src\PackProof\artifacts\v095-2026-08-16\`.

Classification: one-device queue + finalization **passed**. Gate 5A packing/unboxing and DEMO_READY **not** recorded.

## Closing classification

| Question | Answer |
|---|---|
| Is `v0.9.5.0` on sandbox `packproof-4cf53`? | **Yes — `SANDBOX_DEPLOYED`**, with residual IAM invoker CLI errors on three public HTTP functions |
| Is Gate 3 fully `SANDBOX_CHECKED`? | **No.** |
| Was a matching 0.9.5.0 APK installed in place? | **Yes.** versionCode 7, same cert, data preserved |
| One-device seller queue/finalization? | **Yes, item photo.** Not packing/seal |
| Two-device Gate 5 / `DEMO_READY`? | **No.** Second Android 8+ device is tomorrow |

## Resume point

```text
Repository: C:\src\PackProof\repo
Branch: master
Commit: 91a4ea899544a846df6f37bf80071e1defcd898d
Tag: v0.9.5.0
Sandbox: packproof-4cf53
packproofApi hash: cbe4ee18fb2dfdb94a1f172cb7ae1647c1e90af1
Installed: 0.9.5.0 versionCode 7 on SM-S928U / R5CX52CK06Z
```

1. On the second Android 8+ device, install the same APK (`packproof-0.9.5.0-arm64.apk`) or rebuild with the same sandbox cert.
2. Invite a buyer on `PackProof Gate 5 Demo Camera`, lock terms, then packing video, PP mark, tape/seal, high-resolution still.
3. Airplane-mode queue on packing video is still worth repeating; item-photo already proved the queue machine on this SHA.
4. Do not uninstall or clear seller-phone data. Do not tag `v1.0.0`. Do not enable App Check enforcement without captain approval.
