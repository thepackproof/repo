#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const checkOnly = process.argv.includes('--check');

function sha256File(path) {
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function git(command) {
  return execSync(command, { cwd: root, encoding: 'utf8' }).trim();
}

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const functionsPkg = JSON.parse(readFileSync(resolve(root, 'functions/package.json'), 'utf8'));
const portalPkg = JSON.parse(readFileSync(resolve(root, 'portal/package.json'), 'utf8'));

const manifest = {
  object: 'packproof_release_manifest',
  schemaVersion: 1,
  producerVersion: 'hc1-release-manifest@1',
  milestone: 'HC-1',
  packageVersion: pkg.version,
  gitCommitSha: git('git rev-parse HEAD'),
  generatedAt: new Date().toISOString(),
  packages: {
    app: pkg.version,
    functions: functionsPkg.version,
    portal: portalPkg.version,
  },
  lockfiles: {
    root: sha256File(resolve(root, 'package-lock.json')),
    functions: sha256File(resolve(root, 'functions/package-lock.json')),
    portal: sha256File(resolve(root, 'portal/package-lock.json')),
  },
  rules: {
    firestore: sha256File(resolve(root, 'firestore.rules')),
    storage: sha256File(resolve(root, 'storage.rules')),
  },
  openapi: sha256File(resolve(root, 'docs/openapi/packproof-api-v1.json')),
  runtimes: {
    nodeEngine: pkg.engines?.node ?? '22',
    expo: pkg.dependencies?.expo ?? null,
    reactNative: pkg.dependencies?.['react-native'] ?? null,
  },
  android: {
    versionName: pkg.version,
    versionCode: 7,
    packageName: 'com.packproof.app',
  },
  firebaseProjects: {
    sandbox: 'packproof-4cf53',
    production: 'thepackproof-prod',
  },
  notes: [
    'AAB/APK SHA-256, signing certificate, and Functions revision are filled at candidate freeze.',
    'This file is SOURCE_CHECKED identity, not device or live-backend evidence.',
  ],
};

const outPath = resolve(root, 'docs/releases/release-manifest.hc1.json');
const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

if (checkOnly) {
  if (!existsSync(outPath)) {
    console.error('release-manifest.hc1.json is missing. Run node scripts/write-release-manifest.mjs');
    process.exit(1);
  }
  const existing = JSON.parse(readFileSync(outPath, 'utf8'));
  const required = ['object', 'schemaVersion', 'milestone', 'packageVersion', 'gitCommitSha', 'lockfiles', 'rules'];
  for (const key of required) {
    if (!(key in existing)) {
      console.error(`release-manifest.hc1.json missing ${key}`);
      process.exit(1);
    }
  }
  if (existing.packageVersion !== pkg.version) {
    console.error(`release-manifest packageVersion ${existing.packageVersion} != ${pkg.version}`);
    process.exit(1);
  }
  console.log('HC-1 release manifest check passed.');
  process.exit(0);
}

writeFileSync(outPath, serialized);
console.log(`Wrote ${outPath}`);
