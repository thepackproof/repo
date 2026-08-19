import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';

const require = createRequire(import.meta.url);
const passport = require('../lib/domain/v1/passport.js');

const now = '2026-08-18T16:00:00.000Z';

function artifact(overrides = {}) {
  return {
    id: 'art_packing',
    transactionId: 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    type: 'PACKING_VIDEO',
    finalization: 'FINALIZED',
    contentType: 'video/mp4',
    sizeBytes: 2048,
    sha256: 'a'.repeat(64),
    manifestSha256: 'b'.repeat(64),
    evidenceBundleSha256: 'c'.repeat(64),
    captureSessionId: 'cap_1',
    evidenceSessionId: null,
    clientCreatedAt: now,
    finalizedAt: now,
    createdAt: now,
    scannedTrackingNumber: null,
    shippingTracker: null,
    carrierTrackingMatchStatus: null,
    acquisitionClass: null,
    appDeviceContextStatus: 'ONLINE_APP_CHECK_ONLY',
    returnPassportId: null,
    clientHashMatched: true,
    bundleBindingProfile: 'PACKPROOF_EVIDENCE_BUNDLE_V2',
    manifestAuthentication: { type: 'SERVICE_MAC', algorithm: 'HMAC-SHA256', keyId: 'packproof-manifest-v1', verificationScope: 'PACKPROOF_SERVICE_ONLY' },
    ...overrides,
  };
}

function baseInput(overrides = {}) {
  const identity = passport.issuePassportIdentity('txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  return {
    identity: {
      ...identity,
      issuedAt: now,
      verificationBaseUrl: 'https://app.packproof.example',
    },
    transaction: {
      id: 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      merchantReference: 'order-1',
      title: 'Collectible camera',
      amount: { currency: 'USD', minorUnits: 129900 },
      termsSaleType: 'SHIPPED',
      commerceContextId: 'ctx_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      sourcePlatform: 'MARKETPLACE',
      sourceType: 'PACKPROOF_CONNECT',
      externalOrderId: 'ebay-99',
      externalSellerId: 'seller-42',
      declaredWeightGrams: 450,
      sourceTrackingNumber: '1Z999AA10123456784',
      createdAt: now,
      updatedAt: now,
    },
    commerce: {
      id: 'ctx_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      platform: 'MARKETPLACE',
      trustLevel: 'MERCHANT_SERVER_ATTESTED',
      assertingSource: 'MERCHANT_API',
      externalOrderId: 'ebay-99',
      externalSellerId: 'seller-42',
      capturedAt: now,
      canonicalPayloadSha256: 'd'.repeat(64),
      title: 'Collectible camera',
      sku: null,
      gtin: null,
      upc: null,
      serialNumber: null,
      quantity: 1,
      amount: { currency: 'USD', minorUnits: 129900 },
      variant: null,
      listingReference: null,
      merchantItemId: null,
      declaredCondition: null,
      declaredWeightGrams: 450,
    },
    artifacts: [artifact()],
    shipment: null,
    delivery: null,
    returns: [],
    timeline: [],
    reviewQuery: null,
    humanReviewDisclaimer: 'Human review only.',
    now,
    ...overrides,
  };
}

test('passport display id is Crockford Base32 of 60 bits and stable for a passport id', () => {
  const first = passport.issuePassportIdentity('txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  const second = passport.issuePassportIdentity('txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(first.passportId, second.passportId);
  assert.equal(first.displayId, second.displayId);
  assert.match(first.passportId, passport.PASSPORT_RESOURCE_ID_PATTERN);
  assert.match(first.displayId, passport.PASSPORT_DISPLAY_ID_PATTERN);
  assert.equal(passport.displayIdFromPassportId(first.passportId), first.displayId);
  assert.notEqual(first.displayId.includes('ebay'), true);
  assert.notEqual(first.displayId.includes('txn_'), true);
});

test('eligibility requires a commerce source and a finalized hashed artifact', () => {
  const ready = passport.evaluatePassportEligibility({
    transactionExists: true,
    merchantReference: 'order-1',
    commerceContextId: null,
    externalOrderId: null,
    artifacts: [artifact()],
    displayedUnattributedFacts: 0,
  });
  assert.equal(ready.ok, true);

  const missingSource = passport.evaluatePassportEligibility({
    transactionExists: true,
    merchantReference: null,
    commerceContextId: null,
    externalOrderId: null,
    artifacts: [artifact()],
    displayedUnattributedFacts: 0,
  });
  assert.equal(missingSource.ok, false);
  assert.equal(missingSource.failures.some((item) => item.code === 'NO_COMMERCE_SOURCE'), true);

  const missingArtifact = passport.evaluatePassportEligibility({
    transactionExists: true,
    merchantReference: 'order-1',
    commerceContextId: null,
    externalOrderId: null,
    artifacts: [artifact({ finalization: 'UPLOADED', manifestSha256: null })],
    displayedUnattributedFacts: 0,
  });
  assert.equal(missingArtifact.ok, false);
  assert.equal(missingArtifact.failures.some((item) => item.code === 'NO_FINALIZED_MANIFEST_ARTIFACT'), true);
});

test('identifier comparisons are SAME, DIFFERENT, or NOT_COMPARED and never MATCH', () => {
  assert.equal(passport.compareExactIdentifier('1Z999AA10123456784', '1z999aa10123456784'), 'SAME');
  assert.equal(passport.compareExactIdentifier('1Z999AA10123456784', '1Z999AA10999999999'), 'DIFFERENT');
  assert.equal(passport.compareExactIdentifier('1Z999AA10123456784', null), 'NOT_COMPARED');
  assert.equal(passport.compareExactIdentifier(null, '1Z999AA10123456784'), 'NOT_COMPARED');
  const comparison = passport.compareIdentifierAttribute('TRACKING', '1Z999', '1Z000');
  assert.equal(comparison.result, 'DIFFERENT');
  assert.equal(comparison.footnote, 'RELATIONSHIP_ONLY');
  assert.notEqual(comparison.result, 'MATCH');
  assert.equal(JSON.stringify(comparison).includes('MATCH'), false);
});

test('aggregator projects honest 1.0 gaps and authentic integrity', () => {
  const aggregated = passport.aggregatePassport(baseInput({
    artifacts: [
      artifact(),
      artifact({
        id: 'art_label',
        type: 'SHIPPING_LABEL',
        contentType: 'image/jpeg',
        scannedTrackingNumber: '1Z999AA10123456784',
        shippingTracker: {
          lookupStatus: 'DATASET_VALIDATED',
          courierCode: 'ups',
          observationSha256: 'e'.repeat(64),
          hashMatched: true,
          stillSha256: 'f'.repeat(64),
        },
      }),
    ],
    shipment: {
      carrier: 'UPS',
      trackingNumber: '1Z999AA10123456784',
      packingEvidenceId: 'art_packing',
      sealEvidenceId: 'art_label',
      shippedAt: now,
      createdAt: now,
    },
  }));

  assert.equal(aggregated.object, 'packproof_passport');
  assert.equal(aggregated.integrity.banner, 'AUTHENTIC_PACKPROOF');
  assert.equal(aggregated.integrity.meaning, passport.INTEGRITY_MEANING_VERIFIED);
  assert.equal(aggregated.integrity.manifestAuthentication.publiclyVerifiable, false);
  assert.equal(aggregated.transaction.destination.value, null);
  assert.equal(aggregated.items[0].expected.sku.value, null);
  assert.equal(aggregated.items[0].expected.upc.value, null);
  assert.equal(aggregated.items[0].expected.serialExpected.value, null);
  const byAttribute = Object.fromEntries(aggregated.items[0].comparisons.map((item) => [item.attribute, item]));
  assert.equal(byAttribute.UPC.result, 'NOT_COMPARED');
  assert.equal(byAttribute.SKU.result, 'NOT_COMPARED');
  assert.equal(byAttribute.SERIAL.result, 'NOT_COMPARED');
  assert.equal(byAttribute.QUANTITY.result, 'NOT_COMPARED');
  assert.equal(byAttribute.TRACKING.result, 'SAME');
  assert.equal(aggregated.items[0].observations.some((item) => item.kind === 'QUANTITY_OBSERVED'), false);
  assert.equal(aggregated.items[0].observations.some((item) => item.kind === 'WEIGHT'), false);
  assert.equal(aggregated.fulfillment.shippingTracker.value.interpretation, 'OPEN_SOURCE_TRACKING_NUMBER_VALIDATION_NOT_CARRIER_CUSTODY');
  assert.equal(aggregated.limitations.shippingTrackerInterpretation, 'OPEN_SOURCE_TRACKING_NUMBER_VALIDATION_NOT_CARRIER_CUSTODY');
  assert.equal(aggregated.limitations.doesNotAuthenticateItem, true);
  assert.equal(aggregated.evidenceInventory.find((item) => item.category === 'WEIGHT_OBSERVATION').state, 'NOT_AVAILABLE');
  assert.equal(aggregated.evidenceInventory.find((item) => item.category === 'CARRIER_ACCEPTANCE').state, 'NOT_AVAILABLE');
  assert.equal(aggregated.evidenceInventory.find((item) => item.category === 'REFUND_EVIDENCE').state, 'NOT_APPLICABLE');
  assert.equal(aggregated.evidenceInventory.find((item) => item.category === 'PACKING_CAPTURE').state, 'AVAILABLE');
  assert.equal(aggregated.receiver, null);
  assert.deepEqual(aggregated.returns, []);
  assert.equal(aggregated.identity.verificationUrl.endsWith(`/passport/${aggregated.identity.displayId}`), true);
  assert.equal(JSON.stringify(aggregated).includes('"MATCH"'), false);
  assert.equal(aggregated.integrity.banner.includes('ITEM'), false);
});

test('quarantined artifacts make finalization LIMITED without removing AUTHENTIC_PACKPROOF', () => {
  const aggregated = passport.aggregatePassport(baseInput({
    artifacts: [
      artifact(),
      artifact({
        id: 'art_bad',
        type: 'CONDITION_PHOTO',
        finalization: 'QUARANTINED',
        clientHashMatched: false,
      }),
    ],
  }));
  assert.equal(aggregated.integrity.banner, 'AUTHENTIC_PACKPROOF');
  assert.equal(aggregated.integrity.summary, 'PackProof record integrity verified');
  assert.equal(aggregated.integrity.criteria.finalization, 'LIMITED');
  assert.equal(aggregated.evidenceInventory.find((item) => item.category === 'CARRIER_ACCEPTANCE').state, 'NOT_AVAILABLE');
  assert.notEqual(aggregated.integrity.banner, 'PACKPROOF_RECORD_WITH_LIMITATIONS');
  const eligibility = passport.evaluatePassportEligibility({
    transactionExists: true,
    merchantReference: 'order-1',
    commerceContextId: null,
    externalOrderId: null,
    artifacts: [artifact(), artifact({ id: 'art_bad', finalization: 'QUARANTINED', clientHashMatched: false })],
    displayedUnattributedFacts: 0,
  });
  assert.equal(eligibility.ok, true);
});

test('legacy missing manifests are LIMITED on that criterion without flattening authenticity', () => {
  const aggregated = passport.aggregatePassport(baseInput({
    artifacts: [artifact({ manifestSha256: null })],
  }));
  assert.equal(aggregated.integrity.criteria.evidenceManifests, 'LIMITED');
  assert.equal(aggregated.integrity.banner, 'AUTHENTIC_PACKPROOF');
});

test('integrity evaluator never uses the dead hashMismatch-and-missingManifest branch', () => {
  const aggregated = passport.aggregatePassport(baseInput({
    artifacts: [artifact({ clientHashMatched: false, finalization: 'QUARANTINED' }), artifact()],
  }));
  assert.equal(aggregated.integrity.criteria.evidenceManifests, 'VERIFIED');
  assert.equal(aggregated.integrity.banner, 'AUTHENTIC_PACKPROOF');
});

test('PAGE_DECLARED commerce is draft lineage only and cannot satisfy Passport issuance', () => {
  const pageDeclared = {
    ...baseInput().commerce,
    trustLevel: 'PAGE_DECLARED',
    assertingSource: 'PAGE_DECLARED',
    sku: 'PAGE-SKU',
    title: 'Browser imported camera',
    upc: '012345678905',
  };
  const ineligible = passport.evaluatePassportEligibility({
    transactionExists: true,
    merchantReference: null,
    commerceContextId: pageDeclared.id,
    commerceTrustLevel: 'PAGE_DECLARED',
    sourceTrustLevel: 'PAGE_DECLARED',
    externalOrderId: null,
    artifacts: [artifact()],
    displayedUnattributedFacts: 0,
  });
  assert.equal(ineligible.ok, false);
  assert.equal(ineligible.failures.some((item) => item.code === 'NO_COMMERCE_SOURCE'), true);

  const aggregated = passport.aggregatePassport(baseInput({
    commerce: pageDeclared,
    transaction: {
      ...baseInput().transaction,
      sourceTrustLevel: 'PAGE_DECLARED',
      sourceType: 'PACKPROOF_BUTTON',
      sourcePlatform: null,
      merchantReference: null,
      externalOrderId: null,
      title: 'Browser imported camera',
    },
  }));
  assert.equal(aggregated.transaction.sourceTrustClass, null);
  assert.equal(aggregated.transaction.commerceContextId, null);
  assert.equal(aggregated.items[0].expected.sku.value, null);
  assert.equal(aggregated.items[0].expected.upc.value, null);
  assert.notEqual(aggregated.items[0].expected.title.value, 'Browser imported camera');
  assert.equal(aggregated.integrity.criteria.provenance, 'LIMITED');
  assert.equal(aggregated.integrity.banner, 'AUTHENTIC_PACKPROOF');
});

test('PAGE_DECLARED facts stay omitted after an attested Connect order is present', () => {
  const aggregated = passport.aggregatePassport(baseInput({
    commerce: {
      ...baseInput().commerce,
      trustLevel: 'PAGE_DECLARED',
      assertingSource: 'PAGE_DECLARED',
      title: 'Page declared title',
      sku: 'PAGE-SKU',
      upc: '012345678905',
    },
  }));
  assert.equal(aggregated.items[0].expected.sku.value, null);
  assert.equal(aggregated.items[0].expected.upc.value, null);
  assert.equal(aggregated.items[0].expected.title.value, 'Collectible camera');
  assert.equal(aggregated.transaction.sourceTrustClass, 'MERCHANT_SERVER_ATTESTED');
  assert.equal(aggregated.transaction.commerceContextId, null);
  assert.equal(aggregated.integrity.criteria.provenance, 'LIMITED');
  assert.equal(aggregated.integrity.banner, 'AUTHENTIC_PACKPROOF');
});

test('snapshot fingerprints include the normalized review query', () => {
  const visa = passport.passportSnapshotFingerprintPayload('txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', {
    framework: 'visa',
    category: 'merchandise_not_received',
  });
  const paypal = passport.passportSnapshotFingerprintPayload('txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', {
    framework: 'PAYPAL',
    category: 'ITEM_NOT_RECEIVED',
  });
  assert.deepEqual(visa.reviewQuery, { framework: 'VISA', category: 'MERCHANDISE_NOT_RECEIVED' });
  assert.notDeepEqual(visa, paypal);
  assert.equal(visa.transactionId, paypal.transactionId);
});

test('inventory REVIEW_REQUIRED is used for tracking mismatch and packing hash mismatch', () => {
  const tracking = passport.inventoryStateFor('TRACKING_ASSOCIATION', {
    hasCommerceSource: true, unattributed: false, identifierArtifacts: [], conditionArtifacts: [], packingArtifacts: [],
    sealArtifacts: [], labelArtifacts: [], trackingObserved: true, trackingSupplied: true, trackingMismatch: true,
    shippingTerms: true, deliveryArtifacts: [], receiverArtifacts: [], returnArtifacts: [], hasReturn: false, shipped: true,
  });
  assert.equal(tracking.state, 'REVIEW_REQUIRED');

  const packing = passport.inventoryStateFor('PACKING_CAPTURE', {
    hasCommerceSource: true, unattributed: false, identifierArtifacts: [], conditionArtifacts: [],
    packingArtifacts: [artifact({ clientHashMatched: false, finalization: 'QUARANTINED' })],
    sealArtifacts: [], labelArtifacts: [], trackingObserved: false, trackingSupplied: false, trackingMismatch: false,
    shippingTerms: true, deliveryArtifacts: [], receiverArtifacts: [], returnArtifacts: [], hasReturn: false, shipped: false,
  });
  assert.equal(packing.state, 'REVIEW_REQUIRED');
});

test('review context is a query projection and does not invent evidentiary weight', () => {
  const aggregated = passport.aggregatePassport(baseInput({
    reviewQuery: { framework: 'VISA', category: 'MERCHANDISE_NOT_RECEIVED' },
  }));
  assert.equal(aggregated.reviewContext.receivingFramework, 'VISA');
  assert.equal(aggregated.reviewContext.footnote, 'CONFIGURATION_ONLY');
  assert.equal(aggregated.reviewContext.relevance.some((item) => item.category === 'PACKING_CAPTURE'), true);
  assert.equal(aggregated.limitations.noEvidentiaryWeightScore, true);
});
