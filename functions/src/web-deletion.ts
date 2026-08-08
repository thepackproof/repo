import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { adminAuth, db, publicAppUrl } from './config';
import { expiresIn, hash, randomToken } from './helpers';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const webDeletionRequest = onRequest(async (request, response) => {
  if (request.method !== 'POST') { response.status(405).send('Method not allowed'); return; }
  const email = String(request.body?.email ?? '').trim().toLowerCase();
  if (!emailPattern.test(email) || email.length > 254) { response.status(400).json({ message: 'Enter a valid email address.' }); return; }
  const ipKey = hash(String(request.ip ?? request.get('x-forwarded-for') ?? 'unknown'));
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
    const confirmationUrl = `${publicAppUrl.value().replace(/\/$/, '')}/api/confirm-deletion?token=${encodeURIComponent(token)}`;
    await db.collection('mail').add({
      to: email,
      message: {
        subject: 'Confirm your PackProof account deletion request',
        text: `Open this link within 30 minutes to schedule deletion of your PackProof account: ${confirmationUrl}`,
        html: `<p>We received a request to delete your PackProof account.</p><p><a href="${confirmationUrl}">Confirm account deletion</a></p><p>This link expires in 30 minutes. If you did not make this request, ignore this email.</p>`,
      },
    });
  } catch { /* Do not reveal whether an account exists. */ }
  response.status(200).json({ message: 'If a matching email account exists, a confirmation link has been sent.' });
});

export const confirmWebDeletion = onRequest(async (request, response) => {
  const token = String(request.query.token ?? '');
  const ref = db.collection('webDeletionTokens').doc(hash(token));
  const snap = token ? await ref.get() : null;
  const data = snap?.data();
  if (!snap?.exists || (data?.expiresAt as Timestamp).toMillis() < Date.now()) {
    response.redirect(302, `${publicAppUrl.value().replace(/\/$/, '')}/deletion-invalid.html`);
    return;
  }
  const scheduledAt = Timestamp.fromMillis(Date.now() + 7 * 86400_000);
  await db.collection('users').doc(data!.uid).set({ deletionRequestedAt: FieldValue.serverTimestamp(), deletionScheduledAt: scheduledAt }, { merge: true });
  await ref.delete();
  response.redirect(302, `${publicAppUrl.value().replace(/\/$/, '')}/deletion-confirmed.html`);
});
