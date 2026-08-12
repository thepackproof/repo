import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from '../config';
import { requireUid } from '../helpers';

function requireAdmin(request: Parameters<typeof requireUid>[0]) {
  const uid = requireUid(request);
  if (request.auth?.token.packproofAdmin !== true) throw new HttpsError('permission-denied', 'PackProof administrator approval is required.');
  return uid;
}

export const requeueWebhookDelivery = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireAdmin(request);
  const deliveryId = typeof request.data?.deliveryId === 'string' ? request.data.deliveryId : null;
  if (!deliveryId) throw new HttpsError('invalid-argument', 'deliveryId is required.');
  const ref = db.collection('webhookDeliveries').doc(deliveryId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Delivery not found.');
  await ref.update({ state: 'PENDING', nextAttemptAt: FieldValue.serverTimestamp(), lastError: null });
  await ref.collection('attempts').add({ actorId: uid, action: 'REQUEUE', createdAt: FieldValue.serverTimestamp() });
  return { ok: true };
});

export const getWebhookDelivery = onCall({ enforceAppCheck: true }, async (request) => {
  requireAdmin(request);
  const deliveryId = typeof request.data?.deliveryId === 'string' ? request.data.deliveryId : null;
  if (!deliveryId) throw new HttpsError('invalid-argument', 'deliveryId is required.');
  const ref = db.collection('webhookDeliveries').doc(deliveryId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Delivery not found.');
  const attemptsSnap = await ref.collection('attempts').orderBy('createdAt', 'desc').limit(20).get();
  return { data: snap.data(), attempts: attemptsSnap.docs.map((d) => d.data()) };
});

export default { requeueWebhookDelivery, getWebhookDelivery };
