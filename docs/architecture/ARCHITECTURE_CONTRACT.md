# PackProof architecture contract

Status: accepted for controlled migration on 2026-08-11.

## 1. Purpose

PackProof will evolve incrementally from the current Android/Firebase implementation. Existing working behavior is preserved behind compatibility adapters until a replacement path has passed equivalent tests. A wholesale rewrite is not authorized by this contract.

The target is one domain and application-service core serving mobile, REST, PackProof Connect, commerce adapters, background processing, reports and webhooks.

## 2. Dependency direction

The allowed dependency direction is:

```text
presentation and transport adapters
                -> application services
                -> domain model and policies

infrastructure adapters -> application/domain ports
composition roots       -> concrete adapters and services
```

The domain layer must not import React, React Native, Expo, Express, Firebase Functions, Firestore, Cloud Storage or platform SDKs. Application services may depend on domain types and ports, but not on concrete Firebase or commerce-platform implementations.

Presentation components and transport handlers must not own core state-transition rules. Infrastructure adapters must not invent business policy.

## 3. Canonical resource families

All product surfaces will converge on versioned representations of:

- organizations, integrations and API clients;
- commerce contexts and passport drafts;
- transactions and participant claims;
- evidence sessions, artifacts and manifests;
- shipments and Return Passports;
- assurance assessments and evidence reports;
- webhook endpoints, events and deliveries; and
- audit events.

Persistence records and public DTOs are separate types. A Firestore document must never be serialized directly to an external caller.

## 4. Transport rule

Firebase callable functions, REST routes, scheduled jobs, Storage/Firestore triggers, PackProof Connect and platform adapters are transports or infrastructure. They must invoke the same application services.

No new feature may implement one set of rules for mobile and a second set for merchants. Connect remains compatible while its behavior is migrated behind the versioned service layer.

## 5. Commerce-context and provenance rule

Imported catalog, listing, cart and order data is a versioned commerce-context snapshot, not anonymous transaction text.

Every externally supplied field must retain:

- the asserting source;
- the source trust class;
- import time;
- external reference where appropriate;
- canonical payload or field digest where defined; and
- any later participant confirmation or correction as a separate assertion.

The original imported snapshot is immutable after claim or order binding. Corrections supersede it through explicit lineage; they do not rewrite history.

Browser or page-declared data may prefill a draft. It cannot establish payment, an authoritative order, a buyer identity, custody, physical truth or product authenticity. Merchant-server or platform-API confirmation is required for authoritative order binding.

## 6. Identity and authorization rule

Every protected resource is tenant- and resource-authorized on the server. IDs, email addresses, marketplace user IDs, merchant references, handoff links and participant labels do not grant access.

An external participant reference becomes a PackProof actor only through an explicit, bounded claim operation. App Check and device context augment authenticated identity; they do not replace it.

No merchant secret, API credential, webhook secret, signing secret or unrestricted bearer token may be embedded in a browser bundle or mobile application.

## 7. Mutation, idempotency and event rule

State transitions are explicit commands checked by domain policy. Externally retryable mutations require idempotency semantics and stable resource identity.

A successful state mutation and its domain event must be committed atomically where the infrastructure permits. External delivery is at least once. Event consumers and webhook receivers must be idempotent. Side-effect failure must not silently roll back a committed domain fact.

Audit events use stable IDs, schema versions, actor, tenant, resource, request ID and server time. Sensitive media, secrets and unnecessary personal data are excluded from logs.

## 8. Evidence rule

The client is untrusted. Evidence completion requires an observable server-finalized evidence record, not a review screen, local encryption, an upload grant or a Storage upload alone.

Original bytes, hashes, declared/detected type comparisons, manifest bytes, manifest digest, bundle binding, assurance dimensions and finalization state must remain distinguishable. Integrity mismatch is preserved and quarantined; it is not converted into success or silently deleted.

Offline ciphertext is retained until finalization becomes observable or the user explicitly discards an eligible queue item. Clearing application data or losing the installation-specific Keystore context can make unsynchronized evidence unrecoverable and must remain disclosed.

## 9. Assurance and claim rule

The system keeps these dimensions independent:

- acquisition quality;
- app/device context;
- byte integrity;
- physical correspondence;
- carrier context; and
- business/legal relevance.

Missing capability is reported as `NOT_EVALUATED`, `NOT_AVAILABLE` or `REVIEW_REQUIRED`; it is never inferred as passed. A merchant assertion, participant assertion, technical observation, integrity result, physical-match result and legal/business conclusion are different claim classes.

No production physical `MATCH` or `NON_MATCH` may be emitted until a frozen matcher, eligibility rules, thresholds and independent validation have passed the defined scientific gate.

## 10. Cryptographic rule

Use reviewed platform cryptography and deterministic serialization. Do not invent cryptographic primitives.

The current manifest HMAC is service-only authentication using a shared secret. It is not described as a publicly verifiable digital signature. A future asymmetric KMS/HSM signer must use an explicit authentication type, key version, public-key status and historical verification policy; it must not silently reinterpret old HMAC records.

## 11. Generated artifacts and source provenance

TypeScript under `functions/src` is the backend source of truth. `functions/lib` is generated output. The target policy is to build it in CI and Firebase predeploy, exclude it from review-oriented source commits, and verify that clean checkout deployment still works before removing it from tracking.

APK, AAB, native symbols, mappings, emulator state, reports generated from tests and release bundles are artifacts, not source. An artifact is a production release only when its exact digest, source commit, configuration identity, signing identity and acceptance evidence are recorded.

Line-ending policy must be explicit through `.gitattributes` in a dedicated mechanical checkpoint; normalization must not be mixed with functional changes.

## 12. Compatibility and migration rule

- Existing consumer records remain readable during migration.
- Breaking external contract changes require a new API or event version.
- Existing Connect response names may remain as documented compatibility aliases.
- Old queue container versions remain readable for migration where already supported.
- Legacy paths are removed only after the replacement is tested and all callers are migrated.

## 13. Test and acceptance vocabulary

Source, emulator, deployed backend, exact binary, device behavior and third-party integration are separate gates.

Use only:

- `SOURCE_CHECKED` for source/static/local contract evidence;
- `EMULATOR_CHECKED` for emulator behavior;
- `Passed on device/live environment` with exact identity and evidence;
- `Failed with concrete evidence`; or
- `Not yet tested`.

No source or emulator result is promoted into a live-runtime claim.

## 14. PackProof Enterprise acquisition surface

PackProof Enterprise is another trusted evidence-acquisition channel that feeds this same core. It does not replace native capture, Connect, Evidence Format v2, or server finalization.

The Enterprise boundary is defined in [`ENTERPRISE_ARCHITECTURE_CONTRACT_V1.md`](ENTERPRISE_ARCHITECTURE_CONTRACT_V1.md) and [`ADR 0012`](../adr/0012-packproof-enterprise-acquisition-surface.md). The governing invariant is `acquisition source ≠ authority to finalize evidence`. `NATIVE_MOBILE`, `ENTERPRISE_EDGE`, and `EXTERNAL_DECLARED` never silently receive equal assurance.

Current activation is `SOURCE_CHECKED` through application-layer Evidence Format v2 finalization for Enterprise artifacts. Live warehouse deployment is not claimed.
