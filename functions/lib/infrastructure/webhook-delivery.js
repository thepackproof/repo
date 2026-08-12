"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scheduledWebhookDelivery = void 0;
exports.processPendingWebhooks = processPendingWebhooks;
const node_crypto_1 = require("node:crypto");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const config_1 = require("../config");
async function computeHmac(secret, payload) {
    return (0, node_crypto_1.createHmac)('sha256', secret).update(payload).digest('base64url');
}
async function processPendingWebhooks(limit = 10) {
    const now = new Date();
    const snap = await config_1.db.collection('webhookDeliveries')
        .where('state', '==', 'PENDING')
        .where('nextAttemptAt', '<=', now)
        .orderBy('nextAttemptAt')
        .limit(limit)
        .get();
    for (const doc of snap.docs) {
        const data = doc.data();
        const payload = data.payload ?? '';
        const target = data.targetUrl;
        const attempt = (data.attemptCount ?? 0) + 1;
        const attemptsRef = doc.ref.collection('attempts');
        const attemptDocRef = await attemptsRef.add({ attempt, startedAt: new Date(), status: 'IN_PROGRESS' });
        try {
            const hmacSecret = config_1.webhookSigningSecret.value();
            const signature = payload && hmacSecret ? await computeHmac(hmacSecret, payload) : null;
            const headers = { 'Content-Type': 'application/json' };
            if (signature)
                headers['PackProof-Signature'] = `sha256=${signature}`;
            if (data.headers)
                Object.assign(headers, data.headers);
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
        }
        catch (err) {
            const message = err && err.message ? String(err.message) : String(err);
            const backoffMs = 60_000 * Math.min(attempt, 60);
            try {
                await attemptDocRef.update({ status: 'FAILED', error: message.slice(0, 1024), finishedAt: new Date() });
            }
            catch { /* best effort */ }
            try {
                await doc.ref.update({ attemptCount: attempt, lastError: message.slice(0, 1024), nextAttemptAt: new Date(Date.now() + backoffMs) });
            }
            catch { /* best effort */ }
            if (attempt >= 5) {
                try {
                    await doc.ref.update({ state: 'POISON' });
                }
                catch { /* best effort */ }
            }
        }
    }
}
exports.scheduledWebhookDelivery = (0, scheduler_1.onSchedule)('every 1 minutes', async () => {
    await processPendingWebhooks(20);
});
exports.default = exports.scheduledWebhookDelivery;
//# sourceMappingURL=webhook-delivery.js.map