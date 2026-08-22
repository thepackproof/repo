import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { resolveNextRequiredAction, toUxFlowInput } from '../src/lib/ux-flow.ts';

const require = createRequire(import.meta.url);
const { ApplicationError } = require('../functions/lib/application/v1/errors.js');
const {
  assertPassportEligible,
  evaluateStoredPassportEligibility,
  passportArtifactInput,
  passportTransactionInput,
  projectProofReady,
} = require('../functions/lib/application/v1/passport-projection.js');
const { PortalWorkspaceApplicationService } = require('../functions/lib/application/v1/portal-workspace-service.js');
const {
  countDisplayedUnattributedCommercialFacts,
  evaluatePassportEligibility,
} = require('../functions/lib/domain/v1/passport.js');

const now = new Date('2026-08-21T15:00:00.000Z');
const principal = { type: 'PORTAL_USER', actorId: 'seller-1', appId: 'app-1', channel: 'WEB_PORTAL' };

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
    captureSessionId: 'cap_1',
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

function toPortalUxInput(item, viewerId) {
  return {
    transaction: {
      id: item.id,
      sellerId: item.sellerId ?? '',
      buyerId: item.buyerId,
      participantIds: item.participantIds,
      status: item.status,
      title: item.title,
      category: item.category,
      description: item.description,
      priceMinor: item.priceMinor ?? 0,
      currency: item.currency ?? 'USD',
      identifiers: item.identifiers,
      conditionNotes: item.conditionNotes,
      terms: item.terms ?? {
        saleType: 'SHIPPED',
        shippingResponsibility: 'SELLER',
        returns: 'AS_AGREED',
        returnWindowDays: 0,
        customTerms: '',
      },
      confirmedBy: item.confirmedBy,
      handoffConfirmedBy: item.handoffConfirmedBy,
      completedBy: item.completedBy,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      lockedAt: item.lockedAt,
      passportId: item.passportId,
      passportDisplayId: item.passportDisplayId,
    },
    viewerId,
    protocol: item.protocol,
    proofReady: item.proofReady === true,
  };
}

function toMobileTransaction(record) {
  return {
    id: record.id,
    sellerId: record.sellerId ?? '',
    buyerId: record.buyerId,
    participantIds: record.participantIds,
    status: record.consumerStatus,
    title: record.title,
    category: record.category ?? '',
    description: record.description,
    priceMinor: record.amount?.minorUnits ?? 0,
    currency: record.amount?.currency ?? 'USD',
    identifiers: record.identifiers,
    conditionNotes: record.conditionNotes,
    terms: record.terms,
    confirmedBy: record.confirmedBy,
    handoffConfirmedBy: record.handoffConfirmedBy,
    completedBy: record.completedBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lockedAt: record.lockedAt?.toISOString() ?? null,
    passportId: record.passportId,
    passportDisplayId: record.passportDisplayId,
    proofReady: record.proofReady,
  };
}

function offersViewProof(next) {
  return next.proofReady === true
    || next.primaryAction?.kind === 'OPEN_PASSPORT'
    || next.secondaryAction?.kind === 'OPEN_PASSPORT';
}

const fixtures = [
  {
    name: 'DRAFT / none / none → incomplete',
    record: transaction({ consumerStatus: 'DRAFT', commerceContextId: null, sourceType: null, sourcePlatform: null, proofReady: false }),
    evidence: [],
    commerceRecord: null,
    expectedReady: false,
  },
  {
    name: 'TERMS_LOCKED / none / valid commerce → incomplete',
    record: transaction({ consumerStatus: 'TERMS_LOCKED', proofReady: false }),
    evidence: [],
    commerceRecord: commerce(),
    expectedReady: false,
  },
  {
    name: 'PACKED / video incomplete / valid commerce → incomplete',
    record: transaction({ proofReady: false }),
    evidence: [packing({ serverFinalized: false, serverVerified: false, sha256: null, manifestSha256: null, finalizedAt: null })],
    commerceRecord: commerce(),
    expectedReady: false,
  },
  {
    name: 'PACKED / finalized packing / valid commerce → ready',
    record: transaction({ proofReady: true }),
    evidence: [packing()],
    commerceRecord: commerce(),
    expectedReady: true,
  },
  {
    name: 'SHIPPED / integrity mismatch / valid commerce → quarantined',
    record: transaction({ consumerStatus: 'SHIPPED', proofReady: false }),
    evidence: [packing({ clientHashMatched: false })],
    commerceRecord: commerce(),
    expectedReady: false,
  },
  {
    name: 'COMPLETED / valid evidence / valid commerce → ready',
    record: transaction({ consumerStatus: 'COMPLETED', completedBy: ['seller-1', 'buyer-1'], proofReady: true }),
    evidence: [packing()],
    commerceRecord: commerce(),
    expectedReady: true,
  },
  {
    name: 'COMPLETED / missing required evidence / incomplete commerce → not ready',
    record: transaction({
      consumerStatus: 'COMPLETED',
      completedBy: ['seller-1', 'buyer-1'],
      commerceContextId: null,
      sourcePlatform: null,
      sourceType: null,
      proofReady: false,
    }),
    evidence: [],
    commerceRecord: null,
    expectedReady: false,
  },
  {
    name: 'evidence not finalized',
    record: transaction({ proofReady: false }),
    evidence: [packing({ serverFinalized: false, serverVerified: false, sha256: 'a'.repeat(64), manifestSha256: null, finalizedAt: null })],
    commerceRecord: commerce(),
    expectedReady: false,
  },
  {
    name: 'evidence quarantined',
    record: transaction({ proofReady: false }),
    evidence: [packing({ clientHashMatched: false, clientSizeMatched: false })],
    commerceRecord: commerce(),
    expectedReady: false,
  },
  {
    name: 'client hash mismatch',
    record: transaction({ proofReady: false }),
    evidence: [packing({ clientHashMatched: false })],
    commerceRecord: commerce(),
    expectedReady: false,
  },
  {
    name: 'missing commerce context',
    record: transaction({ commerceContextId: 'ctx_intake01', proofReady: false }),
    evidence: [packing()],
    commerceRecord: null,
    expectedReady: false,
  },
  {
    name: 'missing external order information',
    record: transaction({
      commerceContextId: null,
      merchantReference: null,
      externalOrderId: null,
      sourcePlatform: null,
      sourceType: null,
      proofReady: false,
    }),
    evidence: [packing()],
    commerceRecord: null,
    expectedReady: false,
  },
  {
    name: 'USER_PROVIDED commerce on context, no transaction order id → ready',
    record: transaction({ merchantReference: null, externalOrderId: null, proofReady: true }),
    evidence: [packing()],
    commerceRecord: commerce(),
    expectedReady: true,
  },
  {
    name: 'PAGE_DECLARED commerce is not a Proof source',
    record: transaction({ sourceTrustLevel: 'PAGE_DECLARED', sourceType: 'PACKPROOF_BUTTON', proofReady: false }),
    evidence: [packing()],
    commerceRecord: commerce({ trustLevel: 'PAGE_DECLARED', assertingSource: 'MERCHANT_PAGE_STRUCTURED_DATA' }),
    expectedReady: false,
  },
  {
    name: 'return evidence only still satisfies the finalized-artifact rule',
    record: transaction({ proofReady: true }),
    evidence: [packing({
      id: 'art_returnpacking01',
      type: 'RETURN_PACKING_VIDEO',
      returnPassportId: 'ret_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    })],
    commerceRecord: commerce(),
    expectedReady: true,
  },
  {
    name: 'incomplete capture session',
    record: transaction({ consumerStatus: 'TERMS_LOCKED', proofReady: false }),
    evidence: [packing({
      serverFinalized: false,
      serverVerified: false,
      sha256: null,
      manifestSha256: null,
      evidenceBundleSha256: null,
      captureSessionId: 'cap_incomplete',
      finalizedAt: null,
    })],
    commerceRecord: commerce(),
    expectedReady: false,
  },
  {
    name: 'user leaving during processing does not show View Proof',
    record: transaction({ consumerStatus: 'TERMS_LOCKED', proofReady: false }),
    evidence: [],
    commerceRecord: commerce(),
    expectedReady: false,
    engineExtras: { evidenceProcessing: { phase: 'SECURING' } },
    expectedHumanState: 'EVIDENCE_PROCESSING',
  },
  {
    name: 'Proof issued before later transaction progression',
    record: transaction({
      consumerStatus: 'SHIPPED',
      passportId: 'ppt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      passportDisplayId: 'PP-AAAA-AAAA-AAAA',
      passportIssuedAt: now,
      proofReady: true,
    }),
    evidence: [packing()],
    commerceRecord: commerce(),
    expectedReady: true,
  },
  {
    name: 'legacy passportId does not make the engine infer readiness',
    record: transaction({
      passportId: 'ppt_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      passportDisplayId: 'PP-BBBB-BBBB-BBBB',
      passportIssuedAt: now,
      proofReady: false,
    }),
    evidence: [packing()],
    commerceRecord: commerce(),
    expectedReady: true,
    persistAgreesWithLive: false,
  },
  {
    name: 'merchantReference without commerce context → ready',
    record: transaction({
      commerceContextId: null,
      merchantReference: '1284921',
      sourceType: 'MERCHANT_API',
      sourcePlatform: null,
      proofReady: true,
    }),
    evidence: [packing()],
    commerceRecord: null,
    expectedReady: true,
  },
];

async function evaluateFixture(fixture) {
  const record = { ...fixture.record };
  const evidence = fixture.evidence;
  const commerceRecord = fixture.commerceRecord;
  const stored = evaluateStoredPassportEligibility(record, evidence, commerceRecord);
  const domain = evaluatePassportEligibility({
    transactionExists: true,
    merchantReference: record.merchantReference,
    commerceContextId: record.commerceContextId,
    commerceTrustLevel: commerceRecord?.trustLevel ?? null,
    sourceTrustLevel: passportTransactionInput(record).sourceTrustLevel ?? null,
    externalOrderId: record.externalOrderId,
    artifacts: evidence.map(passportArtifactInput),
    displayedUnattributedFacts: countDisplayedUnattributedCommercialFacts(passportTransactionInput(record), commerceRecord),
  });
  const projected = projectProofReady(record, evidence, commerceRecord);
  let getSucceeded = false;
  try {
    assertPassportEligible(record, evidence, commerceRecord);
    getSucceeded = true;
  } catch (error) {
    assert.equal(error instanceof ApplicationError && error.code === 'PASSPORT_NOT_READY', true, fixture.name);
  }

  const service = new PortalWorkspaceApplicationService(
    portalRepo({ ...record }, evidence, commerceRecord),
    { append: async () => undefined },
    () => 'https://packproof.link',
    () => now,
  );
  const listed = await service.listTransactions(principal);
  const workspace = await service.getTransaction(principal, record.id);
  let portalGetSucceeded = false;
  try {
    await service.getPassport(principal, record.id);
    portalGetSucceeded = true;
  } catch (error) {
    assert.equal(error instanceof ApplicationError && error.code === 'PASSPORT_NOT_READY', true, fixture.name);
  }

  const portalNext = resolveNextRequiredAction(toPortalUxInput(workspace, principal.actorId));
  const mobileNext = resolveNextRequiredAction(toUxFlowInput(
    toMobileTransaction(record),
    principal.actorId,
    fixture.engineExtras ?? {},
  ));

  return {
    stored,
    domain,
    projected,
    getSucceeded,
    listedReady: listed[0].proofReady,
    workspaceReady: workspace.proofReady,
    portalGetSucceeded,
    portalNext,
    mobileNext,
  };
}

test('Proof contract table: evaluator = projection = portal DTO = GET Proof', async () => {
  for (const fixture of fixtures) {
    const result = await evaluateFixture(fixture);
    assert.equal(result.domain.ok, fixture.expectedReady, `${fixture.name}: domain`);
    assert.equal(result.stored.ok, fixture.expectedReady, `${fixture.name}: stored eligibility`);
    assert.equal(result.projected, fixture.expectedReady, `${fixture.name}: projectProofReady`);
    assert.equal(result.getSucceeded, fixture.expectedReady, `${fixture.name}: assertPassportEligible`);
    assert.equal(result.listedReady, fixture.expectedReady, `${fixture.name}: portal list DTO`);
    assert.equal(result.workspaceReady, fixture.expectedReady, `${fixture.name}: portal GET transaction`);
    assert.equal(result.portalGetSucceeded, fixture.expectedReady, `${fixture.name}: portal GET Proof`);
    assert.deepEqual(result.domain.ok ? [] : result.domain.failures.map((item) => item.code).sort(), result.stored.ok ? [] : result.stored.failures.map((item) => item.code).sort(), `${fixture.name}: domain vs stored codes`);
  }
});

test('Proof contract table: if any CTA says View Proof, GET Proof succeeds', async () => {
  for (const fixture of fixtures) {
    const result = await evaluateFixture(fixture);
    const portalCta = offersViewProof(result.portalNext);
    const mobileCta = offersViewProof(result.mobileNext);
    assert.equal(result.portalNext.proofReady, result.portalNext.passportReady, `${fixture.name}: proofReady alias`);
    assert.equal(result.mobileNext.proofReady, result.mobileNext.passportReady, `${fixture.name}: mobile alias`);
    assert.equal(portalCta, result.listedReady, `${fixture.name}: portal CTA follows live DTO`);
    if (fixture.persistAgreesWithLive === false) {
      assert.equal(result.projected, true, `${fixture.name}: live eligibility is ready`);
      assert.equal(mobileCta, false, `${fixture.name}: Android does not infer from passportId`);
      assert.equal(portalCta, true, `${fixture.name}: portal live DTO still offers View Proof`);
      assert.equal(result.getSucceeded, true, `${fixture.name}: GET Proof succeeds`);
      continue;
    }
    assert.equal(mobileCta, fixture.expectedReady, `${fixture.name}: mobile CTA`);
    assert.equal(portalCta, fixture.expectedReady, `${fixture.name}: portal CTA`);
    if (portalCta || mobileCta) {
      assert.equal(result.getSucceeded, true, `${fixture.name}: View Proof requires GET success`);
      assert.equal(result.portalGetSucceeded, true, `${fixture.name}: portal GET Proof`);
    }
    if (fixture.expectedHumanState) {
      assert.equal(result.mobileNext.humanState, fixture.expectedHumanState, `${fixture.name}: human state`);
      assert.equal(mobileCta, false, `${fixture.name}: processing hides View Proof`);
    }
  }
});
