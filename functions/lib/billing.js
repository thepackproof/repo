"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.revenueCatWebhook = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const config_1 = require("./config");
const billing_state_1 = require("./billing-state");
const billingEnabled = process.env.ENABLE_REVENUECAT_BILLING === 'true';
function validEventId(value) {
    return typeof value === 'string' && value.length >= 8 && value.length <= 200 && !value.includes('/');
}
exports.revenueCatWebhook = (0, https_1.onRequest)({ secrets: billingEnabled ? [config_1.revenueCatWebhookSecret] : [] }, async (request, response) => {
    if (!billingEnabled) {
        response.status(404).send('PackProof Pro billing is not enabled.');
        return;
    }
    if (request.method !== 'POST') {
        response.status(405).send('Method not allowed');
        return;
    }
    const expected = `Bearer ${config_1.revenueCatWebhookSecret.value()}`;
    if (request.get('authorization') !== expected) {
        response.status(401).send('Unauthorized');
        return;
    }
    const event = request.body?.event;
    if (!event || !validEventId(event.id) || typeof event.type !== 'string') {
        response.status(400).send('Invalid event');
        return;
    }
    let actions;
    try {
        actions = (0, billing_state_1.billingActions)(event);
    }
    catch {
        response.status(400).send('Invalid event');
        return;
    }
    const eventRef = config_1.db.collection('billingEvents').doc(event.id);
    const userRefs = actions.map((action) => config_1.db.collection('users').doc(action.uid));
    await config_1.db.runTransaction(async (tx) => {
        const [existingEvent, ...userSnapshots] = await Promise.all([tx.get(eventRef), ...userRefs.map((ref) => tx.get(ref))]);
        if (existingEvent.exists)
            return;
        let applied = 0;
        let ignored = 0;
        actions.forEach((action, index) => {
            const snapshot = userSnapshots[index];
            if (!snapshot.exists || !(0, billing_state_1.shouldApplyBillingAction)(action, snapshot.data()?.billingEventTimestampMs, snapshot.data()?.billingEventPrecedence)) {
                ignored += 1;
                return;
            }
            const update = {
                billingEventTimestampMs: action.eventTimestampMs,
                billingEventPrecedence: action.precedence,
                billingEventId: event.id,
                billingEventType: event.type,
                billingUpdatedAt: firestore_1.FieldValue.serverTimestamp(),
            };
            if (action.plan) {
                update.plan = action.plan;
                update.planExpiresAt = action.planExpiresAtMs ? firestore_1.Timestamp.fromMillis(action.planExpiresAtMs) : null;
            }
            tx.update(userRefs[index], update);
            applied += 1;
        });
        tx.create(eventRef, {
            type: event.type,
            appUserId: event.app_user_id ?? null,
            eventTimestampMs: event.event_timestamp_ms,
            targetUserIds: actions.map((action) => action.uid),
            applied,
            ignored,
            receivedAt: firestore_1.FieldValue.serverTimestamp(),
        });
    });
    response.status(200).send('ok');
});
//# sourceMappingURL=billing.js.map