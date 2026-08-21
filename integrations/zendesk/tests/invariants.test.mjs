import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetRoot = join(appRoot, 'assets');

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

test('Zendesk assets never embed merchant secrets or assemble a Proof', () => {
  const files = walk(assetRoot).filter((path) => /\.(js|html|css|json|svg)$/.test(path));
  assert.ok(files.length > 0);
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const rel = relative(appRoot, file).replaceAll('\\', '/');
    assert.doesNotMatch(source, /pp_live_[A-Za-z0-9]|pp_sandbox_[A-Za-z0-9]/, rel);
    assert.doesNotMatch(source, /whsec_/, rel);
    assert.doesNotMatch(source, /innerHTML\s*=/, rel);
    assert.doesNotMatch(source, /firebase\/(?:firestore|storage)|getFirestore|getStorage/, rel);
    assert.doesNotMatch(source, /object:\s*['"]packproof_passport['"]/, rel);
  }
  const lookup = readFileSync(join(assetRoot, 'lib', 'lookup.js'), 'utf8');
  assert.match(lookup, /Bearer \{\{setting\.api_key\}\}/);
  assert.match(lookup, /secure:\s*true/);
});

test('manifest keeps the API key as a Zendesk secure setting', () => {
  const manifest = JSON.parse(readFileSync(join(appRoot, 'manifest.json'), 'utf8'));
  const apiKey = manifest.parameters.find((item) => item.name === 'api_key');
  assert.equal(apiKey.secure, true);
  assert.ok(manifest.domainWhitelist.includes('packproof-4cf53.web.app'));
  assert.equal(manifest.location.support.ticket_sidebar.url, 'assets/iframe.html');
});
