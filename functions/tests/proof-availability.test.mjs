import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ApplicationError } = require('../lib/application/v1/errors.js');
const { PortalWorkspaceApplicationService } = require('../lib/application/v1/portal-workspace-service.js');
const {
  assertPassportEligible,
  evaluateStoredPassportEligibility,
  projectProofReady,
} = require('../lib/application/v1/passport-projection.js');

const now = new Date('2026-08-21T15:00:00.000Z');

function transaction(overrides = {}) {
  return {
    id: 'legacyTxProof01',
    organizationId: null,
    integrationId: null,
    merchantReference: null,
    title: 'Sony WH-1000XM6',
    description: 'Headphones',
    category: 'electronics',
    status: 'ACTIVE',
    consumerStatus: 'PACKED',
    amount: { currency: 'USD', minorUnits: 34900 },
    terms: { saleType: 'SHIPPED', shippingResponsibility: 'SELLER', returns: 'AS_AGREED', returnWindowDays: 14, customTerms: '' },
    sellerId: 'seller-1',
    buyerId: 'buyer-1',
    participantIds: ['seller-1', 'buyer-1'],
    confirmedBy: ['seller-1', 'buyer-1'],
    handoffConfirmedBy: [],
    completedBy: [],
    identifiers: [],
    conditionNotes: '',
    lockedAt: now,
    shipment: null,
    delivery: null,
    commerceContextId: 'ctx_intake01',
    sourceType: 'TRANSACTION_INTAKE',
    sourcePlatform: 'eBay',
    externalOrderId: null,
    externalSellerId: null,
    declaredWeightGrams: null,
    sourceTrackingNumber: null,
    sourceTrustLevel: null,
    passportId: null,
    passportDisplayId: null,
    passportIssuedAt: null,
    proofReady: false,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function packing(overrides = {}) {
  return {
    id: 'art_packingvideo01',
    transactionId: 'legacyTxProof01',
    type: 'PACKING_VIDEO',
    role: 'SELLER',
    contentType: 'video/mp4',
    sizeBytes: 2048,
    sha256: 'a'.repeat(64),
    manifestSha256: 'b'.repeat(64),
    evidenceBundleSha256: 'c'.repeat(64),
    manifestAuthenticationScope: 'PACKPROOF_SERVICE',
    returnPassportId: null,
    serverFinalized: true,
    serverVerified: true,
    clientHashMatched: true,
    clientSizeMatched: true,
    contentTypeMatched: true,
    assurance: null,
    carrierTrackingMatchStatus: null,
    scannedTrackingNumber: null,
    shippingTracker: null,
    captureSessionId: null,
    clientCreatedAt: now.toISOString(),
    acquisitionClass: 'PACKPROOF_CAPTURE',
    bundleBindingProfile: 'BUNDLE_V1',
    manifestAuthentication: { type: 'SERVICE_MAC', algorithm: 'HMAC-SHA256', keyId: 'k1', verificationScope: 'PACKPROOF_SERVICE' },
    createdAt: now,
    updatedAt: now,
    finalizedAt: now,
    ...overrides,
  };
}

function commerce(overrides = {}) {
  return {
    id: 'ctx_intake01',
    platform: 'EBAY',
    trustLevel: 'USER_PROVIDED_COMMERCE_ARTIFACT',
    assertingSource: 'EMAIL_RECEIPT',
    externalOrderId: '1284921',
    externalSellerId: null,
    capturedAt: now.toISOString(),
    canonicalPayloadSha256: 'd'.repeat(64),
    title: 'Sony WH-1000XM6',
    sku: null,
    gtin: null,
    upc: null,
    serialNumber: null,
    quantity: 1,
    amount: { currency: 'USD', minorUnits: 34900 },
    variant: null,
    listingReference: null,
    merchantItemId: null,
    declaredCondition: null,
    declaredWeightGrams: null,
    ...overrides,
  };
}

function portalRepo(record, evidence, commerceRecord) {
  return {
    records: new Map([[record.id, record]]),
    evidence: new Map([[record.id, evidence]]),
    commerce: commerceRecord ? new Map([[commerceRecord.id, commerceRecord]]) : new Map(),
    async listForParticipant(actorId) {
      return [...this.records.values()].filter((item) => item.participantIds.includes(actorId));
    },
    async findForParticipant(transactionId, actorId) {
      const item = this.records.get(transactionId);
      return item?.participantIds.includes(actorId) ? item : null;
    },
    async listEvidence(transactionId) { return this.evidence.get(transactionId) ?? []; },
    async listTimeline() { return []; },
    async listReturns() { return []; },
    async findCommerceContext(id) { return this.commerce.get(id) ?? null; },
    async bindPassportIdentity(transactionId, identity) {
      const item = this.records.get(transactionId);
      if (item) {
        if (!item.passportId) {
          item.passportId = identity.passportId;
          item.passportDisplayId = identity.displayId;
          item.passportIssuedAt = identity.issuedAt;
        }
        item.proofReady = true;
      }
      return {
        passportId: item?.passportId ?? identity.passportId,
        displayId: item?.passportDisplayId ?? identity.displayId,
        issuedAt: item?.passportIssuedAt ?? identity.issuedAt,
      };
    },
  };
}

test('projectProofReady matches issuance eligibility and does not infer PACKED', () => {
  const packed = transaction();
  const liveWithoutEvidence = projectProofReady(packed, [], commerce());
  const persistWithoutEvidence = evaluateStoredPassportEligibility(packed, [], commerce()).ok;
  assert.equal(liveWithoutEvidence, false);
  assert.equal(persistWithoutEvidence, liveWithoutEvidence);

  const incomplete = projectProofReady(packed, [packing({ serverFinalized: false, sha256: null, manifestSha256: null })], commerce());
  assert.equal(incomplete, false);

  const quarantined = projectProofReady(packed, [packing({ clientHashMatched: false })], commerce());
  assert.equal(quarantined, false);

  const missingCommerce = projectProofReady(packed, [packing()], null);
  assert.equal(missingCommerce, false);
  assert.equal(evaluateStoredPassportEligibility(packed, [packing()], null).ok, false);

  const ready = projectProofReady(packed, [packing()], commerce());
  assert.equal(ready, true);
  assert.equal(evaluateStoredPassportEligibility(packed, [packing()], commerce()).ok, ready);
  assert.doesNotThrow(() => assertPassportEligible(packed, [packing()], commerce()));
});

test('portal DTO and GET Proof use the same commerce-aware helper', async () => {
  const principal = { type: 'PORTAL_USER', actorId: 'seller-1', appId: 'app-1', channel: 'WEB_PORTAL' };
  const packed = transaction();
  const notReadyRepo = portalRepo(packed, [packing()], null);
  const notReady = new PortalWorkspaceApplicationService(
    notReadyRepo,
    { append: async () => undefined },
    () => 'https://packproof.link',
    () => now,
  );
  const listedIncomplete = await notReady.listTransactions(principal);
  assert.equal(listedIncomplete[0].proofReady, false);
  assert.equal(projectProofReady(packed, [packing()], null), false);
  await assert.rejects(
    () => notReady.getPassport(principal, packed.id),
    (error) => error instanceof ApplicationError && error.code === 'PASSPORT_NOT_READY',
  );
  assert.equal(notReadyRepo.records.get(packed.id).proofReady, false);

  const eligible = transaction();
  const readyRepo = portalRepo(eligible, [packing()], commerce());
  const ready = new PortalWorkspaceApplicationService(
    readyRepo,
    { append: async () => undefined },
    () => 'https://packproof.link',
    () => now,
  );
  const listed = await ready.listTransactions(principal);
  const workspace = await ready.getTransaction(principal, eligible.id);
  assert.equal(listed[0].proofReady, true);
  assert.equal(workspace.proofReady, true);
  assert.equal(projectProofReady(eligible, [packing()], commerce()), listed[0].proofReady);
  const passport = await ready.getPassport(principal, eligible.id);
  assert.equal(passport.object, 'packproof_passport');
  assert.equal(readyRepo.records.get(eligible.id).proofReady, true);
  assert.match(passport.identity.passportId, /^ppt_/);
});
