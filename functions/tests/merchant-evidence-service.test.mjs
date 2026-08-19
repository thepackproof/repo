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
    if (existing) {
      if (existing.requestFingerprint !== context.requestFingerprint) {
        throw new ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a materially different request.');
      }
      return { value: existing.value, replayed: true, operationId: existing.operationId };
    }
    const value = await operation('op_1', passThroughIdempotencyFence('op_1'));
    this.records.set(key, { value, operationId: 'op_1', requestFingerprint: context.requestFingerprint });
    return { value, replayed: false, operationId: 'op_1' };
  }
}

class MemoryEvidenceRepo {
  transactions = new Map();
  evidence = new Map();
  timeline = new Map();
  returns = new Map();
  reports = new Map();
  snapshots = new Map();
  commerce = new Map();

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
  async findAccessibleTransactionByPassportIdentity(passportIdentity, principal) {
    const normalized = String(passportIdentity).toUpperCase();
    for (const record of this.transactions.values()) {
      if (record.passportId === passportIdentity || String(record.passportDisplayId ?? '').toUpperCase() === normalized) {
        return this.findAccessibleTransaction(record.id, principal);
      }
    }
    return null;
  }
  async bindPassportIdentity(transactionId, identity) {
    const record = this.transactions.get(transactionId);
    if (record.passportId && record.passportDisplayId) {
      return { passportId: record.passportId, displayId: record.passportDisplayId, issuedAt: record.passportIssuedAt };
    }
    Object.assign(record, { passportId: identity.passportId, passportDisplayId: identity.displayId, passportIssuedAt: identity.issuedAt });
    return identity;
  }
  async findCommerceContext(commerceContextId) { return this.commerce.get(commerceContextId) ?? null; }
  async listPassportSnapshots(transactionId) { return this.snapshots.get(transactionId) ?? []; }
  async findPassportSnapshot(transactionId, snapshotId) {
    return (this.snapshots.get(transactionId) ?? []).find((item) => item.snapshotId === snapshotId) ?? null;
  }
  async createPassportSnapshot(transactionId, build) {
    const list = this.snapshots.get(transactionId) ?? [];
    const version = Math.max(0, ...list.map((item) => item.snapshotVersion)) + 1;
    const record = build(version);
    if (list.some((item) => item.snapshotId === record.snapshotId || item.snapshotVersion === version)) {
      throw new ApplicationError('CONFLICT', 'PASSPORT_SNAPSHOT_VERSION_COLLISION', 'Passport snapshot version allocation collided.');
    }
    list.push(record);
    this.snapshots.set(transactionId, list);
    return record;
  }
  async savePassportExport(transactionId, snapshotId, record) {
    const item = (this.snapshots.get(transactionId) ?? []).find((entry) => entry.snapshotId === snapshotId);
    if (item) Object.assign(item, { pdfStoragePath: record.storagePath, pdfSha256: record.sha256 });
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
    carrierTrackingMatchStatus: null, scannedTrackingNumber: null, shippingTracker: null,
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
  assert.equal(artifacts[0].shippingTracker, null);
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

test('merchant evidence API returns the open-source shipping tracker observation', async () => {
  const { asShippingTrackerObservation } = require('../lib/shipping-tracker.js');
  const tracker = {
    lookupStatus: 'DATASET_VALIDATED',
    courierCode: 'ups',
    courierName: 'UPS',
    publicTrackingUrl: 'https://wwwapps.ups.com/WebTracking/track?track=yes&trackNums=1Z999AA10123456784',
    stillSha256: 'e'.repeat(64),
    stillCaptureStatus: 'CAPTURED',
    observationSha256: 'f'.repeat(64),
    clientObservationSha256: 'f'.repeat(64),
    hashMatched: true,
    interpretation: 'OPEN_SOURCE_TRACKING_NUMBER_VALIDATION_NOT_CARRIER_CUSTODY',
  };
  assert.deepEqual(asShippingTrackerObservation(tracker), tracker);
  assert.equal(asShippingTrackerObservation({ lookupStatus: 'DATASET_VALIDATED' }), null);

  const repository = new MemoryEvidenceRepo();
  repository.seedTransaction({
    id: 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', organizationId: 'org-a', integrationId: null,
    merchantReference: 'order-1', title: 'Camera', description: '', category: null, status: 'CREATED',
    consumerStatus: 'DRAFT', amount: { currency: 'USD', minorUnits: 1000 }, terms: {
      saleType: 'SHIPPED', shippingResponsibility: 'SELLER', returns: 'PLATFORM_POLICY', returnWindowDays: 0, customTerms: '',
    }, shipment: null, delivery: null, sellerId: 'seller-1', buyerId: 'buyer-1',
    participantIds: ['seller-1', 'buyer-1'], createdAt: now, updatedAt: now,
  });
  repository.seedEvidence({ ...finalized('PACKING_VIDEO'), shippingTracker: tracker });
  const service = new MerchantEvidenceApplicationService(
    repository, new MemoryIdempotency(), { append: async () => undefined }, new MerchantAuthorizationPolicy(),
    { generate: async () => ({ reportId: 'report_1', storagePath: 'reports/x.pdf', sha256: 'd'.repeat(64), evidenceCount: 1 }) },
    { sign: async () => 'https://files.example/x.pdf' },
    { environment: 'sandbox' }, () => now,
  );
  const artifacts = await service.listEvidence(orgA, 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.deepEqual(artifacts[0].shippingTracker, tracker);
  const review = await service.getReviewPackage(orgA, 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.deepEqual(review.evidence[0].shippingTracker, tracker);
});

test('merchant shipment and review accept station packing and seal types without collapsing assurance', async () => {
  const repository = new MemoryEvidenceRepo();
  const transactionId = 'txn_stationstationstationstationstaa';
  repository.seedTransaction({
    id: transactionId, organizationId: 'org-a', integrationId: null,
    merchantReference: 'order-station', title: 'Camera', description: '', category: null, status: 'CREATED',
    consumerStatus: 'PACKED', amount: { currency: 'USD', minorUnits: 1000 }, terms: {
      saleType: 'SHIPPED', shippingResponsibility: 'SELLER', returns: 'PLATFORM_POLICY', returnWindowDays: 0, customTerms: '',
    }, shipment: null, delivery: null, sellerId: 'seller-1', buyerId: 'buyer-1',
    participantIds: ['seller-1', 'buyer-1'], createdAt: now, updatedAt: now,
  });
  repository.seedEvidence({ ...finalized('STATION_PACKING_VIDEO', 'station-pack'), transactionId });
  repository.seedEvidence({ ...finalized('STATION_SEAL_REFERENCE', 'station-seal'), transactionId });
  const service = new MerchantEvidenceApplicationService(
    repository, new MemoryIdempotency(), { append: async () => undefined }, new MerchantAuthorizationPolicy(),
    { generate: async () => ({ reportId: 'report_2', storagePath: 'reports/y.pdf', sha256: 'd'.repeat(64), evidenceCount: 2 }) },
    { sign: async () => 'https://files.example/y.pdf' },
    { environment: 'sandbox' }, () => now,
  );
  const review = await service.getReviewPackage(orgA, transactionId);
  assert.equal(review.protocolCompleteness.sellerPackingVideo, 'PRESENT');
  assert.equal(review.protocolCompleteness.sellerSealReference, 'PRESENT');
  const shipment = await service.associateShipment(orgA, transactionId, {
    carrier: 'UPS', trackingNumber: '1Z999AA10123456784',
  }, 'ship-station', 'req-station');
  assert.equal(shipment.shipment.packingEvidenceId, 'station-pack');
  assert.equal(shipment.shipment.sealEvidenceId, 'station-seal');
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
    () => now,
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

test('merchant passport service issues a stable identity and refuses ineligible transactions', async () => {
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
  const service = new MerchantEvidenceApplicationService(
    repository, new MemoryIdempotency(), { append: async () => undefined }, new MerchantAuthorizationPolicy(),
    { generate: async () => ({ reportId: 'report_1', storagePath: 'reports/x.pdf', sha256: 'd'.repeat(64), evidenceCount: 1 }) },
    { sign: async () => 'https://files.example/x.pdf' },
    { environment: 'sandbox' }, () => now,
    { verificationBaseUrl: () => 'https://app.packproof.example' },
  );
  const first = await service.getPassport(orgA, 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(first.object, 'packproof_passport');
  assert.match(first.identity.displayId, /^PP-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
  assert.equal(first.identity.passportId, repository.transactions.get('txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa').passportId);
  const second = await service.getPassportByIdentity(orgA, first.identity.displayId);
  assert.equal(second.identity.passportId, first.identity.passportId);
  assert.equal(second.limitations.doesNotDecideFraudOrFault, true);

  const empty = new MemoryEvidenceRepo();
  empty.seedTransaction({
    id: 'txn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb', organizationId: 'org-a', integrationId: null,
    merchantReference: null, title: 'Untitled', description: '', category: null, status: 'CREATED',
    consumerStatus: 'DRAFT', amount: null, terms: null, shipment: null, delivery: null,
    sellerId: 'seller-1', buyerId: null, participantIds: ['seller-1'], createdAt: now, updatedAt: now,
  });
  const blocked = new MerchantEvidenceApplicationService(
    empty, new MemoryIdempotency(), { append: async () => undefined }, new MerchantAuthorizationPolicy(),
    { generate: async () => ({ reportId: 'report_1', storagePath: 'reports/x.pdf', sha256: 'd'.repeat(64), evidenceCount: 0 }) },
    { sign: async () => 'https://files.example/x.pdf' },
    { environment: 'sandbox' }, () => now,
  );
  await assert.rejects(() => blocked.getPassport(orgA, 'txn_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'), (error) => (
    error instanceof ApplicationError && error.code === 'PASSPORT_NOT_READY'
  ));
});

function passportService(repository) {
  return new MerchantEvidenceApplicationService(
    repository, new MemoryIdempotency(), { append: async () => undefined }, new MerchantAuthorizationPolicy(),
    { generate: async () => ({ reportId: 'report_1', storagePath: 'reports/x.pdf', sha256: 'd'.repeat(64), evidenceCount: 1 }) },
    { sign: async () => 'https://files.example/x.pdf' },
    { environment: 'sandbox' }, () => now,
    { verificationBaseUrl: () => 'https://app.packproof.example' },
  );
}

function readyTransaction(overrides = {}) {
  return {
    id: 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', organizationId: 'org-a', integrationId: null,
    merchantReference: 'order-1', title: 'Camera', description: '', category: null, status: 'CREATED',
    consumerStatus: 'DRAFT', amount: { currency: 'USD', minorUnits: 1000 }, terms: {
      saleType: 'SHIPPED', shippingResponsibility: 'SELLER', returns: 'PLATFORM_POLICY', returnWindowDays: 0, customTerms: '',
    }, shipment: null, delivery: null, sellerId: 'seller-1', buyerId: 'buyer-1',
    participantIds: ['seller-1', 'buyer-1'], createdAt: now, updatedAt: now,
    commerceContextId: null, sourceType: null, sourcePlatform: null, externalOrderId: null,
    externalSellerId: null, declaredWeightGrams: null, sourceTrackingNumber: null, sourceTrustLevel: null,
    passportId: null, passportDisplayId: null, passportIssuedAt: null,
    ...overrides,
  };
}

test('PAGE_DECLARED commerce cannot issue a Passport and is omitted from attested order context', async () => {
  const pageOnly = new MemoryEvidenceRepo();
  pageOnly.seedTransaction(readyTransaction({
    merchantReference: null,
    commerceContextId: 'ctx_page',
    sourceType: 'PACKPROOF_BUTTON',
    sourceTrustLevel: 'PAGE_DECLARED',
  }));
  pageOnly.commerce.set('ctx_page', {
    id: 'ctx_page', platform: 'STRUCTURED_PAGE_DATA', trustLevel: 'PAGE_DECLARED', assertingSource: 'PAGE_DECLARED',
    externalOrderId: null, externalSellerId: null, capturedAt: now.toISOString(), canonicalPayloadSha256: 'd'.repeat(64),
    title: 'Page declared camera', sku: 'PAGE-SKU', gtin: null, upc: '012345678905', serialNumber: null, quantity: 1,
    amount: { currency: 'USD', minorUnits: 1000 }, variant: null, listingReference: 'https://example.test/item',
    merchantItemId: null, declaredCondition: null, declaredWeightGrams: null,
  });
  pageOnly.seedEvidence(finalized('PACKING_VIDEO'));
  await assert.rejects(
    () => passportService(pageOnly).getPassport(orgA, 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),
    (error) => error instanceof ApplicationError && error.code === 'PASSPORT_NOT_READY',
  );

  const attested = new MemoryEvidenceRepo();
  attested.seedTransaction(readyTransaction({ commerceContextId: 'ctx_page' }));
  attested.commerce.set('ctx_page', pageOnly.commerce.get('ctx_page'));
  attested.seedEvidence(finalized('PACKING_VIDEO'));
  const issued = await passportService(attested).getPassport(orgA, 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa');
  assert.equal(issued.integrity.banner, 'AUTHENTIC_PACKPROOF');
  assert.equal(issued.items[0].expected.sku.value, null);
  assert.equal(issued.transaction.commerceContextId, null);
  assert.equal(issued.integrity.criteria.provenance, 'LIMITED');
});

test('passport snapshots fingerprint review context and allocate versions atomically', async () => {
  const repository = new MemoryEvidenceRepo();
  repository.seedTransaction(readyTransaction());
  repository.seedEvidence(finalized('PACKING_VIDEO'));
  const service = passportService(repository);
  const first = await service.createPassportSnapshot(
    orgA, 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'snap-key', 'req-snap-1',
    { framework: 'VISA', category: 'MERCHANDISE_NOT_RECEIVED' },
  );
  assert.equal(first.replayed, false);
  assert.equal(first.snapshot.snapshotVersion, 1);
  assert.equal(first.snapshot.passport.reviewContext.receivingFramework, 'VISA');

  await assert.rejects(
    () => service.createPassportSnapshot(
      orgA, 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'snap-key', 'req-snap-2',
      { framework: 'PAYPAL', category: 'ITEM_NOT_RECEIVED' },
    ),
    (error) => error instanceof ApplicationError && error.code === 'IDEMPOTENCY_KEY_REUSED',
  );

  const replayed = await service.createPassportSnapshot(
    orgA, 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'snap-key', 'req-snap-3',
    { framework: 'visa', category: 'merchandise_not_received' },
  );
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.snapshot.snapshotId, first.snapshot.snapshotId);

  const second = await service.createPassportSnapshot(
    orgA, 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', 'snap-key-2', 'req-snap-4',
    { framework: 'PAYPAL', category: 'ITEM_NOT_RECEIVED' },
  );
  assert.equal(second.replayed, false);
  assert.equal(second.snapshot.snapshotVersion, 2);
  assert.equal(second.snapshot.passport.reviewContext.receivingFramework, 'PAYPAL');
  assert.notEqual(second.snapshot.snapshotId, first.snapshot.snapshotId);
});
