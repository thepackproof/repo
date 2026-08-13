import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
import { join } from 'node:path';

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

console.log(`Android release configuration passed (${forbiddenReleasePermissions.length} billing/advertising permissions blocked).`);
