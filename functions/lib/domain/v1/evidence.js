"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.evidenceManifestDtoSchema = exports.evidenceArtifactDtoSchema = exports.evidenceSessionDtoSchema = exports.evidenceArtifactTransitions = exports.evidenceArtifactStatuses = exports.evidenceArtifactTypes = exports.processingStates = exports.syncStates = exports.captureStates = exports.evidenceSessionTransitions = exports.evidenceSessionStatuses = exports.evidenceSessionTypes = void 0;
exports.parseAssurance = parseAssurance;
exports.freezeEvidenceSessionIntake = freezeEvidenceSessionIntake;
exports.assuranceHasRecordedIntegrityFailure = assuranceHasRecordedIntegrityFailure;
exports.evidenceCanAdvanceWorkflow = evidenceCanAdvanceWorkflow;
exports.evidenceAuthenticationIsPubliclyVerifiable = evidenceAuthenticationIsPubliclyVerifiable;
exports.evidenceArtifactIsServerFinalized = evidenceArtifactIsServerFinalized;
const common_1 = require("./common");
const runtime_1 = require("./runtime");
exports.evidenceSessionTypes = [
    'OUTBOUND_PACK',
    'RECEIVER_OPEN',
    'RETURN_PACK',
    'RETURN_RECEIVE',
    'PHYSICAL_REFERENCE',
    'PHYSICAL_VERIFICATION',
    'SUPPORTING_DOCUMENT',
];
exports.evidenceSessionStatuses = [
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
];
exports.evidenceSessionTransitions = {
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
exports.captureStates = ['NOT_STARTED', 'READY', 'CAPTURING', 'CAPTURED', 'FAILED', 'CANCELLED'];
exports.syncStates = ['NOT_STARTED', 'QUEUED', 'UPLOADING', 'AWAITING_FINALIZATION', 'COMPLETE', 'FAILED_RETRYABLE', 'FAILED_TERMINAL'];
exports.processingStates = ['NOT_STARTED', 'PROCESSING', 'COMPLETE', 'QUARANTINED', 'FAILED'];
exports.evidenceArtifactTypes = [
    'ITEM_PHOTO', 'CONDITION_PHOTO', 'IDENTIFIER_PHOTO', 'COA_PHOTO', 'PACKING_VIDEO', 'SHIPPING_LABEL',
    'UNBOXING_VIDEO', 'DELIVERY_PHOTO', 'SUPPORTING_DOCUMENT', 'RETURN_CONDITION_PHOTO', 'RETURN_PACKING_VIDEO',
    'RETURN_SHIPPING_LABEL', 'RETURN_UNBOXING_VIDEO', 'PHYSICAL_REFERENCE_FRAME', 'PHYSICAL_VERIFICATION_FRAME',
];
exports.evidenceArtifactStatuses = ['RESERVED', 'UPLOADED', 'FINALIZED', 'QUARANTINED', 'FAILED'];
exports.evidenceArtifactTransitions = {
    RESERVED: ['UPLOADED', 'FAILED'],
    UPLOADED: ['FINALIZED', 'QUARANTINED', 'FAILED'],
    FINALIZED: [],
    QUARANTINED: [],
    FAILED: [],
};
function parseAssuranceDimension(value, path) {
    const input = (0, runtime_1.strictObject)(value, path, ['status', 'reasonCodes']);
    return {
        status: (0, runtime_1.stringValue)(input.status, `${path}.status`, { min: 1, max: 120, pattern: /^[A-Z0-9_-]+$/ }),
        reasonCodes: (0, runtime_1.arrayValue)(input.reasonCodes, `${path}.reasonCodes`, {
            max: 30,
            parse: (reason, reasonPath) => (0, runtime_1.stringValue)(reason, reasonPath, { min: 1, max: 160, pattern: /^[A-Z0-9_-]+$/ }),
            uniqueBy: (reason) => reason,
        }),
    };
}
function parseAssurance(value, path) {
    const input = (0, runtime_1.strictObject)(value, path, ['acquisitionQuality', 'appDeviceContext', 'byteIntegrity', 'physicalCorrespondence', 'carrierContext', 'businessLegalRelevance']);
    return {
        acquisitionQuality: parseAssuranceDimension(input.acquisitionQuality, `${path}.acquisitionQuality`),
        appDeviceContext: parseAssuranceDimension(input.appDeviceContext, `${path}.appDeviceContext`),
        byteIntegrity: parseAssuranceDimension(input.byteIntegrity, `${path}.byteIntegrity`),
        physicalCorrespondence: parseAssuranceDimension(input.physicalCorrespondence, `${path}.physicalCorrespondence`),
        carrierContext: parseAssuranceDimension(input.carrierContext, `${path}.carrierContext`),
        businessLegalRelevance: parseAssuranceDimension(input.businessLegalRelevance, `${path}.businessLegalRelevance`),
    };
}
const actorRoles = ['SELLER', 'BUYER', 'RECEIVER', 'RETURN_SENDER', 'RETURN_RECIPIENT', 'WITNESS'];
exports.evidenceSessionDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'evidenceSession', [
        'id', 'object', 'schemaVersion', 'transactionId', 'commerceContextId', 'returnPassportId', 'actorRole', 'type', 'protocolVersion',
        'allowedArtifactTypes', 'status', 'captureState', 'syncState', 'processingState', 'maximumRedemptions', 'redemptionCount',
        'requestedEvidenceCount', 'captureProfileId', 'captureGroupId', 'expiresAt', 'startedAt', 'completedAt',
        'originalArtifactSha256', 'normalizedSnapshotSha256', 'intakeFrozenAt', 'createdAt', 'updatedAt',
    ]);
    (0, runtime_1.literalValue)(input.object, 'evidenceSession.object', 'evidence_session');
    (0, runtime_1.literalValue)(input.schemaVersion, 'evidenceSession.schemaVersion', 1);
    return {
        id: (0, common_1.parseResourceId)('evidence_session', input.id, 'evidenceSession.id'),
        object: 'evidence_session',
        schemaVersion: 1,
        transactionId: (0, common_1.parseResourceId)('transaction', input.transactionId, 'evidenceSession.transactionId', { allowLegacy: true }),
        commerceContextId: input.commerceContextId === undefined || input.commerceContextId === null
            ? null
            : (0, common_1.parseResourceId)('commerce_context', input.commerceContextId, 'evidenceSession.commerceContextId'),
        returnPassportId: input.returnPassportId === undefined || input.returnPassportId === null ? null : (0, common_1.parseResourceId)('return_passport', input.returnPassportId, 'evidenceSession.returnPassportId', { allowLegacy: true }),
        actorRole: (0, runtime_1.enumValue)(input.actorRole, 'evidenceSession.actorRole', actorRoles),
        type: (0, runtime_1.enumValue)(input.type, 'evidenceSession.type', exports.evidenceSessionTypes),
        protocolVersion: (0, runtime_1.stringValue)(input.protocolVersion, 'evidenceSession.protocolVersion', { min: 1, max: 80 }),
        allowedArtifactTypes: (0, runtime_1.arrayValue)(input.allowedArtifactTypes, 'evidenceSession.allowedArtifactTypes', { min: 1, max: exports.evidenceArtifactTypes.length, parse: (item, path) => (0, runtime_1.enumValue)(item, path, exports.evidenceArtifactTypes), uniqueBy: (item) => item }),
        status: (0, runtime_1.enumValue)(input.status, 'evidenceSession.status', exports.evidenceSessionStatuses),
        captureState: (0, runtime_1.enumValue)(input.captureState, 'evidenceSession.captureState', exports.captureStates),
        syncState: (0, runtime_1.enumValue)(input.syncState, 'evidenceSession.syncState', exports.syncStates),
        processingState: (0, runtime_1.enumValue)(input.processingState, 'evidenceSession.processingState', exports.processingStates),
        maximumRedemptions: (0, runtime_1.integerValue)(input.maximumRedemptions, 'evidenceSession.maximumRedemptions', 1, 10),
        redemptionCount: (0, runtime_1.integerValue)(input.redemptionCount, 'evidenceSession.redemptionCount', 0, 10),
        requestedEvidenceCount: (0, runtime_1.integerValue)(input.requestedEvidenceCount, 'evidenceSession.requestedEvidenceCount', 1, 24),
        captureProfileId: input.captureProfileId === undefined || input.captureProfileId === null
            ? null
            : (0, runtime_1.stringValue)(input.captureProfileId, 'evidenceSession.captureProfileId', { min: 1, max: 120, pattern: /^[A-Za-z0-9._-]+$/ }),
        captureGroupId: input.captureGroupId === undefined || input.captureGroupId === null
            ? null
            : (0, runtime_1.stringValue)(input.captureGroupId, 'evidenceSession.captureGroupId', { min: 1, max: 160, pattern: /^[A-Za-z0-9_-]+$/ }),
        expiresAt: (0, runtime_1.isoDateTime)(input.expiresAt, 'evidenceSession.expiresAt'),
        startedAt: input.startedAt === undefined || input.startedAt === null ? null : (0, runtime_1.isoDateTime)(input.startedAt, 'evidenceSession.startedAt'),
        completedAt: input.completedAt === undefined || input.completedAt === null ? null : (0, runtime_1.isoDateTime)(input.completedAt, 'evidenceSession.completedAt'),
        originalArtifactSha256: (0, runtime_1.optionalSha256)(input.originalArtifactSha256, 'evidenceSession.originalArtifactSha256'),
        normalizedSnapshotSha256: (0, runtime_1.optionalSha256)(input.normalizedSnapshotSha256, 'evidenceSession.normalizedSnapshotSha256'),
        intakeFrozenAt: (0, runtime_1.optionalIsoDateTime)(input.intakeFrozenAt, 'evidenceSession.intakeFrozenAt'),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'evidenceSession.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'evidenceSession.updatedAt'),
    };
});
function freezeEvidenceSessionIntake(session, freeze) {
    if (session.intakeFrozenAt) {
        if (session.originalArtifactSha256 !== freeze.originalArtifactSha256
            || session.normalizedSnapshotSha256 !== freeze.normalizedSnapshotSha256) {
            throw new runtime_1.DomainValidationError({
                path: 'evidenceSession.intakeFrozenAt',
                code: 'FORMAT',
                message: 'intake freeze hashes cannot change after capture starts',
            });
        }
        return session;
    }
    return exports.evidenceSessionDtoSchema.parse({
        ...session,
        originalArtifactSha256: freeze.originalArtifactSha256,
        normalizedSnapshotSha256: freeze.normalizedSnapshotSha256,
        intakeFrozenAt: freeze.frozenAt,
    });
}
exports.evidenceArtifactDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'evidenceArtifact', [
        'id', 'object', 'schemaVersion', 'transactionId', 'evidenceSessionId', 'type', 'status', 'contentType', 'sizeBytes',
        'sha256', 'manifestId', 'assurance', 'finalizedAt', 'createdAt', 'updatedAt',
    ]);
    (0, runtime_1.literalValue)(input.object, 'evidenceArtifact.object', 'evidence_artifact');
    (0, runtime_1.literalValue)(input.schemaVersion, 'evidenceArtifact.schemaVersion', 1);
    const result = {
        id: (0, common_1.parseResourceId)('evidence_artifact', input.id, 'evidenceArtifact.id'),
        object: 'evidence_artifact',
        schemaVersion: 1,
        transactionId: (0, common_1.parseResourceId)('transaction', input.transactionId, 'evidenceArtifact.transactionId', { allowLegacy: true }),
        evidenceSessionId: (0, common_1.parseResourceId)('evidence_session', input.evidenceSessionId, 'evidenceArtifact.evidenceSessionId'),
        type: (0, runtime_1.enumValue)(input.type, 'evidenceArtifact.type', exports.evidenceArtifactTypes),
        status: (0, runtime_1.enumValue)(input.status, 'evidenceArtifact.status', exports.evidenceArtifactStatuses),
        contentType: (0, runtime_1.stringValue)(input.contentType, 'evidenceArtifact.contentType', { min: 3, max: 200, pattern: /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i }),
        sizeBytes: (0, runtime_1.integerValue)(input.sizeBytes, 'evidenceArtifact.sizeBytes', 1, 20_000_000_000),
        sha256: (0, runtime_1.sha256Value)(input.sha256, 'evidenceArtifact.sha256'),
        manifestId: input.manifestId === undefined || input.manifestId === null ? null : (0, common_1.parseResourceId)('evidence_manifest', input.manifestId, 'evidenceArtifact.manifestId'),
        assurance: input.assurance === undefined || input.assurance === null ? null : parseAssurance(input.assurance, 'evidenceArtifact.assurance'),
        finalizedAt: input.finalizedAt === undefined || input.finalizedAt === null ? null : (0, runtime_1.isoDateTime)(input.finalizedAt, 'evidenceArtifact.finalizedAt'),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'evidenceArtifact.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'evidenceArtifact.updatedAt'),
    };
    if (['FINALIZED', 'QUARANTINED'].includes(result.status) && (!result.manifestId || !result.assurance || !result.finalizedAt)) {
        throw new runtime_1.DomainValidationError({
            path: 'evidenceArtifact.status',
            code: 'FORMAT',
            message: `${result.status} requires a manifest, assurance assessment and server finalization time`,
        });
    }
    if (result.status === 'FINALIZED' && result.assurance && assuranceHasRecordedIntegrityFailure(result.assurance)) {
        throw new runtime_1.DomainValidationError({
            path: 'evidenceArtifact.assurance.byteIntegrity',
            code: 'FORMAT',
            message: 'a recorded integrity failure must not be represented as FINALIZED',
        });
    }
    if (!['FINALIZED', 'QUARANTINED'].includes(result.status) && result.finalizedAt !== null) {
        throw new runtime_1.DomainValidationError({ path: 'evidenceArtifact.finalizedAt', code: 'FORMAT', message: 'is only valid for server-finalized or quarantined artifacts' });
    }
    return result;
});
function parseAuthentication(value, path) {
    const input = (0, runtime_1.strictObject)(value, path, ['type', 'algorithm', 'keyId', 'macBase64url', 'signatureBase64url', 'verificationScope']);
    const type = (0, runtime_1.enumValue)(input.type, `${path}.type`, ['SERVICE_MAC', 'ASYMMETRIC_SIGNATURE']);
    const keyId = (0, runtime_1.stringValue)(input.keyId, `${path}.keyId`, { min: 1, max: 200 });
    if (type === 'SERVICE_MAC') {
        (0, runtime_1.strictObject)(value, path, ['type', 'algorithm', 'keyId', 'macBase64url', 'verificationScope']);
        (0, runtime_1.literalValue)(input.algorithm, `${path}.algorithm`, 'HMAC-SHA256');
        (0, runtime_1.literalValue)(input.verificationScope, `${path}.verificationScope`, 'PACKPROOF_SERVICE_ONLY');
        return {
            type,
            algorithm: 'HMAC-SHA256',
            keyId,
            macBase64url: (0, runtime_1.stringValue)(input.macBase64url, `${path}.macBase64url`, { min: 43, max: 44, pattern: /^[A-Za-z0-9_-]+$/ }),
            verificationScope: 'PACKPROOF_SERVICE_ONLY',
        };
    }
    (0, runtime_1.strictObject)(value, path, ['type', 'algorithm', 'keyId', 'signatureBase64url', 'verificationScope']);
    const algorithm = (0, runtime_1.enumValue)(input.algorithm, `${path}.algorithm`, ['ES256', 'PS256', 'ED25519']);
    (0, runtime_1.literalValue)(input.verificationScope, `${path}.verificationScope`, 'PUBLIC_KEY');
    return {
        type,
        algorithm,
        keyId,
        signatureBase64url: (0, runtime_1.stringValue)(input.signatureBase64url, `${path}.signatureBase64url`, { min: 40, max: 2000, pattern: /^[A-Za-z0-9_-]+$/ }),
        verificationScope: 'PUBLIC_KEY',
    };
}
exports.evidenceManifestDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'evidenceManifest', [
        'id', 'object', 'schemaVersion', 'transactionId', 'evidenceSessionId', 'artifactId', 'formatSchemaVersion', 'canonicalizationProfile',
        'bundleBindingProfile', 'manifestSha256', 'evidenceBundleSha256', 'authentication', 'finalizedAt', 'createdAt', 'updatedAt',
    ]);
    (0, runtime_1.literalValue)(input.object, 'evidenceManifest.object', 'evidence_manifest');
    (0, runtime_1.literalValue)(input.schemaVersion, 'evidenceManifest.schemaVersion', 1);
    return {
        id: (0, common_1.parseResourceId)('evidence_manifest', input.id, 'evidenceManifest.id'),
        object: 'evidence_manifest',
        schemaVersion: 1,
        transactionId: (0, common_1.parseResourceId)('transaction', input.transactionId, 'evidenceManifest.transactionId', { allowLegacy: true }),
        evidenceSessionId: (0, common_1.parseResourceId)('evidence_session', input.evidenceSessionId, 'evidenceManifest.evidenceSessionId'),
        artifactId: (0, common_1.parseResourceId)('evidence_artifact', input.artifactId, 'evidenceManifest.artifactId'),
        formatSchemaVersion: (0, runtime_1.integerValue)(input.formatSchemaVersion, 'evidenceManifest.formatSchemaVersion', 1, 1000),
        canonicalizationProfile: (0, runtime_1.stringValue)(input.canonicalizationProfile, 'evidenceManifest.canonicalizationProfile', { min: 1, max: 120, pattern: /^[A-Z0-9_-]+$/ }),
        bundleBindingProfile: (0, runtime_1.stringValue)(input.bundleBindingProfile, 'evidenceManifest.bundleBindingProfile', { min: 1, max: 120, pattern: /^[A-Z0-9_-]+$/ }),
        manifestSha256: (0, runtime_1.sha256Value)(input.manifestSha256, 'evidenceManifest.manifestSha256'),
        evidenceBundleSha256: (0, runtime_1.sha256Value)(input.evidenceBundleSha256, 'evidenceManifest.evidenceBundleSha256'),
        authentication: parseAuthentication(input.authentication, 'evidenceManifest.authentication'),
        finalizedAt: (0, runtime_1.isoDateTime)(input.finalizedAt, 'evidenceManifest.finalizedAt'),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'evidenceManifest.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'evidenceManifest.updatedAt'),
    };
});
function assuranceHasRecordedIntegrityFailure(assurance) {
    return ['MISMATCH', 'FAIL', 'QUARANTINED'].includes(assurance.byteIntegrity.status);
}
function evidenceCanAdvanceWorkflow(artifact) {
    return evidenceArtifactIsServerFinalized(artifact)
        && artifact.status === 'FINALIZED'
        && artifact.manifestId !== null
        && artifact.assurance !== null
        && !assuranceHasRecordedIntegrityFailure(artifact.assurance);
}
function evidenceAuthenticationIsPubliclyVerifiable(authentication) {
    return authentication.type === 'ASYMMETRIC_SIGNATURE' && authentication.verificationScope === 'PUBLIC_KEY';
}
function evidenceArtifactIsServerFinalized(artifact) {
    return Boolean(artifact.finalizedAt) && ['FINALIZED', 'QUARANTINED'].includes(artifact.status);
}
//# sourceMappingURL=evidence.js.map