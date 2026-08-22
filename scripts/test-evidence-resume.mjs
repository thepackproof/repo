import assert from 'node:assert/strict';
import {
  evidenceProcessingForTransaction,
  evidenceProcessingFromQueue,
  evidenceProcessingFromQueueItems,
  isProcessDeathResumeState,
  queueCrashResumePolicy,
  recaptureIsRequired,
  recoverInFlightQueueState,
} from '../shared/ux/evidence-resume.ts';
import { resolveNextRequiredAction } from '../shared/ux/next-action.ts';

const transaction = {
  id: 'legacyTxResume01',
  sellerId: 'seller',
  buyerId: 'buyer',
  participantIds: ['seller', 'buyer'],
  status: 'TERMS_LOCKED',
  title: 'Resume camera',
  category: 'electronics',
  description: '',
  priceMinor: 10000,
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
  confirmedBy: ['seller', 'buyer'],
  createdAt: '2026-08-21T12:00:00.000Z',
  updatedAt: '2026-08-21T12:00:00.000Z',
  lockedAt: '2026-08-21T12:00:00.000Z',
};

function next(phase) {
  return resolveNextRequiredAction({
    transaction,
    viewerId: 'seller',
    evidenceProcessing: { phase },
  });
}

assert.equal(recoverInFlightQueueState('UPLOADING'), 'FAILED_RETRYABLE');
assert.equal(recoverInFlightQueueState('DECRYPTING_FOR_UPLOAD'), 'FAILED_RETRYABLE');
assert.equal(recoverInFlightQueueState('GRANT_REQUESTED'), 'FAILED_RETRYABLE');
assert.equal(recoverInFlightQueueState('ENCRYPTING'), 'FAILED_RETRYABLE');
assert.equal(recoverInFlightQueueState('AWAITING_FINALIZATION'), 'FAILED_RETRYABLE');
assert.equal(recoverInFlightQueueState('QUEUED'), 'QUEUED');
assert.equal(recoverInFlightQueueState('FAILED_TERMINAL'), 'FAILED_TERMINAL');
assert.equal(isProcessDeathResumeState('UPLOADING'), true);
assert.equal(isProcessDeathResumeState('QUEUED'), false);

assert.equal(evidenceProcessingFromQueue({ transactionId: 'legacyTxResume01', state: 'QUEUED' })?.phase, 'UPLOADING');
assert.equal(evidenceProcessingFromQueue({ transactionId: 'legacyTxResume01', state: 'FAILED_RETRYABLE' })?.phase, 'UPLOAD_FAILED');
assert.equal(evidenceProcessingFromQueue({
  transactionId: 'legacyTxResume01',
  state: 'FAILED_RETRYABLE',
  uploadId: 'upl_1',
})?.phase, 'FINALIZATION_FAILED');
assert.equal(evidenceProcessingFromQueue({
  transactionId: 'legacyTxResume01',
  state: 'FAILED_TERMINAL',
  lastError: 'AEADBadTagException',
})?.phase, 'FAILED_RECAPTURE');
assert.equal(evidenceProcessingFromQueue({
  transactionId: 'legacyTxResume01',
  state: 'FAILED_TERMINAL',
  lastError: 'functions/permission-denied',
})?.phase, 'UPLOAD_FAILED');
assert.equal(recaptureIsRequired('AEADBadTagException'), true);
assert.equal(recaptureIsRequired('functions/permission-denied'), false);

const chosen = evidenceProcessingFromQueueItems([
  { transactionId: 'legacyTxResume01', state: 'QUEUED' },
  { transactionId: 'legacyTxResume01', state: 'FAILED_RETRYABLE', uploadId: 'upl_1' },
]);
assert.equal(chosen?.phase, 'FINALIZATION_FAILED');
assert.equal(evidenceProcessingForTransaction('other', [
  { transactionId: 'legacyTxResume01', state: 'QUEUED' },
]), null);

for (const phase of ['ENCRYPTING', 'DECRYPTING_FOR_UPLOAD', 'UPLOADING', 'AWAITING_FINALIZATION']) {
  const policy = queueCrashResumePolicy(phase);
  assert.equal(policy.retainCiphertext, true);
  assert.equal(policy.scrubPlaintextTemp, true);
  assert.equal(policy.recapture, false);
}

const uploadFailed = next('UPLOAD_FAILED');
assert.equal(uploadFailed.primaryAction, null);
assert.equal(uploadFailed.canLeaveWhileProcessing, true);
assert.match(uploadFailed.instruction, /do not need to recapture/i);
assert.equal(uploadFailed.inboxBucket, 'NEEDS_ATTENTION');

const finalizationFailed = next('FINALIZATION_FAILED');
assert.equal(finalizationFailed.primaryAction, null);
assert.equal(finalizationFailed.canLeaveWhileProcessing, true);
assert.match(finalizationFailed.description, /reached PackProof/i);
assert.match(finalizationFailed.instruction, /do not need to recapture/i);

const recapture = next('FAILED_RECAPTURE');
assert.equal(recapture.primaryAction?.kind, 'START_PACKING');
assert.match(recapture.instruction, /record the step again/i);

const queued = next('UPLOADING');
assert.equal(queued.primaryAction, null);
assert.equal(queued.humanState, 'EVIDENCE_PROCESSING');

console.log('Evidence resume contract tests passed.');
