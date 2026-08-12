import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { canonicalizeJson, createEvidenceBundleSha256, sha256Hex } from '../tools/evidence-format.mjs';

const run = promisify(execFile);
const directory = await mkdtemp(join(tmpdir(), 'packproof-verifier-'));
try {
  const original = Buffer.from('%PDF-1.4\n% PackProof verifier fixture\n', 'utf8');
  const originalPath = join(directory, 'original.pdf');
  const manifestPath = join(directory, 'manifest.json');
  const originalSha256 = sha256Hex(original);
  const manifest = {
    schemaVersion: 2,
    format: {
      canonicalizationProfile: 'PACKPROOF_JCS_1',
      canonicalizationStandard: 'RFC8785_JCS',
      bundleBindingProfile: 'PACKPROOF_EVIDENCE_BUNDLE_V2',
    },
    evidence: { sha256: originalSha256 },
    assurance: { physicalCorrespondence: { status: 'NOT_AVAILABLE' } },
    authentication: {
      type: 'SERVICE_MAC',
      algorithm: 'HMAC-SHA256',
      keyId: 'manifest-hmac-test-v1',
      verificationScope: 'PACKPROOF_SERVICE_ONLY',
      publicVerificationAvailable: false,
    },
  };
  const canonical = canonicalizeJson(manifest);
  const manifestSha256 = sha256Hex(canonical);
  const bundleSha256 = createEvidenceBundleSha256(originalSha256, manifestSha256);
  await Promise.all([writeFile(originalPath, original), writeFile(manifestPath, canonical)]);

  const verified = await run(process.execPath, [
    'tools/verify-evidence.mjs',
    manifestPath,
    originalPath,
    '--expected-manifest-sha256',
    manifestSha256,
    '--expected-bundle-sha256',
    bundleSha256,
  ], { cwd: new URL('..', import.meta.url) });
  const report = JSON.parse(verified.stdout);
  assert.equal(report.passed, true);
  assert.ok(Object.values(report.checks).every((value) => value !== false));
  assert.equal(report.serviceMac.status, 'NOT_VERIFIED');
  assert.equal(report.physicalCorrespondence.status, 'NOT_AVAILABLE');

  await writeFile(originalPath, Buffer.concat([original, Buffer.from([0])]));
  await assert.rejects(
    run(process.execPath, ['tools/verify-evidence.mjs', manifestPath, originalPath], { cwd: new URL('..', import.meta.url) }),
    (error) => error && typeof error === 'object' && 'code' in error && error.code === 1,
  );
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('PackProof clean-room evidence verifier positive and one-byte-mutation tests passed.');
