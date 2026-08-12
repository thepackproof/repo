#!/usr/bin/env node
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createReadStream, readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { canonicalizeJson, createEvidenceBundleSha256, sha256Hex } from './evidence-format.mjs';

function usage() {
  console.error('Usage: node tools/verify-evidence.mjs MANIFEST.json ORIGINAL_FILE [--expected-manifest-sha256 HEX] [--expected-bundle-sha256 HEX] [--expected-mac-base64url VALUE]');
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.length < 2) usage();
const manifestPath = args.shift();
const originalPath = args.shift();
const options = {};
while (args.length) {
  const name = args.shift();
  const value = args.shift();
  if (!name?.startsWith('--') || value === undefined) usage();
  options[name.slice(2)] = value;
}

const rawManifest = readFileSync(manifestPath, 'utf8');
const parsedManifest = JSON.parse(rawManifest);
const canonicalManifest = canonicalizeJson(parsedManifest);
const manifestSha256 = sha256Hex(canonicalManifest);
const originalSha256 = await hashFile(originalPath);
const bundleSha256 = createEvidenceBundleSha256(originalSha256, manifestSha256);
const canonicalBytesMatched = Buffer.from(rawManifest).equals(Buffer.from(canonicalManifest));
const manifestFileHashMatched = parsedManifest?.evidence?.sha256 === originalSha256;

const checks = {
  manifestSchemaVersionMatched: parsedManifest?.schemaVersion === 2,
  canonicalizationProfileMatched: parsedManifest?.format?.canonicalizationProfile === 'PACKPROOF_JCS_1',
  bundleBindingProfileMatched: parsedManifest?.format?.bundleBindingProfile === 'PACKPROOF_EVIDENCE_BUNDLE_V2',
  manifestAuthenticationProfileMatched: parsedManifest?.authentication?.type === 'SERVICE_MAC'
    && parsedManifest?.authentication?.algorithm === 'HMAC-SHA256'
    && parsedManifest?.authentication?.verificationScope === 'PACKPROOF_SERVICE_ONLY'
    && parsedManifest?.authentication?.publicVerificationAvailable === false,
  canonicalBytesMatched,
  manifestFileHashMatched,
  expectedManifestSha256Matched: compareOptional(options['expected-manifest-sha256'], manifestSha256),
  expectedBundleSha256Matched: compareOptional(options['expected-bundle-sha256'], bundleSha256),
};

let serviceMac = {
  status: 'NOT_VERIFIED',
  reason: 'The manifest uses a PackProof service HMAC, not a publicly verifiable digital signature.',
};
if (options['expected-mac-base64url']) {
  const secret = process.env.PACKPROOF_MANIFEST_HMAC_SECRET;
  if (!secret) {
    serviceMac = { status: 'NOT_VERIFIED', reason: 'Set PACKPROOF_MANIFEST_HMAC_SECRET only in an authorized service verification environment.' };
  } else {
    const actual = createHmac('sha256', secret).update(canonicalManifest).digest();
    const expected = Buffer.from(options['expected-mac-base64url'], 'base64url');
    serviceMac = {
      status: actual.length === expected.length && timingSafeEqual(actual, expected) ? 'MATCHED' : 'MISMATCH',
      reason: 'Authorized service-secret verification was requested.',
    };
  }
}

const passed = Object.values(checks).every((value) => value !== false) && serviceMac.status !== 'MISMATCH';
console.log(JSON.stringify({
  verifier: 'packproof-evidence-verifier',
  verifierVersion: '2.0.0',
  files: { manifest: basename(manifestPath), original: basename(originalPath) },
  profiles: {
    manifestSchemaVersion: parsedManifest?.schemaVersion ?? null,
    canonicalization: parsedManifest?.format?.canonicalizationProfile ?? null,
    bundleBinding: parsedManifest?.format?.bundleBindingProfile ?? null,
  },
  digests: { originalSha256, manifestSha256, bundleSha256 },
  checks,
  serviceMac,
  physicalCorrespondence: parsedManifest?.assurance?.physicalCorrespondence ?? { status: 'NOT_AVAILABLE' },
  passed,
}, null, 2));
process.exitCode = passed ? 0 : 1;

function compareOptional(expected, actual) {
  return expected === undefined ? null : String(expected).toLowerCase() === actual;
}

async function hashFile(path) {
  const { createHash } = await import('node:crypto');
  const digest = createHash('sha256');
  await new Promise((resolve, reject) => createReadStream(path).on('data', (chunk) => digest.update(chunk)).on('error', reject).on('end', resolve));
  return digest.digest('hex');
}
