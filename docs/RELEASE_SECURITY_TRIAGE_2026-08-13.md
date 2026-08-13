# PackProof release security triage - 2026-08-13

## Scope and proof boundary

This record evaluates the current PackProof 0.3.0 source snapshot from base commit `7acf79489e9b5b6c78f9a6b8ae64d529cd9b0e3b` in an isolated detached worktree. It is a release-candidate input, not an assertion that the dirty development checkout is an immutable candidate or that a new APK has been signed.

No dependency was automatically upgraded, no `npm audit fix --force` was run, and no Firebase, GitHub, device or production state was changed during this triage.

## Clean validation result

The isolated worktree passed deterministic root and Functions `npm ci`, root typecheck and lint, Functions TypeScript build, OpenAPI generation, 28 domain tests, 8 application tests, 14 API/OpenAPI tests, Function export/secret-binding/Hosting rewrite smoke tests, Firestore/Storage rules tests, 8 Firestore-backed API/idempotency/webhook tests, 4 Firestore-backed application tests, evidence-format vectors, clean-room verifier mutation tests, production-claims checks, billing tests, SDK/browser tests and the Android signing-plugin regression tests.

An Android production export completed with 2,325 bundled modules and one 6.9 MB Hermes bundle. A subsequent direct `expo config --type public --json` check parsed the configuration successfully and reported package `com.packproof.app`, version `0.3.0` and the expected `./google-services.json` path.

## Secret-pattern scan

A content-redacting scan covered 513 tracked and untracked text files. No private key, GitHub token, AWS access key, Google API key, Stripe secret key or Slack token pattern was found. Three generic literal-secret detections occurred in `scripts/test-sdk.mjs` at lines 20, 39 and 55. All three carry explicit test/fixture markers and none matches a known provider credential shape. They are accepted as deterministic test fixtures, not release secrets.

This scanner is a bounded pattern check, not a substitute for Git-history scanning or a dedicated secret-scanning service.

## Root and mobile dependency findings

`npm audit --omit=dev` reports 15 high and 9 moderate package nodes, with zero critical findings. The root package model declares Expo/Metro and React Native packages as runtime dependencies, so npm's omit-dev classification does not mean every reported Node package is embedded in the APK.

The 15 high nodes reduce to two underlying advisories, both affecting `image-size@1.2.1`:

- `GHSA-w3rx-r6r6-pgpr`: ICNS parsing can enter an infinite loop;
- `GHSA-5p2g-fcmc-qvqq`: JXL and HEIF parsing can enter infinite loops.

The dependency path is `expo -> @expo/metro-config -> @expo/metro -> metro@0.84.4 -> image-size@1.2.1`. PackProof application source does not import `image-size`. Metro uses it as Node-side asset/build tooling. The fresh Android export bundled successfully, and no JavaScript source reference to the package was identified. A raw substring search over Hermes bytecode is not an authoritative module-reachability test because short format strings can occur coincidentally in binary data.

At the time of this check, the registry's latest `image-size` is `2.0.2`, and npm marks versions through `2.0.2` affected. There is therefore no published patched version to select. The practical exposure is untrusted or malicious image input supplied to the build/dev-server asset pipeline, not ordinary PackProof user evidence handled by the installed Android application. Until upstream publishes a compatible fix, build inputs must remain repository-controlled and Metro must not process untrusted uploaded images.

The internal security owner approved a time-bounded build-tooling acceptance on 2026-08-13. It expires on 2026-11-13 or immediately when a compatible patched release becomes available, whichever occurs first. Mandatory conditions include repository-controlled Metro assets, no untrusted image inputs, no production exposure of the development server, rechecking on every dependency update and inspection of the exact signed APK for absence of Node-side Metro/`image-size` code. The complete decision is recorded in `docs/RISK_ACCEPTANCE_IMAGE_SIZE_2026-08-13.md`.

The nine moderate root package nodes reduce primarily to the `uuid <11.1.1` buffer-bound advisory propagated through Expo configuration/Xcode tooling. They require remediation tracking but are not currently classified as a remotely reachable Android application path.

## Firebase Functions dependency findings

The Functions runtime audit reports zero critical, zero high and seven moderate package nodes. Those nodes reduce to the `uuid <11.1.1` advisory through Google HTTP and Storage client chains, including `gaxios`, `teeny-request`, `retry-request`, `@google-cloud/storage`, `firebase-admin` and `firebase-functions`.

The direct packages are already `firebase-admin@14.2.0` and `firebase-functions@7.3.2`, which were the current registry versions checked during triage. The vulnerable `uuid@9.0.1` is transitive. No forced override was applied because an incompatible override in Google authentication or Storage request libraries could create a more serious runtime failure. Track the upstream dependency update; evaluate an override only with the complete Functions and live Storage regression suite.

## SBOM and reproducibility

CycloneDX runtime inventories were generated outside the repository:

- root/mobile dependency model: 388 components and 389 dependency relationships;
- Firebase Functions runtime: 281 components and 282 dependency relationships.

The Functions package lacked a version, which prevented npm from constructing a package URL and generating its SBOM. `functions/package.json` and its lockfile now declare version `0.3.0`, matching the application. A fresh Functions `npm ci`, build and export-metadata test passed after this metadata-only correction.

Repeated runs produced identical tree digests for:

- compiled `functions/lib`;
- generated JavaScript OpenAPI client;
- generated PackProof Button SDK.

The generated OpenAPI and Button SDK trees match tracked semantic content. The only semantic `functions/lib` change is the expected compiled output for the new public Cloud Run invoker declaration in `functions/src/api/v1/production.ts`. `functions/lib` remains tracked for the current release and must be regenerated and committed with its TypeScript source.

## Repository and release blockers

- A `.gitattributes` policy now defines LF for source/configuration/generated text, CRLF for Windows command files and explicit binary types. It does not mass-renormalize the current dirty checkout.
- `public/terms.html` still contains legal-entity, liability, indemnity and dispute placeholders. This does not block coding or internal sandbox work, but it blocks public 1.0 release publication.
- The tested source set is committed on candidate branch `agent/android-release-candidate-0.3.0`. The candidate commit contains 30 explicitly staged files, no deletions and none of the unrelated Word-document removals or local artifacts from the development checkout. Its exact commit and tree IDs are release-provenance inputs and must be taken from Git after the final documentation amendment.
- Protected sandbox signing variables are absent from the current environment. No new signed APK can be produced until the four required values are supplied through the protected signing environment; unrelated credentials must not be reused.

## Current disposition

- clean compiler, test and emulator suite: `PASSED`;
- critical dependency findings: `PASSED` at zero;
- high Functions runtime findings: `PASSED` at zero;
- root/mobile high findings: `TIME_BOUNDED_ACCEPTANCE_APPROVED` through 2026-11-13, subject to the recorded conditions and immediate-expiration triggers;
- secret-pattern review: `PASSED_WITH_THREE_TEST_FIXTURES_REVIEWED`;
- generated-artifact determinism: `PASSED`;
- runtime SBOM generation: `PASSED`;
- immutable candidate source commit: `CREATED_ON_CANDIDATE_BRANCH`;
- annotated release-candidate tag: `NOT_YET_CREATED`; tag only after the exact signed APK and device regression pass;
- fresh signed APK from this exact snapshot: `BLOCKED_BY_PROTECTED_SIGNING_INPUTS`;
- public legal-text completion: `PENDING_EXTERNAL_REVIEW`, non-blocking for coding and internal validation.
