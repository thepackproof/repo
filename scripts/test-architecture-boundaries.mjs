import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/, '$1:');
const findings = [];

async function files(directory, extensions) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path, extensions));
    else if (extensions.has(extname(path))) result.push(path);
  }
  return result;
}

function rel(path) {
  return relative(root, path).replaceAll('\\', '/');
}

function add(path, rule, line) {
  findings.push(`${rel(path)}: ${rule} -> ${line.trim()}`);
}

const domain = await files(join(root, 'functions/src/domain'), new Set(['.ts']));
for (const path of domain) {
  const text = await readFile(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (/from ['"]firebase|from ['"]firebase-admin|from ['"]firebase-functions|from ['"]express|from ['"]react|from ['"]react-native|from ['"]expo/.test(line)) {
      add(path, 'domain cannot import infrastructure or presentation', line);
    }
  }
}

const application = await files(join(root, 'functions/src/application'), new Set(['.ts']));
for (const path of application) {
  const text = await readFile(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (/from ['"].*infrastructure\/firebase/.test(line)) {
      add(path, 'application cannot import concrete Firebase repositories', line);
    }
    if (/from ['"]firebase-admin|from ['"]express|from ['"]react/.test(line)) {
      add(path, 'application cannot import Firebase/Express/React', line);
    }
  }
}

const portal = await files(join(root, 'portal/src'), new Set(['.ts', '.tsx']));
for (const path of portal) {
  const text = await readFile(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (/from ['"]firebase\/firestore|from ['"]firebase\/storage|getFirestore|getStorage/.test(line)) {
      add(path, 'portal cannot import Firestore/Storage', line);
    }
    if (/evaluatePassportEligibility|assertPassportEligible|aggregatePassport|boundOrIssuedIdentity/.test(line)) {
      add(path, 'portal cannot call Proof internals', line);
    }
    if (/resolveNextRequiredAction\(/.test(line) && !path.endsWith('workspace.ts') && !path.includes('tests')) {
      add(path, 'portal UI cannot call resolveNextRequiredAction', line);
    }
    if (/projectTransactionWorkspace\(/.test(line) && !path.includes('tests')) {
      add(path, 'portal UI cannot project a workspace locally', line);
    }
    if (/workspaceFromPortal|workspaceFromSlice/.test(line)) {
      add(path, 'portal UI cannot reconstruct workspace from slices', line);
    }
  }
}

const mobileUi = [
  ...await files(join(root, 'src/app'), new Set(['.ts', '.tsx'])),
  ...await files(join(root, 'src/components'), new Set(['.ts', '.tsx'])),
];
for (const path of mobileUi) {
  const text = await readFile(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    if (/evaluatePassportEligibility|assertPassportEligible|aggregatePassport/.test(line)) {
      add(path, 'mobile UI cannot calculate Proof eligibility', line);
    }
    if (/resolveNextRequiredAction\(/.test(line)) {
      add(path, 'mobile UI cannot call resolveNextRequiredAction', line);
    }
    if (/projectTransactionWorkspace\(/.test(line)) {
      add(path, 'mobile UI cannot project a workspace locally', line);
    }
    if (/workspaceFromSlice/.test(line)) {
      add(path, 'mobile UI cannot reconstruct workspace from slices', line);
    }
  }
}

if (findings.length) {
  console.error('Architecture boundary violations:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}
console.log('Architecture boundary checks passed.');
