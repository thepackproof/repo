#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const spec = resolve(root, 'docs', 'openapi', 'packproof-api-v1.json');
const output = resolve(root, 'sdk', 'javascript', 'openapi-client');
const name = 'PackProofApiClient';
const client = 'fetch';
const localBin = resolve(root, 'node_modules', '.bin', 'openapi-typescript-codegen');
const localEntry = resolve(root, 'node_modules', 'openapi-typescript-codegen', 'bin', 'index.js');

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: 'inherit', ...options });
  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status);
  }
}

if (!existsSync(spec)) {
  fail(`OpenAPI spec not found at ${spec}`);
}

if (existsSync(output)) {
  rmSync(output, { recursive: true, force: true });
}
mkdirSync(output, { recursive: true });

console.log('Generating OpenAPI SDK from', spec);
const command = existsSync(localEntry) ? process.execPath : 'npm';
const args = existsSync(localEntry)
  ? [localEntry, '--input', spec, '--output', output, '--client', client, '--name', name, '--useOptions', '--postfixServices', 'Service', '--postfixModels', 'Model']
  : ['exec', '--yes', 'openapi-typescript-codegen', '--', '--input', spec, '--output', output, '--client', client, '--name', name, '--useOptions', '--postfixServices', 'Service', '--postfixModels', 'Model'];
run(command, args, { cwd: root });
console.log(`OpenAPI SDK generated to ${output}`);

const hosted = resolve(root, 'public', 'sdk');
mkdirSync(hosted, { recursive: true });
copyFileSync(spec, resolve(hosted, 'packproof-api-v1.json'));
const connectSpec = resolve(root, 'docs', 'openapi', 'packproof-connect.yaml');
if (existsSync(connectSpec)) copyFileSync(connectSpec, resolve(hosted, 'packproof-connect.yaml'));
console.log('Partner OpenAPI contracts copied to public/sdk');
