export type RevenueCatEvent = {
  id?: string;
  type?: string;
  app_user_id?: string;
  entitlement_ids?: string[];
  event_timestamp_ms?: number;
  expiration_at_ms?: number | null;
  transferred_from?: string[];
  transferred_to?: string[];
};

export type BillingAction = {
  uid: string;
  plan: 'PRO' | 'FREE' | null;
  planExpiresAtMs?: number | null;
  eventTimestampMs: number;
  precedence: number;
};

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

function packProofUid(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const uid = value.trim();
  if (!uid || uid.length > 128 || uid.includes('/') || uid.startsWith('$RCAnonymousID:')) return null;
  return uid;
}

function uniqueUids(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  return Array.from(new Set(values.map(packProofUid).filter((uid): uid is string => Boolean(uid))));
}

export function billingActions(event: RevenueCatEvent, now = Date.now()): BillingAction[] {
  const eventTimestampMs = Number(event.event_timestamp_ms);
  if (!Number.isSafeInteger(eventTimestampMs) || eventTimestampMs <= 0) {
    throw new TypeError('RevenueCat event_timestamp_ms is required and must be a positive integer.');
  }
  const eventType = typeof event.type === 'string' ? event.type : '';

  if (eventType === 'TRANSFER') {
    const from = uniqueUids(event.transferred_from);
    const to = uniqueUids(event.transferred_to);
    return [
      ...from.map((uid): BillingAction => ({ uid, plan: 'FREE', planExpiresAtMs: null, eventTimestampMs, precedence: 30 })),
      ...to.map((uid): BillingAction => ({ uid, plan: 'PRO', planExpiresAtMs: null, eventTimestampMs, precedence: 20 })),
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
  if (!uid) throw new TypeError('RevenueCat app_user_id must be a PackProof user ID.');
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

export function shouldApplyBillingAction(action: BillingAction, storedTimestampMs: unknown, storedPrecedence: unknown): boolean {
  const timestamp = typeof storedTimestampMs === 'number' && Number.isFinite(storedTimestampMs) ? storedTimestampMs : -1;
  const precedence = typeof storedPrecedence === 'number' && Number.isFinite(storedPrecedence) ? storedPrecedence : -1;
  return action.eventTimestampMs > timestamp || (action.eventTimestampMs === timestamp && action.precedence > precedence);
}
