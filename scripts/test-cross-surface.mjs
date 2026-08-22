import assert from 'node:assert/strict';
import { CAPTURE_PRIMARY_ACTIONS, groupHomeInbox, resolveNextRequiredAction } from '../shared/ux/next-action.ts';
import { evidenceProcessingForTransaction } from '../shared/ux/evidence-resume.ts';
import { toPortalTransactionLike, toUxTransaction } from '../shared/ux/cross-surface.ts';

function crossSurfaceSnapshot(next) {
  const kind = next.primaryAction?.kind ?? null;
  return {
    humanState: next.humanState,
    primaryActionKind: kind,
    inboxBucket: next.inboxBucket,
    passportReady: next.passportReady,
    canLeaveWhileProcessing: next.canLeaveWhileProcessing,
    captureOnPhone: Boolean(kind && CAPTURE_PRIMARY_ACTIONS.has(kind)),
    recaptureOffered: /record the step again/i.test(next.instruction),
  };
}

function resolveAndroidSurface(input) {
  return resolveNextRequiredAction(input);
}

function resolvePortalSurface(input) {
  return resolveNextRequiredAction({
    transaction: toUxTransaction(toPortalTransactionLike(input.transaction)),
    viewerId: input.viewerId,
    protocol: input.protocol ?? null,
    evidenceProcessing: input.evidenceProcessing ?? null,
  });
}

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
    id: 'legacyTxTorture01',
    sellerId: 'seller-android',
    buyerId: 'buyer-android',
    participantIds: ['seller-android', 'buyer-android'],
    status: 'TERMS_LOCKED',
    title: 'Torture-kit lens',
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
    createdAt: '2026-08-21T12:00:00.000Z',
    updatedAt: '2026-08-21T12:00:00.000Z',
    lockedAt: '2026-08-21T12:00:00.000Z',
    ...overrides,
  };
}

function surfaces(input) {
  const tx = transaction(input.transaction ?? {});
  const protocol = input.protocol ?? emptyProtocol;
  const sellerProcessing = input.sellerProcessing ?? null;
  const shared = { transaction: tx, protocol };
  const sellerAndroid = resolveAndroidSurface({
    ...shared,
    viewerId: 'seller-android',
    evidenceProcessing: sellerProcessing,
  });
  const buyerAndroid = resolveAndroidSurface({
    ...shared,
    viewerId: 'buyer-android',
    evidenceProcessing: null,
  });
  const portalSeller = resolvePortalSurface({
    ...shared,
    viewerId: 'seller-android',
    evidenceProcessing: input.portalSeesDeviceQueue ? sellerProcessing : null,
  });
  const portalBuyer = resolvePortalSurface({
    ...shared,
    viewerId: 'buyer-android',
  });
  return {
    tx,
    sellerAndroid: crossSurfaceSnapshot(sellerAndroid),
    buyerAndroid: crossSurfaceSnapshot(buyerAndroid),
    portalSeller: crossSurfaceSnapshot(portalSeller),
    portalBuyer: crossSurfaceSnapshot(portalBuyer),
    sellerNext: sellerAndroid,
    buyerNext: buyerAndroid,
  };
}

const fixtures = [
  {
    id: 'E2E-03',
    title: 'Terms locked: seller packs, buyer waits',
    input: {},
    expect: {
      sellerAndroid: { primaryActionKind: 'START_PACKING', inboxBucket: 'NEEDS_ATTENTION', recaptureOffered: false },
      buyerAndroid: { primaryActionKind: null, inboxBucket: 'WAITING' },
      agree: ['seller', 'buyer'],
    },
  },
  {
    id: 'E2E-04',
    title: 'Packed after packing video: seller photographs seal, buyer waits',
    input: {
      transaction: { status: 'PACKED' },
      protocol: { ...emptyProtocol, hasPackingVideo: true },
    },
    expect: {
      sellerAndroid: { primaryActionKind: 'RECORD_SEAL', captureOnPhone: true },
      buyerAndroid: { primaryActionKind: null, inboxBucket: 'WAITING' },
      agree: ['seller', 'buyer'],
    },
  },
  {
    id: 'E2E-06',
    title: 'Packed with seal complete: seller ships, buyer waits',
    input: {
      transaction: { status: 'PACKED' },
      protocol: { ...emptyProtocol, hasPackingVideo: true, hasSealReference: true, sellerReferenceComplete: true },
    },
    expect: {
      sellerAndroid: { primaryActionKind: 'ADD_SHIPMENT' },
      buyerAndroid: { primaryActionKind: null, inboxBucket: 'WAITING' },
      agree: ['seller', 'buyer'],
    },
  },
  {
    id: 'E2E-07',
    title: 'Shipped: buyer records arrival, seller waits',
    input: { transaction: { status: 'SHIPPED' } },
    expect: {
      sellerAndroid: { primaryActionKind: null, inboxBucket: 'WAITING' },
      buyerAndroid: { primaryActionKind: 'RECORD_ARRIVAL', captureOnPhone: true },
      agree: ['seller', 'buyer'],
    },
  },
  {
    id: 'Q-05',
    title: 'Seller upload failed: Android retries ciphertext, portal still shows packing',
    input: { sellerProcessing: { phase: 'UPLOAD_FAILED' } },
    expect: {
      sellerAndroid: { primaryActionKind: null, recaptureOffered: false, canLeaveWhileProcessing: true },
      buyerAndroid: { primaryActionKind: null, inboxBucket: 'WAITING' },
      portalSeller: { primaryActionKind: 'START_PACKING', captureOnPhone: true },
      agree: ['buyer'],
    },
  },
  {
    id: 'Q-06',
    title: 'Seller finalization pending after process death: no recapture',
    input: { sellerProcessing: { phase: 'FINALIZATION_FAILED' } },
    expect: {
      sellerAndroid: { primaryActionKind: null, recaptureOffered: false, canLeaveWhileProcessing: true },
      buyerAndroid: { primaryActionKind: null },
      agree: ['buyer'],
    },
  },
  {
    id: 'Q-08',
    title: 'Unreadable ciphertext is the only recapture case',
    input: { sellerProcessing: { phase: 'FAILED_RECAPTURE' } },
    expect: {
      sellerAndroid: { primaryActionKind: 'START_PACKING', recaptureOffered: true },
      buyerAndroid: { recaptureOffered: false },
      agree: ['buyer'],
    },
  },
  {
    id: 'E2E-01',
    title: 'Draft seller invites; buyer is not on the record yet',
    input: {
      transaction: {
        status: 'DRAFT',
        buyerId: null,
        participantIds: ['seller-android'],
        confirmedBy: [],
        lockedAt: null,
      },
    },
    expect: {
      sellerAndroid: { primaryActionKind: 'INVITE_BUYER', inboxBucket: 'NEEDS_ATTENTION' },
      agree: ['seller'],
    },
  },
];

for (const fixture of fixtures) {
  const result = surfaces(fixture.input);
  for (const [surface, expected] of Object.entries(fixture.expect).filter(([key]) => key !== 'agree')) {
    const actual = result[surface];
    assert.ok(actual, `${fixture.id} missing ${surface}`);
    for (const [key, value] of Object.entries(expected)) {
      assert.equal(actual[key], value, `${fixture.id} ${surface}.${key}`);
    }
  }
  if (fixture.expect.agree?.includes('seller')) {
    assert.deepEqual(result.sellerAndroid, result.portalSeller, `${fixture.id} seller Android !== portal`);
  }
  if (fixture.expect.agree?.includes('buyer')) {
    assert.deepEqual(result.buyerAndroid, result.portalBuyer, `${fixture.id} buyer Android !== portal`);
  }
}

const packing = surfaces({});
assert.equal(packing.sellerAndroid.captureOnPhone, true);
assert.equal(packing.buyerAndroid.captureOnPhone, false);
assert.notEqual(packing.sellerAndroid.primaryActionKind, packing.buyerAndroid.primaryActionKind);

const queued = evidenceProcessingForTransaction('legacyTxTorture01', [
  { transactionId: 'legacyTxTorture01', state: 'FAILED_RETRYABLE' },
  { transactionId: 'other', state: 'FAILED_TERMINAL', lastError: 'AEADBadTagException' },
]);
assert.equal(queued?.phase, 'UPLOAD_FAILED');
const otherDevice = evidenceProcessingForTransaction('buyer-tx', [
  { transactionId: 'legacyTxTorture01', state: 'FAILED_RETRYABLE' },
]);
assert.equal(otherDevice, null);

const home = groupHomeInbox(
  [transaction(), transaction({ id: 'buyer-view' })],
  (item) => resolveAndroidSurface({
    transaction: item,
    viewerId: item.id === 'buyer-view' ? 'buyer-android' : 'seller-android',
    protocol: emptyProtocol,
  }),
);
assert.equal(home.needsAttention.length, 1);
assert.equal(home.waiting.length, 1);

assert.equal(CAPTURE_PRIMARY_ACTIONS.has('START_PACKING'), true);
assert.equal(CAPTURE_PRIMARY_ACTIONS.has('ADD_SHIPMENT'), false);

console.log(`Cross-surface torture contract passed (${fixtures.length} fixtures).`);
