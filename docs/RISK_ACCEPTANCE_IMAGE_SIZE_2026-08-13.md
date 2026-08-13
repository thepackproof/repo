# Time-bounded security risk acceptance - Metro image-size advisories

## Decision

`APPROVED`

- Acceptance owner: `nericollin@thepackproof.com`, PackProof internal security acceptance owner
- Recorded: 2026-08-13
- Expiration: 2026-11-13, or immediately when a compatible patched release becomes available, whichever occurs first
- Scope: the two denial-of-service advisories affecting `image-size@1.2.1` reached only through PackProof's Metro build tooling

## Accepted advisories

- `GHSA-w3rx-r6r6-pgpr`: ICNS parsing can enter an infinite loop.
- `GHSA-5p2g-fcmc-qvqq`: JXL and HEIF parsing can enter infinite loops.

The current dependency path is `expo -> @expo/metro-config -> @expo/metro -> metro@0.84.4 -> image-size@1.2.1`. PackProof application source does not import `image-size`. This acceptance does not classify the advisories as fixed and does not apply to any future application-runtime, backend-runtime or user-evidence processing path.

## Mandatory conditions

This acceptance is valid only while all of the following remain true:

1. Metro processes repository-controlled build assets only.
2. No untrusted, user-uploaded or externally supplied image is introduced into Metro's asset-processing inputs.
3. The Metro development server is not exposed as a production service.
4. The advisories and available `image-size`, Metro and Expo versions are rechecked on every dependency update.
5. The exact release APK is inspected to confirm that Node-side Metro and `image-size` code are not shipped in the installed Android artifact.
6. No critical or high vulnerability becomes reachable in the installed Android runtime through this dependency path.
7. No `npm audit fix --force` or unvalidated transitive override is used to claim remediation.

## Automatic revocation and stop conditions

The acceptance ends immediately if any mandatory condition becomes false, if a compatible patched release becomes available, if the advisory scope or severity materially changes, if Metro is exposed to untrusted build input, or if exact-APK inspection finds the affected Node-side implementation in the shipped artifact.

On expiration or revocation, PackProof must upgrade to a compatible patched dependency, isolate/replace the affected build path, or obtain a new evidence-backed decision. This record does not renew automatically.

## Required release evidence

Before this acceptance can support an immutable Android release candidate, the execution record must identify the exact source commit/tree, lockfile hashes, APK hash, signing certificate, build profile, package/version/code, and APK inspection result for Metro/`image-size` absence.
