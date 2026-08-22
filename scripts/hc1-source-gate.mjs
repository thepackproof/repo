#!/usr/bin/env node
import { spawnSync } from 'node:child_process';

const steps = [
  ['npm', ['run', 'test:hardening-contracts']],
  ['npm', ['run', 'test:architecture']],
  ['npm', ['run', 'test:ux-sync']],
  ['npm', ['run', 'test:queue-fail-closed']],
  ['npm', ['run', 'test:queue-fault-matrix']],
  ['npm', ['run', 'test:proof-properties']],
  ['npm', ['run', 'test:claims']],
  ['npm', ['run', 'test:release-manifest']],
  ['npm', ['--prefix', 'functions', 'run', 'build']],
  ['node', ['--test', 'functions/tests/hardening-hc1.test.mjs', 'functions/tests/hardening-plan-remaining.test.mjs', 'functions/tests/golden-workspace-journeys.test.mjs']],
  ['node', ['scripts/demo-env.mjs', 'verify', '--source']],
];

for (const [command, args] of steps) {
  const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log('HC-1 source candidate gate passed. Device AND/E2E and live DR remain unclaimed.');
