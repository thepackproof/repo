const { withGradleProperties } = require('@expo/config-plugins');

function upsertProperty(properties, key, value) {
  const existing = properties.find((item) => item.type === 'property' && item.key === key);
  if (existing) {
    existing.value = value;
  } else {
    properties.push({ type: 'property', key, value });
  }
}

module.exports = function withPackProofGradleProperties(config) {
  return withGradleProperties(config, (nextConfig) => {
    // R8 needs more than Expo's generated 2 GB heap for this release graph.
    // Keep the setting in prebuild configuration so clean native regeneration
    // and EAS builds receive the same release-safe memory envelope.
    upsertProperty(nextConfig.modResults, 'org.gradle.jvmargs', '-Xmx6144m -XX:MaxMetaspaceSize=1024m');
    upsertProperty(nextConfig.modResults, 'org.gradle.workers.max', '4');
    return nextConfig;
  });
};
