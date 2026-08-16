import assert from 'node:assert/strict';
import { after, test } from 'node:test';
import { createRequire } from 'node:module';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const { listDueConnectCallbackDocs } = require('../lib/infrastructure/firebase/v1/connect-callback-retry.js');

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const adminApp = emulatorAvailable ? initializeApp({ projectId: 'packproof-api-test' }, `connect-callback-retry-${Date.now()}`) : null;
const firestore = adminApp ? getFirestore(adminApp) : null;

after(async () => {
  if (adminApp) await deleteApp(adminApp);
});

test('Connect callback retry query returns only due FAILED/PENDING records across a larger not-due batch', { skip: !emulatorAvailable }, async () => {
  const now = new Date('2026-08-16T18:00:00.000Z');
  const future = Timestamp.fromDate(new Date(now.getTime() + 60_000));
  const past = Timestamp.fromDate(new Date(now.getTime() - 60_000));
  const writes = [];
  for (let index = 0; index < 25; index += 1) {
    writes.push(firestore.collection('webhookDeliveries').doc(`not-due-${index}`).set({
      status: 'PENDING',
      nextAttemptAt: future,
    }));
  }
  writes.push(firestore.collection('webhookDeliveries').doc('due-failed-a').set({
    status: 'FAILED',
    nextAttemptAt: past,
  }));
  writes.push(firestore.collection('webhookDeliveries').doc('due-failed-b').set({
    status: 'FAILED',
    nextAttemptAt: Timestamp.fromDate(new Date(now.getTime() - 30_000)),
  }));
  writes.push(firestore.collection('webhookDeliveries').doc('due-pending').set({
    status: 'PENDING',
    nextAttemptAt: Timestamp.fromDate(new Date(now.getTime() - 5_000)),
  }));
  writes.push(firestore.collection('webhookDeliveries').doc('delivered-old').set({
    status: 'DELIVERED',
    nextAttemptAt: past,
  }));
  await Promise.all(writes);

  const due = await listDueConnectCallbackDocs(firestore, now, 20);
  assert.deepEqual(due.map((doc) => doc.id).sort(), ['due-failed-a', 'due-failed-b', 'due-pending']);
});
