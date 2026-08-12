import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative } from 'node:path';

const root = new URL('..', import.meta.url).pathname.replace(/^\/(?:([A-Za-z]):)/, '$1:');
const scanRoots = ['src', 'public', 'sdk/javascript', 'functions/src', 'docs'];
const rootFiles = ['README.md', 'EXTERNAL_DEMO.md', 'PC_DEMO.md', 'SETUP_WIZARD.md'];
const excluded = new Set(['docs/WHITEPAPER_COMPLIANCE.md', 'docs/CLAIMS_REGISTER.json']);
const extensions = new Set(['.ts', '.tsx', '.js', '.mjs', '.html', '.md', '.yaml', '.yml']);
const prohibited = [
  /\bunclonable\b/i,
  /\bforensic[- ]grade\b/i,
  /\blegally binding\b/i,
  /\binstant liveness\b/i,
  /\bzero[- ]error\b/i,
  /\bguaranteed (?:chargeback|win|outcome|acceptance)\b/i,
  /\babsolutely immutable\b/i,
  /\bjit device verified\b/i,
  /\bverified evidence\b/i,
  /\bverified return\b/i,
  /\bsigned manifest\b/i,
  /\bverified (?:capture|file|record|fulfillment|status)\b/i,
  /\btrusted server timestamp\b/i,
  /\bimmutable evidence(?: metadata| record)?\b/i,
];
const boundedContext = /\b(?:not|never|cannot|does not|is not|neither|no|unsupported|prohibited|avoid|without)\b/i;

const findings = [];
const paths = [];
for (const scanRoot of scanRoots) {
  paths.push(...await files(join(root, scanRoot)));
}
paths.push(...rootFiles.map((name) => join(root, name)));
for (const path of paths) {
    const relativePath = relative(root, path).replaceAll('\\', '/');
    if (excluded.has(relativePath)) continue;
    if (!extensions.has(extname(path))) continue;
    const lines = (await readFile(path, 'utf8')).split(/\r?\n/);
    lines.forEach((line, index) => {
      for (const pattern of prohibited) {
        if (pattern.test(line) && !boundedContext.test(line)) {
          findings.push(`${relativePath}:${index + 1}: ${pattern} -> ${line.trim()}`);
        }
      }
    });
}

if (findings.length) {
  console.error('Unbounded prohibited PackProof claim wording found:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}
console.log('PackProof production claim vocabulary check passed.');

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await files(path));
    else if (entry.isFile()) result.push(path);
  }
  return result;
}
