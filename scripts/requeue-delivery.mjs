#!/usr/bin/env node
import { initializeApp, deleteApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

if (process.argv.length < 3) {
  console.error('Usage: node scripts/requeue-delivery.mjs <deliveryId> [projectId]');
  process.exitCode = 2;
}
const deliveryId = process.argv[2];
const projectId = process.argv[3] ?? process.env.FIRESTORE_PROJECT ?? 'packproof-api-test';

const app = initializeApp({ projectId }, `cli-${Date.now()}`);
const db = getFirestore(app);

try {
  const ref = db.collection('webhookDeliveries').doc(deliveryId);
  const snap = await ref.get();
  if (!snap.exists) {
    console.error('Delivery not found');
    process.exitCode = 1;
  } else {
    await ref.update({ state: 'PENDING', nextAttemptAt: new Date(), lastError: null });
    console.log('Requeued', deliveryId);
  }
} finally {
  await deleteApp(app);
}
