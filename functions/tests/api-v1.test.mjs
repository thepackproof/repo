import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, before, describe, test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createApiV1App } = require('../lib/api/v1/app.js');
const { passThroughIdempotencyFence } = require('../lib/application/v1/merchant-ports.js');
const {
  ApiError,
  canonicalize,
  createTransactionId,
  decodeTransactionCursor,
  encodeTransactionCursor,
  sha256,
  transactionQueryHash,
} = require('../lib/api/v1/core.js');
const { AuthorizationService } = require('../lib/api/v1/security.js');
const { TransactionService } = require('../lib/api/v1/transaction-service.js');
const { PublicCommerceHandoffApplicationService } = require('../lib/application/v1/public-commerce-handoff-service.js');

const principals = {
  writeA: {
    type: 'MERCHANT_API_CLIENT', credentialId: 'credential-write-a', apiClientId: 'client-a',
    organizationId: 'org-a', environment: 'sandbox', integrationId: 'integration-a',
    scopes: ['transactions:read', 'transactions:write', 'participant_claims:write', 'evidence:read', 'evidence:write', 'shipments:read', 'shipments:write'],
  },
  evidenceA: {
    type: 'MERCHANT_API_CLIENT', credentialId: 'credential-evidence-a', apiClientId: 'client-a',
    organizationId: 'org-a', environment: 'sandbox', scopes: ['evidence:read'],
  },
  readA: {
    type: 'MERCHANT_API_CLIENT', credentialId: 'credential-read-a', apiClientId: 'client-a',
    organizationId: 'org-a', environment: 'sandbox', scopes: ['transactions:read'],
  },
  readB: {
    type: 'MERCHANT_API_CLIENT', credentialId: 'credential-read-b', apiClientId: 'client-b',
    organizationId: 'org-b', environment: 'sandbox', scopes: ['transactions:read'],
  },
  noScope: {
    type: 'MERCHANT_API_CLIENT', credentialId: 'credential-none', apiClientId: 'client-a',
    organizationId: 'org-a', environment: 'sandbox', scopes: [],
  },
};

class FakeAuthenticator {
  async authenticate(authorization) {
    const token = authorization?.replace('Bearer ', '');
    const principal = { 'write-a': principals.writeA, 'evidence-a': principals.evidenceA, 'read-a': principals.readA, 'read-b': principals.readB, none: principals.noScope }[token];
    if (!principal) throw new ApiError(401, 'INVALID_API_CREDENTIAL', 'The merchant API credential is missing or invalid.');
    return principal;
  }
}

class InMemoryIdempotencyStore {
  records = new Map();

  async execute(context, operation) {
    const id = sha256(canonicalize({ principalId: context.principalId, operation: context.operation, key: context.key }));
    const existing = this.records.get(id);
    if (existing && existing.fingerprint !== context.requestFingerprint) {
      throw new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', 'This Idempotency-Key was already used with a materially different request.');
    }
    if (existing?.state === 'COMPLETE') return { value: existing.value, replayed: true, operationId: existing.operationId };
    if (existing?.state === 'PROCESSING') throw new ApiError(409, 'IDEMPOTENCY_REQUEST_IN_PROGRESS', 'An equivalent request is still being processed.');
    const operationId = existing?.operationId ?? createTransactionId();
    this.records.set(id, { state: 'PROCESSING', fingerprint: context.requestFingerprint, operationId });
    try {
      const value = await operation(operationId, passThroughIdempotencyFence(operationId));
      this.records.set(id, { state: 'COMPLETE', fingerprint: context.requestFingerprint, operationId, value });
      return { value, replayed: false, operationId };
    } catch (error) {
      this.records.set(id, { state: 'FAILED', fingerprint: context.requestFingerprint, operationId });
      throw error;
    }
  }
}

class InMemoryTransactionRepository {
  records = new Map();
  outbox = new Map();

  async create(transaction, event) {
    const existing = this.records.get(transaction.id);
    if (existing) {
      if (!this.outbox.has(event.id)) this.outbox.set(event.id, event);
      return existing;
    }
    this.records.set(transaction.id, transaction);
    this.outbox.set(event.id, event);
    return transaction;
  }

  async findByIdForOrganization(id, organizationId) {
    const record = this.records.get(id);
    return record?.organizationId === organizationId ? record : null;
  }

  async listForOrganization(organizationId, input) {
    const queryHash = transactionQueryHash(organizationId, input);
    let records = [...this.records.values()]
      .filter((entry) => entry.organizationId === organizationId)
      .filter((entry) => !input.status || entry.status === input.status)
      .filter((entry) => !input.merchantReference || entry.merchantReference === input.merchantReference)
      .filter((entry) => !input.createdAfter || entry.createdAt >= input.createdAfter)
      .filter((entry) => !input.createdBefore || entry.createdAt < input.createdBefore)
      .sort((left, right) => right.createdAt - left.createdAt || right.id.localeCompare(left.id));
    if (input.cursor) {
      const cursor = decodeTransactionCursor(input.cursor);
      if (cursor.queryHash !== queryHash) throw new ApiError(400, 'CURSOR_QUERY_MISMATCH', 'This cursor belongs to a different transaction query.');
      const index = records.findIndex((entry) => entry.id === cursor.id && entry.createdAt.toISOString() === cursor.createdAt);
      if (index < 0) throw new ApiError(400, 'INVALID_CURSOR', 'The pagination cursor is invalid or expired.');
      records = records.slice(index + 1);
    }
    const hasMore = records.length > input.limit;
    const transactions = records.slice(0, input.limit);
    const last = transactions.at(-1);
    return {
      transactions,
      nextCursor: hasMore && last ? encodeTransactionCursor({ createdAt: last.createdAt.toISOString(), id: last.id, queryHash }) : null,
    };
  }
}

class InMemoryAuditWriter {
  events = new Map();
  headHash = 'GENESIS';

  async append(event) {
    if (this.events.has(event.eventId)) return;
    const immutable = { ...event, actor: { apiClientId: event.actor.apiClientId, credentialId: event.actor.credentialId }, previousHash: this.headHash };
    const eventHash = sha256(canonicalize(immutable));
    this.events.set(event.eventId, { ...immutable, eventHash });
    this.headHash = eventHash;
  }
}

class AllowingRateLimiter {
  denyNext = false;

  async consume(_principalId, policy) {
    if (this.denyNext) {
      this.denyNext = false;
      return { allowed: false, limit: policy.limit, remaining: 0, resetAt: new Date(Date.now() + 5_000) };
    }
    return { allowed: true, limit: policy.limit, remaining: policy.limit - 1, resetAt: new Date(Date.now() + policy.windowSeconds * 1_000) };
  }
}

class InMemoryPublicHandoffRepository {
  mutation = null;

  async findIntegrationByPublishableKey(publishableKey) {
    if (publishableKey !== `pp_pub_sandbox_${'A'.repeat(24)}`) return null;
    return { id: 'integrationButton001', environment: 'sandbox', status: 'ACTIVE', allowedOrigins: ['https://shop.example'] };
  }

  async createOrReplay(mutation) {
    if (this.mutation && this.mutation.requestFingerprint !== mutation.requestFingerprint) {
      throw new ApiError(409, 'IDEMPOTENCY_KEY_REUSED', 'changed public handoff request');
    }
    if (this.mutation) return { created: false, expiresAt: this.mutation.expiresAt };
    this.mutation = mutation;
    return { created: true, expiresAt: mutation.expiresAt };
  }

  async hasActiveTransactionForSeller() { return false; }
  async redeem() { throw new Error('not used by HTTP boundary tests'); }
}

class FakeParticipantAuthenticator {
  async authenticate(authorization, appCheckToken) {
    if (authorization !== 'Bearer user-a' || appCheckToken !== 'app-check-a') {
      throw new ApiError(401, 'INVALID_PARTICIPANT_AUTHENTICATION', 'A valid PackProof user session and App Check token are required.');
    }
    return { type: 'PACKPROOF_USER', actorId: 'user-a', appId: 'app-a' };
  }
}

class FakePortalAuthenticator {
  async authenticate(authorization, appCheckToken) {
    if (authorization !== 'Bearer portal-a' || appCheckToken !== 'app-check-portal') {
      throw new ApiError(401, 'INVALID_PORTAL_AUTHENTICATION', 'A valid PackProof user session and App Check token are required.');
    }
    return { type: 'PORTAL_USER', actorId: 'user-a', appId: 'app-a', channel: 'WEB_PORTAL' };
  }
}

class FakePortalWorkspaceService {
  records = new Map();

  seed(record) {
    this.records.set(record.id, record);
  }

  async session(principal) {
    return { actorId: principal.actorId, channel: 'WEB_PORTAL' };
  }

  async listTransactions(principal) {
    return [...this.records.values()].filter((item) => item.participantIds.includes(principal.actorId));
  }

  async getTransaction(principal, transactionId) {
    const record = this.records.get(transactionId);
    if (!record || !record.participantIds.includes(principal.actorId)) {
      throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'The requested PackProof was not found.');
    }
    return record;
  }

  async getTimeline(principal, transactionId) {
    await this.getTransaction(principal, transactionId);
    return [{ id: 'evt_1', object: 'timeline_event', schemaVersion: 1, transactionId, type: 'CREATED', summary: 'Created', occurredAt: '2026-08-19T12:00:00.000Z' }];
  }

  async listEvidence(principal, transactionId) {
    await this.getTransaction(principal, transactionId);
    return [];
  }

  async getPassport(principal, transactionId) {
    await this.getTransaction(principal, transactionId);
    return { object: 'packproof_passport', schemaVersion: 1, identity: { passportId: 'ppt_1', displayId: 'PP-TEST' } };
  }

  async createMobileHandoff(principal, transactionId, action) {
    await this.getTransaction(principal, transactionId);
    return {
      object: 'portal_mobile_handoff',
      schemaVersion: 1,
      channel: 'WEB_PORTAL',
      transactionId,
      action,
      captureOnNativeOnly: true,
      universalLink: `https://packproof.example/portal/open?transaction=${transactionId}&action=pack`,
      appLink: `packproof://pack/${transactionId}`,
      storeUrl: 'https://play.google.com/store/apps/details?id=com.packproof.app',
    };
  }
}

class FakeMerchantEvidenceService {
  artifacts = new Map();
  timeline = new Map();
  reports = new Map();
  shipments = new Map();
  returns = new Map();
  deliveries = new Map();
  passports = new Map();
  snapshots = new Map();

  seedArtifact(transactionId, artifact) {
    const key = `${transactionId}:${artifact.id}`;
    this.artifacts.set(key, artifact);
    const list = this.artifacts.get(transactionId) ?? [];
    list.push(artifact);
    this.artifacts.set(transactionId, list);
  }

  requireScope(principal, scope) {
    if (!principal.scopes.includes(scope)) throw new ApiError(403, 'INSUFFICIENT_SCOPE', 'The API credential does not grant this operation.');
  }

  async listEvidence(principal, transactionId) {
    this.requireScope(principal, 'evidence:read');
    if (transactionId.endsWith('missing')) throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'missing');
    return this.artifacts.get(transactionId) ?? [];
  }

  async getEvidence(principal, transactionId, artifactId) {
    this.requireScope(principal, 'evidence:read');
    const artifact = this.artifacts.get(`${transactionId}:${artifactId}`);
    if (!artifact) throw new ApiError(404, 'EVIDENCE_NOT_FOUND', 'missing');
    return artifact;
  }

  async getTimeline(principal, transactionId) {
    this.requireScope(principal, 'transactions:read');
    return this.timeline.get(transactionId) ?? [];
  }

  async getReviewPackage(principal, transactionId) {
    this.requireScope(principal, 'evidence:read');
    return {
      id: `review_${transactionId.slice(-8)}`, object: 'review_package', schemaVersion: 1, transactionId,
      title: 'Review camera', merchantReference: 'order-1', status: 'CREATED', amount: null, terms: null,
      protocolCompleteness: {
        sellerPackingVideo: 'ABSENT', sellerSealReference: 'ABSENT', buyerArrivalObservation: 'ABSENT',
        buyerUnboxing: 'ABSENT', returnPackingVideo: 'ABSENT', returnSealReference: 'ABSENT',
      },
      documentationCategories: [], evidence: this.artifacts.get(transactionId) ?? [], shipment: null, delivery: null,
      returns: [], latestReport: null, timeline: [],
      limitations: {
        physicalCorrespondence: 'NOT_AVAILABLE', businessLegalRelevance: 'REVIEW_REQUIRED',
        doesNotAuthenticateItem: true, doesNotProveCustody: true, doesNotDecideFraudOrFault: true,
        doesNotGuaranteeDisputeOutcome: true, dossierIsPresentationOnly: true,
        manifestAuthenticationScope: 'PACKPROOF_SERVICE_ONLY', humanReviewDisclaimer: 'Human review only.',
      },
      createdAt: '2026-08-11T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z',
    };
  }

  passportFor(transactionId) {
    const artifacts = this.artifacts.get(transactionId) ?? [];
    if (!artifacts.some((item) => item.status === 'FINALIZED' && item.sha256 && item.manifestSha256)) {
      throw new ApiError(409, 'PASSPORT_NOT_READY', 'This transaction does not yet qualify for a Proof.');
    }
    const passportId = `ppt_${'a'.repeat(40)}`;
    const displayId = 'PP-AAAA-AAAA-AAAA';
    this.passports.set(passportId, transactionId);
    this.passports.set(displayId, transactionId);
    return {
      object: 'packproof_passport', schemaVersion: 1,
      identity: {
        passportId, displayId, schemaVersion: 1, rendererCompatibility: 'PASSPORT_WEB_V1',
        transactionId, state: 'CURRENT', issuedAt: '2026-08-11T12:00:00.000Z', sourceUpdatedAt: '2026-08-11T12:00:00.000Z',
        merchantPlatform: 'CUSTOM', externalOrderId: 'order-1',
        verificationUrl: `https://packproof.example/proof/${displayId}`, qrPayload: `https://packproof.example/proof/${displayId}`,
      },
      integrity: {
        banner: 'AUTHENTIC_PACKPROOF', summary: 'PackProof record integrity verified',
        meaning: "PackProof's evidence records and integrity bindings associated with this Passport successfully verify.",
        criteria: { passportRecord: 'VERIFIED', evidenceManifests: 'VERIFIED', evidenceFileDigests: 'VERIFIED', bundleBindings: 'VERIFIED', finalization: 'VERIFIED', provenance: 'VERIFIED', evidenceLineage: 'VERIFIED' },
        manifestAuthentication: { type: 'SERVICE_MAC', algorithm: 'HMAC-SHA256', verificationScope: 'PACKPROOF_SERVICE_ONLY', keyId: 'packproof-manifest-v1', publiclyVerifiable: false },
        canonicalizationProfile: 'PACKPROOF_JCS_1', bundleBindingProfile: 'PACKPROOF_EVIDENCE_BUNDLE_V2',
      },
      transaction: {
        commerceContextId: null,
        platform: { value: 'CUSTOM', provenanceClass: 'SOURCE_ASSERTION', assertingSource: 'MERCHANT_API', trustClass: 'MERCHANT_SERVER_ATTESTED', recordedAt: '2026-08-11T12:00:00.000Z', sourceRecordId: transactionId, sourceReference: 'order-1', digestSha256: null },
        externalOrderId: { value: 'order-1', provenanceClass: 'SOURCE_ASSERTION', assertingSource: 'MERCHANT_API', trustClass: 'MERCHANT_SERVER_ATTESTED', recordedAt: '2026-08-11T12:00:00.000Z', sourceRecordId: transactionId, sourceReference: 'order-1', digestSha256: null },
        transactionDate: { value: '2026-08-11T12:00:00.000Z', provenanceClass: 'SOURCE_ASSERTION', assertingSource: 'MERCHANT_API', trustClass: 'MERCHANT_SERVER_ATTESTED', recordedAt: '2026-08-11T12:00:00.000Z', sourceRecordId: transactionId, sourceReference: 'order-1', digestSha256: null },
        amount: { value: null, provenanceClass: 'SOURCE_ASSERTION', assertingSource: 'MERCHANT_API', trustClass: 'MERCHANT_SERVER_ATTESTED', recordedAt: '2026-08-11T12:00:00.000Z', sourceRecordId: transactionId, sourceReference: 'order-1', digestSha256: null },
        sellerReference: { value: null, provenanceClass: 'SOURCE_ASSERTION', assertingSource: null, trustClass: null, recordedAt: null, sourceRecordId: null, sourceReference: null, digestSha256: null },
        destination: { value: null, provenanceClass: 'SOURCE_ASSERTION', assertingSource: null, trustClass: null, recordedAt: null, sourceRecordId: null, sourceReference: null, digestSha256: null },
        itemCount: { value: null, provenanceClass: 'SOURCE_ASSERTION', assertingSource: null, trustClass: null, recordedAt: null, sourceRecordId: null, sourceReference: null, digestSha256: null },
        sourceTrustClass: 'MERCHANT_SERVER_ATTESTED', importedAt: null, canonicalPayloadSha256: null,
      },
      items: [{ index: 0, expected: {
        title: { value: 'Review camera', provenanceClass: 'SOURCE_ASSERTION', assertingSource: 'MERCHANT_API', trustClass: 'MERCHANT_SERVER_ATTESTED', recordedAt: '2026-08-11T12:00:00.000Z', sourceRecordId: transactionId, sourceReference: 'order-1', digestSha256: null },
        sku: { value: null, provenanceClass: 'SOURCE_ASSERTION', assertingSource: null, trustClass: null, recordedAt: null, sourceRecordId: null, sourceReference: null, digestSha256: null },
        gtin: { value: null, provenanceClass: 'SOURCE_ASSERTION', assertingSource: null, trustClass: null, recordedAt: null, sourceRecordId: null, sourceReference: null, digestSha256: null },
        upc: { value: null, provenanceClass: 'SOURCE_ASSERTION', assertingSource: null, trustClass: null, recordedAt: null, sourceRecordId: null, sourceReference: null, digestSha256: null },
        variant: { value: null, provenanceClass: 'SOURCE_ASSERTION', assertingSource: null, trustClass: null, recordedAt: null, sourceRecordId: null, sourceReference: null, digestSha256: null },
        quantity: { value: null, provenanceClass: 'SOURCE_ASSERTION', assertingSource: null, trustClass: null, recordedAt: null, sourceRecordId: null, sourceReference: null, digestSha256: null },
        declaredCondition: { value: null, provenanceClass: 'SOURCE_ASSERTION', assertingSource: null, trustClass: null, recordedAt: null, sourceRecordId: null, sourceReference: null, digestSha256: null },
        serialExpected: { value: null, provenanceClass: 'SOURCE_ASSERTION', assertingSource: null, trustClass: null, recordedAt: null, sourceRecordId: null, sourceReference: null, digestSha256: null },
        merchantItemId: { value: null, provenanceClass: 'SOURCE_ASSERTION', assertingSource: null, trustClass: null, recordedAt: null, sourceRecordId: null, sourceReference: null, digestSha256: null },
        listingReference: { value: null, provenanceClass: 'SOURCE_ASSERTION', assertingSource: null, trustClass: null, recordedAt: null, sourceRecordId: null, sourceReference: null, digestSha256: null },
      }, observations: [], comparisons: [] }],
      fulfillment: {
        captureSessionId: null, packingArtifactId: artifacts[0]?.id ?? null, sealArtifactId: null, labelArtifactId: null,
        trackingObserved: { value: null, provenanceClass: 'PACKPROOF_OBSERVATION', assertingSource: null, trustClass: null, recordedAt: null, sourceRecordId: null, sourceReference: null, digestSha256: null },
        shippingTracker: { value: null, provenanceClass: 'PACKPROOF_OBSERVATION', assertingSource: null, trustClass: null, recordedAt: null, sourceRecordId: null, sourceReference: null, digestSha256: null },
      },
      shipment: null, delivery: null, receiver: null, returns: [],
      evidenceInventory: [{ category: 'PACKING_CAPTURE', state: 'AVAILABLE', artifactIds: artifacts.map((item) => item.id) }],
      artifacts: [], timeline: [], reviewContext: null, provenance: [],
      limitations: {
        physicalCorrespondence: 'NOT_AVAILABLE', businessLegalRelevance: 'REVIEW_REQUIRED',
        doesNotAuthenticateItem: true, doesNotProveCustody: true, doesNotDecideFraudOrFault: true,
        doesNotGuaranteeDisputeOutcome: true, absenceOfEvidenceDoesNotAffectAuthenticity: true,
        noEvidentiaryWeightScore: true, presentationExportIsNotSource: true,
        manifestAuthenticationScope: 'PACKPROOF_SERVICE_ONLY',
        shippingTrackerInterpretation: 'OPEN_SOURCE_TRACKING_NUMBER_VALIDATION_NOT_CARRIER_CUSTODY',
        humanReviewDisclaimer: 'Human review only.',
      },
      createdAt: '2026-08-11T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z',
    };
  }

  async getPassport(principal, transactionId) {
    this.requireScope(principal, 'evidence:read');
    if (transactionId.endsWith('missing')) throw new ApiError(404, 'TRANSACTION_NOT_FOUND', 'missing');
    return this.passportFor(transactionId);
  }

  async getPassportByIdentity(principal, passportIdentity) {
    this.requireScope(principal, 'evidence:read');
    const transactionId = this.passports.get(passportIdentity);
    if (!transactionId) throw new ApiError(404, 'PASSPORT_NOT_FOUND', 'missing');
    return this.passportFor(transactionId);
  }

  async createPassportSnapshot(principal, transactionId) {
    this.requireScope(principal, 'evidence:read');
    const passport = this.passportFor(transactionId);
    const snapshot = {
      object: 'packproof_passport_snapshot', schemaVersion: 1, snapshotId: `pps_${'b'.repeat(40)}`,
      passportId: passport.identity.passportId, transactionId, snapshotVersion: 1, passport,
      canonicalPayloadSha256: 'c'.repeat(64), rendererVersion: 'packproof-passport-pdf@1.0.0',
      generatedAt: '2026-08-11T12:00:00.000Z',
    };
    this.snapshots.set(snapshot.snapshotId, snapshot);
    return { snapshot, replayed: false };
  }

  async getPassportSnapshot(principal, passportIdentity, snapshotId) {
    this.requireScope(principal, 'evidence:read');
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) throw new ApiError(404, 'PASSPORT_SNAPSHOT_NOT_FOUND', 'missing');
    return snapshot;
  }

  async createPassportExport(principal, passportIdentity, snapshotId) {
    this.requireScope(principal, 'evidence:read');
    const snapshot = this.snapshots.get(snapshotId);
    if (!snapshot) throw new ApiError(404, 'PASSPORT_SNAPSHOT_NOT_FOUND', 'missing');
    return {
      export: {
        object: 'packproof_passport_export', schemaVersion: 1, snapshotId, format: 'PDF', presentationOnly: true,
        downloadUrl: 'https://files.example/passport.pdf', downloadUrlExpiresAt: '2026-08-11T12:15:00.000Z',
        fileSha256: 'd'.repeat(64), rendererVersion: 'packproof-passport-pdf@1.0.0',
      },
      replayed: false,
    };
  }

  async createReport(principal, transactionId) {
    this.requireScope(principal, 'evidence:read');
    const report = {
      id: 'report_http_1', object: 'evidence_report', schemaVersion: 1, transactionId, status: 'AVAILABLE',
      reportSha256: 'a'.repeat(64), evidenceCount: 0, presentationOnly: true,
      generatedAt: '2026-08-11T12:00:00.000Z', downloadUrl: 'https://files.example/report.pdf',
      downloadUrlExpiresAt: '2026-08-11T12:15:00.000Z',
    };
    this.reports.set(`${transactionId}:${report.id}`, report);
    return { report, replayed: false };
  }

  async getReport(principal, transactionId, reportId) {
    this.requireScope(principal, 'evidence:read');
    const report = this.reports.get(`${transactionId}:${reportId}`);
    if (!report) throw new ApiError(404, 'EVIDENCE_REPORT_NOT_FOUND', 'missing');
    return report;
  }

  async getShipment(principal, transactionId) {
    this.requireScope(principal, 'shipments:read');
    const shipment = this.shipments.get(transactionId);
    if (!shipment) throw new ApiError(404, 'SHIPMENT_NOT_FOUND', 'missing');
    return shipment;
  }

  async associateShipment(principal, transactionId, input) {
    this.requireScope(principal, 'shipments:write');
    const shipment = {
      id: `shipment_${transactionId.slice(-8)}`, object: 'shipment', schemaVersion: 1, transactionId,
      carrier: input.carrier, trackingNumber: input.trackingNumber, assertionSource: 'MERCHANT',
      status: 'ASSOCIATED', packingEvidenceId: 'pack-1', sealEvidenceId: 'seal-1',
      labelEvidenceMatchStatus: 'NOT_SCANNED', shippedAt: '2026-08-11T12:00:00.000Z',
      createdAt: '2026-08-11T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z',
    };
    this.shipments.set(transactionId, shipment);
    return { shipment, replayed: false };
  }

  async listReturns(principal, transactionId) {
    this.requireScope(principal, 'transactions:read');
    return this.returns.get(transactionId) ?? [];
  }

  async createReturn(principal, transactionId, input) {
    this.requireScope(principal, 'transactions:write');
    const item = {
      id: `return_${transactionId.slice(-8)}`, object: 'return_passport', schemaVersion: 1, transactionId,
      reason: input.reason, status: 'REQUESTED', originalEvidenceHashes: [], shippingCarrier: null,
      shippingTrackingNumber: null, packingEvidenceId: null, sealEvidenceId: null, labelEvidenceMatchStatus: null,
      createdAt: '2026-08-11T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z',
    };
    const list = this.returns.get(transactionId) ?? [];
    list.push(item);
    this.returns.set(transactionId, list);
    return { returnPassport: item, replayed: false };
  }

  async associateReturnShipment(principal, transactionId, returnPassportId, input) {
    this.requireScope(principal, 'shipments:write');
    const item = (this.returns.get(transactionId) ?? []).find((entry) => entry.id === returnPassportId);
    if (!item) throw new ApiError(404, 'RETURN_PASSPORT_NOT_FOUND', 'missing');
    Object.assign(item, { status: 'IN_TRANSIT', shippingCarrier: input.carrier, shippingTrackingNumber: input.trackingNumber });
    return { returnPassport: item, replayed: false };
  }

  async getDelivery(principal, transactionId) {
    this.requireScope(principal, 'shipments:read');
    const delivery = this.deliveries?.get(transactionId);
    if (!delivery) throw new ApiError(404, 'DELIVERY_NOT_FOUND', 'missing');
    return delivery;
  }

  async associateDelivery(principal, transactionId, input) {
    this.requireScope(principal, 'shipments:write');
    this.deliveries ??= new Map();
    const delivery = {
      id: `delivery_${transactionId.slice(-8)}`, object: 'delivery', schemaVersion: 1, transactionId,
      assertionSource: 'MERCHANT', status: 'ASSOCIATED', arrivalEvidenceId: 'arrive-1',
      carrier: input.carrier ?? null, trackingNumber: input.trackingNumber ?? null,
      labelEvidenceMatchStatus: 'NOT_SCANNED', receivedAt: '2026-08-11T12:00:00.000Z',
      createdAt: '2026-08-11T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z',
    };
    this.deliveries.set(transactionId, delivery);
    return { delivery, replayed: false };
  }

  async getReturn(principal, transactionId, returnPassportId) {
    this.requireScope(principal, 'transactions:read');
    const item = (this.returns.get(transactionId) ?? []).find((entry) => entry.id === returnPassportId);
    if (!item) throw new ApiError(404, 'RETURN_PASSPORT_NOT_FOUND', 'missing');
    return item;
  }
}

class FakeMerchantConnectService {
  sessions = new Map();

  async createSession(principal, input) {
    if (!principal.scopes.includes('transactions:write')) throw new ApiError(403, 'INSUFFICIENT_SCOPE', 'missing scope');
    if (!principal.integrationId) throw new ApiError(403, 'INTEGRATION_NOT_BOUND', 'unbound');
    const session = {
      id: 'a'.repeat(64), object: 'connect_session', schemaVersion: 1, platform: input.platform,
      externalOrderId: input.externalOrderId, status: 'PENDING_REDEMPTION', transactionId: null,
      commerceContextId: `ctx_${'d'.repeat(40)}`, itemTitle: input.itemTitle, amount: input.amount,
      trackingNumber: input.trackingNumber ?? null, carrier: input.carrier ?? null,
      expiresAt: '2026-08-18T12:00:00.000Z', createdAt: '2026-08-11T12:00:00.000Z',
    };
    this.sessions.set(session.id, session);
    return {
      session,
      captureUrl: `https://packproof.example/connect/capture?session=${session.id}&token=connect-token`,
      token: 'connect-token',
      replayed: false,
    };
  }

  async getSession(principal, sessionId) {
    if (!principal.scopes.includes('transactions:read')) throw new ApiError(403, 'INSUFFICIENT_SCOPE', 'missing scope');
    const session = this.sessions.get(sessionId);
    if (!session) throw new ApiError(404, 'CONNECT_SESSION_NOT_FOUND', 'missing');
    return session;
  }

  async listSessions(principal, externalOrderId) {
    if (!principal.scopes.includes('transactions:read')) throw new ApiError(403, 'INSUFFICIENT_SCOPE', 'missing scope');
    return [...this.sessions.values()].filter((session) => session.externalOrderId === externalOrderId);
  }

  async cancelSession(principal, sessionId) {
    if (!principal.scopes.includes('transactions:write')) throw new ApiError(403, 'INSUFFICIENT_SCOPE', 'missing scope');
    const session = this.sessions.get(sessionId);
    if (!session) throw new ApiError(404, 'CONNECT_SESSION_NOT_FOUND', 'missing');
    if (session.status === 'CANCELLED') return { session, replayed: true };
    if (session.transactionId) throw new ApiError(409, 'CONNECT_SESSION_NOT_CANCELLABLE', 'redeemed');
    const cancelled = { ...session, status: 'CANCELLED' };
    this.sessions.set(sessionId, cancelled);
    return { session: cancelled, replayed: false };
  }
}

class FakeParticipantCaptureService {
  claims = new Map();
  sessions = new Map();

  async createInvitation({ transactionId, input }) {
    const claim = {
      id: `claim_${'a'.repeat(40)}`, object: 'participant_claim', schemaVersion: 1, transactionId, role: input.role,
      status: 'ISSUED', expiresAt: '2026-08-12T12:00:00.000Z', claimedAt: null,
      createdAt: '2026-08-11T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z',
    };
    this.claims.set(claim.id, claim);
    return { claim, token: `pp_claim_v1_${'A'.repeat(43)}`, replayed: false };
  }

  async claimParticipant({ principal, claimId }) {
    const claim = this.claims.get(claimId);
    if (!claim) throw new ApiError(404, 'PARTICIPANT_CLAIM_NOT_FOUND', 'missing');
    const updated = { ...claim, status: 'CLAIMED', claimedAt: '2026-08-11T12:01:00.000Z', updatedAt: '2026-08-11T12:01:00.000Z' };
    this.claims.set(claimId, updated);
    this.actorId = principal.actorId;
    return { claim: updated, transactionId: updated.transactionId, role: updated.role, replayed: false };
  }

  async createEvidenceSession({ transactionId, input }) {
    const session = {
      id: `es_${'b'.repeat(40)}`, object: 'evidence_session', schemaVersion: 1, transactionId, commerceContextId: null,
      returnPassportId: null, actorRole: 'SELLER', type: input.type, protocolVersion: 'PP-CAPTURE-V1',
      allowedArtifactTypes: input.allowedArtifactTypes, status: 'READY', captureState: 'READY', syncState: 'NOT_STARTED', processingState: 'NOT_STARTED',
      maximumRedemptions: input.maximumRedemptions, redemptionCount: 0, requestedEvidenceCount: input.requestedEvidenceCount,
      captureProfileId: input.captureProfileId, captureGroupId: input.captureGroupId, expiresAt: '2026-08-12T12:00:00.000Z',
      startedAt: null, completedAt: null, originalArtifactSha256: null, normalizedSnapshotSha256: null, intakeFrozenAt: null,
      createdAt: '2026-08-11T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z',
    };
    this.sessions.set(session.id, session);
    return { session, token: `pp_capture_v1_${'B'.repeat(43)}`, replayed: false };
  }

  async getEvidenceSession(_principal, id) {
    const session = this.sessions.get(id);
    if (!session) throw new ApiError(404, 'EVIDENCE_SESSION_NOT_FOUND', 'missing');
    return session;
  }

  async redeemEvidenceSession({ principal, evidenceSessionId }) {
    const session = this.sessions.get(evidenceSessionId);
    if (!session || principal.actorId !== 'user-a') throw new ApiError(404, 'EVIDENCE_SESSION_NOT_FOUND', 'missing');
    const updated = { ...session, status: 'CAPTURING', captureState: 'CAPTURING', redemptionCount: 1, startedAt: '2026-08-11T12:02:00.000Z' };
    this.sessions.set(evidenceSessionId, updated);
    return {
      evidenceSession: updated,
      captureAttestation: {
        mode: 'JIT_APP_CHECK', captureSessionId: `cap_${'c'.repeat(40)}`, nonce: 'nonce', appId: principal.appId,
        issuedAt: '2026-08-11T12:02:00.000Z', captureWindowEndsAt: '2026-08-11T12:12:00.000Z', tokenReplayDetected: false,
        reasonCodes: [], sessionMode: 'SINGLE', maxEvidenceCount: 1, captureGroupId: null,
      },
      replayed: false,
    };
  }

  async cancelEvidenceSession({ evidenceSessionId }) {
    const session = this.sessions.get(evidenceSessionId);
    if (!session) throw new ApiError(404, 'EVIDENCE_SESSION_NOT_FOUND', 'missing');
    const updated = { ...session, status: 'CANCELLED', captureState: 'CANCELLED' };
    this.sessions.set(evidenceSessionId, updated);
    return { session: updated, replayed: false };
  }
}

function buildApp() {
  const repository = new InMemoryTransactionRepository();
  const idempotency = new InMemoryIdempotencyStore();
  const audit = new InMemoryAuditWriter();
  const rateLimiter = new AllowingRateLimiter();
  let tick = 0;
  const service = new TransactionService(
    repository,
    idempotency,
    audit,
    new AuthorizationService(),
    { environment: 'sandbox' },
    () => new Date(Date.UTC(2026, 7, 10, 12, 0, tick++)),
  );
  const publicRepository = new InMemoryPublicHandoffRepository();
  const publicCommerceHandoffService = new PublicCommerceHandoffApplicationService(
    publicRepository,
    { issue: (handoffId) => `public-token-${handoffId}`, digest: (token) => sha256(token) },
    { verify: (token, expected) => sha256(token) === expected },
    () => 'sandbox',
    () => new Date('2026-08-11T12:00:00.000Z'),
  );
  const participantCaptureService = new FakeParticipantCaptureService();
  const merchantEvidenceService = new FakeMerchantEvidenceService();
  const merchantConnectService = new FakeMerchantConnectService();
  const portalWorkspaceService = new FakePortalWorkspaceService();
  const app = createApiV1App({
    authenticator: new FakeAuthenticator(),
    participantAuthenticator: new FakeParticipantAuthenticator(),
    portalAuthenticator: new FakePortalAuthenticator(),
    portalWorkspaceService,
    rateLimiter,
    readiness: { check: async () => undefined },
    transactionService: service,
    participantCaptureService,
    publicCommerceHandoffService,
    merchantEvidenceService,
    merchantConnectService,
    publicHandoffReviewBaseUrl: () => 'https://packproof.example',
    participantHandoffBaseUrl: () => 'https://packproof.example',
  });
  return { app, repository, idempotency, audit, rateLimiter, publicRepository, participantCaptureService, merchantEvidenceService, merchantConnectService, portalWorkspaceService };
}

const harness = buildApp();
const server = createServer(harness.app);
let baseUrl;

before(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
});

async function jsonRequest(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, init);
  const body = await response.json();
  return { response, body };
}

function createRequest(reference, key, overrides = {}) {
  return jsonRequest('/v1/transactions', {
    method: 'POST',
    headers: {
      authorization: 'Bearer write-a',
      'content-type': 'application/json',
      'idempotency-key': key,
      'x-request-id': `request-${key}`,
    },
    body: JSON.stringify({
      merchantReference: reference,
      title: 'Vintage camera',
      amount: { currency: 'usd', minorUnits: 12000 },
      participants: [{ role: 'SELLER', externalReference: 'seller-42' }],
      captureRequirements: { requiredArtifactTypes: ['ITEM_PHOTO', 'PACKING_VIDEO'] },
      ...overrides,
    }),
  });
}

const publishableKey = `pp_pub_sandbox_${'A'.repeat(24)}`;
function publicHandoffBody(overrides = {}) {
  return {
    schemaVersion: 1,
    source: {
      platform: 'STRUCTURED_PAGE_DATA',
      productUrl: 'https://shop.example/products/camera',
      externalProductId: 'product-42',
      externalListingId: null,
      externalVariantId: 'black',
    },
    item: {
      title: 'Structured camera',
      description: 'Full page-declared listing description.',
      category: 'Vintage cameras',
      brand: 'Example Optics',
      model: 'RF-50',
      sku: 'RF50-42',
      gtin: null,
      upc: null,
      mpn: null,
      serialNumber: null,
      selectedOptions: [{ name: 'Finish', value: 'Black' }],
      identifiers: [{ type: 'SKU', value: 'RF50-42' }],
      quantity: 1,
      amount: { currency: 'USD', minorUnits: 129900 },
      imageReferences: [{ url: 'https://cdn.example/camera.jpg', altText: 'Front listing image' }],
    },
    ...overrides,
  };
}

function publicHandoffRequest(key, body = publicHandoffBody(), origin = 'https://shop.example') {
  return jsonRequest(`/v1/public/integrations/${publishableKey}/handoffs`, {
    method: 'POST',
    headers: { origin, 'content-type': 'application/json', 'idempotency-key': key, 'x-request-id': `request-${key}` },
    body: JSON.stringify(body),
  });
}

describe('PackProof API v1 HTTP boundary', () => {
  test('health and readiness do not require merchant credentials', async () => {
    const health = await jsonRequest('/v1/health');
    const ready = await jsonRequest('/v1/ready');
    assert.equal(health.response.status, 200);
    assert.equal(health.body.data.status, 'OK');
    assert.equal(ready.response.status, 200);
    assert.equal(ready.body.data.status, 'READY');
    assert.ok(health.response.headers.get('x-request-id'));
    assert.equal(health.response.headers.get('x-content-type-options'), 'nosniff');
    assert.equal(health.response.headers.get('x-frame-options'), 'DENY');
    assert.equal(health.response.headers.get('referrer-policy'), 'no-referrer');
    assert.equal(health.response.headers.get('strict-transport-security'), 'max-age=31536000; includeSubDomains');
    assert.equal(health.response.headers.get('cross-origin-opener-policy'), 'same-origin');
  });

  test('rejects non-HTTPS and non-exact Origin headers before CORS reflection', async () => {
    const httpOrigin = await publicHandoffRequest('button-request-http-origin', publicHandoffBody(), 'http://shop.example');
    assert.equal(httpOrigin.response.status, 400);
    assert.equal(httpOrigin.body.error.details[0].code, 'INVALID_ORIGIN');
    assert.equal(httpOrigin.response.headers.get('access-control-allow-origin'), null);

    const trailingSlash = await publicHandoffRequest('button-request-origin-slash', publicHandoffBody(), 'https://shop.example/');
    assert.equal(trailingSlash.response.status, 400);
    assert.equal(trailingSlash.body.error.details[0].code, 'INVALID_ORIGIN');
  });

  test('issues an exact-origin, page-declared public commerce handoff and replays it safely', async () => {
    const preflight = await fetch(`${baseUrl}/v1/public/integrations/${publishableKey}/handoffs`, {
      method: 'OPTIONS',
      headers: { origin: 'https://shop.example', 'access-control-request-method': 'POST', 'access-control-request-headers': 'content-type,idempotency-key' },
    });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get('access-control-allow-origin'), 'https://shop.example');
    assert.equal(preflight.headers.get('access-control-allow-credentials'), null);

    const first = await publicHandoffRequest('button-request-1001');
    assert.equal(first.response.status, 201);
    assert.equal(first.response.headers.get('access-control-allow-origin'), 'https://shop.example');
    assert.equal(first.response.headers.get('idempotent-replayed'), 'false');
    assert.equal(first.body.data.object, 'commerce_handoff');
    assert.equal(first.body.data.trustLevel, 'PAGE_DECLARED');
    assert.equal(first.body.data.status, 'PENDING_CLAIM');
    assert.match(first.body.data.id, /^hnd_[a-f0-9]{40}$/);
    assert.match(first.body.data.commerceContextId, /^ctx_[a-f0-9]{40}$/);
    assert.match(first.body.data.passportDraftId, /^draft_[a-f0-9]{40}$/);
    assert.ok(first.body.data.reviewUrl.startsWith('https://packproof.example/handoff/review?'));
    assert.equal(harness.publicRepository.mutation.commerceContext.status, 'HANDOFF_ISSUED');
    assert.equal(harness.publicRepository.mutation.commerceContext.source.externalOrderId, null);
    assert.equal(harness.publicRepository.mutation.passportDraft.item.description, 'Full page-declared listing description.');

    const replay = await publicHandoffRequest('button-request-1001');
    assert.equal(replay.response.status, 200);
    assert.equal(replay.response.headers.get('idempotent-replayed'), 'true');
    assert.equal(replay.body.data.id, first.body.data.id);
    const changed = publicHandoffBody();
    changed.item.description = 'Changed after the retry identity was reserved.';
    const conflict = await publicHandoffRequest('button-request-1001', changed);
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.body.error.code, 'IDEMPOTENCY_KEY_REUSED');
  });

  test('rejects origin spoofing, product-origin mismatch, and order-claim fields on the public route', async () => {
    const disallowed = await publicHandoffRequest('button-request-origin', publicHandoffBody(), 'https://attacker.example');
    assert.equal(disallowed.response.status, 403);
    assert.equal(disallowed.body.error.code, 'ORIGIN_NOT_ALLOWED');
    assert.equal(disallowed.response.headers.get('access-control-allow-origin'), null);

    const mismatch = await publicHandoffRequest('button-request-mismatch', publicHandoffBody({
      source: { ...publicHandoffBody().source, productUrl: 'https://other.example/products/camera' },
    }));
    assert.equal(mismatch.response.status, 403);
    assert.equal(mismatch.body.error.code, 'PRODUCT_ORIGIN_MISMATCH');
    assert.equal(mismatch.response.headers.get('access-control-allow-origin'), 'https://shop.example');

    const orderClaim = await publicHandoffRequest('button-request-order-claim', publicHandoffBody({
      source: { ...publicHandoffBody().source, externalOrderId: 'order-attacker-1' },
    }));
    assert.equal(orderClaim.response.status, 400);
    assert.equal(orderClaim.body.error.code, 'INVALID_REQUEST');
    assert.equal(orderClaim.body.error.details[0].code, 'UNKNOWN_FIELD');
  });

  test('rejects unauthenticated and insufficient-scope access with stable envelopes', async () => {
    const unauthenticated = await jsonRequest('/v1/transactions');
    assert.equal(unauthenticated.response.status, 401);
    assert.equal(unauthenticated.body.error.code, 'INVALID_API_CREDENTIAL');
    assert.ok(unauthenticated.body.error.requestId);
    assert.equal('stack' in unauthenticated.body.error, false);

    const forbidden = await jsonRequest('/v1/transactions', { headers: { authorization: 'Bearer none' } });
    assert.equal(forbidden.response.status, 403);
    assert.equal(forbidden.body.error.code, 'INSUFFICIENT_SCOPE');
  });

  test('creates one transaction, returns server timestamps, and replays exactly', async () => {
    const first = await createRequest('order-1001', 'idem-create-1001');
    assert.equal(first.response.status, 201);
    assert.equal(first.response.headers.get('idempotent-replayed'), 'false');
    assert.match(first.body.data.id, /^txn_[a-f0-9]{32}$/);
    assert.equal(first.body.data.amount.currency, 'USD');
    assert.equal(first.body.data.status, 'CREATED');
    assert.equal(first.body.data.captureStatus, 'NOT_STARTED');
    assert.deepEqual(first.body.captureInstructions, { state: 'NOT_ISSUED', reason: 'CAPTURE_SESSION_REQUIRED' });
    assert.equal(first.body.data.createdAt, '2026-08-10T12:00:00.000Z');
    assert.equal(harness.audit.events.size, 1);
    assert.equal(harness.repository.outbox.size, 1);
    assert.equal([...harness.repository.outbox.values()][0].type, 'TRANSACTION_CREATED');

    const replay = await createRequest('order-1001', 'idem-create-1001');
    assert.equal(replay.response.status, 200);
    assert.equal(replay.response.headers.get('idempotent-replayed'), 'true');
    assert.equal(replay.body.data.id, first.body.data.id);
    assert.equal(harness.audit.events.size, 1);
    assert.equal(harness.repository.outbox.size, 1);

    const conflict = await createRequest('order-1001-different', 'idem-create-1001');
    assert.equal(conflict.response.status, 409);
    assert.equal(conflict.body.error.code, 'IDEMPOTENCY_KEY_REUSED');
  });

  test('rejects unknown fields, malformed JSON, media type mistakes, and oversized bodies', async () => {
    const unknown = await createRequest('order-unknown', 'idem-unknown-1', { organizationId: 'attacker-org' });
    assert.equal(unknown.response.status, 400);
    assert.equal(unknown.body.error.details[0].code, 'UNKNOWN_FIELD');

    const malformed = await jsonRequest('/v1/transactions', {
      method: 'POST',
      headers: { authorization: 'Bearer write-a', 'content-type': 'application/json', 'idempotency-key': 'idem-malformed' },
      body: '{',
    });
    assert.equal(malformed.response.status, 400);
    assert.equal(malformed.body.error.code, 'INVALID_REQUEST');

    const media = await jsonRequest('/v1/transactions', {
      method: 'POST',
      headers: { authorization: 'Bearer write-a', 'content-type': 'text/plain', 'idempotency-key': 'idem-media-1' },
      body: '{}',
    });
    assert.equal(media.response.status, 415);

    const oversized = await jsonRequest('/v1/transactions', {
      method: 'POST',
      headers: { authorization: 'Bearer write-a', 'content-type': 'application/json', 'idempotency-key': 'idem-oversized' },
      body: JSON.stringify({ merchantReference: 'oversized', title: 'x'.repeat(270_000) }),
    });
    assert.equal(oversized.response.status, 413);
    assert.equal(oversized.body.error.code, 'REQUEST_TOO_LARGE');
  });

  test('prevents BOLA by returning not found across organizations', async () => {
    const created = await createRequest('order-bola', 'idem-bola-1');
    const sameOrganization = await jsonRequest(`/v1/transactions/${created.body.data.id}`, { headers: { authorization: 'Bearer read-a' } });
    assert.equal(sameOrganization.response.status, 200);

    const otherOrganization = await jsonRequest(`/v1/transactions/${created.body.data.id}`, { headers: { authorization: 'Bearer read-b' } });
    assert.equal(otherOrganization.response.status, 404);
    assert.equal(otherOrganization.body.error.code, 'TRANSACTION_NOT_FOUND');
  });

  test('uses opaque cursor pagination and binds cursors to their filter set', async () => {
    await createRequest('page-1', 'idem-page-1');
    await createRequest('page-2', 'idem-page-2');
    await createRequest('page-3', 'idem-page-3');
    const first = await jsonRequest('/v1/transactions?limit=2', { headers: { authorization: 'Bearer read-a' } });
    assert.equal(first.response.status, 200);
    assert.equal(first.body.data.length, 2);
    assert.ok(first.body.pagination.nextCursor);
    const second = await jsonRequest(`/v1/transactions?limit=2&cursor=${encodeURIComponent(first.body.pagination.nextCursor)}`, { headers: { authorization: 'Bearer read-a' } });
    assert.equal(second.response.status, 200);
    assert.ok(second.body.data.length >= 1);
    assert.equal(new Set([...first.body.data, ...second.body.data].map((entry) => entry.id)).size, first.body.data.length + second.body.data.length);

    const mismatch = await jsonRequest(`/v1/transactions?limit=2&status=COMPLETED&cursor=${encodeURIComponent(first.body.pagination.nextCursor)}`, { headers: { authorization: 'Bearer read-a' } });
    assert.equal(mismatch.response.status, 400);
    assert.equal(mismatch.body.error.code, 'CURSOR_QUERY_MISMATCH');

    const orgB = await jsonRequest('/v1/transactions', { headers: { authorization: 'Bearer read-b' } });
    assert.deepEqual(orgB.body.data, []);
  });

  test('connects merchant invitation to authenticated participant claim and actor-bound evidence-session redemption', async () => {
    const created = await createRequest('order-participant-capture', 'idem-participant-transaction');
    const transactionId = created.body.data.id;
    const invitation = await jsonRequest(`/v1/transactions/${transactionId}/participant-invitations`, {
      method: 'POST',
      headers: { authorization: 'Bearer write-a', 'content-type': 'application/json', 'idempotency-key': 'idem-participant-invitation' },
      body: JSON.stringify({ schemaVersion: 1, role: 'SELLER', externalReference: 'seller-42', expiresInSeconds: 3600 }),
    });
    assert.equal(invitation.response.status, 201);
    assert.equal(invitation.body.data.object, 'participant_claim');
    assert.match(invitation.body.claimInstructions.claimUrl, /\/claim\/participant\?/);
    assert.match(invitation.body.claimInstructions.token, /^pp_claim_v1_/);

    const unauthenticatedClaim = await jsonRequest('/v1/participant-claims', {
      method: 'POST', headers: { authorization: 'Bearer user-a', 'content-type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1, claimId: invitation.body.data.id, token: invitation.body.claimInstructions.token }),
    });
    assert.equal(unauthenticatedClaim.response.status, 401);
    assert.equal(unauthenticatedClaim.body.error.code, 'INVALID_PARTICIPANT_AUTHENTICATION');

    const claim = await jsonRequest('/v1/participant-claims', {
      method: 'POST',
      headers: { authorization: 'Bearer user-a', 'x-firebase-appcheck': 'app-check-a', 'content-type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1, claimId: invitation.body.data.id, token: invitation.body.claimInstructions.token }),
    });
    assert.equal(claim.response.status, 201);
    assert.equal(claim.body.transactionId, transactionId);
    assert.equal(claim.body.data.status, 'CLAIMED');

    const evidence = await jsonRequest(`/v1/transactions/${transactionId}/evidence-sessions`, {
      method: 'POST',
      headers: { authorization: 'Bearer write-a', 'content-type': 'application/json', 'idempotency-key': 'idem-evidence-session' },
      body: JSON.stringify({
        schemaVersion: 1, participantClaimId: invitation.body.data.id, type: 'OUTBOUND_PACK',
        allowedArtifactTypes: ['PACKING_VIDEO'], expiresInSeconds: 3600, maximumRedemptions: 1, requestedEvidenceCount: 1,
      }),
    });
    assert.equal(evidence.response.status, 201);
    assert.equal(evidence.body.data.object, 'evidence_session');
    assert.match(evidence.body.redemptionInstructions.redemptionUrl, /\/evidence-session\/redeem\?/);
    assert.match(evidence.body.redemptionInstructions.token, /^pp_capture_v1_/);

    const read = await jsonRequest(`/v1/evidence-sessions/${evidence.body.data.id}`, { headers: { authorization: 'Bearer write-a' } });
    assert.equal(read.response.status, 200);
    assert.equal(read.body.data.transactionId, transactionId);

    const redeemed = await jsonRequest(`/v1/evidence-sessions/${evidence.body.data.id}/redeem`, {
      method: 'POST',
      headers: { authorization: 'Bearer user-a', 'x-firebase-appcheck': 'app-check-a', 'content-type': 'application/json' },
      body: JSON.stringify({
        schemaVersion: 1, operationKey: 'native-capture-operation-1', token: evidence.body.redemptionInstructions.token,
        runtimeArtifactHash: 'a'.repeat(64),
      }),
    });
    assert.equal(redeemed.response.status, 201);
    assert.equal(redeemed.body.data.status, 'CAPTURING');
    assert.equal(redeemed.body.captureAttestation.mode, 'JIT_APP_CHECK');
    assert.equal(redeemed.body.captureAttestation.appId, 'app-a');

    const cancelled = await jsonRequest(`/v1/evidence-sessions/${evidence.body.data.id}/cancel`, {
      method: 'POST', headers: { authorization: 'Bearer write-a', 'content-type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1 }),
    });
    assert.equal(cancelled.response.status, 200);
    assert.equal(cancelled.body.data.status, 'CANCELLED');
  });

  test('returns explicit method and route errors', async () => {
    const method = await jsonRequest('/v1/transactions', { method: 'DELETE', headers: { authorization: 'Bearer write-a' } });
    assert.equal(method.response.status, 405);
    assert.equal(method.response.headers.get('allow'), 'GET, POST');
    const missing = await jsonRequest('/v1/not-a-route', { headers: { authorization: 'Bearer write-a' } });
    assert.equal(missing.response.status, 404);
    assert.equal(missing.body.error.code, 'ENDPOINT_NOT_FOUND');
  });

  test('returns documented rate-limit headers and envelope', async () => {
    harness.rateLimiter.denyNext = true;
    const limited = await jsonRequest('/v1/transactions', { headers: { authorization: 'Bearer read-a' } });
    assert.equal(limited.response.status, 429);
    assert.equal(limited.body.error.code, 'RATE_LIMIT_EXCEEDED');
    assert.equal(limited.response.headers.get('ratelimit-remaining'), '0');
    assert.ok(Number(limited.response.headers.get('retry-after')) >= 1);
  });
});

describe('PackProof API v1 headless Connect and claims-review routes', () => {
  test('lists evidence and returns a claims-review package without a verdict', async () => {
    const created = await createRequest('headless-order-1', 'headless-create-1');
    const transactionId = created.body.data.id;
    harness.merchantEvidenceService.seedArtifact(transactionId, {
      id: 'art_pack_1', object: 'evidence_artifact', schemaVersion: 1, transactionId, type: 'PACKING_VIDEO',
      status: 'FINALIZED', role: 'SELLER', contentType: 'video/mp4', sizeBytes: 12, sha256: 'b'.repeat(64),
      manifestSha256: 'c'.repeat(64), evidenceBundleSha256: 'd'.repeat(64),
      manifestAuthenticationScope: 'PACKPROOF_SERVICE_ONLY', workflowReady: true, assurance: null,
      carrierTrackingMatchStatus: null, shippingTracker: null, finalizedAt: '2026-08-11T12:00:00.000Z',
      createdAt: '2026-08-11T12:00:00.000Z', updatedAt: '2026-08-11T12:00:00.000Z',
    });
    const denied = await jsonRequest(`/v1/transactions/${transactionId}/evidence`, { headers: { authorization: 'Bearer read-a' } });
    assert.equal(denied.response.status, 403);
    const listed = await jsonRequest(`/v1/transactions/${transactionId}/evidence`, { headers: { authorization: 'Bearer evidence-a' } });
    assert.equal(listed.response.status, 200);
    assert.equal(listed.body.data[0].type, 'PACKING_VIDEO');
    assert.equal(listed.body.data[0].shippingTracker, null);
    const review = await jsonRequest(`/v1/transactions/${transactionId}/review-package`, { headers: { authorization: 'Bearer evidence-a' } });
    assert.equal(review.response.status, 200);
    assert.equal(review.body.data.object, 'review_package');
    assert.equal(review.body.data.limitations.physicalCorrespondence, 'NOT_AVAILABLE');
    assert.equal(review.body.data.limitations.doesNotDecideFraudOrFault, true);
    assert.equal(review.body.data.limitations.doesNotGuaranteeDisputeOutcome, true);
    const passport = await jsonRequest(`/v1/transactions/${transactionId}/passport`, { headers: { authorization: 'Bearer evidence-a' } });
    assert.equal(passport.response.status, 200);
    assert.equal(passport.body.data.object, 'packproof_passport');
    assert.equal(passport.body.data.integrity.banner, 'AUTHENTIC_PACKPROOF');
    assert.equal(passport.body.data.limitations.doesNotDecideFraudOrFault, true);
    assert.equal(passport.body.data.integrity.manifestAuthentication.publiclyVerifiable, false);
    const byDisplay = await jsonRequest(`/v1/passports/${passport.body.data.identity.displayId}`, { headers: { authorization: 'Bearer evidence-a' } });
    assert.equal(byDisplay.response.status, 200);
    assert.equal(byDisplay.body.data.identity.passportId, passport.body.data.identity.passportId);
    const byProof = await jsonRequest(`/v1/proofs/${passport.body.data.identity.displayId}`, { headers: { authorization: 'Bearer evidence-a' } });
    assert.equal(byProof.response.status, 200);
    assert.equal(byProof.body.data.identity.passportId, passport.body.data.identity.passportId);
    const proofAlias = await jsonRequest(`/v1/transactions/${transactionId}/proof`, { headers: { authorization: 'Bearer evidence-a' } });
    assert.equal(proofAlias.response.status, 200);
    assert.equal(proofAlias.body.data.identity.passportId, passport.body.data.identity.passportId);
    const snapshot = await jsonRequest(`/v1/transactions/${transactionId}/passport/snapshots`, {
      method: 'POST',
      headers: { authorization: 'Bearer evidence-a', 'content-type': 'application/json', 'idempotency-key': 'passport-snap-1' },
      body: JSON.stringify({ schemaVersion: 1 }),
    });
    assert.equal(snapshot.response.status, 201);
    assert.equal(snapshot.body.data.object, 'packproof_passport_snapshot');
    const exported = await jsonRequest(`/v1/passports/${passport.body.data.identity.passportId}/snapshots/${snapshot.body.data.snapshotId}/exports`, {
      method: 'POST',
      headers: { authorization: 'Bearer evidence-a', 'content-type': 'application/json', 'idempotency-key': 'passport-export-1' },
      body: JSON.stringify({ schemaVersion: 1 }),
    });
    assert.equal(exported.response.status, 201);
    assert.equal(exported.body.data.presentationOnly, true);
    const empty = await createRequest('headless-order-passport-empty', 'headless-create-passport-empty');
    const notReady = await jsonRequest(`/v1/transactions/${empty.body.data.id}/passport`, { headers: { authorization: 'Bearer evidence-a' } });
    assert.equal(notReady.response.status, 409);
    assert.equal(notReady.body.error.code, 'PASSPORT_NOT_READY');
  });

  test('creates a presentation report and a Connect session through merchant credentials', async () => {
    const created = await createRequest('headless-order-2', 'headless-create-2');
    const transactionId = created.body.data.id;
    const report = await jsonRequest(`/v1/transactions/${transactionId}/reports`, {
      method: 'POST',
      headers: { authorization: 'Bearer evidence-a', 'content-type': 'application/json', 'idempotency-key': 'report-key-1' },
      body: JSON.stringify({ schemaVersion: 1 }),
    });
    assert.equal(report.response.status, 201);
    assert.equal(report.body.data.presentationOnly, true);
    assert.ok(report.body.data.downloadUrl);

    const connect = await jsonRequest('/v1/connect/sessions', {
      method: 'POST',
      headers: { authorization: 'Bearer write-a', 'content-type': 'application/json', 'idempotency-key': 'connect-key-1' },
      body: JSON.stringify({
        schemaVersion: 1,
        platform: 'custom',
        externalOrderId: 'order-99',
        externalSellerId: 'seller-99',
        itemTitle: 'Imported camera',
        amount: { currency: 'USD', minorUnits: 5000 },
        callbackUrl: 'https://merchant.example/webhooks/packproof',
      }),
    });
    assert.equal(connect.response.status, 201);
    assert.equal(connect.body.data.object, 'connect_session');
    assert.equal(connect.body.captureInstructions.state, 'PENDING_REDEMPTION');
    const fetched = await jsonRequest(`/v1/connect/sessions/${connect.body.data.id}`, { headers: { authorization: 'Bearer write-a' } });
    assert.equal(fetched.response.status, 200);
    assert.equal(fetched.body.data.externalOrderId, 'order-99');
    const listed = await jsonRequest('/v1/connect/sessions?externalOrderId=order-99', { headers: { authorization: 'Bearer write-a' } });
    assert.equal(listed.response.status, 200);
    assert.equal(listed.body.data.length, 1);
    assert.equal(listed.body.data[0].id, connect.body.data.id);
    const missingQuery = await jsonRequest('/v1/connect/sessions', { headers: { authorization: 'Bearer write-a' } });
    assert.equal(missingQuery.response.status, 400);
    const cancelled = await jsonRequest(`/v1/connect/sessions/${connect.body.data.id}/cancel`, {
      method: 'POST',
      headers: { authorization: 'Bearer write-a', 'content-type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1 }),
    });
    assert.equal(cancelled.response.status, 200);
    assert.equal(cancelled.body.data.status, 'CANCELLED');
    const replayedCancel = await jsonRequest(`/v1/connect/sessions/${connect.body.data.id}/cancel`, {
      method: 'POST',
      headers: { authorization: 'Bearer write-a', 'content-type': 'application/json' },
      body: JSON.stringify({ schemaVersion: 1 }),
    });
    assert.equal(replayedCancel.response.status, 200);
    assert.equal(replayedCancel.response.headers.get('idempotent-replayed'), 'true');

    const shipment = await jsonRequest(`/v1/transactions/${transactionId}/shipment`, {
      method: 'POST',
      headers: { authorization: 'Bearer write-a', 'content-type': 'application/json', 'idempotency-key': 'ship-key-1' },
      body: JSON.stringify({ schemaVersion: 1, carrier: 'UPS', trackingNumber: '1Z999AA10123456784' }),
    });
    assert.equal(shipment.response.status, 201);
    assert.equal(shipment.body.data.assertionSource, 'MERCHANT');

    const requestedReturn = await jsonRequest(`/v1/transactions/${transactionId}/returns`, {
      method: 'POST',
      headers: { authorization: 'Bearer write-a', 'content-type': 'application/json', 'idempotency-key': 'return-key-1' },
      body: JSON.stringify({ schemaVersion: 1, reason: 'Item differs from the locked terms.' }),
    });
    assert.equal(requestedReturn.response.status, 201);
    assert.equal(requestedReturn.body.data.object, 'return_passport');
    const returnShipment = await jsonRequest(`/v1/transactions/${transactionId}/returns/${requestedReturn.body.data.id}/shipment`, {
      method: 'POST',
      headers: { authorization: 'Bearer write-a', 'content-type': 'application/json', 'idempotency-key': 'return-ship-1' },
      body: JSON.stringify({ schemaVersion: 1, carrier: 'USPS', trackingNumber: '9400111899223198765432' }),
    });
    assert.equal(returnShipment.response.status, 201);
    const delivery = await jsonRequest(`/v1/transactions/${transactionId}/delivery`, {
      method: 'POST',
      headers: { authorization: 'Bearer write-a', 'content-type': 'application/json', 'idempotency-key': 'delivery-key-1' },
      body: JSON.stringify({ schemaVersion: 1, carrier: 'UPS', trackingNumber: '1Z999AA10123456784' }),
    });
    assert.equal(delivery.response.status, 201);
    assert.equal(delivery.body.data.object, 'delivery');
  });

  test('rejects unknown Connect fields and unsupported evidence methods', async () => {
    const created = await createRequest('headless-order-3', 'headless-create-3');
    const unknown = await jsonRequest('/v1/connect/sessions', {
      method: 'POST',
      headers: { authorization: 'Bearer write-a', 'content-type': 'application/json', 'idempotency-key': 'connect-bad' },
      body: JSON.stringify({
        schemaVersion: 1, platform: 'custom', externalOrderId: 'order-1', externalSellerId: 'seller-1',
        itemTitle: 'Camera', amount: { currency: 'USD', minorUnits: 1 }, callbackUrl: 'https://merchant.example/hook',
        verdict: 'AUTHENTIC',
      }),
    });
    assert.equal(unknown.response.status, 400);
    assert.equal(unknown.body.error.details[0].code, 'UNKNOWN_FIELD');
    const method = await jsonRequest(`/v1/transactions/${created.body.data.id}/evidence`, {
      method: 'POST', headers: { authorization: 'Bearer write-a', 'content-type': 'application/json' }, body: '{}',
    });
    assert.equal(method.response.status, 405);
  });
});

describe('PackProof portal HTTP transport', () => {
  const headers = {
    authorization: 'Bearer portal-a',
    'x-firebase-appcheck': 'app-check-portal',
  };

  test('rejects merchant API keys and missing App Check', async () => {
    const merchant = await jsonRequest('/v1/portal/home', { headers: { authorization: 'Bearer write-a' } });
    assert.equal(merchant.response.status, 401);
    assert.equal(merchant.body.error.code, 'INVALID_PORTAL_AUTHENTICATION');
    const missingCheck = await jsonRequest('/v1/portal/home', { headers: { authorization: 'Bearer portal-a' } });
    assert.equal(missingCheck.response.status, 401);
  });

  test('lists only participant records and mints a native capture handoff', async () => {
    harness.portalWorkspaceService.seed({
      id: 'legacyTx001234567890',
      object: 'portal_transaction',
      schemaVersion: 1,
      sellerId: 'user-a',
      buyerId: 'buyer-1',
      participantIds: ['user-a', 'buyer-1'],
      status: 'TERMS_LOCKED',
      title: 'Sony WH-1000XM6',
      category: 'electronics',
      description: '',
      priceMinor: 34900,
      currency: 'USD',
      identifiers: [],
      conditionNotes: '',
      terms: { saleType: 'SHIPPED', shippingResponsibility: 'SELLER', returns: 'AS_AGREED', returnWindowDays: 14, customTerms: '' },
      confirmedBy: ['user-a', 'buyer-1'],
      handoffConfirmedBy: [],
      completedBy: [],
      passportId: null,
      passportDisplayId: null,
      source: { type: null, platform: 'eBay', externalOrderId: '1284921' },
      protocol: {
        hasPackingVideo: false, hasSealReference: false, hasArrivalPhoto: false, hasUnboxingVideo: false,
        sellerReferenceComplete: false, buyerArrivalComplete: false, outboundComplete: false,
      },
      lockedAt: null,
      createdAt: '2026-08-19T12:00:00.000Z',
      updatedAt: '2026-08-19T12:00:00.000Z',
    });
    const home = await jsonRequest('/v1/portal/home', { headers });
    assert.equal(home.response.status, 200);
    assert.equal(home.body.data.viewerId, 'user-a');
    assert.equal(home.body.data.channel, 'WEB_PORTAL');
    assert.equal(home.body.data.transactions[0].title, 'Sony WH-1000XM6');
    const hidden = await jsonRequest('/v1/portal/transactions/someone-elses-tx', { headers });
    assert.equal(hidden.response.status, 404);
    const handoff = await jsonRequest('/v1/portal/transactions/legacyTx001234567890/mobile-handoff', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'START_PACKING' }),
    });
    assert.equal(handoff.response.status, 200);
    assert.equal(handoff.body.data.captureOnNativeOnly, true);
    assert.equal(handoff.body.data.channel, 'WEB_PORTAL');
    assert.match(handoff.body.data.universalLink, /\/portal\/open\?/);
    const browserCapture = await jsonRequest('/v1/portal/transactions/legacyTx001234567890/mobile-handoff', {
      method: 'POST',
      headers: { ...headers, 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'BROWSER_UPLOAD' }),
    });
    assert.equal(browserCapture.response.status, 400);
  });
});

test('concurrent idempotency execution rejects the in-flight duplicate', async () => {
  const store = new InMemoryIdempotencyStore();
  let release;
  const barrier = new Promise((resolve) => { release = resolve; });
  const context = { principalId: 'org:client', operation: 'POST /v1/transactions', key: 'concurrent-key', requestFingerprint: 'abc' };
  const first = store.execute(context, async () => {
    await barrier;
    return { ok: true };
  });
  await assert.rejects(() => store.execute(context, async () => ({ ok: false })), (error) => error.code === 'IDEMPOTENCY_REQUEST_IN_PROGRESS');
  release();
  assert.deepEqual((await first).value, { ok: true });
});
