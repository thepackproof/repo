# Deployment identity for PackProof 1.0

Current sandbox deploy in GitHub Actions still uses the long-lived `FIREBASE_TOKEN` secret when `ENABLE_SANDBOX_DEPLOY` is true. That path is the recorded 2026-08-16 sandbox operator method. It is not the production end-state.

## Verified GitHub controls - 2026-08-16

Queried against `thepackproof/repo` with an authenticated GitHub CLI. This is `SOURCE_CHECKED` repository-administration evidence, not a production-deploy identity.

| Control | Observed |
|---|---|
| Default branch | `master` |
| Branch protection | Present and `enforce_admins` enabled |
| Required status checks | `source-and-api`, `Analyze (actions)`, `Analyze (javascript-typescript)`; strict (branch must be up to date) |
| Pull-request reviews | Required; stale reviews dismissed; required approving review count is **0** |
| Linear history / force push | Linear history required; force pushes and branch deletion blocked |
| Conversation resolution | Required |
| `sandbox` environment | Present; deployment limited to protected branches |
| `production` environment | **Absent** (HTTP 404) |
| Firebase projects visible to the operator CLI | Only `packproof-4cf53` |

## Required production destination

- Distinct sandbox and production Google Cloud / Firebase projects.
- Distinct deploy identities; production must not reuse the sandbox token.
- GitHub OIDC federated to Google Cloud Workload Identity Federation.
- Protected GitHub `sandbox` and `production` environments with release-captain approval on production.
- Secret Manager bindings by name/version only; values never in source or mobile/browser bundles.

## CI posture after 1.0 hardening

The deploy job now requests `id-token: write` so WIF can replace `FIREBASE_TOKEN` without a second workflow rewrite. Switching the live deploy command requires:

1. A named production project (none exists as of 2026-08-16 operator confirmation: only `packproof-4cf53`).
2. Workload Identity Federation pool/provider and a deploy service account with least privilege.
3. GitHub environment secrets for project IDs only.
4. A rehearsal that deploys sandbox from OIDC, then a rollback identity capture.
5. A GitHub `production` environment with release-captain approval (not present).
6. A non-zero required reviewing count if owner policy wants human review before merge.

Until that owner work lands, sandbox deploy remains token-based and production deploy remains unauthorized.
