import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { EncryptedEdgeQueue } from '../lib/edge/v1/index.js';
import { FileBackedSoftwareKeyStore, openDurableEncryptedEdgeQueue } from '../lib/edge/v1/index.js';

test('durable encrypted spool survives process restart with the same key', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'packproof-edge-spool-'));
  const keyStore = new FileBackedSoftwareKeyStore(path.join(root, 'spool.key'));
  const first = openDurableEncryptedEdgeQueue(root, keyStore);
  const plaintext = Buffer.from('station-packing-segment-restart');
  const record = first.queue.enqueue({
    fulfillmentSessionId: 'fs_12345678',
    artifactType: 'STATION_PACKING_VIDEO',
    plaintext,
    plaintextSha256: 'a'.repeat(64),
    onlineAtCapture: false,
    clientEvidenceId: 'client-evidence-restart',
  });
  first.queue.markUploading(record.clientEvidenceId);
  const second = openDurableEncryptedEdgeQueue(root, keyStore);
  const restored = second.queue.list()[0];
  assert.equal(restored.transportState, 'PENDING');
  assert.deepEqual(second.queue.decrypt(restored.clientEvidenceId), plaintext);
  assert.equal(restored.folder, 'pending');
  assert.ok(fs.existsSync(path.join(root, 'artifacts', `${restored.clientEvidenceId}.bin`)));
  const thirdKey = new FileBackedSoftwareKeyStore(path.join(root, 'spool.key')).loadOrCreate();
  assert.deepEqual(thirdKey, first.key);
});

test('durable spool authenticates metadata independently of ciphertext AAD', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'packproof-edge-spool-'));
  const opened = openDurableEncryptedEdgeQueue(root, new FileBackedSoftwareKeyStore(path.join(root, 'spool.key')));
  const queue = new EncryptedEdgeQueue(opened.key, opened.store);
  const record = queue.enqueue({
    fulfillmentSessionId: 'fs_12345678',
    artifactType: 'STATION_SEAL_REFERENCE',
    plaintext: Buffer.from('seal-bytes'),
    plaintextSha256: 'b'.repeat(64),
    onlineAtCapture: true,
    clientEvidenceId: 'client-evidence-aad',
  });
  assert.equal(record.metadataMac.length > 20, true);
  assert.equal(queue.decrypt(record.clientEvidenceId).toString(), 'seal-bytes');
});
