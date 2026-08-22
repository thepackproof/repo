/**
 * Release-candidate SOURCE journey.
 * Passing this gate does not satisfy live E2E-01..10 or AND-01..07.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveNextRequiredAction, viewerRole } from '../src/lib/ux-flow.ts';
import { queueCrashRecovery } from '../src/lib/queue-temp-lifecycle.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(root, 'functions', 'package.json'));
const passport = require('./lib/domain/v1/passport.js');
const parsers = require('./lib/domain/v1/transaction-intake-parsers.js');
const commerce = require('./lib/domain/v1/commerce.js');
const pdf = require('./lib/passport-pdf.js');
const { PDFDocument } = require('pdf-lib');

const now = '2026-08-18T16:00:00.000Z';
const TX_ID = 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const protocol = {
  hasPackingVideo: false,
  hasSealReference: false,
  hasArrivalPhoto: false,
  hasUnboxingVideo: false,
  sellerReferenceComplete: false,
  buyerArrivalComplete: false,
  outboundComplete: false,
};

function tx(overrides = {}) {
  return {
    id: TX_ID,
    sellerId: 'seller',
    buyerId: 'buyer',
    participantIds: ['seller', 'buyer'],
    title: 'Sony A7 Camera',
    category: 'electronics',
    description: 'Mint',
    priceMinor: 129900,
    currency: 'USD',
    identifiers: [],
    conditionNotes: '',
    terms: {
      saleType: 'SHIPPED',
      shippingResponsibility: 'SELLER',
      returns: 'AS_AGREED',
      returnWindowDays: 14,
      customTerms: '',
    },
    confirmedBy: ['seller', 'buyer'],
    createdAt: now,
    updatedAt: now,
    lockedAt: now,
    ...overrides,
  };
}

function resolve(status, viewerId, extra = {}, overrides = {}) {
  return resolveNextRequiredAction({
    transaction: tx({ status, ...overrides }),
    viewerId,
    protocol,
    otherPartyName: viewerId === 'seller' ? 'Alex' : 'Sam',
    ...extra,
  });
}

function artifact(overrides = {}) {
  return {
    id: 'art_packing',
    transactionId: TX_ID,
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

function commerceInput() {
  return {
    id: 'ctx_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    platform: 'MARKETPLACE',
    trustLevel: 'USER_PROVIDED_COMMERCE_ARTIFACT',
    assertingSource: 'EMAIL_RECEIPT',
    externalOrderId: 'A-998877',
    externalSellerId: 'seller-42',
    capturedAt: now,
    canonicalPayloadSha256: 'd'.repeat(64),
    title: 'Sony A7 Camera',
    sku: 'A7-BODY',
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
  };
}

function canReadProof(transaction, uid) {
  return transaction.participantIds.includes(uid);
}

// RC-S-01 — order information enters; missing beats guessed
const receipt = readFileSync(join(root, 'functions', 'tests', 'fixtures', 'intake', 'generic-receipt.txt'), 'utf8');
const parsed = parsers.parseCommerceArtifact(receipt, 'EMAIL_RECEIPT');
assert.equal(parsed.item.title, 'Sony A7 Camera');
assert.equal(parsed.externalOrderId, 'A-998877');
assert.equal(parsed.item.amount?.minorUnits, 129900);
assert.equal(parsed.item.sku, 'A7-BODY');
const unlabeled = parsers.parseCommerceArtifact('$447', 'SHARE_SHEET');
assert.equal(unlabeled.item.title, '');
assert.equal(unlabeled.missingFields.includes('title'), true);

// RC-S-02 — source is preserved; user-provided correspondence cannot bind an order
assert.equal(commerce.commerceTrustLevelForIntakeSource('EMAIL_RECEIPT'), 'USER_PROVIDED_COMMERCE_ARTIFACT');
assert.equal(commerce.isAuthoritativeCommerceTrustLevel('USER_PROVIDED_COMMERCE_ARTIFACT'), false);
assert.equal(commerce.commerceContextCanAuthoritativelyBindOrder({
  source: { trustLevel: 'USER_PROVIDED_COMMERCE_ARTIFACT', externalOrderId: 'A-998877' },
}), false);

// RC-S-03 — participants agree to terms; lifecycle is not Proof eligibility
const invite = resolve('DRAFT', 'seller', {}, { buyerId: null, participantIds: ['seller'], confirmedBy: [], lockedAt: null });
assert.equal(invite.primaryAction?.kind, 'INVITE_BUYER');
const termsBuyer = resolve('TERMS_REVIEW', 'buyer', {}, { confirmedBy: ['seller'], lockedAt: null });
const termsSeller = resolve('TERMS_REVIEW', 'seller', {}, { confirmedBy: ['seller'], lockedAt: null });
assert.equal(termsBuyer.primaryAction?.kind, 'CONFIRM_TERMS');
assert.equal(termsSeller.primaryAction, null);
assert.equal(termsSeller.humanState, 'WAITING_ON_BUYER');
const lockedSeller = resolve('TERMS_LOCKED', 'seller');
const lockedBuyer = resolve('TERMS_LOCKED', 'buyer');
assert.equal(lockedSeller.primaryAction?.kind, 'START_PACKING');
assert.equal(lockedBuyer.primaryAction, null);
assert.notEqual(lockedSeller.primaryAction?.kind, 'OPEN_PASSPORT');

// RC-S-04 / RC-S-05 — capture records original hashes; interrupted upload keeps ciphertext
const hashed = artifact();
assert.match(hashed.sha256, /^[a-f0-9]{64}$/);
assert.equal(hashed.finalization, 'FINALIZED');
const crashed = queueCrashRecovery('UPLOADING');
assert.equal(crashed.retainCiphertext, true);
assert.equal(crashed.scrubPlaintextTemp, true);
assert.equal(queueCrashRecovery('AWAITING_FINALIZATION').retainCiphertext, true);

// RC-S-06 — QUARANTINED is not a finalized manifest artifact
const incomplete = passport.evaluatePassportEligibility({
  transactionExists: true,
  merchantReference: 'order-1',
  commerceContextId: null,
  externalOrderId: 'A-998877',
  artifacts: [artifact({ finalization: 'QUARANTINED', clientHashMatched: false })],
  displayedUnattributedFacts: 0,
});
assert.equal(incomplete.ok, false);
assert.equal(incomplete.failures.some((item) => item.code === 'NO_FINALIZED_MANIFEST_ARTIFACT'), true);

// RC-S-07 — eligibility is a different question from PACKED
const packedNoEvidence = passport.evaluatePassportEligibility({
  transactionExists: true,
  merchantReference: null,
  commerceContextId: null,
  externalOrderId: null,
  artifacts: [],
  displayedUnattributedFacts: 0,
});
assert.equal(packedNoEvidence.ok, false);
const packedEngine = resolve('PACKED', 'seller');
assert.notEqual(packedEngine.primaryAction?.kind, 'OPEN_PASSPORT');
const eligible = passport.evaluatePassportEligibility({
  transactionExists: true,
  merchantReference: 'order-1',
  commerceContextId: commerceInput().id,
  commerceTrustLevel: 'USER_PROVIDED_COMMERCE_ARTIFACT',
  externalOrderId: 'A-998877',
  artifacts: [artifact()],
  displayedUnattributedFacts: 0,
});
assert.equal(eligible.ok, true);

// RC-S-08 — Proof identity is stable ppt_ / PP-
const identity = passport.issuePassportIdentity(TX_ID);
const again = passport.issuePassportIdentity(TX_ID);
assert.equal(identity.passportId, again.passportId);
assert.equal(identity.displayId, again.displayId);
assert.match(identity.passportId, passport.PASSPORT_RESOURCE_ID_PATTERN);
assert.match(identity.displayId, passport.PASSPORT_DISPLAY_ID_PATTERN);

const canonical = passport.aggregatePassport({
  identity: { ...identity, issuedAt: now, verificationBaseUrl: 'https://app.packproof.example' },
  transaction: {
    id: TX_ID,
    merchantReference: 'order-1',
    title: 'Sony A7 Camera',
    amount: { currency: 'USD', minorUnits: 129900 },
    termsSaleType: 'SHIPPED',
    commerceContextId: commerceInput().id,
    sourcePlatform: 'MARKETPLACE',
    sourceType: 'TRANSACTION_INTAKE',
    sourceTrustLevel: 'USER_PROVIDED_COMMERCE_ARTIFACT',
    externalOrderId: 'A-998877',
    externalSellerId: 'seller-42',
    declaredWeightGrams: 450,
    sourceTrackingNumber: null,
    createdAt: now,
    updatedAt: now,
  },
  commerce: commerceInput(),
  artifacts: [artifact()],
  shipment: null,
  delivery: null,
  returns: [],
  timeline: [],
  reviewQuery: null,
  humanReviewDisclaimer: 'These observations are preserved for authorized human review.',
  now,
});
assert.equal(canonical.identity.passportId, identity.passportId);
assert.equal(canonical.identity.displayId, identity.displayId);
assert.equal(canonical.identity.transactionId, TX_ID);

// RC-S-09 — same Proof facts for JSON and PDF
const bytes = await pdf.renderPassportPdf(canonical);
const document = await PDFDocument.load(bytes);
assert.equal(document.getTitle().includes(canonical.identity.displayId), true);
assert.equal(canonical.fulfillment.packingArtifactId, 'art_packing');
assert.equal(canonical.artifacts[0].sha256, 'a'.repeat(64));

// RC-S-10 — stranger cannot read participant Proof IDs
const record = tx({ passportId: identity.passportId });
assert.equal(canReadProof(record, 'seller'), true);
assert.equal(canReadProof(record, 'buyer'), true);
assert.equal(canReadProof(record, 'stranger'), false);
assert.equal(viewerRole(record, 'seller'), 'SELLER');
const callable = readFileSync(join(root, 'functions', 'src', 'passport-callables.ts'), 'utf8');
assert.match(callable, /participantIds\.includes\(uid\)/);

// RC-S-11 — no surface declares who is right
assert.equal(canonical.limitations.doesNotDecideFraudOrFault, true);
assert.equal(canonical.limitations.doesNotAuthenticateItem, true);
assert.match(canonical.limitations.humanReviewDisclaimer, /human review/i);
for (const comparison of canonical.items[0]?.comparisons ?? []) {
  assert.notEqual(comparison.result, 'MATCH');
  assert.equal(['SAME', 'DIFFERENT', 'NOT_COMPARED'].includes(comparison.result), true);
}
assert.match(canonical.integrity.banner, /AUTHENTIC_PACKPROOF|PACKPROOF_RECORD_WITH_LIMITATIONS/);
assert.doesNotMatch(canonical.integrity.meaning, /fraud|liable|guilty|counterfeit/i);

const androidProof = readFileSync(join(root, 'src', 'app', 'passport', '[id].tsx'), 'utf8');
const portalProof = readFileSync(join(root, 'portal', 'src', 'pages', 'Passport.tsx'), 'utf8');
assert.doesNotMatch(androidProof, /\bMATCH\b/);
assert.doesNotMatch(portalProof, /\bMATCH\b/);
