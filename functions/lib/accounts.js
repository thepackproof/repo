"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.purgeDeletedAccounts = exports.purgeExpiredExports = exports.exportAccountData = exports.cancelAccountDeletion = exports.requestAccountDeletion = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const config_1 = require("./config");
const helpers_1 = require("./helpers");
async function deleteStoredFiles(...paths) {
    const uniquePaths = Array.from(new Set(paths.filter((path) => typeof path === 'string' && path.length > 0)));
    await Promise.all(uniquePaths.map((path) => config_1.storage.bucket().file(path).delete({ ignoreNotFound: true })));
}
exports.requestAccountDeletion = (0, https_1.onCall)({ enforceAppCheck: true }, async (request) => {
    const uid = (0, helpers_1.requireRecentSignIn)(request);
    const confirmation = String(request.data?.confirmation ?? '');
    if (confirmation !== 'DELETE')
        throw new https_1.HttpsError('invalid-argument', 'Type DELETE to confirm account deletion.');
    const scheduledAt = firestore_1.Timestamp.fromMillis(Date.now() + 7 * 86400_000);
    await config_1.db.collection('users').doc(uid).set({ deletionRequestedAt: firestore_1.FieldValue.serverTimestamp(), deletionScheduledAt: scheduledAt }, { merge: true });
    return { scheduledAt: scheduledAt.toDate().toISOString() };
});
exports.cancelAccountDeletion = (0, https_1.onCall)({ enforceAppCheck: true }, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    await config_1.db.collection('users').doc(uid).set({ deletionRequestedAt: firestore_1.FieldValue.delete(), deletionScheduledAt: firestore_1.FieldValue.delete() }, { merge: true });
    return { success: true };
});
exports.exportAccountData = (0, https_1.onCall)({ enforceAppCheck: true, timeoutSeconds: 120 }, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    const [profile, transactions] = await Promise.all([
        config_1.db.collection('users').doc(uid).get(),
        config_1.db.collection('transactions').where('participantIds', 'array-contains', uid).get(),
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
    const bytes = Buffer.from(JSON.stringify(result, (_key, value) => value instanceof firestore_1.Timestamp ? value.toDate().toISOString() : value, 2));
    const exportId = config_1.db.collection('users').doc(uid).collection('exports').doc().id;
    const path = `exports/${uid}/${exportId}.json`;
    await config_1.storage.bucket().file(path).save(bytes, { contentType: 'application/json', resumable: false, metadata: { cacheControl: 'private, no-store' } });
    await config_1.db.collection('users').doc(uid).collection('exports').doc(exportId).set({ path, createdAt: firestore_1.FieldValue.serverTimestamp(), expiresAt: firestore_1.Timestamp.fromMillis(Date.now() + 24 * 3600_000) });
    return { exportId, storagePath: path, expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString() };
});
exports.purgeExpiredExports = (0, scheduler_1.onSchedule)('every 60 minutes', async () => {
    const expired = await config_1.db.collectionGroup('exports').where('expiresAt', '<=', firestore_1.Timestamp.now()).limit(100).get();
    for (const item of expired.docs) {
        const path = item.data().path;
        if (typeof path === 'string' && /^exports\/[^/]+\/[^/]+\.json$/.test(path)) {
            await config_1.storage.bucket().file(path).delete({ ignoreNotFound: true });
        }
        await item.ref.delete();
    }
});
exports.purgeDeletedAccounts = (0, scheduler_1.onSchedule)({ schedule: 'every day 03:15', timeoutSeconds: 540, memory: '1GiB' }, async () => {
    const due = await config_1.db.collection('users').where('deletionScheduledAt', '<=', firestore_1.Timestamp.now()).limit(100).get();
    for (const userDoc of due.docs) {
        const uid = userDoc.id;
        const redactedId = `deleted:${(0, helpers_1.hash)(uid).slice(0, 12)}`;
        const evidence = await config_1.db.collectionGroup('evidence').where('uploaderId', '==', uid).get();
        for (const item of evidence.docs) {
            const data = item.data();
            await deleteStoredFiles(data.storagePath, data.manifestPath);
            await item.ref.delete();
        }
        const transactions = await config_1.db.collection('transactions').where('participantIds', 'array-contains', uid).get();
        for (const transaction of transactions.docs) {
            const data = transaction.data();
            const transactionPackets = await transaction.ref.collection('packets').get();
            for (const packet of transactionPackets.docs) {
                await deleteStoredFiles(packet.data().storagePath);
                await packet.ref.delete();
            }
            await transaction.ref.update({
                participantIds: data.participantIds.filter((id) => id !== uid),
                confirmedBy: (data.confirmedBy ?? []).filter((id) => id !== uid),
                handoffConfirmedBy: (data.handoffConfirmedBy ?? []).filter((id) => id !== uid),
                completedBy: (data.completedBy ?? []).filter((id) => id !== uid),
                ...(data.sellerId === uid ? { sellerId: redactedId } : {}),
                ...(data.buyerId === uid ? { buyerId: redactedId } : {}),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            });
        }
        const [events, packets, links, tokens, oauthStates, authGrants, pendingUploads, invites, reportsByAuthor, reportsByTarget] = await Promise.all([
            config_1.db.collectionGroup('events').where('actorId', '==', uid).get(),
            config_1.db.collectionGroup('packets').where('generatedBy', '==', uid).get(),
            config_1.db.collection('providerLinks').where('uid', '==', uid).get(),
            config_1.db.collection('webDeletionTokens').where('uid', '==', uid).get(),
            config_1.db.collection('oauthStates').where('targetUid', '==', uid).get(),
            config_1.db.collection('authGrants').where('uid', '==', uid).get(),
            config_1.db.collection('pendingUploads').where('uploaderId', '==', uid).get(),
            config_1.db.collection('invites').where('sellerId', '==', uid).get(),
            config_1.db.collection('reports').where('reporterId', '==', uid).get(),
            config_1.db.collection('reports').where('targetUserId', '==', uid).get(),
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
        const [files] = await config_1.storage.bucket().getFiles({ prefix: `exports/${uid}/` });
        await Promise.all(files.map((file) => file.delete({ ignoreNotFound: true })));
        await config_1.db.collection('publicProfiles').doc(uid).delete();
        await config_1.db.recursiveDelete(userDoc.ref);
        try {
            await config_1.adminAuth.deleteUser(uid);
        }
        catch { /* already deleted */ }
    }
});
//# sourceMappingURL=accounts.js.map