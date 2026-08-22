#!/usr/bin/env node
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'shared', 'ux');
const destDir = join(root, 'functions', 'src', 'ux');
const banner = '// GENERATED FROM shared/ux. Do not edit. Run `node scripts/sync-ux-to-functions.mjs`.\n';
const sources = readdirSync(sourceDir).filter((name) => name.endsWith('.ts')).sort();
const generated = readdirSync(destDir).filter((name) => name.endsWith('.ts')).sort();

if (JSON.stringify(sources) !== JSON.stringify(generated)) {
  console.error('functions/src/ux is out of sync with shared/ux. Run `node scripts/sync-ux-to-functions.mjs`.');
  console.error('shared/ux:', sources.join(', '));
  console.error('functions/src/ux:', generated.join(', '));
  process.exit(1);
}

for (const name of sources) {
  const expected = `${banner}${readFileSync(join(sourceDir, name), 'utf8')
    .replaceAll("from './next-action.ts'", "from './next-action'")
    .replaceAll("from './workspace-projection.ts'", "from './workspace-projection'")}`;
  const actual = readFileSync(join(destDir, name), 'utf8');
  if (actual !== expected) {
    console.error(`${name} drifted from shared/ux. Run \`node scripts/sync-ux-to-functions.mjs\`.`);
    process.exit(1);
  }
}

console.log(`UX sync check passed (${sources.length} files).`);
