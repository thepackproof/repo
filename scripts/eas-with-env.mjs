import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).map((line) => {
  const separator = line.indexOf('=');
  return separator > 0 && !line.trimStart().startsWith('#') ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : null;
}).filter(Boolean));

const args = process.argv.slice(2);
const profileIndex = args.indexOf('--profile');
const profile = profileIndex >= 0 ? args[profileIndex + 1] : undefined;
const targetEnvPath = profile ? `.env.${profile}.local` : undefined;
const envPath = targetEnvPath && await access(targetEnvPath).then(() => true).catch(() => false) ? targetEnvPath : '.env';
if (profile === 'production' && envPath !== '.env.production.local') {
  process.stderr.write('Production EAS commands require .env.production.local; refusing to reuse another environment configuration.\n');
  process.exit(1);
}
let values;
try { values = parseEnv(await readFile(envPath, 'utf8')); }
catch { process.stderr.write(`Missing ${envPath}. Run \`npm run configure\` or create the target-specific file before using EAS.\n`); process.exit(1); }
const googleServicesPath = values.GOOGLE_SERVICES_JSON || 'google-services.json';
try { await access(googleServicesPath); }
catch { process.stderr.write(`Missing ${googleServicesPath}. Download the matching Firebase Android configuration first.\n`); process.exit(1); }
if (profile === 'production') {
  const required = ['FIREBASE_PROJECT_ID', 'ANDROID_PACKAGE_NAME', 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID', 'EXPO_PUBLIC_LEGAL_BASE_URL', 'PACKPROOF_LINK_DOMAIN'];
  const missing = required.filter((name) => !values[name]);
  if (missing.length) {
    process.stderr.write(`Production configuration is incomplete: ${missing.join(', ')}.\n`);
    process.exit(1);
  }
}
let googleServices;
try { googleServices = JSON.parse(await readFile(googleServicesPath, 'utf8')); }
catch { process.stderr.write(`${googleServicesPath} is not valid JSON.\n`); process.exit(1); }
if (googleServices.project_info?.project_id !== values.FIREBASE_PROJECT_ID) {
  process.stderr.write(`${googleServicesPath} does not match FIREBASE_PROJECT_ID=${values.FIREBASE_PROJECT_ID}.\n`);
  process.exit(1);
}
if (!googleServices.client?.some((client) => client.client_info?.android_client_info?.package_name === values.ANDROID_PACKAGE_NAME)) {
  process.stderr.write(`${googleServicesPath} does not contain ANDROID_PACKAGE_NAME=${values.ANDROID_PACKAGE_NAME}.\n`);
  process.exit(1);
}
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npx, ['--yes', 'eas-cli@21.4.0', ...args], {
  stdio: 'inherit', shell: process.platform === 'win32',
  env: { ...process.env, ...values, GOOGLE_SERVICES_JSON: resolve(googleServicesPath), EXPO_NO_TELEMETRY: '1' },
});
if (result.error) process.stderr.write(`${result.error.message}\n`);
process.exit(result.status ?? 1);
