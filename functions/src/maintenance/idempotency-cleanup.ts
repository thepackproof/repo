import { onSchedule } from 'firebase-functions/v2/scheduler';
import { db } from '../config';
import { Timestamp } from 'firebase-admin/firestore';

export async function cleanupIdempotencyRecords(retentionDays = 30, limit = 500) {
  const cutoff = Timestamp.fromMillis(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
  const snap = await db.collection('apiIdempotencyRecords')
    .where('createdAt', '<=', cutoff)
    .where('state', 'in', ['COMPLETE', 'FAILED'])
    .limit(limit)
    .get();
  if (snap.empty) return 0;
  const batch = db.bulkWriter();
  let count = 0;
  snap.docs.forEach((doc) => {
    batch.delete(doc.ref);
    count += 1;
  });
  await batch.close();
  return count;
}

export const scheduledCleanup = onSchedule('every 24 hours', async () => {
  await cleanupIdempotencyRecords(30, 500);
});

export default scheduledCleanup;
