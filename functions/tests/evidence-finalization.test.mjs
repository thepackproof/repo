import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acquisitionClassOf,
  attestationStatusForGrant,
  finalizeReceivedEvidence,
  hmacManifestSigner,
  uploaderAuthorizedForGrant,
  uploaderRoleForGrant,
} from '../lib/evidence-finalization.js';
import { sha256Hex } from '../lib/evidence-format.js';

const signer = hmacManifestSigner('packproof-enterprise-test-manifest-mac-key-32b', 'manifest-hmac-v1');

function jpegStill() {
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xdb]), Buffer.from('station-seal'), Buffer.from([0xff, 0xd9])]);
}

function enterprisePending(bytes, extra = {}) {
  const digest = sha256Hex(bytes);
  return {
    transactionId: 'txn_12345678',
    uploaderId: 'edge_12345678',
    uploadId: 'a'.repeat(64),
    clientEvidenceId: 'client-evidence-1',
    evidenceType: 'STATION_SEAL_REFERENCE',
    contentType: 'image/jpeg',
    originalName: 'station_seal_reference',
    clientSha256: digest,
    clientSizeBytes: bytes.length,
    storagePath: `evidence/txn_12345678/edge_12345678/${'a'.repeat(64)}`,
    captureSessionId: 'ees_12345678',
    returnPassportId: null,
    connectSessionId: null,
    clientManifest: {
      schemaVersion: 2,
      acquisitionClass: 'ENTERPRISE_EDGE',
      captureStartedAt: '2026-08-17T12:00:00.000Z',
      captureFinishedAt: '2026-08-17T12:00:45.000Z',
      rollingCapture: null,
      attestation: { mode: 'ENTERPRISE_EDGE', reasonCodes: ['NOT_NATIVE_APP_CHECK'] },
    },
    attestationSnapshot: {
      mode: 'ENTERPRISE_EDGE',
      deviceKeySignatureValid: false,
      reasonCodes: ['NOT_NATIVE_APP_CHECK'],
    },
    carrierContext: null,
    requestFingerprint: 'b'.repeat(64),
    acquisitionClass: 'ENTERPRISE_EDGE',
    edgeAgentId: 'edge_12345678',
    organizationId: 'org_12345678',
    fulfillmentSessionId: 'fs_12345678',
    ingressNetwork: null,
    ...extra,
  };
}

test('Enterprise Edge grants use station attestation and never inherit App Check', () => {
  assert.equal(acquisitionClassOf('ENTERPRISE_EDGE'), 'ENTERPRISE_EDGE');
  assert.equal(attestationStatusForGrant({
    attestationSnapshot: { mode: 'ENTERPRISE_EDGE', deviceKeySignatureValid: false },
    clientManifest: {},
  }), 'ENTERPRISE_EDGE_INSTALLATION');
  assert.equal(attestationStatusForGrant({
    attestationSnapshot: { mode: 'ENTERPRISE_EDGE', deviceKeySignatureValid: true },
    clientManifest: {},
  }), 'ENTERPRISE_EDGE_CERTIFICATE');
  assert.equal(attestationStatusForGrant({
    attestationSnapshot: { mode: 'JIT_APP_CHECK', deviceKeySignatureValid: true },
    clientManifest: {},
  }), 'ONLINE_APP_CHECK_AND_KEY_POSSESSION');
  assert.equal(uploaderAuthorizedForGrant({
    participantIds: ['seller-1'],
    uploaderId: 'edge_12345678',
    pending: { acquisitionClass: 'ENTERPRISE_EDGE', edgeAgentId: 'edge_12345678' },
  }), true);
  assert.equal(uploaderAuthorizedForGrant({
    participantIds: ['seller-1'],
    uploaderId: 'edge_other',
    pending: { acquisitionClass: 'ENTERPRISE_EDGE', edgeAgentId: 'edge_12345678' },
  }), false);
  assert.equal(uploaderAuthorizedForGrant({
    participantIds: ['seller-1'],
    uploaderId: 'seller-1',
    pending: { acquisitionClass: 'NATIVE_MOBILE', edgeAgentId: null },
  }), true);
  assert.equal(uploaderRoleForGrant({
    sellerId: 'seller-1',
    buyerId: 'buyer-1',
    uploaderId: 'edge_12345678',
    pending: { acquisitionClass: 'ENTERPRISE_EDGE' },
  }), 'ENTERPRISE_STATION');
});

test('server finalization hashes received bytes into Evidence Format v2 without App Check', () => {
  const bytes = jpegStill();
  const pending = enterprisePending(bytes);
  const result = finalizeReceivedEvidence({
    bytes,
    pending,
    object: {
      bucket: 'packproof-enterprise-ingress',
      storagePath: pending.storagePath,
      generation: '1',
      timeCreated: '2026-08-17T12:01:00.000Z',
      size: bytes.length,
      contentType: 'image/jpeg',
    },
    uploaderRole: 'ENTERPRISE_STATION',
    signer,
  });
  assert.equal(result.integrityAccepted, true);
  assert.equal(result.attestationStatus, 'ENTERPRISE_EDGE_INSTALLATION');
  assert.equal(result.digest, pending.clientSha256);
  assert.equal(result.manifestSha256.length, 64);
  assert.equal(result.evidenceBundleSha256.length, 64);
  assert.equal(result.assurance.appDeviceContext.reasonCodes.includes('NOT_NATIVE_APP_CHECK'), true);
  assert.ok(!result.attestationStatus.includes('APP_CHECK'));
  const manifest = JSON.parse(result.manifestJson);
  assert.equal(manifest.evidence.uploaderRole, 'ENTERPRISE_STATION');
  assert.equal(manifest.evidence.acquisitionClass, 'ENTERPRISE_EDGE');
  assert.equal(manifest.authentication.type, 'SERVICE_MAC');
});

test('hash mismatch is preserved as an integrity failure, not App Check context', () => {
  const bytes = jpegStill();
  const pending = enterprisePending(bytes, { clientSha256: 'd'.repeat(64) });
  const result = finalizeReceivedEvidence({
    bytes,
    pending,
    object: {
      bucket: 'packproof-enterprise-ingress',
      storagePath: pending.storagePath,
      generation: '1',
      timeCreated: '2026-08-17T12:01:00.000Z',
      size: bytes.length,
      contentType: 'image/jpeg',
    },
    uploaderRole: 'ENTERPRISE_STATION',
    signer,
  });
  assert.equal(result.integrityAccepted, false);
  assert.equal(result.clientHashMatched, false);
  assert.equal(result.attestationStatus, 'ENTERPRISE_EDGE_INSTALLATION');
  assert.equal(result.assurance.byteIntegrity.status, 'MISMATCH');
});
