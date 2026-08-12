#!/usr/bin/env node
import { spawnSync } from 'child_process';

const secrets = [
  { name: 'API_CREDENTIAL_PEPPER', env: 'API_CREDENTIAL_PEPPER' },
  { name: 'PUBLIC_HANDOFF_SIGNING_SECRET', env: 'PUBLIC_HANDOFF_SIGNING_SECRET' },
  { name: 'PARTICIPANT_HANDOFF_SIGNING_SECRET', env: 'PARTICIPANT_HANDOFF_SIGNING_SECRET' },
];

const project = process.argv[2] || process.env.FIREBASE_PROJECT || 'packproof-api-test';
const apply = process.argv.includes('--apply');

function printHelp() {
  console.log('Usage: node provision-secrets.mjs [FIREBASE_PROJECT] [--apply]');
  console.log('Provide secret values via environment variables, e.g.:');
  console.log('  API_CREDENTIAL_PEPPER, PUBLIC_HANDOFF_SIGNING_SECRET, PARTICIPANT_HANDOFF_SIGNING_SECRET');
  console.log('\nRun with --apply to execute the firebase CLI commands (requires firebase CLI auth in your environment).');
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  printHelp();
  process.exit(0);
}

console.log(`Target Firebase project: ${project}`);
console.log(`Apply mode: ${apply ? 'ENABLED' : 'disabled (dry-run)'}`);
console.log('---');

for (const s of secrets) {
  const value = process.env[s.env];
  if (!value) {
    console.log(`Secret ${s.name} not found in env var ${s.env}.`);
    console.log(`To set it manually run:\n  firebase functions:secrets:set ${s.name} --project ${project}  \nThen paste the secret on stdin when prompted.`);
    console.log('');
    continue;
  }
  console.log(`Preparing to set secret ${s.name} from env ${s.env}.`);
  const cmd = 'npx';
  const args = ['--yes', 'firebase-tools@15.25.1', 'functions:secrets:set', s.name, '--project', project];
  console.log(`Command: ${cmd} ${args.join(' ')}`);
  if (!apply) {
    console.log('Dry-run mode: not executing. Pass --apply to run the command.');
    console.log('');
    continue;
  }
  console.log('Executing...');
  const result = spawnSync(cmd, args, { input: value, encoding: 'utf8' });
  if (result.error) {
    console.error(`Failed to execute firebase CLI: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error('firebase CLI returned non-zero exit code:');
    console.error(result.stdout);
    console.error(result.stderr);
    process.exit(result.status || 1);
  }
  console.log('Secret set successfully.');
  console.log('');
}
