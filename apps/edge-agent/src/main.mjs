#!/usr/bin/env node
/**
 * PackProof Edge™ OS-service entry.
 *
 * Hardware adapters and the encrypted spool live in the Edge library compiled
 * with the Functions TypeScript package so one Node 22 gate owns SOURCE_CHECKED
 * behavior. This process is the warehouse daemon: it is not the Expo app.
 *
 * Windows Service / systemd installation is operational packaging and is not
 * claimed by running this file once.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const library = join(root, 'functions/lib/edge/v1/index.js');

if (!existsSync(library)) {
  console.error('PackProof Edge requires a compiled Functions package. Run `npm --prefix functions run build` first.');
  process.exit(1);
}

const command = process.argv[2] ?? 'status';
if (command === 'status' || command === '--help' || command === '-h') {
  console.log('PackProof Edge™');
  console.log('A warehouse acquisition daemon for cameras, scanners, scales, and WMS events.');
  console.log('It submits observations. It does not finalize evidence.');
  console.log('');
  console.log('Commands:');
  console.log('  status           Show this process identity');
  console.log('  simulate-pilot   Print the SOURCE_CHECKED single-station proof command');
  process.exit(0);
}

if (command === 'simulate-pilot') {
  console.log('Run the SOURCE_CHECKED single-station proof with simulated hardware:');
  console.log('  npm run test:enterprise');
  process.exit(0);
}

console.error(`Unknown PackProof Edge command: ${command}`);
process.exit(1);
