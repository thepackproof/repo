import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { ApplicationError } = require('../lib/application/v1/errors.js');
const { MerchantAuthorizationPolicy, canonicalize, sha256 } = require('../lib/application/v1/merchant-transaction-service.js');
const { passThroughIdempotencyFence } = require('../lib/application/v1/merchant-ports.js');
const { MerchantEvidenceApplicationService } = require('../lib/application/v1/merchant-evidence-service.js');
const { MerchantConnectApplicationService } = require('../lib/application/v1/merchant-connect-service.js');

const now = new Date('2026-08-11T12:00:00.000Z');
const orgA = {
  type: 'MERCHANT_API_CLIENT', credentialId: 'cred-a', apiClientId: 'client-a',
  organizationId: 'org-a', environment: 'sandbox', integrationId: 'int-a',
  scopes: ['transactions:read', 'transactions:write', 'evidence:read', 'shipments:read', 'shipments:write'],
};
const orgB = { ...orgA, organizationId: 'org-b', apiClientId: 'client-b', integrationId: 'int-b', credentialId: 'cred-b' };

class MemoryIdempotency {
  records = new Map();
  async execute(context, operation) {
    const key = sha256(canonicalize({ principalId: context.principalId, operation: context.operation, key: context.key }));
    const existing = this.records.get(key);
    if (existing) return { value: existing.value, replayed: true, operationId: existing.operationId };
    const value = await operation('op_1', passThroughIdempotencyFence('op_1'));
    this.records.set(key, { value, operationId: 'op_1' });
    return { value, replayed: false, operationId: 'op_1' };
  }
}

class MemoryEvidenceRepo {
  transactions = new Map();
  evidence = new Map();
  timeline = new Map();
  returns = new Map();
  reports = new Map();

  seedTransaction(record) { this.transactions.set(record.id, record); }
  seedEvidence(record) {
    const list = this.evidence.get(record.transactionId) ?? [];
    list.push(record);
    this.evidence.set(record.transactionId, list);
  }

  async findAccessibleTransaction(id, principal) {
    const record = this.transactions.get(id);
    if (!record) return null;
    if (record.organizationId === principal.organizationId) return record;
    if (record.integrationId && record.integrationId === principal.integrationId) return record;
    return null;
  }
  async listEvidence(transactionId) { return this.evidence.get(transactionId) ?? []; }
  async findEvidence(transactionId, artifactId) {
    return (this.evidence.get(transactionId) ?? []).find((item) => item.id === artifactId) ?? null;
  }
  async listTimeline(transactionId) { return this.timeline.get(transactionId) ?? []; }
  async listReturns(transactionId) { return this.returns.get(transactionId) ?? []; }
  async findReturn(transactionId, returnPassportId) {
    return (this.returns.get(transactionId) ?? []).find((item) => item.id === returnPassportId) ?? null;
  }
  async listReports(transactionId) { return this.reports.get(transactionId) ?? []; }
  async findReport(transactionId, reportId) {
    return (this.reports.get(transactionId) ?? []).find((item) => item.id === reportId) ?? null;
  }
  async associateShipment(transactionId, record) {
    return {
      id: `shipment_${transactionId.slice(-8)}`, object: 'shipment', schemaVersion: 1, transactionId,
      carrier: record.carrier, trackingNumber: record.trackingNumber, assertionSource: 'MERCHANT',
      status: 'ASSOCIATED', packingEvidenceId: record.packingEvidenceId, sealEvidenceId: record.sealEvidenceId,
      labelEvidenceMatchStatus: record.labelEvidenceMatchStatus, shippedAt: record.occurredAt.toISOString(),
      createdAt: record.occurredAt.toISOString(), updatedAt: record.occurredAt.toISOString(),
    };
  }
  async createReturn(transactionId, record) {
    const item = {
      id: record.id, object: 'return_passport', schemaVersion: 1, transactionId, reason: record.reason,
      status: 'REQUESTED', originalEvidenceHashes: record.originalEvidenceHashes, shippingCarrier: null,
      shippingTrackingNumber: null, packingEvidenceId: null, sealEvidenceId: null, labelEvidenceMatchStatus: null,
      createdAt: record.occurredAt.toISOString(), updatedAt: record.occurredAt.toISOString(),
    };
    const list = this.returns.get(transactionId) ?? [];
    list.push(item);
    this.returns.set(transactionId, list);
    return item;
  }
  async associateReturnShipment(transactionId, returnPassportId, record) {
    const item = (this.returns.get(transactionId) ?? []).find((entry) => entry.id === returnPassportId);
    Object.assign(item, {
      status: 'IN_TRANSIT', shippingCarrier: record.carrier, shippingTrackingNumber: record.trackingNumber,
      packingEvidenceId: record.packingEvidenceId, sealEvidenceId: record.sealEvidenceId,
      labelEvidenceMatchStatus: record.labelEvidenceMatchStatus, updatedAt: record.occurredAt.toISOString(),
    });
    return item;
  }
  async associateDelivery(transactionId, record) {
    return {
      id: `delivery_${transactionId.slice(-8)}`, object: 'delivery', schemaVersion: 1, transactionId,
      assertionSource: 'MERCHANT', status: 'ASSOCIATED', arrivalEvidenceId: record.arrivalEvidenceId,
      carrier: record.carrier, trackingNumber: record.trackingNumber,
      labelEvidenceMatchStatus: record.labelEvidenceMatchStatus, receivedAt: record.occurredAt.toISOString(),
      createdAt: record.occurredAt.toISOString(), updatedAt: record.occurredAt.toISOString(),
    };
  }
}

function finalized(type, id = `${type.toLowerCase()}-1`) {
  return {
    id, transactionId: 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', type, role: 'SELLER',
    contentType: type.includes('VIDEO') ? 'video/mp4' : 'image/jpeg', sizeBytes: 100, sha256: 'a'.repeat(64),
    manifestSha256: 'b'.repeat(64), evidenceBundleSha256: 'c'.repeat(64),
    manifestAuthenticationScope: 'PACKPROOF_SERVICE_ONLY', returnPassportId: null,
    serverFinalized: true, serverVerified: false, clientHashMatched: true, clientSizeMatched: true,
    contentTypeMatched: true, assurance: {
      acquisitionQuality: { status: 'NOT_EVALUATED', reasonCodes: [] },
      appDeviceContext: { status: 'ONLINE_APP_CHECK_ONLY', reasonCodes: [] },
      byteIntegrity: { status: 'MATCHED', reasonCodes: [] },
      physicalCorrespondence: { status: 'NOT_AVAILABLE', reasonCodes: [] },
      carrierContext: { status: 'NOT_EVALUATED', reasonCodes: [] },
      businessLegalRelevance: { status: 'REVIEW_REQUIRED', reasonCodes: [] },
    },
    carrierTrackingMatchStatus: null, scannedTrackingNumber: null,
    createdAt: now, updatedAt: now, finalizedAt: now,
  };
}

test('merchant evidence service isolates tenants and never emits a claims verdict', async () => {
  const repository = new MemoryEvidenceRepo();
  repository.seedTransaction({
    id: 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', organizationId: 'org-a', integrationId: null,
    merchantReference: 'order-1', title: 'Camera', description: '', category: null, status: 'CREATED',
    consumerStatus: 'DRAFT', amount: { currency: 'USD', minorUnits: 1000 }, terms: {
      saleType: 'SHIPPED', shippingResponsibility: 'SELLER', returns: 'PLATFORM_POLICY', returnWindowDays: 0, customTerms: '',
    }, shipment: null, delivery: null, sellerId: 'seller-1', buyerId: 'buyer-1',
    participantIds: ['seller-1', 'buyer-1'], createdAt: now, updatedAt: now,
  });
  repository.seedEvidence(finalized('PACKING_VIDEO'));
  repository.seedEvidence(finalized('SHIPPING_LABEL', 'seal-1'));
  const service = new MerchantEvidenceApplicationService(
    repository, new MemoryIdempotency(), { append: async () => undefined }, new MerchantAuthorizationPolicy(),
    { generate: async () => ({ reportId: 'report_1', storagePath: 'reports/x.pdf', sha256: 'd'.repeat(64), evidenceCount: 2 }) },
    { sign: async () => 'https://files.example/x.pdf' },
    { environment: 'sandbox' }, () => now,
  );

  await assert.rejects(() => service.listEvidence(orgB, 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'), (error) => (
    error instanceof ApplicationError && error.code === 'TRANSACTION_NOT_FOUND'
  ));
  const artifacts = await service.listEvidence(orgA, 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(artifacts.length, 2);
  assert.equal(artifacts[0].assurance.physicalCorrespondence.status, 'NOT_AVAILABLE');
  assert.equal(artifacts[0].assurance.businessLegalRelevance.status, 'REVIEW_REQUIRED');

  const review = await service.getReviewPackage(orgA, 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(review.protocolCompleteness.sellerPackingVideo, 'PRESENT');
  assert.equal(review.protocolCompleteness.sellerSealReference, 'PRESENT');
  assert.equal(review.delivery, null);
  assert.equal(review.limitations.doesNotDecideFraudOrFault, true);
  assert.equal(review.documentationCategories.some((entry) => entry.category === 'PACKING_AND_SEAL_REFERENCE' && entry.present), true);

  const report = await service.createReport(orgA, 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'report-key', 'req-1');
  assert.equal(report.report.presentationOnly, true);
  assert.ok(report.report.downloadUrl);

  const shipment = await service.associateShipment(orgA, 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', {
    carrier: 'UPS', trackingNumber: '1Z999AA10123456784',
  }, 'ship-key', 'req-2');
  assert.equal(shipment.shipment.assertionSource, 'MERCHANT');
  assert.equal(shipment.shipment.labelEvidenceMatchStatus, 'NOT_SCANNED');
});

test('shipment association fails closed without packing and seal evidence', async () => {
  const repository = new MemoryEvidenceRepo();
  repository.seedTransaction({
    id: 'txn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', organizationId: 'org-a', integrationId: null,
    merchantReference: null, title: 'Empty', description: '', category: null, status: 'CREATED',
    consumerStatus: 'DRAFT', amount: null, terms: null, shipment: null, delivery: null,
    sellerId: null, buyerId: null, participantIds: [], createdAt: now, updatedAt: now,
  });
  const service = new MerchantEvidenceApplicationService(
    repository, new MemoryIdempotency(), { append: async () => undefined }, new MerchantAuthorizationPolicy(),
    { generate: async () => { throw new Error('unused'); } },
    { sign: async () => 'https://files.example/x.pdf' },
    { environment: 'sandbox' }, () => now,
  );
  await assert.rejects(() => service.associateShipment(orgA, 'txn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', {
    carrier: 'UPS', trackingNumber: '1Z999AA10123456784',
  }, 'ship-empty', 'req-3'), (error) => error instanceof ApplicationError && error.category === 'FAILED_PRECONDITION');
});

test('merchant return and delivery writes fail closed without protocol evidence', async () => {
  const repository = new MemoryEvidenceRepo();
  const shipped = {
    id: 'txn_cccccccccccccccccccccccccccccccc', organizationId: 'org-a', integrationId: null,
    merchantReference: 'order-2', title: 'Camera', description: '', category: null, status: 'CREATED',
    consumerStatus: 'SHIPPED', amount: null, terms: {
      saleType: 'SHIPPED', shippingResponsibility: 'SELLER', returns: 'AS_AGREED', returnWindowDays: 14, customTerms: '',
    },
    sellerId: 'seller-1', buyerId: 'buyer-1', participantIds: ['seller-1', 'buyer-1'],
    shipment: { id: 'shipment_c', object: 'shipment', schemaVersion: 1, transactionId: 'txn_cccccccccccccccccccccccccccccccc', carrier: 'UPS', trackingNumber: '1Z999', assertionSource: 'MERCHANT', status: 'ASSOCIATED', packingEvidenceId: 'p1', sealEvidenceId: 's1', labelEvidenceMatchStatus: 'NOT_SCANNED', shippedAt: now.toISOString(), createdAt: now.toISOString(), updatedAt: now.toISOString() },
    delivery: null, createdAt: now, updatedAt: now,
  };
  repository.seedTransaction(shipped);
  const service = new MerchantEvidenceApplicationService(
    repository, new MemoryIdempotency(), { append: async () => undefined }, new MerchantAuthorizationPolicy(),
    { generate: async () => { throw new Error('unused'); } },
    { sign: async () => 'https://files.example/x.pdf' },
    { environment: 'sandbox' }, () => now,
  );
  const created = await service.createReturn(orgA, shipped.id, { reason: 'Item differs from locked terms.' }, 'return-key', 'req-4');
  assert.equal(created.returnPassport.status, 'REQUESTED');
  await assert.rejects(() => service.associateDelivery(orgA, shipped.id, { carrier: 'UPS', trackingNumber: '1Z999AA10123456784' }, 'del-empty', 'req-5'), (error) => (
    error instanceof ApplicationError && error.code === 'ARRIVAL_OBSERVATION_REQUIRED'
  ));
  repository.seedEvidence({ ...finalized('DELIVERY_PHOTO', 'arrive-1'), transactionId: shipped.id, role: 'BUYER' });
  const delivery = await service.associateDelivery(orgA, shipped.id, { carrier: 'UPS', trackingNumber: '1Z999AA10123456784' }, 'del-key', 'req-6');
  assert.equal(delivery.delivery.assertionSource, 'MERCHANT');
  assert.equal(delivery.delivery.arrivalEvidenceId, 'arrive-1');

  created.returnPassport.status = 'AUTHORIZED';
  const storedReturn = (repository.returns.get(shipped.id) ?? []).find((item) => item.id === created.returnPassport.id);
  storedReturn.status = 'AUTHORIZED';
  await assert.rejects(() => service.associateReturnShipment(orgA, shipped.id, created.returnPassport.id, {
    carrier: 'USPS', trackingNumber: '940011189922',
  }, 'ret-ship-empty', 'req-7'), (error) => error instanceof ApplicationError && error.category === 'FAILED_PRECONDITION');
  repository.seedEvidence({ ...finalized('RETURN_PACKING_VIDEO', 'ret-pack'), transactionId: shipped.id, returnPassportId: created.returnPassport.id });
  repository.seedEvidence({ ...finalized('RETURN_SHIPPING_LABEL', 'ret-seal'), transactionId: shipped.id, returnPassportId: created.returnPassport.id });
  const shippedReturn = await service.associateReturnShipment(orgA, shipped.id, created.returnPassport.id, {
    carrier: 'USPS', trackingNumber: '940011189922',
  }, 'ret-ship-key', 'req-8');
  assert.equal(shippedReturn.returnPassport.status, 'IN_TRANSIT');
  assert.equal(shippedReturn.returnPassport.shippingCarrier, 'USPS');
});

test('Connect v1 create requires a bound integration and hides tokens on get', async () => {
  const ingested = [];
  let cancelled = false;
  const commerceContext = {
    async ingestConnectOrder(principal, input) {
      ingested.push({ principal, input });
      return {
        sessionId: 'e'.repeat(64), commerceContextId: `ctx_${'f'.repeat(40)}`,
        sessionToken: 'secret-token', expiresAt: new Date('2026-08-18T12:00:00.000Z'), replayed: false,
      };
    },
  };
  const service = new MerchantConnectApplicationService(
    commerceContext,
    { findBoundIntegration: async (principal) => principal.integrationId ? {
      id: principal.integrationId, platform: 'custom', webhookSigningSecret: 'whsec_test', callbackOrigins: ['https://merchant.example'],
    } : null },
    { findAccessibleSession: async (sessionId, principal) => sessionId === 'e'.repeat(64) && principal.organizationId === 'org-a' ? {
      id: sessionId, organizationId: 'org-a', integrationId: 'int-a', platform: 'custom', externalOrderId: 'order-1',
      status: 'PENDING_REDEMPTION', transactionId: null, commerceContextId: `ctx_${'f'.repeat(40)}`,
      itemTitle: 'Camera', currency: 'USD', priceMinor: 1000, trackingNumber: null, carrier: null,
      expiresAt: new Date('2026-08-18T12:00:00.000Z'), createdAt: now,
    } : null,
    listAccessibleSessions: async (principal, externalOrderId) => principal.organizationId === 'org-a' && externalOrderId === 'order-1' ? [{
      id: 'e'.repeat(64), organizationId: 'org-a', integrationId: 'int-a', platform: 'custom', externalOrderId: 'order-1',
      status: 'PENDING_REDEMPTION', transactionId: null, commerceContextId: `ctx_${'f'.repeat(40)}`,
      itemTitle: 'Camera', currency: 'USD', priceMinor: 1000, trackingNumber: null, carrier: null,
      expiresAt: new Date('2026-08-18T12:00:00.000Z'), createdAt: now,
    }] : [],
    cancelAccessibleSession: async (sessionId, principal, decide) => {
      const current = sessionId === 'e'.repeat(64) && principal.organizationId === 'org-a' ? {
        id: sessionId, organizationId: 'org-a', integrationId: 'int-a', platform: 'custom', externalOrderId: 'order-1',
        status: cancelled ? 'CANCELLED' : 'PENDING_REDEMPTION', transactionId: null, commerceContextId: `ctx_${'f'.repeat(40)}`,
        itemTitle: 'Camera', currency: 'USD', priceMinor: 1000, trackingNumber: null, carrier: null,
        expiresAt: new Date('2026-08-18T12:00:00.000Z'), createdAt: now,
      } : null;
      const decision = decide(current);
      if (decision.type === 'CANCEL') cancelled = true;
      return decision.session;
    } },
    { validate: async () => undefined },
    new MerchantAuthorizationPolicy(),
    { environment: 'sandbox' },
    () => 'https://packproof.example',
  );

  await assert.rejects(() => service.createSession({ ...orgA, integrationId: null }, {
    platform: 'custom', externalOrderId: 'order-1', externalSellerId: 'seller-1', itemTitle: 'Camera',
    itemDescription: '', amount: { currency: 'USD', minorUnits: 1000 }, callbackUrl: 'https://merchant.example/hook',
  }, 'connect-key', 'req-4'), (error) => error.code === 'INTEGRATION_NOT_BOUND');

  const created = await service.createSession(orgA, {
    platform: 'custom', externalOrderId: 'order-1', externalSellerId: 'seller-1', itemTitle: 'Camera',
    itemDescription: '', amount: { currency: 'USD', minorUnits: 1000 }, callbackUrl: 'https://merchant.example/hook',
  }, 'connect-key', 'req-5');
  assert.equal(created.session.object, 'connect_session');
  assert.match(created.captureUrl, /connect\/capture/);
  assert.equal(ingested[0].principal.organizationId, 'org-a');

  const fetched = await service.getSession(orgA, 'e'.repeat(64));
  assert.equal(fetched.externalOrderId, 'order-1');
  assert.equal(fetched.status, 'PENDING_REDEMPTION');
  assert.equal('token' in fetched, false);
  await assert.rejects(() => service.getSession(orgB, 'e'.repeat(64)), (error) => error.code === 'CONNECT_SESSION_NOT_FOUND');

  const listed = await service.listSessions(orgA, 'order-1');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, 'e'.repeat(64));

  const cancelledSession = await service.cancelSession(orgA, 'e'.repeat(64), 'req-6');
  assert.equal(cancelledSession.session.status, 'CANCELLED');
  assert.equal(cancelledSession.replayed, false);
  const replayed = await service.cancelSession(orgA, 'e'.repeat(64), 'req-7');
  assert.equal(replayed.replayed, true);
});

test('Connect v1 get reports EXPIRED for unredeemed past-due sessions', async () => {
  const expiredAt = new Date('2026-08-10T12:00:00.000Z');
  const service = new MerchantConnectApplicationService(
    { ingestConnectOrder: async () => { throw new Error('unused'); } },
    { findBoundIntegration: async () => null },
    { findAccessibleSession: async () => ({
      id: 'e'.repeat(64), organizationId: 'org-a', integrationId: 'int-a', platform: 'custom', externalOrderId: 'order-1',
      status: 'PENDING_REDEMPTION', transactionId: null, commerceContextId: `ctx_${'f'.repeat(40)}`,
      itemTitle: 'Camera', currency: 'USD', priceMinor: 1000, trackingNumber: null, carrier: null,
      expiresAt: expiredAt, createdAt: new Date('2026-08-03T12:00:00.000Z'),
    }), listAccessibleSessions: async () => [], cancelAccessibleSession: async () => { throw new Error('unused'); } },
    { validate: async () => undefined },
    new MerchantAuthorizationPolicy(),
    { environment: 'sandbox' },
    () => 'https://packproof.example',
    () => now,
  );
  const fetched = await service.getSession(orgA, 'e'.repeat(64));
  assert.equal(fetched.status, 'EXPIRED');
});
