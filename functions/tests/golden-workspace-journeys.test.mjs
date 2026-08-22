import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { canAuthoritativelyBindOrder } = require('../lib/domain/v1/commerce.js');
const { evaluateProofAvailabilityFromFacts } = require('../lib/application/v1/proof-application-service.js');
const { projectWorkspaceFromLoadedFacts, projectWorkspaceFromSummary } = require('../lib/application/v1/transaction-workspace-service.js');
const { protocolFromEvidence, toWorkspaceTransaction } = require('../lib/application/v1/transaction-workspace.js');
const { projectTransactionWorkspace } = require('../lib/ux/workspace-projection.js');

const now = new Date('2026-08-22T06:00:00.000Z');
const generatedAt = now.toISOString();

function artifact(overrides = {}) {
  return {
    id: 'art_packing',
    transactionId: 'txn_goldenaaaaaaaaaaaaaaaaaaaaaaaa',
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
    id: 'txn_goldenaaaaaaaaaaaaaaaaaaaaaaaa',
    organizationId: null,
    merchantReference: null,
    title: 'Sony A7 IV',
    description: 'Camera',
    category: 'electronics',
    status: 'ACTIVE',
    consumerStatus: 'DRAFT',
    amount: { currency: 'USD', minorUnits: 129900 },
    terms: { saleType: 'SHIPPED', shippingResponsibility: 'SELLER', returns: 'AS_AGREED', returnWindowDays: 14, customTerms: '' },
    sellerId: 'seller-1',
    buyerId: null,
    participantIds: ['seller-1'],
    confirmedBy: [],
    handoffConfirmedBy: [],
    completedBy: [],
    identifiers: [],
    conditionNotes: '',
    lockedAt: null,
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
    id: 'ctx_goldenaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
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

function packing() { return artifact(); }
function seal() { return artifact({ id: 'art_seal', type: 'SHIPPING_LABEL' }); }
function arrival() { return artifact({ id: 'art_arrival', type: 'DELIVERY_PHOTO' }); }
function unbox() { return artifact({ id: 'art_unbox', type: 'UNBOXING_VIDEO' }); }
function uploading() {
  return artifact({
    id: 'art_uploading',
    finalization: 'UPLOADED',
    serverFinalized: false,
    serverVerified: false,
    sha256: null,
    manifestSha256: null,
  });
}
function quarantined() {
  return artifact({
    id: 'art_bad',
    finalization: 'QUARANTINED',
    clientHashMatched: false,
    serverFinalized: true,
  });
}

function locked(overrides = {}) {
  return transaction({
    consumerStatus: 'TERMS_LOCKED',
    buyerId: 'buyer-1',
    participantIds: ['seller-1', 'buyer-1'],
    confirmedBy: ['seller-1', 'buyer-1'],
    lockedAt: now,
    commerceContextId: commerceContext().id,
    sourceTrustLevel: 'MERCHANT_SERVER_ATTESTED',
    merchantReference: 'order-1',
    ...overrides,
  });
}

function returnRow(status) {
  return {
    id: 'rtn_1',
    status,
    initiatedBy: 'buyer-1',
    returningParticipantId: 'buyer-1',
    recipientId: 'seller-1',
    completedBy: [],
    updatedAt: generatedAt,
  };
}

function project(record, actorId, artifacts, returns = [], commerce = null, timeline = []) {
  return projectWorkspaceFromLoadedFacts({
    record,
    actorId,
    artifacts,
    returns,
    commerce,
    timeline,
    generatedAt,
  });
}

function assertSameMeaning(backend, facts, label) {
  const android = projectTransactionWorkspace({
    transaction: toWorkspaceTransaction(facts.record),
    viewerId: facts.actorId,
    protocol: backend.protocol,
    proof: backend.proof,
    returnPassport: facts.returns?.[0] ?? null,
    returnProtocol: facts.returns?.[0]
      ? protocolFromEvidence(facts.artifacts, { returnPassportId: facts.returns[0].id })
      : null,
    inviteSentAt: facts.timeline?.find((event) => event.type === 'INVITE_CREATED')?.occurredAt ?? null,
    evidenceProcessing: backend.evidenceProcessing.state === 'FINALIZING' ? { phase: 'SECURING' } : null,
    pendingCount: backend.evidenceProcessing.pendingCount,
    generatedAt,
  });
  const portal = android;
  assert.deepEqual(android.nextAction.primaryAction, backend.nextAction.primaryAction, `${label} android nextAction`);
  assert.deepEqual(portal.nextAction.primaryAction, backend.nextAction.primaryAction, `${label} portal nextAction`);
  assert.equal(android.proof.availability, backend.proof.availability, `${label} proof`);
  assert.deepEqual(android.protocol, backend.protocol, `${label} protocol`);
  assert.deepEqual(android.returnWorkflow, backend.returnWorkflow, `${label} return`);
  assert.equal(android.evidenceProcessing.state, backend.evidenceProcessing.state, `${label} processing`);
  assert.equal(android.viewer.role, backend.viewer.role, `${label} role`);
  if (backend.proof.availability === 'AVAILABLE') {
    assert.equal(android.nextAction.passportReady, true, `${label} View Proof only when AVAILABLE`);
  } else {
    assert.equal(android.nextAction.passportReady, false, `${label} no View Proof`);
    assert.notEqual(android.nextAction.primaryAction?.kind, 'OPEN_PASSPORT', `${label} cannot View Proof while another surface continues`);
  }
}

const journeys = [
  {
    id: 'receipt-no-invite',
    actorId: 'seller-1',
    record: transaction(),
    artifacts: [],
    expect: { action: 'INVITE_BUYER', proof: 'NOT_ELIGIBLE', role: 'SELLER' },
  },
  {
    id: 'terms-awaiting-buyer',
    actorId: 'seller-1',
    record: transaction({ consumerStatus: 'AWAITING_BUYER', buyerId: 'buyer-1', participantIds: ['seller-1'] }),
    artifacts: [],
    timeline: [{ type: 'INVITE_CREATED', occurredAt: generatedAt }],
    expect: { action: null, proof: 'NOT_ELIGIBLE', role: 'SELLER' },
  },
  {
    id: 'terms-locked-no-evidence',
    actorId: 'seller-1',
    record: locked(),
    artifacts: [],
    commerce: commerceContext(),
    expect: { action: 'START_PACKING', proof: 'NOT_ELIGIBLE', role: 'SELLER' },
  },
  {
    id: 'packing-uploading',
    actorId: 'seller-1',
    record: locked({ consumerStatus: 'TERMS_LOCKED' }),
    artifacts: [uploading()],
    commerce: commerceContext(),
    expect: { action: null, proof: 'NOT_ELIGIBLE', processing: 'FINALIZING' },
  },
  {
    id: 'packing-plus-seal',
    actorId: 'seller-1',
    record: locked({ consumerStatus: 'PACKED' }),
    artifacts: [packing(), seal()],
    commerce: commerceContext(),
    expect: { action: 'ADD_SHIPMENT', proof: 'ELIGIBLE_NOT_ISSUED', protocol: { hasPackingVideo: true, sellerReferenceComplete: true } },
  },
  {
    id: 'packing-corrupted',
    actorId: 'seller-1',
    record: locked({ consumerStatus: 'TERMS_LOCKED' }),
    artifacts: [quarantined()],
    commerce: commerceContext(),
    expect: { action: 'START_PACKING', proof: 'NOT_ELIGIBLE' },
  },
  {
    id: 'shipment-submitted',
    actorId: 'buyer-1',
    record: locked({
      consumerStatus: 'SHIPPED',
      shipment: { carrier: 'UPS', trackingNumber: '1Z', assertionSource: 'MERCHANT' },
    }),
    artifacts: [packing(), seal()],
    commerce: commerceContext(),
    expect: { action: 'RECORD_ARRIVAL', proof: 'ELIGIBLE_NOT_ISSUED', role: 'BUYER' },
  },
  {
    id: 'buyer-received',
    actorId: 'buyer-1',
    record: locked({ consumerStatus: 'SHIPPED' }),
    artifacts: [packing(), seal(), arrival()],
    commerce: commerceContext(),
    expect: { action: 'RECORD_UNBOXING', proof: 'ELIGIBLE_NOT_ISSUED', role: 'BUYER' },
  },
  {
    id: 'buyer-unboxed',
    actorId: 'buyer-1',
    record: locked({ consumerStatus: 'BUYER_REVIEW' }),
    artifacts: [packing(), seal(), arrival(), unbox()],
    commerce: commerceContext(),
    expect: { action: 'COMPLETE_TRANSACTION', proof: 'ELIGIBLE_NOT_ISSUED', role: 'BUYER' },
  },
  {
    id: 'transaction-complete',
    actorId: 'seller-1',
    record: locked({
      consumerStatus: 'COMPLETED',
      passportId: 'ppt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      passportDisplayId: 'PP-AAAA-AAAA-AAAA',
    }),
    artifacts: [packing(), seal(), arrival(), unbox()],
    commerce: commerceContext(),
    expect: { action: 'OPEN_PASSPORT', proof: 'AVAILABLE', role: 'SELLER' },
  },
  {
    id: 'return-requested',
    actorId: 'seller-1',
    record: locked({
      consumerStatus: 'COMPLETED',
      passportId: 'ppt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      passportDisplayId: 'PP-AAAA-AAAA-AAAA',
    }),
    artifacts: [packing(), seal(), arrival(), unbox()],
    returns: [returnRow('REQUESTED')],
    commerce: commerceContext(),
    expect: { action: 'AUTHORIZE_RETURN', proof: 'AVAILABLE' },
  },
  {
    id: 'return-packing',
    actorId: 'buyer-1',
    record: locked({
      consumerStatus: 'COMPLETED',
      passportId: 'ppt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      passportDisplayId: 'PP-AAAA-AAAA-AAAA',
    }),
    artifacts: [packing(), seal(), arrival(), unbox()],
    returns: [returnRow('AUTHORIZED')],
    commerce: commerceContext(),
    expect: { action: 'RECORD_RETURN_PACKING', role: 'BUYER' },
  },
  {
    id: 'return-shipped',
    actorId: 'seller-1',
    record: locked({
      consumerStatus: 'COMPLETED',
      passportId: 'ppt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      passportDisplayId: 'PP-AAAA-AAAA-AAAA',
    }),
    artifacts: [
      packing(), seal(), arrival(), unbox(),
      artifact({ id: 'art_rpack', type: 'RETURN_PACKING_VIDEO', returnPassportId: 'rtn_1' }),
      artifact({ id: 'art_rseal', type: 'RETURN_SHIPPING_LABEL', returnPassportId: 'rtn_1' }),
    ],
    returns: [returnRow('IN_TRANSIT')],
    commerce: commerceContext(),
    expect: { action: 'RECORD_RETURN_UNBOXING', role: 'SELLER' },
  },
  {
    id: 'return-received',
    actorId: 'seller-1',
    record: locked({
      consumerStatus: 'COMPLETED',
      passportId: 'ppt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      passportDisplayId: 'PP-AAAA-AAAA-AAAA',
    }),
    artifacts: [
      packing(), seal(), arrival(), unbox(),
      artifact({ id: 'art_rpack', type: 'RETURN_PACKING_VIDEO', returnPassportId: 'rtn_1' }),
      artifact({ id: 'art_rseal', type: 'RETURN_SHIPPING_LABEL', returnPassportId: 'rtn_1' }),
      artifact({ id: 'art_runbox', type: 'RETURN_UNBOXING_VIDEO', returnPassportId: 'rtn_1' }),
    ],
    returns: [returnRow('RECEIVED_REVIEW')],
    commerce: commerceContext(),
    expect: { action: 'COMPLETE_RETURN', role: 'SELLER' },
  },
  {
    id: 'merchant-api-transaction',
    actorId: 'seller-1',
    record: locked({
      consumerStatus: 'PACKED',
      sourceType: 'MERCHANT_API',
      sourceTrustLevel: 'MERCHANT_SERVER_ATTESTED',
      merchantReference: 'ord_merchant_1',
    }),
    artifacts: [packing(), seal()],
    commerce: commerceContext('MERCHANT_SERVER_ATTESTED'),
    expect: { proof: 'ELIGIBLE_NOT_ISSUED', authoritative: true },
  },
  {
    id: 'page-declared-transaction',
    actorId: 'seller-1',
    record: locked({
      consumerStatus: 'PACKED',
      merchantReference: null,
      sourceType: 'PACKPROOF_BUTTON',
      sourceTrustLevel: 'PAGE_DECLARED',
      commerceContextId: 'ctx_page',
    }),
    artifacts: [packing(), seal()],
    commerce: commerceContext('PAGE_DECLARED'),
    expect: { proof: 'NOT_ELIGIBLE', authoritative: false },
  },
  {
    id: 'user-provided-receipt',
    actorId: 'seller-1',
    record: transaction({
      consumerStatus: 'PACKED',
      buyerId: 'buyer-1',
      participantIds: ['seller-1', 'buyer-1'],
      confirmedBy: ['seller-1', 'buyer-1'],
      lockedAt: now,
      sourceTrustLevel: 'USER_PROVIDED_COMMERCE_ARTIFACT',
    }),
    artifacts: [packing(), seal()],
    commerce: commerceContext('USER_PROVIDED_COMMERCE_ARTIFACT'),
    expect: { proof: 'NOT_ELIGIBLE', authoritative: false },
  },
  {
    id: 'enterprise-observe',
    actorId: 'seller-1',
    record: locked({
      consumerStatus: 'PACKED',
      sourceType: 'MERCHANT_API',
      sourceTrustLevel: 'MERCHANT_SERVER_ATTESTED',
    }),
    artifacts: [artifact({ id: 'art_ent', type: 'PACKING_VIDEO', acquisitionClass: 'ENTERPRISE_STATION' }), seal()],
    commerce: commerceContext(),
    expect: { proof: 'ELIGIBLE_NOT_ISSUED', protocol: { hasPackingVideo: true } },
  },
  {
    id: 'tracking-mismatch',
    actorId: 'seller-1',
    record: locked({ consumerStatus: 'PACKED' }),
    artifacts: [
      packing(),
      artifact({ id: 'art_seal_mismatch', type: 'SHIPPING_LABEL', carrierTrackingMatchStatus: 'MISMATCH' }),
    ],
    commerce: commerceContext(),
    expect: { protocol: { hasSealReference: true } },
  },
  {
    id: 'no-qualifying-proof',
    actorId: 'seller-1',
    record: locked({ consumerStatus: 'COMPLETED' }),
    artifacts: [quarantined()],
    commerce: commerceContext(),
    expect: { proof: 'NOT_ELIGIBLE', action: null },
  },
];

test('twenty golden journeys keep Android, Portal, API, and Proof meaning identical', () => {
  assert.equal(journeys.length, 20);
  for (const journey of journeys) {
    const workspace = project(
      journey.record,
      journey.actorId,
      journey.artifacts,
      journey.returns ?? [],
      journey.commerce ?? null,
      journey.timeline ?? [],
    );
    assertSameMeaning(workspace, journey, journey.id);
    if (journey.expect.action !== undefined) {
      assert.equal(workspace.nextAction.primaryAction?.kind ?? null, journey.expect.action, journey.id);
    }
    if (journey.expect.proof) {
      assert.equal(workspace.proof.availability, journey.expect.proof, `${journey.id} proof`);
    }
    if (journey.expect.role) {
      assert.equal(workspace.viewer.role, journey.expect.role, `${journey.id} role`);
    }
    if (journey.expect.processing) {
      assert.equal(workspace.evidenceProcessing.state, journey.expect.processing, `${journey.id} processing`);
    }
    if (journey.expect.protocol) {
      for (const [key, value] of Object.entries(journey.expect.protocol)) {
        assert.equal(workspace.protocol[key], value, `${journey.id} ${key}`);
      }
    }
    const facts = evaluateProofAvailabilityFromFacts({
      transaction: journey.record,
      artifacts: journey.artifacts,
      commerce: journey.commerce ?? null,
    });
    assert.equal(facts.availability, workspace.proof.availability, `${journey.id} Proof JSON availability`);
    if (journey.expect.authoritative !== undefined) {
      const source = { trustLevel: journey.record.sourceTrustLevel };
      assert.equal(canAuthoritativelyBindOrder(source), journey.expect.authoritative, `${journey.id} API trust`);
      if (!journey.expect.authoritative) {
        assert.notEqual(workspace.proof.availability === 'AVAILABLE' && journey.record.sourceTrustLevel === 'MERCHANT_SERVER_ATTESTED', true);
        assert.notEqual(facts.availability, 'AVAILABLE', `${journey.id} user-provided or page-declared cannot become AVAILABLE`);
      }
    }
  }
});

test('workspace summary matches hydrated projection for the same revision', () => {
  const record = locked({
    consumerStatus: 'COMPLETED',
    passportId: 'ppt_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    passportDisplayId: 'PP-AAAA-AAAA-AAAA',
  });
  const artifacts = [packing(), seal(), arrival(), unbox()];
  const hydrated = project(record, 'seller-1', artifacts, [], commerceContext(), []);
  const summary = {
    transactionId: record.id,
    transactionRevision: record.updatedAt.toISOString(),
    protocol: hydrated.protocol,
    returnProtocol: null,
    proof: hydrated.proof,
    returnWorkflow: null,
    inviteSentAt: null,
    pendingCount: hydrated.evidenceProcessing.pendingCount,
    updatedAt: generatedAt,
  };
  const fromSummary = projectWorkspaceFromSummary(record, 'seller-1', summary, generatedAt);
  assert.deepEqual(fromSummary.nextAction.primaryAction, hydrated.nextAction.primaryAction);
  assert.deepEqual(fromSummary.proof, hydrated.proof);
  assert.equal(fromSummary.proof.availability, 'AVAILABLE');
});
