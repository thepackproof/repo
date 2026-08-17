import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import {
  ApplicationError,
  EdgeAuthenticationService,
  EdgeRequestSigner,
  MemoryEdgeCredentialDirectory,
  MemoryNonceStore,
  generateEdgeDeviceKeyPair,
  sha256Buffer,
} from '../lib/application/v1/index.js';

const now = new Date('2026-08-17T12:00:00.000Z');

function harness() {
  const keys = generateEdgeDeviceKeyPair();
  const credentials = new MemoryEdgeCredentialDirectory();
  const nonces = new MemoryNonceStore();
  const auth = new EdgeAuthenticationService(credentials, nonces, () => now);
  auth.register({
    credentialId: 'dcred_12345678',
    edgeAgentId: 'edge_12345678',
    organizationId: 'org_12345678',
    siteId: 'site_12345678',
    stationId: 'station_12345678',
    publicKeySpki: keys.publicKeySpki,
    status: 'ACTIVE',
  });
  const signer = new EdgeRequestSigner(keys.privateKeyPkcs8);
  const binding = {
    organizationId: 'org_12345678',
    siteId: 'site_12345678',
    edgeAgentId: 'edge_12345678',
    stationId: 'station_12345678',
    sessionId: 'fs_12345678',
    requestId: 'request-edge-1',
    timestamp: now.toISOString(),
    nonce: randomBytes(16).toString('base64url'),
  };
  return { auth, signer, binding, keys };
}

test('signed Edge requests authenticate to a bound principal', () => {
  const { auth, signer, binding } = harness();
  const body = { action: 'RECORD_OBSERVATION', normalizedValue: 'SKU-1' };
  const principal = auth.authenticate(signer.sign(binding, body), body);
  assert.equal(principal.edgeAgentId, 'edge_12345678');
  assert.equal(principal.stationId, 'station_12345678');
  assert.equal(principal.credentialStatus, 'ACTIVE');
  assert.equal(principal.publicKeySpkiSha256.length, 64);
});

test('Edge authentication rejects replayed nonces, bad signatures, and body substitution', () => {
  const { auth, signer, binding, keys } = harness();
  const body = { action: 'RESERVE_ARTIFACT', type: 'STATION_PACKING_VIDEO' };
  const signed = signer.sign(binding, body);
  auth.authenticate(signed, body);
  assert.throws(
    () => auth.authenticate(signed, body),
    (error) => error instanceof ApplicationError && error.code === 'EDGE_NONCE_REPLAYED',
  );
  const other = new EdgeRequestSigner(generateEdgeDeviceKeyPair().privateKeyPkcs8);
  assert.throws(
    () => auth.authenticate(other.sign({ ...binding, nonce: randomBytes(16).toString('base64url'), requestId: 'request-edge-2' }, body), body),
    (error) => error instanceof ApplicationError && error.code === 'EDGE_SIGNATURE_INVALID',
  );
  const fresh = signer.sign({ ...binding, nonce: randomBytes(16).toString('base64url'), requestId: 'request-edge-3' }, body);
  assert.throws(
    () => auth.authenticate(fresh, { action: 'RESERVE_ARTIFACT', type: 'ITEM_REFERENCE_PHOTO' }),
    (error) => error instanceof ApplicationError && error.code === 'EDGE_BODY_DIGEST_MISMATCH',
  );
  assert.equal(sha256Buffer(keys.publicKeySpki).length, 64);
});
