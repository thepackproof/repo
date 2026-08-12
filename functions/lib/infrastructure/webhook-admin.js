"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getWebhookDelivery = exports.requeueWebhookDelivery = void 0;
const https_1 = require("firebase-functions/v2/https");
const firestore_1 = require("firebase-admin/firestore");
const config_1 = require("../config");
const helpers_1 = require("../helpers");
function requireAdmin(request) {
    const uid = (0, helpers_1.requireUid)(request);
    if (request.auth?.token.packproofAdmin !== true)
        throw new https_1.HttpsError('permission-denied', 'PackProof administrator approval is required.');
    return uid;
}
exports.requeueWebhookDelivery = (0, https_1.onCall)({ enforceAppCheck: true }, async (request) => {
    const uid = requireAdmin(request);
    const deliveryId = typeof request.data?.deliveryId === 'string' ? request.data.deliveryId : null;
    if (!deliveryId)
        throw new https_1.HttpsError('invalid-argument', 'deliveryId is required.');
    const ref = config_1.db.collection('webhookDeliveries').doc(deliveryId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new https_1.HttpsError('not-found', 'Delivery not found.');
    await ref.update({ state: 'PENDING', nextAttemptAt: firestore_1.FieldValue.serverTimestamp(), lastError: null });
    await ref.collection('attempts').add({ actorId: uid, action: 'REQUEUE', createdAt: firestore_1.FieldValue.serverTimestamp() });
    return { ok: true };
});
exports.getWebhookDelivery = (0, https_1.onCall)({ enforceAppCheck: true }, async (request) => {
    requireAdmin(request);
    const deliveryId = typeof request.data?.deliveryId === 'string' ? request.data.deliveryId : null;
    if (!deliveryId)
        throw new https_1.HttpsError('invalid-argument', 'deliveryId is required.');
    const ref = config_1.db.collection('webhookDeliveries').doc(deliveryId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new https_1.HttpsError('not-found', 'Delivery not found.');
    const attemptsSnap = await ref.collection('attempts').orderBy('createdAt', 'desc').limit(20).get();
    return { data: snap.data(), attempts: attemptsSnap.docs.map((d) => d.data()) };
});
exports.default = { requeueWebhookDelivery: exports.requeueWebhookDelivery, getWebhookDelivery: exports.getWebhookDelivery };
//# sourceMappingURL=webhook-admin.js.map