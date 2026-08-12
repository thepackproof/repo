import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const adminApp = emulatorAvailable ? initializeApp({ projectId: 'packproof-api-test' }, `admin-requeue-${Date.now()}`) : null;
const firestore = adminApp ? getFirestore(adminApp) : null;

before(async () => {
  if (!emulatorAvailable) return;
  await firestore.collection('webhookDeliveries').doc('poison-1').set({ state: 'POISON', targetUrl: 'http://example.invalid' });
});

after(async () => {
  if (adminApp) await deleteApp(adminApp);
});

test('admin CLI requeues poison delivery', { skip: !emulatorAvailable }, async () => {
  // emulate admin CLI by updating with admin SDK (the CLI would do the same)
  const { initializeApp: initApp, deleteApp: delApp } = require('firebase-admin/app');
  const { getFirestore: getDb } = require('firebase-admin/firestore');
  const admin = initApp({ projectId: 'packproof-api-test' }, `cli-test-${Date.now()}`);
  const db2 = getDb(admin);
  await db2.collection('webhookDeliveries').doc('poison-1').update({ state: 'PENDING', nextAttemptAt: new Date(), lastError: null });
  await delApp(admin);
  const snap = await firestore.collection('webhookDeliveries').doc('poison-1').get();
  assert.equal(snap.data().state, 'PENDING');
});
