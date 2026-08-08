import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { db, revenueCatWebhookSecret } from './config';
import { billingActions, shouldApplyBillingAction, type RevenueCatEvent } from './billing-state';

const billingEnabled = process.env.ENABLE_REVENUECAT_BILLING === 'true';

function validEventId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 8 && value.length <= 200 && !value.includes('/');
}

export const revenueCatWebhook = onRequest({ secrets: billingEnabled ? [revenueCatWebhookSecret] : [] }, async (request, response) => {
  if (!billingEnabled) { response.status(404).send('PackProof Pro billing is not enabled.'); return; }
  if (request.method !== 'POST') { response.status(405).send('Method not allowed'); return; }
  const expected = `Bearer ${revenueCatWebhookSecret.value()}`;
  if (request.get('authorization') !== expected) { response.status(401).send('Unauthorized'); return; }
  const event = request.body?.event as RevenueCatEvent | undefined;
  if (!event || !validEventId(event.id) || typeof event.type !== 'string') { response.status(400).send('Invalid event'); return; }

  let actions;
  try { actions = billingActions(event); }
  catch { response.status(400).send('Invalid event'); return; }

  const eventRef = db.collection('billingEvents').doc(event.id);
  const userRefs = actions.map((action) => db.collection('users').doc(action.uid));
  await db.runTransaction(async (tx) => {
    const [existingEvent, ...userSnapshots] = await Promise.all([tx.get(eventRef), ...userRefs.map((ref) => tx.get(ref))]);
    if (existingEvent.exists) return;

    let applied = 0;
    let ignored = 0;
    actions.forEach((action, index) => {
      const snapshot = userSnapshots[index];
      if (!snapshot.exists || !shouldApplyBillingAction(action, snapshot.data()?.billingEventTimestampMs, snapshot.data()?.billingEventPrecedence)) {
        ignored += 1;
        return;
      }
      const update: FirebaseFirestore.UpdateData<FirebaseFirestore.DocumentData> = {
        billingEventTimestampMs: action.eventTimestampMs,
        billingEventPrecedence: action.precedence,
        billingEventId: event.id!,
        billingEventType: event.type!,
        billingUpdatedAt: FieldValue.serverTimestamp(),
      };
      if (action.plan) {
        update.plan = action.plan;
        update.planExpiresAt = action.planExpiresAtMs ? Timestamp.fromMillis(action.planExpiresAtMs) : null;
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
      receivedAt: FieldValue.serverTimestamp(),
    });
  });
  response.status(200).send('ok');
});
