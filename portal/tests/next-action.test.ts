import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CAPTURE_PRIMARY_ACTIONS,
  groupHomeInbox,
  resolveNextRequiredAction,
} from '../../shared/ux/next-action.ts';

const protocol = {
  hasPackingVideo: false,
  hasSealReference: false,
  hasArrivalPhoto: false,
  hasUnboxingVideo: false,
  sellerReferenceComplete: false,
  buyerArrivalComplete: false,
  outboundComplete: false,
};

function transaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'legacyTxPortal01',
    sellerId: 'seller',
    buyerId: 'buyer',
    participantIds: ['seller', 'buyer'],
    status: 'TERMS_LOCKED',
    title: 'Sony WH-1000XM6',
    category: 'electronics',
    description: '',
    priceMinor: 34900,
    currency: 'USD',
    identifiers: [],
    conditionNotes: '',
    terms: {
      saleType: 'SHIPPED',
      shippingResponsibility: 'SELLER',
      returns: 'AS_AGREED',
      returnWindowDays: 14,
      customTerms: '',
    },
    confirmedBy: ['seller', 'buyer'],
    createdAt: '2026-08-19T12:00:00.000Z',
    updatedAt: '2026-08-19T12:00:00.000Z',
    lockedAt: null,
    ...overrides,
  };
}

test('portal and mobile share the Next Action Engine for packing', () => {
  const next = resolveNextRequiredAction({
    transaction: transaction(),
    viewerId: 'seller',
    protocol,
  });
  assert.equal(next.humanState, 'READY_TO_PACK');
  assert.equal(next.primaryAction?.kind, 'START_PACKING');
  assert.equal(CAPTURE_PRIMARY_ACTIONS.has(next.primaryAction?.kind ?? 'EDIT_TERMS'), true);
});

test('home groups records that need the viewer', () => {
  const grouped = groupHomeInbox([transaction()], (item) => resolveNextRequiredAction({
    transaction: item,
    viewerId: 'seller',
    protocol,
  }));
  assert.equal(grouped.needsAttention.length, 1);
  assert.equal(grouped.waiting.length, 0);
});

test('View Proof is shown only when the backend says the Proof is retrievable', () => {
  const packed = resolveNextRequiredAction({
    transaction: transaction({ status: 'PACKED' }),
    viewerId: 'seller',
    protocol,
  });
  assert.equal(packed.proofReady, false);
  assert.equal(packed.passportReady, false);
  assert.notEqual(packed.primaryAction?.kind, 'OPEN_PASSPORT');

  const ready = resolveNextRequiredAction({
    transaction: transaction({ status: 'PACKED' }),
    viewerId: 'seller',
    protocol,
    proofReady: true,
  });
  assert.equal(ready.proofReady, true);
  assert.equal(ready.passportReady, true);
  assert.equal(ready.secondaryAction?.kind, 'OPEN_PASSPORT');
});
