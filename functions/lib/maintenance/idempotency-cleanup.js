"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledCleanup = void 0;
exports.cleanupIdempotencyRecords = cleanupIdempotencyRecords;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const config_1 = require("../config");
const firestore_1 = require("firebase-admin/firestore");
async function cleanupIdempotencyRecords(retentionDays = 30, limit = 500) {
    const cutoff = firestore_1.Timestamp.fromMillis(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    const snap = await config_1.db.collection('apiIdempotencyRecords')
        .where('createdAt', '<=', cutoff)
        .where('state', 'in', ['COMPLETE', 'FAILED'])
        .limit(limit)
        .get();
    if (snap.empty)
        return 0;
    const batch = config_1.db.bulkWriter();
    let count = 0;
    snap.docs.forEach((doc) => {
        batch.delete(doc.ref);
        count += 1;
    });
    await batch.close();
    return count;
}
exports.scheduledCleanup = (0, scheduler_1.onSchedule)('every 24 hours', async () => {
    await cleanupIdempotencyRecords(30, 500);
});
exports.default = exports.scheduledCleanup;
//# sourceMappingURL=idempotency-cleanup.js.map