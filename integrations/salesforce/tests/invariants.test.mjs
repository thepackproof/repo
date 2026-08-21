import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';

const appRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(appRoot, 'force-app');

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const path = join(dir, entry);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

test('Salesforce sources never embed merchant secrets or assemble a Proof', () => {
  const files = walk(sourceRoot).filter((path) => /\.(js|html|css|cls|xml)$/.test(path));
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
});

test('Apex callouts use the Named Credential merge field and stay off the LWC', () => {
  const callout = readFileSync(join(sourceRoot, 'main', 'default', 'classes', 'PackProofCallout.cls'), 'utf8');
  assert.match(callout, /callout:' \+ NAMED_CREDENTIAL/);
  assert.match(callout, /Bearer \{\!\$Credential\.PackProof_API\.api_key\}/);
  assert.match(callout, /isAllowedPackProofPath/);
  const lwc = readFileSync(join(sourceRoot, 'main', 'default', 'lwc', 'packProofProof', 'packProofProof.js'), 'utf8');
  assert.doesNotMatch(lwc, /Authorization/);
  assert.doesNotMatch(lwc, /pp_(?:live|sandbox)_/);
  assert.match(lwc, /PackProofController\.retrieve/);
});

test('Named Credential metadata does not store a merchant secret', () => {
  const named = readFileSync(
    join(sourceRoot, 'main', 'default', 'namedCredentials', 'PackProof_API.namedCredential-meta.xml'),
    'utf8',
  );
  const external = readFileSync(
    join(sourceRoot, 'main', 'default', 'externalCredentials', 'PackProof_API.externalCredential-meta.xml'),
    'utf8',
  );
  assert.match(named, /<externalCredential>PackProof_API<\/externalCredential>/);
  assert.match(named, /packproof-4cf53\.web\.app/);
  assert.match(external, /<parameterType>NamedPrincipal<\/parameterType>/);
  assert.match(external, /<parameterName>api_key<\/parameterName>/);
  assert.doesNotMatch(named + external, /pp_(?:live|sandbox)_/);
});
