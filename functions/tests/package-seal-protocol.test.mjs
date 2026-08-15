import assert from 'node:assert/strict';
import test from 'node:test';
import { groupPackageSealObservations } from '../lib/package-seal-protocol.js';

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
