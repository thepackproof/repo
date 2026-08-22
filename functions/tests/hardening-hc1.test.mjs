import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const passport = require('../lib/domain/v1/passport.js');
const commerce = require('../lib/domain/v1/commerce.js');
const digest = require('../lib/domain/v1/digest-assurance.js');
const { evaluateProofAvailabilityFromFacts, ProofApplicationService } = require('../lib/application/v1/proof-application-service.js');
const { hydrateWorkspaceSlices, protocolFromEvidence } = require('../lib/application/v1/transaction-workspace.js');
const { sellerEnteredIntakeFields, TransactionIntakeApplicationService } = require('../lib/application/v1/transaction-intake-service.js');
const { PortalWorkspaceApplicationService } = require('../lib/application/v1/portal-workspace-service.js');

const now = new Date('2026-08-22T06:00:00.000Z');

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function artifact(overrides = {}) {
  return {
    id: 'art_packing',
    transactionId: 'txn_hardeningaaaaaaaaaaaaaaaaaaaaaa',
    type: 'PACKING_VIDEO',
    finalization: 'FINALIZED',
    contentType: 'video/mp4',
    sizeBytes: 2048,
    sha256: 'a'.repeat(64),
    manifestSha256: 'b'.repeat(64),
    evidenceBundleSha256: 'c'.repeat(64),
    captureSessionId: 'cap_1',
    evidenceSessionId: null,
    clientCreatedAt: now.toISOString(),
    finalizedAt: now,
    createdAt: now,
    scannedTrackingNumber: null,
    shippingTracker: null,
    carrierTrackingMatchStatus: null,
    acquisitionClass: null,
    appDeviceContextStatus: 'ONLINE_APP_CHECK_ONLY',
    returnPassportId: null,
    serverFinalized: true,
    serverVerified: true,
    clientHashMatched: true,
    bundleBindingProfile: 'PACKPROOF_EVIDENCE_BUNDLE_V2',
    manifestAuthentication: { type: 'SERVICE_MAC', algorithm: 'HMAC-SHA256', keyId: 'packproof-manifest-v1', verificationScope: 'PACKPROOF_SERVICE_ONLY' },
    ...overrides,
  };
}

function transaction(overrides = {}) {
  return {
    id: 'txn_hardeningaaaaaaaaaaaaaaaaaaaaaa',
    organizationId: null,
    merchantReference: null,
    title: 'Sony A7 IV',
    description: 'Camera',
    category: 'electronics',
    status: 'ACTIVE',
    consumerStatus: 'PACKED',
    amount: { currency: 'USD', minorUnits: 129900 },
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
    commerceContextId: null,
    sourceType: 'TRANSACTION_INTAKE',
    sourcePlatform: 'eBay',
    externalOrderId: 'A-998877',
    externalSellerId: null,
    declaredWeightGrams: null,
    sourceTrackingNumber: null,
    sourceTrustLevel: 'USER_PROVIDED_COMMERCE_ARTIFACT',
    passportId: null,
    passportDisplayId: null,
    passportIssuedAt: null,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function commerceContext(trustLevel = 'MERCHANT_SERVER_ATTESTED') {
  return {
    id: 'ctx_hardeningaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    platform: 'MARKETPLACE',
    trustLevel,
    assertingSource: trustLevel === 'MERCHANT_SERVER_ATTESTED' ? 'MERCHANT_API' : 'EMAIL_RECEIPT',
    externalOrderId: 'A-998877',
    externalSellerId: null,
    capturedAt: now.toISOString(),
    canonicalPayloadSha256: 'd'.repeat(64),
    title: 'Sony A7 IV',
    sku: null,
    gtin: null,
    upc: null,
    serialNumber: null,
    quantity: 1,
    amount: { currency: 'USD', minorUnits: 129900 },
    variant: null,
    listingReference: null,
  };
}

test('HD-04 an order number never becomes authoritative by itself', () => {
  const sources = [
    ['MERCHANT_SERVER_ATTESTED', true],
    ['PLATFORM_API_ATTESTED', true],
    ['USER_PROVIDED_COMMERCE_ARTIFACT', false],
    ['PAGE_DECLARED', false],
    ['SELLER_ENTERED', false],
  ];
  for (const [trust, expected] of sources) {
    assert.equal(commerce.canAuthoritativelyBindOrder({ trustLevel: trust }), expected, trust);
    assert.equal(passport.canAuthoritativelyBindOrder(trust), expected, trust);
    assert.equal(passport.passportHasAuthoritativeOrderSource({
      merchantReference: null,
      commerceContextId: null,
      commerceTrustLevel: trust,
      sourceTrustLevel: trust,
      externalOrderId: 'ORDER-1',
    }), false, `${trust} + order id is not enough without an attested context`);
  }
  assert.equal(passport.passportHasAuthoritativeOrderSource({
    merchantReference: null,
    commerceContextId: 'ctx_1',
    commerceTrustLevel: 'MERCHANT_SERVER_ATTESTED',
    sourceTrustLevel: 'MERCHANT_SERVER_ATTESTED',
    externalOrderId: 'ORDER-1',
  }), true);
  assert.equal(passport.passportHasIdentifiedCommerceSource({
    merchantReference: null,
    commerceContextId: null,
    sourceTrustLevel: 'USER_PROVIDED_COMMERCE_ARTIFACT',
    externalOrderId: 'ORDER-1',
  }), false);
});

test('Proof availability is independent of PACKED / SHIPPED / COMPLETED', () => {
  const packedEmpty = evaluateProofAvailabilityFromFacts({
    transaction: transaction({ consumerStatus: 'PACKED', commerceContextId: null, merchantReference: null }),
    artifacts: [],
    commerce: null,
  });
  assert.equal(packedEmpty.availability, 'NOT_ELIGIBLE');

  const packedEligible = evaluateProofAvailabilityFromFacts({
    transaction: transaction({
      consumerStatus: 'PACKED',
      commerceContextId: commerceContext().id,
      merchantReference: 'order-1',
      sourceTrustLevel: 'MERCHANT_SERVER_ATTESTED',
    }),
    artifacts: [artifact()],
    commerce: commerceContext(),
  });
  assert.equal(packedEligible.availability, 'ELIGIBLE_NOT_ISSUED');

  const packedQuarantined = evaluateProofAvailabilityFromFacts({
    transaction: transaction({
      consumerStatus: 'PACKED',
      commerceContextId: commerceContext().id,
      sourceTrustLevel: 'MERCHANT_SERVER_ATTESTED',
    }),
    artifacts: [artifact({ finalization: 'QUARANTINED', clientHashMatched: false })],
    commerce: commerceContext(),
  });
  assert.equal(packedQuarantined.availability, 'NOT_ELIGIBLE');

  const completedEmpty = evaluateProofAvailabilityFromFacts({
    transaction: transaction({ consumerStatus: 'COMPLETED', commerceContextId: null, merchantReference: null }),
    artifacts: [],
    commerce: null,
  });
  assert.equal(completedEmpty.availability, 'NOT_ELIGIBLE');

  const shippedBound = evaluateProofAvailabilityFromFacts({
    transaction: transaction({
      consumerStatus: 'SHIPPED',
      commerceContextId: commerceContext().id,
      sourceTrustLevel: 'MERCHANT_SERVER_ATTESTED',
      passportId: 'ppt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      passportDisplayId: 'PP-AAAA-AAAA-AAAA',
    }),
    artifacts: [artifact()],
    commerce: commerceContext(),
  });
  assert.equal(shippedBound.availability, 'AVAILABLE');
});

test('workspace slices use finalized evidence, not empty protocol defaults', () => {
  const record = transaction({ consumerStatus: 'PACKED', commerceContextId: commerceContext().id });
  const empty = hydrateWorkspaceSlices(transaction({ consumerStatus: 'PACKED', commerceContextId: null, merchantReference: null }), [], [], null);
  assert.equal(empty.protocol.hasPackingVideo, false);
  assert.equal(empty.proof.availability, 'NOT_ELIGIBLE');

  const packed = hydrateWorkspaceSlices(record, [artifact()], [], commerceContext());
  assert.equal(packed.protocol.hasPackingVideo, true);
  assert.equal(packed.protocol.hasSealReference, false);
  assert.equal(protocolFromEvidence([artifact(), artifact({ id: 'art_seal', type: 'SHIPPING_LABEL' })]).sellerReferenceComplete, true);
});

test('Proof application service is the only bind path and GET bind is explicit', async () => {
  const facts = {
    transaction: transaction({
      commerceContextId: commerceContext().id,
      sourceTrustLevel: 'MERCHANT_SERVER_ATTESTED',
      merchantReference: 'order-1',
    }),
    artifacts: [artifact()],
    timeline: [],
    returns: [],
    commerce: commerceContext(),
  };
  let binds = 0;
  const service = new ProofApplicationService({
    async bindPassportIdentity(_id, identity) {
      binds += 1;
      return identity;
    },
  }, () => 'https://packproof.link', () => now);
  await service.getCurrentProof(facts);
  assert.equal(binds, 1);
  await assert.rejects(
    () => service.getCurrentProof(facts, null, { bindIdentity: false }),
    (error) => error.code === 'PROOF_IDENTITY_NOT_BOUND',
  );
});

test('seller overlays keep SELLER_ENTERED provenance', async () => {
  const parsed = {
    title: '',
    description: '',
    category: null,
    brand: null,
    model: null,
    sku: null,
    gtin: null,
    upc: null,
    mpn: null,
    serialNumber: null,
    selectedOptions: [],
    identifiers: [],
    quantity: 1,
    amount: null,
    imageReferences: [],
  };
  const fields = sellerEnteredIntakeFields(parsed, { ...parsed, title: 'Sony A7 IV' }, { title: 'Sony A7 IV' }, null, null);
  assert.deepEqual(fields, ['item.title']);

  const records = [];
  const service = new TransactionIntakeApplicationService({
    async createOrReplay(mutation) {
      records.push(mutation);
      return { created: true };
    },
    async listPendingForActor() { return []; },
    async hasActiveTransactionForSeller() { return false; },
    async claim() { throw new Error('not used'); },
  }, () => now);
  const artifactText = [
    'From: "eBay" <ebay@ebay.com>',
    'Subject: You sold an item',
    '',
    'Congratulations! You sold an item.',
    'Sold for: US $10.00',
    'Order number: 12-34567-89012',
  ].join('\n');
  const result = await service.ingestArtifact({
    actorId: 'seller-1',
    operationKey: 'intake-seller-overlay-1',
    requestId: 'request-intake-seller-1',
    intakeSourceType: 'EMAIL_RECEIPT',
    originalArtifactSha256: sha256(artifactText),
    artifactText,
    confirmed: { title: 'Sony A7 IV' },
  });
  assert.equal(result.pending.title, 'Sony A7 IV');
  assert.equal(records[0].commerceContext.fieldProvenance['item.title'].source, 'SELLER_ENTERED');
  assert.equal(Boolean(records[0].commerceContext.fieldProvenance['item.title'].supersedesAssertionId), true);
});

test('digest assurance distinguishes who computed the hash', () => {
  const client = digest.digestAssurance({ value: 'a'.repeat(64), computation: 'CLIENT_COMPUTED', boundArtifactAvailable: false });
  const server = digest.digestAssurance({ value: 'a'.repeat(64), computation: 'SERVER_RECOMPUTED', boundArtifactAvailable: true });
  assert.equal(client.computation, 'CLIENT_COMPUTED');
  assert.equal(server.computation, 'SERVER_RECOMPUTED');
  assert.equal(digest.compareClientAndServerDigests({ client: client.value, server: server.value }), 'MATCHED');
  assert.equal(digest.compareClientAndServerDigests({ client: 'a'.repeat(64), server: 'b'.repeat(64) }), 'MISMATCH');
});

test('portal list and get share the same hydrated proof and protocol', async () => {
  const record = transaction({
    consumerStatus: 'SHIPPED',
    commerceContextId: commerceContext().id,
    sourceTrustLevel: 'MERCHANT_SERVER_ATTESTED',
    passportId: 'ppt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    passportDisplayId: 'PP-AAAA-AAAA-AAAA',
  });
  const repository = {
    async listForParticipant() { return [record]; },
    async findForParticipant() { return record; },
    async listEvidence() { return [artifact(), artifact({ id: 'art_seal', type: 'SHIPPING_LABEL' })]; },
    async listTimeline() { return []; },
    async listReturns() { return []; },
    async findCommerceContext() { return commerceContext(); },
    async bindPassportIdentity(_id, identity) { return identity; },
  };
  const service = new PortalWorkspaceApplicationService(repository, { append: async () => undefined }, () => 'https://packproof.link', () => now);
  const listed = await service.listHydratedForActor('seller-1');
  const detail = await service.getHydratedForActor('seller-1', record.id);
  assert.deepEqual(listed[0].protocol, detail.protocol);
  assert.deepEqual(listed[0].proof, detail.proof);
  assert.equal(listed[0].proof.availability, 'AVAILABLE');
  assert.equal(listed[0].protocol.sellerReferenceComplete, true);
});

test('simultaneous first Proof requests converge on one identity', async () => {
  const facts = {
    transaction: transaction({
      commerceContextId: commerceContext().id,
      sourceTrustLevel: 'MERCHANT_SERVER_ATTESTED',
      merchantReference: 'order-1',
    }),
    artifacts: [artifact()],
    timeline: [],
    returns: [],
    commerce: commerceContext(),
  };
  let stored = null;
  let binds = 0;
  let chain = Promise.resolve();
  const service = new ProofApplicationService({
    async bindPassportIdentity(_id, identity) {
      const previous = chain;
      let release;
      chain = new Promise((resolve) => {
        release = resolve;
      });
      await previous;
      try {
        binds += 1;
        await new Promise((resolve) => setTimeout(resolve, 5));
        if (stored) return stored;
        stored = {
          passportId: identity.passportId,
          displayId: identity.displayId,
          issuedAt: identity.issuedAt,
        };
        return stored;
      } finally {
        release();
      }
    },
  }, () => 'https://packproof.link', () => now);

  const proofs = await Promise.all([
    service.getCurrentProof(facts),
    service.getCurrentProof(facts),
    service.getCurrentProof(facts),
  ]);
  const ids = new Set(proofs.map((proof) => proof.identity.passportId));
  assert.equal(ids.size, 1);
  assert.equal(stored.passportId, proofs[0].identity.passportId);
  assert.equal(binds, 3);
});

test('corrupted or quarantined evidence never makes Proof AVAILABLE', () => {
  const eligibleTxn = transaction({
    commerceContextId: commerceContext().id,
    sourceTrustLevel: 'MERCHANT_SERVER_ATTESTED',
    merchantReference: 'order-1',
  });
  const cases = [
    artifact({ finalization: 'QUARANTINED', clientHashMatched: false, serverFinalized: true }),
    artifact({ finalization: 'FAILED', serverFinalized: false, serverVerified: false, sha256: null, manifestSha256: null }),
    artifact({ finalization: 'UPLOADED', serverFinalized: false, serverVerified: false, manifestSha256: null }),
    artifact({ finalization: 'FINALIZED', clientHashMatched: false }),
  ];
  for (const corrupted of cases) {
    const result = evaluateProofAvailabilityFromFacts({
      transaction: eligibleTxn,
      artifacts: [corrupted],
      commerce: commerceContext(),
    });
    assert.notEqual(result.availability, 'AVAILABLE', corrupted.finalization);
    assert.equal(result.availability, 'NOT_ELIGIBLE', corrupted.finalization);
  }
});
