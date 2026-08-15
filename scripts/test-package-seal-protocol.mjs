import assert from 'node:assert/strict';
import {
  HUMAN_REVIEW_DISCLAIMER,
  evidenceSupportsWorkflow,
  groupHumanReviewObservations,
  packageSealProtocolStatus,
} from '../src/lib/package-seal-protocol.ts';

assert.match(HUMAN_REVIEW_DISCLAIMER, /does not state that the package is the same or different/i);
assert.match(HUMAN_REVIEW_DISCLAIMER, /does not .*determine authenticity, custody, fraud, fault/i);

assert.equal(evidenceSupportsWorkflow({
  type: 'PACKING_VIDEO',
  clientHashMatched: true,
  clientSizeMatched: true,
  contentTypeMatched: true,
}), true);
assert.equal(evidenceSupportsWorkflow({
  type: 'PACKING_VIDEO',
  clientHashMatched: false,
}), false);
assert.equal(evidenceSupportsWorkflow({
  type: 'SHIPPING_LABEL',
  assurance: { byteIntegrity: { status: 'MISMATCH', reasonCodes: ['HASH'] } },
}), false);

const incomplete = packageSealProtocolStatus([
  { type: 'PACKING_VIDEO', clientHashMatched: true, clientSizeMatched: true, contentTypeMatched: true },
]);
assert.deepEqual(incomplete, {
  hasPackingVideo: true,
  hasSealReference: false,
  hasArrivalPhoto: false,
  hasUnboxingVideo: false,
  sellerReferenceComplete: false,
  buyerArrivalComplete: false,
  outboundComplete: false,
});

const complete = packageSealProtocolStatus([
  { type: 'PACKING_VIDEO', clientHashMatched: true, clientSizeMatched: true, contentTypeMatched: true },
  { type: 'SHIPPING_LABEL', clientHashMatched: true, clientSizeMatched: true, contentTypeMatched: true },
  { type: 'DELIVERY_PHOTO', clientHashMatched: true, clientSizeMatched: true, contentTypeMatched: true },
  { type: 'UNBOXING_VIDEO', clientHashMatched: true, clientSizeMatched: true, contentTypeMatched: true },
  { type: 'RETURN_PACKING_VIDEO', returnPassportId: 'return_1', clientHashMatched: true, clientSizeMatched: true, contentTypeMatched: true },
]);
assert.equal(complete.sellerReferenceComplete, true);
assert.equal(complete.buyerArrivalComplete, true);
assert.equal(complete.outboundComplete, true);

const returnStatus = packageSealProtocolStatus([
  { type: 'RETURN_PACKING_VIDEO', returnPassportId: 'return_1', clientHashMatched: true, clientSizeMatched: true, contentTypeMatched: true },
  { type: 'RETURN_SHIPPING_LABEL', returnPassportId: 'return_1', clientHashMatched: true, clientSizeMatched: true, contentTypeMatched: true },
  { type: 'RETURN_UNBOXING_VIDEO', returnPassportId: 'return_1', clientHashMatched: true, clientSizeMatched: true, contentTypeMatched: true },
  { type: 'PACKING_VIDEO', clientHashMatched: true, clientSizeMatched: true, contentTypeMatched: true },
], { returnPassportId: 'return_1' });
assert.equal(returnStatus.sellerReferenceComplete, true);
assert.equal(returnStatus.buyerArrivalComplete, true);
assert.equal(returnStatus.hasArrivalPhoto, false);

const grouped = groupHumanReviewObservations([
  { type: 'PACKING_VIDEO' },
  { type: 'SHIPPING_LABEL' },
  { type: 'DELIVERY_PHOTO' },
  { type: 'UNBOXING_VIDEO' },
  { type: 'RETURN_PACKING_VIDEO', returnPassportId: 'return_1' },
  { type: 'ITEM_PHOTO' },
]);
assert.deepEqual(grouped.sellerReference.map((item) => item.type), ['PACKING_VIDEO', 'SHIPPING_LABEL']);
assert.deepEqual(grouped.buyerArrival.map((item) => item.type), ['DELIVERY_PHOTO', 'UNBOXING_VIDEO']);

console.log('Package-seal protocol tests passed.');
