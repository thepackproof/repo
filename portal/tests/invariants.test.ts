import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const portalRoot = dirname(fileURLToPath(new URL('.', import.meta.url)));
const srcRoot = join(portalRoot, 'src');
const uxRoot = join(portalRoot, '..', 'shared', 'ux');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

test('portal source never talks to Firestore or Storage', () => {
  const files = walk(srcRoot).filter((path) => /\.(ts|tsx)$/.test(path));
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    assert.doesNotMatch(source, /firebase\/firestore/);
    assert.doesNotMatch(source, /firebase\/storage/);
    assert.doesNotMatch(source, /getFirestore|getStorage|collection\(|doc\(/);
    assert.doesNotMatch(source, /merchantApiKey|pp_live_|pp_sk_/);
  }
});

test('shared Next Action Engine has no React Native or DOM imports', () => {
  for (const file of walk(uxRoot).filter((path) => path.endsWith('.ts'))) {
    const source = readFileSync(file, 'utf8');
    const rel = relative(uxRoot, file);
    assert.doesNotMatch(source, /react-native|expo-|document\.|window\./, rel);
  }
});
