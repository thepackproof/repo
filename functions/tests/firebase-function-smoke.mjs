import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';

process.env.API_ENVIRONMENT = 'sandbox';
process.env.API_CREDENTIAL_PEPPER = 'packproof-local-smoke-test-pepper-with-no-live-use';
process.env.PARTICIPANT_HANDOFF_SIGNING_SECRET = 'packproof-local-participant-handoff-secret-with-no-live-use';
process.env.GCLOUD_PROJECT = 'packproof-api-test';
process.env.FIREBASE_CONFIG = JSON.stringify({
  projectId: 'packproof-api-test',
  storageBucket: 'packproof-api-test.appspot.com',
});

const require = createRequire(import.meta.url);
const { acceptLegalPolicies, claimParticipantInvitation, getLegalAcceptanceStatus, getMyEvidenceSession, packproofApi, redeemEvidenceSession } = require('../lib/index.js');
const endpoint = packproofApi?.__endpoint;

assert.equal(typeof packproofApi, 'function', 'packproofApi must be a Firebase function export.');
assert.equal(endpoint?.platform, 'gcfv2');
assert.deepEqual(endpoint?.region, ['us-east1']);
assert.deepEqual(endpoint?.httpsTrigger, { invoker: ['public'] });
assert.equal(endpoint?.timeoutSeconds, 60);
assert.equal(endpoint?.availableMemoryMb, 512);
assert.ok(endpoint?.secretEnvironmentVariables?.some(({ key }) => key === 'API_CREDENTIAL_PEPPER'));
assert.ok(endpoint?.secretEnvironmentVariables?.some(({ key }) => key === 'PUBLIC_HANDOFF_SIGNING_SECRET'));
assert.ok(endpoint?.secretEnvironmentVariables?.some(({ key }) => key === 'PARTICIPANT_HANDOFF_SIGNING_SECRET'));
for (const callable of [claimParticipantInvitation, getMyEvidenceSession, redeemEvidenceSession]) {
  assert.equal(typeof callable, 'function');
  assert.equal(callable.__endpoint?.platform, 'gcfv2');
  assert.ok(callable.__endpoint?.secretEnvironmentVariables?.some(({ key }) => key === 'PARTICIPANT_HANDOFF_SIGNING_SECRET'));
}
for (const callable of [acceptLegalPolicies, getLegalAcceptanceStatus]) {
  assert.equal(typeof callable, 'function');
  assert.equal(callable.__endpoint?.platform, 'gcfv2');
}
const legalAcceptanceSource = await readFile(new URL('../src/legal-acceptance.ts', import.meta.url), 'utf8');
assert.equal((legalAcceptanceSource.match(/enforceAppCheck:\s*true/g) ?? []).length, 1);
const participantCallableSource = await readFile(new URL('../src/participant-capture-callables.ts', import.meta.url), 'utf8');
assert.equal((participantCallableSource.match(/enforceAppCheck:\s*true/g) ?? []).length, 3);

const firebaseConfig = JSON.parse(
  await readFile(new URL('../../firebase.json', import.meta.url), 'utf8'),
);
const hostingConfigs = Array.isArray(firebaseConfig.hosting) ? firebaseConfig.hosting : [firebaseConfig.hosting];
const publicHosting = hostingConfigs.find((item) => item.target === 'public') ?? hostingConfigs[0];
const portalHosting = hostingConfigs.find((item) => item.target === 'portal');
const apiRewrite = publicHosting?.rewrites?.find(({ source }) => source === '/v1/**');
assert.deepEqual(apiRewrite?.function, {
  functionId: 'packproofApi',
  region: 'us-east1',
});
assert.equal(portalHosting?.public, 'portal/dist');
assert.deepEqual(portalHosting?.rewrites?.find(({ source }) => source === '/v1/**')?.function, {
  functionId: 'packproofApi',
  region: 'us-east1',
});
assert.equal(portalHosting?.rewrites?.find(({ source }) => source === '**')?.destination, '/index.html');
const portalSecurity = portalHosting?.headers?.find(({ source }) => source === '**')?.headers ?? [];
assert.ok(portalSecurity.some(({ key, value }) => key === 'Permissions-Policy' && value.includes('camera=()')));
assert.ok(portalSecurity.some(({ key, value }) => key === 'Content-Security-Policy' && /firebaseappcheck\.googleapis\.com/.test(value) && /www\.google\.com/.test(value)));
const sdkHeaders = publicHosting?.headers?.find(({ source }) => source === '/sdk/**')?.headers ?? [];
assert.ok(sdkHeaders.some(({ key, value }) => key === 'Access-Control-Allow-Origin' && value === '*'));
assert.ok(sdkHeaders.some(({ key, value }) => key === 'Cross-Origin-Resource-Policy' && value === 'cross-origin'));

console.log('PackProof API, participant callable exports, secret bindings, and Hosting rewrite metadata smoke tests passed.');
