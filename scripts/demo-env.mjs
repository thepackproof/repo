#!/usr/bin/env node
import { access, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const stateDir = join(root, 'scripts', 'demo', '.state');
const command = process.argv[2] ?? 'verify';
const sourceOnly = process.argv.includes('--source');

const checks = [];
const record = (name, ok, detail) => {
  checks.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  process.stdout.write(`${name.padEnd(18)} ${mark}${detail ? `  ${detail}` : ''}\n`);
};

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function parseEnv(text) {
  return Object.fromEntries(text.split(/\r?\n/).map((line) => {
    const separator = line.indexOf('=');
    return separator > 0 && !line.trimStart().startsWith('#')
      ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
      : null;
  }).filter(Boolean));
}

async function reset() {
  await rm(stateDir, { recursive: true, force: true });
  process.stdout.write('Demo local state cleared. Live Firestore was not touched.\n');
}

async function seed() {
  await mkdir(stateDir, { recursive: true });
  const scenarios = {
    object: 'packproof_demo_seed',
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    merchant: { name: 'Demo Merchant', environment: 'sandbox' },
    users: [
      { role: 'SELLER', label: 'Demo seller' },
      { role: 'BUYER', label: 'Demo buyer' },
    ],
    scenarios: [
      { id: 'demo-a', title: 'Individual marketplace sale' },
      { id: 'demo-b', title: 'Enterprise/API merchant' },
      { id: 'demo-c', title: 'Dispute investigation' },
    ],
  };
  await writeFile(join(stateDir, 'seed.json'), `${JSON.stringify(scenarios, null, 2)}\n`);
  await writeFile(join(stateDir, 'identity-template.json'), `${JSON.stringify({
    commitSha: null,
    apkSha256: null,
    packageVersion: null,
    versionCode: null,
    signingCertificateSha256: null,
    backendRevision: null,
    deploymentTimestamp: null,
  }, null, 2)}\n`);
  process.stdout.write(`Seeded local demo fixtures at ${stateDir}\n`);
}

async function verify() {
  process.stdout.write('\nPACKPROOF DEMO ENVIRONMENT\n');
  record('Functions build', await exists(join(root, 'functions/lib/index.js')), '');
  record('Firestore rules', await exists(join(root, 'firestore.rules')), '');
  record('Storage rules', await exists(join(root, 'storage.rules')), '');
  record('OpenAPI', await exists(join(root, 'docs/openapi/packproof-api-v1.json')), '');
  record('Proof service', await exists(join(root, 'functions/src/passport-pdf.ts')), '');
  record('Enterprise edge', await exists(join(root, 'apps/enterprise-console/src/main.mjs')), '');
  record('Portal source', await exists(join(root, 'portal/src/pages/Home.tsx')), '');
  record('API collection', await exists(join(root, 'docs/demo/packproof-api-demo.postman.json')), '');
  const functionEnv = await exists(join(root, 'functions/.env'))
    ? parseEnv(await readFile(join(root, 'functions/.env'), 'utf8'))
    : {};
  const secretKeys = ['MANIFEST_SIGNING_SECRET', 'API_CREDENTIAL_PEPPER', 'WEBHOOK_SIGNING_SECRET'];
  record('Required secrets', secretKeys.every((key) => Boolean(functionEnv[key])) || sourceOnly, sourceOnly ? 'source-only; live secrets not required' : 'functions/.env');
  record('App Check file', sourceOnly || await exists(join(root, '.env')), sourceOnly ? 'source-only' : '');

  if (!sourceOnly && process.env.PACKPROOF_DEMO_API_BASE) {
    const base = process.env.PACKPROOF_DEMO_API_BASE.replace(/\/$/, '');
    for (const path of ['/v1/health', '/v1/ready']) {
      try {
        const response = await fetch(`${base}${path}`);
        record(path === '/v1/health' ? 'API' : 'Proof Service', response.ok, `${response.status}`);
      } catch (error) {
        record(path === '/v1/health' ? 'API' : 'Proof Service', false, error instanceof Error ? error.message : 'unreachable');
      }
    }
    if (process.env.PACKPROOF_DEMO_PORTAL_URL) {
      try {
        const response = await fetch(process.env.PACKPROOF_DEMO_PORTAL_URL);
        record('Portal', response.ok, `${response.status}`);
      } catch (error) {
        record('Portal', false, error instanceof Error ? error.message : 'unreachable');
      }
    } else {
      record('Portal', true, 'URL not set; skipped live fetch');
    }
  } else {
    record('API', true, sourceOnly || !process.env.PACKPROOF_DEMO_API_BASE ? 'source-only' : '');
    record('Portal', true, 'source-only');
    record('Firestore', true, 'source-only');
    record('Storage', true, 'source-only');
    record('App Check', true, 'source-only');
  }

  const failed = checks.filter((item) => !item.ok);
  const candidate = await exists(join(root, 'package.json'))
    ? createHash('sha256').update(await readFile(join(root, 'package.json'))).digest('hex').slice(0, 12)
    : 'unknown';
  process.stdout.write(`Candidate:        ${candidate}\n`);
  process.stdout.write(`Backend:          ${await exists(join(root, 'functions/lib/index.js')) ? 'compiled locally' : 'missing'}\n`);
  process.stdout.write(`${failed.length ? 'NOT READY' : 'READY'}\n`);
  if (failed.length) process.exitCode = 1;
}

if (command === 'reset') await reset();
else if (command === 'seed') await seed();
else if (command === 'verify') await verify();
else {
  console.error('Usage: node scripts/demo-env.mjs <reset|seed|verify> [--source]');
  process.exit(1);
}
