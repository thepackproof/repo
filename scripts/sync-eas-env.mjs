import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).map((line) => {
  const separator = line.indexOf('=');
  return separator > 0 && !line.trimStart().startsWith('#') ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : null;
}).filter(Boolean));

const fail = (message) => { process.stderr.write(`\n${message}\n`); process.exit(1); };
try { await access('.env'); await access('google-services.json'); } catch { fail('Run `npm run configure` and place google-services.json in this folder first.'); }

const values = parseEnv(await readFile('.env', 'utf8'));
const names = [
  'EXPO_OWNER', 'EXPO_PROJECT_ID', 'ANDROID_PACKAGE_NAME',
  'PACKPROOF_LINK_DOMAIN',
  'EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION', 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
  'EXPO_PUBLIC_ENABLE_FACEBOOK_AUTH', 'EXPO_PUBLIC_ENABLE_TIKTOK_AUTH', 'EXPO_PUBLIC_ENABLE_REVENUECAT_BILLING',
  'EXPO_PUBLIC_LEGAL_BASE_URL',
];
const missing = names.filter((name) => !values[name]);
if (missing.length) fail(`These .env values are empty: ${missing.join(', ')}. Run \`npm run configure\` again.`);

const optionalNames = ['EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY', 'FACEBOOK_APP_ID', 'FACEBOOK_CLIENT_TOKEN'];
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const environments = ['development', 'preview', 'production'];
const environmentArgs = environments.flatMap((environment) => ['--environment', environment]);
const run = (args, label) => {
  process.stdout.write(`Syncing ${label}…\n`);
  const result = spawnSync(npx, ['--yes', 'eas-cli@21.4.0', ...args], { stdio: 'inherit', shell: false, env: { ...process.env, ...values, GOOGLE_SERVICES_JSON: resolve('google-services.json'), EXPO_NO_TELEMETRY: '1' } });
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
  'env:set', '--name', 'GOOGLE_SERVICES_JSON', '--value', resolve('google-services.json'), '--type', 'file',
  '--visibility', 'secret', '--scope', 'project', ...environmentArgs, '--non-interactive',
], 'google-services.json as a protected file');

process.stdout.write('\nEAS development, preview and production environments are synchronized.\n');
