import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { adminAuth, db, storage } from './config';
import { hash, requireRecentSignIn, requireUid } from './helpers';

async function deleteStoredFiles(...paths: unknown[]): Promise<void> {
  const uniquePaths = Array.from(new Set(paths.filter((path): path is string => typeof path === 'string' && path.length > 0)));
  await Promise.all(uniquePaths.map((path) => storage.bucket().file(path).delete({ ignoreNotFound: true })));
}

export const requestAccountDeletion = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireRecentSignIn(request);
  const confirmation = String((request.data as { confirmation?: unknown })?.confirmation ?? '');
  if (confirmation !== 'DELETE') throw new HttpsError('invalid-argument', 'Type DELETE to confirm account deletion.');
  const scheduledAt = Timestamp.fromMillis(Date.now() + 7 * 86400_000);
  await db.collection('users').doc(uid).set({ deletionRequestedAt: FieldValue.serverTimestamp(), deletionScheduledAt: scheduledAt }, { merge: true });
  return { scheduledAt: scheduledAt.toDate().toISOString() };
});

export const cancelAccountDeletion = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireUid(request);
  await db.collection('users').doc(uid).set({ deletionRequestedAt: FieldValue.delete(), deletionScheduledAt: FieldValue.delete() }, { merge: true });
  return { success: true };
});

export const exportAccountData = onCall({ enforceAppCheck: true, timeoutSeconds: 120 }, async (request) => {
  const uid = requireUid(request);
  const [profile, transactions] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('transactions').where('participantIds', 'array-contains', uid).get(),
  ]);
  const result = {
    exportedAt: new Date().toISOString(),
    profile: profile.data() ?? null,
    transactions: await Promise.all(transactions.docs.map(async (doc) => {
      const [events, evidence, returns, packets] = await Promise.all([
        doc.ref.collection('events').orderBy('createdAt', 'asc').get(),
        doc.ref.collection('evidence').orderBy('createdAt', 'asc').get(),
        doc.ref.collection('returns').orderBy('createdAt', 'asc').get(),
        doc.ref.collection('packets').orderBy('createdAt', 'asc').get(),
      ]);
      return {
        id: doc.id,
        ...doc.data(),
        events: events.docs.map((event) => ({ id: event.id, ...event.data() })),
        evidence: evidence.docs.map((item) => ({ id: item.id, ...item.data() })),
        returns: returns.docs.map((item) => ({ id: item.id, ...item.data() })),
        packets: packets.docs.map((item) => ({ id: item.id, ...item.data() })),
      };
    })),
  };
  const bytes = Buffer.from(JSON.stringify(result, (_key, value) => value instanceof Timestamp ? value.toDate().toISOString() : value, 2));
  const exportId = db.collection('users').doc(uid).collection('exports').doc().id;
  const path = `exports/${uid}/${exportId}.json`;
  await storage.bucket().file(path).save(bytes, { contentType: 'application/json', resumable: false, metadata: { cacheControl: 'private, no-store' } });
  await db.collection('users').doc(uid).collection('exports').doc(exportId).set({ path, createdAt: FieldValue.serverTimestamp(), expiresAt: Timestamp.fromMillis(Date.now() + 24 * 3600_000) });
  return { exportId, storagePath: path, expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString() };
});

export const purgeExpiredExports = onSchedule('every 60 minutes', async () => {
  const expired = await db.collectionGroup('exports').where('expiresAt', '<=', Timestamp.now()).limit(100).get();
  for (const item of expired.docs) {
    const path = item.data().path;
    if (typeof path === 'string' && /^exports\/[^/]+\/[^/]+\.json$/.test(path)) {
      await storage.bucket().file(path).delete({ ignoreNotFound: true });
    }
    await item.ref.delete();
  }
});

export const purgeDeletedAccounts = onSchedule({ schedule: 'every day 03:15', timeoutSeconds: 540, memory: '1GiB' }, async () => {
  const due = await db.collection('users').where('deletionScheduledAt', '<=', Timestamp.now()).limit(100).get();
  for (const userDoc of due.docs) {
    const uid = userDoc.id;
    const redactedId = `deleted:${hash(uid).slice(0, 12)}`;
    const evidence = await db.collectionGroup('evidence').where('uploaderId', '==', uid).get();
    for (const item of evidence.docs) {
      const data = item.data();
      await deleteStoredFiles(data.storagePath, data.manifestPath);
      await item.ref.delete();
    }

    const transactions = await db.collection('transactions').where('participantIds', 'array-contains', uid).get();
    for (const transaction of transactions.docs) {
      const data = transaction.data();
      const transactionPackets = await transaction.ref.collection('packets').get();
      for (const packet of transactionPackets.docs) {
        await deleteStoredFiles(packet.data().storagePath);
        await packet.ref.delete();
      }
      await transaction.ref.update({
        participantIds: (data.participantIds as string[]).filter((id) => id !== uid),
        confirmedBy: (data.confirmedBy as string[] | undefined ?? []).filter((id) => id !== uid),
        handoffConfirmedBy: (data.handoffConfirmedBy as string[] | undefined ?? []).filter((id) => id !== uid),
        completedBy: (data.completedBy as string[] | undefined ?? []).filter((id) => id !== uid),
        ...(data.sellerId === uid ? { sellerId: redactedId } : {}),
        ...(data.buyerId === uid ? { buyerId: redactedId } : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const [events, packets, links, tokens, oauthStates, authGrants, pendingUploads, invites, reportsByAuthor, reportsByTarget] = await Promise.all([
      db.collectionGroup('events').where('actorId', '==', uid).get(),
      db.collectionGroup('packets').where('generatedBy', '==', uid).get(),
      db.collection('providerLinks').where('uid', '==', uid).get(),
      db.collection('webDeletionTokens').where('uid', '==', uid).get(),
      db.collection('oauthStates').where('targetUid', '==', uid).get(),
      db.collection('authGrants').where('uid', '==', uid).get(),
      db.collection('pendingUploads').where('uploaderId', '==', uid).get(),
      db.collection('invites').where('sellerId', '==', uid).get(),
      db.collection('reports').where('reporterId', '==', uid).get(),
      db.collection('reports').where('targetUserId', '==', uid).get(),
    ]);
    await Promise.all(events.docs.map((doc) => doc.ref.update({ actorId: redactedId })));
    for (const packet of packets.docs) {
      await deleteStoredFiles(packet.data().storagePath);
      await packet.ref.delete();
    }
    const reports = new Map([...reportsByAuthor.docs, ...reportsByTarget.docs].map((doc) => [doc.ref.path, doc]));
    await Promise.all([...reports.values()].map((doc) => doc.ref.update({
      ...(doc.data().reporterId === uid ? { reporterId: redactedId } : {}),
      ...(doc.data().targetUserId === uid ? { targetUserId: redactedId } : {}),
    })));
    for (const pending of pendingUploads.docs) {
      await deleteStoredFiles(pending.data().storagePath);
    }
    await Promise.all([...links.docs, ...tokens.docs, ...oauthStates.docs, ...authGrants.docs, ...pendingUploads.docs, ...invites.docs].map((doc) => doc.ref.delete()));

    const [files] = await storage.bucket().getFiles({ prefix: `exports/${uid}/` });
    await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
    await db.collection('publicProfiles').doc(uid).delete();
    await db.recursiveDelete(userDoc.ref);
    try { await adminAuth.deleteUser(uid); } catch { /* already deleted */ }
  }
});
