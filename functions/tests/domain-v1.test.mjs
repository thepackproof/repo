import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  apiClientDtoSchema,
  assertResourceContractCatalogComplete,
  assertTransition,
  auditEventDtoSchema,
  canTransition,
  claimStatuses,
  claimTransitions,
  commerceContextCanAuthoritativelyBindOrder,
  commerceContextDtoSchema,
  commerceContextMayAppearAsPassportOrderContext,
  commerceContextStatuses,
  commerceContextTransitions,
  commerceImageReferenceIsFinalizedEvidence,
  commerceTrustLevelForIntakeSource,
  deliveryStatuses,
  DomainValidationError,
  evidenceArtifactDtoSchema,
  evidenceArtifactStatuses,
  evidenceArtifactTransitions,
  evidenceAuthenticationIsPubliclyVerifiable,
  evidenceCanAdvanceWorkflow,
  evidenceManifestDtoSchema,
  evidenceReportDtoSchema,
  evidenceSessionDtoSchema,
  evidenceSessionStatuses,
  evidenceSessionTransitions,
  freezeEvidenceSessionIntake,
  integrationDtoSchema,
  mapLegacyConsumerTransaction,
  mapLegacyMerchantTransaction,
  organizationDtoSchema,
  organizationMembershipDtoSchema,
  parseResourceId,
  participantClaimDtoSchema,
  passportDraftDtoSchema,
  passportDraftStatuses,
  passportDraftTransitions,
  resourceContracts,
  resourceKinds,
  returnPassportDtoSchema,
  returnPassportStatuses,
  returnPassportTransitions,
  shipmentDtoSchema,
  shipmentStatuses,
  shipmentTransitions,
  transactionDtoSchema,
  transactionStatuses,
  transactionTransitions,
  webhookDeliveryDtoSchema,
  webhookDeliveryTransitions,
  webhookEndpointDtoSchema,
  webhookEventDtoSchema,
  parseCommerceArtifact,
  EBAY_EMAIL_PARSER_V1,
  ETSY_EMAIL_PARSER_V1,
  SHOPIFY_EMAIL_PARSER_V1,
  GENERIC_COMMERCE_TEXT_PARSER_V1,
} from '../lib/domain/v1/index.js';

const now = '2026-08-11T12:00:00.000Z';
const later = '2026-08-12T12:00:00.000Z';
const sha = 'a'.repeat(64);
const assurance = {
  acquisitionQuality: { status: 'NOT_EVALUATED', reasonCodes: ['THRESHOLDS_NOT_VALIDATED'] },
  appDeviceContext: { status: 'ONLINE_APP_CHECK_ONLY', reasonCodes: [] },
  byteIntegrity: { status: 'MATCHED', reasonCodes: [] },
  physicalCorrespondence: { status: 'NOT_AVAILABLE', reasonCodes: ['NO_VALIDATED_PHYSICAL_MATCHER_ENABLED'] },
  carrierContext: { status: 'NOT_SCANNED', reasonCodes: [] },
  businessLegalRelevance: { status: 'REVIEW_REQUIRED', reasonCodes: [] },
};

const item = {
  title: 'Example collectible',
  description: 'Merchant-provided listing text.',
  category: 'Collectible',
  brand: 'Example',
  model: 'Model 1',
  sku: 'SKU-1',
  gtin: '12345678',
  upc: null,
  mpn: null,
  serialNumber: null,
  selectedOptions: [{ name: 'Color', value: 'Blue' }],
  identifiers: [{ type: 'SKU', value: 'SKU-1' }],
  quantity: 1,
  amount: { currency: 'USD', minorUnits: 12500 },
  imageReferences: [{ url: 'https://merchant.example/item.jpg', altText: 'Listing image' }],
};

const samples = {
  organization: {
    id: 'org_12345678', object: 'organization', schemaVersion: 1, name: 'Example Merchant', environment: 'sandbox', status: 'ACTIVE', createdAt: now, updatedAt: now,
  },
  organizationMembership: {
    id: 'membership_12345678', object: 'organization_membership', schemaVersion: 1, organizationId: 'org_12345678',
    actorId: 'user-actor-1', role: 'OPERATOR', scopes: ['portal:read', 'transactions:read'], status: 'ACTIVE', createdAt: now, updatedAt: now,
  },
  integration: {
    id: 'int_12345678', object: 'integration', schemaVersion: 1, name: 'Example Shopify', type: 'SHOPIFY', environment: 'sandbox', status: 'ACTIVE',
    allowedOrigins: ['https://merchant.example'], externalAccountReference: 'shop-1', createdAt: now, updatedAt: now,
  },
  apiClient: {
    id: 'client_12345678', object: 'api_client', schemaVersion: 1, name: 'Example backend', integrationId: 'int_12345678', environment: 'sandbox', status: 'ACTIVE',
    scopes: ['commerce_contexts:read', 'commerce_contexts:write'], createdAt: now, updatedAt: now,
  },
  commerceContext: {
    id: 'ctx_12345678', object: 'commerce_context', schemaVersion: 1, integrationId: 'int_12345678',
    source: {
      platform: 'SHOPIFY', trustLevel: 'PLATFORM_API_ATTESTED', intakeSourceType: null, platformIdentifier: null, parserVersion: null, originalArtifactSha256: null,
      externalShopId: 'shop-1', externalProductId: 'product-1', externalListingId: null,
      externalVariantId: 'variant-1', externalOrderId: 'order-1', externalLineItemId: 'line-1', productUrl: 'https://merchant.example/products/item', capturedAt: now,
    },
    item,
    fieldProvenance: {
      'item.title': { source: 'PLATFORM_API', confidence: 'ASSERTED', importedAt: now, sourceReference: 'product-1', extractionMethod: null, sourceArtifactSha256: null, extractionQuality: null },
    },
    canonicalPayloadSha256: sha, status: 'ORDER_BOUND', supersedesCommerceContextId: null, expiresAt: null, createdAt: now, updatedAt: now,
  },
  passportDraft: {
    id: 'draft_12345678', object: 'passport_draft', schemaVersion: 1, commerceContextId: 'ctx_12345678', transactionId: null, item,
    status: 'READY_FOR_REVIEW', expiresAt: later, createdAt: now, updatedAt: now,
  },
  transaction: {
    id: 'txn_12345678', object: 'transaction', schemaVersion: 1, origin: 'COMMERCE_ADAPTER', merchantReference: 'order-1', commerceContextId: 'ctx_12345678',
    passportDraftId: 'draft_12345678',
    item: { title: item.title, description: item.description, category: item.category, amount: item.amount, identifiers: [{ label: 'SKU', value: 'SKU-1' }], conditionNotes: '' },
    terms: { saleType: 'SHIPPED', shippingResponsibility: 'SELLER', returns: 'PLATFORM_POLICY', returnWindowDays: 30, customTerms: '' },
    participants: [{ role: 'SELLER', externalReference: 'seller-1', displayLabel: 'Seller', claimState: 'CLAIMED' }],
    termsState: 'LOCKED', fulfillmentState: 'PACKING', status: 'ACTIVE', termsLockedAt: now, completedAt: null, createdAt: now, updatedAt: now,
  },
  participantClaim: {
    id: 'claim_12345678', object: 'participant_claim', schemaVersion: 1, transactionId: 'txn_12345678', role: 'BUYER', status: 'ISSUED',
    expiresAt: later, claimedAt: null, createdAt: now, updatedAt: now,
  },
  evidenceSession: {
    id: 'es_12345678', object: 'evidence_session', schemaVersion: 1, transactionId: 'txn_12345678', commerceContextId: 'ctx_12345678', returnPassportId: null, actorRole: 'SELLER',
    type: 'OUTBOUND_PACK', protocolVersion: 'PP_CAPTURE_1', allowedArtifactTypes: ['PACKING_VIDEO', 'SHIPPING_LABEL'], status: 'PROCESSING',
    captureState: 'CAPTURED', syncState: 'AWAITING_FINALIZATION', processingState: 'PROCESSING', maximumRedemptions: 1, redemptionCount: 1,
    requestedEvidenceCount: 1, captureProfileId: null, captureGroupId: null, expiresAt: later, startedAt: now, completedAt: null,
    originalArtifactSha256: null, normalizedSnapshotSha256: null, intakeFrozenAt: null,
    createdAt: now, updatedAt: now,
  },
  evidenceArtifact: {
    id: 'art_12345678', object: 'evidence_artifact', schemaVersion: 1, transactionId: 'txn_12345678', evidenceSessionId: 'es_12345678',
    type: 'PACKING_VIDEO', status: 'FINALIZED', contentType: 'video/mp4', sizeBytes: 1000, sha256: sha, manifestId: 'manifest_12345678',
    assurance, finalizedAt: now, createdAt: now, updatedAt: now,
  },
  evidenceManifest: {
    id: 'manifest_12345678', object: 'evidence_manifest', schemaVersion: 1, transactionId: 'txn_12345678', evidenceSessionId: 'es_12345678',
    artifactId: 'art_12345678', formatSchemaVersion: 2, canonicalizationProfile: 'PACKPROOF_JCS_1', bundleBindingProfile: 'PACKPROOF_EVIDENCE_BUNDLE_V2',
    manifestSha256: sha, evidenceBundleSha256: 'b'.repeat(64),
    authentication: { type: 'SERVICE_MAC', algorithm: 'HMAC-SHA256', keyId: 'manifest-key-v1', macBase64url: 'A'.repeat(43), verificationScope: 'PACKPROOF_SERVICE_ONLY' },
    finalizedAt: now, createdAt: now, updatedAt: now,
  },
  shipment: {
    id: 'shipment_12345678', object: 'shipment', schemaVersion: 1, transactionId: 'txn_12345678', carrier: 'UPS', trackingNumber: '1Z999',
    assertionSource: 'MERCHANT', status: 'IN_TRANSIT', packingEvidenceSessionId: 'es_12345678', receiverEvidenceSessionId: null,
    shippedAt: now, deliveredAt: null, createdAt: now, updatedAt: now,
  },
  returnPassport: {
    id: 'return_12345678', object: 'return_passport', schemaVersion: 1, transactionId: 'txn_12345678', reason: 'Return accepted under the locked terms.',
    status: 'AUTHORIZED', originalEvidenceHashes: [sha], shipmentId: null, authorizedAt: now, completedAt: null, createdAt: now, updatedAt: now,
  },
  evidenceReport: {
    id: 'report_12345678', object: 'evidence_report', schemaVersion: 1, transactionId: 'txn_12345678', status: 'AVAILABLE',
    evidenceSessionIds: ['es_12345678'], assurance, reportSha256: sha, generatedAt: now, createdAt: now, updatedAt: now,
  },
  webhookEndpoint: {
    id: 'wh_12345678', object: 'webhook_endpoint', schemaVersion: 1, url: 'https://merchant.example/webhooks/packproof', status: 'ACTIVE',
    subscribedEvents: ['evidence_session.finalized'], createdAt: now, updatedAt: now,
  },
  webhookEvent: {
    id: 'evt_12345678', object: 'webhook_event', schemaVersion: 1, type: 'evidence_session.finalized', resourceType: 'evidence_session', resourceId: 'es_12345678',
    data: { status: 'FINALIZED' }, occurredAt: now, createdAt: now, updatedAt: now,
  },
  webhookDelivery: {
    id: 'delivery_12345678', object: 'webhook_delivery', schemaVersion: 1, eventId: 'evt_12345678', endpointId: 'wh_12345678', status: 'DELIVERED',
    attemptCount: 1, nextAttemptAt: null, deliveredAt: now, responseStatus: 200, payloadSha256: sha, createdAt: now, updatedAt: now,
  },
  auditEvent: {
    id: 'audit_12345678', object: 'audit_event', schemaVersion: 1, type: 'TRANSACTION_CREATED', actorType: 'MERCHANT_API_CLIENT', actorId: 'client_12345678',
    resourceType: 'transaction', resourceId: 'txn_12345678', requestId: 'request_12345678', previousEventSha256: null, eventSha256: sha,
    metadata: { apiVersion: 'v1' }, occurredAt: now, createdAt: now, updatedAt: now,
  },
};

const schemaCases = [
  ['organization', organizationDtoSchema, samples.organization],
  ['organizationMembership', organizationMembershipDtoSchema, samples.organizationMembership],
  ['integration', integrationDtoSchema, samples.integration],
  ['apiClient', apiClientDtoSchema, samples.apiClient],
  ['commerceContext', commerceContextDtoSchema, samples.commerceContext],
  ['passportDraft', passportDraftDtoSchema, samples.passportDraft],
  ['transaction', transactionDtoSchema, samples.transaction],
  ['participantClaim', participantClaimDtoSchema, samples.participantClaim],
  ['evidenceSession', evidenceSessionDtoSchema, samples.evidenceSession],
  ['evidenceArtifact', evidenceArtifactDtoSchema, samples.evidenceArtifact],
  ['evidenceManifest', evidenceManifestDtoSchema, samples.evidenceManifest],
  ['shipment', shipmentDtoSchema, samples.shipment],
  ['returnPassport', returnPassportDtoSchema, samples.returnPassport],
  ['evidenceReport', evidenceReportDtoSchema, samples.evidenceReport],
  ['webhookEndpoint', webhookEndpointDtoSchema, samples.webhookEndpoint],
  ['webhookEvent', webhookEventDtoSchema, samples.webhookEvent],
  ['webhookDelivery', webhookDeliveryDtoSchema, samples.webhookDelivery],
  ['auditEvent', auditEventDtoSchema, samples.auditEvent],
];

test('canonical resource contract catalog is complete and declares boundaries', () => {
  assert.doesNotThrow(() => assertResourceContractCatalogComplete());
  assert.equal(resourceKinds.length, 18);
  assert.equal(Object.keys(resourceContracts).length, 18);
  for (const kind of resourceKinds) {
    const contract = resourceContracts[kind];
    assert.equal(contract.kind, kind);
    assert.equal(contract.schemaVersion, 1);
    assert.ok(contract.persistencePath.length > 5);
    assert.ok(contract.auditEvents.length > 0);
    assert.ok(contract.idempotency.length > 20);
  }
});

test('all 18 public DTO schemas accept canonical examples and reject unknown fields', async (t) => {
  for (const [name, runtimeSchema, sample] of schemaCases) {
    await t.test(name, () => {
      assert.deepEqual(runtimeSchema.parse(structuredClone(sample)), sample);
      const mutated = { ...structuredClone(sample), rawSecret: 'must-not-pass' };
      assert.throws(() => runtimeSchema.parse(mutated), (error) => error instanceof DomainValidationError && error.issues[0].code === 'UNKNOWN_FIELD');
    });
  }
});

test('canonical identifiers are kind-bound and legacy IDs require explicit compatibility', () => {
  assert.equal(parseResourceId('transaction', 'txn_12345678'), 'txn_12345678');
  assert.throws(() => parseResourceId('transaction', 'legacyFirestore12345'), DomainValidationError);
  assert.equal(parseResourceId('transaction', 'legacyFirestore12345', 'id', { allowLegacy: true }), 'legacyFirestore12345');
  assert.throws(() => parseResourceId('transaction', 'ctx_12345678'), DomainValidationError);
});

function assertTable(states, table) {
  assert.deepEqual(Object.keys(table).sort(), [...states].sort());
  for (const [from, targets] of Object.entries(table)) {
    for (const to of targets) assert.ok(states.includes(to), `${from} targets unknown state ${to}`);
  }
}

test('all canonical state tables cover their status vocabularies and reject illegal transitions', () => {
  const cases = [
    [commerceContextStatuses, commerceContextTransitions],
    [passportDraftStatuses, passportDraftTransitions],
    [transactionStatuses, transactionTransitions],
    [claimStatuses, claimTransitions],
    [evidenceSessionStatuses, evidenceSessionTransitions],
    [evidenceArtifactStatuses, evidenceArtifactTransitions],
    [shipmentStatuses, shipmentTransitions],
    [returnPassportStatuses, returnPassportTransitions],
    [deliveryStatuses, webhookDeliveryTransitions],
  ];
  for (const [states, table] of cases) assertTable(states, table);
  assert.equal(canTransition(transactionTransitions, 'DRAFT', 'ACTIVE'), true);
  assert.equal(canTransition(transactionTransitions, 'ARCHIVED', 'ACTIVE'), false);
  assert.throws(() => assertTransition(transactionTransitions, 'ARCHIVED', 'ACTIVE', 'transaction'), DomainValidationError);
});

test('page-declared context can prefill but cannot authoritatively bind an order', () => {
  const attested = commerceContextDtoSchema.parse(structuredClone(samples.commerceContext));
  assert.equal(commerceContextCanAuthoritativelyBindOrder(attested), true);
  const pageDeclared = commerceContextDtoSchema.parse({
    ...structuredClone(samples.commerceContext),
    source: { ...structuredClone(samples.commerceContext.source), platform: 'STRUCTURED_PAGE_DATA', trustLevel: 'PAGE_DECLARED' },
    status: 'CREATED',
  });
  assert.equal(commerceContextCanAuthoritativelyBindOrder(pageDeclared), false);
  assert.equal(commerceImageReferenceIsFinalizedEvidence(pageDeclared.item.imageReferences[0]), false);
  assert.throws(() => commerceContextDtoSchema.parse({ ...structuredClone(pageDeclared), status: 'ORDER_BOUND' }), DomainValidationError);
});

test('user-provided commerce artifacts prefill and appear on a Passport but cannot bind an order', () => {
  assert.equal(commerceTrustLevelForIntakeSource('EMAIL_RECEIPT'), 'USER_PROVIDED_COMMERCE_ARTIFACT');
  assert.equal(commerceTrustLevelForIntakeSource('BROWSER_EXTENSION'), 'PAGE_DECLARED');
  const imported = commerceContextDtoSchema.parse({
    ...structuredClone(samples.commerceContext),
    source: {
      ...structuredClone(samples.commerceContext.source),
      platform: 'MARKETPLACE',
      trustLevel: 'USER_PROVIDED_COMMERCE_ARTIFACT',
      intakeSourceType: 'EMAIL_RECEIPT',
      platformIdentifier: 'EBAY',
      parserVersion: 'EBAY_EMAIL_PARSER_V4',
      originalArtifactSha256: sha,
    },
    fieldProvenance: {
      'item.title': {
        source: 'EMAIL_RECEIPT', confidence: 'ASSERTED', importedAt: now, sourceReference: 'order-1',
        extractionMethod: 'EBAY_EMAIL_PARSER_V4', sourceArtifactSha256: sha,
      },
    },
    status: 'CREATED',
  });
  assert.equal(commerceContextCanAuthoritativelyBindOrder(imported), false);
  assert.equal(commerceContextMayAppearAsPassportOrderContext(imported.source.trustLevel), true);
  assert.throws(() => commerceContextDtoSchema.parse({ ...structuredClone(imported), status: 'ORDER_BOUND' }), DomainValidationError);
  assert.throws(() => commerceContextDtoSchema.parse({
    ...structuredClone(imported),
    source: { ...imported.source, originalArtifactSha256: null },
  }), DomainValidationError);
});

test('evidence-session intake freeze is idempotent and immutable after capture starts', () => {
  const ready = evidenceSessionDtoSchema.parse(structuredClone(samples.evidenceSession));
  const frozen = freezeEvidenceSessionIntake(ready, {
    originalArtifactSha256: sha,
    normalizedSnapshotSha256: 'b'.repeat(64),
    frozenAt: now,
  });
  assert.equal(frozen.intakeFrozenAt, now);
  assert.equal(frozen.originalArtifactSha256, sha);
  const replay = freezeEvidenceSessionIntake(frozen, {
    originalArtifactSha256: sha,
    normalizedSnapshotSha256: 'b'.repeat(64),
    frozenAt: later,
  });
  assert.equal(replay.intakeFrozenAt, now);
  assert.throws(() => freezeEvidenceSessionIntake(frozen, {
    originalArtifactSha256: 'c'.repeat(64),
    normalizedSnapshotSha256: 'b'.repeat(64),
    frozenAt: later,
  }), DomainValidationError);
});

test('commerce origins, image references and webhook endpoints require HTTPS', () => {
  assert.throws(() => integrationDtoSchema.parse({ ...structuredClone(samples.integration), allowedOrigins: ['packproof://merchant.example'] }), DomainValidationError);
  assert.throws(() => commerceContextDtoSchema.parse({
    ...structuredClone(samples.commerceContext),
    item: { ...structuredClone(item), imageReferences: [{ url: 'http://merchant.example/item.jpg', altText: null }] },
  }), DomainValidationError);
  assert.throws(() => webhookEndpointDtoSchema.parse({ ...structuredClone(samples.webhookEndpoint), url: 'packproof://webhook' }), DomainValidationError);
});

test('evidence workflow advancement requires finalized, non-mismatched assurance', () => {
  const artifact = evidenceArtifactDtoSchema.parse(structuredClone(samples.evidenceArtifact));
  assert.equal(evidenceCanAdvanceWorkflow(artifact), true);
  const mismatched = evidenceArtifactDtoSchema.parse({
    ...structuredClone(samples.evidenceArtifact),
    status: 'QUARANTINED',
    assurance: { ...structuredClone(assurance), byteIntegrity: { status: 'MISMATCH', reasonCodes: ['SERVER_HASH_MISMATCH'] } },
  });
  assert.equal(evidenceCanAdvanceWorkflow(mismatched), false);
  assert.throws(() => evidenceArtifactDtoSchema.parse({ ...structuredClone(samples.evidenceArtifact), manifestId: null }), DomainValidationError);
  assert.throws(() => evidenceArtifactDtoSchema.parse({
    ...structuredClone(samples.evidenceArtifact),
    assurance: { ...structuredClone(assurance), byteIntegrity: { status: 'MISMATCH', reasonCodes: ['SERVER_HASH_MISMATCH'] } },
  }), DomainValidationError);
});

test('service HMAC is not public verification while explicit asymmetric metadata is', () => {
  const hmac = evidenceManifestDtoSchema.parse(structuredClone(samples.evidenceManifest));
  assert.equal(evidenceAuthenticationIsPubliclyVerifiable(hmac.authentication), false);
  const asymmetric = evidenceManifestDtoSchema.parse({
    ...structuredClone(samples.evidenceManifest),
    authentication: { type: 'ASYMMETRIC_SIGNATURE', algorithm: 'ES256', keyId: 'kms-key-v1', signatureBase64url: 'B'.repeat(86), verificationScope: 'PUBLIC_KEY' },
  });
  assert.equal(evidenceAuthenticationIsPubliclyVerifiable(asymmetric.authentication), true);
  assert.throws(() => evidenceManifestDtoSchema.parse({
    ...structuredClone(samples.evidenceManifest),
    authentication: { ...structuredClone(samples.evidenceManifest.authentication), signatureBase64url: 'B'.repeat(86) },
  }), DomainValidationError);
});

test('a bound passport draft must identify its canonical or legacy transaction', () => {
  assert.throws(() => passportDraftDtoSchema.parse({ ...structuredClone(samples.passportDraft), status: 'BOUND', transactionId: null }), DomainValidationError);
  assert.doesNotThrow(() => passportDraftDtoSchema.parse({ ...structuredClone(samples.passportDraft), status: 'BOUND', transactionId: 'txn_12345678' }));
});

test('compatibility mappers preserve legacy workflow meaning without exposing actor IDs', () => {
  const legacy = mapLegacyConsumerTransaction({
    id: 'legacyTransaction123', sellerId: 'firebase-seller', buyerId: 'firebase-buyer', status: 'SHIPPED', title: 'Legacy item', category: 'Collectible',
    description: 'Legacy description', priceMinor: 1000, currency: 'USD', identifiers: [], conditionNotes: '',
    terms: { saleType: 'SHIPPED', shippingResponsibility: 'SELLER', returns: 'AS_AGREED', returnWindowDays: 7, customTerms: '' },
    createdAt: new Date(now), updatedAt: new Date(later), lockedAt: new Date(now),
  });
  assert.equal(legacy.origin, 'CONSUMER');
  assert.equal(legacy.fulfillmentState, 'IN_TRANSIT');
  assert.equal(JSON.stringify(legacy).includes('firebase-seller'), false);
  assert.equal(JSON.stringify(legacy).includes('firebase-buyer'), false);
  assert.doesNotThrow(() => transactionDtoSchema.parse(legacy));

  const merchant = mapLegacyMerchantTransaction({
    id: 'txn_12345678', merchantReference: 'order-1', title: 'Merchant item', description: '', category: null, amount: null,
    participants: [{ role: 'SELLER', externalReference: 'seller-1' }], status: 'CREATED', createdAt: new Date(now), updatedAt: new Date(now),
  });
  assert.equal(merchant.origin, 'MERCHANT_API');
  assert.equal(merchant.status, 'DRAFT');
  assert.equal(merchant.participants[0].claimState, 'UNCLAIMED');
  assert.doesNotThrow(() => transactionDtoSchema.parse(merchant));
});

test('public DTO samples exclude internal secret and storage fields', () => {
  const serialized = JSON.stringify(Object.values(samples));
  for (const forbidden of ['credentialVerifier', 'secretReference', 'signingSecretReference', 'tokenHash', 'storagePath', 'claimedActorId', 'requestedByActorId', 'uploaderId']) {
    assert.equal(serialized.includes(forbidden), false, `public examples leaked ${forbidden}`);
  }
});

test('versioned commerce parsers extract order metadata from eBay, Etsy, Shopify, and generic fixtures', () => {
  const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'intake');
  const ebay = parseCommerceArtifact(readFileSync(join(fixtureDir, 'ebay-sold.eml'), 'utf8'), 'EMAIL_RECEIPT');
  assert.equal(ebay.parserVersion, EBAY_EMAIL_PARSER_V1);
  assert.equal(ebay.platformIdentifier, 'EBAY');
  assert.equal(ebay.item.title, 'Nintendo Switch 2');
  assert.equal(ebay.item.amount?.minorUnits, 44900);
  assert.equal(ebay.externalOrderId, '12-34567-89012');
  assert.equal(ebay.item.selectedOptions[0]?.value, 'Mario Kart World Bundle');
  assert.equal(ebay.missingFields.includes('title'), false);
  assert.equal(ebay.extractionQuality.platform, 'FORMAT_MATCH');
  assert.equal(ebay.extractionQuality.title, 'EXACT_LABELED');
  assert.equal(ebay.extractionQuality.price, 'EXACT_LABELED');
  assert.equal(ebay.extractionQuality.orderNumber, 'EXACT_LABELED');
  assert.deepEqual(ebay.heuristicFields, []);

  const etsy = parseCommerceArtifact(readFileSync(join(fixtureDir, 'etsy-sold.txt'), 'utf8'), 'EMAIL_RECEIPT');
  assert.equal(etsy.parserVersion, ETSY_EMAIL_PARSER_V1);
  assert.equal(etsy.item.title, 'Handmade leather wallet');
  assert.equal(etsy.externalOrderId, '2233445566');
  assert.equal(etsy.item.amount?.minorUnits, 4500);

  const shopify = parseCommerceArtifact(readFileSync(join(fixtureDir, 'shopify-order.txt'), 'utf8'), 'SHARE_SHEET');
  assert.equal(shopify.parserVersion, SHOPIFY_EMAIL_PARSER_V1);
  assert.equal(shopify.item.title, 'Nike Air Max 90');
  assert.equal(shopify.externalOrderId, '1042');
  assert.equal(shopify.item.amount?.minorUnits, 12900);

  const generic = parseCommerceArtifact(readFileSync(join(fixtureDir, 'generic-receipt.txt'), 'utf8'), 'PDF_IMPORT');
  assert.equal(generic.parserVersion, GENERIC_COMMERCE_TEXT_PARSER_V1);
  assert.equal(generic.item.title, 'Sony A7 Camera');
  assert.equal(generic.externalOrderId, 'A-998877');
  assert.equal(generic.item.amount?.minorUnits, 129900);
  assert.equal(generic.item.sku, 'A7-BODY');
  assert.equal(generic.extractionQuality.title, 'HEURISTIC');
  assert.equal(generic.extractionQuality.price, 'EXACT_LABELED');
  assert.ok(generic.heuristicFields.includes('title'));

  const heuristicMoney = parseCommerceArtifact('Thanks for buying.\nShipping $8.00\nItem: Widget', 'SHARE_SHEET');
  assert.equal(heuristicMoney.item.title, 'Widget');
  assert.equal(heuristicMoney.extractionQuality.title, 'EXACT_LABELED');
  assert.equal(heuristicMoney.extractionQuality.price, 'HEURISTIC');
  assert.equal(heuristicMoney.item.amount?.minorUnits, 800);
  assert.ok(heuristicMoney.heuristicFields.includes('price'));

  const screenshot = parseCommerceArtifact(null, 'SCREENSHOT_IMPORT');
  assert.deepEqual(screenshot.missingFields, ['title', 'price', 'variant', 'orderNumber']);
  assert.equal(canTransition(commerceContextTransitions, 'CREATED', 'CLAIMED'), true);

  const html = parseCommerceArtifact(
    '<html><script>window.steal="secret"</script\t\n bar><p>Item: Safe listing</p><p>Order: 99-88888-77777</p></html>',
    'EMAIL_RECEIPT',
  );
  assert.equal(html.item.title.includes('secret'), false);
  assert.equal(html.item.description.includes('secret'), false);
  assert.match(html.item.title, /Safe listing/);
});
