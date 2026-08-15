import assert from 'node:assert/strict';
import test from 'node:test';
import {
  evidenceReadyForWorkflow,
  groupPackageSealObservations,
  SHIPMENT_PRECONDITION_MESSAGES,
  shipmentEvidenceDecision,
} from '../lib/package-seal-protocol.js';

test('groups seller reference and buyer arrival without a physical verdict', () => {
  const grouped = groupPackageSealObservations([
    { type: 'PACKING_VIDEO', sha256: 'a' },
    { type: 'SHIPPING_LABEL', sha256: 'b' },
    { type: 'DELIVERY_PHOTO', sha256: 'c' },
    { type: 'UNBOXING_VIDEO', sha256: 'd' },
    { type: 'RETURN_PACKING_VIDEO', sha256: 'e' },
    { type: 'ITEM_PHOTO', sha256: 'f' },
  ]);
  assert.deepEqual(grouped.sellerReference.map((item) => item.type), ['PACKING_VIDEO', 'SHIPPING_LABEL']);
  assert.deepEqual(grouped.buyerArrival.map((item) => item.type), ['DELIVERY_PHOTO', 'UNBOXING_VIDEO']);
  assert.deepEqual(grouped.returnReference.map((item) => item.type), ['RETURN_PACKING_VIDEO']);
  assert.equal(grouped.returnArrival.length, 0);
});

test('shipment fails closed until packing video and seal reference are workflow-ready', () => {
  assert.equal(evidenceReadyForWorkflow(undefined), false);
  assert.equal(evidenceReadyForWorkflow({ serverFinalized: true, clientHashMatched: true, clientSizeMatched: true, contentTypeMatched: true }), true);
  assert.equal(evidenceReadyForWorkflow({
    serverFinalized: true,
    clientHashMatched: true,
    clientSizeMatched: true,
    contentTypeMatched: true,
    assurance: { byteIntegrity: { status: 'MISMATCH' } },
  }), false);
  assert.equal(evidenceReadyForWorkflow({ serverVerified: true, clientHashMatched: true }), true);
  assert.equal(evidenceReadyForWorkflow({ serverVerified: true, clientHashMatched: false }), false);

  assert.deepEqual(shipmentEvidenceDecision({ packingReady: false, sealReady: false }), { ok: false, missing: 'PACKING_VIDEO' });
  assert.deepEqual(shipmentEvidenceDecision({ packingReady: true, sealReady: false }), { ok: false, missing: 'SEAL_REFERENCE' });
  assert.deepEqual(shipmentEvidenceDecision({ packingReady: true, sealReady: true }), { ok: true });
  assert.deepEqual(shipmentEvidenceDecision({ packingReady: true, sealReady: false, kind: 'return' }), { ok: false, missing: 'RETURN_SEAL_REFERENCE' });
  assert.match(SHIPMENT_PRECONDITION_MESSAGES.SEAL_REFERENCE, /high-resolution seal reference/);
});
