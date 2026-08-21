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
assert.equal(config.android?.package, 'com.thepackproof.app');
assert.equal(config.android?.versionCode, 8);
assert.equal(config.version, '0.9.6.0');
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
assert.equal(assetLinks[0].target?.package_name, 'com.thepackproof.app');
assert.deepEqual(assetLinks[0].target?.sha256_cert_fingerprints, [
  '0E:6D:04:E0:25:85:EE:40:0A:6C:81:78:01:90:84:1E:99:87:8F:A9:EF:BE:11:CE:F6:47:13:BA:AA:A2:69:B9',
  'C4:1A:13:82:F9:C8:F6:0A:AB:03:6E:14:C3:4F:EE:43:C2:AA:BD:49:80:81:75:9F:A1:EC:AB:39:C8:F9:6E:30',
  '6B:8E:CD:A3:04:8D:5E:D0:50:FF:44:1A:C9:3F:B7:1B:CB:3C:68:85:1A:CB:CE:B6:97:B0:42:DD:E3:65:03:51',
]);

const firebaseConfig = JSON.parse(readFileSync(join(process.cwd(), 'firebase.json'), 'utf8'));
const hostingConfigs = Array.isArray(firebaseConfig.hosting) ? firebaseConfig.hosting : [firebaseConfig.hosting];
const publicHosting = hostingConfigs.find((item) => item.target === 'public') ?? hostingConfigs[0];
const assetLinksHeaders = publicHosting?.headers?.find(
  ({ source }) => source === '/.well-known/assetlinks.json',
)?.headers;
assert.deepEqual(assetLinksHeaders, [
  {
    key: 'Cache-Control',
    value: 'public, max-age=300, must-revalidate',
  },
]);

const appLinkPrefixes = (config.android?.intentFilters ?? [])
  .flatMap((filter) => filter.data ?? [])
  .map((item) => item.pathPrefix)
  .filter(Boolean);
assert.ok(appLinkPrefixes.includes('/portal/open'), 'Portal mobile handoff must remain an Android App Link.');

const easSyncScript = readFileSync(join(process.cwd(), 'scripts', 'sync-eas-env.mjs'), 'utf8');
assert.match(easSyncScript, /allowedEnvironments/);
assert.match(easSyncScript, /Production sync requires \.env\.production\.local/);
assert.match(easSyncScript, /const environmentArgs = \['--environment', targetEnvironment\]/);

const easBuildScript = readFileSync(join(process.cwd(), 'scripts', 'eas-with-env.mjs'), 'utf8');
assert.match(easBuildScript, /Production EAS commands require \.env\.production\.local/);

console.log(`Android release configuration passed (${forbiddenReleasePermissions.length} billing/advertising permissions blocked; release App Link certificate, cache policy, and environment separation pinned).`);
