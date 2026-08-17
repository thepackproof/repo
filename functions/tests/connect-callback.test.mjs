import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  buildConnectEvidenceFinalizedCallback,
  connectEvidenceIsReady,
} = require('../lib/application/v1/connect-callback.js');

const readyInput = {
  orderId: 'order-123',
  trackingNumber: '1Z999AA10123456784',
  fileSha256: 'a'.repeat(64),
  manifestSha256: 'b'.repeat(64),
  evidenceBundleSha256: 'c'.repeat(64),
  manifestAuthentication: {
    type: 'SERVICE_MAC',
    algorithm: 'HMAC-SHA256',
    keyId: 'manifest-v1',
    macBase64url: 'dGVzdA',
    verificationScope: 'PACKPROOF_SERVICE_ONLY',
  },
  assurance: {
    acquisitionQuality: { status: 'NOT_EVALUATED', reasonCodes: ['NO_CALIBRATED_QUALITY_GATE'] },
    appDeviceContext: { status: 'ONLINE_APP_CHECK_AND_KEY_POSSESSION', reasonCodes: [] },
    byteIntegrity: { status: 'MATCHED', reasonCodes: [] },
    physicalCorrespondence: { status: 'NOT_AVAILABLE', reasonCodes: ['NO_VALIDATED_PHYSICAL_MATCHER_ENABLED'] },
    carrierContext: { status: 'MATCHED', reasonCodes: [] },
    businessLegalRelevance: { status: 'REVIEW_REQUIRED', reasonCodes: ['HUMAN_REVIEW_REQUIRED'] },
  },
  attestationStatus: 'ONLINE_APP_CHECK_AND_KEY_POSSESSION',
  carrierTrackingMatchStatus: 'MATCHED',
  declaredWeightGrams: 1650,
  dossierSha256: 'd'.repeat(64),
  serverFinalized: true,
  clientHashMatched: true,
  clientSizeMatched: true,
  contentTypeMatched: true,
  trackingNumberWasSupplied: true,
  byteIntegrityStatus: 'MATCHED',
};

test('Connect evidence callback is DIGITAL_EVIDENCE_READY only when every implemented gate passes', () => {
  assert.equal(connectEvidenceIsReady(readyInput), true);
  const payload = buildConnectEvidenceFinalizedCallback(readyInput);
  assert.equal(payload.event, 'packproof.evidence.finalized');
  assert.equal(payload.evidenceStatus, 'DIGITAL_EVIDENCE_READY');
  assert.deepEqual(payload.statusReasonCodes, [
    'PHYSICAL_CORRESPONDENCE_NOT_AVAILABLE',
    'BUSINESS_LEGAL_REVIEW_REQUIRED',
  ]);
  assert.equal(payload.fileSha256, payload.sha256Hash);
  assert.equal(payload.manifestAuthentication.type, 'SERVICE_MAC');
});

test('Connect evidence callback reports limitations and never omits the permanent reason codes', () => {
  const payload = buildConnectEvidenceFinalizedCallback({
    ...readyInput,
    serverFinalized: false,
    clientHashMatched: false,
    trackingNumberWasSupplied: true,
    carrierTrackingMatchStatus: 'MISMATCH',
    attestationStatus: 'OFFLINE_UNATTESTED',
    manifestAuthentication: null,
    legacyManifestMac: 'legacy-mac',
  });
  assert.equal(payload.evidenceStatus, 'DIGITAL_EVIDENCE_WITH_LIMITATIONS');
  assert.deepEqual(payload.statusReasonCodes, [
    'SERVER_FINALIZATION_NOT_RECORDED',
    'STRONGEST_APP_DEVICE_CONTEXT_NOT_AVAILABLE',
    'CLIENT_SERVER_HASH_MATCH_NOT_ESTABLISHED',
    'CARRIER_CONTEXT_REQUIREMENT_NOT_SATISFIED',
    'PHYSICAL_CORRESPONDENCE_NOT_AVAILABLE',
    'BUSINESS_LEGAL_REVIEW_REQUIRED',
  ]);
  assert.equal(payload.manifestAuthentication.type, 'LEGACY_SERVICE_MAC');
  assert.equal(payload.manifestAuthentication.macBase64url, 'legacy-mac');
});

test('Enterprise Edge attestation is DIGITAL_EVIDENCE_WITH_LIMITATIONS', () => {
  assert.equal(connectEvidenceIsReady({
    ...readyInput,
    attestationStatus: 'ENTERPRISE_EDGE_CERTIFICATE',
  }), false);
  const payload = buildConnectEvidenceFinalizedCallback({
    ...readyInput,
    attestationStatus: 'ENTERPRISE_EDGE_CERTIFICATE',
  });
  assert.equal(payload.evidenceStatus, 'DIGITAL_EVIDENCE_WITH_LIMITATIONS');
  assert.ok(payload.statusReasonCodes.includes('STRONGEST_APP_DEVICE_CONTEXT_NOT_AVAILABLE'));
});
