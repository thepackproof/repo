# PackProof 0.2.1 remediation report

> **Historical record — superseded for release decisions.** This report documents a 0.2.0-to-0.2.1 source correction. “Externally demonstrable” was not established by the later real-device startup result, and this file is not evidence for 0.3.0 deployment or runtime acceptance.

This snapshot was intended as the externally demonstrable correction of the 0.2.0 source handoff.

## Build and dependency corrections

- Fixed the capture result type and Cloud Functions callable-options type errors.
- Aligned Expo SDK 57 dependencies and added the missing `expo-dev-client` runtime.
- Added the required `expo-image` configuration plugin.
- Removed the project-local EAS CLI dependency and pinned EAS CLI in operational wrappers.
- Standardized the supported runtime on Node 22 and fixed the Windows-compatible emulator test command.

## Security and privacy corrections

- Enforced create-only evidence uploads with an explicit `resource == null` Storage rule.
- Prevented online App Check failures from silently becoming offline/unattested captures.
- Deleted both evidence objects and their then-described HMAC-authenticated manifests during account purge.
- Invalidated and deleted generated dossier PDFs for every transaction affected by account deletion.
- Expanded account JSON export to include Return Passport and packet metadata.
- Added certificate-validated Android App Links generation and ensured Firebase Hosting publishes `/.well-known`.

## Real workflow corrections

- Added seller editing for unlocked proposed terms.
- Added audited seller cancellation before terms lock.
- Removed unsupported Pro claims about resolution, retention, packet access, and priority support.
- Made Facebook, TikTok, and RevenueCat explicit feature gates so unconfigured integrations are hidden rather than broken.
- Made optional backend integrations deployable without fake secret values.

## Operations corrections

- Replaced the invalid Firebase parameter command with generated Functions environment configuration.
- Added an idempotent configuration helper that preserves prior values and finalizes public identity placeholders.
- Added a doctor that cross-checks service files, package identity, optional feature dependencies, Functions URLs, and App Links.
- Added a public-DNS-validated PackProof Connect provisioning CLI that prints one-time vendor credentials.
- Added `EXTERNAL_DEMO.md` as the authoritative real-environment build, deployment, rehearsal, and troubleshooting procedure.
