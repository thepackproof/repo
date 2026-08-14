const { withAppBuildGradle, withGradleProperties } = require('@expo/config-plugins');

const SIGNING_MARKER = '// PACKPROOF_SANDBOX_SIGNING_PROFILE';

function patchAppBuildGradle(contents) {
  if (contents.includes(SIGNING_MARKER)) return contents;

  const androidBlock = 'android {';
  if (!contents.includes(androidBlock)) {
    throw new Error('PackProof signing plugin could not find the Android Gradle block.');
  }

  const signingConfig = `
${SIGNING_MARKER}
def packProofSigningProfile = System.getenv('PACKPROOF_ANDROID_SIGNING_PROFILE')?.trim()
def usePackProofSandboxSigning = packProofSigningProfile == 'sandbox'
def packProofSandboxKeystorePath = System.getenv('PACKPROOF_ANDROID_KEYSTORE_PATH')?.trim()
def packProofSandboxKeyAlias = System.getenv('PACKPROOF_ANDROID_KEY_ALIAS')?.trim()
def packProofSandboxStorePassword = System.getenv('PACKPROOF_ANDROID_KEYSTORE_PASSWORD')
def packProofSandboxKeyPassword = System.getenv('PACKPROOF_ANDROID_KEY_PASSWORD')

if (packProofSigningProfile && packProofSigningProfile != 'sandbox') {
    throw new GradleException('Unsupported PACKPROOF_ANDROID_SIGNING_PROFILE: ' + packProofSigningProfile)
}

if (usePackProofSandboxSigning) {
    def missingPackProofSigningValues = [
        'PACKPROOF_ANDROID_KEYSTORE_PATH': packProofSandboxKeystorePath,
        'PACKPROOF_ANDROID_KEY_ALIAS': packProofSandboxKeyAlias,
        'PACKPROOF_ANDROID_KEYSTORE_PASSWORD': packProofSandboxStorePassword,
        'PACKPROOF_ANDROID_KEY_PASSWORD': packProofSandboxKeyPassword,
    ].findAll { key, value -> value == null || value.toString().isBlank() }.keySet()
    if (!missingPackProofSigningValues.isEmpty()) {
        throw new GradleException('Sandbox signing is missing required environment variables: ' + missingPackProofSigningValues.join(', '))
    }
    if (!file(packProofSandboxKeystorePath).isFile()) {
        throw new GradleException("Sandbox keystore does not exist at PACKPROOF_ANDROID_KEYSTORE_PATH")
    }
}

`;

  let next = contents.replace(androidBlock, `${signingConfig}${androidBlock}`);

  const debugSigningBlock = `        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }`;
  if (!next.includes(debugSigningBlock)) {
    throw new Error('PackProof signing plugin could not find Expo\'s generated debug signing block.');
  }
  next = next.replace(debugSigningBlock, `${debugSigningBlock}
        if (usePackProofSandboxSigning) {
            sandbox {
                storeFile file(packProofSandboxKeystorePath)
                storePassword packProofSandboxStorePassword
                keyAlias packProofSandboxKeyAlias
                keyPassword packProofSandboxKeyPassword
            }
        }`);

  const releaseSigningLine = '            signingConfig signingConfigs.debug';
  const releaseSigningIndex = next.lastIndexOf(releaseSigningLine);
  if (releaseSigningIndex < 0) {
    throw new Error('PackProof signing plugin could not find Expo\'s generated release signing selection.');
  }
  const sandboxReleaseSigningLine = '            signingConfig usePackProofSandboxSigning ? signingConfigs.sandbox : signingConfigs.debug';
  return `${next.slice(0, releaseSigningIndex)}${sandboxReleaseSigningLine}${next.slice(releaseSigningIndex + releaseSigningLine.length)}`;
}

function upsertProperty(properties, key, value) {
  const existing = properties.find((item) => item.type === 'property' && item.key === key);
  if (existing) {
    existing.value = value;
  } else {
    properties.push({ type: 'property', key, value });
  }
}

module.exports = function withPackProofGradleProperties(config) {
  const withProperties = withGradleProperties(config, (nextConfig) => {
    // R8 needs more than Expo's generated 2 GB heap for this release graph.
    // Keep the setting in prebuild configuration so clean native regeneration
    // and EAS builds receive the same release-safe memory envelope.
    upsertProperty(nextConfig.modResults, 'org.gradle.jvmargs', '-Xmx6144m -XX:MaxMetaspaceSize=1024m');
    upsertProperty(nextConfig.modResults, 'org.gradle.workers.max', '4');
    return nextConfig;
  });

  return withAppBuildGradle(withProperties, (nextConfig) => {
    if (nextConfig.modResults.language !== 'groovy') {
      throw new Error('PackProof Android signing supports only Groovy app/build.gradle files.');
    }
    nextConfig.modResults.contents = patchAppBuildGradle(nextConfig.modResults.contents);
    return nextConfig;
  });
};

module.exports.patchAppBuildGradle = patchAppBuildGradle;
