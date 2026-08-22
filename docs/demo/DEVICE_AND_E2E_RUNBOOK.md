# Device, two-party, fault, and integrity runbook

This runbook is owner-operated. Completing the source work in this repository does **not** mean AND-01–07, E2E-01–10, or live INT have passed.

Use one exact candidate APK. Record the identity chain before any phone is installed.

## Release identity (fill in; do not invent)

| Field | Value |
| --- | --- |
| Commit SHA | |
| APK SHA-256 | |
| Package version | |
| versionCode | |
| Signing certificate SHA-256 | |
| Functions revision | |
| Hosting revision | |
| Deployment timestamp | |

Do not demo from a local Metro server.

## Phase 5 — Exact Android candidate (AND-01–07)

Primary device: Galaxy S24 Ultra. Hostile device: Galaxy A16 5G.

On **both** devices, against the exact APK:

- install
- cold start
- sign in / sign out
- deep link
- camera permissions
- video capture
- barcode capture
- biometric confirmation
- background / resume
- network interruption
- upload recovery
- Proof opening
- PDF opening

An APK is not externally demonstrable until physical install, cold start, and logs are validated on that artifact.

## Phase 6 — Two-device story (E2E-01–10)

S24 Ultra = seller, A16 = buyer, then swap.

Run E2E-01 through E2E-10 with **no Firestore console edits**, no status nudges, and no manually generated IDs. Record the session.

## Phase 7 — Evidence queue abuse

Immediately after a happy path, during capture/upload:

- Wi-Fi off/on
- Wi-Fi → cellular
- force close
- reboot
- background several minutes
- expire session where practical
- kill during upload
- kill while awaiting finalization
- retry
- double-tap
- duplicate submission

A visible failure is acceptable. Silent evidence loss or false finalization is not.

## Phase 8 — Destructive evidence (INT)

Run the existing INT suite on staging: flip a byte, truncate, append, wrong MIME, duplicate upload, reused evidence ID, lost finalization response, duplicate Storage trigger.

Correct durable result: `QUARANTINED`, not `FINALIZED`.
