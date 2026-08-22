# PackProof HC-1 Phase 0 baseline

Recorded 2026-08-22 against a clean `master` that matches `origin/master`, plus two untracked local files that are **not** part of this baseline.

Classification: **planning snapshot**. Not `SOURCE_CHECKED` for HC-1 work, not `EMULATOR_CHECKED`, not a live-backend claim, not a device claim.

## Identity

| Field | Value |
|---|---|
| Milestone | Hardening Candidate 1 (`HC-1`) |
| Current package version | `0.9.5.0` |
| Intended next package version | `0.9.6.0` (not yet applied) |
| Baseline source SHA | `db69eef11890fc5d566795d92d40740a21f82308` |
| Short SHA | `db69eef` |
| HEAD subject | Add a release-candidate source journey that is not a live device E2E. (#27) |
| Commit time | 2026-08-22 00:21:49 -0400 |
| Branch | `master` tracking `origin/master` |
| Dirty tracked files | none |

## Runtime and product versions

| Field | Value |
|---|---|
| Node (this operator workstation) | `v22.23.2` (engines: Node 22) |
| Java (this operator workstation) | Temurin 21.0.12+8 |
| Expo | `~57.0.11` |
| React Native | `0.86.2` |
| React | `19.2.3` |
| Android package | `com.packproof.app` |
| Android versionName | `0.9.5.0` |
| Android versionCode | `7` |
| Portal package | `@packproof/portal` `0.9.5.0` |
| Functions package | `packproof-functions` `0.9.5.0` |
| Portal build identity | not produced for this SHA |
| AAB / APK SHA-256 | not produced for this SHA |

## Firebase and rules

| Field | Value |
|---|---|
| Default / sandbox project | `packproof-4cf53` |
| Production project alias | `thepackproof-prod` (not claimed deployed from this SHA) |
| Functions configuration | not snapshotted. Do not commit env files |
| Firestore rules path | `firestore.rules` |
| Firestore rules Git object | `3e958daee4bcda938f78717436661846e131f422` |
| Firestore rules SHA-256 | `B123F58DD8F2E865C3BE534409C1B054EA697FDEBA6FED1220F4DE4635F3BA36` |
| Storage rules path | `storage.rules` |
| Storage rules Git object | `11c0e97f82e953bcd89b7bb9327abfc2868d17a5` |
| Storage rules SHA-256 | `39D838868DF72891785CEA902F6834D1B9E5B6271CDB90E42A7F05383BE75B32` |

## Lockfiles

| File | Git object | SHA-256 |
|---|---|---|
| `package-lock.json` | `772a8fd61e91a0bddf2e7dfa3efc78d72e11f641` | `FD37E09096223388EA19586C43E1F50FD34F61B75FAA89B004142F9C69D00C53` |
| `functions/package-lock.json` | `8bc7a23baa27d4d3423fd9f1997ec911deebab1e` | `C91094D0998A8836B707D27A66DF199A14E1F1DF18B946F20692F025A56E3212` |
| `portal/package-lock.json` | `a735187c4bc0ec8c5c0d81b2b9b6414cd1ee211a` | `B8D9FCF63D4F509A2F925BEEE642EDC12AEE055325E07C4E258428C964F5F02E` |

## Known open defects at this SHA

See HD-01 through HD-10 in [`HARDENING_AND_RELEASE_ARCHITECTURE_PLAN.md`](HARDENING_AND_RELEASE_ARCHITECTURE_PLAN.md) §3.1.

Additional launch residuals from prior records, still not re-proven on `db69eef`:

- `DEMO_READY` / `LAUNCH_READY` not recorded.
- Two-device E2E-01..10 not satisfied by AUTO-19.
- AND-01..07 not rerun on this SHA.
- Production GitHub environment absent as of 2026-08-16 deployment-identity record.
- `physicalCorrespondence` remains `NOT_AVAILABLE`.

## Working tree exclusions

Present locally and **excluded** from this baseline and from any HC-1 commit unless the owner explicitly requests a secrets-handling change:

- `functions/.env.thepackproof-prod`
- `google-services.production.local.json`

## Starting line

HC-1 work begins from this snapshot. Implementation starts at Phase 1. Do not bump package versions, deploy, or claim a new candidate until Phase 1 has a reviewable slice.
