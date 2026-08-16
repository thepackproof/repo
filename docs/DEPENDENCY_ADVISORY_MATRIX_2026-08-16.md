# PackProof 1.0 dependency advisory matrix

Recorded: 2026-08-16  
Source under review: working tree implementing the 1.0 hardening plan against baseline `22d8a65`.  
Policy file: [`DEPENDENCY_ADVISORY_POLICY.json`](DEPENDENCY_ADVISORY_POLICY.json)  
Gate: `npm run test:dependency-advisories`

This matrix classifies npm production-audit nodes. It is not a penetration test and does not claim the installed Android APK has been inspected in this session.

## Root / mobile (`npm audit --omit=dev`)

npm currently reports 15 high and 9 moderate **package nodes**. Those nodes collapse to three unique GHSA advisories.

| Advisory | Severity | Classification | Reachability | Disposition |
|---|---|---|---|---|
| `GHSA-w3rx-r6r6-pgpr` (`image-size` ICNS infinite loop) | high | `BUILD_TIME_ONLY` | Metro asset pipeline via `expo -> @expo/metro-config -> metro`. PackProof application source does not import `image-size`. | Accepted through 2026-11-13 under [`RISK_ACCEPTANCE_IMAGE_SIZE_2026-08-13.md`](RISK_ACCEPTANCE_IMAGE_SIZE_2026-08-13.md). Forced Expo/RN downgrades are rejected. |
| `GHSA-5p2g-fcmc-qvqq` (`image-size` JXL/HEIF infinite loop) | high | `BUILD_TIME_ONLY` | Same Metro path. | Same acceptance. |
| `GHSA-w5hq-g745-h8pq` (`uuid <11.1.1` missing buffer bounds check) | moderate | `BUILD_TIME_ONLY` | Expo config / Xcode `uuid` via `@expo/config-plugins`. Not a PackProof user-evidence parser. | Owner: `nericollin@thepackproof.com`. Revisit when a compatible Expo SDK 57 path ships `uuid >=11.1.1`. |

The remaining high npm nodes (`expo`, `metro`, `react-native`, `react-native-purchases`, `react-native-reanimated`, `react-native-worklets`, and related packages) are **propagation of the `image-size` advisories**, not independent application vulns. Suggested “fixes” that downgrade Expo 57 or React Native 0.86 are incompatible with the frozen Android runtime and are not authorized.

## Firebase Functions (`npm --prefix functions audit --omit=dev`)

Zero critical, zero high, seven moderate package nodes. Unique advisory:

| Advisory | Severity | Classification | Reachability | Disposition |
|---|---|---|---|---|
| `GHSA-w5hq-g745-h8pq` (`uuid <11.1.1`) | moderate | `TRANSITIVE_GOOGLE_CLIENT` | `firebase-admin` / `@google-cloud/storage` / `gaxios` / `teeny-request`. Direct packages remain current `firebase-admin@14` and `firebase-functions@7`. | Do not force-override `uuid` in Google auth/Storage clients. Owner: `nericollin@thepackproof.com`. Revisit on the next compatible Admin SDK that lifts `uuid`. |

Functions high-severity CI remains blocking (`audit-level=high`). Root high findings are now a **policy gate**: new high/critical GHSAs fail CI unless added here with classification, owner, and expiry.

## Compensating controls

- Repository-controlled Metro assets only; no untrusted image input to the bundler.
- Metro/dev server is not a production service.
- Exact release APK inspection for Metro/`image-size` absence remains required before an immutable 1.0 Android tag.
- No `npm audit fix --force`.
