import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { canonicalizeJson as producerCanonicalize, createEvidenceBundleSha256 as producerBundle, detectSupportedMediaType, deterministicUploadId as producerUploadId } from '../lib/evidence-format.js';
import { canonicalizeJson as verifierCanonicalize, createEvidenceBundleSha256 as verifierBundle, deterministicUploadId as verifierUploadId } from '../../tools/evidence-format.mjs';
import { uploadRequestSchema } from '../lib/validation.js';

const vectors = JSON.parse(await readFile(new URL('../../docs/test-vectors/evidence-format-v2.json', import.meta.url), 'utf8'));

for (const vector of vectors.canonicalization) {
  assert.equal(producerCanonicalize(vector.input), vector.expected, `${vector.name}: producer mismatch`);
  assert.equal(verifierCanonicalize(vector.input), vector.expected, `${vector.name}: verifier mismatch`);
}

assert.equal(producerBundle(vectors.bundle.fileSha256, vectors.bundle.manifestSha256), vectors.bundle.expected);
assert.equal(verifierBundle(vectors.bundle.fileSha256, vectors.bundle.manifestSha256), vectors.bundle.expected);
assert.equal(producerUploadId(vectors.uploadId), vectors.uploadId.expected);
assert.equal(verifierUploadId(vectors.uploadId), vectors.uploadId.expected);

assert.throws(() => producerCanonicalize({ bad: undefined }), /explicit JSON value/);
assert.throws(() => producerCanonicalize({ bad: Number.NaN }), /finite JSON number/);
assert.throws(() => verifierCanonicalize([, 1]), /explicit JSON value/);
assert.throws(() => producerCanonicalize('\ud800'), /unpaired Unicode surrogate/);
assert.throws(() => verifierCanonicalize({ bad: '\udc00' }), /unpaired Unicode surrogate/);
assert.throws(() => producerCanonicalize(new Date(0)), /plain JSON object/);
assert.throws(() => producerBundle('00', vectors.bundle.manifestSha256), /hexadecimal SHA-256/);
assert.equal(detectSupportedMediaType(Buffer.from([0xff, 0xd8, 0xff, 0xe0])), 'image/jpeg');
assert.equal(detectSupportedMediaType(Buffer.from('89504e470d0a1a0a', 'hex')), 'image/png');
assert.equal(detectSupportedMediaType(Buffer.from('00000018667479706d703432000000006d703431', 'hex')), 'video/mp4');
assert.equal(detectSupportedMediaType(Buffer.from('0000001866747970686569630000000068656963', 'hex')), null, 'HEIC/HEIF must not be accepted as MP4 solely because it uses ftyp');
assert.equal(detectSupportedMediaType(Buffer.from('%PDF-1.7', 'ascii')), 'application/pdf');
assert.equal(detectSupportedMediaType(Buffer.from('<html>', 'ascii')), null);
assert.throws(() => uploadRequestSchema.parse({
  transactionId: 'transaction_123',
  evidenceType: 'SUPPORTING_DOCUMENT',
  contentType: 'application/pdf',
  originalName: 'bad\ud800.pdf',
  clientEvidenceId: 'qe_1234567890',
}), /well-formed Unicode/);
assert.throws(() => uploadRequestSchema.parse({
  transactionId: 'transaction_123',
  evidenceType: 'PACKING_VIDEO',
  contentType: 'image/jpeg',
  originalName: 'packing.jpg',
  clientEvidenceId: 'qe_1234567890',
}), /not allowed for evidence type/);

const physicalManifest = {
  schemaVersion: 2,
  captureId: '0f1e2d3c-4b5a-6978-8f90-abcdef123456',
  captureStartedAt: '2026-08-10T12:00:00.000Z',
  captureFinishedAt: '2026-08-10T12:00:01.000Z',
  time: {
    deviceWallStartedAt: '2026-08-10T12:00:00.000Z', deviceWallFinishedAt: '2026-08-10T12:00:01.000Z', monotonicElapsedMs: 1000,
    deviceWallProvenance: 'CLIENT_OBSERVED_UNTRUSTED', monotonicProvenance: 'CLIENT_OBSERVED_RELATIVE_ONLY', serverTimeProvenance: 'ADDED_AT_RECEIPT_AND_FINALIZATION',
  },
  captureProfile: {
    profileId: 'packproof-digital-evidence', profileVersion: '2.0.0', profileScope: 'HUMAN_GUIDED_DIGITAL_EVIDENCE',
    requestedRegions: ['LABEL_IDENTIFIER', 'INK_EDGE_A', 'INK_EDGE_B', 'LABEL_BOX_BOUNDARY', 'ADJACENT_CARDBOARD'],
    observedRegions: ['LABEL_IDENTIFIER'], regionObservationMethod: 'USER_GUIDED_NOT_MACHINE_CONFIRMED', attempt: 1,
  },
  cameraObservation: {
    source: 'EXPO_CAMERA_ORIGINAL_OUTPUT', facing: 'BACK', mode: 'PHOTO', widthPixels: 4000, heightPixels: 3000,
    orientation: null, flashMode: 'OFF', zoom: 0, codec: 'PLATFORM_DEFAULT', metadataScope: 'LIMITED_BY_EXPO_CAMERA', packProofTransformationsBeforeHashing: 'NONE',
  },
  acquisitionQuality: { status: 'NOT_EVALUATED', qualityProfileId: 'none', qualityProfileVersion: '0', reasonCodes: ['NO_CALIBRATED_QUALITY_GATE'] },
  physicalCorrespondence: { status: 'NOT_AVAILABLE', mode: 'PRODUCTION_DISABLED', reasonCodes: ['NO_VALIDATED_PHYSICAL_MATCHER_ENABLED'] },
  physicalCaptureProfile: {
    profileId: 'PP-PHYSICAL-MATTE-V1', profileVersion: 1, qualityPolicyId: 'PP-QUALITY-V1', intendedUse: 'REFERENCE', captureGroupId: 'pcg_1234567890', acquisitionMode: 'GUIDED_MULTI_FRAME',
    requestedRegions: ['LABEL_IDENTIFIER', 'INK_EDGE_A', 'INK_EDGE_B', 'LABEL_BOX_BOUNDARY', 'ADJACENT_CARDBOARD'], observedRegion: 'LABEL_IDENTIFIER', frameIndex: 0, framesPerRegion: 3, totalFrameCount: 15, captureAttempt: 1,
    clientImage: { widthPx: 4000, heightPx: 3000, gate: 'CLIENT_DIMENSION_PASS_SERVER_QUALITY_PENDING', qualitySignals: {
      algorithm: 'PP_IMAGE_QUALITY_SIGNAL_V1', sourceWidthPx: 4000, sourceHeightPx: 3000, sampleWidthPx: 500, sampleHeightPx: 375,
      meanLuminance: 120, luminanceStdDev: 30, p05Luminance: 20, p95Luminance: 230, shadowClippingFraction: 0.01,
      highlightClippingFraction: 0.02, laplacianVariance: 1200, interpretation: 'MEASUREMENT_SIGNAL_ONLY_THRESHOLDS_NOT_VALIDATED',
    } },
  },
  runtimeIntegrity: {
    appVersion: '0.3.0', nativeBuildVersion: '3', applicationId: 'com.packproof.app', runtimeVersion: null, expoReleaseChannel: null,
    deviceBrand: 'test', deviceModel: 'fixture', osName: 'Android', osVersion: '16', runtimeArtifactHash: 'a'.repeat(64), integrityScope: 'RUNTIME_METADATA_FINGERPRINT',
  },
  sensorFusion: {
    sampleWindowMs: 1000, accelerometerSampleCount: 2, gyroscopeSampleCount: 2, accelerometerMagnitudeMeanG: 1,
    accelerometerMagnitudeVariance: 0.01, gyroscopeMagnitudeVariance: 0.01, assessment: 'MOTION_DETECTED', interpretation: 'CONTEXT_SIGNAL_ONLY',
  },
  networkTelemetry: { connectionType: 'wifi', isConnected: true, isInternetReachable: true, cellularGeneration: null },
  geolocation: null,
  shippingLabel: null,
  attestation: {
    mode: 'OFFLINE_UNATTESTED', captureSessionId: null, nonce: 'fixture_nonce_1234', appId: null, issuedAt: '2026-08-10T12:00:00.000Z',
    captureWindowEndsAt: null, tokenReplayDetected: null, reasonCodes: ['NO_NETWORK'], deviceKeyProof: null,
    sessionMode: 'BATCH', maxEvidenceCount: 15, captureGroupId: 'pcg_1234567890',
  },
};
const parsedPhysical = uploadRequestSchema.parse({
  transactionId: 'transaction_123', evidenceType: 'PHYSICAL_REFERENCE_FRAME', contentType: 'image/jpeg', originalName: 'physical-reference.jpg',
  clientEvidenceId: 'qe_physical_1234567890', manifest: physicalManifest,
});
assert.equal(parsedPhysical.manifest?.physicalCaptureProfile?.frameIndex, 0);
assert.equal(parsedPhysical.manifest?.acquisitionQuality.status, 'NOT_EVALUATED');
assert.throws(() => uploadRequestSchema.parse({
  transactionId: 'transaction_123', evidenceType: 'PHYSICAL_REFERENCE_FRAME', contentType: 'image/jpeg', originalName: 'physical-reference.jpg',
  clientEvidenceId: 'qe_physical_1234567890', manifest: { ...physicalManifest, physicalCaptureProfile: { ...physicalManifest.physicalCaptureProfile, observedRegion: 'INK_EDGE_A' } },
}), /frozen frame\/region sequence/);

console.log('PackProof evidence format producer/verifier conformance vectors passed.');
