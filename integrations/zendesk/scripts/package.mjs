import { mkdir, rm } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const zip = join(dist, 'packproof-zendesk.zip');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

const archive = spawnSync('tar', ['-a', '-c', '-f', zip, 'manifest.json', 'translations', 'assets'], {
  cwd: root,
  stdio: 'inherit',
});
if (archive.status !== 0) {
  throw new Error('Failed to package the Zendesk app zip.');
}
console.log(`Wrote ${zip}`);
