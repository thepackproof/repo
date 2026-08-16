# PackProof execution record - 2026-08-16

Controlling plan: [`../agent.md`](../agent.md)

Requested objective: freeze `22d8a65` as a new release candidate, deploy that exact tag to sandbox `packproof-4cf53`, build a sandbox-signed APK, in-place install on `SM-S928U` after a queue-state check, then run one-device seller proof. Two-device buyer proof remains blocked until a second Android 8+ device exists.

Starting source: `22d8a65c61fe7ae2612feb78715fa2313452c8da` (`master`, matching `origin/master`)

## Candidate identity

| Item | Value |
|---|---|
| Commit | `22d8a65c61fe7ae2612feb78715fa2313452c8da` |
| Annotated tag | `v0.8.5.0-rc.3` (tag object `a1b062063a1b369e10a0839b5910c8e0e801d14c`) |
| Tag published | `origin` `refs/tags/v0.8.5.0-rc.3` |
| GitHub source-and-api | [success](https://github.com/thepackproof/repo/actions/runs/31965578230) on this SHA |
| GitHub deploy job | skipped (`ENABLE_SANDBOX_DEPLOY` not true) |
| Product version / versionCode | `0.8.5.0` / `5` |

Do not reuse `v0.8.5.0-rc.2`.

## Gate 3 pre-deploy rollback identity - packproof-4cf53

Recorded immediately before the RC.3 sandbox deploy. Inventory file: `C:\src\PackProof\artifacts\rc3-2026-08-16\pre-deploy-functions.json` (not tracked source).

| Control | Observed |
|---|---|
| Project | `packproof-4cf53` |
| Function count | 47 ACTIVE Gen 2, Node.js 22, `us-east1` |
| `API_ENVIRONMENT` | `sandbox` on all listed functions |
| Hosting health | `GET https://packproof-4cf53.web.app/v1/health` → `{"data":{"service":"packproof-api","apiVersion":"v1","status":"OK"}}` |

Pre-deploy function source hashes:

| Hash | Functions |
|---|---|
| `6720cc8d0e7cc0ac3f0c3b3c5c5674455d21c1ee` | 41 endpoints including callables, Connect, billing webhook, deletion, shipping |
| `453542686fb7061fbf6dc06b294ec1de4e9c9109` | `claimParticipantInvitation`, `getMyEvidenceSession`, `redeemEvidenceSession` |
| `466648f5b25dfa6b47cbc84d720d6277417cf599` | `onEvidenceUploaded`, `requestEvidenceUpload` |
| `eec77d3aa6f72d0c40a2c6ef6ffe85d5ff4b2a95` | `packproofApi` |

Rollback if this deploy must be reversed: redeploy the previously accepted sandbox source that produced those hashes. Do not invent a production project. Do not `--apply-secrets` for this candidate.

## Gate 3 sandbox deploy - 2026-08-16

Target: `packproof-4cf53` from tag `v0.8.5.0-rc.3`. Secrets were not rotated (`--apply-secrets` not used).

| Surface | Result |
|---|---|
| Firestore indexes | Deployed successfully |
| Firestore rules | Already up to date; released |
| Storage rules | Already up to date; released |
| Hosting upload | 25 files uploaded |
| Functions source upload | Succeeded |
| 46 of 47 function updates | `Successful update operation` |
| `packproofApi` source | New hash `01d3c1dccf89a03288239ca77769267a254f7f7f` (was `eec77d3aa6f72d0c40a2c6ef6ffe85d5ff4b2a95`) |
| `packproofApi` IAM policy | CLI failed to set invoker; same class of error as 2026-08-12 |
| CLI exit | `2` / `Error: There was an error deploying functions` |

Post-deploy live probes (do not treat as the full Gate 3 acceptance matrix):

| Probe | Result |
|---|---|
| `GET /v1/health` Hosting | HTTP 200 `status=OK` |
| `GET /v1/health` Cloud Run | HTTP 200 `status=OK` |
| `GET /v1/ready` Hosting | HTTP 200 `status=READY` |
| `POST /v1/connect/sessions` no credential | HTTP 401 `INVALID_API_CREDENTIAL` with request ID |
| `GET /v1/transactions` no credential | HTTP 401 `INVALID_API_CREDENTIAL` with request ID |

Post-deploy hashes (inventory: `C:\src\PackProof\artifacts\rc3-2026-08-16\post-deploy-functions.json`):

| Hash | Count | Notes |
|---|---:|---|
| `e9e3706581a33be50b5321d25ceb130d401fccd9` | 41 | Majority of callables including `submitShipping` |
| `ddc4ed756362bfc38943835478b5d558b71230f3` | 3 | Participant claim/session trio |
| `f2d19b7cfb85acdd6cf0d8df7d193b2526ccf761` | 2 | `onEvidenceUploaded`, `requestEvidenceUpload` |
| `01d3c1dccf89a03288239ca77769267a254f7f7f` | 1 | `packproofApi` |

Classification: **`SANDBOX_DEPLOYED` for candidate source** with a residual Cloud Run IAM-policy CLI failure that did not remove existing public transport. **Not** `SANDBOX_CHECKED` — live BOLA, App Check enforcement, App Links, alerts, and rollback rehearsal were not rerun.

## Work deliberately not performed in this close

| Action | Reason |
|---|---|
| Sandbox-signed RC.3 APK | Keystore passwords are interactive and were not supplied in this shell |
| Queue-state inspection on `R5CX52CK06Z` | Device not visible to ADB (`CM_PROB_PHANTOM`) |
| In-place install over RC.2 | Forbidden until queue check on the exact device |
| One-device packing / seal / offline / finalization | Requires the new APK and ADB |
| Two-device Gate 5 | No second Android 8+ device |
| Production project, Play, App Check enforcement | Outside this tranche |
| Legal-placeholder replacement | Still requires counsel-approved text |

The installed RC.2 binary on `SM-S928U` was not overwritten, uninstalled, or data-cleared.

## Closing classification

| Question | Answer |
|---|---|
| Is `v0.8.5.0-rc.3` frozen at `22d8a65` and published? | **Yes.** |
| Was `packproof-4cf53` deployed from that candidate? | **Yes — `SANDBOX_DEPLOYED` for source**, with residual `packproofApi` IAM-policy CLI error |
| Is Gate 3 fully `SANDBOX_CHECKED`? | **No.** |
| Was an RC.3 APK built and installed? | **No — `NOT_YET_TESTED`.** |
| One-device seller proof / two-device Gate 5? | **No.** `DEMO_READY` is not recorded. |

## Resume point

```text
Repository: C:\src\PackProof\repo
Branch: master
Commit: 22d8a65c61fe7ae2612feb78715fa2313452c8da
Tag: v0.8.5.0-rc.3
Sandbox: packproof-4cf53
packproofApi hash: 01d3c1dccf89a03288239ca77769267a254f7f7f
Installed device binary (unchanged): RC.2 on SM-S928U / R5CX52CK06Z
```

1. Make `R5CX52CK06Z` appear in `adb devices` (USB File transfer, unlocked, Allow USB debugging — or wireless debugging).
2. Inspect unsynchronized queue items. Do not clear data or uninstall.
3. Build the sandbox-signed APK with `.\scripts\build-sandbox-apk.ps1 -OutputPath C:\src\PackProof\artifacts\rc3-2026-08-16\packproof-0.8.5.0-rc.3-arm64.apk` using keystore `packproof-sandbox-device-test-20260813.jks` (same cert as RC.2).
4. Confirm the new APK certificate SHA-256 matches `BE4712525FB40E8C3C06F58CE87349B63A6BF1DB3BB7EACD5D10972EB9AD7136`, then `adb install -r`.
5. One-device seller proof: packing video, seal still, airplane-mode queue, restart, upload, observable finalization. Do not claim two-party Gate 5.
6. When a second Android 8+ device exists, complete buyer arrival/unboxing, dossier, verifier, return, and negatives ×3.
