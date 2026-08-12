# Section 3 completion report - shared application services and ports

Status: completed at source and local-emulator level on 2026-08-11.

## Delivered

- Transport-neutral application errors, actors/events, merchant types and application ports.
- Merchant transaction create/get/list service moved out of the API namespace, with the old export retained for compatibility.
- Consumer draft-save service with quota, ownership and editable-state policy outside the Firebase callable.
- Commerce-context ingestion service that preserves the existing Connect response while creating an order-bound, provenance-bearing canonical context.
- Connect handoff/redemption service with expiry, token, claimant and replay policy outside the Firebase callable.
- Firebase repositories implementing atomic business-record, compatibility-record, participant-event and outbox writes.
- HMAC handoff-token issuer and constant-time SHA-256 token verifier behind application interfaces.
- Versioned `domainOutbox` event envelope and server-only Firestore-rule boundary.
- Canonical validation of every transaction constructed by the migrated services.
- Unit, HTTP-contract, negative-authorization, idempotency, replay, and Firestore-atomicity tests wired into CI.

## Active migration slice

The following existing transports now use the application layer:

- `/v1` merchant transaction create, get and list;
- `saveTransactionDraft` Firebase callable;
- Connect marketplace/order ingestion HTTP handler; and
- `redeemConnectSession` Firebase callable.

The following remain on existing direct implementations: invitations, participant joins, terms confirmation, evidence reservation/finalization, shipment commands, Return Passport commands, reports, notifications, account lifecycle, billing and most mobile read/query paths.

## Verification results

| Gate | Result |
|---|---|
| Shared application service unit tests | Passed: 4 tests, 0 failures |
| Shared application Firestore emulator | Passed: 2 tests, 0 failures |
| Canonical domain tests | Passed: 28 tests/subtests, 0 failures |
| Merchant API unit/OpenAPI tests | Passed: 11 tests, 0 failures |
| Merchant API Firestore emulator | Passed: 2 tests, 0 failures |
| Root TypeScript and Expo lint | Passed |
| Functions TypeScript/lint | Passed |
| Firebase export/Hosting rewrite smoke | Passed |
| Firestore and Storage rules emulators | Passed, including new server-only collection denials |
| Evidence-format and clean-room verifier regressions | Passed |
| Claim vocabulary, billing and Connect SDK regressions | Passed |
| Physical-validation posture analyzer | Ran successfully; developmental evidence remains insufficient and matcher remains disabled |

The Firebase CLI warned that it was not authenticated during emulator runs. The suites nevertheless completed successfully against local emulators. These results are `EMULATOR_CHECKED`, not proof of deployed Firebase behavior.

## Important limits

- No Firebase deployment, production/staging data migration, APK build, device test or third-party commerce-platform test was performed.
- The callable wrappers were compiled and export-smoke-tested; the service/repository paths were exercised directly against Firestore, not through a Functions emulator plus App Check/Auth token flow.
- The Connect HTTP facade itself was not exercised through live DNS validation and an authenticated deployed endpoint in this section.
- `domainOutbox` records are durable and atomic, but no dispatcher, lease, retry, replay, dead-letter or retention worker exists yet.
- The current consumer draft callable lacks an operation key and expected version, so last-writer semantics remain for concurrent editable drafts.
- The public commerce-context API, browser/checkout PackProof button and Shopify/WooCommerce/Magento adapters are not yet implemented.
- Current HMAC manifest authentication remains service-only; no public-signature claim changed.
- Physical correspondence remains `NO_VALIDATED_PHYSICAL_MATCHER_ENABLED`.

## Git and artifact state

No commit, tag, push, deployment or release artifact was created. Functions builds generated local `functions/lib/application`, `functions/lib/domain` and `functions/lib/infrastructure` output; TypeScript under `functions/src` remains the editable source of truth.
