import assert from 'node:assert/strict';
import {
  ABSENT_PROTOCOL,
  integrityBannerLabel,
  proofCanBeViewed,
  resolveNextRequiredAction,
} from '../shared/ux/next-action.ts';
import { WORKSPACE_PROJECTION_VERSION, projectTransactionWorkspace } from '../shared/ux/workspace-projection.ts';

const absent = { ...ABSENT_PROTOCOL };
const packingOnly = { ...absent, hasPackingVideo: true };
const packed = { ...packingOnly, hasSealReference: true, sellerReferenceComplete: true };
const shippedArrival = { ...packed, hasArrivalPhoto: true };
const complete = { ...shippedArrival, hasUnboxingVideo: true, buyerArrivalComplete: true, outboundComplete: true };

function tx(status, overrides = {}) {
  return {
    id: 'legacyTxHardening01',
    sellerId: 'seller',
    buyerId: 'buyer',
    participantIds: ['seller', 'buyer'],
    status,
    title: 'Sony A7 IV',
    category: 'electronics',
    description: '',
    priceMinor: 129900,
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
    createdAt: '2026-08-22T06:00:00.000Z',
    updatedAt: '2026-08-22T06:00:00.000Z',
    lockedAt: '2026-08-22T06:00:00.000Z',
    passportId: null,
    passportDisplayId: null,
    ...overrides,
  };
}

function project(status, role, protocol, proof, extras = {}) {
  const transaction = tx(status, extras.overrides ?? {});
  const viewerId = role === 'SELLER' ? 'seller' : 'buyer';
  const mobile = projectTransactionWorkspace({
    transaction,
    viewerId,
    protocol,
    proof,
    generatedAt: '2026-08-22T06:00:00.000Z',
    ...extras,
  });
  const portal = projectTransactionWorkspace({
    transaction,
    viewerId,
    protocol,
    proof,
    generatedAt: '2026-08-22T06:00:00.000Z',
    ...extras,
  });
  const engine = resolveNextRequiredAction({
    transaction,
    viewerId,
    protocol,
    proof: { availability: proof.availability },
    returnPassport: extras.returnPassport,
    returnProtocol: extras.returnProtocol,
  });
  assert.equal(mobile.projectionVersion, WORKSPACE_PROJECTION_VERSION);
  assert.equal(mobile.sourceTransactionRevision, transaction.updatedAt);
  assert.equal(mobile.display.title, transaction.title);
  assert.deepEqual(mobile.nextAction.primaryAction, portal.nextAction.primaryAction);
  assert.deepEqual(mobile.nextAction.primaryAction, engine.primaryAction);
  assert.equal(mobile.proof.availability, proof.availability);
  assert.equal(mobile.nextAction.passportReady, proofCanBeViewed(proof.availability));
  return mobile;
}

const fixtures = [
  ['TERMS_LOCKED', 'SELLER', absent, { availability: 'NOT_ELIGIBLE', passportId: null, displayId: null }, 'START_PACKING'],
  ['PACKED', 'SELLER', packingOnly, { availability: 'NOT_ELIGIBLE', passportId: null, displayId: null }, 'RECORD_SEAL'],
  ['PACKED', 'SELLER', packed, { availability: 'ELIGIBLE_NOT_ISSUED', passportId: null, displayId: null }, 'ADD_SHIPMENT'],
  ['SHIPPED', 'BUYER', packed, { availability: 'NOT_ELIGIBLE', passportId: null, displayId: null }, 'RECORD_ARRIVAL'],
  ['SHIPPED', 'BUYER', shippedArrival, { availability: 'NOT_ELIGIBLE', passportId: null, displayId: null }, 'RECORD_UNBOXING'],
  ['SHIPPED', 'BUYER', complete, { availability: 'AVAILABLE', passportId: 'ppt_1', displayId: 'PP-AAAA-AAAA-AAAA' }, 'COMPLETE_TRANSACTION'],
  ['COMPLETED', 'SELLER', complete, { availability: 'AVAILABLE', passportId: 'ppt_1', displayId: 'PP-AAAA-AAAA-AAAA' }, 'OPEN_PASSPORT'],
  ['COMPLETED', 'SELLER', complete, { availability: 'NOT_ELIGIBLE', passportId: null, displayId: null }, null],
];

const returnRequested = {
  id: 'rtn_1',
  status: 'REQUESTED',
  initiatedBy: 'buyer',
  returningParticipantId: 'buyer',
  recipientId: 'seller',
  completedBy: [],
  updatedAt: '2026-08-22T06:00:00.000Z',
};
const returnAuthorized = { ...returnRequested, status: 'AUTHORIZED' };
const returnPacked = { ...returnRequested, status: 'PACKED' };
const returnInTransit = { ...returnRequested, status: 'IN_TRANSIT' };
const returnReceived = { ...returnRequested, status: 'RECEIVED_REVIEW' };

assert.equal(
  project('COMPLETED', 'SELLER', complete, { availability: 'AVAILABLE', passportId: 'ppt_1', displayId: 'PP-AAAA-AAAA-AAAA' }, {
    returnPassport: returnRequested,
  }).nextAction.primaryAction?.kind,
  'AUTHORIZE_RETURN',
);
assert.equal(
  project('COMPLETED', 'BUYER', complete, { availability: 'AVAILABLE', passportId: 'ppt_1', displayId: 'PP-AAAA-AAAA-AAAA' }, {
    returnPassport: returnAuthorized,
    returnProtocol: absent,
  }).nextAction.primaryAction?.kind,
  'RECORD_RETURN_PACKING',
);
assert.equal(
  project('COMPLETED', 'BUYER', complete, { availability: 'AVAILABLE', passportId: 'ppt_1', displayId: 'PP-AAAA-AAAA-AAAA' }, {
    returnPassport: returnPacked,
    returnProtocol: absent,
  }).nextAction.primaryAction?.kind,
  'RECORD_RETURN_SEAL',
);
assert.equal(
  project('COMPLETED', 'SELLER', complete, { availability: 'AVAILABLE', passportId: 'ppt_1', displayId: 'PP-AAAA-AAAA-AAAA' }, {
    returnPassport: returnInTransit,
    returnProtocol: packed,
  }).nextAction.primaryAction?.kind ?? null,
  'RECORD_RETURN_UNBOXING',
);
assert.equal(
  project('COMPLETED', 'SELLER', complete, { availability: 'AVAILABLE', passportId: 'ppt_1', displayId: 'PP-AAAA-AAAA-AAAA' }, {
    returnPassport: returnReceived,
    returnProtocol: complete,
  }).nextAction.primaryAction?.kind,
  'COMPLETE_RETURN',
);

for (const [status, role, protocol, proof, action] of fixtures) {
  const workspace = project(status, role, protocol, proof);
  assert.equal(workspace.nextAction.primaryAction?.kind ?? null, action, `${status} ${role} ${protocol.hasPackingVideo}/${protocol.hasSealReference}`);
  if (proof.availability !== 'AVAILABLE') {
    assert.equal(workspace.nextAction.passportReady, false);
    assert.notEqual(workspace.nextAction.secondaryAction?.kind, 'OPEN_PASSPORT');
  }
}

const packedLifecycleProof = project('PACKED', 'SELLER', packed, { availability: 'NOT_ELIGIBLE', passportId: null, displayId: null });
assert.notEqual(packedLifecycleProof.nextAction.primaryAction?.kind, 'OPEN_PASSPORT');
assert.equal(packedLifecycleProof.nextAction.passportReady, false);

assert.equal(integrityBannerLabel('AUTHENTIC_PACKPROOF'), 'Authentic PackProof record');
console.log('HC-1 workspace golden fixtures passed.');
