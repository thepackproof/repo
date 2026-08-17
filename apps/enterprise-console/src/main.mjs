#!/usr/bin/env node
/**
 * PackProof Enterprise™ console entry.
 *
 * Station and queue health are projected by the Functions application service.
 * This process is not the Expo app and cannot finalize or rewrite evidence.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../..');
const library = join(root, 'functions/lib/application/v1/enterprise-console-service.js');

if (!existsSync(library)) {
  console.error('PackProof Enterprise console requires a compiled Functions package. Run `npm --prefix functions run build` first.');
  process.exit(1);
}

const command = process.argv[2] ?? 'status';
if (command === 'status' || command === '--help' || command === '-h') {
  console.log('PackProof Enterprise™ console');
  console.log('Operators may view station and queue health.');
  console.log('Administrators may not alter finalized evidence.');
  console.log('');
  console.log('Commands:');
  console.log('  status        Show this process identity');
  console.log('  render-demo   Print a SOURCE_CHECKED HTML projection');
  process.exit(0);
}

if (command === 'render-demo') {
  const { EnterpriseConsoleApplicationService } = await import(library);
  const consoleService = new EnterpriseConsoleApplicationService(
    { getSession: async () => null },
    { listStations: async () => [], listSessions: async () => [], listWmsMappings: async () => [] },
    () => new Date('2026-08-17T12:00:00.000Z'),
  );
  const html = consoleService.renderHtml({
    object: 'enterprise_console_snapshot',
    schemaVersion: 1,
    organizationId: 'org_12345678',
    generatedAt: '2026-08-17T12:00:00.000Z',
    stations: [{
      stationCode: 'PACK-042',
      siteCode: 'CMH-FC-01',
      siteName: 'Columbus',
      health: 'Healthy',
      operatingMode: 'OBSERVE',
      policyId: 'ENTERPRISE_STANDARD_OUTBOUND_V1',
      edgeInstallationIdentity: 'EDGE-CMH-03',
      queue: {
        stationId: 'station_12345678',
        pending: 0,
        uploading: 0,
        awaitingFinalization: 0,
        finalized: 2,
        attention: 0,
      },
      openSessions: 0,
      exceptions: [],
    }],
    mappings: [],
    audit: [],
    limitations: [
      'Administrators may view station and queue health. This console does not alter finalized evidence.',
      'These rows are observations. They are not fraud, authenticity, custody, or claim-disposition verdicts.',
      'An Edge upload is not server finalization.',
    ],
  });
  console.log(html);
  process.exit(0);
}

console.error(`Unknown PackProof Enterprise console command: ${command}`);
process.exit(1);
