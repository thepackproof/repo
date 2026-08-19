import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { PDFDocument } from 'pdf-lib';

const require = createRequire(import.meta.url);
const passport = require('../lib/domain/v1/passport.js');
const pdf = require('../lib/passport-pdf.js');

const now = '2026-08-18T16:00:00.000Z';
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

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

function aggregated(overrides = {}) {
  const identity = passport.issuePassportIdentity('txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  return passport.aggregatePassport({
    identity: { ...identity, issuedAt: now, verificationBaseUrl: 'https://app.packproof.example' },
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
      sku: null, gtin: null, upc: null, serialNumber: null, quantity: 1,
      amount: { currency: 'USD', minorUnits: 129900 },
      variant: null, listingReference: null, merchantItemId: null, declaredCondition: null, declaredWeightGrams: 450,
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
  });
}

test('passport PDF page plan matches the 1.0 schema and embeds a QR plus stills', async () => {
  const cover = aggregated();
  assert.deepEqual(pdf.passportPdfPagePlan(cover), ['COVER', 'STILLS', 'COMPARISON', 'APPENDIX']);

  const withShipment = aggregated({
    artifacts: [
      artifact(),
      artifact({
        id: 'art_label',
        type: 'SHIPPING_LABEL',
        contentType: 'image/jpeg',
        scannedTrackingNumber: '1Z999AA10123456784',
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
  });
  assert.equal(pdf.passportPdfPagePlan(withShipment).includes('SHIPMENT'), true);
  assert.equal(pdf.passportPdfPagePlan(withShipment).includes('RETURNS'), false);

  const qr = pdf.passportQrMatrix(cover.identity.qrPayload);
  assert.equal(qr.size >= 21, true);
  assert.equal(qr.dark(0, 0), true);

  const stills = [{
    role: 'ITEM',
    artifactId: 'art_item',
    bytes: PNG_1X1,
    contentType: 'image/png',
  }];
  const bytes = await pdf.renderPassportPdf(withShipment, stills);
  const document = await PDFDocument.load(bytes);
  const plan = pdf.passportPdfPagePlan(withShipment, stills);
  assert.equal(document.getPageCount() >= plan.length, true);
  assert.equal(document.getTitle().includes(cover.identity.displayId), true);
  assert.deepEqual(String(document.getKeywords()).split(/\s+/), plan);
});

test('passport PDF omits empty shipment and returns pages', async () => {
  const emptyPacking = aggregated({
    artifacts: [artifact({ type: 'ITEM_PHOTO', id: 'art_item', contentType: 'image/jpeg' })],
  });
  assert.deepEqual(pdf.passportPdfPagePlan(emptyPacking), ['COVER', 'COMPARISON', 'APPENDIX']);
  assert.equal(pdf.stillRoleForArtifact('PACKING_VIDEO', 'video/mp4'), null);
  assert.equal(pdf.stillRoleForArtifact('ITEM_PHOTO', 'image/jpeg'), 'ITEM');
  assert.equal(pdf.stillRoleForArtifact('SHIPPING_LABEL', 'image/jpeg'), 'LABEL');
});
