import assert from 'node:assert/strict';
import { humanActivitySentence } from '../src/lib/ux-activity.ts';
import {
  actionOutcomeCopy,
  buildProgressSteps,
  captureTypeForAction,
  evidenceProcessingFromProgress,
  groupByInboxBucket,
  resolveNextRequiredAction,
  viewerRole,
} from '../src/lib/ux-flow.ts';

const protocol = {
  hasPackingVideo: false,
  hasSealReference: false,
  hasArrivalPhoto: false,
  hasUnboxingVideo: false,
  sellerReferenceComplete: false,
  buyerArrivalComplete: false,
  outboundComplete: false,
};

const completeProtocol = {
  ...protocol,
  hasPackingVideo: true,
  hasSealReference: true,
  sellerReferenceComplete: true,
};

function tx(overrides) {
  return {
    id: 'tx_1',
    sellerId: 'seller',
    buyerId: 'buyer',
    participantIds: ['seller', 'buyer'],
    title: 'Vintage Camera',
    category: 'electronics',
    description: 'Mint',
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
    confirmedBy: [],
    createdAt: '2026-08-18T22:36:00.000Z',
    updatedAt: '2026-08-18T22:42:00.000Z',
    lockedAt: null,
    ...overrides,
  };
}

function resolve(status, role, extra = {}, overrides = {}) {
  const transaction = tx({ status, ...overrides });
  const viewerId = role === 'SELLER' ? 'seller' : 'buyer';
  return resolveNextRequiredAction({
    transaction,
    viewerId,
    protocol,
    otherPartyName: role === 'SELLER' ? 'Sarah' : 'Alex',
    ...extra,
  });
}

assert.equal(viewerRole(tx({ status: 'DRAFT', buyerId: null }), 'seller'), 'SELLER');

const draftSeller = resolve('DRAFT', 'SELLER', {}, { buyerId: null, participantIds: ['seller'] });
assert.equal(draftSeller.humanState, 'YOUR_ACTION_REQUIRED');
assert.equal(draftSeller.primaryAction?.kind, 'INVITE_BUYER');
assert.equal(draftSeller.inboxBucket, 'NEEDS_ATTENTION');
assert.match(draftSeller.inboxSentence, /invite the buyer/i);
assert.equal(draftSeller.inboxCta, 'Invite buyer');

const awaitingSeller = resolve('AWAITING_BUYER', 'SELLER', {}, { buyerId: null, participantIds: ['seller'] });
assert.equal(awaitingSeller.humanState, 'YOUR_ACTION_REQUIRED');
assert.equal(awaitingSeller.primaryAction?.kind, 'INVITE_BUYER');

const termsSellerWaiting = resolve('TERMS_REVIEW', 'SELLER', {}, { confirmedBy: ['seller'] });
assert.equal(termsSellerWaiting.humanState, 'WAITING_ON_BUYER');
assert.equal(termsSellerWaiting.humanStateLabel, 'WAITING ON BUYER');
assert.equal(termsSellerWaiting.headline, 'Waiting for Sarah');
assert.equal(termsSellerWaiting.description, 'Sarah needs to confirm the transaction details.');
assert.equal(termsSellerWaiting.instruction, "You don't need to do anything right now.");
assert.match(termsSellerWaiting.nextHappens, /Sarah responds/);
assert.equal(termsSellerWaiting.primaryAction, null);
assert.equal(termsSellerWaiting.secondaryAction?.kind, 'RESEND_INVITE');
assert.equal(termsSellerWaiting.secondaryAction?.label, 'Send reminder');
assert.equal(termsSellerWaiting.actionRequiredBy, 'BUYER');
assert.equal(termsSellerWaiting.waitingReason, 'BUYER_CONFIRMATION');
assert.equal(termsSellerWaiting.inboxBucket, 'WAITING');
assert.match(termsSellerWaiting.lockedExplanation ?? '', /both participants confirm/i);

const termsBuyerAction = resolve('TERMS_REVIEW', 'BUYER', {}, { confirmedBy: ['seller'] });
assert.equal(termsBuyerAction.humanState, 'YOUR_ACTION_REQUIRED');
assert.equal(termsBuyerAction.headline, 'Your turn');
assert.equal(termsBuyerAction.description, 'Review the sale details and confirm them.');
assert.equal(termsBuyerAction.primaryAction?.kind, 'CONFIRM_TERMS');
assert.equal(termsBuyerAction.primaryAction?.label, 'Review and confirm terms');
assert.equal(termsBuyerAction.notificationCopy.title, 'Your turn');
assert.equal(termsBuyerAction.inboxBucket, 'NEEDS_ATTENTION');

const termsBuyerWaiting = resolve('TERMS_REVIEW', 'BUYER', {}, { confirmedBy: ['buyer'] });
assert.equal(termsBuyerWaiting.humanState, 'WAITING_ON_SELLER');
assert.equal(termsBuyerWaiting.primaryAction, null);
assert.equal(termsBuyerWaiting.waitingReason, 'SELLER_CONFIRMATION');

const readyToPack = resolve('TERMS_LOCKED', 'SELLER', {}, { confirmedBy: ['seller', 'buyer'] });
assert.equal(readyToPack.humanState, 'READY_TO_PACK');
assert.equal(readyToPack.humanStateLabel, 'READY TO PACK');
assert.equal(readyToPack.headline, 'Ready to pack');
assert.match(readyToPack.description, /both participants confirmed/i);
assert.match(readyToPack.instruction, /packed, sealed/);
assert.equal(readyToPack.primaryAction?.kind, 'START_PACKING');
assert.equal(readyToPack.primaryAction?.label, 'Start packing evidence');
assert.equal(readyToPack.notificationCopy.title, 'Both parties confirmed — ready for packing');
assert.equal(captureTypeForAction('START_PACKING'), 'PACKING_VIDEO');
assert.equal(readyToPack.progressStage, 'PACKING');
assert.equal(readyToPack.progressSteps.find((step) => step.id === 'TERMS')?.state, 'done');
assert.equal(readyToPack.progressSteps.find((step) => step.id === 'PACKING')?.state, 'current');

const confirmOutcome = actionOutcomeCopy('CONFIRM_TERMS', readyToPack);
assert.equal(confirmOutcome.succeeded, 'Terms confirmed');
assert.match(confirmOutcome.nextStep, /you can now pack/i);

const buyerAfterLock = resolve('TERMS_LOCKED', 'BUYER', {}, { confirmedBy: ['seller', 'buyer'] });
assert.equal(buyerAfterLock.humanState, 'WAITING_ON_SELLER');
assert.match(buyerAfterLock.headline, /preparing the shipment/i);
assert.equal(buyerAfterLock.primaryAction, null);
assert.equal(buyerAfterLock.noActionRequired, true);
assert.equal(buyerAfterLock.notificationCopy.title, 'Both parties confirmed');
assert.match(buyerAfterLock.notificationCopy.body, /don't need to do anything/i);

const packedIncomplete = resolve('PACKED', 'SELLER');
assert.equal(packedIncomplete.primaryAction?.kind, 'RECORD_SEAL');
assert.match(packedIncomplete.lockedExplanation ?? '', /packing video and seal/i);
assert.equal(packedIncomplete.prerequisites.some((item) => item.label.includes('Packing video') && item.complete === false), true);

const packedReady = resolveNextRequiredAction({
  transaction: tx({ status: 'PACKED', confirmedBy: ['seller', 'buyer'] }),
  viewerId: 'seller',
  protocol: completeProtocol,
  otherPartyName: 'Sarah',
});
assert.equal(packedReady.humanState, 'READY_TO_SHIP');
assert.equal(packedReady.headline, 'You can ship the package');
assert.equal(packedReady.primaryAction?.kind, 'ADD_SHIPMENT');
assert.equal(packedReady.notificationCopy.title, 'Evidence ready');

const packedBuyer = resolveNextRequiredAction({
  transaction: tx({ status: 'PACKED' }),
  viewerId: 'buyer',
  protocol: completeProtocol,
  otherPartyName: 'Alex',
});
assert.equal(packedBuyer.noActionRequired, true);
assert.equal(packedBuyer.inboxBucket, 'WAITING');

const shippedSeller = resolve('SHIPPED', 'SELLER');
assert.equal(shippedSeller.humanState, 'IN_TRANSIT');
assert.equal(shippedSeller.primaryAction, null);
assert.equal(shippedSeller.inboxBucket, 'WAITING');

const shippedBuyer = resolve('SHIPPED', 'BUYER');
assert.equal(shippedBuyer.humanState, 'DELIVERY_REVIEW');
assert.equal(shippedBuyer.primaryAction?.kind, 'RECORD_ARRIVAL');
assert.equal(shippedBuyer.secondaryAction?.kind, 'MARK_RECEIVED');

const shippedBuyerUnbox = resolveNextRequiredAction({
  transaction: tx({ status: 'SHIPPED' }),
  viewerId: 'buyer',
  protocol: { ...protocol, hasArrivalPhoto: true },
});
assert.equal(shippedBuyerUnbox.primaryAction?.kind, 'RECORD_UNBOXING');

const reviewBuyer = resolve('BUYER_REVIEW', 'BUYER');
assert.equal(reviewBuyer.primaryAction?.kind, 'COMPLETE_TRANSACTION');
const reviewWaiting = resolve('BUYER_REVIEW', 'BUYER', {}, { completedBy: ['buyer'] });
assert.equal(reviewWaiting.inboxBucket, 'WAITING');
assert.equal(reviewWaiting.primaryAction, null);

const complete = resolve('COMPLETED', 'SELLER');
assert.equal(complete.humanState, 'COMPLETE');
assert.equal(complete.primaryAction?.kind, 'OPEN_PASSPORT');
assert.equal(complete.inboxBucket, 'COMPLETED');
assert.equal(complete.progressSteps.every((step) => step.state === 'done'), true);
assert.match(complete.instruction, /Passport is ready/);

const cancelled = resolve('CANCELLED', 'BUYER');
assert.equal(cancelled.humanState, 'CANCELLED');
assert.equal(cancelled.inboxBucket, 'COMPLETED');

const disputed = resolve('DISPUTED', 'SELLER');
assert.equal(disputed.humanState, 'CONCERN_OPEN');

const processing = resolve('TERMS_LOCKED', 'SELLER', { evidenceProcessing: { phase: 'SECURING' } }, { confirmedBy: ['seller', 'buyer'] });
assert.equal(processing.humanState, 'EVIDENCE_PROCESSING');
assert.equal(processing.headline, 'Securing your evidence');
assert.match(processing.instruction, /leave this screen/i);
assert.equal(processing.primaryAction, null);
assert.equal(processing.inboxBucket, 'IN_PROGRESS');
assert.equal(processing.canLeaveWhileProcessing, true);

const recapture = resolve('TERMS_LOCKED', 'SELLER', { evidenceProcessing: { phase: 'FAILED_RECAPTURE' } }, { confirmedBy: ['seller', 'buyer'] });
assert.match(recapture.instruction, /record the step again/i);
assert.equal(recapture.inboxBucket, 'NEEDS_ATTENTION');

const retry = resolve('PACKED', 'SELLER', { evidenceProcessing: { phase: 'FAILED_RETRY' } });
assert.match(retry.instruction, /do not need to recapture/i);

assert.equal(evidenceProcessingFromProgress(0.2, 'working'), 'UPLOADING');
assert.equal(evidenceProcessingFromProgress(0.9, 'working'), 'SECURING');
assert.equal(evidenceProcessingFromProgress(1, 'ready'), 'READY');

const localHandoff = resolve('TERMS_LOCKED', 'SELLER', {}, {
  terms: {
    saleType: 'LOCAL_HANDOFF',
    shippingResponsibility: 'NOT_APPLICABLE',
    returns: 'NO_RETURNS',
    returnWindowDays: 0,
    customTerms: '',
  },
  confirmedBy: ['seller', 'buyer'],
});
assert.equal(localHandoff.primaryAction?.kind, 'CONFIRM_HANDOFF');
assert.equal(localHandoff.progressSteps.some((step) => step.label === 'Handoff'), true);

const returnRequested = resolveNextRequiredAction({
  transaction: tx({ status: 'COMPLETED' }),
  viewerId: 'seller',
  returnPassport: {
    id: 'ret_1',
    status: 'REQUESTED',
    initiatedBy: 'buyer',
    returningParticipantId: 'buyer',
    recipientId: 'seller',
    completedBy: [],
    updatedAt: '2026-08-18T23:00:00.000Z',
  },
  otherPartyName: 'Sarah',
});
assert.equal(returnRequested.primaryAction?.kind, 'AUTHORIZE_RETURN');
assert.equal(returnRequested.inboxBucket, 'NEEDS_ATTENTION');

const statuses = ['DRAFT', 'AWAITING_BUYER', 'TERMS_REVIEW', 'PACKED', 'SHIPPED', 'BUYER_REVIEW', 'COMPLETED', 'DISPUTED', 'CANCELLED', 'ARCHIVED'];
for (const status of statuses) {
  for (const role of ['SELLER', 'BUYER']) {
    const view = resolve(status, role, {}, status === 'DRAFT' || status === 'AWAITING_BUYER' ? { buyerId: null, participantIds: ['seller'] } : {});
    assert.ok(view.headline.length > 0, `${status} ${role} missing headline`);
    assert.ok(view.instruction.length > 0, `${status} ${role} missing instruction`);
    assert.ok(view.notificationCopy.title.length > 0, `${status} ${role} missing notification`);
    if (view.noActionRequired) {
      assert.equal(view.primaryAction, null, `${status} ${role} should not show a primary action while waiting`);
    } else {
      assert.ok(view.primaryAction, `${status} ${role} should present a single action`);
    }
  }
}

for (const role of ['SELLER', 'BUYER']) {
  const view = resolve('TERMS_LOCKED', role, {}, { confirmedBy: ['seller', 'buyer'] });
  if (role === 'SELLER') assert.ok(view.primaryAction);
  else {
    assert.equal(view.primaryAction, null);
    assert.equal(view.noActionRequired, true);
  }
}

const grouped = groupByInboxBucket(
  [tx({ status: 'TERMS_REVIEW', confirmedBy: ['seller'] }), tx({ id: 'tx_2', status: 'TERMS_LOCKED', confirmedBy: ['seller', 'buyer'] }), tx({ id: 'tx_3', status: 'COMPLETED' })],
  (item) => resolveNextRequiredAction({ transaction: item, viewerId: 'seller', protocol, otherPartyName: 'Sarah' }),
);
assert.equal(grouped.WAITING.length, 1);
assert.equal(grouped.NEEDS_ATTENTION.length, 1);
assert.equal(grouped.COMPLETED.length, 1);

const shippedProgress = buildProgressSteps('SHIPPED', 'PACKING', 'TERMS_LOCKED');
assert.deepEqual(shippedProgress.map((step) => step.label), ['Created', 'Terms', 'Packing', 'Shipping', 'Delivery', 'Complete']);

const activityCtx = { viewerId: 'seller', sellerId: 'seller', buyerId: 'buyer', otherPartyName: 'Sarah' };
assert.equal(humanActivitySentence({ actorId: 'seller', type: 'TERMS_CONFIRMED', summary: 'A participant confirmed the proposed terms.' }, activityCtx), 'You confirmed the transaction details.');
assert.equal(humanActivitySentence({ actorId: 'buyer', type: 'TERMS_CONFIRMED', summary: 'A participant confirmed the proposed terms.' }, activityCtx), 'Sarah confirmed the transaction details.');
assert.equal(humanActivitySentence({ actorId: 'buyer', type: 'BUYER_JOINED', summary: 'Buyer joined' }, activityCtx), 'Sarah joined the PackProof.');
assert.equal(humanActivitySentence({ actorId: 'seller', type: 'INVITE_CREATED', summary: 'invite' }, activityCtx), 'Invitation sent.');
assert.equal(humanActivitySentence({ actorId: 'seller', type: 'EVIDENCE_FINALIZED', summary: 'packing video was server-hashed and sealed into a service-authenticated manifest.' }, activityCtx), 'Packing video recorded.');
assert.equal(humanActivitySentence({ actorId: 'seller', type: 'EVIDENCE_FINALIZED', summary: 'shipping label was server-hashed and sealed into a service-authenticated manifest.' }, activityCtx), 'Shipping label captured.');
assert.match(humanActivitySentence({ actorId: 'buyer', type: 'RECEIVED', summary: 'received' }, activityCtx), /recorded delivery/);

process.stdout.write('UX Flow v1 resolver tests passed.\n');
