# Camera acquisition milestones 1 and 2 completion - 2026-08-13

## Status

`SOURCE_CHECKED`

This checkpoint hardens the existing Android-first native camera path. It does not create a second capture pipeline and does not change the actor-bound, nonce-backed evidence-session or encrypted-queue architecture.

It is not `BUILT`, `PASSED_ON_DEVICE`, `LIVE_SANDBOX_PASSED`, `DEMO_READY`, or `LAUNCH_READY`. The Android export described below is a JavaScript bundleability check from a dirty working tree, not a signed APK or release artifact.

## Delivered behavior

- Capture remains disabled until the native preview emits `onCameraReady`; mount failures are visible.
- Photo flash supports `OFF`, `AUTO`, and `ON`; video supports an explicit torch state.
- Zoom uses bounded steps and the exact selected flash/torch and zoom values are retained in the evidence manifest.
- Barcode capture retains the raw decoded value, normalized tracking identifier, symbology, scan timestamp, camera provenance, and versioned normalization profile.
- Evidence-type-specific framing overlays are expressly labeled as human guidance, not machine-confirmed coverage or acquisition-quality acceptance.
- Video recording shows an elapsed clock and remains bounded to 15 minutes.
- Leaving the foreground invalidates an in-progress capture. A video is stopped and rejected rather than represented as continuous evidence.
- Permission denial can route the user to Android settings when the operating system will not show the prompt again.
- Photo review displays the original camera result before encryption. Review facts include size, dimensions or duration, flash/torch state, and zoom.
- Closing or abandoning review deletes unencrypted temporary camera output. Telemetry subscriptions and recording handles are released during lifecycle cleanup.
- Once encrypted queue creation begins, cleanup does not delete the original out from under encryption. The original is removed only after a durable queue record exists.
- The frozen 15-frame physical-acquisition route keeps rear-camera, flash-off, zero-zoom behavior while adding native-preview readiness and guarded cleanup. It still reports acquisition quality `NOT_EVALUATED` and physical correspondence `NOT_AVAILABLE`.

## Contract compatibility

The server accepts `OFF`, `AUTO`, `ON`, and `TORCH` camera observations. Raw barcode value and normalization profile must be supplied together. Older manifests without this paired extension remain readable.

Evidence-format regression vectors cover the new camera settings, raw/normalized label pair, malformed partial pair, and invalid flash-mode rejection.

## Verification performed

All commands passed from `C:\src\PackProof\repo`:

```text
npm.cmd run typecheck
npm.cmd run lint
npm.cmd --prefix functions run build
npm.cmd run test:evidence-format
npm.cmd run test:api             # 14/14
npm.cmd run test:claims
git diff --check
npx.cmd expo export --platform android
```

Final Android export:

- Directory: `C:\src\PackProof\artifacts\camera-milestone-2-final-20260813`
- Modules bundled: 2,337
- Files: 53
- Total bytes: 8,919,526
- Hermes bundle: `_expo/static/js/android/entry-6c8ab7039754140fc51eeaadda6ae498.hbc`
- Hermes bundle SHA-256: `04FEE8B4C15DC8B92A186A1A670A076996D6023AC46B006FB8B11C2AF699EECE`
- Metadata SHA-256: `F25FEFCC4133E0686C7F8B027200DD0690B251F6312065B1E4FBB1A3A2DD2C27`

The export proves that Metro and the React Compiler can produce the Android JavaScript bundle. It does not exercise CameraX, the microphone, flash, torch, barcode decoding, Android lifecycle behavior, Keystore encryption, App Check, upload, or server finalization.

## Push scope

The camera checkpoint consists of:

- `src/app/capture/[id].tsx`
- `src/app/capture/physical/[id].tsx`
- `src/types/telemetry.ts`
- `functions/src/validation.ts`
- `functions/scripts/test-evidence-format.mjs`
- generated `functions/lib/validation.js` and `functions/lib/validation.js.map`
- this completion record and its architecture index entry

The repository contains unrelated pre-existing modifications. A future commit must stage this scope intentionally and recheck the staged diff; it must not stage the entire dirty working tree by accident.

## Required next proof

The next milestone is physical Android acceptance of the exact signed APK: camera preview/readiness, permission denial and settings recovery, photos, review/retake, video and microphone, recording interruption, flash/torch/zoom, representative tracking barcodes, temporary-file cleanup, encrypted queue creation, restart survival, and observable live finalization. Until those pass, every device and live outcome remains `Not yet tested`.
