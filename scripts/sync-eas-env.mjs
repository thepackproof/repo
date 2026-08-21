import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const allowedEnvironments = new Set(['development', 'preview', 'production']);
const targetEnvironment = process.argv[2]?.trim();
if (!allowedEnvironments.has(targetEnvironment)) {
  process.stderr.write('Usage: npm run sync:eas -- <development|preview|production>\n');
  process.exit(1);
}

const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).map((line) => {
  const separator = line.indexOf('=');
  return separator > 0 && !line.trimStart().startsWith('#') ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : null;
}).filter(Boolean));

const fail = (message) => { process.stderr.write(`\n${message}\n`); process.exit(1); };
const targetEnvPath = `.env.${targetEnvironment}.local`;
const envPath = await access(targetEnvPath).then(() => targetEnvPath).catch(() => '.env');
if (targetEnvironment === 'production' && envPath !== targetEnvPath) {
  fail('Production sync requires .env.production.local; refusing to reuse another environment configuration.');
}
try { await access(envPath); } catch { fail(`Missing ${envPath}. Run \`npm run configure\` or create the target-specific environment file first.`); }

const values = parseEnv(await readFile(envPath, 'utf8'));
const googleServicesPath = values.GOOGLE_SERVICES_JSON || 'google-services.json';
try { await access(googleServicesPath); } catch { fail(`Missing ${googleServicesPath}. Download the matching Firebase Android configuration first.`); }
const googleServices = await readFile(googleServicesPath, 'utf8').then(JSON.parse).catch(() => fail(`${googleServicesPath} is not valid JSON.`));
if (googleServices.project_info?.project_id !== values.FIREBASE_PROJECT_ID) {
  fail(`${googleServicesPath} does not match FIREBASE_PROJECT_ID=${values.FIREBASE_PROJECT_ID}.`);
}
if (!googleServices.client?.some((client) => client.client_info?.android_client_info?.package_name === values.ANDROID_PACKAGE_NAME)) {
  fail(`${googleServicesPath} does not contain ANDROID_PACKAGE_NAME=${values.ANDROID_PACKAGE_NAME}.`);
}
const names = [
  'EXPO_OWNER', 'EXPO_PROJECT_ID', 'FIREBASE_PROJECT_ID', 'ANDROID_PACKAGE_NAME',
  'PACKPROOF_LINK_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION', 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_ENABLE_FACEBOOK_AUTH', 'EXPO_PUBLIC_ENABLE_TIKTOK_AUTH', 'EXPO_PUBLIC_ENABLE_REVENUECAT_BILLING',
  'EXPO_PUBLIC_LEGAL_BASE_URL',
];
const missing = names.filter((name) => !values[name]);
if (missing.length) fail(`These .env values are empty: ${missing.join(', ')}. Run \`npm run configure\` again.`);

const optionalNames = ['EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY', 'FACEBOOK_APP_ID', 'FACEBOOK_CLIENT_TOKEN', 'EXPO_PUBLIC_APP_CHECK_PROVIDER'];
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const environmentArgs = ['--environment', targetEnvironment];
const run = (args, label) => {
  process.stdout.write(`Syncing ${label}…\n`);
  const result = spawnSync(npx, ['--yes', 'eas-cli@21.4.0', ...args], { stdio: 'inherit', shell: process.platform === 'win32', env: { ...process.env, ...values, GOOGLE_SERVICES_JSON: resolve(googleServicesPath), EXPO_NO_TELEMETRY: '1' } });
  if (result.error || result.status !== 0) fail(`Could not sync ${label}. Confirm that \`npx eas-cli@21.4.0 login\` and \`npx eas-cli@21.4.0 init\` completed, then retry.`);
};

for (const name of names) run([
  'env:set', '--name', name, '--value', values[name], '--type', 'string', '--visibility', 'plaintext',
  '--scope', 'project', ...environmentArgs, '--non-interactive',
], name);

for (const name of optionalNames.filter((key) => values[key])) run([
  'env:set', '--name', name, '--value', values[name], '--type', 'string', '--visibility', 'plaintext',
  '--scope', 'project', ...environmentArgs, '--non-interactive',
], name);

run([
  'env:set', '--name', 'GOOGLE_SERVICES_JSON', '--value', resolve(googleServicesPath), '--type', 'file',
  '--visibility', 'secret', '--scope', 'project', ...environmentArgs, '--non-interactive',
], 'google-services.json as a protected file');

process.stdout.write(`\nEAS ${targetEnvironment} environment is synchronized.\n`);
