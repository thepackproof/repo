import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'sdk/javascript/browser.js');
const destination = resolve(root, 'public/sdk/packproof-button-v1.js');
await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);
process.stdout.write(`Built ${destination}\n`);
