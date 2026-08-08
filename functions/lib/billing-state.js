"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.billingActions = billingActions;
exports.shouldApplyBillingAction = shouldApplyBillingAction;
const activeEventTypes = new Set([
    'INITIAL_PURCHASE',
    'RENEWAL',
    'UNCANCELLATION',
    'PRODUCT_CHANGE',
    'TEMPORARY_ENTITLEMENT_GRANT',
    'SUBSCRIPTION_EXTENDED',
    'NON_RENEWING_PURCHASE',
    'REFUND_REVERSED',
]);
const inactiveEventTypes = new Set(['EXPIRATION', 'REFUND']);
const noImmediateChangeEventTypes = new Set(['CANCELLATION', 'BILLING_ISSUE', 'SUBSCRIPTION_PAUSED']);
function packProofUid(value) {
    if (typeof value !== 'string')
        return null;
    const uid = value.trim();
    if (!uid || uid.length > 128 || uid.includes('/') || uid.startsWith('$RCAnonymousID:'))
        return null;
    return uid;
}
function uniqueUids(values) {
    if (!Array.isArray(values))
        return [];
    return Array.from(new Set(values.map(packProofUid).filter((uid) => Boolean(uid))));
}
function billingActions(event, now = Date.now()) {
    const eventTimestampMs = Number(event.event_timestamp_ms);
    if (!Number.isSafeInteger(eventTimestampMs) || eventTimestampMs <= 0) {
        throw new TypeError('RevenueCat event_timestamp_ms is required and must be a positive integer.');
    }
    const eventType = typeof event.type === 'string' ? event.type : '';
    if (eventType === 'TRANSFER') {
        const from = uniqueUids(event.transferred_from);
        const to = uniqueUids(event.transferred_to);
        return [
            ...from.map((uid) => ({ uid, plan: 'FREE', planExpiresAtMs: null, eventTimestampMs, precedence: 30 })),
            ...to.map((uid) => ({ uid, plan: 'PRO', planExpiresAtMs: null, eventTimestampMs, precedence: 20 })),
        ];
    }
    const isLifecycleEvent = activeEventTypes.has(eventType)
        || inactiveEventTypes.has(eventType)
        || noImmediateChangeEventTypes.has(eventType);
    if (!isLifecycleEvent) {
        // RevenueCat can add or forward analytics event types that do not carry a
        // PackProof Firebase UID. Acknowledge them without advancing the billing
        // cursor so an older subscription lifecycle event can still be applied.
        return [];
    }
    const uid = packProofUid(event.app_user_id);
    if (!uid)
        throw new TypeError('RevenueCat app_user_id must be a PackProof user ID.');
    const expirationAtMs = event.expiration_at_ms == null ? null : Number(event.expiration_at_ms);
    if (expirationAtMs !== null && (!Number.isSafeInteger(expirationAtMs) || expirationAtMs <= 0)) {
        throw new TypeError('RevenueCat expiration_at_ms must be null or a positive integer.');
    }
    const hasPro = Array.isArray(event.entitlement_ids) && event.entitlement_ids.includes('pro');
    if (!hasPro) {
        // A RevenueCat project can contain multiple entitlements. An event for a
        // different product must not change PackProof Pro or advance its cursor.
        return [];
    }
    if (inactiveEventTypes.has(eventType) || (eventType === 'CANCELLATION' && expirationAtMs !== null && expirationAtMs <= now)) {
        return [{ uid, plan: 'FREE', planExpiresAtMs: null, eventTimestampMs, precedence: 30 }];
    }
    if (activeEventTypes.has(eventType)) {
        if (expirationAtMs !== null && expirationAtMs <= now) {
            return [{ uid, plan: 'FREE', planExpiresAtMs: null, eventTimestampMs, precedence: 30 }];
        }
        return [{ uid, plan: 'PRO', planExpiresAtMs: expirationAtMs, eventTimestampMs, precedence: 20 }];
    }
    if (activeEventTypes.has(eventType) || noImmediateChangeEventTypes.has(eventType)) {
        return [{ uid, plan: null, eventTimestampMs, precedence: 10 }];
    }
    return [];
}
function shouldApplyBillingAction(action, storedTimestampMs, storedPrecedence) {
    const timestamp = typeof storedTimestampMs === 'number' && Number.isFinite(storedTimestampMs) ? storedTimestampMs : -1;
    const precedence = typeof storedPrecedence === 'number' && Number.isFinite(storedPrecedence) ? storedPrecedence : -1;
    return action.eventTimestampMs > timestamp || (action.eventTimestampMs === timestamp && action.precedence > precedence);
}
//# sourceMappingURL=billing-state.js.map