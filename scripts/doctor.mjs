import { access, readFile } from 'node:fs/promises';

let failures = 0;
let warnings = 0;
const pass = (message) => process.stdout.write(`[PASS] ${message}\n`);
const fail = (message) => { failures += 1; process.stdout.write(`[FAIL] ${message}\n`); };
const warn = (message) => { warnings += 1; process.stdout.write(`[WARN] ${message}\n`); };
const exists = async (path) => { try { await access(path); return true; } catch { return false; } };
const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).map((line) => {
  const separator = line.indexOf('=');
  return separator > 0 && !line.trimStart().startsWith('#') ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : null;
}).filter(Boolean));

process.stdout.write('\nPackProof external-demo doctor\n\n');
for (const path of ['.env', '.firebaserc', 'google-services.json', 'functions/.env']) {
  (await exists(path) ? pass : fail)(`${path} is ${await exists(path) ? 'present' : 'missing'}`);
}

let env = {};
if (await exists('.env')) {
  env = parseEnv(await readFile('.env', 'utf8'));
  for (const key of ['EXPO_OWNER', 'EXPO_PROJECT_ID', 'ANDROID_PACKAGE_NAME', 'PACKPROOF_LINK_DOMAIN', 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'EXPO_PUBLIC_LEGAL_BASE_URL']) {
    env[key] ? pass(`${key} is configured`) : fail(`${key} is empty`);
  }
  for (const flag of ['EXPO_PUBLIC_ENABLE_FACEBOOK_AUTH', 'EXPO_PUBLIC_ENABLE_TIKTOK_AUTH', 'EXPO_PUBLIC_ENABLE_REVENUECAT_BILLING']) {
    ['true', 'false'].includes(String(env[flag]).toLowerCase()) ? pass(`${flag} is explicit`) : fail(`${flag} must be true or false`);
  }
  if (String(env.EXPO_PUBLIC_ENABLE_FACEBOOK_AUTH).toLowerCase() === 'true') {
    for (const key of ['FACEBOOK_APP_ID', 'FACEBOOK_CLIENT_TOKEN']) env[key] ? pass(`${key} is configured`) : fail(`${key} is required when Facebook sign-in is enabled`);
  } else pass('Facebook sign-in is intentionally hidden');
  if (String(env.EXPO_PUBLIC_ENABLE_REVENUECAT_BILLING).toLowerCase() === 'true') {
    env.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY ? pass('PackProof Pro billing is enabled') : fail('RevenueCat public key is required when PackProof Pro billing is enabled');
  } else warn('PackProof Pro billing is disabled; core evidence features remain available');
  if (String(env.EXPO_PUBLIC_APP_CHECK_PROVIDER).toLowerCase() === 'debug') {
    warn('App Check debug provider is set; Play Integrity will not run in this build');
  } else pass('App Check uses Play Integrity unless this is a development client');
}

if (await exists('google-services.json') && env.ANDROID_PACKAGE_NAME) {
  try {
    const services = JSON.parse(await readFile('google-services.json', 'utf8'));
    const packages = (services.client ?? []).map((client) => client?.client_info?.android_client_info?.package_name).filter(Boolean);
    packages.includes(env.ANDROID_PACKAGE_NAME)
      ? pass('google-services.json contains the configured Android package')
      : fail(`google-services.json does not contain Android package ${env.ANDROID_PACKAGE_NAME}`);
  } catch { fail('google-services.json is not valid JSON'); }
}

if (await exists('functions/.env')) {
  const functionEnv = parseEnv(await readFile('functions/.env', 'utf8'));
  for (const key of ['PUBLIC_APP_URL', 'CONNECT_LINK_BASE_URL', 'TIKTOK_REDIRECT_URI']) {
    functionEnv[key] && !String(functionEnv[key]).includes('YOUR_PROJECT') ? pass(`Functions ${key} is configured`) : fail(`Functions ${key} is missing or still a placeholder`);
  }
}

if (await exists('public/runtime-config.js') && env.EXPO_PUBLIC_ENABLE_TIKTOK_AUTH) {
  const runtimeConfig = await readFile('public/runtime-config.js', 'utf8');
  runtimeConfig.includes(`tiktokEnabled: ${String(env.EXPO_PUBLIC_ENABLE_TIKTOK_AUTH).toLowerCase()}`)
    ? pass('Hosted TikTok deletion control matches the mobile feature gate')
    : fail('Hosted TikTok deletion control does not match EXPO_PUBLIC_ENABLE_TIKTOK_AUTH; rerun `npm run configure`');
}

for (const path of ['public/index.html', 'public/privacy.html', 'public/terms.html', 'public/community.html', 'public/delete.html']) {
  const contents = await readFile(path, 'utf8');
  if (/\[[A-Z][A-Z _-]+\]|packproof\.example/.test(contents)) warn(`${path} still contains a legal or launch placeholder`); else pass(`${path} launch identity is finalized`);
}

if (await exists('public/.well-known/assetlinks.json')) pass('Android App Links association is generated');
else warn('Android App Links association is missing; run `npm run generate:assetlinks` after obtaining the signing certificate fingerprint');

const sourceChecks = [
  ['firestore.rules', 'Firestore rules'], ['storage.rules', 'Storage rules'], ['functions/lib/index.js', 'compiled backend'], ['eas.json', 'EAS build profiles'], ['firebase.json', 'Firebase deployment config'],
  ['modules/packproof-secure-file/android/src/main/java/expo/modules/packproofsecurefile/PackProofSecureFileModule.kt', 'Android encrypted evidence module'],
];
for (const [path, label] of sourceChecks) (await exists(path) ? pass : fail)(`${label} ${await exists(path) ? 'is present' : 'is missing'}`);

warn('Deployed Firebase secrets and App Check registration cannot be verified from local files; complete the external-demo runbook checks.');
process.stdout.write(`\n${failures} blocking issue(s), ${warnings} warning(s).\n`);
if (failures) process.exitCode = 1;
