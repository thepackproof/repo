import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  CAPTURE_PRIMARY_ACTIONS,
  groupHomeInbox,
  resolveNextRequiredAction,
} from '../../shared/ux/next-action.ts';
import { projectTransactionWorkspace } from '../../shared/ux/workspace-projection.ts';

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

test('portal workspace projection matches the shared engine', () => {
  const next = resolveNextRequiredAction({
    transaction: transaction(),
    viewerId: 'seller',
    protocol,
    proof: { availability: 'NOT_ELIGIBLE' },
  });
  const workspace = projectTransactionWorkspace({
    transaction: transaction(),
    viewerId: 'seller',
    protocol,
    proof: { availability: 'NOT_ELIGIBLE', passportId: null, displayId: null },
    generatedAt: '2026-08-19T12:00:00.000Z',
  });
  assert.deepEqual(workspace.nextAction.primaryAction, next.primaryAction);
  assert.equal(workspace.proof.availability, 'NOT_ELIGIBLE');
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
