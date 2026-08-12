import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const { cleanupIdempotencyRecords } = require('../lib/maintenance/idempotency-cleanup.js');

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const adminApp = emulatorAvailable ? initializeApp({ projectId: 'packproof-api-test' }, `idem-cleanup-${Date.now()}`) : null;
const firestore = adminApp ? getFirestore(adminApp) : null;

before(async () => {
  if (!emulatorAvailable) return;
  await firestore.collection('apiIdempotencyRecords').doc('old-complete').set({ keyHash: 'a', state: 'COMPLETE', createdAt: Timestamp.fromMillis(Date.now() - 40 * 24 * 60 * 60 * 1000) });
  await firestore.collection('apiIdempotencyRecords').doc('old-failed').set({ keyHash: 'b', state: 'FAILED', createdAt: Timestamp.fromMillis(Date.now() - 40 * 24 * 60 * 60 * 1000) });
  await firestore.collection('apiIdempotencyRecords').doc('recent').set({ keyHash: 'c', state: 'COMPLETE', createdAt: Timestamp.fromMillis(Date.now() - 2 * 24 * 60 * 60 * 1000) });
});

after(async () => {
  if (adminApp) await deleteApp(adminApp);
});

test('cleanup removes old COMPLETE/FAILED idempotency records', { skip: !emulatorAvailable }, async () => {
  const removed = await cleanupIdempotencyRecords(30, 1000);
  const snap = await firestore.collection('apiIdempotencyRecords').get();
  const ids = snap.docs.map((d) => d.id);
  assert.equal(removed, 2);
  assert.ok(ids.includes('recent'));
  assert.ok(!ids.includes('old-complete'));
  assert.ok(!ids.includes('old-failed'));
});
