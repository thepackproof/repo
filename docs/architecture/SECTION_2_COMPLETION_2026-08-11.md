# Section 2 completion report - canonical domain foundation

Status: completed at the source and local-emulator level on 2026-08-11.

## Delivered

- Pure canonical v1 domain package under `functions/src/domain/v1`.
- Seventeen versioned resource families with distinct internal and public DTO types.
- Strict runtime parsing, unknown-field rejection, bounded JSON/text/collection handling, HTTPS URL policy and explicit validation errors.
- Kind-bound opaque identifier rules with opt-in legacy Firestore compatibility.
- Commerce context, field provenance, authoritative-source policy and passport-draft boundary for future PackProof-button integrations.
- Transaction, participant claim, evidence session/artifact/manifest, shipment, Return Passport, organization/integration/API-client, report, webhook and audit contracts.
- Nine explicit lifecycle transition tables, including evidence failure/quarantine and webhook retry/dead-letter behavior.
- Executable resource catalog declaring persistence intent, tenant boundary, idempotency semantics, audit events and internal sensitive fields.
- Compatibility mapping for the current consumer Firebase and merchant REST transaction representations.
- `npm run test:domain` and CI integration.
- Canonical-domain architecture, trust, activation and migration documentation.

## Verification results

| Gate | Result |
|---|---|
| Canonical domain build/tests | Passed: 28 tests/subtests, 0 failures |
| Root TypeScript | Passed |
| Root Expo lint | Passed |
| Functions TypeScript/lint | Passed |
| Merchant API unit/OpenAPI | Passed: 11 tests, 0 failures |
| Merchant API Firestore emulator | Passed: 2 tests, 0 failures |
| Firebase export/Hosting rewrite smoke | Passed |
| Firestore and Storage rules emulators | Passed |
| Evidence-format producer/verifier conformance | Passed |
| Clean-room verifier and one-byte mutation | Passed |
| Production claim vocabulary | Passed |
| RevenueCat billing reducer regressions | Passed |
| PackProof Connect SDK/exact-body HMAC | Passed |
| Physical-validation posture analyzer | Ran successfully; developmental data remains insufficient, matcher remains disabled |

The Firebase CLI reported that it was not authenticated during local emulator execution. This did not prevent the emulator suites from passing, but the results are local emulator evidence, not proof of deployed-project behavior.

## Activation boundary

The new domain package is compiled and tested in parallel with the active implementation. `functions/src/index.ts` and existing mobile, callable, REST, Connect and Firestore paths have not been switched to it in Section 2. No data migration, deployment, APK build or device test was performed.

The next dependency-ordered section is shared application services and ports. It should make the current callable, REST and Connect transports invoke one policy core through compatibility adapters before any commerce-platform-specific button is activated.

## Evidence vocabulary

- Domain/source tests: `SOURCE_CHECKED`.
- Firestore/Storage/API persistence behavior exercised locally: `EMULATOR_CHECKED`.
- Deployed backend: not yet tested for Section 2.
- Commerce platform/button: not yet implemented or tested.
- Exact Android binary/device: not tested in Section 2.
- Physical matcher: `NO_VALIDATED_PHYSICAL_MATCHER_ENABLED`.
