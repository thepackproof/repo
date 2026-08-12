import { readFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const rl = createInterface({ input, output });
const ask = async (label, fallback = '') => {
  const suffix = fallback ? ` [${fallback}]` : '';
  const value = (await rl.question(`${label}${suffix}: `)).trim();
  return value || fallback;
};
const askBoolean = async (label, fallback = false) => {
  const answer = (await ask(`${label} (${fallback ? 'Y/n' : 'y/N'})`)).toLowerCase();
  if (!answer) return fallback;
  if (['y', 'yes'].includes(answer)) return true;
  if (['n', 'no'].includes(answer)) return false;
  throw new Error(`Answer yes or no for: ${label}`);
};
const requireValue = (value, label) => {
  if (!value) throw new Error(`${label} is required.`);
  return value;
};
const escapeHtml = (value) => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).map((line) => {
  const separator = line.indexOf('=');
  return separator > 0 && !line.trimStart().startsWith('#') ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : null;
}).filter(Boolean));
const previous = await readFile('.env', 'utf8').then(parseEnv).catch(() => ({}));

output.write('\nPackProof external-demo configuration\nValues remain in local files excluded from version control.\n\n');

const firebaseProjectId = requireValue(await ask('Firebase project ID', previous.FIREBASE_PROJECT_ID), 'Firebase project ID');
if (!/^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(firebaseProjectId)) throw new Error('Firebase project ID format is invalid.');
const androidPackage = await ask('Android package name (choose permanently before Play upload)', previous.ANDROID_PACKAGE_NAME || 'com.packproof.app');
if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,}$/.test(androidPackage)) throw new Error('Android package name is invalid. Example: com.company.packproof');
const expoOwner = requireValue(await ask('Expo account name', previous.EXPO_OWNER), 'Expo account name');
const expoProjectId = requireValue(await ask('Expo project ID from `npx eas-cli@21.4.0 init`', previous.EXPO_PROJECT_ID), 'Expo project ID');
const googleWebClientId = requireValue(await ask('Google OAuth Web client ID', previous.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID), 'Google OAuth Web client ID');
const legalUrl = await ask('Public Firebase Hosting URL', previous.EXPO_PUBLIC_LEGAL_BASE_URL || `https://${firebaseProjectId}.web.app`);
const linkDomain = await ask('PackProof App Link domain', previous.PACKPROOF_LINK_DOMAIN || `${firebaseProjectId}.web.app`);
let parsedLegalUrl;
try { parsedLegalUrl = new URL(legalUrl); } catch { throw new Error('Public Firebase Hosting URL is invalid.'); }
if (parsedLegalUrl.protocol !== 'https:' || parsedLegalUrl.username || parsedLegalUrl.password) throw new Error('Public Firebase Hosting URL must use HTTPS without embedded credentials.');
let parsedLinkDomain;
try { parsedLinkDomain = new URL(`https://${linkDomain}`); } catch { throw new Error('PackProof App Link domain is invalid.'); }
if (parsedLinkDomain.hostname !== linkDomain || parsedLinkDomain.pathname !== '/' || parsedLinkDomain.search || parsedLinkDomain.hash) throw new Error('PackProof App Link domain must be a hostname only, without scheme or path.');
const legalEntity = requireValue(await ask('Legal entity or demonstration operator name', previous.PACKPROOF_LEGAL_ENTITY), 'Legal entity');
const supportEmail = requireValue(await ask('Support email address', previous.PACKPROOF_SUPPORT_EMAIL), 'Support email');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) throw new Error('Support email address is invalid.');
const effectiveDate = await ask('Policy effective date (YYYY-MM-DD)', previous.PACKPROOF_POLICY_EFFECTIVE_DATE || new Date().toISOString().slice(0, 10));
if (!/^\d{4}-\d{2}-\d{2}$/.test(effectiveDate)) throw new Error('Policy effective date must use YYYY-MM-DD.');

const enableFacebook = await askBoolean('Enable Facebook sign-in in this build', previous.EXPO_PUBLIC_ENABLE_FACEBOOK_AUTH === 'true');
const facebookAppId = enableFacebook ? requireValue(await ask('Facebook App ID', previous.FACEBOOK_APP_ID), 'Facebook App ID') : '';
const facebookClientToken = enableFacebook ? requireValue(await ask('Facebook Client Token', previous.FACEBOOK_CLIENT_TOKEN), 'Facebook Client Token') : '';
const enableTikTok = await askBoolean('Enable TikTok sign-in in this build', previous.EXPO_PUBLIC_ENABLE_TIKTOK_AUTH === 'true');
const enableBilling = await askBoolean('Enable PackProof Pro purchases in this build', previous.EXPO_PUBLIC_ENABLE_REVENUECAT_BILLING === 'true');
const revenueCatKey = enableBilling ? requireValue(await ask('RevenueCat public Google SDK key', previous.EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY), 'RevenueCat public Google SDK key') : '';

const env = `EXPO_OWNER=${expoOwner}\nEXPO_PROJECT_ID=${expoProjectId}\nFIREBASE_PROJECT_ID=${firebaseProjectId}\nANDROID_PACKAGE_NAME=${androidPackage}\nGOOGLE_SERVICES_JSON=./google-services.json\nPACKPROOF_LINK_DOMAIN=${linkDomain}\n\nEXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION=us-east1\nEXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=${googleWebClientId}\nEXPO_PUBLIC_ENABLE_FACEBOOK_AUTH=${enableFacebook}\nEXPO_PUBLIC_ENABLE_TIKTOK_AUTH=${enableTikTok}\nEXPO_PUBLIC_ENABLE_REVENUECAT_BILLING=${enableBilling}\nEXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY=${revenueCatKey}\nEXPO_PUBLIC_LEGAL_BASE_URL=${legalUrl.replace(/\/$/, '')}\n\nFACEBOOK_APP_ID=${facebookAppId}\nFACEBOOK_CLIENT_TOKEN=${facebookClientToken}\nANDROID_APP_LINK_SHA256_CERT_FINGERPRINT=${previous.ANDROID_APP_LINK_SHA256_CERT_FINGERPRINT || ''}\n\nPACKPROOF_LEGAL_ENTITY=${legalEntity}\nPACKPROOF_SUPPORT_EMAIL=${supportEmail}\nPACKPROOF_POLICY_EFFECTIVE_DATE=${effectiveDate}\n`;
await writeFile('.env', env, { mode: 0o600 });
await writeFile('.firebaserc', `${JSON.stringify({ projects: { default: firebaseProjectId } }, null, 2)}\n`, { mode: 0o600 });

try {
  const functionsExample = await readFile('functions/.env.example', 'utf8');
  const functionsEnv = functionsExample
    .replace('https://YOUR_PROJECT.web.app', legalUrl.replace(/\/$/, ''))
    .replace('https://packproof.link', `https://${linkDomain}`)
    .replace('ENABLE_TIKTOK_AUTH=false', `ENABLE_TIKTOK_AUTH=${enableTikTok}`)
    .replace('ENABLE_REVENUECAT_BILLING=false', `ENABLE_REVENUECAT_BILLING=${enableBilling}`)
    .replaceAll('YOUR_PROJECT', firebaseProjectId);
  await writeFile('functions/.env', functionsEnv.split('\n').filter((line) => !line.startsWith('TIKTOK_CLIENT_') && !line.startsWith('REVENUECAT_') && !line.startsWith('MANIFEST_SIGNING_')).join('\n'), { mode: 0o600 });
} catch { /* The Functions environment can be created manually if the example is unavailable. */ }

for (const path of ['public/index.html', 'public/privacy.html', 'public/terms.html', 'public/community.html', 'public/delete.html']) {
  const current = await readFile(path, 'utf8');
  const legalEntityHtml = escapeHtml(legalEntity);
  const supportEmailHtml = escapeHtml(supportEmail);
  let configured = current
    .replaceAll('Replace support@packproof.example before launch.', `Support: ${supportEmailHtml}`)
    .replaceAll('[PACKPROOF LEGAL ENTITY]', legalEntityHtml)
    .replaceAll('[LAUNCH DATE]', effectiveDate)
    .replaceAll('support@packproof.example', supportEmailHtml);
  if (previous.PACKPROOF_LEGAL_ENTITY) configured = configured.replaceAll(escapeHtml(previous.PACKPROOF_LEGAL_ENTITY), legalEntityHtml);
  if (previous.PACKPROOF_SUPPORT_EMAIL) configured = configured.replaceAll(escapeHtml(previous.PACKPROOF_SUPPORT_EMAIL), supportEmailHtml);
  if (previous.PACKPROOF_POLICY_EFFECTIVE_DATE) configured = configured.replaceAll(previous.PACKPROOF_POLICY_EFFECTIVE_DATE, effectiveDate);
  await writeFile(path, configured);
}
await writeFile('public/runtime-config.js', `window.PACKPROOF_CONFIG = Object.freeze({ tiktokEnabled: ${enableTikTok} });\n`);

rl.close();
output.write('\nConfiguration written. Place google-services.json in the project root, run `npm run sync:eas`, generate App Links after a signing key exists, and run `npm run doctor`.\n');
if (enableTikTok) output.write('TikTok is enabled: configure TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET with `firebase functions:secrets:set`.\n');
if (enableBilling) output.write('Billing is enabled: configure REVENUECAT_WEBHOOK_SECRET with `firebase functions:secrets:set`.\n');
output.write('Always configure MANIFEST_SIGNING_SECRET before deploying Functions.\n');
