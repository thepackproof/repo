import assert from 'node:assert/strict';
import {
  canTransitionCaptureStage,
  canTransitionPhysicalCaptureStage,
  canDiscardReviewedCapture,
  canDiscardPhysicalSeries,
  captureForegroundInterruption,
  physicalSeriesIsComplete,
  shouldDeleteLocalCaptureOnUnmount,
  shouldDeletePhysicalFramesOnUnmount,
  shouldDeletePhysicalOriginalsAfterSeriesCommit,
  shouldDeletePhysicalSourceAfterEachEncrypt,
} from '../src/lib/capture-workflow.ts';
import { captureGuideFor, captureChecklists, capturePreflightFor, captureReviewChecklist, captureTitles, consumerCameraPrompt, formatCaptureBytes, formatCaptureDuration, packingCoachingLine, videoTypes } from '../src/lib/capture-guides.ts';
import { canonicalShippingObservationV1, identifyTrackingNumber } from '../src/lib/shipping-tracker.ts';
import { createHash } from 'node:crypto';
import {
  canDiscardQueuedEvidence,
  isStaleQueueTempFileName,
  queueCrashRecovery,
  queueTempNamesForItem,
  shouldDeleteOriginalAfterEncryption,
} from '../src/lib/queue-temp-lifecycle.ts';

assert.equal(canTransitionCaptureStage('CHECKLIST', 'CAMERA'), true);
assert.equal(canTransitionCaptureStage('CAMERA', 'REVIEW'), true);
assert.equal(canTransitionCaptureStage('REVIEW', 'UPLOADING'), true);
assert.equal(canTransitionCaptureStage('UPLOADING', 'REVIEW'), true);
assert.equal(canTransitionCaptureStage('UPLOADING', 'CAMERA'), false);
assert.equal(canDiscardReviewedCapture('REVIEW', false), true);
assert.equal(canDiscardReviewedCapture('REVIEW', true), false);
assert.equal(canDiscardReviewedCapture('UPLOADING', false), false);
assert.equal(shouldDeleteLocalCaptureOnUnmount(false, true), true);
assert.equal(shouldDeleteLocalCaptureOnUnmount(true, true), false);
assert.equal(canTransitionPhysicalCaptureStage('INTRO', 'CAMERA'), true);
assert.equal(canTransitionPhysicalCaptureStage('CAMERA', 'REVIEW'), true);
assert.equal(canTransitionPhysicalCaptureStage('REVIEW', 'SECURING'), true);
assert.equal(canTransitionPhysicalCaptureStage('SECURING', 'CAMERA'), false);
assert.equal(canDiscardPhysicalSeries('REVIEW', false), true);
assert.equal(canDiscardPhysicalSeries('SECURING', true), false);
assert.equal(physicalSeriesIsComplete(15, 15), true);
assert.equal(physicalSeriesIsComplete(14, 15), false);
assert.equal(shouldDeletePhysicalFramesOnUnmount(false, 3), true);
assert.equal(shouldDeletePhysicalFramesOnUnmount(true, 15), false);
assert.equal(shouldDeletePhysicalSourceAfterEachEncrypt(), false);
assert.equal(shouldDeletePhysicalOriginalsAfterSeriesCommit(false), false);
assert.equal(shouldDeletePhysicalOriginalsAfterSeriesCommit(true), true);

const recordingStop = captureForegroundInterruption(true);
assert.equal(recordingStop.stopRecording, true);
assert.match(recordingStop.message, /left the foreground/);
assert.equal(captureForegroundInterruption(false).stopRecording, false);

assert.match(captureTitles.PACKING_VIDEO, /packing/i);
assert.equal(videoTypes.has('PACKING_VIDEO'), true);
assert.match(captureGuideFor('PACKING_VIDEO', true).instruction, /item and box/);
assert.match(consumerCameraPrompt('PACKING_VIDEO', { recordingSeconds: 0 }), /Show the item/);
assert.equal(packingCoachingLine(40), 'Draw a line across the label and the box');
assert.match(consumerCameraPrompt('SHIPPING_LABEL', { barcodeCaptured: true }), /Got it/);
assert.match(captureChecklists.PACKING_VIDEO.join(' '), /paid postage is not required/i);
assert.match(captureChecklists.PACKING_VIDEO.join(' '), /Scanning the tracking barcode is optional/);
assert.match(captureChecklists.RETURN_PACKING_VIDEO.join(' '), /paid postage is not required/i);
assert.equal(capturePreflightFor('PACKING_VIDEO').startLabel, "I'm ready");
assert.match(capturePreflightFor('PACKING_VIDEO').title, /packing process/);
assert.deepEqual(capturePreflightFor('PACKING_VIDEO').expectations, [
  'Show the item',
  'Place and seal it in the package',
  'Capture the shipping label or barcode',
]);
assert.equal(captureReviewChecklist('PACKING_VIDEO', { videoRecorded: true, barcodeCaptured: true }).every((item) => item.done), true);
assert.equal(formatCaptureDuration(75), '01:15');
assert.equal(formatCaptureBytes(2048), '2 KB');

const ups = identifyTrackingNumber('1Z 999 AA1 01 2345 6784', '1Z999AA10123456784');
assert.equal(ups.identified, true);
assert.equal(ups.checksumValid, true);
assert.equal(ups.courierCode, 'ups');
assert.equal(ups.lookupStatus, 'DATASET_VALIDATED');
assert.match(ups.publicTrackingUrl ?? '', /ups\.com/);
const usps = identifyTrackingNumber('9400111202555842332669', '9400111202555842332669');
assert.equal(usps.courierCode, 'usps');
assert.equal(identifyTrackingNumber('NOTAREALTRACKINGNUMBER123', 'NOTAREALTRACKINGNUMBER123').lookupStatus, 'UNRECOGNIZED');
const canonical = canonicalShippingObservationV1({
  trackingNumber: '1Z999AA10123456784',
  rawDecodedValue: '1Z 999 AA1 01 2345 6784',
  symbology: 'code128',
  courierCode: 'ups',
  trackerName: 'UPS',
  checksumValid: true,
  publicTrackingUrl: ups.publicTrackingUrl,
  stillSha256: 'a'.repeat(64),
});
assert.match(canonical, /^PACKPROOF_SHIPPING_OBSERVATION_V1\n/);
assert.equal(createHash('sha256').update(canonical, 'utf8').digest('hex').length, 64);

assert.equal(isStaleQueueTempFileName('qe_abc.upload'), true);
assert.equal(isStaleQueueTempFileName('qe_abc.read.json'), true);
assert.equal(isStaleQueueTempFileName('qe_abc.json'), true);
assert.equal(isStaleQueueTempFileName('qe_abc.media.ppq'), false);
assert.deepEqual(queueTempNamesForItem('qe_1'), {
  metadataWrite: 'qe_1.json',
  metadataRead: 'qe_1.read.json',
  upload: 'qe_1.upload',
});
assert.equal(shouldDeleteOriginalAfterEncryption('file:///cache/capture.mp4', 'file:///docs/packproof-secure-queue/'), true);
assert.equal(shouldDeleteOriginalAfterEncryption('file:///docs/packproof-secure-queue/qe_1.media.ppq', 'file:///docs/packproof-secure-queue/'), false);

const decryptCrash = queueCrashRecovery('DECRYPTING_FOR_UPLOAD');
assert.equal(decryptCrash.retainCiphertext, true);
assert.equal(decryptCrash.scrubPlaintextTemp, true);
assert.equal(decryptCrash.treatUnreadableMetadataAsVisibleFault, true);
assert.equal(queueCrashRecovery('AWAITING_FINALIZATION').scrubPlaintextTemp, false);

assert.equal(canDiscardQueuedEvidence('QUEUED'), true);
assert.equal(canDiscardQueuedEvidence('UPLOADING'), false);

console.log('Capture workflow and queue-temp lifecycle tests passed.');
