import { assertTransition, canTransition, parseResourceId, type ResourceId } from './common';
import {
  arrayValue,
  DomainValidationError,
  enumValue,
  integerValue,
  isoDateTime,
  literalValue,
  optionalIsoDateTime,
  optionalString,
  schema,
  sha256Value,
  strictObject,
  stringValue,
} from './runtime';

declare const enterpriseResourceIdBrand: unique symbol;
export type EnterpriseResourceId<K extends EnterpriseResourceKind> = string & { readonly [enterpriseResourceIdBrand]: K };

export const enterpriseResourceKinds = [
  'enterprise_organization',
  'enterprise_site',
  'packing_station',
  'edge_agent',
  'station_device',
  'device_credential',
  'fulfillment_session',
  'station_event',
  'enterprise_artifact',
  'hardware_observation',
  'workflow_policy',
  'enterprise_evidence_session',
] as const;
export type EnterpriseResourceKind = (typeof enterpriseResourceKinds)[number];

export const enterpriseResourceIdPrefixes: Readonly<Record<EnterpriseResourceKind, string>> = {
  enterprise_organization: 'entorg_',
  enterprise_site: 'site_',
  packing_station: 'station_',
  edge_agent: 'edge_',
  station_device: 'sdev_',
  device_credential: 'dcred_',
  fulfillment_session: 'fs_',
  station_event: 'sevt_',
  enterprise_artifact: 'eart_',
  hardware_observation: 'hob_',
  workflow_policy: 'pol_',
  enterprise_evidence_session: 'ees_',
};

const enterpriseIdPattern = /^[a-z][a-z_]*[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;

export function parseEnterpriseResourceId<K extends EnterpriseResourceKind>(
  kind: K,
  value: unknown,
  path = `${kind}Id`,
): EnterpriseResourceId<K> {
  const result = stringValue(value, path, { min: 10, max: 160 });
  const prefix = enterpriseResourceIdPrefixes[kind];
  if (!result.startsWith(prefix) || !enterpriseIdPattern.test(result)) {
    throw new DomainValidationError({ path, code: 'FORMAT', message: `must use the ${prefix} identifier format` });
  }
  return result as EnterpriseResourceId<K>;
}

export type EnterprisePublicResource<K extends EnterpriseResourceKind, O extends string> = {
  id: EnterpriseResourceId<K>;
  object: O;
  schemaVersion: 1;
  createdAt: string;
  updatedAt: string;
};

export const acquisitionClasses = ['NATIVE_MOBILE', 'ENTERPRISE_EDGE', 'EXTERNAL_DECLARED'] as const;
export type AcquisitionClass = (typeof acquisitionClasses)[number];

export const enterpriseOperatingModes = ['OBSERVE', 'ASSIST', 'ENFORCE'] as const;
export type EnterpriseOperatingMode = (typeof enterpriseOperatingModes)[number];

export const enterpriseOrganizationStatuses = ['ACTIVE', 'SUSPENDED'] as const;
export const enterpriseSiteStatuses = ['ACTIVE', 'DISABLED'] as const;
export const packingStationStatuses = ['ACTIVE', 'DISABLED', 'MAINTENANCE'] as const;
export const edgeAgentStatuses = ['REGISTERED', 'ACTIVE', 'REVOKED'] as const;
export const stationDeviceKinds = ['OVERHEAD_CAMERA', 'LABEL_CAMERA', 'BARCODE_SCANNER', 'SCALE', 'PRINTER'] as const;
export const stationDeviceStatuses = ['REGISTERED', 'ONLINE', 'OFFLINE', 'FAULTED'] as const;
export const deviceCredentialKeyStorage = ['TPM', 'PLATFORM_KEYSTORE', 'SOFTWARE_WRAPPED'] as const;
export const deviceCredentialStatuses = ['ACTIVE', 'ROTATING', 'REVOKED'] as const;

export const fulfillmentSessionStatuses = [
  'CREATED',
  'STATION_BOUND',
  'ACQUIRING',
  'PACKING_COMPLETE',
  'FINALIZING',
  'EVIDENCE_READY',
  'RELEASED',
  'INTERRUPTED',
  'DEVICE_FAULT',
  'EVIDENCE_INCOMPLETE',
  'INTEGRITY_FAILURE',
  'EXPIRED',
  'CANCELLED',
] as const;
export type FulfillmentSessionStatus = (typeof fulfillmentSessionStatuses)[number];

export const fulfillmentSessionTransitions: Readonly<Record<FulfillmentSessionStatus, readonly FulfillmentSessionStatus[]>> = {
  CREATED: ['STATION_BOUND', 'CANCELLED', 'EXPIRED'],
  STATION_BOUND: ['ACQUIRING', 'DEVICE_FAULT', 'INTERRUPTED', 'CANCELLED', 'EXPIRED'],
  ACQUIRING: ['PACKING_COMPLETE', 'INTERRUPTED', 'DEVICE_FAULT', 'EVIDENCE_INCOMPLETE', 'EXPIRED', 'CANCELLED'],
  PACKING_COMPLETE: ['FINALIZING', 'EVIDENCE_INCOMPLETE', 'INTEGRITY_FAILURE', 'INTERRUPTED', 'CANCELLED'],
  FINALIZING: ['EVIDENCE_READY', 'INTEGRITY_FAILURE', 'EVIDENCE_INCOMPLETE', 'INTERRUPTED'],
  EVIDENCE_READY: ['RELEASED'],
  RELEASED: [],
  INTERRUPTED: ['ACQUIRING', 'DEVICE_FAULT', 'EVIDENCE_INCOMPLETE', 'CANCELLED', 'EXPIRED'],
  DEVICE_FAULT: ['ACQUIRING', 'EVIDENCE_INCOMPLETE', 'CANCELLED', 'EXPIRED'],
  EVIDENCE_INCOMPLETE: ['ACQUIRING', 'FINALIZING', 'RELEASED', 'CANCELLED', 'EXPIRED'],
  INTEGRITY_FAILURE: [],
  EXPIRED: [],
  CANCELLED: [],
};

export const enterpriseArtifactTypes = [
  'STATION_PACKING_VIDEO',
  'STATION_SEAL_REFERENCE',
  'ITEM_REFERENCE_PHOTO',
  'STATION_EVENT_LOG',
] as const;
export type EnterpriseArtifactType = (typeof enterpriseArtifactTypes)[number];

export const enterpriseArtifactStatuses = ['RESERVED', 'UPLOADED', 'FINALIZED', 'QUARANTINED', 'FAILED'] as const;
export type EnterpriseArtifactStatus = (typeof enterpriseArtifactStatuses)[number];

export const enterpriseArtifactTransitions: Readonly<Record<EnterpriseArtifactStatus, readonly EnterpriseArtifactStatus[]>> = {
  RESERVED: ['UPLOADED', 'FAILED'],
  UPLOADED: ['FINALIZED', 'QUARANTINED', 'FAILED'],
  FINALIZED: [],
  QUARANTINED: [],
  FAILED: [],
};

export const enterpriseObservationTypes = [
  'ITEM_BARCODE_OBSERVATION',
  'TRACKING_BARCODE_OBSERVATION',
  'PACKAGE_WEIGHT_OBSERVATION',
] as const;
export type EnterpriseObservationType = (typeof enterpriseObservationTypes)[number];

export const enterpriseRequirementKeys = [
  'PACKING_VIDEO',
  'SEAL_REFERENCE',
  'TRACKING_OBSERVATION',
  'ITEM_BARCODE',
  'ITEM_REFERENCE_PHOTO',
  'STABLE_WEIGHT',
] as const;
export type EnterpriseRequirementKey = (typeof enterpriseRequirementKeys)[number];

export const forbiddenEdgeSecretNames = [
  'API_CREDENTIAL_PEPPER',
  'MANIFEST_SIGNING_SECRET',
  'MANIFEST_SIGNING_KEY_ID',
  'PARTICIPANT_HANDOFF_SIGNING_SECRET',
  'PUBLIC_HANDOFF_SIGNING_SECRET',
  'WEBHOOK_SIGNING_SECRET',
] as const;

export const enterpriseV1ComputerVisionRequired = false;

export type WorkflowPolicyRequirement = {
  key: EnterpriseRequirementKey;
  required: boolean;
  requiredAcquisitionClass: AcquisitionClass;
};

export type WorkflowPolicyDefinition = {
  policyId: string;
  policyVersion: string;
  requirements: readonly WorkflowPolicyRequirement[];
};

export const enterpriseWorkflowPolicies: Readonly<Record<string, WorkflowPolicyDefinition>> = {
  ENTERPRISE_STANDARD_OUTBOUND_V1: {
    policyId: 'ENTERPRISE_STANDARD_OUTBOUND_V1',
    policyVersion: '1',
    requirements: [
      { key: 'PACKING_VIDEO', required: true, requiredAcquisitionClass: 'ENTERPRISE_EDGE' },
      { key: 'SEAL_REFERENCE', required: true, requiredAcquisitionClass: 'ENTERPRISE_EDGE' },
      { key: 'TRACKING_OBSERVATION', required: true, requiredAcquisitionClass: 'ENTERPRISE_EDGE' },
      { key: 'ITEM_BARCODE', required: false, requiredAcquisitionClass: 'ENTERPRISE_EDGE' },
      { key: 'STABLE_WEIGHT', required: false, requiredAcquisitionClass: 'ENTERPRISE_EDGE' },
    ],
  },
  ENTERPRISE_OUTBOUND_V1: {
    policyId: 'ENTERPRISE_STANDARD_OUTBOUND_V1',
    policyVersion: '1',
    requirements: [
      { key: 'PACKING_VIDEO', required: true, requiredAcquisitionClass: 'ENTERPRISE_EDGE' },
      { key: 'SEAL_REFERENCE', required: true, requiredAcquisitionClass: 'ENTERPRISE_EDGE' },
      { key: 'TRACKING_OBSERVATION', required: true, requiredAcquisitionClass: 'ENTERPRISE_EDGE' },
      { key: 'ITEM_BARCODE', required: false, requiredAcquisitionClass: 'ENTERPRISE_EDGE' },
      { key: 'STABLE_WEIGHT', required: false, requiredAcquisitionClass: 'ENTERPRISE_EDGE' },
    ],
  },
  ENTERPRISE_HIGH_VALUE_V1: {
    policyId: 'ENTERPRISE_HIGH_VALUE_V1',
    policyVersion: '1',
    requirements: [
      { key: 'ITEM_BARCODE', required: true, requiredAcquisitionClass: 'ENTERPRISE_EDGE' },
      { key: 'ITEM_REFERENCE_PHOTO', required: true, requiredAcquisitionClass: 'ENTERPRISE_EDGE' },
      { key: 'PACKING_VIDEO', required: true, requiredAcquisitionClass: 'ENTERPRISE_EDGE' },
      { key: 'SEAL_REFERENCE', required: true, requiredAcquisitionClass: 'ENTERPRISE_EDGE' },
      { key: 'TRACKING_OBSERVATION', required: true, requiredAcquisitionClass: 'ENTERPRISE_EDGE' },
      { key: 'STABLE_WEIGHT', required: true, requiredAcquisitionClass: 'ENTERPRISE_EDGE' },
    ],
  },
};

export type ExpectedItem = {
  sku: string;
  quantity: number;
};

export type RollingCaptureProvenance = {
  captureSource: AcquisitionClass;
  sourceStreamId: string;
  segmentStart: string;
  segmentEnd: string;
  preRollDurationMs: number;
  postRollDurationMs: number;
  codec: string;
  originalSegmentHashes: string[];
  assemblyMethod: 'DETERMINISTIC_CHUNK_CONCAT' | 'CAMERA_ORIGINAL_FILE';
  captureKind: 'DERIVED_TRANSACTION_SEGMENT' | 'CAMERA_ORIGINAL_FILE';
};

export type PolicyEvidenceFact = {
  requirement: EnterpriseRequirementKey;
  acquisitionClass: AcquisitionClass;
  captured: boolean;
  serverFinalized: boolean;
  integrityMismatch: boolean;
  detail: string | null;
};

export type PolicyEvaluationInput = {
  policyId: string;
  operatingMode: EnterpriseOperatingMode;
  facts: readonly PolicyEvidenceFact[];
  operatorOverride: boolean;
};

export type PolicyEvaluation = {
  policyId: string;
  policyVersion: string;
  operatingMode: EnterpriseOperatingMode;
  capturePresent: EnterpriseRequirementKey[];
  captureMissing: EnterpriseRequirementKey[];
  workflowReady: EnterpriseRequirementKey[];
  workflowMissing: EnterpriseRequirementKey[];
  gating: 'NONE' | 'ADVISORY' | 'BLOCKING';
  fulfillmentAdvanceAllowed: boolean;
  operatorOverrideApplied: boolean;
  statements: string[];
};

const identifierPattern = /^[A-Za-z0-9._:-]{1,160}$/;

function parseExpectedItem(value: unknown, path: string): ExpectedItem {
  const input = strictObject(value, path, ['sku', 'quantity']);
  return {
    sku: stringValue(input.sku, `${path}.sku`, { min: 1, max: 120, pattern: /^[A-Za-z0-9._:-]+$/ }),
    quantity: integerValue(input.quantity, `${path}.quantity`, 1, 10_000),
  };
}

export function resolveWorkflowPolicy(policyId: string): WorkflowPolicyDefinition {
  const policy = enterpriseWorkflowPolicies[policyId];
  if (!policy) {
    throw new DomainValidationError({ path: 'policyId', code: 'FORMAT', message: `unknown workflow policy ${policyId}` });
  }
  return policy;
}

export function acquisitionClassesHaveEqualAssurance(left: AcquisitionClass, right: AcquisitionClass): boolean {
  return left === right;
}

export function acquisitionClassSatisfies(actual: AcquisitionClass, required: AcquisitionClass): boolean {
  return actual === required;
}

export function acquisitionSourceAuthorizesFinalization(_source: AcquisitionClass): false {
  return false;
}

export function edgeMayFinalizeEvidence(): false {
  return false;
}

export function assertEdgeSecretIsPurposeSeparated(secretName: string): void {
  if ((forbiddenEdgeSecretNames as readonly string[]).includes(secretName) || secretName === 'APP_CHECK' || secretName === 'FIREBASE_APP_CHECK') {
    throw new DomainValidationError({
      path: 'secretName',
      code: 'FORMAT',
      message: 'Edge credentials must not reuse merchant, manifest, handoff, webhook, or App Check secrets',
    });
  }
}

export function assertRollingCaptureProvenance(provenance: RollingCaptureProvenance): void {
  if (provenance.captureKind === 'CAMERA_ORIGINAL_FILE' || provenance.assemblyMethod === 'CAMERA_ORIGINAL_FILE') {
    if (provenance.preRollDurationMs > 0 || provenance.postRollDurationMs > 0 || provenance.originalSegmentHashes.length > 1) {
      throw new DomainValidationError({
        path: 'rollingCapture.captureKind',
        code: 'FORMAT',
        message: 'a derived rolling segment must not be described as a camera-original file',
      });
    }
  }
  if (provenance.assemblyMethod === 'DETERMINISTIC_CHUNK_CONCAT' && provenance.originalSegmentHashes.length < 1) {
    throw new DomainValidationError({
      path: 'rollingCapture.originalSegmentHashes',
      code: 'RANGE',
      message: 'deterministic chunk assembly requires independently hashed source segments',
    });
  }
}

export function canTransitionFulfillment(from: FulfillmentSessionStatus, to: FulfillmentSessionStatus): boolean {
  return canTransition(fulfillmentSessionTransitions, from, to);
}

export function assertFulfillmentTransition(from: FulfillmentSessionStatus, to: FulfillmentSessionStatus): void {
  assertTransition(fulfillmentSessionTransitions, from, to, 'fulfillmentSession');
}

const requirementSatisfiers: Readonly<Record<EnterpriseRequirementKey, { artifact?: EnterpriseArtifactType; observation?: EnterpriseObservationType }>> = {
  PACKING_VIDEO: { artifact: 'STATION_PACKING_VIDEO' },
  SEAL_REFERENCE: { artifact: 'STATION_SEAL_REFERENCE' },
  ITEM_REFERENCE_PHOTO: { artifact: 'ITEM_REFERENCE_PHOTO' },
  TRACKING_OBSERVATION: { observation: 'TRACKING_BARCODE_OBSERVATION' },
  ITEM_BARCODE: { observation: 'ITEM_BARCODE_OBSERVATION' },
  STABLE_WEIGHT: { observation: 'PACKAGE_WEIGHT_OBSERVATION' },
};

export function requirementSatisfier(key: EnterpriseRequirementKey): { artifact?: EnterpriseArtifactType; observation?: EnterpriseObservationType } {
  return requirementSatisfiers[key];
}

export function evaluateEnterprisePolicy(input: PolicyEvaluationInput): PolicyEvaluation {
  const policy = resolveWorkflowPolicy(input.policyId);
  const capturePresent: EnterpriseRequirementKey[] = [];
  const captureMissing: EnterpriseRequirementKey[] = [];
  const workflowReady: EnterpriseRequirementKey[] = [];
  const workflowMissing: EnterpriseRequirementKey[] = [];
  const statements: string[] = [];

  for (const requirement of policy.requirements) {
    const fact = input.facts.find((item) => item.requirement === requirement.key);
    const classOk = fact ? acquisitionClassSatisfies(fact.acquisitionClass, requirement.requiredAcquisitionClass) : false;
    const captured = Boolean(fact?.captured && classOk);
    const ready = Boolean(captured && fact?.serverFinalized && !fact.integrityMismatch);
    if (!requirement.required) {
      if (captured) capturePresent.push(requirement.key);
      if (ready) {
        workflowReady.push(requirement.key);
        if (fact?.detail) statements.push(fact.detail);
      }
      continue;
    }
    if (captured) capturePresent.push(requirement.key);
    else captureMissing.push(requirement.key);
    if (ready) {
      workflowReady.push(requirement.key);
      if (fact?.detail) statements.push(fact.detail);
    } else {
      workflowMissing.push(requirement.key);
    }
  }

  const satisfied = workflowMissing.length === 0;
  const gating = input.operatingMode === 'OBSERVE' ? 'NONE' : input.operatingMode === 'ASSIST' ? 'ADVISORY' : 'BLOCKING';
  const operatorOverrideApplied = input.operatingMode === 'ASSIST' && input.operatorOverride && !satisfied;
  const fulfillmentAdvanceAllowed = gating === 'NONE' || satisfied || operatorOverrideApplied;
  return {
    policyId: policy.policyId,
    policyVersion: policy.policyVersion,
    operatingMode: input.operatingMode,
    capturePresent,
    captureMissing,
    workflowReady,
    workflowMissing,
    gating,
    fulfillmentAdvanceAllowed,
    operatorOverrideApplied,
    statements,
  };
}

const forbiddenStatementPattern = /(fraud|authenticat|custody|liability|disposition|did not commit|guilty|innocent|at fault)/i;

export function formatNeutralEnterpriseStatements(facts: readonly PolicyEvidenceFact[]): string[] {
  const statements: string[] = [];
  for (const fact of facts) {
    if (!fact.detail) continue;
    if (forbiddenStatementPattern.test(fact.detail)) {
      throw new DomainValidationError({
        path: 'statement',
        code: 'FORMAT',
        message: 'Enterprise statements must remain observations; they must not assert fraud, authenticity, custody, fault, or disposition',
      });
    }
    statements.push(fact.detail);
  }
  return statements;
}

export function assertNeutralEnterpriseStatement(statement: string): string {
  return formatNeutralEnterpriseStatements([{
    requirement: 'PACKING_VIDEO',
    acquisitionClass: 'ENTERPRISE_EDGE',
    captured: true,
    serverFinalized: true,
    integrityMismatch: false,
    detail: statement,
  }])[0];
}

export type EnterpriseOrganizationDto = EnterprisePublicResource<'enterprise_organization', 'enterprise_organization'> & {
  organizationId: ResourceId<'organization'>;
  status: (typeof enterpriseOrganizationStatuses)[number];
  operatingMode: EnterpriseOperatingMode;
  defaultPolicyId: string;
};

export type EnterpriseSiteDto = EnterprisePublicResource<'enterprise_site', 'enterprise_site'> & {
  organizationId: ResourceId<'organization'>;
  code: string;
  name: string;
  status: (typeof enterpriseSiteStatuses)[number];
};

export type PackingStationDto = EnterprisePublicResource<'packing_station', 'packing_station'> & {
  organizationId: ResourceId<'organization'>;
  siteId: EnterpriseResourceId<'enterprise_site'>;
  code: string;
  status: (typeof packingStationStatuses)[number];
  policyId: string;
};

export type EdgeAgentDto = EnterprisePublicResource<'edge_agent', 'edge_agent'> & {
  organizationId: ResourceId<'organization'>;
  siteId: EnterpriseResourceId<'enterprise_site'>;
  stationId: EnterpriseResourceId<'packing_station'> | null;
  installationIdentity: string;
  status: (typeof edgeAgentStatuses)[number];
};

export type StationDeviceDto = EnterprisePublicResource<'station_device', 'station_device'> & {
  organizationId: ResourceId<'organization'>;
  stationId: EnterpriseResourceId<'packing_station'>;
  kind: (typeof stationDeviceKinds)[number];
  code: string;
  adapter: 'USB_HID' | 'SERIAL' | 'UVC' | 'RTSP' | 'WMS' | 'SIMULATED';
  status: (typeof stationDeviceStatuses)[number];
};

export type DeviceCredentialDto = EnterprisePublicResource<'device_credential', 'device_credential'> & {
  edgeAgentId: EnterpriseResourceId<'edge_agent'>;
  publicKeySpkiSha256: string;
  keyStorage: (typeof deviceCredentialKeyStorage)[number];
  status: (typeof deviceCredentialStatuses)[number];
};

export type FulfillmentSessionDto = EnterprisePublicResource<'fulfillment_session', 'fulfillment_session'> & {
  organizationId: ResourceId<'organization'>;
  siteId: EnterpriseResourceId<'enterprise_site'>;
  stationId: EnterpriseResourceId<'packing_station'>;
  transactionId: ResourceId<'transaction'> | null;
  edgeAgentId: EnterpriseResourceId<'edge_agent'> | null;
  externalOrderId: string;
  expectedItems: ExpectedItem[];
  expectedTrackingNumber: string | null;
  authorizedDeviceIds: EnterpriseResourceId<'station_device'>[];
  requiredEvidence: EnterpriseRequirementKey[];
  openedAt: string | null;
  captureWindowEndsAt: string;
  state: FulfillmentSessionStatus;
  policyId: string;
  policyVersion: string;
  acquisitionClass: AcquisitionClass;
  operatingMode: EnterpriseOperatingMode;
};

export type StationEventDto = EnterprisePublicResource<'station_event', 'station_event'> & {
  fulfillmentSessionId: EnterpriseResourceId<'fulfillment_session'>;
  type: string;
  deviceId: EnterpriseResourceId<'station_device'> | null;
  payload: Record<string, string | number | boolean | null>;
  occurredAt: string;
};

export type EnterpriseArtifactDto = EnterprisePublicResource<'enterprise_artifact', 'enterprise_artifact'> & {
  fulfillmentSessionId: EnterpriseResourceId<'fulfillment_session'>;
  evidenceSessionId: EnterpriseResourceId<'enterprise_evidence_session'> | null;
  type: EnterpriseArtifactType;
  status: EnterpriseArtifactStatus;
  acquisitionClass: AcquisitionClass;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  rollingCapture: RollingCaptureProvenance | null;
  uploadId: string | null;
  manifestSha256: string | null;
  evidenceBundleSha256: string | null;
  attestationStatus: string | null;
  serverFinalizedAt: string | null;
};

export type HardwareObservationDto = EnterprisePublicResource<'hardware_observation', 'hardware_observation'> & {
  fulfillmentSessionId: EnterpriseResourceId<'fulfillment_session'>;
  deviceId: EnterpriseResourceId<'station_device'>;
  type: EnterpriseObservationType;
  acquisitionClass: AcquisitionClass;
  normalizedValue: string | null;
  grams: number | null;
  rawValueHash: string;
  monotonicTimestampMs: number;
};

export type WorkflowPolicyDto = EnterprisePublicResource<'workflow_policy', 'workflow_policy'> & {
  policyId: string;
  policyVersion: string;
  frozen: true;
};

export type EnterpriseEvidenceSessionDto = EnterprisePublicResource<'enterprise_evidence_session', 'enterprise_evidence_session'> & {
  organizationId: ResourceId<'organization'>;
  siteId: EnterpriseResourceId<'enterprise_site'>;
  stationId: EnterpriseResourceId<'packing_station'>;
  edgeAgentId: EnterpriseResourceId<'edge_agent'>;
  transactionId: ResourceId<'transaction'>;
  fulfillmentSessionId: EnterpriseResourceId<'fulfillment_session'>;
  allowedDeviceIds: EnterpriseResourceId<'station_device'>[];
  allowedArtifactTypes: EnterpriseArtifactType[];
  maxArtifacts: number;
  captureWindowEndsAt: string;
  policyId: string;
  status: 'ISSUED' | 'ACTIVE' | 'EXHAUSTED' | 'EXPIRED' | 'REVOKED';
};

export const enterpriseOrganizationDtoSchema = schema<EnterpriseOrganizationDto>((value) => {
  const input = strictObject(value, 'enterpriseOrganization', [
    'id', 'object', 'schemaVersion', 'organizationId', 'status', 'operatingMode', 'defaultPolicyId', 'createdAt', 'updatedAt',
  ]);
  literalValue(input.object, 'enterpriseOrganization.object', 'enterprise_organization');
  literalValue(input.schemaVersion, 'enterpriseOrganization.schemaVersion', 1);
  const result: EnterpriseOrganizationDto = {
    id: parseEnterpriseResourceId('enterprise_organization', input.id, 'enterpriseOrganization.id'),
    object: 'enterprise_organization',
    schemaVersion: 1,
    organizationId: parseResourceId('organization', input.organizationId, 'enterpriseOrganization.organizationId'),
    status: enumValue(input.status, 'enterpriseOrganization.status', enterpriseOrganizationStatuses),
    operatingMode: enumValue(input.operatingMode, 'enterpriseOrganization.operatingMode', enterpriseOperatingModes),
    defaultPolicyId: resolveWorkflowPolicy(stringValue(input.defaultPolicyId, 'enterpriseOrganization.defaultPolicyId', { min: 8, max: 80 })).policyId,
    createdAt: isoDateTime(input.createdAt, 'enterpriseOrganization.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'enterpriseOrganization.updatedAt'),
  };
  return result;
});

export const enterpriseSiteDtoSchema = schema<EnterpriseSiteDto>((value) => {
  const input = strictObject(value, 'enterpriseSite', [
    'id', 'object', 'schemaVersion', 'organizationId', 'code', 'name', 'status', 'createdAt', 'updatedAt',
  ]);
  literalValue(input.object, 'enterpriseSite.object', 'enterprise_site');
  literalValue(input.schemaVersion, 'enterpriseSite.schemaVersion', 1);
  return {
    id: parseEnterpriseResourceId('enterprise_site', input.id, 'enterpriseSite.id'),
    object: 'enterprise_site',
    schemaVersion: 1,
    organizationId: parseResourceId('organization', input.organizationId, 'enterpriseSite.organizationId'),
    code: stringValue(input.code, 'enterpriseSite.code', { min: 2, max: 40, pattern: /^[A-Z0-9-]+$/ }),
    name: stringValue(input.name, 'enterpriseSite.name', { min: 2, max: 120 }),
    status: enumValue(input.status, 'enterpriseSite.status', enterpriseSiteStatuses),
    createdAt: isoDateTime(input.createdAt, 'enterpriseSite.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'enterpriseSite.updatedAt'),
  };
});

export const packingStationDtoSchema = schema<PackingStationDto>((value) => {
  const input = strictObject(value, 'packingStation', [
    'id', 'object', 'schemaVersion', 'organizationId', 'siteId', 'code', 'status', 'policyId', 'createdAt', 'updatedAt',
  ]);
  literalValue(input.object, 'packingStation.object', 'packing_station');
  literalValue(input.schemaVersion, 'packingStation.schemaVersion', 1);
  return {
    id: parseEnterpriseResourceId('packing_station', input.id, 'packingStation.id'),
    object: 'packing_station',
    schemaVersion: 1,
    organizationId: parseResourceId('organization', input.organizationId, 'packingStation.organizationId'),
    siteId: parseEnterpriseResourceId('enterprise_site', input.siteId, 'packingStation.siteId'),
    code: stringValue(input.code, 'packingStation.code', { min: 2, max: 40, pattern: /^[A-Z0-9-]+$/ }),
    status: enumValue(input.status, 'packingStation.status', packingStationStatuses),
    policyId: resolveWorkflowPolicy(stringValue(input.policyId, 'packingStation.policyId', { min: 8, max: 80 })).policyId,
    createdAt: isoDateTime(input.createdAt, 'packingStation.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'packingStation.updatedAt'),
  };
});

export const edgeAgentDtoSchema = schema<EdgeAgentDto>((value) => {
  const input = strictObject(value, 'edgeAgent', [
    'id', 'object', 'schemaVersion', 'organizationId', 'siteId', 'stationId', 'installationIdentity', 'status', 'createdAt', 'updatedAt',
  ]);
  literalValue(input.object, 'edgeAgent.object', 'edge_agent');
  literalValue(input.schemaVersion, 'edgeAgent.schemaVersion', 1);
  return {
    id: parseEnterpriseResourceId('edge_agent', input.id, 'edgeAgent.id'),
    object: 'edge_agent',
    schemaVersion: 1,
    organizationId: parseResourceId('organization', input.organizationId, 'edgeAgent.organizationId'),
    siteId: parseEnterpriseResourceId('enterprise_site', input.siteId, 'edgeAgent.siteId'),
    stationId: input.stationId === undefined || input.stationId === null ? null : parseEnterpriseResourceId('packing_station', input.stationId, 'edgeAgent.stationId'),
    installationIdentity: stringValue(input.installationIdentity, 'edgeAgent.installationIdentity', { min: 8, max: 160, pattern: identifierPattern }),
    status: enumValue(input.status, 'edgeAgent.status', edgeAgentStatuses),
    createdAt: isoDateTime(input.createdAt, 'edgeAgent.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'edgeAgent.updatedAt'),
  };
});

export const stationDeviceDtoSchema = schema<StationDeviceDto>((value) => {
  const input = strictObject(value, 'stationDevice', [
    'id', 'object', 'schemaVersion', 'organizationId', 'stationId', 'kind', 'code', 'adapter', 'status', 'createdAt', 'updatedAt',
  ]);
  literalValue(input.object, 'stationDevice.object', 'station_device');
  literalValue(input.schemaVersion, 'stationDevice.schemaVersion', 1);
  return {
    id: parseEnterpriseResourceId('station_device', input.id, 'stationDevice.id'),
    object: 'station_device',
    schemaVersion: 1,
    organizationId: parseResourceId('organization', input.organizationId, 'stationDevice.organizationId'),
    stationId: parseEnterpriseResourceId('packing_station', input.stationId, 'stationDevice.stationId'),
    kind: enumValue(input.kind, 'stationDevice.kind', stationDeviceKinds),
    code: stringValue(input.code, 'stationDevice.code', { min: 2, max: 40, pattern: /^[A-Z0-9-]+$/ }),
    adapter: enumValue(input.adapter, 'stationDevice.adapter', ['USB_HID', 'SERIAL', 'UVC', 'RTSP', 'WMS', 'SIMULATED'] as const),
    status: enumValue(input.status, 'stationDevice.status', stationDeviceStatuses),
    createdAt: isoDateTime(input.createdAt, 'stationDevice.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'stationDevice.updatedAt'),
  };
});

export const deviceCredentialDtoSchema = schema<DeviceCredentialDto>((value) => {
  const input = strictObject(value, 'deviceCredential', [
    'id', 'object', 'schemaVersion', 'edgeAgentId', 'publicKeySpkiSha256', 'keyStorage', 'status', 'createdAt', 'updatedAt',
  ]);
  literalValue(input.object, 'deviceCredential.object', 'device_credential');
  literalValue(input.schemaVersion, 'deviceCredential.schemaVersion', 1);
  return {
    id: parseEnterpriseResourceId('device_credential', input.id, 'deviceCredential.id'),
    object: 'device_credential',
    schemaVersion: 1,
    edgeAgentId: parseEnterpriseResourceId('edge_agent', input.edgeAgentId, 'deviceCredential.edgeAgentId'),
    publicKeySpkiSha256: sha256Value(input.publicKeySpkiSha256, 'deviceCredential.publicKeySpkiSha256'),
    keyStorage: enumValue(input.keyStorage, 'deviceCredential.keyStorage', deviceCredentialKeyStorage),
    status: enumValue(input.status, 'deviceCredential.status', deviceCredentialStatuses),
    createdAt: isoDateTime(input.createdAt, 'deviceCredential.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'deviceCredential.updatedAt'),
  };
});

export const fulfillmentSessionDtoSchema = schema<FulfillmentSessionDto>((value) => {
  const input = strictObject(value, 'fulfillmentSession', [
    'id', 'object', 'schemaVersion', 'organizationId', 'siteId', 'stationId', 'transactionId', 'edgeAgentId', 'externalOrderId',
    'expectedItems', 'expectedTrackingNumber', 'authorizedDeviceIds', 'requiredEvidence', 'openedAt', 'captureWindowEndsAt',
    'state', 'policyId', 'policyVersion', 'acquisitionClass', 'operatingMode', 'createdAt', 'updatedAt',
  ]);
  literalValue(input.object, 'fulfillmentSession.object', 'fulfillment_session');
  literalValue(input.schemaVersion, 'fulfillmentSession.schemaVersion', 1);
  const policy = resolveWorkflowPolicy(stringValue(input.policyId, 'fulfillmentSession.policyId', { min: 8, max: 80 }));
  const result: FulfillmentSessionDto = {
    id: parseEnterpriseResourceId('fulfillment_session', input.id, 'fulfillmentSession.id'),
    object: 'fulfillment_session',
    schemaVersion: 1,
    organizationId: parseResourceId('organization', input.organizationId, 'fulfillmentSession.organizationId'),
    siteId: parseEnterpriseResourceId('enterprise_site', input.siteId, 'fulfillmentSession.siteId'),
    stationId: parseEnterpriseResourceId('packing_station', input.stationId, 'fulfillmentSession.stationId'),
    transactionId: input.transactionId === undefined || input.transactionId === null
      ? null
      : parseResourceId('transaction', input.transactionId, 'fulfillmentSession.transactionId', { allowLegacy: true }),
    edgeAgentId: input.edgeAgentId === undefined || input.edgeAgentId === null
      ? null
      : parseEnterpriseResourceId('edge_agent', input.edgeAgentId, 'fulfillmentSession.edgeAgentId'),
    externalOrderId: stringValue(input.externalOrderId, 'fulfillmentSession.externalOrderId', { min: 1, max: 160, pattern: identifierPattern }),
    expectedItems: arrayValue(input.expectedItems, 'fulfillmentSession.expectedItems', { min: 0, max: 200, parse: parseExpectedItem }),
    expectedTrackingNumber: optionalString(input.expectedTrackingNumber, 'fulfillmentSession.expectedTrackingNumber', { min: 3, max: 160 }),
    authorizedDeviceIds: arrayValue(input.authorizedDeviceIds, 'fulfillmentSession.authorizedDeviceIds', {
      min: 1,
      max: 24,
      parse: (item, path) => parseEnterpriseResourceId('station_device', item, path),
      uniqueBy: (item) => item,
    }),
    requiredEvidence: arrayValue(input.requiredEvidence, 'fulfillmentSession.requiredEvidence', {
      min: 1,
      max: enterpriseRequirementKeys.length,
      parse: (item, path) => enumValue(item, path, enterpriseRequirementKeys),
      uniqueBy: (item) => item,
    }),
    openedAt: optionalIsoDateTime(input.openedAt, 'fulfillmentSession.openedAt'),
    captureWindowEndsAt: isoDateTime(input.captureWindowEndsAt, 'fulfillmentSession.captureWindowEndsAt'),
    state: enumValue(input.state, 'fulfillmentSession.state', fulfillmentSessionStatuses),
    policyId: policy.policyId,
    policyVersion: stringValue(input.policyVersion, 'fulfillmentSession.policyVersion', { min: 1, max: 32, pattern: /^[0-9A-Za-z._-]+$/ }),
    acquisitionClass: enumValue(input.acquisitionClass, 'fulfillmentSession.acquisitionClass', acquisitionClasses),
    operatingMode: enumValue(input.operatingMode, 'fulfillmentSession.operatingMode', enterpriseOperatingModes),
    createdAt: isoDateTime(input.createdAt, 'fulfillmentSession.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'fulfillmentSession.updatedAt'),
  };
  if (result.policyVersion !== policy.policyVersion) {
    throw new DomainValidationError({ path: 'fulfillmentSession.policyVersion', code: 'FORMAT', message: 'must match the frozen policy version' });
  }
  if (['STATION_BOUND', 'ACQUIRING', 'PACKING_COMPLETE', 'FINALIZING', 'EVIDENCE_READY', 'RELEASED'].includes(result.state) && !result.edgeAgentId) {
    throw new DomainValidationError({ path: 'fulfillmentSession.edgeAgentId', code: 'REQUIRED', message: 'a bound fulfillment session requires an Edge agent' });
  }
  return result;
});

export const enterpriseEvidenceSessionDtoSchema = schema<EnterpriseEvidenceSessionDto>((value) => {
  const input = strictObject(value, 'enterpriseEvidenceSession', [
    'id', 'object', 'schemaVersion', 'organizationId', 'siteId', 'stationId', 'edgeAgentId', 'transactionId', 'fulfillmentSessionId',
    'allowedDeviceIds', 'allowedArtifactTypes', 'maxArtifacts', 'captureWindowEndsAt', 'policyId', 'status', 'createdAt', 'updatedAt',
  ]);
  literalValue(input.object, 'enterpriseEvidenceSession.object', 'enterprise_evidence_session');
  literalValue(input.schemaVersion, 'enterpriseEvidenceSession.schemaVersion', 1);
  const result: EnterpriseEvidenceSessionDto = {
    id: parseEnterpriseResourceId('enterprise_evidence_session', input.id, 'enterpriseEvidenceSession.id'),
    object: 'enterprise_evidence_session',
    schemaVersion: 1,
    organizationId: parseResourceId('organization', input.organizationId, 'enterpriseEvidenceSession.organizationId'),
    siteId: parseEnterpriseResourceId('enterprise_site', input.siteId, 'enterpriseEvidenceSession.siteId'),
    stationId: parseEnterpriseResourceId('packing_station', input.stationId, 'enterpriseEvidenceSession.stationId'),
    edgeAgentId: parseEnterpriseResourceId('edge_agent', input.edgeAgentId, 'enterpriseEvidenceSession.edgeAgentId'),
    transactionId: parseResourceId('transaction', input.transactionId, 'enterpriseEvidenceSession.transactionId', { allowLegacy: true }),
    fulfillmentSessionId: parseEnterpriseResourceId('fulfillment_session', input.fulfillmentSessionId, 'enterpriseEvidenceSession.fulfillmentSessionId'),
    allowedDeviceIds: arrayValue(input.allowedDeviceIds, 'enterpriseEvidenceSession.allowedDeviceIds', {
      min: 1,
      max: 24,
      parse: (item, path) => parseEnterpriseResourceId('station_device', item, path),
      uniqueBy: (item) => item,
    }),
    allowedArtifactTypes: arrayValue(input.allowedArtifactTypes, 'enterpriseEvidenceSession.allowedArtifactTypes', {
      min: 1,
      max: enterpriseArtifactTypes.length,
      parse: (item, path) => enumValue(item, path, enterpriseArtifactTypes),
      uniqueBy: (item) => item,
    }),
    maxArtifacts: integerValue(input.maxArtifacts, 'enterpriseEvidenceSession.maxArtifacts', 1, 24),
    captureWindowEndsAt: isoDateTime(input.captureWindowEndsAt, 'enterpriseEvidenceSession.captureWindowEndsAt'),
    policyId: resolveWorkflowPolicy(stringValue(input.policyId, 'enterpriseEvidenceSession.policyId', { min: 8, max: 80 })).policyId,
    status: enumValue(input.status, 'enterpriseEvidenceSession.status', ['ISSUED', 'ACTIVE', 'EXHAUSTED', 'EXPIRED', 'REVOKED'] as const),
    createdAt: isoDateTime(input.createdAt, 'enterpriseEvidenceSession.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'enterpriseEvidenceSession.updatedAt'),
  };
  return result;
});

function parseRollingCapture(value: unknown, path: string): RollingCaptureProvenance {
  const input = strictObject(value, path, [
    'captureSource', 'sourceStreamId', 'segmentStart', 'segmentEnd', 'preRollDurationMs', 'postRollDurationMs',
    'codec', 'originalSegmentHashes', 'assemblyMethod', 'captureKind',
  ]);
  const provenance: RollingCaptureProvenance = {
    captureSource: enumValue(input.captureSource, `${path}.captureSource`, acquisitionClasses),
    sourceStreamId: stringValue(input.sourceStreamId, `${path}.sourceStreamId`, { min: 3, max: 160, pattern: identifierPattern }),
    segmentStart: isoDateTime(input.segmentStart, `${path}.segmentStart`),
    segmentEnd: isoDateTime(input.segmentEnd, `${path}.segmentEnd`),
    preRollDurationMs: integerValue(input.preRollDurationMs, `${path}.preRollDurationMs`, 0, 120_000),
    postRollDurationMs: integerValue(input.postRollDurationMs, `${path}.postRollDurationMs`, 0, 120_000),
    codec: stringValue(input.codec, `${path}.codec`, { min: 3, max: 40, pattern: /^[A-Za-z0-9._-]+$/ }),
    originalSegmentHashes: arrayValue(input.originalSegmentHashes, `${path}.originalSegmentHashes`, {
      min: 1,
      max: 64,
      parse: (item, itemPath) => sha256Value(item, itemPath),
      uniqueBy: (item) => item,
    }),
    assemblyMethod: enumValue(input.assemblyMethod, `${path}.assemblyMethod`, ['DETERMINISTIC_CHUNK_CONCAT', 'CAMERA_ORIGINAL_FILE'] as const),
    captureKind: enumValue(input.captureKind, `${path}.captureKind`, ['DERIVED_TRANSACTION_SEGMENT', 'CAMERA_ORIGINAL_FILE'] as const),
  };
  assertRollingCaptureProvenance(provenance);
  return provenance;
}

export const enterpriseArtifactDtoSchema = schema<EnterpriseArtifactDto>((value) => {
  const input = strictObject(value, 'enterpriseArtifact', [
    'id', 'object', 'schemaVersion', 'fulfillmentSessionId', 'evidenceSessionId', 'type', 'status', 'acquisitionClass',
    'contentType', 'sizeBytes', 'sha256', 'rollingCapture', 'uploadId', 'manifestSha256', 'evidenceBundleSha256',
    'attestationStatus', 'serverFinalizedAt', 'createdAt', 'updatedAt',
  ]);
  literalValue(input.object, 'enterpriseArtifact.object', 'enterprise_artifact');
  literalValue(input.schemaVersion, 'enterpriseArtifact.schemaVersion', 1);
  const result: EnterpriseArtifactDto = {
    id: parseEnterpriseResourceId('enterprise_artifact', input.id, 'enterpriseArtifact.id'),
    object: 'enterprise_artifact',
    schemaVersion: 1,
    fulfillmentSessionId: parseEnterpriseResourceId('fulfillment_session', input.fulfillmentSessionId, 'enterpriseArtifact.fulfillmentSessionId'),
    evidenceSessionId: input.evidenceSessionId === undefined || input.evidenceSessionId === null
      ? null
      : parseEnterpriseResourceId('enterprise_evidence_session', input.evidenceSessionId, 'enterpriseArtifact.evidenceSessionId'),
    type: enumValue(input.type, 'enterpriseArtifact.type', enterpriseArtifactTypes),
    status: enumValue(input.status, 'enterpriseArtifact.status', enterpriseArtifactStatuses),
    acquisitionClass: enumValue(input.acquisitionClass, 'enterpriseArtifact.acquisitionClass', acquisitionClasses),
    contentType: stringValue(input.contentType, 'enterpriseArtifact.contentType', { min: 3, max: 200, pattern: /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i }),
    sizeBytes: integerValue(input.sizeBytes, 'enterpriseArtifact.sizeBytes', 1, 20_000_000_000),
    sha256: sha256Value(input.sha256, 'enterpriseArtifact.sha256'),
    rollingCapture: input.rollingCapture === undefined || input.rollingCapture === null ? null : parseRollingCapture(input.rollingCapture, 'enterpriseArtifact.rollingCapture'),
    uploadId: optionalString(input.uploadId, 'enterpriseArtifact.uploadId', { min: 8, max: 128, pattern: /^[A-Za-z0-9_-]+$/ }),
    manifestSha256: input.manifestSha256 === undefined || input.manifestSha256 === null ? null : sha256Value(input.manifestSha256, 'enterpriseArtifact.manifestSha256'),
    evidenceBundleSha256: input.evidenceBundleSha256 === undefined || input.evidenceBundleSha256 === null ? null : sha256Value(input.evidenceBundleSha256, 'enterpriseArtifact.evidenceBundleSha256'),
    attestationStatus: optionalString(input.attestationStatus, 'enterpriseArtifact.attestationStatus', { min: 3, max: 80, pattern: /^[A-Z0-9_]+$/ }),
    serverFinalizedAt: optionalIsoDateTime(input.serverFinalizedAt, 'enterpriseArtifact.serverFinalizedAt'),
    createdAt: isoDateTime(input.createdAt, 'enterpriseArtifact.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'enterpriseArtifact.updatedAt'),
  };
  if (result.type === 'STATION_PACKING_VIDEO' && !result.rollingCapture) {
    throw new DomainValidationError({ path: 'enterpriseArtifact.rollingCapture', code: 'REQUIRED', message: 'station packing video must record rolling-capture provenance' });
  }
  if (['FINALIZED', 'QUARANTINED'].includes(result.status) && (!result.serverFinalizedAt || !result.manifestSha256 || !result.evidenceBundleSha256 || !result.attestationStatus)) {
    throw new DomainValidationError({ path: 'enterpriseArtifact.status', code: 'REQUIRED', message: 'server-finalized artifacts require a finalization time, manifest digest, bundle digest and attestation status' });
  }
  if (result.status === 'FINALIZED' && result.attestationStatus && result.attestationStatus.startsWith('ONLINE_APP_CHECK')) {
    throw new DomainValidationError({ path: 'enterpriseArtifact.attestationStatus', code: 'FORMAT', message: 'Enterprise artifacts must not inherit native App Check attestation' });
  }
  if (!['FINALIZED', 'QUARANTINED'].includes(result.status) && result.serverFinalizedAt) {
    throw new DomainValidationError({ path: 'enterpriseArtifact.serverFinalizedAt', code: 'FORMAT', message: 'is only valid after server finalization or quarantine' });
  }
  return result;
});

export const hardwareObservationDtoSchema = schema<HardwareObservationDto>((value) => {
  const input = strictObject(value, 'hardwareObservation', [
    'id', 'object', 'schemaVersion', 'fulfillmentSessionId', 'deviceId', 'type', 'acquisitionClass', 'normalizedValue',
    'grams', 'rawValueHash', 'monotonicTimestampMs', 'createdAt', 'updatedAt',
  ]);
  literalValue(input.object, 'hardwareObservation.object', 'hardware_observation');
  literalValue(input.schemaVersion, 'hardwareObservation.schemaVersion', 1);
  const result: HardwareObservationDto = {
    id: parseEnterpriseResourceId('hardware_observation', input.id, 'hardwareObservation.id'),
    object: 'hardware_observation',
    schemaVersion: 1,
    fulfillmentSessionId: parseEnterpriseResourceId('fulfillment_session', input.fulfillmentSessionId, 'hardwareObservation.fulfillmentSessionId'),
    deviceId: parseEnterpriseResourceId('station_device', input.deviceId, 'hardwareObservation.deviceId'),
    type: enumValue(input.type, 'hardwareObservation.type', enterpriseObservationTypes),
    acquisitionClass: enumValue(input.acquisitionClass, 'hardwareObservation.acquisitionClass', acquisitionClasses),
    normalizedValue: optionalString(input.normalizedValue, 'hardwareObservation.normalizedValue', { min: 1, max: 160 }),
    grams: input.grams === undefined || input.grams === null ? null : integerValue(input.grams, 'hardwareObservation.grams', 0, 1_000_000_000),
    rawValueHash: sha256Value(input.rawValueHash, 'hardwareObservation.rawValueHash'),
    monotonicTimestampMs: integerValue(input.monotonicTimestampMs, 'hardwareObservation.monotonicTimestampMs', 0, Number.MAX_SAFE_INTEGER),
    createdAt: isoDateTime(input.createdAt, 'hardwareObservation.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'hardwareObservation.updatedAt'),
  };
  if (result.type === 'PACKAGE_WEIGHT_OBSERVATION' && result.grams === null) {
    throw new DomainValidationError({ path: 'hardwareObservation.grams', code: 'REQUIRED', message: 'weight observations require grams' });
  }
  if (result.type !== 'PACKAGE_WEIGHT_OBSERVATION' && !result.normalizedValue) {
    throw new DomainValidationError({ path: 'hardwareObservation.normalizedValue', code: 'REQUIRED', message: 'barcode observations require a normalized value' });
  }
  return result;
});

export type EnterpriseResourceContract = {
  kind: EnterpriseResourceKind;
  object: string;
  schemaVersion: 1;
  persistencePath: string;
  tenantBoundary: 'ORGANIZATION';
  idempotency: string;
  auditEvents: readonly string[];
  sensitiveInternalFields: readonly string[];
};

export const enterpriseResourceContracts: Readonly<Record<EnterpriseResourceKind, EnterpriseResourceContract>> = {
  enterprise_organization: {
    kind: 'enterprise_organization', object: 'enterprise_organization', schemaVersion: 1,
    persistencePath: 'enterpriseOrganizations/{enterpriseOrganizationId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'One enterprise profile per PackProof organization and environment.',
    auditEvents: ['ENTERPRISE_ORGANIZATION_ENABLED', 'ENTERPRISE_OPERATING_MODE_CHANGED'],
    sensitiveInternalFields: ['billingProfile', 'administrativeNotes'],
  },
  enterprise_site: {
    kind: 'enterprise_site', object: 'enterprise_site', schemaVersion: 1,
    persistencePath: 'enterpriseSites/{siteId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Site code is unique within an organization.',
    auditEvents: ['ENTERPRISE_SITE_CREATED', 'ENTERPRISE_SITE_DISABLED'],
    sensitiveInternalFields: ['physicalAddress'],
  },
  packing_station: {
    kind: 'packing_station', object: 'packing_station', schemaVersion: 1,
    persistencePath: 'packingStations/{stationId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Station code is unique within a site.',
    auditEvents: ['PACKING_STATION_CREATED', 'PACKING_STATION_POLICY_CHANGED'],
    sensitiveInternalFields: ['operatorNotes'],
  },
  edge_agent: {
    kind: 'edge_agent', object: 'edge_agent', schemaVersion: 1,
    persistencePath: 'edgeAgents/{edgeAgentId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Installation identity is unique within an organization.',
    auditEvents: ['EDGE_AGENT_REGISTERED', 'EDGE_AGENT_REVOKED', 'EDGE_AGENT_STATION_BOUND'],
    sensitiveInternalFields: ['devicePrivateKey', 'enrollmentTokenHash'],
  },
  station_device: {
    kind: 'station_device', object: 'station_device', schemaVersion: 1,
    persistencePath: 'stationDevices/{deviceId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Device code is unique within a station.',
    auditEvents: ['STATION_DEVICE_REGISTERED', 'STATION_DEVICE_FAULTED'],
    sensitiveInternalFields: ['vendorSerial', 'rawTransportPath'],
  },
  device_credential: {
    kind: 'device_credential', object: 'device_credential', schemaVersion: 1,
    persistencePath: 'deviceCredentials/{credentialId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Active credential is unique per Edge agent; rotation is a separate command.',
    auditEvents: ['EDGE_CREDENTIAL_ISSUED', 'EDGE_CREDENTIAL_ROTATED', 'EDGE_CREDENTIAL_REVOKED'],
    sensitiveInternalFields: ['privateKey', 'tpmHandle', 'certificateDer'],
  },
  fulfillment_session: {
    kind: 'fulfillment_session', object: 'fulfillment_session', schemaVersion: 1,
    persistencePath: 'fulfillmentSessions/{fulfillmentSessionId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Bound to organization, station, external order, and command key; duplicate WMS delivery replays the same session.',
    auditEvents: ['FULFILLMENT_SESSION_CREATED', 'FULFILLMENT_SESSION_BOUND', 'FULFILLMENT_SESSION_RELEASED'],
    sensitiveInternalFields: ['actorId', 'capabilityTokenHash'],
  },
  station_event: {
    kind: 'station_event', object: 'station_event', schemaVersion: 1,
    persistencePath: 'fulfillmentSessions/{fulfillmentSessionId}/events/{eventId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Stable event ID from Edge request identity; at-least-once delivery replays the same event.',
    auditEvents: ['STATION_EVENT_RECORDED'],
    sensitiveInternalFields: ['rawVendorPayload'],
  },
  enterprise_artifact: {
    kind: 'enterprise_artifact', object: 'enterprise_artifact', schemaVersion: 1,
    persistencePath: 'fulfillmentSessions/{fulfillmentSessionId}/artifacts/{artifactId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Retry-stable client evidence identity; request fingerprint cannot change after first reservation.',
    auditEvents: ['ENTERPRISE_ARTIFACT_RESERVED', 'ENTERPRISE_ARTIFACT_UPLOADED', 'ENTERPRISE_ARTIFACT_FINALIZED'],
    sensitiveInternalFields: ['storagePath', 'ciphertextPath', 'uploaderNetworkSignal'],
  },
  hardware_observation: {
    kind: 'hardware_observation', object: 'hardware_observation', schemaVersion: 1,
    persistencePath: 'fulfillmentSessions/{fulfillmentSessionId}/observations/{observationId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Device, type, monotonic timestamp and raw-value hash form the replay identity.',
    auditEvents: ['HARDWARE_OBSERVATION_RECORDED'],
    sensitiveInternalFields: ['rawValue', 'vendorDevicePath'],
  },
  workflow_policy: {
    kind: 'workflow_policy', object: 'workflow_policy', schemaVersion: 1,
    persistencePath: 'workflowPolicies/{policyId}/versions/{policyVersion}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Published policy versions are immutable; a change requires a new version identifier.',
    auditEvents: ['WORKFLOW_POLICY_PUBLISHED'],
    sensitiveInternalFields: ['internalNotes'],
  },
  enterprise_evidence_session: {
    kind: 'enterprise_evidence_session', object: 'enterprise_evidence_session', schemaVersion: 1,
    persistencePath: 'enterpriseEvidenceSessions/{enterpriseEvidenceSessionId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Creation is bound to fulfillment session, Edge agent, allowed devices/artifacts and command key.',
    auditEvents: ['ENTERPRISE_EVIDENCE_SESSION_ISSUED', 'ENTERPRISE_EVIDENCE_SESSION_REVOKED'],
    sensitiveInternalFields: ['capabilityTokenHash', 'nonceHash'],
  },
};

export function assertEnterpriseResourceCatalogComplete(): void {
  const entries = Object.entries(enterpriseResourceContracts);
  if (entries.length !== enterpriseResourceKinds.length) {
    throw new Error(`Expected ${enterpriseResourceKinds.length} enterprise resource contracts; received ${entries.length}.`);
  }
  for (const [key, contract] of entries) {
    if (contract.kind !== key || contract.schemaVersion !== 1 || !contract.auditEvents.length || !contract.persistencePath) {
      throw new Error(`Enterprise resource contract ${key} is incomplete.`);
    }
  }
}
