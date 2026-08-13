#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rawArgs = process.argv.slice(2);
const projectArg = rawArgs.find((arg) => !arg.startsWith('--'));
const project = projectArg || process.env.FIREBASE_PROJECT;
const applySecrets = rawArgs.includes('--apply-secrets');
const dryRun = rawArgs.includes('--dry-run');

const isWindows = process.platform === 'win32';
const shellCommand = process.env.COMSPEC || 'cmd.exe';

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

const npmCommand = isWindows ? 'cmd.exe' : 'npm';

function run(command, args, options = {}) {
  const execCommand = isWindows && command === 'npm' ? shellCommand : command;
  const spawnArgs = isWindows && command === 'npm'
    ? ['/c', 'npm', ...args]
    : args;
  const result = spawnSync(execCommand, spawnArgs, { stdio: 'inherit', ...options });
  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status);
  }
}

if (!project) {
  fail('Firebase project is required. Pass it as the first argument or set FIREBASE_PROJECT.');
}

console.log(`Firebase project: ${project}`);
console.log(`Apply secrets: ${applySecrets ? 'yes' : 'no'}`);
console.log(`Dry run: ${dryRun ? 'yes' : 'no'}`);
console.log('---');

if (!dryRun) {
  run('npm', ['run', 'build:button-sdk'], { cwd: root });
  run('npm', ['--prefix', 'functions', 'run', 'build'], { cwd: root });
}

if (applySecrets) {
  if (dryRun) {
    console.log('Dry run: skipping secrets provisioning.');
  } else {
    const provisioner = resolve(root, 'infra', 'provision-secrets.mjs');
    run('node', [provisioner, project, '--apply'], { cwd: root });
  }
}

if (dryRun) {
  console.log('Dry run complete. No deployment was executed.');
  process.exit(0);
}

run('npm', ['exec', '--yes', 'firebase-tools@15.25.1', '--', 'deploy', '--project', project, '--only', 'firestore,storage,functions,hosting'], { cwd: root });
console.log('Firebase deployment complete.');
