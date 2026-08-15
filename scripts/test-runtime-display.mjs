import assert from 'node:assert/strict';
import { formatRuntimeEnum, normalizePhysicalStatus } from '../src/lib/runtime-display.ts';

assert.equal(formatRuntimeEnum('RESEARCH_ONLY'), 'RESEARCH ONLY');
assert.equal(formatRuntimeEnum('  ACQUISITION_INCOMPLETE  '), 'ACQUISITION INCOMPLETE');
for (const value of [undefined, null, '', '   ', 42, {}]) {
  assert.equal(formatRuntimeEnum(value), 'Unavailable');
}
assert.equal(formatRuntimeEnum(undefined, 'STATUS UNAVAILABLE'), 'STATUS UNAVAILABLE');

assert.equal(normalizePhysicalStatus(null), null);
assert.equal(normalizePhysicalStatus('RESEARCH_ONLY'), null);

const legacy = normalizePhysicalStatus({ status: 'RESEARCH_ONLY' });
assert.deepEqual(legacy, {
  observationStatus: 'NOT_EVALUATED',
  reason: 'STATUS_UNAVAILABLE',
  reference: null,
  verification: null,
  comparison: {
    status: 'NOT_ENABLED',
    artifactVersion: null,
    observationPolicyVersion: null,
    aggregateMeasurement: null,
  },
  claimClass: 'V',
});

const valid = normalizePhysicalStatus({
  observationStatus: 'RESEARCH_ONLY',
  reason: 'COMPARISON_NOT_ENABLED',
  reference: {
    captureGroupId: 'group-reference',
    frameCount: 15,
    usableFrameCount: 15,
    complete: true,
    missing: [],
  },
  verification: {
    captureGroupId: 'group-verification',
    frameCount: 12,
    usableFrameCount: 10,
    complete: false,
    missing: ['frame-13'],
  },
  comparison: { status: 'ENABLED', aggregateMeasurement: 0.99 },
  claimClass: 'A',
});
assert.equal(valid?.observationStatus, 'RESEARCH_ONLY');
assert.equal(valid?.reason, 'COMPARISON_NOT_ENABLED');
assert.equal(valid?.reference?.usableFrameCount, 15);
assert.deepEqual(valid?.verification?.missing, ['frame-13']);
assert.equal(valid?.comparison.status, 'NOT_ENABLED');
assert.equal(valid?.comparison.aggregateMeasurement, null);
assert.equal(valid?.claimClass, 'V');

const malformed = normalizePhysicalStatus({
  observationStatus: 'UNSUPPORTED_STATUS',
  reason: 27,
  reference: { frameCount: -2, usableFrameCount: Number.NaN, complete: 'yes', missing: [1, 'frame-2'] },
});
assert.equal(malformed?.observationStatus, 'NOT_EVALUATED');
assert.equal(malformed?.reason, 'STATUS_UNAVAILABLE');
assert.equal(malformed?.reference?.frameCount, 0);
assert.equal(malformed?.reference?.usableFrameCount, 0);
assert.equal(malformed?.reference?.complete, false);
assert.deepEqual(malformed?.reference?.missing, ['frame-2']);

process.stdout.write('Runtime display boundary tests passed.\n');
