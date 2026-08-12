# PackProof 0.3.0 checkpoint plan

Status: proposed; no commit, tag, push, deletion, index change or line-ending normalization was performed by Section 1.

## Problem

Git HEAD is the supplied 0.2.1 baseline, while the working tree contains the broad 0.3.0 application, evidence, API, documentation, test and brand work. Pretending this is an ordinary atomic feature diff would create false history. Splitting it blindly could also separate interdependent source, tests and contracts.

The goal is an honest consolidation checkpoint from which future changes become small and reviewable.

## Preconditions

Before any baseline commit:

1. Preserve the exact dirty state outside Git with a recoverable archive or binary patch plus a manifest of untracked files.
2. Record the archive/patch SHA-256 outside the source tree.
3. Re-run the Section 1 gates from a clean dependency installation where practical.
4. Review every untracked path for secrets, caches, personal data and generated output.
5. Confirm the deleted `scripts/reset-project.js` is intentional.
6. Confirm ownership and intended inclusion of the new brand assets.
7. Decide whether the missing historical quality-review file should be restored from an authoritative source or remain documented as missing.

## Proposed checkpoint sequence

### Checkpoint A - historical consolidation

Suggested message:

```text
baseline: consolidate PackProof 0.3.0 working source
```

Purpose:

- preserve the current functioning 0.3.0 body of work as one explicitly non-atomic historical consolidation;
- include source, contracts, tests, rules, configuration examples, SDK and required assets;
- exclude ignored secrets, local Firebase identity, dependencies, emulator output, APK/AAB files and workspace archives;
- record the full validation table in the commit body or linked baseline document.

Because `functions/lib` is already tracked in the 0.2.1 history, retain its matching generated state in this consolidation rather than combining baseline preservation with a tracking-policy change.

Do not create a release tag from this commit. It is a source checkpoint, not a production release.

### Checkpoint B - generated-output policy

Suggested message:

```text
build: generate Firebase Functions output in CI and predeploy
```

Steps:

1. Add `functions/lib/` to `.gitignore`.
2. Remove it from Git tracking without deleting the locally reproducible source.
3. Start from a clean checkout.
4. Run `npm ci` and `npm --prefix functions ci`.
5. Build Functions.
6. Run API, Firebase export, evidence and emulator tests.
7. Rehearse the Firebase packaging/deploy command without changing a live environment, or use an isolated test project when deployment proof is required.

Rollback is the previous commit plus a normal TypeScript rebuild.

### Checkpoint C - line-ending normalization

Suggested message:

```text
chore: define repository line-ending policy
```

Steps:

1. Add a reviewed `.gitattributes` policy.
2. Use LF for source, JSON, YAML, Markdown and shell-neutral scripts; reserve CRLF only for formats that require it.
3. Run `git add --renormalize .` in this dedicated checkpoint.
4. Verify the diff is mechanical.
5. Re-run typecheck, lint, build and tests.

No functional edit belongs in this checkpoint.

### Checkpoint D - architecture governance

Suggested message:

```text
docs: establish unified PackProof architecture contract
```

Include the Section 1 architecture contract, ADRs, baseline, migration map and checkpoint plan. If these documents are included in Checkpoint A for preservation, this separate checkpoint is unnecessary; do not duplicate them.

### Checkpoint E - dependency-risk workstream

Do not run `npm audit fix --force`. Create dependency cohorts aligned with Expo/React Native compatibility, update one cohort at a time, build an Android release variant, and exercise native startup/camera/Keystore behavior before accepting each cohort.

## Proposed tag policy

- `baseline/0.3.0-source-checked` may be created only after the consolidation commit exists and source/emulator gates pass from that commit.
- A tag containing `release` requires exact binary digest, source commit, configuration/Firebase identity, signing identity and acceptance results.
- Production release tags must be annotated and must link to a release evidence manifest.

## Proposed branch policy

After consolidation:

- protect `main` or rename/protect the current primary branch deliberately;
- require the CI baseline on pull requests;
- forbid direct inclusion of secrets and release binaries;
- use short-lived section branches where helpful;
- keep one owner for schema migrations, deployments, secrets/IAM, releases and device control.

## Decision required before execution

The checkpoint sequence changes Git history/index state and therefore requires explicit confirmation after reviewing Section 1. Section 1 itself leaves all existing source changes unstaged and uncommitted.
