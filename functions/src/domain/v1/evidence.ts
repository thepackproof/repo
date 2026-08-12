import type { PublicResource, ResourceId, VersionedResource } from './common';
import { parseResourceId } from './common';
import { arrayValue, DomainValidationError, enumValue, integerValue, isoDateTime, literalValue, schema, sha256Value, strictObject, stringValue } from './runtime';

export const evidenceSessionTypes = [
  'OUTBOUND_PACK',
  'RECEIVER_OPEN',
  'RETURN_PACK',
  'RETURN_RECEIVE',
  'PHYSICAL_REFERENCE',
  'PHYSICAL_VERIFICATION',
  'SUPPORTING_DOCUMENT',
] as const;
export type EvidenceSessionType = (typeof evidenceSessionTypes)[number];

export const evidenceSessionStatuses = [
  'CREATED',
  'READY',
  'CAPTURING',
  'CAPTURED',
  'SYNCING',
  'PROCESSING',
  'FINALIZED',
  'FINALIZED_WITH_LIMITATIONS',
  'FAILED_RETRYABLE',
  'FAILED_TERMINAL',
  'CANCELLED',
] as const;
export type EvidenceSessionStatus = (typeof evidenceSessionStatuses)[number];

export const evidenceSessionTransitions: Readonly<Record<EvidenceSessionStatus, readonly EvidenceSessionStatus[]>> = {
  CREATED: ['READY', 'CANCELLED'],
  READY: ['CAPTURING', 'FAILED_RETRYABLE', 'CANCELLED'],
  CAPTURING: ['CAPTURED', 'FAILED_RETRYABLE', 'FAILED_TERMINAL', 'CANCELLED'],
  CAPTURED: ['SYNCING', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'],
  SYNCING: ['PROCESSING', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'],
  PROCESSING: ['FINALIZED', 'FINALIZED_WITH_LIMITATIONS', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'],
  FINALIZED: [],
  FINALIZED_WITH_LIMITATIONS: [],
  FAILED_RETRYABLE: ['READY', 'CAPTURING', 'SYNCING', 'PROCESSING', 'FAILED_TERMINAL', 'CANCELLED'],
  FAILED_TERMINAL: [],
  CANCELLED: [],
};

export const captureStates = ['NOT_STARTED', 'READY', 'CAPTURING', 'CAPTURED', 'FAILED', 'CANCELLED'] as const;
export const syncStates = ['NOT_STARTED', 'QUEUED', 'UPLOADING', 'AWAITING_FINALIZATION', 'COMPLETE', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'] as const;
export const processingStates = ['NOT_STARTED', 'PROCESSING', 'COMPLETE', 'QUARANTINED', 'FAILED'] as const;

export type EvidenceSession = VersionedResource<'evidence_session'> & {
  transactionId: ResourceId<'transaction'>;
  commerceContextId: ResourceId<'commerce_context'> | null;
  returnPassportId: ResourceId<'return_passport'> | null;
  actorId: string;
  actorRole: 'SELLER' | 'BUYER' | 'RECEIVER' | 'RETURN_SENDER' | 'RETURN_RECIPIENT' | 'WITNESS';
  type: EvidenceSessionType;
  protocolVersion: string;
  allowedArtifactTypes: EvidenceArtifactType[];
  status: EvidenceSessionStatus;
  captureState: (typeof captureStates)[number];
  syncState: (typeof syncStates)[number];
  processingState: (typeof processingStates)[number];
  maximumRedemptions: number;
  redemptionCount: number;
  requestedEvidenceCount: number;
  captureProfileId: string | null;
  captureGroupId: string | null;
  expiresAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
};

export type EvidenceSessionDto = PublicResource<'evidence_session', 'evidence_session'> & {
  transactionId: ResourceId<'transaction'>;
  commerceContextId: ResourceId<'commerce_context'> | null;
  returnPassportId: ResourceId<'return_passport'> | null;
  actorRole: EvidenceSession['actorRole'];
  type: EvidenceSessionType;
  protocolVersion: string;
  allowedArtifactTypes: EvidenceArtifactType[];
  status: EvidenceSessionStatus;
  captureState: EvidenceSession['captureState'];
  syncState: EvidenceSession['syncState'];
  processingState: EvidenceSession['processingState'];
  maximumRedemptions: number;
  redemptionCount: number;
  requestedEvidenceCount: number;
  captureProfileId: string | null;
  captureGroupId: string | null;
  expiresAt: string;
  startedAt: string | null;
  completedAt: string | null;
};

export const evidenceArtifactTypes = [
  'ITEM_PHOTO', 'CONDITION_PHOTO', 'IDENTIFIER_PHOTO', 'COA_PHOTO', 'PACKING_VIDEO', 'SHIPPING_LABEL',
  'UNBOXING_VIDEO', 'DELIVERY_PHOTO', 'SUPPORTING_DOCUMENT', 'RETURN_CONDITION_PHOTO', 'RETURN_PACKING_VIDEO',
  'RETURN_SHIPPING_LABEL', 'RETURN_UNBOXING_VIDEO', 'PHYSICAL_REFERENCE_FRAME', 'PHYSICAL_VERIFICATION_FRAME',
] as const;
export type EvidenceArtifactType = (typeof evidenceArtifactTypes)[number];

export const evidenceArtifactStatuses = ['RESERVED', 'UPLOADED', 'FINALIZED', 'QUARANTINED', 'FAILED'] as const;
export type EvidenceArtifactStatus = (typeof evidenceArtifactStatuses)[number];

export const evidenceArtifactTransitions: Readonly<Record<EvidenceArtifactStatus, readonly EvidenceArtifactStatus[]>> = {
  RESERVED: ['UPLOADED', 'FAILED'],
  UPLOADED: ['FINALIZED', 'QUARANTINED', 'FAILED'],
  FINALIZED: [],
  QUARANTINED: [],
  FAILED: [],
};

export type AssuranceDimension = {
  status: string;
  reasonCodes: string[];
};

export type AssuranceAssessment = {
  acquisitionQuality: AssuranceDimension;
  appDeviceContext: AssuranceDimension;
  byteIntegrity: AssuranceDimension;
  physicalCorrespondence: AssuranceDimension;
  carrierContext: AssuranceDimension;
  businessLegalRelevance: AssuranceDimension;
};

export type EvidenceArtifact = VersionedResource<'evidence_artifact'> & {
  transactionId: ResourceId<'transaction'>;
  evidenceSessionId: ResourceId<'evidence_session'>;
  type: EvidenceArtifactType;
  status: EvidenceArtifactStatus;
  storagePath: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  manifestId: ResourceId<'evidence_manifest'> | null;
  assurance: AssuranceAssessment | null;
  finalizedAt: Date | null;
};

export type EvidenceArtifactDto = PublicResource<'evidence_artifact', 'evidence_artifact'> & {
  transactionId: ResourceId<'transaction'>;
  evidenceSessionId: ResourceId<'evidence_session'>;
  type: EvidenceArtifactType;
  status: EvidenceArtifactStatus;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  manifestId: ResourceId<'evidence_manifest'> | null;
  assurance: AssuranceAssessment | null;
  finalizedAt: string | null;
};

export type ManifestAuthentication =
  | { type: 'SERVICE_MAC'; algorithm: 'HMAC-SHA256'; keyId: string; macBase64url: string; verificationScope: 'PACKPROOF_SERVICE_ONLY' }
  | { type: 'ASYMMETRIC_SIGNATURE'; algorithm: 'ES256' | 'PS256' | 'ED25519'; keyId: string; signatureBase64url: string; verificationScope: 'PUBLIC_KEY' };

export type EvidenceManifest = VersionedResource<'evidence_manifest'> & {
  transactionId: ResourceId<'transaction'>;
  evidenceSessionId: ResourceId<'evidence_session'>;
  artifactId: ResourceId<'evidence_artifact'>;
  formatSchemaVersion: number;
  canonicalizationProfile: string;
  bundleBindingProfile: string;
  manifestSha256: string;
  evidenceBundleSha256: string;
  authentication: ManifestAuthentication;
  finalizedAt: Date;
};

export type EvidenceManifestDto = PublicResource<'evidence_manifest', 'evidence_manifest'> & Omit<EvidenceManifest, 'id' | 'schemaVersion' | 'organizationId' | 'createdAt' | 'updatedAt' | 'finalizedAt'> & {
  finalizedAt: string;
};

function parseAssuranceDimension(value: unknown, path: string): AssuranceDimension {
  const input = strictObject(value, path, ['status', 'reasonCodes']);
  return {
    status: stringValue(input.status, `${path}.status`, { min: 1, max: 120, pattern: /^[A-Z0-9_-]+$/ }),
    reasonCodes: arrayValue(input.reasonCodes, `${path}.reasonCodes`, {
      max: 30,
      parse: (reason, reasonPath) => stringValue(reason, reasonPath, { min: 1, max: 160, pattern: /^[A-Z0-9_-]+$/ }),
      uniqueBy: (reason) => reason,
    }),
  };
}

export function parseAssurance(value: unknown, path: string): AssuranceAssessment {
  const input = strictObject(value, path, ['acquisitionQuality', 'appDeviceContext', 'byteIntegrity', 'physicalCorrespondence', 'carrierContext', 'businessLegalRelevance']);
  return {
    acquisitionQuality: parseAssuranceDimension(input.acquisitionQuality, `${path}.acquisitionQuality`),
    appDeviceContext: parseAssuranceDimension(input.appDeviceContext, `${path}.appDeviceContext`),
    byteIntegrity: parseAssuranceDimension(input.byteIntegrity, `${path}.byteIntegrity`),
    physicalCorrespondence: parseAssuranceDimension(input.physicalCorrespondence, `${path}.physicalCorrespondence`),
    carrierContext: parseAssuranceDimension(input.carrierContext, `${path}.carrierContext`),
    businessLegalRelevance: parseAssuranceDimension(input.businessLegalRelevance, `${path}.businessLegalRelevance`),
  };
}

const actorRoles = ['SELLER', 'BUYER', 'RECEIVER', 'RETURN_SENDER', 'RETURN_RECIPIENT', 'WITNESS'] as const;

export const evidenceSessionDtoSchema = schema<EvidenceSessionDto>((value) => {
  const input = strictObject(value, 'evidenceSession', [
    'id', 'object', 'schemaVersion', 'transactionId', 'commerceContextId', 'returnPassportId', 'actorRole', 'type', 'protocolVersion',
    'allowedArtifactTypes', 'status', 'captureState', 'syncState', 'processingState', 'maximumRedemptions', 'redemptionCount',
    'requestedEvidenceCount', 'captureProfileId', 'captureGroupId', 'expiresAt', 'startedAt', 'completedAt', 'createdAt', 'updatedAt',
  ]);
  literalValue(input.object, 'evidenceSession.object', 'evidence_session');
  literalValue(input.schemaVersion, 'evidenceSession.schemaVersion', 1);
  return {
    id: parseResourceId('evidence_session', input.id, 'evidenceSession.id'),
    object: 'evidence_session',
    schemaVersion: 1,
    transactionId: parseResourceId('transaction', input.transactionId, 'evidenceSession.transactionId', { allowLegacy: true }),
    commerceContextId: input.commerceContextId === undefined || input.commerceContextId === null
      ? null
      : parseResourceId('commerce_context', input.commerceContextId, 'evidenceSession.commerceContextId'),
    returnPassportId: input.returnPassportId === undefined || input.returnPassportId === null ? null : parseResourceId('return_passport', input.returnPassportId, 'evidenceSession.returnPassportId', { allowLegacy: true }),
    actorRole: enumValue(input.actorRole, 'evidenceSession.actorRole', actorRoles),
    type: enumValue(input.type, 'evidenceSession.type', evidenceSessionTypes),
    protocolVersion: stringValue(input.protocolVersion, 'evidenceSession.protocolVersion', { min: 1, max: 80 }),
    allowedArtifactTypes: arrayValue(input.allowedArtifactTypes, 'evidenceSession.allowedArtifactTypes', { min: 1, max: evidenceArtifactTypes.length, parse: (item, path) => enumValue(item, path, evidenceArtifactTypes), uniqueBy: (item) => item }),
    status: enumValue(input.status, 'evidenceSession.status', evidenceSessionStatuses),
    captureState: enumValue(input.captureState, 'evidenceSession.captureState', captureStates),
    syncState: enumValue(input.syncState, 'evidenceSession.syncState', syncStates),
    processingState: enumValue(input.processingState, 'evidenceSession.processingState', processingStates),
    maximumRedemptions: integerValue(input.maximumRedemptions, 'evidenceSession.maximumRedemptions', 1, 10),
    redemptionCount: integerValue(input.redemptionCount, 'evidenceSession.redemptionCount', 0, 10),
    requestedEvidenceCount: integerValue(input.requestedEvidenceCount, 'evidenceSession.requestedEvidenceCount', 1, 24),
    captureProfileId: input.captureProfileId === undefined || input.captureProfileId === null
      ? null
      : stringValue(input.captureProfileId, 'evidenceSession.captureProfileId', { min: 1, max: 120, pattern: /^[A-Za-z0-9._-]+$/ }),
    captureGroupId: input.captureGroupId === undefined || input.captureGroupId === null
      ? null
      : stringValue(input.captureGroupId, 'evidenceSession.captureGroupId', { min: 1, max: 160, pattern: /^[A-Za-z0-9_-]+$/ }),
    expiresAt: isoDateTime(input.expiresAt, 'evidenceSession.expiresAt'),
    startedAt: input.startedAt === undefined || input.startedAt === null ? null : isoDateTime(input.startedAt, 'evidenceSession.startedAt'),
    completedAt: input.completedAt === undefined || input.completedAt === null ? null : isoDateTime(input.completedAt, 'evidenceSession.completedAt'),
    createdAt: isoDateTime(input.createdAt, 'evidenceSession.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'evidenceSession.updatedAt'),
  };
});

export const evidenceArtifactDtoSchema = schema<EvidenceArtifactDto>((value) => {
  const input = strictObject(value, 'evidenceArtifact', [
    'id', 'object', 'schemaVersion', 'transactionId', 'evidenceSessionId', 'type', 'status', 'contentType', 'sizeBytes',
    'sha256', 'manifestId', 'assurance', 'finalizedAt', 'createdAt', 'updatedAt',
  ]);
  literalValue(input.object, 'evidenceArtifact.object', 'evidence_artifact');
  literalValue(input.schemaVersion, 'evidenceArtifact.schemaVersion', 1);
  const result: EvidenceArtifactDto = {
    id: parseResourceId('evidence_artifact', input.id, 'evidenceArtifact.id'),
    object: 'evidence_artifact',
    schemaVersion: 1,
    transactionId: parseResourceId('transaction', input.transactionId, 'evidenceArtifact.transactionId', { allowLegacy: true }),
    evidenceSessionId: parseResourceId('evidence_session', input.evidenceSessionId, 'evidenceArtifact.evidenceSessionId'),
    type: enumValue(input.type, 'evidenceArtifact.type', evidenceArtifactTypes),
    status: enumValue(input.status, 'evidenceArtifact.status', evidenceArtifactStatuses),
    contentType: stringValue(input.contentType, 'evidenceArtifact.contentType', { min: 3, max: 200, pattern: /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i }),
    sizeBytes: integerValue(input.sizeBytes, 'evidenceArtifact.sizeBytes', 1, 20_000_000_000),
    sha256: sha256Value(input.sha256, 'evidenceArtifact.sha256'),
    manifestId: input.manifestId === undefined || input.manifestId === null ? null : parseResourceId('evidence_manifest', input.manifestId, 'evidenceArtifact.manifestId'),
    assurance: input.assurance === undefined || input.assurance === null ? null : parseAssurance(input.assurance, 'evidenceArtifact.assurance'),
    finalizedAt: input.finalizedAt === undefined || input.finalizedAt === null ? null : isoDateTime(input.finalizedAt, 'evidenceArtifact.finalizedAt'),
    createdAt: isoDateTime(input.createdAt, 'evidenceArtifact.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'evidenceArtifact.updatedAt'),
  };
  if (['FINALIZED', 'QUARANTINED'].includes(result.status) && (!result.manifestId || !result.assurance || !result.finalizedAt)) {
    throw new DomainValidationError({
      path: 'evidenceArtifact.status',
      code: 'FORMAT',
      message: `${result.status} requires a manifest, assurance assessment and server finalization time`,
    });
  }
  if (result.status === 'FINALIZED' && result.assurance && assuranceHasRecordedIntegrityFailure(result.assurance)) {
    throw new DomainValidationError({
      path: 'evidenceArtifact.assurance.byteIntegrity',
      code: 'FORMAT',
      message: 'a recorded integrity failure must not be represented as FINALIZED',
    });
  }
  if (!['FINALIZED', 'QUARANTINED'].includes(result.status) && result.finalizedAt !== null) {
    throw new DomainValidationError({ path: 'evidenceArtifact.finalizedAt', code: 'FORMAT', message: 'is only valid for server-finalized or quarantined artifacts' });
  }
  return result;
});

function parseAuthentication(value: unknown, path: string): ManifestAuthentication {
  const input = strictObject(value, path, ['type', 'algorithm', 'keyId', 'macBase64url', 'signatureBase64url', 'verificationScope']);
  const type = enumValue(input.type, `${path}.type`, ['SERVICE_MAC', 'ASYMMETRIC_SIGNATURE'] as const);
  const keyId = stringValue(input.keyId, `${path}.keyId`, { min: 1, max: 200 });
  if (type === 'SERVICE_MAC') {
    strictObject(value, path, ['type', 'algorithm', 'keyId', 'macBase64url', 'verificationScope']);
    literalValue(input.algorithm, `${path}.algorithm`, 'HMAC-SHA256');
    literalValue(input.verificationScope, `${path}.verificationScope`, 'PACKPROOF_SERVICE_ONLY');
    return {
      type,
      algorithm: 'HMAC-SHA256',
      keyId,
      macBase64url: stringValue(input.macBase64url, `${path}.macBase64url`, { min: 43, max: 44, pattern: /^[A-Za-z0-9_-]+$/ }),
      verificationScope: 'PACKPROOF_SERVICE_ONLY',
    };
  }
  strictObject(value, path, ['type', 'algorithm', 'keyId', 'signatureBase64url', 'verificationScope']);
  const algorithm = enumValue(input.algorithm, `${path}.algorithm`, ['ES256', 'PS256', 'ED25519'] as const);
  literalValue(input.verificationScope, `${path}.verificationScope`, 'PUBLIC_KEY');
  return {
    type,
    algorithm,
    keyId,
    signatureBase64url: stringValue(input.signatureBase64url, `${path}.signatureBase64url`, { min: 40, max: 2000, pattern: /^[A-Za-z0-9_-]+$/ }),
    verificationScope: 'PUBLIC_KEY',
  };
}

export const evidenceManifestDtoSchema = schema<EvidenceManifestDto>((value) => {
  const input = strictObject(value, 'evidenceManifest', [
    'id', 'object', 'schemaVersion', 'transactionId', 'evidenceSessionId', 'artifactId', 'formatSchemaVersion', 'canonicalizationProfile',
    'bundleBindingProfile', 'manifestSha256', 'evidenceBundleSha256', 'authentication', 'finalizedAt', 'createdAt', 'updatedAt',
  ]);
  literalValue(input.object, 'evidenceManifest.object', 'evidence_manifest');
  literalValue(input.schemaVersion, 'evidenceManifest.schemaVersion', 1);
  return {
    id: parseResourceId('evidence_manifest', input.id, 'evidenceManifest.id'),
    object: 'evidence_manifest',
    schemaVersion: 1,
    transactionId: parseResourceId('transaction', input.transactionId, 'evidenceManifest.transactionId', { allowLegacy: true }),
    evidenceSessionId: parseResourceId('evidence_session', input.evidenceSessionId, 'evidenceManifest.evidenceSessionId'),
    artifactId: parseResourceId('evidence_artifact', input.artifactId, 'evidenceManifest.artifactId'),
    formatSchemaVersion: integerValue(input.formatSchemaVersion, 'evidenceManifest.formatSchemaVersion', 1, 1000),
    canonicalizationProfile: stringValue(input.canonicalizationProfile, 'evidenceManifest.canonicalizationProfile', { min: 1, max: 120, pattern: /^[A-Z0-9_-]+$/ }),
    bundleBindingProfile: stringValue(input.bundleBindingProfile, 'evidenceManifest.bundleBindingProfile', { min: 1, max: 120, pattern: /^[A-Z0-9_-]+$/ }),
    manifestSha256: sha256Value(input.manifestSha256, 'evidenceManifest.manifestSha256'),
    evidenceBundleSha256: sha256Value(input.evidenceBundleSha256, 'evidenceManifest.evidenceBundleSha256'),
    authentication: parseAuthentication(input.authentication, 'evidenceManifest.authentication'),
    finalizedAt: isoDateTime(input.finalizedAt, 'evidenceManifest.finalizedAt'),
    createdAt: isoDateTime(input.createdAt, 'evidenceManifest.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'evidenceManifest.updatedAt'),
  };
});

export function assuranceHasRecordedIntegrityFailure(assurance: AssuranceAssessment): boolean {
  return ['MISMATCH', 'FAIL', 'QUARANTINED'].includes(assurance.byteIntegrity.status);
}

export function evidenceCanAdvanceWorkflow(artifact: EvidenceArtifactDto): boolean {
  return evidenceArtifactIsServerFinalized(artifact)
    && artifact.status === 'FINALIZED'
    && artifact.manifestId !== null
    && artifact.assurance !== null
    && !assuranceHasRecordedIntegrityFailure(artifact.assurance);
}

export function evidenceAuthenticationIsPubliclyVerifiable(authentication: ManifestAuthentication): boolean {
  return authentication.type === 'ASYMMETRIC_SIGNATURE' && authentication.verificationScope === 'PUBLIC_KEY';
}

export function evidenceArtifactIsServerFinalized(artifact: EvidenceArtifactDto): boolean {
  return Boolean(artifact.finalizedAt) && ['FINALIZED', 'QUARANTINED'].includes(artifact.status);
}
