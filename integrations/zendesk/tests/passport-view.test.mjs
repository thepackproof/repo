import assert from 'node:assert/strict';
import { test } from 'node:test';
import { internalNoteBody } from '../assets/lib/comment.js';
import { APP_BOUNDARY, projectLookup, projectPassport } from '../assets/lib/passport-view.js';

const passport = {
  object: 'packproof_passport',
  identity: {
    displayId: 'PP-0123-ABCD-EFGH',
    passportId: 'ppt_' + 'b'.repeat(40),
    transactionId: 'txn_merchantorder01',
    verificationUrl: 'https://packproof.example/proof/PP-0123-ABCD-EFGH',
  },
  integrity: {
    banner: 'PACKPROOF_RECORD_WITH_LIMITATIONS',
    summary: 'PackProof record integrity verified with recorded limitations',
    meaning: 'Integrity bindings matched, with recorded limitations.',
  },
  transaction: {
    platform: { value: 'custom' },
    externalOrderId: { value: 'order-123' },
    amount: { value: { currency: 'USD', minorUnits: 129900 } },
  },
  items: [{
    expected: { title: { value: 'Vintage camera' } },
    comparisons: [{ attribute: 'TRACKING', expected: '1Z999', observed: '1Z999', result: 'SAME' }],
  }],
  fulfillment: {
    packingArtifactId: 'art_pack',
    sealArtifactId: null,
    labelArtifactId: 'art_label',
    trackingObserved: { value: '1Z999' },
  },
  evidenceInventory: [
    { category: 'PACKING_CAPTURE', state: 'AVAILABLE' },
    { category: 'DELIVERY_EVIDENCE', state: 'NOT_AVAILABLE' },
  ],
  timeline: [{ title: 'Packing captured', occurredAt: '2026-08-20T12:00:00.000Z', source: 'PACKPROOF_CAPTURE' }],
  reviewContext: {
    receivingFramework: 'VISA',
    disputeCategory: 'MERCHANDISE_NOT_RECEIVED',
    relevance: [{ category: 'PACKING_CAPTURE', inventoryState: 'AVAILABLE' }],
  },
  limitations: {
    humanReviewDisclaimer: 'These observations are preserved for authorized human review. PackProof does not determine fraud, fault, or liability.',
  },
};

test('projects Proof JSON without adding a claim disposition', () => {
  const view = projectPassport(passport);
  assert.equal(view.displayId, 'PP-0123-ABCD-EFGH');
  assert.equal(view.orderId, 'order-123');
  assert.equal(view.itemTitle, 'Vintage camera');
  assert.equal(view.amount, 'USD 1299.00');
  assert.equal(view.limited, true);
  assert.equal(view.inventory[0].present, true);
  assert.equal(view.comparisons[0].result, 'Same as recorded');
  assert.match(view.disclaimer, /does not determine fraud/);
  assert.doesNotMatch(JSON.stringify(view), /approve|deny|refund|chargeback win|fraudulent/i);
});

test('internal note keeps the human-review boundary', () => {
  const note = internalNoteBody(projectPassport(passport));
  assert.match(note, /PP-0123-ABCD-EFGH/);
  assert.match(note, /Packing capture: Available/);
  assert.match(note, /does not determine fraud/);
  assert.equal(note.includes(APP_BOUNDARY), true);
  assert.doesNotMatch(note, /should (?:refund|deny|win)/i);
});

test('pending Connect lookup does not fabricate a Proof', () => {
  const projected = projectLookup({
    type: 'connect_pending',
    candidate: { kind: 'order', value: 'order-123', source: 'manual' },
    session: { status: 'PENDING_REDEMPTION', externalOrderId: 'order-123', itemTitle: 'Camera', amount: { currency: 'USD', minorUnits: 500 } },
  });
  assert.equal(projected.status, 'pending');
  assert.equal(projected.session.amount, 'USD 5.00');
  assert.equal(projected.view, undefined);
});
