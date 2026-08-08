import { createHash, randomBytes } from 'node:crypto';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { db } from './config';
import type { TransactionRecord } from './types';

export function requireUid(request: CallableRequest<unknown>): string {
  if (!request.auth?.uid) throw new HttpsError('unauthenticated', 'Sign in is required.');
  return request.auth.uid;
}

export function requireRecentSignIn(request: CallableRequest<unknown>, maxAgeSeconds = 600): string {
  const uid = requireUid(request);
  const authTime = Number(request.auth?.token.auth_time ?? 0);
  if (!authTime || Date.now() / 1000 - authTime > maxAgeSeconds) {
    throw new HttpsError('failed-precondition', 'Please sign in again before continuing.');
  }
  return uid;
}

export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export async function getTransaction(transactionId: string): Promise<{ ref: FirebaseFirestore.DocumentReference; data: TransactionRecord }> {
  const ref = db.collection('transactions').doc(transactionId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Transaction not found.');
  return { ref, data: snap.data() as TransactionRecord };
}

export function assertParticipant(record: TransactionRecord, uid: string): void {
  if (!record.participantIds.includes(uid)) throw new HttpsError('permission-denied', 'You are not a participant in this transaction.');
}

export function assertSeller(record: TransactionRecord, uid: string): void {
  if (record.sellerId !== uid) throw new HttpsError('permission-denied', 'Only the seller can do that.');
}

export async function appendEvent(
  transactionId: string,
  actorId: string,
  type: string,
  summary: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await db.collection('transactions').doc(transactionId).collection('events').add({
    actorId,
    type,
    summary: summary.slice(0, 500),
    metadata,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function assertAccountActive(uid: string): Promise<FirebaseFirestore.DocumentData> {
  const snap = await db.collection('users').doc(uid).get();
  const data = snap.data() ?? {};
  if (data.moderationState === 'SUSPENDED') throw new HttpsError('permission-denied', 'This account is suspended.');
  if (data.deletionScheduledAt) throw new HttpsError('failed-precondition', 'Cancel account deletion before creating or changing transactions.');
  return data;
}

export const expiresIn = (seconds: number) => Timestamp.fromMillis(Date.now() + seconds * 1000);

export function publicUser(user: { uid: string; displayName?: string | null; photoURL?: string | null; email?: string | null }) {
  return {
    uid: user.uid,
    displayName: (user.displayName ?? 'PackProof member').slice(0, 120),
    photoURL: user.photoURL ?? null,
    email: user.email ?? null,
  };
}

export async function notifyOtherParticipants(transactionId: string, actorId: string, title: string, body: string): Promise<void> {
  try {
    const { data } = await getTransaction(transactionId);
    const recipients = data.participantIds.filter((uid) => uid !== actorId);
    const profiles = await Promise.all(recipients.map((uid) => db.collection('users').doc(uid).get()));
    const messages = profiles.map((snap) => snap.data()?.expoPushToken as string | undefined).filter(Boolean).map((to) => ({ to, title, body, sound: 'default', channelId: 'transactions', data: { transactionId } }));
    if (!messages.length) return;
    await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(messages) });
  } catch { /* Notifications are best-effort and never block evidence workflows. */ }
}
