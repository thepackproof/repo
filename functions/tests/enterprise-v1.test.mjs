import assert from 'node:assert/strict';
import test from 'node:test';
import {
  acquisitionClassSatisfies,
  acquisitionClassesHaveEqualAssurance,
  acquisitionSourceAuthorizesFinalization,
  assertEdgeSecretIsPurposeSeparated,
  assertEnterpriseResourceCatalogComplete,
  assertFulfillmentTransition,
  assertNeutralEnterpriseStatement,
  assertRollingCaptureProvenance,
  canTransitionFulfillment,
  classifyBarcode,
  deviceCredentialDtoSchema,
  DomainValidationError,
  edgeCapabilityAllows,
  edgeMayFinalizeEvidence,
  edgeRequestBindingSchema,
  enterpriseArtifactDtoSchema,
  enterpriseEvidenceSessionDtoSchema,
  enterpriseOrganizationDtoSchema,
  enterpriseResourceContracts,
  enterpriseResourceKinds,
  enterpriseSiteDtoSchema,
  enterpriseV1ComputerVisionRequired,
  evaluateEnterprisePolicy,
  forbiddenEdgeSecretNames,
  fulfillmentSessionDtoSchema,
  fulfillmentSessionStatuses,
  fulfillmentSessionTransitions,
  hardwareObservationDtoSchema,
  packingStationDtoSchema,
  parseEnterpriseResourceId,
  syncLabelForQueueObject,
  uploadSuccessIsServerFinalization,
} from '../lib/domain/v1/index.js';

const now = '2026-08-17T12:00:00.000Z';
const later = '2026-08-17T12:30:00.000Z';
const sha = 'a'.repeat(64);

const rolling = {
  captureSource: 'ENTERPRISE_EDGE',
  sourceStreamId: 'stream-1',
  segmentStart: now,
  segmentEnd: later,
  preRollDurationMs: 15000,
  postRollDurationMs: 15000,
  codec: 'avc1',
  originalSegmentHashes: [sha, 'b'.repeat(64)],
  assemblyMethod: 'DETERMINISTIC_CHUNK_CONCAT',
  captureKind: 'DERIVED_TRANSACTION_SEGMENT',
};

const samples = {
  organization: {
    id: 'entorg_12345678', object: 'enterprise_organization', schemaVersion: 1, organizationId: 'org_12345678',
    status: 'ACTIVE', operatingMode: 'OBSERVE', defaultPolicyId: 'ENTERPRISE_STANDARD_OUTBOUND_V1', createdAt: now, updatedAt: now,
  },
  site: {
    id: 'site_12345678', object: 'enterprise_site', schemaVersion: 1, organizationId: 'org_12345678',
    code: 'CMH-FC-01', name: 'Columbus', status: 'ACTIVE', createdAt: now, updatedAt: now,
  },
  station: {
    id: 'station_12345678', object: 'packing_station', schemaVersion: 1, organizationId: 'org_12345678', siteId: 'site_12345678',
    code: 'PACK-042', status: 'ACTIVE', policyId: 'ENTERPRISE_STANDARD_OUTBOUND_V1', createdAt: now, updatedAt: now,
  },
  session: {
    id: 'fs_12345678', object: 'fulfillment_session', schemaVersion: 1, organizationId: 'org_12345678', siteId: 'site_12345678',
    stationId: 'station_12345678', transactionId: 'txn_12345678', edgeAgentId: 'edge_12345678', externalOrderId: '84721',
    expectedItems: [{ sku: 'SKU-928182', quantity: 1 }], expectedTrackingNumber: '1Z999AA',
    authorizedDeviceIds: ['sdev_12345678'], requiredEvidence: ['PACKING_VIDEO', 'SEAL_REFERENCE', 'TRACKING_OBSERVATION'],
    openedAt: now, captureWindowEndsAt: later, state: 'ACQUIRING', policyId: 'ENTERPRISE_STANDARD_OUTBOUND_V1',
    policyVersion: '1', acquisitionClass: 'ENTERPRISE_EDGE', operatingMode: 'OBSERVE', createdAt: now, updatedAt: now,
  },
  evidenceSession: {
    id: 'ees_12345678', object: 'enterprise_evidence_session', schemaVersion: 1, organizationId: 'org_12345678',
    siteId: 'site_12345678', stationId: 'station_12345678', edgeAgentId: 'edge_12345678', transactionId: 'txn_12345678',
    fulfillmentSessionId: 'fs_12345678', allowedDeviceIds: ['sdev_12345678'],
    allowedArtifactTypes: ['STATION_PACKING_VIDEO', 'STATION_SEAL_REFERENCE'], maxArtifacts: 4, captureWindowEndsAt: later,
    policyId: 'ENTERPRISE_STANDARD_OUTBOUND_V1', status: 'ACTIVE', createdAt: now, updatedAt: now,
  },
  artifact: {
    id: 'eart_12345678', object: 'enterprise_artifact', schemaVersion: 1, fulfillmentSessionId: 'fs_12345678',
    evidenceSessionId: 'ees_12345678', type: 'STATION_PACKING_VIDEO', status: 'FINALIZED', acquisitionClass: 'ENTERPRISE_EDGE',
    contentType: 'video/mp4', sizeBytes: 2048, sha256: sha, rollingCapture: rolling,
    uploadId: 'a'.repeat(64), manifestSha256: sha, evidenceBundleSha256: 'c'.repeat(64),
    attestationStatus: 'ENTERPRISE_EDGE_INSTALLATION', serverFinalizedAt: now,
    createdAt: now, updatedAt: now,
  },
  observation: {
    id: 'hob_12345678', object: 'hardware_observation', schemaVersion: 1, fulfillmentSessionId: 'fs_12345678',
    deviceId: 'sdev_12345678', type: 'PACKAGE_WEIGHT_OBSERVATION', acquisitionClass: 'ENTERPRISE_EDGE',
    normalizedValue: null, grams: 842, rawValueHash: sha, monotonicTimestampMs: 1, createdAt: now, updatedAt: now,
  },
  credential: {
    id: 'dcred_12345678', object: 'device_credential', schemaVersion: 1, edgeAgentId: 'edge_12345678',
    publicKeySpkiSha256: sha, keyStorage: 'TPM', status: 'ACTIVE', createdAt: now, updatedAt: now,
  },
};

test('enterprise resource catalog is complete and parallel to the original 17 families', () => {
  assert.doesNotThrow(() => assertEnterpriseResourceCatalogComplete());
  assert.equal(enterpriseResourceKinds.length, 12);
  assert.equal(Object.keys(enterpriseResourceContracts).length, 12);
  assert.equal(parseEnterpriseResourceId('fulfillment_session', 'fs_12345678'), 'fs_12345678');
  assert.throws(() => parseEnterpriseResourceId('fulfillment_session', 'txn_12345678'), DomainValidationError);
});

test('enterprise public DTOs parse and reject unknown or secret fields', () => {
  assert.deepEqual(enterpriseOrganizationDtoSchema.parse(structuredClone(samples.organization)), samples.organization);
  assert.deepEqual(enterpriseSiteDtoSchema.parse(structuredClone(samples.site)), samples.site);
  assert.deepEqual(packingStationDtoSchema.parse(structuredClone(samples.station)), samples.station);
  assert.deepEqual(fulfillmentSessionDtoSchema.parse(structuredClone(samples.session)), samples.session);
  assert.deepEqual(enterpriseEvidenceSessionDtoSchema.parse(structuredClone(samples.evidenceSession)), samples.evidenceSession);
  assert.deepEqual(enterpriseArtifactDtoSchema.parse(structuredClone(samples.artifact)), samples.artifact);
  assert.deepEqual(hardwareObservationDtoSchema.parse(structuredClone(samples.observation)), samples.observation);
  assert.deepEqual(deviceCredentialDtoSchema.parse(structuredClone(samples.credential)), samples.credential);
  assert.throws(() => deviceCredentialDtoSchema.parse({ ...samples.credential, privateKey: 'secret' }), DomainValidationError);
  assert.throws(() => enterpriseArtifactDtoSchema.parse({ ...samples.artifact, storagePath: 'gs://hidden' }), DomainValidationError);
  assert.throws(() => enterpriseArtifactDtoSchema.parse({ ...samples.artifact, attestationStatus: 'ONLINE_APP_CHECK_ONLY' }), DomainValidationError);
});

test('fulfillment session transitions cover the vocabulary and reject a generic failed collapse', () => {
  assert.deepEqual(Object.keys(fulfillmentSessionTransitions).sort(), [...fulfillmentSessionStatuses].sort());
  assert.equal(canTransitionFulfillment('CREATED', 'STATION_BOUND'), true);
  assert.equal(canTransitionFulfillment('ACQUIRING', 'PACKING_COMPLETE'), true);
  assert.equal(canTransitionFulfillment('EVIDENCE_READY', 'RELEASED'), true);
  assert.equal(canTransitionFulfillment('INTEGRITY_FAILURE', 'EVIDENCE_READY'), false);
  assert.equal(canTransitionFulfillment('EVIDENCE_INCOMPLETE', 'RELEASED'), true);
  assert.throws(() => assertFulfillmentTransition('RELEASED', 'ACQUIRING'), DomainValidationError);
  assert.equal(fulfillmentSessionStatuses.includes('FAILED'), false);
});

test('acquisition classes are never silently equivalent and cannot finalize evidence', () => {
  assert.equal(acquisitionClassesHaveEqualAssurance('NATIVE_MOBILE', 'ENTERPRISE_EDGE'), false);
  assert.equal(acquisitionClassSatisfies('EXTERNAL_DECLARED', 'ENTERPRISE_EDGE'), false);
  assert.equal(acquisitionClassSatisfies('ENTERPRISE_EDGE', 'ENTERPRISE_EDGE'), true);
  assert.equal(acquisitionSourceAuthorizesFinalization('ENTERPRISE_EDGE'), false);
  assert.equal(edgeMayFinalizeEvidence(), false);
  assert.equal(uploadSuccessIsServerFinalization(), false);
  assert.equal(enterpriseV1ComputerVisionRequired, false);
});

test('rolling capture provenance cannot be disguised as a camera-original file', () => {
  assert.doesNotThrow(() => assertRollingCaptureProvenance(rolling));
  assert.throws(() => assertRollingCaptureProvenance({
    ...rolling,
    captureKind: 'CAMERA_ORIGINAL_FILE',
    assemblyMethod: 'CAMERA_ORIGINAL_FILE',
  }), DomainValidationError);
});

test('workflow policy evaluation keeps OBSERVE non-blocking and ENFORCE blocking', () => {
  const ready = [
    { requirement: 'PACKING_VIDEO', acquisitionClass: 'ENTERPRISE_EDGE', captured: true, serverFinalized: true, integrityMismatch: false, detail: 'Packing video server-finalized' },
    { requirement: 'SEAL_REFERENCE', acquisitionClass: 'ENTERPRISE_EDGE', captured: true, serverFinalized: true, integrityMismatch: false, detail: 'Seal reference server-finalized' },
    { requirement: 'TRACKING_OBSERVATION', acquisitionClass: 'ENTERPRISE_EDGE', captured: true, serverFinalized: true, integrityMismatch: false, detail: 'Expected tracking identifier observed: 1Z999AA' },
  ];
  const incomplete = ready.slice(0, 1);
  const observe = evaluateEnterprisePolicy({ policyId: 'ENTERPRISE_OUTBOUND_V1', operatingMode: 'OBSERVE', facts: incomplete, operatorOverride: false });
  assert.equal(observe.policyId, 'ENTERPRISE_STANDARD_OUTBOUND_V1');
  assert.equal(observe.gating, 'NONE');
  assert.equal(observe.fulfillmentAdvanceAllowed, true);
  const enforce = evaluateEnterprisePolicy({ policyId: 'ENTERPRISE_STANDARD_OUTBOUND_V1', operatingMode: 'ENFORCE', facts: incomplete, operatorOverride: false });
  assert.equal(enforce.gating, 'BLOCKING');
  assert.equal(enforce.fulfillmentAdvanceAllowed, false);
  const assist = evaluateEnterprisePolicy({ policyId: 'ENTERPRISE_STANDARD_OUTBOUND_V1', operatingMode: 'ASSIST', facts: incomplete, operatorOverride: true });
  assert.equal(assist.gating, 'ADVISORY');
  assert.equal(assist.fulfillmentAdvanceAllowed, true);
  const external = evaluateEnterprisePolicy({
    policyId: 'ENTERPRISE_STANDARD_OUTBOUND_V1',
    operatingMode: 'ENFORCE',
    facts: ready.map((fact) => ({ ...fact, acquisitionClass: 'EXTERNAL_DECLARED' })),
    operatorOverride: false,
  });
  assert.ok(external.workflowMissing.includes('PACKING_VIDEO'));
});

test('neutral statements are observations and reject fraud conclusions', () => {
  assert.equal(assertNeutralEnterpriseStatement('Packing video server-finalized'), 'Packing video server-finalized');
  assert.throws(() => assertNeutralEnterpriseStatement('SELLER DID NOT COMMIT FRAUD'), DomainValidationError);
});

test('Edge request binding and capability scope stay exact, not open-ended', () => {
  const binding = edgeRequestBindingSchema.parse({
    organizationId: 'org_12345678', siteId: 'site_12345678', edgeAgentId: 'edge_12345678', stationId: 'station_12345678',
    sessionId: 'fs_12345678', requestId: 'request_1', timestamp: now, nonce: 'n'.repeat(16),
  });
  assert.equal(binding.stationId, 'station_12345678');
  const scope = {
    organizationId: 'org_12345678', siteId: 'site_12345678', stationId: 'station_12345678', edgeAgentId: 'edge_12345678',
    transactionId: 'txn_12345678', allowedDeviceIds: ['sdev_12345678'], allowedArtifactTypes: ['STATION_PACKING_VIDEO'],
    maxArtifacts: 2, captureWindowEndsAt: later, policyId: 'ENTERPRISE_STANDARD_OUTBOUND_V1',
  };
  assert.equal(edgeCapabilityAllows(scope, {
    ...scope, deviceId: 'sdev_12345678', artifactType: 'STATION_PACKING_VIDEO', artifactCount: 0, now,
  }), true);
  assert.equal(edgeCapabilityAllows(scope, {
    ...scope, deviceId: 'sdev_other', artifactType: 'STATION_PACKING_VIDEO', artifactCount: 0, now,
  }), false);
});

test('barcode classification and queue labels keep acquisition and transport separate', () => {
  assert.equal(classifyBarcode('SKU-1', ['SKU-1'], '1Z999'), 'ITEM_OBSERVED');
  assert.equal(classifyBarcode('1Z999', ['SKU-1'], '1Z999'), 'TRACKING_OBSERVED');
  assert.equal(classifyBarcode('NOPE', ['SKU-1'], '1Z999'), 'UNRECOGNIZED');
  assert.equal(syncLabelForQueueObject({ acquisitionAssurance: 'OFFLINE_CAPTURED', transportState: 'PENDING' }), 'OFFLINE_PENDING_SYNC');
  assert.equal(syncLabelForQueueObject({ acquisitionAssurance: 'ONLINE_ASSURED', transportState: 'AWAITING_FINALIZATION' }), 'SYNCED');
  assert.equal(syncLabelForQueueObject({ acquisitionAssurance: 'ONLINE_ASSURED', transportState: 'SERVER_FINALIZED' }), 'SERVER_FINALIZED');
});

test('Edge credentials cannot reuse purpose-separated PackProof secrets', () => {
  for (const name of forbiddenEdgeSecretNames) {
    assert.throws(() => assertEdgeSecretIsPurposeSeparated(name), DomainValidationError);
  }
  assert.throws(() => assertEdgeSecretIsPurposeSeparated('APP_CHECK'), DomainValidationError);
  assert.doesNotThrow(() => assertEdgeSecretIsPurposeSeparated('EDGE_DEVICE_CA_SECRET'));
});
