import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const { patchAppBuildGradle, patchProguardRules } = require('../plugins/with-packproof-gradle-properties.js');

const fixture = `
android {
    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }
    buildTypes {
        debug {
            signingConfig signingConfigs.debug
        }
        release {
            signingConfig signingConfigs.debug
        }
    }
}
`;

const patched = patchAppBuildGradle(fixture);

assert.match(patched, /PACKPROOF_ANDROID_SIGNING_PROFILE/);
assert.match(patched, /PACKPROOF_ANDROID_KEYSTORE_PATH/);
assert.match(patched, /Sandbox signing is missing required environment variables/);
assert.match(patched, /Sandbox keystore does not exist/);
assert.match(patched, /sandbox \{/);
assert.match(patched, /signingConfig usePackProofSandboxSigning \? signingConfigs\.sandbox : signingConfigs\.debug/);
assert.match(
  patched,
  /debug \{\s+signingConfig signingConfigs\.debug\s+\}\s+release \{\s+signingConfig usePackProofSandboxSigning/s,
  'debug signing must remain unchanged while release signing becomes profile-aware',
);
assert.equal(patchAppBuildGradle(patched), patched, 'plugin must be idempotent');
assert.throws(
  () => patchAppBuildGradle('android {\n}\n'),
  /generated debug signing block/,
  'plugin must fail when the expected Expo template changes',
);

const proguardFixture = '# Existing release rules\n-keep class com.packproof.** { *; }\n';
const patchedProguard = patchProguardRules(proguardFixture);
assert.match(patchedProguard, /PACKPROOF_RELEASE_LOG_MINIMIZATION/);
assert.match(patchedProguard, /public static int v\(\.\.\.\);/);
assert.match(patchedProguard, /public static int d\(\.\.\.\);/);
assert.doesNotMatch(patchedProguard, /public static int [iwe]\(\.\.\.\);/i, 'warning, error, and informational logs must remain available');
assert.equal(patchProguardRules(patchedProguard), patchedProguard, 'release log rules must be idempotent');

const sandboxBuildScript = readFileSync(new URL('./build-sandbox-apk.ps1', import.meta.url), 'utf8');
assert.match(sandboxBuildScript, /packproof-sandbox-device-test-20260813\.jks/);
assert.match(sandboxBuildScript, /packproof-sandbox-20260813/);
assert.doesNotMatch(sandboxBuildScript, /packproof-sandbox-device-test\.jks/);

process.stdout.write('PackProof Gradle signing and release log tests passed.\n');
