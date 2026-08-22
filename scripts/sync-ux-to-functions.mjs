#!/usr/bin/env node
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'shared', 'ux');
const destDir = join(root, 'functions', 'src', 'ux');
const banner = '// GENERATED FROM shared/ux. Do not edit. Run `node scripts/sync-ux-to-functions.mjs`.\n';

mkdirSync(destDir, { recursive: true });
for (const name of readdirSync(sourceDir)) {
  if (!name.endsWith('.ts')) continue;
  const text = readFileSync(join(sourceDir, name), 'utf8')
    .replaceAll("from './next-action.ts'", "from './next-action'")
    .replaceAll("from './workspace-projection.ts'", "from './workspace-projection'");
  writeFileSync(join(destDir, name), `${banner}${text}`);
}
console.log(`Synced shared/ux into functions/src/ux (${readdirSync(destDir).length} files).`);
