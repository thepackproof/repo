import assert from 'node:assert/strict';
import {
  PORTAL_HANDOFF_TTL_MS,
  hrefForPrimaryAction,
  portalHandoffFromOpenParams,
  portalHandoffIsExpired,
  resolvePortalHandoff,
} from '../src/lib/ux-flow.ts';

const emptyProtocol = {
  hasPackingVideo: false,
  hasSealReference: false,
  hasArrivalPhoto: false,
  hasUnboxingVideo: false,
  sellerReferenceComplete: false,
  buyerArrivalComplete: false,
  outboundComplete: false,
};

function transaction(overrides = {}) {
  return {
    id: 'legacyTxHandoff01',
    sellerId: 'seller-android',
    buyerId: 'buyer-android',
    participantIds: ['seller-android', 'buyer-android'],
    status: 'TERMS_LOCKED',
    title: 'Handoff lens',
    category: 'electronics',
    description: '',
    priceMinor: 24900,
    currency: 'USD',
    identifiers: [],
    conditionNotes: '',
    terms: {
      saleType: 'SHIPPED',
      shippingResponsibility: 'SELLER',
      returns: 'NO_RETURNS',
      returnWindowDays: 0,
      customTerms: '',
    },
    confirmedBy: ['seller-android', 'buyer-android'],
    createdAt: '2026-08-21T16:00:00.000Z',
    updatedAt: '2026-08-21T16:00:00.000Z',
    lockedAt: '2026-08-21T16:00:00.000Z',
    ...overrides,
  };
}

function mintedHandoff(overrides = {}) {
  return {
    version: 1,
    transactionId: 'legacyTxHandoff01',
    requestedAction: 'START_PACKING',
    issuedAt: '2026-08-21T16:00:00.000Z',
    expiresAt: '2026-08-21T16:15:00.000Z',
    ...overrides,
  };
}

test('legacy action query is only a hint; packing then seal after five minutes', () => {
  const fromQr = portalHandoffFromOpenParams({
    transaction: 'legacyTxHandoff01',
    action: 'pack',
    issuedAt: '2026-08-21T16:00:00.000Z',
    expiresAt: '2026-08-21T16:15:00.000Z',
  });
  assert.deepEqual(fromQr, mintedHandoff());

  const atMint = resolvePortalHandoff({
    handoff: fromQr,
    transaction: transaction(),
    viewerId: 'seller-android',
    protocol: emptyProtocol,
    now: '2026-08-21T16:01:00.000Z',
  });
  assert.equal(atMint.action, 'START_PACKING');
  assert.equal(atMint.requestedActionIgnored, false);
  assert.equal(atMint.expired, false);
  assert.equal(atMint.captureOnPhone, true);
  assert.equal(hrefForPrimaryAction(atMint.action, fromQr.transactionId).pathname, '/pack/[id]');

  const fiveMinutesLater = resolvePortalHandoff({
    handoff: fromQr,
    transaction: transaction({
      status: 'PACKED',
      updatedAt: '2026-08-21T16:05:00.000Z',
    }),
    viewerId: 'seller-android',
    protocol: {
      ...emptyProtocol,
      hasPackingVideo: true,
      sellerReferenceComplete: false,
    },
    now: '2026-08-21T16:05:00.000Z',
  });
  assert.equal(fiveMinutesLater.action, 'RECORD_SEAL');
  assert.equal(fiveMinutesLater.requestedActionIgnored, true);
  assert.equal(fiveMinutesLater.expired, false);
  assert.equal(fiveMinutesLater.captureOnPhone, true);
  assert.deepEqual(hrefForPrimaryAction(fiveMinutesLater.action, fromQr.transactionId), {
    pathname: '/pack/[id]',
    params: { id: 'legacyTxHandoff01', beat: 'label' },
  });
});

test('expired hint still opens current state and never executes a stale buyer/seller CTA', () => {
  const expired = mintedHandoff({ expiresAt: '2026-08-21T16:15:00.000Z' });
  assert.equal(portalHandoffIsExpired(expired, '2026-08-21T16:16:00.000Z'), true);
  assert.equal(PORTAL_HANDOFF_TTL_MS, 15 * 60 * 1000);

  const sellerWaiting = resolvePortalHandoff({
    handoff: expired,
    transaction: transaction({ status: 'SHIPPED' }),
    viewerId: 'seller-android',
    protocol: {
      ...emptyProtocol,
      hasPackingVideo: true,
      hasSealReference: true,
      sellerReferenceComplete: true,
    },
    now: '2026-08-21T16:20:00.000Z',
  });
  // Seller shipped: engine is IN_TRANSIT / no capture. Do not open packing camera.
  assert.equal(sellerWaiting.captureOnPhone, false);
  assert.equal(sellerWaiting.requestedActionIgnored, true);
  assert.equal(hrefForPrimaryAction(sellerWaiting.action ?? undefined, expired.transactionId).pathname, '/task/[id]');

  const buyerArrival = resolvePortalHandoff({
    handoff: expired,
    transaction: transaction({ status: 'SHIPPED' }),
    viewerId: 'buyer-android',
    protocol: emptyProtocol,
    now: '2026-08-21T16:20:00.000Z',
  });
  assert.equal(buyerArrival.action, 'RECORD_ARRIVAL');
  assert.equal(buyerArrival.requestedActionIgnored, true);
  assert.equal(buyerArrival.captureOnPhone, true);

  const missing = portalHandoffFromOpenParams({ action: 'pack' });
  assert.equal(missing, null);
});

function test(name, fn) {
  fn();
  console.log(`ok ${name}`);
}

console.log('Portal native handoff contract passed');
