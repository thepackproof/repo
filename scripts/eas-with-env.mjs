import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).map((line) => {
  const separator = line.indexOf('=');
  return separator > 0 && !line.trimStart().startsWith('#') ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()] : null;
}).filter(Boolean));

let values;
try { values = parseEnv(await readFile('.env', 'utf8')); }
catch { process.stderr.write('Run `npm run configure` before using EAS.\n'); process.exit(1); }
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(npx, ['--yes', 'eas-cli@21.4.0', ...process.argv.slice(2)], {
  stdio: 'inherit', shell: false,
  env: { ...process.env, ...values, GOOGLE_SERVICES_JSON: resolve('google-services.json'), EXPO_NO_TELEMETRY: '1' },
});
if (result.error) process.stderr.write(`${result.error.message}\n`);
process.exit(result.status ?? 1);
