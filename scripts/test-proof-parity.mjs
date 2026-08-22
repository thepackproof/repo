import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';
import {
  PROOF_COMPARISON_FOOTNOTE,
  PROOF_PAGE_ONE_FOOTER,
  presentProof,
  proofParitySnapshot,
} from '../shared/ux/proof-presentation.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const requireFromRoot = createRequire(import.meta.url);
const requireFromFunctions = createRequire(join(root, 'functions', 'package.json'));
const { PDFDocument } = requireFromFunctions('pdf-lib');
const passport = requireFromRoot('../functions/lib/domain/v1/passport.js');
const pdf = requireFromRoot('../functions/lib/passport-pdf.js');

const now = '2026-08-18T16:00:00.000Z';
const FILE_DIGEST = 'a'.repeat(64);
const MANIFEST_DIGEST = 'b'.repeat(64);

function artifact(overrides = {}) {
  return {
    id: 'art_packing',
    transactionId: 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    type: 'PACKING_VIDEO',
    finalization: 'FINALIZED',
    contentType: 'video/mp4',
    sizeBytes: 2048,
    sha256: FILE_DIGEST,
    manifestSha256: MANIFEST_DIGEST,
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

function canonicalProof(overrides = {}) {
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
    humanReviewDisclaimer: 'These observations are preserved for authorized human review.',
    now,
    ...overrides,
  });
}

function decodePdfHexStrings(text) {
  return text.replace(/<([0-9A-Fa-f]+)>/g, (_, hex) => (
    hex.length % 2 === 0 ? Buffer.from(hex, 'hex').toString('latin1') : _
  ));
}

function renderedPdfText(bytes) {
  const raw = Buffer.from(bytes);
  const latin1 = raw.toString('latin1');
  const chunks = [latin1];
  for (const match of latin1.matchAll(/stream\r?\n([\s\S]*?)endstream/g)) {
    const payload = Buffer.from(match[1].replace(/^\r?\n/, '').replace(/\r?\n$/, ''), 'latin1');
    try {
      chunks.push(inflateSync(payload).toString('latin1'));
    } catch {
      chunks.push(match[1]);
    }
  }
  return decodePdfHexStrings(chunks.join('\n'));
}

function assertPresentationMatchesCanonical(canonical) {
  const presented = presentProof(canonical);
  assert.equal(presented.identity.passportId, canonical.identity.passportId);
  assert.equal(presented.identity.displayId, canonical.identity.displayId);
  assert.equal(presented.identity.transactionId, canonical.identity.transactionId);
  assert.equal(presented.identity.issuedAt, canonical.identity.issuedAt);
  assert.equal(presented.identity.verificationUrl, canonical.identity.verificationUrl);
  assert.equal(presented.identity.qrPayload, canonical.identity.qrPayload);
  assert.equal(presented.integrity.banner, canonical.integrity.banner);
  assert.equal(presented.integrity.summary, canonical.integrity.summary);
  assert.equal(presented.integrity.meaning, canonical.integrity.meaning);
  assert.equal(presented.fulfillment.packingArtifactId, canonical.fulfillment.packingArtifactId);
  assert.equal(presented.fulfillment.sealArtifactId, canonical.fulfillment.sealArtifactId);
  assert.equal(presented.limitations.humanReviewDisclaimer, canonical.limitations.humanReviewDisclaimer);
  assert.equal(presented.limitations.doesNotDecideFraudOrFault, true);
  assert.equal(presented.comparisonFootnote, PROOF_COMPARISON_FOOTNOTE);
  assert.equal(presented.pageOneFooter, PROOF_PAGE_ONE_FOOTER);
}

assert.equal(PROOF_COMPARISON_FOOTNOTE, passport.COMPARISON_FOOTNOTE_COPY);
assert.equal(PROOF_PAGE_ONE_FOOTER, passport.PASSPORT_PAGE_ONE_FOOTER);

const authentic = canonicalProof();
assert.equal(authentic.integrity.banner, 'AUTHENTIC_PACKPROOF');
assert.equal(authentic.transaction.sellerReference.value, 'seller-42');
assert.equal(authentic.fulfillment.packingArtifactId, 'art_packing');
assertPresentationMatchesCanonical(authentic);
assert.deepEqual(proofParitySnapshot(authentic), pdf.passportPdfParitySnapshot(authentic));

const limited = canonicalProof({
  artifacts: [artifact({ clientHashMatched: false })],
});
assert.equal(limited.integrity.banner, 'PACKPROOF_RECORD_WITH_LIMITATIONS');
assertPresentationMatchesCanonical(limited);
assert.deepEqual(proofParitySnapshot(limited), pdf.passportPdfParitySnapshot(limited));
assert.notEqual(proofParitySnapshot(limited).integrityBanner, proofParitySnapshot(authentic).integrityBanner);

const bytes = await pdf.renderPassportPdf(authentic);
const document = await PDFDocument.load(bytes);
const rendered = renderedPdfText(bytes);
assert.equal(document.getTitle().includes(authentic.identity.displayId), true);
assert.equal(rendered.includes(authentic.identity.displayId), true);
assert.equal(rendered.includes(authentic.identity.passportId), true);
assert.equal(rendered.includes(authentic.identity.transactionId), true);
assert.equal(rendered.includes(FILE_DIGEST), true);
assert.equal(rendered.includes(MANIFEST_DIGEST), true);
assert.equal(rendered.includes('These observations are preserved for authorized human review.'), true);
assert.equal(rendered.includes('Review the evidence and provenance'), true);
assert.equal(rendered.includes('does not determine fraud'), true);

const android = readFileSync(join(root, 'src', 'app', 'passport', '[id].tsx'), 'utf8');
const portal = readFileSync(join(root, 'portal', 'src', 'pages', 'Passport.tsx'), 'utf8');
assert.match(android, /presentProof/);
assert.match(android, /from '@\/lib\/ux-flow'/);
assert.match(android, /passport\.comparisonFootnote/);
assert.match(android, /passport\.pageOneFooter/);
assert.match(portal, /presentProof/);
assert.match(portal, /from '@packproof\/ux'/);
assert.match(portal, /passport\.comparisonFootnote/);
assert.match(portal, /passport\.pageOneFooter/);
assert.doesNotMatch(android, /Comparisons report relationships between recorded data/);
assert.doesNotMatch(portal, /Comparisons report relationships between recorded data/);
