import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { adminAuth, db, publicAppUrl } from './config';
import { expiresIn, hash, randomToken } from './helpers';
import { applySecurityHeaders, requestIp } from './http-security';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const httpOptions = { cors: false, invoker: 'public' as const };

function publicOrigin(): string {
  return publicAppUrl.value().replace(/\/$/, '');
}

function redirect(response: { redirect(status: number, url: string): unknown }, path: string, status = 303): void {
  response.redirect(status, `${publicOrigin()}${path}`);
}

async function tokenSnapshot(token: string) {
  if (!token || token.length < 20 || token.length > 160) return null;
  const ref = db.collection('webDeletionTokens').doc(hash(token));
  const snap = await ref.get();
  const data = snap.data();
  if (!snap.exists || !data || (data.expiresAt as Timestamp).toMillis() < Date.now()) return null;
  return { ref, data };
}

export const webDeletionRequest = onRequest(httpOptions, async (request, response) => {
  applySecurityHeaders(response);
  if (request.method !== 'POST') { response.status(405).send('Method not allowed'); return; }
  const email = String(request.body?.email ?? '').trim().toLowerCase();
  if (!emailPattern.test(email) || email.length > 254) { response.status(400).json({ message: 'Enter a valid email address.' }); return; }
  const ipKey = hash(requestIp(request));
  const rateRef = db.collection('deletionRateLimits').doc(ipKey);
  const today = new Date().toISOString().slice(0, 10);
  const allowed = await db.runTransaction(async (tx) => {
    const rate = await tx.get(rateRef);
    const count = rate.data()?.day === today ? Number(rate.data()?.count ?? 0) : 0;
    if (count >= 5) return false;
    tx.set(rateRef, { day: today, count: count + 1, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    return true;
  });
  if (!allowed) { response.status(429).json({ message: 'Too many requests. Try again tomorrow.' }); return; }

  try {
    const user = await adminAuth.getUserByEmail(email);
    const token = randomToken(32);
    await db.collection('webDeletionTokens').doc(hash(token)).set({ uid: user.uid, email, expiresAt: expiresIn(1800), createdAt: FieldValue.serverTimestamp() });
    const confirmationUrl = `${publicOrigin()}/api/confirm-deletion?token=${encodeURIComponent(token)}`;
    await db.collection('mail').add({
      to: email,
      message: {
        subject: 'Confirm your PackProof account deletion request',
        text: `Open this link within 30 minutes to review and confirm deletion of your PackProof account: ${confirmationUrl}`,
        html: `<p>We received a request to delete your PackProof account.</p><p><a href="${confirmationUrl}">Review account deletion</a></p><p>This link expires in 30 minutes and does not delete your account until you confirm. If you did not make this request, ignore this email.</p>`,
      },
    });
  } catch { /* Do not reveal whether an account exists. */ }
  response.status(200).json({ message: 'If a matching email account exists, a confirmation link has been sent.' });
});

export const confirmWebDeletion = onRequest(httpOptions, async (request, response) => {
  applySecurityHeaders(response);
  const token = String(
    request.method === 'POST'
      ? (request.body?.token ?? request.query.token ?? '')
      : (request.query.token ?? ''),
  );
  if (request.method === 'GET') {
    const valid = await tokenSnapshot(token);
    if (!valid) { redirect(response, '/deletion-invalid.html', 302); return; }
    redirect(response, `/deletion-confirm.html?token=${encodeURIComponent(token)}`, 302);
    return;
  }
  if (request.method !== 'POST') { response.status(405).send('Method not allowed'); return; }

  const scheduled = await db.runTransaction(async (tx) => {
    if (!token || token.length < 20 || token.length > 160) return false;
    const ref = db.collection('webDeletionTokens').doc(hash(token));
    const snap = await tx.get(ref);
    const data = snap.data();
    if (!snap.exists || !data || (data.expiresAt as Timestamp).toMillis() < Date.now()) return false;
    const scheduledAt = Timestamp.fromMillis(Date.now() + 7 * 86400_000);
    tx.set(db.collection('users').doc(data.uid), {
      deletionRequestedAt: FieldValue.serverTimestamp(),
      deletionScheduledAt: scheduledAt,
    }, { merge: true });
    tx.delete(ref);
    return true;
  });
  redirect(response, scheduled ? '/deletion-confirmed.html' : '/deletion-invalid.html');
});
