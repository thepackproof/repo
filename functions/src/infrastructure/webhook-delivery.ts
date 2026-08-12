import { createHmac } from 'node:crypto';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db, webhookSigningSecret } from '../config';

type DeliveryRecord = {
  id: string;
  targetUrl: string;
  payloadPath?: string | null;
  payload?: string | null;
  headers?: Record<string, string> | null;
  attemptCount?: number;
  nextAttemptAt?: FirebaseFirestore.Timestamp | null;
  lastError?: string | null;
  state?: string;
};

async function computeHmac(secret: string, payload: string): Promise<string> {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export async function processPendingWebhooks(limit = 10): Promise<void> {
  const now = new Date();
  const snap = await db.collection('webhookDeliveries')
    .where('state', '==', 'PENDING')
    .where('nextAttemptAt', '<=', now)
    .orderBy('nextAttemptAt')
    .limit(limit)
    .get();

  for (const doc of snap.docs) {
    const data = doc.data() as DeliveryRecord;
    const payload = data.payload ?? '';
    const target = data.targetUrl;
    const attempt = (data.attemptCount ?? 0) + 1;
    const attemptsRef = doc.ref.collection('attempts');
    const attemptDocRef = await attemptsRef.add({ attempt, startedAt: new Date(), status: 'IN_PROGRESS' });

    try {
      const hmacSecret = webhookSigningSecret.value();
      const signature = payload && hmacSecret ? await computeHmac(hmacSecret, payload) : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (signature) headers['PackProof-Signature'] = `sha256=${signature}`;
      if (data.headers) Object.assign(headers, data.headers);

      const res = await fetch(target, { method: 'POST', headers, body: payload });
      if (res.ok) {
        const text = await res.text();
        await attemptDocRef.update({ status: 'SUCCESS', responseStatus: res.status, responseBody: String(text).slice(0, 2048), finishedAt: new Date() });
        await doc.ref.update({ state: 'DELIVERED', deliveredAt: new Date(), attemptCount: attempt, lastError: null });
        continue;
      }
      const text = await res.text();
      const backoffMs = Math.min(60_000 * Math.pow(2, Math.max(0, attempt - 1)), 24 * 60 * 60 * 1000);
      await attemptDocRef.update({ status: 'FAILED', responseStatus: res.status, responseBody: String(text).slice(0, 2048), finishedAt: new Date() });
      // transient failure: schedule retry
      await doc.ref.update({ attemptCount: attempt, lastError: `HTTP ${res.status}: ${text.slice(0, 512)}`, nextAttemptAt: new Date(Date.now() + backoffMs) });
      if (attempt >= 5) {
        await doc.ref.update({ state: 'POISON' });
      }
    } catch (err: any) {
      const message = err && err.message ? String(err.message) : String(err);
      const backoffMs = 60_000 * Math.min(attempt, 60);
      try { await attemptDocRef.update({ status: 'FAILED', error: message.slice(0, 1024), finishedAt: new Date() }); } catch { /* best effort */ }
      try { await doc.ref.update({ attemptCount: attempt, lastError: message.slice(0, 1024), nextAttemptAt: new Date(Date.now() + backoffMs) }); } catch { /* best effort */ }
      if (attempt >= 5) {
        try { await doc.ref.update({ state: 'POISON' }); } catch { /* best effort */ }
      }
    }
  }
}

export const scheduledWebhookDelivery = onSchedule('every 1 minutes', async () => {
  await processPendingWebhooks(20);
});

export default scheduledWebhookDelivery;
