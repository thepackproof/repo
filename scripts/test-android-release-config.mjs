import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';

const expoCli = join(process.cwd(), 'node_modules', 'expo', 'bin', 'cli');
const result = spawnSync(process.execPath, [expoCli, 'config', '--type', 'public', '--json'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  env: {
    ...process.env,
    EXPO_PUBLIC_ENABLE_FACEBOOK_AUTH: 'false',
    EXPO_PUBLIC_ENABLE_TIKTOK_AUTH: 'false',
    EXPO_PUBLIC_ENABLE_REVENUECAT_BILLING: 'false',
  },
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout || result.error?.message || 'Expo configuration inspection failed.');
  process.exit(result.status ?? 1);
}

const config = JSON.parse(result.stdout);
assert.equal(config.android?.package, 'com.packproof.app');
assert.equal(config.android?.versionCode, 4);
assert.equal(config.version, '0.3.0');
assert.equal(config.android?.allowBackup, false);

const forbiddenReleasePermissions = [
  'com.android.vending.BILLING',
  'com.google.android.gms.permission.AD_ID',
  'android.permission.ACCESS_ADSERVICES_ATTRIBUTION',
  'android.permission.ACCESS_ADSERVICES_AD_ID',
  'android.permission.ACCESS_ADSERVICES_CUSTOM_AUDIENCE',
  'android.permission.ACCESS_ADSERVICES_TOPICS',
];
const blocked = new Set(config.android?.blockedPermissions ?? []);
for (const permission of forbiddenReleasePermissions) {
  assert.ok(blocked.has(permission), `Initial Android release must block ${permission}`);
}

const assetLinks = JSON.parse(readFileSync(join(process.cwd(), 'public', '.well-known', 'assetlinks.json'), 'utf8'));
assert.equal(assetLinks.length, 1);
assert.deepEqual(assetLinks[0].relation, ['delegate_permission/common.handle_all_urls']);
assert.equal(assetLinks[0].target?.namespace, 'android_app');
assert.equal(assetLinks[0].target?.package_name, 'com.packproof.app');
assert.deepEqual(assetLinks[0].target?.sha256_cert_fingerprints, [
  'BE:47:12:52:5F:B4:0E:8C:3C:06:F5:8C:E8:73:49:B6:3A:6B:F1:DB:3B:B7:EA:CD:5D:10:97:2E:B9:AD:71:36',
]);

const firebaseConfig = JSON.parse(readFileSync(join(process.cwd(), 'firebase.json'), 'utf8'));
const assetLinksHeaders = firebaseConfig.hosting?.headers?.find(
  ({ source }) => source === '/.well-known/assetlinks.json',
)?.headers;
assert.deepEqual(assetLinksHeaders, [
  {
    key: 'Cache-Control',
    value: 'public, max-age=300, must-revalidate',
  },
]);

console.log(`Android release configuration passed (${forbiddenReleasePermissions.length} billing/advertising permissions blocked; release App Link certificate and cache policy pinned).`);
