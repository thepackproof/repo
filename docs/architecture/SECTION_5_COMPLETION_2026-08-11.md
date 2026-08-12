# Section 5 completion record — 2026-08-11

Section 5, “Complete capture-session and participant-claim APIs,” is source-complete and locally/emulator tested.

Implemented:

- six versioned REST operations for invitation, explicit claim, evidence-session issue/read/redeem/cancel;
- Firebase user plus App Check participant authentication;
- actor-, role-, purpose-, artifact-, profile-, expiry-, and redemption-bound authorization;
- purpose-separated one-time tokens stored only as digests;
- atomic Firestore persistence, legacy transaction bindings, timeline records, audit entries, and outbox events;
- reuse of the existing nonce-backed native `captureSessions` acquisition path;
- App Links/hosted bridges and native screens for claim and redemption;
- upload-time enforcement of the evidence-session artifact allowlist;
- server-only Firestore Rules for internal claim/session resources;
- OpenAPI 3.1 coverage and source/emulator regression tests.

During Firestore emulator proof, exact invitation replay exposed an internal/public projection defect: storage-only fields were passed into the strict DTO parser. The repository now explicitly allowlists public projection fields, preventing both the replay failure and accidental leakage of organization, actor, hash, or operation metadata.

Validation completed:

- domain DTO/state contract tests: 28/28 passed;
- application-service tests: 8/8 passed;
- API/OpenAPI tests: 14/14 passed;
- application-to-Firestore emulator tests: 4/4 passed;
- HTTP-to-Firestore emulator tests: 4/4 passed;
- Firestore and Storage Rules tests: passed;
- Firebase HTTP/callable export and secret-binding smoke tests: passed;
- app TypeScript, Expo lint, Button/Connect SDK, evidence-format, clean-room verifier, billing, and production-claim vocabulary regressions: passed.

Evidence status: passed in source and Firestore emulator. Not deployed; not tested with live Firebase identity/App Check; not tested on a physical device; evidence upload/finalization remains outside Section 5.

See [`PARTICIPANT_CLAIM_AND_EVIDENCE_SESSION_V1.md`](PARTICIPANT_CLAIM_AND_EVIDENCE_SESSION_V1.md) for the architecture, invariants, threat decisions, and proof boundaries.
