"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.enterpriseResourceContracts = exports.hardwareObservationDtoSchema = exports.enterpriseArtifactDtoSchema = exports.enterpriseEvidenceSessionDtoSchema = exports.fulfillmentSessionDtoSchema = exports.deviceCredentialDtoSchema = exports.stationDeviceDtoSchema = exports.edgeAgentDtoSchema = exports.packingStationDtoSchema = exports.enterpriseSiteDtoSchema = exports.enterpriseOrganizationDtoSchema = exports.enterpriseWorkflowPolicies = exports.enterpriseV1ComputerVisionRequired = exports.forbiddenEdgeSecretNames = exports.enterpriseRequirementKeys = exports.enterpriseObservationTypes = exports.enterpriseArtifactTransitions = exports.enterpriseArtifactStatuses = exports.enterpriseArtifactTypes = exports.fulfillmentSessionTransitions = exports.fulfillmentSessionStatuses = exports.deviceCredentialStatuses = exports.deviceCredentialKeyStorage = exports.stationDeviceStatuses = exports.stationDeviceKinds = exports.edgeAgentStatuses = exports.packingStationStatuses = exports.enterpriseSiteStatuses = exports.enterpriseOrganizationStatuses = exports.enterpriseOperatingModes = exports.acquisitionClasses = exports.enterpriseResourceIdPrefixes = exports.enterpriseResourceKinds = void 0;
exports.parseEnterpriseResourceId = parseEnterpriseResourceId;
exports.resolveWorkflowPolicy = resolveWorkflowPolicy;
exports.acquisitionClassesHaveEqualAssurance = acquisitionClassesHaveEqualAssurance;
exports.acquisitionClassSatisfies = acquisitionClassSatisfies;
exports.acquisitionSourceAuthorizesFinalization = acquisitionSourceAuthorizesFinalization;
exports.edgeMayFinalizeEvidence = edgeMayFinalizeEvidence;
exports.assertEdgeSecretIsPurposeSeparated = assertEdgeSecretIsPurposeSeparated;
exports.assertRollingCaptureProvenance = assertRollingCaptureProvenance;
exports.canTransitionFulfillment = canTransitionFulfillment;
exports.assertFulfillmentTransition = assertFulfillmentTransition;
exports.requirementSatisfier = requirementSatisfier;
exports.evaluateEnterprisePolicy = evaluateEnterprisePolicy;
exports.formatNeutralEnterpriseStatements = formatNeutralEnterpriseStatements;
exports.assertNeutralEnterpriseStatement = assertNeutralEnterpriseStatement;
exports.enterpriseStationHealthLabel = enterpriseStationHealthLabel;
exports.assertEnterpriseResourceCatalogComplete = assertEnterpriseResourceCatalogComplete;
const common_1 = require("./common");
const runtime_1 = require("./runtime");
exports.enterpriseResourceKinds = [
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
];
exports.enterpriseResourceIdPrefixes = {
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
function parseEnterpriseResourceId(kind, value, path = `${kind}Id`) {
    const result = (0, runtime_1.stringValue)(value, path, { min: 10, max: 160 });
    const prefix = exports.enterpriseResourceIdPrefixes[kind];
    if (!result.startsWith(prefix) || !enterpriseIdPattern.test(result)) {
        throw new runtime_1.DomainValidationError({ path, code: 'FORMAT', message: `must use the ${prefix} identifier format` });
    }
    return result;
}
exports.acquisitionClasses = ['NATIVE_MOBILE', 'ENTERPRISE_EDGE', 'EXTERNAL_DECLARED'];
exports.enterpriseOperatingModes = ['OBSERVE', 'ASSIST', 'ENFORCE'];
exports.enterpriseOrganizationStatuses = ['ACTIVE', 'SUSPENDED'];
exports.enterpriseSiteStatuses = ['ACTIVE', 'DISABLED'];
exports.packingStationStatuses = ['ACTIVE', 'DISABLED', 'MAINTENANCE'];
exports.edgeAgentStatuses = ['REGISTERED', 'ACTIVE', 'REVOKED'];
exports.stationDeviceKinds = ['OVERHEAD_CAMERA', 'LABEL_CAMERA', 'BARCODE_SCANNER', 'SCALE', 'PRINTER'];
exports.stationDeviceStatuses = ['REGISTERED', 'ONLINE', 'OFFLINE', 'FAULTED'];
exports.deviceCredentialKeyStorage = ['TPM', 'PLATFORM_KEYSTORE', 'SOFTWARE_WRAPPED'];
exports.deviceCredentialStatuses = ['ACTIVE', 'ROTATING', 'REVOKED'];
exports.fulfillmentSessionStatuses = [
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
];
exports.fulfillmentSessionTransitions = {
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
exports.enterpriseArtifactTypes = [
    'STATION_PACKING_VIDEO',
    'STATION_SEAL_REFERENCE',
    'ITEM_REFERENCE_PHOTO',
    'STATION_EVENT_LOG',
];
exports.enterpriseArtifactStatuses = ['RESERVED', 'UPLOADED', 'FINALIZED', 'QUARANTINED', 'FAILED'];
exports.enterpriseArtifactTransitions = {
    RESERVED: ['UPLOADED', 'FAILED'],
    UPLOADED: ['FINALIZED', 'QUARANTINED', 'FAILED'],
    FINALIZED: [],
    QUARANTINED: [],
    FAILED: [],
};
exports.enterpriseObservationTypes = [
    'ITEM_BARCODE_OBSERVATION',
    'TRACKING_BARCODE_OBSERVATION',
    'PACKAGE_WEIGHT_OBSERVATION',
];
exports.enterpriseRequirementKeys = [
    'PACKING_VIDEO',
    'SEAL_REFERENCE',
    'TRACKING_OBSERVATION',
    'ITEM_BARCODE',
    'ITEM_REFERENCE_PHOTO',
    'STABLE_WEIGHT',
];
exports.forbiddenEdgeSecretNames = [
    'API_CREDENTIAL_PEPPER',
    'MANIFEST_SIGNING_SECRET',
    'MANIFEST_SIGNING_KEY_ID',
    'PARTICIPANT_HANDOFF_SIGNING_SECRET',
    'PUBLIC_HANDOFF_SIGNING_SECRET',
    'WEBHOOK_SIGNING_SECRET',
];
exports.enterpriseV1ComputerVisionRequired = false;
exports.enterpriseWorkflowPolicies = {
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
const identifierPattern = /^[A-Za-z0-9._:-]{1,160}$/;
function parseExpectedItem(value, path) {
    const input = (0, runtime_1.strictObject)(value, path, ['sku', 'quantity']);
    return {
        sku: (0, runtime_1.stringValue)(input.sku, `${path}.sku`, { min: 1, max: 120, pattern: /^[A-Za-z0-9._:-]+$/ }),
        quantity: (0, runtime_1.integerValue)(input.quantity, `${path}.quantity`, 1, 10_000),
    };
}
function resolveWorkflowPolicy(policyId) {
    const policy = exports.enterpriseWorkflowPolicies[policyId];
    if (!policy) {
        throw new runtime_1.DomainValidationError({ path: 'policyId', code: 'FORMAT', message: `unknown workflow policy ${policyId}` });
    }
    return policy;
}
function acquisitionClassesHaveEqualAssurance(left, right) {
    return left === right;
}
function acquisitionClassSatisfies(actual, required) {
    return actual === required;
}
function acquisitionSourceAuthorizesFinalization(_source) {
    return false;
}
function edgeMayFinalizeEvidence() {
    return false;
}
function assertEdgeSecretIsPurposeSeparated(secretName) {
    if (exports.forbiddenEdgeSecretNames.includes(secretName) || secretName === 'APP_CHECK' || secretName === 'FIREBASE_APP_CHECK') {
        throw new runtime_1.DomainValidationError({
            path: 'secretName',
            code: 'FORMAT',
            message: 'Edge credentials must not reuse merchant, manifest, handoff, webhook, or App Check secrets',
        });
    }
}
function assertRollingCaptureProvenance(provenance) {
    if (provenance.captureKind === 'CAMERA_ORIGINAL_FILE' || provenance.assemblyMethod === 'CAMERA_ORIGINAL_FILE') {
        if (provenance.preRollDurationMs > 0 || provenance.postRollDurationMs > 0 || provenance.originalSegmentHashes.length > 1) {
            throw new runtime_1.DomainValidationError({
                path: 'rollingCapture.captureKind',
                code: 'FORMAT',
                message: 'a derived rolling segment must not be described as a camera-original file',
            });
        }
    }
    if (provenance.assemblyMethod === 'DETERMINISTIC_CHUNK_CONCAT' && provenance.originalSegmentHashes.length < 1) {
        throw new runtime_1.DomainValidationError({
            path: 'rollingCapture.originalSegmentHashes',
            code: 'RANGE',
            message: 'deterministic chunk assembly requires independently hashed source segments',
        });
    }
}
function canTransitionFulfillment(from, to) {
    return (0, common_1.canTransition)(exports.fulfillmentSessionTransitions, from, to);
}
function assertFulfillmentTransition(from, to) {
    (0, common_1.assertTransition)(exports.fulfillmentSessionTransitions, from, to, 'fulfillmentSession');
}
const requirementSatisfiers = {
    PACKING_VIDEO: { artifact: 'STATION_PACKING_VIDEO' },
    SEAL_REFERENCE: { artifact: 'STATION_SEAL_REFERENCE' },
    ITEM_REFERENCE_PHOTO: { artifact: 'ITEM_REFERENCE_PHOTO' },
    TRACKING_OBSERVATION: { observation: 'TRACKING_BARCODE_OBSERVATION' },
    ITEM_BARCODE: { observation: 'ITEM_BARCODE_OBSERVATION' },
    STABLE_WEIGHT: { observation: 'PACKAGE_WEIGHT_OBSERVATION' },
};
function requirementSatisfier(key) {
    return requirementSatisfiers[key];
}
function evaluateEnterprisePolicy(input) {
    const policy = resolveWorkflowPolicy(input.policyId);
    const capturePresent = [];
    const captureMissing = [];
    const workflowReady = [];
    const workflowMissing = [];
    const statements = [];
    for (const requirement of policy.requirements) {
        const fact = input.facts.find((item) => item.requirement === requirement.key);
        const classOk = fact ? acquisitionClassSatisfies(fact.acquisitionClass, requirement.requiredAcquisitionClass) : false;
        const captured = Boolean(fact?.captured && classOk);
        const ready = Boolean(captured && fact?.serverFinalized && !fact.integrityMismatch);
        if (!requirement.required) {
            if (captured)
                capturePresent.push(requirement.key);
            if (ready) {
                workflowReady.push(requirement.key);
                if (fact?.detail)
                    statements.push(fact.detail);
            }
            continue;
        }
        if (captured)
            capturePresent.push(requirement.key);
        else
            captureMissing.push(requirement.key);
        if (ready) {
            workflowReady.push(requirement.key);
            if (fact?.detail)
                statements.push(fact.detail);
        }
        else {
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
function formatNeutralEnterpriseStatements(facts) {
    const statements = [];
    for (const fact of facts) {
        if (!fact.detail)
            continue;
        if (forbiddenStatementPattern.test(fact.detail)) {
            throw new runtime_1.DomainValidationError({
                path: 'statement',
                code: 'FORMAT',
                message: 'Enterprise statements must remain observations; they must not assert fraud, authenticity, custody, fault, or disposition',
            });
        }
        statements.push(fact.detail);
    }
    return statements;
}
function assertNeutralEnterpriseStatement(statement) {
    return formatNeutralEnterpriseStatements([{
            requirement: 'PACKING_VIDEO',
            acquisitionClass: 'ENTERPRISE_EDGE',
            captured: true,
            serverFinalized: true,
            integrityMismatch: false,
            detail: statement,
        }])[0];
}
function enterpriseStationHealthLabel(input) {
    const offline = (kind) => input.devices.some((device) => device.kind === kind && (device.status === 'OFFLINE' || device.status === 'FAULTED'));
    if (offline('OVERHEAD_CAMERA') || offline('LABEL_CAMERA'))
        return 'Camera offline';
    if (offline('SCALE'))
        return 'Scale disconnected';
    if (offline('BARCODE_SCANNER'))
        return 'Scanner disconnected';
    if (input.attention > 0)
        return `${input.attention} evidence objects need attention`;
    const awaitingSync = input.pending + input.uploading;
    if (awaitingSync > 0)
        return `${awaitingSync} evidence objects awaiting sync`;
    if (input.awaitingFinalization > 0)
        return `${input.awaitingFinalization} evidence objects awaiting finalization`;
    return 'Healthy';
}
exports.enterpriseOrganizationDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'enterpriseOrganization', [
        'id', 'object', 'schemaVersion', 'organizationId', 'status', 'operatingMode', 'defaultPolicyId', 'createdAt', 'updatedAt',
    ]);
    (0, runtime_1.literalValue)(input.object, 'enterpriseOrganization.object', 'enterprise_organization');
    (0, runtime_1.literalValue)(input.schemaVersion, 'enterpriseOrganization.schemaVersion', 1);
    const result = {
        id: parseEnterpriseResourceId('enterprise_organization', input.id, 'enterpriseOrganization.id'),
        object: 'enterprise_organization',
        schemaVersion: 1,
        organizationId: (0, common_1.parseResourceId)('organization', input.organizationId, 'enterpriseOrganization.organizationId'),
        status: (0, runtime_1.enumValue)(input.status, 'enterpriseOrganization.status', exports.enterpriseOrganizationStatuses),
        operatingMode: (0, runtime_1.enumValue)(input.operatingMode, 'enterpriseOrganization.operatingMode', exports.enterpriseOperatingModes),
        defaultPolicyId: resolveWorkflowPolicy((0, runtime_1.stringValue)(input.defaultPolicyId, 'enterpriseOrganization.defaultPolicyId', { min: 8, max: 80 })).policyId,
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'enterpriseOrganization.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'enterpriseOrganization.updatedAt'),
    };
    return result;
});
exports.enterpriseSiteDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'enterpriseSite', [
        'id', 'object', 'schemaVersion', 'organizationId', 'code', 'name', 'status', 'createdAt', 'updatedAt',
    ]);
    (0, runtime_1.literalValue)(input.object, 'enterpriseSite.object', 'enterprise_site');
    (0, runtime_1.literalValue)(input.schemaVersion, 'enterpriseSite.schemaVersion', 1);
    return {
        id: parseEnterpriseResourceId('enterprise_site', input.id, 'enterpriseSite.id'),
        object: 'enterprise_site',
        schemaVersion: 1,
        organizationId: (0, common_1.parseResourceId)('organization', input.organizationId, 'enterpriseSite.organizationId'),
        code: (0, runtime_1.stringValue)(input.code, 'enterpriseSite.code', { min: 2, max: 40, pattern: /^[A-Z0-9-]+$/ }),
        name: (0, runtime_1.stringValue)(input.name, 'enterpriseSite.name', { min: 2, max: 120 }),
        status: (0, runtime_1.enumValue)(input.status, 'enterpriseSite.status', exports.enterpriseSiteStatuses),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'enterpriseSite.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'enterpriseSite.updatedAt'),
    };
});
exports.packingStationDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'packingStation', [
        'id', 'object', 'schemaVersion', 'organizationId', 'siteId', 'code', 'status', 'policyId', 'createdAt', 'updatedAt',
    ]);
    (0, runtime_1.literalValue)(input.object, 'packingStation.object', 'packing_station');
    (0, runtime_1.literalValue)(input.schemaVersion, 'packingStation.schemaVersion', 1);
    return {
        id: parseEnterpriseResourceId('packing_station', input.id, 'packingStation.id'),
        object: 'packing_station',
        schemaVersion: 1,
        organizationId: (0, common_1.parseResourceId)('organization', input.organizationId, 'packingStation.organizationId'),
        siteId: parseEnterpriseResourceId('enterprise_site', input.siteId, 'packingStation.siteId'),
        code: (0, runtime_1.stringValue)(input.code, 'packingStation.code', { min: 2, max: 40, pattern: /^[A-Z0-9-]+$/ }),
        status: (0, runtime_1.enumValue)(input.status, 'packingStation.status', exports.packingStationStatuses),
        policyId: resolveWorkflowPolicy((0, runtime_1.stringValue)(input.policyId, 'packingStation.policyId', { min: 8, max: 80 })).policyId,
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'packingStation.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'packingStation.updatedAt'),
    };
});
exports.edgeAgentDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'edgeAgent', [
        'id', 'object', 'schemaVersion', 'organizationId', 'siteId', 'stationId', 'installationIdentity', 'status', 'createdAt', 'updatedAt',
    ]);
    (0, runtime_1.literalValue)(input.object, 'edgeAgent.object', 'edge_agent');
    (0, runtime_1.literalValue)(input.schemaVersion, 'edgeAgent.schemaVersion', 1);
    return {
        id: parseEnterpriseResourceId('edge_agent', input.id, 'edgeAgent.id'),
        object: 'edge_agent',
        schemaVersion: 1,
        organizationId: (0, common_1.parseResourceId)('organization', input.organizationId, 'edgeAgent.organizationId'),
        siteId: parseEnterpriseResourceId('enterprise_site', input.siteId, 'edgeAgent.siteId'),
        stationId: input.stationId === undefined || input.stationId === null ? null : parseEnterpriseResourceId('packing_station', input.stationId, 'edgeAgent.stationId'),
        installationIdentity: (0, runtime_1.stringValue)(input.installationIdentity, 'edgeAgent.installationIdentity', { min: 8, max: 160, pattern: identifierPattern }),
        status: (0, runtime_1.enumValue)(input.status, 'edgeAgent.status', exports.edgeAgentStatuses),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'edgeAgent.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'edgeAgent.updatedAt'),
    };
});
exports.stationDeviceDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'stationDevice', [
        'id', 'object', 'schemaVersion', 'organizationId', 'stationId', 'kind', 'code', 'adapter', 'status', 'createdAt', 'updatedAt',
    ]);
    (0, runtime_1.literalValue)(input.object, 'stationDevice.object', 'station_device');
    (0, runtime_1.literalValue)(input.schemaVersion, 'stationDevice.schemaVersion', 1);
    return {
        id: parseEnterpriseResourceId('station_device', input.id, 'stationDevice.id'),
        object: 'station_device',
        schemaVersion: 1,
        organizationId: (0, common_1.parseResourceId)('organization', input.organizationId, 'stationDevice.organizationId'),
        stationId: parseEnterpriseResourceId('packing_station', input.stationId, 'stationDevice.stationId'),
        kind: (0, runtime_1.enumValue)(input.kind, 'stationDevice.kind', exports.stationDeviceKinds),
        code: (0, runtime_1.stringValue)(input.code, 'stationDevice.code', { min: 2, max: 40, pattern: /^[A-Z0-9-]+$/ }),
        adapter: (0, runtime_1.enumValue)(input.adapter, 'stationDevice.adapter', ['USB_HID', 'SERIAL', 'UVC', 'RTSP', 'WMS', 'SIMULATED']),
        status: (0, runtime_1.enumValue)(input.status, 'stationDevice.status', exports.stationDeviceStatuses),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'stationDevice.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'stationDevice.updatedAt'),
    };
});
exports.deviceCredentialDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'deviceCredential', [
        'id', 'object', 'schemaVersion', 'edgeAgentId', 'publicKeySpkiSha256', 'keyStorage', 'status', 'createdAt', 'updatedAt',
    ]);
    (0, runtime_1.literalValue)(input.object, 'deviceCredential.object', 'device_credential');
    (0, runtime_1.literalValue)(input.schemaVersion, 'deviceCredential.schemaVersion', 1);
    return {
        id: parseEnterpriseResourceId('device_credential', input.id, 'deviceCredential.id'),
        object: 'device_credential',
        schemaVersion: 1,
        edgeAgentId: parseEnterpriseResourceId('edge_agent', input.edgeAgentId, 'deviceCredential.edgeAgentId'),
        publicKeySpkiSha256: (0, runtime_1.sha256Value)(input.publicKeySpkiSha256, 'deviceCredential.publicKeySpkiSha256'),
        keyStorage: (0, runtime_1.enumValue)(input.keyStorage, 'deviceCredential.keyStorage', exports.deviceCredentialKeyStorage),
        status: (0, runtime_1.enumValue)(input.status, 'deviceCredential.status', exports.deviceCredentialStatuses),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'deviceCredential.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'deviceCredential.updatedAt'),
    };
});
exports.fulfillmentSessionDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'fulfillmentSession', [
        'id', 'object', 'schemaVersion', 'organizationId', 'siteId', 'stationId', 'transactionId', 'edgeAgentId', 'externalOrderId',
        'expectedItems', 'expectedTrackingNumber', 'authorizedDeviceIds', 'requiredEvidence', 'openedAt', 'captureWindowEndsAt',
        'state', 'policyId', 'policyVersion', 'acquisitionClass', 'operatingMode', 'createdAt', 'updatedAt',
    ]);
    (0, runtime_1.literalValue)(input.object, 'fulfillmentSession.object', 'fulfillment_session');
    (0, runtime_1.literalValue)(input.schemaVersion, 'fulfillmentSession.schemaVersion', 1);
    const policy = resolveWorkflowPolicy((0, runtime_1.stringValue)(input.policyId, 'fulfillmentSession.policyId', { min: 8, max: 80 }));
    const result = {
        id: parseEnterpriseResourceId('fulfillment_session', input.id, 'fulfillmentSession.id'),
        object: 'fulfillment_session',
        schemaVersion: 1,
        organizationId: (0, common_1.parseResourceId)('organization', input.organizationId, 'fulfillmentSession.organizationId'),
        siteId: parseEnterpriseResourceId('enterprise_site', input.siteId, 'fulfillmentSession.siteId'),
        stationId: parseEnterpriseResourceId('packing_station', input.stationId, 'fulfillmentSession.stationId'),
        transactionId: input.transactionId === undefined || input.transactionId === null
            ? null
            : (0, common_1.parseResourceId)('transaction', input.transactionId, 'fulfillmentSession.transactionId', { allowLegacy: true }),
        edgeAgentId: input.edgeAgentId === undefined || input.edgeAgentId === null
            ? null
            : parseEnterpriseResourceId('edge_agent', input.edgeAgentId, 'fulfillmentSession.edgeAgentId'),
        externalOrderId: (0, runtime_1.stringValue)(input.externalOrderId, 'fulfillmentSession.externalOrderId', { min: 1, max: 160, pattern: identifierPattern }),
        expectedItems: (0, runtime_1.arrayValue)(input.expectedItems, 'fulfillmentSession.expectedItems', { min: 0, max: 200, parse: parseExpectedItem }),
        expectedTrackingNumber: (0, runtime_1.optionalString)(input.expectedTrackingNumber, 'fulfillmentSession.expectedTrackingNumber', { min: 3, max: 160 }),
        authorizedDeviceIds: (0, runtime_1.arrayValue)(input.authorizedDeviceIds, 'fulfillmentSession.authorizedDeviceIds', {
            min: 1,
            max: 24,
            parse: (item, path) => parseEnterpriseResourceId('station_device', item, path),
            uniqueBy: (item) => item,
        }),
        requiredEvidence: (0, runtime_1.arrayValue)(input.requiredEvidence, 'fulfillmentSession.requiredEvidence', {
            min: 1,
            max: exports.enterpriseRequirementKeys.length,
            parse: (item, path) => (0, runtime_1.enumValue)(item, path, exports.enterpriseRequirementKeys),
            uniqueBy: (item) => item,
        }),
        openedAt: (0, runtime_1.optionalIsoDateTime)(input.openedAt, 'fulfillmentSession.openedAt'),
        captureWindowEndsAt: (0, runtime_1.isoDateTime)(input.captureWindowEndsAt, 'fulfillmentSession.captureWindowEndsAt'),
        state: (0, runtime_1.enumValue)(input.state, 'fulfillmentSession.state', exports.fulfillmentSessionStatuses),
        policyId: policy.policyId,
        policyVersion: (0, runtime_1.stringValue)(input.policyVersion, 'fulfillmentSession.policyVersion', { min: 1, max: 32, pattern: /^[0-9A-Za-z._-]+$/ }),
        acquisitionClass: (0, runtime_1.enumValue)(input.acquisitionClass, 'fulfillmentSession.acquisitionClass', exports.acquisitionClasses),
        operatingMode: (0, runtime_1.enumValue)(input.operatingMode, 'fulfillmentSession.operatingMode', exports.enterpriseOperatingModes),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'fulfillmentSession.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'fulfillmentSession.updatedAt'),
    };
    if (result.policyVersion !== policy.policyVersion) {
        throw new runtime_1.DomainValidationError({ path: 'fulfillmentSession.policyVersion', code: 'FORMAT', message: 'must match the frozen policy version' });
    }
    if (['STATION_BOUND', 'ACQUIRING', 'PACKING_COMPLETE', 'FINALIZING', 'EVIDENCE_READY', 'RELEASED'].includes(result.state) && !result.edgeAgentId) {
        throw new runtime_1.DomainValidationError({ path: 'fulfillmentSession.edgeAgentId', code: 'REQUIRED', message: 'a bound fulfillment session requires an Edge agent' });
    }
    return result;
});
exports.enterpriseEvidenceSessionDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'enterpriseEvidenceSession', [
        'id', 'object', 'schemaVersion', 'organizationId', 'siteId', 'stationId', 'edgeAgentId', 'transactionId', 'fulfillmentSessionId',
        'allowedDeviceIds', 'allowedArtifactTypes', 'maxArtifacts', 'captureWindowEndsAt', 'policyId', 'status', 'createdAt', 'updatedAt',
    ]);
    (0, runtime_1.literalValue)(input.object, 'enterpriseEvidenceSession.object', 'enterprise_evidence_session');
    (0, runtime_1.literalValue)(input.schemaVersion, 'enterpriseEvidenceSession.schemaVersion', 1);
    const result = {
        id: parseEnterpriseResourceId('enterprise_evidence_session', input.id, 'enterpriseEvidenceSession.id'),
        object: 'enterprise_evidence_session',
        schemaVersion: 1,
        organizationId: (0, common_1.parseResourceId)('organization', input.organizationId, 'enterpriseEvidenceSession.organizationId'),
        siteId: parseEnterpriseResourceId('enterprise_site', input.siteId, 'enterpriseEvidenceSession.siteId'),
        stationId: parseEnterpriseResourceId('packing_station', input.stationId, 'enterpriseEvidenceSession.stationId'),
        edgeAgentId: parseEnterpriseResourceId('edge_agent', input.edgeAgentId, 'enterpriseEvidenceSession.edgeAgentId'),
        transactionId: (0, common_1.parseResourceId)('transaction', input.transactionId, 'enterpriseEvidenceSession.transactionId', { allowLegacy: true }),
        fulfillmentSessionId: parseEnterpriseResourceId('fulfillment_session', input.fulfillmentSessionId, 'enterpriseEvidenceSession.fulfillmentSessionId'),
        allowedDeviceIds: (0, runtime_1.arrayValue)(input.allowedDeviceIds, 'enterpriseEvidenceSession.allowedDeviceIds', {
            min: 1,
            max: 24,
            parse: (item, path) => parseEnterpriseResourceId('station_device', item, path),
            uniqueBy: (item) => item,
        }),
        allowedArtifactTypes: (0, runtime_1.arrayValue)(input.allowedArtifactTypes, 'enterpriseEvidenceSession.allowedArtifactTypes', {
            min: 1,
            max: exports.enterpriseArtifactTypes.length,
            parse: (item, path) => (0, runtime_1.enumValue)(item, path, exports.enterpriseArtifactTypes),
            uniqueBy: (item) => item,
        }),
        maxArtifacts: (0, runtime_1.integerValue)(input.maxArtifacts, 'enterpriseEvidenceSession.maxArtifacts', 1, 24),
        captureWindowEndsAt: (0, runtime_1.isoDateTime)(input.captureWindowEndsAt, 'enterpriseEvidenceSession.captureWindowEndsAt'),
        policyId: resolveWorkflowPolicy((0, runtime_1.stringValue)(input.policyId, 'enterpriseEvidenceSession.policyId', { min: 8, max: 80 })).policyId,
        status: (0, runtime_1.enumValue)(input.status, 'enterpriseEvidenceSession.status', ['ISSUED', 'ACTIVE', 'EXHAUSTED', 'EXPIRED', 'REVOKED']),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'enterpriseEvidenceSession.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'enterpriseEvidenceSession.updatedAt'),
    };
    return result;
});
function parseRollingCapture(value, path) {
    const input = (0, runtime_1.strictObject)(value, path, [
        'captureSource', 'sourceStreamId', 'segmentStart', 'segmentEnd', 'preRollDurationMs', 'postRollDurationMs',
        'codec', 'originalSegmentHashes', 'assemblyMethod', 'captureKind',
    ]);
    const provenance = {
        captureSource: (0, runtime_1.enumValue)(input.captureSource, `${path}.captureSource`, exports.acquisitionClasses),
        sourceStreamId: (0, runtime_1.stringValue)(input.sourceStreamId, `${path}.sourceStreamId`, { min: 3, max: 160, pattern: identifierPattern }),
        segmentStart: (0, runtime_1.isoDateTime)(input.segmentStart, `${path}.segmentStart`),
        segmentEnd: (0, runtime_1.isoDateTime)(input.segmentEnd, `${path}.segmentEnd`),
        preRollDurationMs: (0, runtime_1.integerValue)(input.preRollDurationMs, `${path}.preRollDurationMs`, 0, 120_000),
        postRollDurationMs: (0, runtime_1.integerValue)(input.postRollDurationMs, `${path}.postRollDurationMs`, 0, 120_000),
        codec: (0, runtime_1.stringValue)(input.codec, `${path}.codec`, { min: 3, max: 40, pattern: /^[A-Za-z0-9._-]+$/ }),
        originalSegmentHashes: (0, runtime_1.arrayValue)(input.originalSegmentHashes, `${path}.originalSegmentHashes`, {
            min: 1,
            max: 64,
            parse: (item, itemPath) => (0, runtime_1.sha256Value)(item, itemPath),
            uniqueBy: (item) => item,
        }),
        assemblyMethod: (0, runtime_1.enumValue)(input.assemblyMethod, `${path}.assemblyMethod`, ['DETERMINISTIC_CHUNK_CONCAT', 'CAMERA_ORIGINAL_FILE']),
        captureKind: (0, runtime_1.enumValue)(input.captureKind, `${path}.captureKind`, ['DERIVED_TRANSACTION_SEGMENT', 'CAMERA_ORIGINAL_FILE']),
    };
    assertRollingCaptureProvenance(provenance);
    return provenance;
}
exports.enterpriseArtifactDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'enterpriseArtifact', [
        'id', 'object', 'schemaVersion', 'fulfillmentSessionId', 'evidenceSessionId', 'type', 'status', 'acquisitionClass',
        'contentType', 'sizeBytes', 'sha256', 'rollingCapture', 'uploadId', 'manifestSha256', 'evidenceBundleSha256',
        'attestationStatus', 'serverFinalizedAt', 'createdAt', 'updatedAt',
    ]);
    (0, runtime_1.literalValue)(input.object, 'enterpriseArtifact.object', 'enterprise_artifact');
    (0, runtime_1.literalValue)(input.schemaVersion, 'enterpriseArtifact.schemaVersion', 1);
    const result = {
        id: parseEnterpriseResourceId('enterprise_artifact', input.id, 'enterpriseArtifact.id'),
        object: 'enterprise_artifact',
        schemaVersion: 1,
        fulfillmentSessionId: parseEnterpriseResourceId('fulfillment_session', input.fulfillmentSessionId, 'enterpriseArtifact.fulfillmentSessionId'),
        evidenceSessionId: input.evidenceSessionId === undefined || input.evidenceSessionId === null
            ? null
            : parseEnterpriseResourceId('enterprise_evidence_session', input.evidenceSessionId, 'enterpriseArtifact.evidenceSessionId'),
        type: (0, runtime_1.enumValue)(input.type, 'enterpriseArtifact.type', exports.enterpriseArtifactTypes),
        status: (0, runtime_1.enumValue)(input.status, 'enterpriseArtifact.status', exports.enterpriseArtifactStatuses),
        acquisitionClass: (0, runtime_1.enumValue)(input.acquisitionClass, 'enterpriseArtifact.acquisitionClass', exports.acquisitionClasses),
        contentType: (0, runtime_1.stringValue)(input.contentType, 'enterpriseArtifact.contentType', { min: 3, max: 200, pattern: /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i }),
        sizeBytes: (0, runtime_1.integerValue)(input.sizeBytes, 'enterpriseArtifact.sizeBytes', 1, 20_000_000_000),
        sha256: (0, runtime_1.sha256Value)(input.sha256, 'enterpriseArtifact.sha256'),
        rollingCapture: input.rollingCapture === undefined || input.rollingCapture === null ? null : parseRollingCapture(input.rollingCapture, 'enterpriseArtifact.rollingCapture'),
        uploadId: (0, runtime_1.optionalString)(input.uploadId, 'enterpriseArtifact.uploadId', { min: 8, max: 128, pattern: /^[A-Za-z0-9_-]+$/ }),
        manifestSha256: input.manifestSha256 === undefined || input.manifestSha256 === null ? null : (0, runtime_1.sha256Value)(input.manifestSha256, 'enterpriseArtifact.manifestSha256'),
        evidenceBundleSha256: input.evidenceBundleSha256 === undefined || input.evidenceBundleSha256 === null ? null : (0, runtime_1.sha256Value)(input.evidenceBundleSha256, 'enterpriseArtifact.evidenceBundleSha256'),
        attestationStatus: (0, runtime_1.optionalString)(input.attestationStatus, 'enterpriseArtifact.attestationStatus', { min: 3, max: 80, pattern: /^[A-Z0-9_]+$/ }),
        serverFinalizedAt: (0, runtime_1.optionalIsoDateTime)(input.serverFinalizedAt, 'enterpriseArtifact.serverFinalizedAt'),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'enterpriseArtifact.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'enterpriseArtifact.updatedAt'),
    };
    if (result.type === 'STATION_PACKING_VIDEO' && !result.rollingCapture) {
        throw new runtime_1.DomainValidationError({ path: 'enterpriseArtifact.rollingCapture', code: 'REQUIRED', message: 'station packing video must record rolling-capture provenance' });
    }
    if (['FINALIZED', 'QUARANTINED'].includes(result.status) && (!result.serverFinalizedAt || !result.manifestSha256 || !result.evidenceBundleSha256 || !result.attestationStatus)) {
        throw new runtime_1.DomainValidationError({ path: 'enterpriseArtifact.status', code: 'REQUIRED', message: 'server-finalized artifacts require a finalization time, manifest digest, bundle digest and attestation status' });
    }
    if (result.status === 'FINALIZED' && result.attestationStatus && result.attestationStatus.startsWith('ONLINE_APP_CHECK')) {
        throw new runtime_1.DomainValidationError({ path: 'enterpriseArtifact.attestationStatus', code: 'FORMAT', message: 'Enterprise artifacts must not inherit native App Check attestation' });
    }
    if (!['FINALIZED', 'QUARANTINED'].includes(result.status) && result.serverFinalizedAt) {
        throw new runtime_1.DomainValidationError({ path: 'enterpriseArtifact.serverFinalizedAt', code: 'FORMAT', message: 'is only valid after server finalization or quarantine' });
    }
    return result;
});
exports.hardwareObservationDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'hardwareObservation', [
        'id', 'object', 'schemaVersion', 'fulfillmentSessionId', 'deviceId', 'type', 'acquisitionClass', 'normalizedValue',
        'grams', 'rawValueHash', 'monotonicTimestampMs', 'createdAt', 'updatedAt',
    ]);
    (0, runtime_1.literalValue)(input.object, 'hardwareObservation.object', 'hardware_observation');
    (0, runtime_1.literalValue)(input.schemaVersion, 'hardwareObservation.schemaVersion', 1);
    const result = {
        id: parseEnterpriseResourceId('hardware_observation', input.id, 'hardwareObservation.id'),
        object: 'hardware_observation',
        schemaVersion: 1,
        fulfillmentSessionId: parseEnterpriseResourceId('fulfillment_session', input.fulfillmentSessionId, 'hardwareObservation.fulfillmentSessionId'),
        deviceId: parseEnterpriseResourceId('station_device', input.deviceId, 'hardwareObservation.deviceId'),
        type: (0, runtime_1.enumValue)(input.type, 'hardwareObservation.type', exports.enterpriseObservationTypes),
        acquisitionClass: (0, runtime_1.enumValue)(input.acquisitionClass, 'hardwareObservation.acquisitionClass', exports.acquisitionClasses),
        normalizedValue: (0, runtime_1.optionalString)(input.normalizedValue, 'hardwareObservation.normalizedValue', { min: 1, max: 160 }),
        grams: input.grams === undefined || input.grams === null ? null : (0, runtime_1.integerValue)(input.grams, 'hardwareObservation.grams', 0, 1_000_000_000),
        rawValueHash: (0, runtime_1.sha256Value)(input.rawValueHash, 'hardwareObservation.rawValueHash'),
        monotonicTimestampMs: (0, runtime_1.integerValue)(input.monotonicTimestampMs, 'hardwareObservation.monotonicTimestampMs', 0, Number.MAX_SAFE_INTEGER),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'hardwareObservation.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'hardwareObservation.updatedAt'),
    };
    if (result.type === 'PACKAGE_WEIGHT_OBSERVATION' && result.grams === null) {
        throw new runtime_1.DomainValidationError({ path: 'hardwareObservation.grams', code: 'REQUIRED', message: 'weight observations require grams' });
    }
    if (result.type !== 'PACKAGE_WEIGHT_OBSERVATION' && !result.normalizedValue) {
        throw new runtime_1.DomainValidationError({ path: 'hardwareObservation.normalizedValue', code: 'REQUIRED', message: 'barcode observations require a normalized value' });
    }
    return result;
});
exports.enterpriseResourceContracts = {
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
function assertEnterpriseResourceCatalogComplete() {
    const entries = Object.entries(exports.enterpriseResourceContracts);
    if (entries.length !== exports.enterpriseResourceKinds.length) {
        throw new Error(`Expected ${exports.enterpriseResourceKinds.length} enterprise resource contracts; received ${entries.length}.`);
    }
    for (const [key, contract] of entries) {
        if (contract.kind !== key || contract.schemaVersion !== 1 || !contract.auditEvents.length || !contract.persistencePath) {
            throw new Error(`Enterprise resource contract ${key} is incomplete.`);
        }
    }
}
//# sourceMappingURL=enterprise.js.map