import assert from 'node:assert/strict';
import { billingActions, shouldApplyBillingAction } from '../functions/lib/billing-state.js';

const now = 1_786_039_200_000;
const base = { id: 'event-123456', app_user_id: 'firebase-user-1', event_timestamp_ms: now - 1_000 };

const purchase = billingActions({ ...base, type: 'INITIAL_PURCHASE', entitlement_ids: ['pro'], expiration_at_ms: now + 86_400_000 }, now)[0];
assert.deepEqual(purchase, {
  uid: 'firebase-user-1', plan: 'PRO', planExpiresAtMs: now + 86_400_000, eventTimestampMs: now - 1_000, precedence: 20,
});

const cancellation = billingActions({ ...base, type: 'CANCELLATION', entitlement_ids: ['pro'], expiration_at_ms: now + 60_000 }, now)[0];
assert.equal(cancellation.plan, null, 'a cancellation must preserve access until expiration');

const expiredCancellation = billingActions({ ...base, type: 'CANCELLATION', entitlement_ids: ['pro'], expiration_at_ms: now - 1 }, now)[0];
assert.equal(expiredCancellation.plan, 'FREE');

const expiration = billingActions({ ...base, type: 'EXPIRATION', entitlement_ids: ['pro'], expiration_at_ms: now - 1 }, now)[0];
assert.equal(expiration.plan, 'FREE');
assert.equal(shouldApplyBillingAction(expiration, expiration.eventTimestampMs - 1, 30), true);
assert.equal(shouldApplyBillingAction(purchase, purchase.eventTimestampMs + 1, 0), false, 'an older renewal must not override newer state');
assert.equal(shouldApplyBillingAction(expiration, expiration.eventTimestampMs, 20), true, 'expiration wins equal-timestamp ordering');
assert.equal(shouldApplyBillingAction(purchase, purchase.eventTimestampMs, 30), false, 'active state cannot beat equal-timestamp expiration');

const delayedRenewal = billingActions({
  ...base,
  type: 'RENEWAL',
  entitlement_ids: ['pro'],
  expiration_at_ms: now - 1,
}, now)[0];
assert.equal(delayedRenewal.plan, 'FREE', 'an already-expired renewal must not preserve stale Pro access');

assert.deepEqual(billingActions({
  ...base,
  type: 'EXPIRATION',
  entitlement_ids: ['another_product'],
  expiration_at_ms: now - 1,
}, now), [], 'another entitlement must not change PackProof Pro state or its ordering cursor');

const transfer = billingActions({
  id: 'event-transfer',
  type: 'TRANSFER',
  event_timestamp_ms: now,
  transferred_from: ['$RCAnonymousID:ignored', 'firebase-user-1'],
  transferred_to: ['firebase-user-2'],
}, now);
assert.deepEqual(transfer.map(({ uid, plan }) => ({ uid, plan })), [
  { uid: 'firebase-user-1', plan: 'FREE' },
  { uid: 'firebase-user-2', plan: 'PRO' },
]);

assert.deepEqual(billingActions({ ...base, type: 'PAYWALL_IMPRESSION' }, now), []);
assert.deepEqual(billingActions({
  id: 'event-analytics',
  type: 'PAYWALL_IMPRESSION',
  event_timestamp_ms: now,
}, now), [], 'unrelated analytics events do not require a Firebase user ID');
assert.throws(() => billingActions({ ...base, type: 'RENEWAL', event_timestamp_ms: undefined }, now), /event_timestamp_ms/);
assert.throws(() => billingActions({ ...base, type: 'RENEWAL', app_user_id: '$RCAnonymousID:not-packproof' }, now), /app_user_id/);

process.stdout.write('RevenueCat billing ordering, expiration, transfer, and validation tests passed.\n');
