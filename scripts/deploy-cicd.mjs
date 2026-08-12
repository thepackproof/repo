#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const env = { ...process.env, CI: 'true' };

const isWindows = process.platform === 'win32';
const shellCommand = process.env.COMSPEC || 'cmd.exe';

function run(command, args, options = {}) {
  const execCommand = isWindows && (command === 'npm' || command === 'npx') ? shellCommand : command;
  const spawnArgs = isWindows && command === 'npm'
    ? ['/c', 'npm', ...args]
    : isWindows && command === 'npx'
      ? ['/c', 'npx', ...args]
      : args;
  const result = spawnSync(execCommand, spawnArgs, { stdio: 'inherit', env, ...options });
  if (result.error) {
    console.error(`Failed to run ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status);
  }
}

console.log('Running CI validation pipeline...');
run('npm', ['ci'], { cwd: root });
run('npm', ['--prefix', 'functions', 'ci'], { cwd: root });
run('npm', ['run', 'generate:openapi-sdk'], { cwd: root });
run('npm', ['run', 'typecheck'], { cwd: root });
run('npm', ['run', 'lint'], { cwd: root });
run('npm', ['--prefix', 'functions', 'run', 'build'], { cwd: root });
run('npm', ['run', 'test:rules'], { cwd: root });
run('npm', ['run', 'test:api:firestore'], { cwd: root });
run('npm', ['run', 'test:api:functions'], { cwd: root });
run('npm', ['run', 'test:sdk'], { cwd: root });
console.log('CI validation pipeline complete.');
