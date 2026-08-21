import { access, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const command = process.argv[2] ?? 'check';
const isWindows = process.platform === 'win32';
const executable = (name) => isWindows ? `${name}.cmd` : name;
const pass = (message) => process.stdout.write(`[PASS] ${message}\n`);
const warn = (message) => process.stdout.write(`[WARN] ${message}\n`);
const fail = (message) => process.stderr.write(`[FAIL] ${message}\n`);
const exists = async (path) => access(path).then(() => true).catch(() => false);
const parseEnv = (text) => Object.fromEntries(text.split(/\r?\n/).map((line) => {
  const separator = line.indexOf('=');
  return separator > 0 && !line.trimStart().startsWith('#')
    ? [line.slice(0, separator).trim(), line.slice(separator + 1).trim()]
    : null;
}).filter(Boolean));

function capture(program, args = []) {
  const result = spawnSync(program, args, { encoding: 'utf8', shell: false });
  return { ...result, output: `${result.stdout ?? ''}${result.stderr ?? ''}`.trim() };
}

function run(program, args, options = {}) {
  process.stdout.write(`\n> ${program} ${args.join(' ')}\n`);
  const result = spawnSync(program, args, { stdio: 'inherit', shell: false, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${program} exited with status ${result.status ?? 'unknown'}.`);
}

function nodeIsSupported() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major === 22) { pass(`Node ${process.versions.node} matches the supported runtime`); return true; }
  fail(`Node ${process.versions.node} is active; PackProof requires Node 22`);
  return false;
}

function javaIsSupported() {
  const java = capture('java', ['-version']);
  const javac = capture('javac', ['-version']);
  const match = /version\s+"?(\d+)/i.exec(java.output);
  const major = match ? Number(match[1]) : 0;
  if (!java.error && !javac.error && major >= 21) { pass(`JDK ${major} is available for Firebase emulators and Android builds`); return true; }
  fail('JDK 21 or newer (including javac) is required for local verification');
  return false;
}

function adbIsAvailable() {
  const adb = capture('adb', ['version']);
  if (!adb.error && adb.status === 0) { pass('Android platform-tools (adb) are available'); return true; }
  fail('adb is missing; install Android SDK Platform-Tools');
  return false;
}

async function configurationIsReady() {
  const required = ['.env', '.firebaserc', 'google-services.json', 'functions/.env'];
  const missing = [];
  for (const path of required) {
    if (await exists(path)) pass(`${path} is present`);
    else { fail(`${path} is missing`); missing.push(path); }
  }
  if (missing.length) {
    warn('Run `npm run configure`, add the real Firebase google-services.json, and complete EXTERNAL_DEMO.md.');
    return false;
  }
  return true;
}

function warnAboutWindowsPath() {
  if (!isWindows) return;
  const root = resolve('.');
  if (/\\OneDrive\\/i.test(root) || root.length > 70) {
    warn('For local Gradle/CMake builds, copy the project to a short non-OneDrive path such as C:\\src\\packproof. EAS cloud builds are not affected.');
  } else pass('Project path is suitable for local native builds');
}

function connectedDevices() {
  const result = capture('adb', ['devices']);
  if (result.error || result.status !== 0) return [];
  return result.output.split(/\r?\n/).slice(1).map((line) => line.trim().split(/\s+/)).filter((parts) => parts[1] === 'device').map((parts) => parts[0]);
}

async function check({ requireJava = false, requireConfig = true } = {}) {
  process.stdout.write('\nPackProof PC demonstration preflight\n\n');
  let okay = nodeIsSupported();
  if (requireJava) okay = javaIsSupported() && okay;
  okay = adbIsAvailable() && okay;
  if (requireConfig) okay = await configurationIsReady() && okay;
  warnAboutWindowsPath();
  const devices = connectedDevices();
  if (devices.length === 1) pass(`One Android target is connected (${devices[0]})`);
  else if (devices.length === 0) warn('No authorized Android device/emulator is connected yet');
  else warn(`Multiple Android targets are connected (${devices.join(', ')}); disconnect extras before install/start`);
  return okay;
}

async function installApk() {
  const apkPath = process.argv[3] ? resolve(process.argv[3]) : null;
  if (!apkPath || !await exists(apkPath) || !apkPath.toLowerCase().endsWith('.apk')) {
    throw new Error('Usage: npm run demo:pc -- install C:\\path\\to\\real-packproof-preview.apk [package.name]');
  }
  if (!adbIsAvailable()) process.exit(1);
  const devices = connectedDevices();
  if (devices.length !== 1) throw new Error(`Exactly one authorized Android target is required; found ${devices.length}.`);
  run('adb', ['-s', devices[0], 'install', '-r', apkPath]);

  let packageName = process.argv[4];
  if (!packageName && await exists('.env')) packageName = parseEnv(await readFile('.env', 'utf8')).ANDROID_PACKAGE_NAME;
  packageName ||= 'com.thepackproof.app';
  if (!/^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*){1,}$/.test(packageName)) throw new Error('The Android package name is invalid.');
  run('adb', ['-s', devices[0], 'shell', 'monkey', '-p', packageName, '-c', 'android.intent.category.LAUNCHER', '1']);
  pass(`Installed and opened ${packageName} on ${devices[0]}`);
}

async function startDevelopmentClient() {
  if (!await check({ requireConfig: true })) process.exit(1);
  if (connectedDevices().length !== 1) throw new Error('Connect exactly one authorized Android device or start one emulator.');
  run(executable('npx'), ['expo', 'start', '--dev-client', '--android'], {
    env: { ...process.env, ...parseEnv(await readFile('.env', 'utf8')), EXPO_NO_TELEMETRY: '1' },
  });
}

async function verify() {
  let okay = nodeIsSupported();
  okay = javaIsSupported() && okay;
  warnAboutWindowsPath();
  if (!okay) process.exit(1);
  run(executable('npm'), ['run', 'typecheck']);
  run(executable('npm'), ['run', 'lint']);
  run(executable('npm'), ['--prefix', 'functions', 'run', 'build']);
  run(executable('npm'), ['run', 'test:billing']);
  run(executable('npm'), ['run', 'test:sdk']);
  run(executable('npm'), ['run', 'test:rules']);
  pass('Local deterministic verification gates passed');
}

try {
  if (command === 'check') {
    if (!await check({ requireConfig: true })) process.exitCode = 1;
  } else if (command === 'verify') await verify();
  else if (command === 'start') await startDevelopmentClient();
  else if (command === 'install') await installApk();
  else throw new Error('Use one of: check, verify, start, install. See PC_DEMO.md.');
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
