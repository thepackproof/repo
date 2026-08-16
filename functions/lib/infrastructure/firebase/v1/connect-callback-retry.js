"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.listDueConnectCallbackDocs = listDueConnectCallbackDocs;
exports.processDueConnectCallbacks = processDueConnectCallbacks;
const firestore_1 = require("firebase-admin/firestore");
const connect_callback_retry_policy_1 = require("../../../application/v1/connect-callback-retry-policy");
async function listDueConnectCallbackDocs(firestore, now = new Date(), limit = connect_callback_retry_policy_1.CONNECT_CALLBACK_RETRY_BATCH_SIZE) {
    const snaps = await Promise.all(connect_callback_retry_policy_1.CONNECT_CALLBACK_RETRY_STATUSES.map((status) => (firestore.collection('webhookDeliveries')
        .where('status', '==', status)
        .where('nextAttemptAt', '<=', now)
        .orderBy('nextAttemptAt')
        .limit(limit)
        .get())));
    const docs = snaps.flatMap((snap) => snap.docs);
    docs.sort((left, right) => {
        const leftAt = left.data().nextAttemptAt?.toMillis() ?? 0;
        const rightAt = right.data().nextAttemptAt?.toMillis() ?? 0;
        return leftAt - rightAt || left.id.localeCompare(right.id);
    });
    return docs.slice(0, limit);
}
async function processDueConnectCallbacks(options) {
    const now = options.now ?? new Date();
    const selected = await listDueConnectCallbackDocs(options.firestore, now, options.limit ?? connect_callback_retry_policy_1.CONNECT_CALLBACK_RETRY_BATCH_SIZE);
    let attempted = 0;
    let delivered = 0;
    let failed = 0;
    for (const doc of selected) {
        const delivery = await options.firestore.runTransaction(async (tx) => {
            const fresh = await tx.get(doc.ref);
            const data = fresh.data();
            if (!fresh.exists || !data || !(0, connect_callback_retry_policy_1.isConnectCallbackRetryStatus)(String(data.status)))
                return null;
            const nextAttemptAt = data.nextAttemptAt;
            if (nextAttemptAt && nextAttemptAt.toMillis() > now.getTime())
                return null;
            tx.set(doc.ref, {
                status: 'PENDING',
                attempts: firestore_1.FieldValue.increment(1),
                nextAttemptAt: firestore_1.Timestamp.fromMillis(Date.now() + connect_callback_retry_policy_1.CONNECT_CALLBACK_LEASE_SECONDS * 1_000),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
            return data;
        });
        if (!delivery)
            continue;
        attempted += 1;
        try {
            await options.deliver(doc.ref, delivery);
            delivered += 1;
        }
        catch (error) {
            failed += 1;
            const attempts = Number(delivery.attempts ?? 1) + 1;
            const delaySeconds = Math.min(6 * 3600, 300 * 2 ** Math.min(attempts, 6));
            await doc.ref.set({
                status: 'FAILED',
                lastError: error instanceof Error ? error.message.slice(0, 500) : 'Unknown callback error.',
                nextAttemptAt: firestore_1.Timestamp.fromMillis(Date.now() + delaySeconds * 1_000),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
    }
    return { selected: selected.length, attempted, delivered, failed };
}
//# sourceMappingURL=connect-callback-retry.js.map