import { FieldValue, Timestamp, type Firestore } from 'firebase-admin/firestore';
import {
  CONNECT_CALLBACK_LEASE_SECONDS,
  CONNECT_CALLBACK_RETRY_BATCH_SIZE,
  CONNECT_CALLBACK_RETRY_STATUSES,
  isConnectCallbackRetryStatus,
} from '../../../application/v1/connect-callback-retry-policy';

export type ConnectCallbackDelivery = FirebaseFirestore.DocumentData;

export async function listDueConnectCallbackDocs(
  firestore: Firestore,
  now: Date = new Date(),
  limit = CONNECT_CALLBACK_RETRY_BATCH_SIZE,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  const snaps = await Promise.all(CONNECT_CALLBACK_RETRY_STATUSES.map((status) => (
    firestore.collection('webhookDeliveries')
      .where('status', '==', status)
      .where('nextAttemptAt', '<=', now)
      .orderBy('nextAttemptAt')
      .limit(limit)
      .get()
  )));
  const docs = snaps.flatMap((snap) => snap.docs);
  docs.sort((left, right) => {
    const leftAt = (left.data().nextAttemptAt as Timestamp | undefined)?.toMillis() ?? 0;
    const rightAt = (right.data().nextAttemptAt as Timestamp | undefined)?.toMillis() ?? 0;
    return leftAt - rightAt || left.id.localeCompare(right.id);
  });
  return docs.slice(0, limit);
}

export async function processDueConnectCallbacks(options: {
  firestore: Firestore;
  deliver: (ref: FirebaseFirestore.DocumentReference, delivery: ConnectCallbackDelivery) => Promise<void>;
  now?: Date;
  limit?: number;
}): Promise<{ selected: number; attempted: number; delivered: number; failed: number }> {
  const now = options.now ?? new Date();
  const selected = await listDueConnectCallbackDocs(options.firestore, now, options.limit ?? CONNECT_CALLBACK_RETRY_BATCH_SIZE);
  let attempted = 0;
  let delivered = 0;
  let failed = 0;
  for (const doc of selected) {
    const delivery = await options.firestore.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const data = fresh.data();
      if (!fresh.exists || !data || !isConnectCallbackRetryStatus(String(data.status))) return null;
      const nextAttemptAt = data.nextAttemptAt as Timestamp | undefined;
      if (nextAttemptAt && nextAttemptAt.toMillis() > now.getTime()) return null;
      tx.set(doc.ref, {
        status: 'PENDING',
        attempts: FieldValue.increment(1),
        nextAttemptAt: Timestamp.fromMillis(Date.now() + CONNECT_CALLBACK_LEASE_SECONDS * 1_000),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return data;
    });
    if (!delivery) continue;
    attempted += 1;
    try {
      await options.deliver(doc.ref, delivery);
      delivered += 1;
    } catch (error) {
      failed += 1;
      const attempts = Number(delivery.attempts ?? 1) + 1;
      const delaySeconds = Math.min(6 * 3600, 300 * 2 ** Math.min(attempts, 6));
      await doc.ref.set({
        status: 'FAILED',
        lastError: error instanceof Error ? error.message.slice(0, 500) : 'Unknown callback error.',
        nextAttemptAt: Timestamp.fromMillis(Date.now() + delaySeconds * 1_000),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  }
  return { selected: selected.length, attempted, delivered, failed };
}
