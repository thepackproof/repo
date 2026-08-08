import { mkdir, readFile, writeFile } from 'node:fs/promises';

const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).map((line) => {
  const separator = line.indexOf('=');
  return separator > 0 && !line.trimStart().startsWith('#') ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : null;
}).filter(Boolean));
const values = await readFile('.env', 'utf8').then(parseEnv).catch(() => ({}));
const args = process.argv.slice(2);
const valueAfter = (name) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
};
const packageName = valueAfter('--package') || values.ANDROID_PACKAGE_NAME;
const cliFingerprints = args.flatMap((arg, index) => arg === '--fingerprint' ? [args[index + 1]] : []).filter(Boolean);
const fingerprints = (cliFingerprints.length ? cliFingerprints : String(values.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINT ?? '').split(','))
  .map((item) => item.trim().toUpperCase()).filter(Boolean);

if (!packageName || !/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,}$/.test(packageName)) {
  throw new Error('Set ANDROID_PACKAGE_NAME in .env or pass --package com.company.packproof.');
}
if (!fingerprints.length || fingerprints.some((item) => !/^(?:[0-9A-F]{2}:){31}[0-9A-F]{2}$/.test(item))) {
  throw new Error('Provide one or more colon-delimited SHA-256 signing certificate fingerprints in .env or with repeated --fingerprint arguments.');
}

const association = [{
  relation: ['delegate_permission/common.handle_all_urls'],
  target: { namespace: 'android_app', package_name: packageName, sha256_cert_fingerprints: Array.from(new Set(fingerprints)) },
}];
await mkdir('public/.well-known', { recursive: true });
await writeFile('public/.well-known/assetlinks.json', `${JSON.stringify(association, null, 2)}\n`);
process.stdout.write(`Generated public/.well-known/assetlinks.json for ${packageName} with ${fingerprints.length} certificate fingerprint(s).\n`);
