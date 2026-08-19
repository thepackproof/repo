"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectAcquisitionProfiles = exports.strongestAppDeviceContextStatuses = exports.connectEvidenceStatusReasonCodes = exports.connectEvidenceStatuses = void 0;
exports.connectEvidenceIsReady = connectEvidenceIsReady;
exports.connectEvidenceReasonCodes = connectEvidenceReasonCodes;
exports.buildConnectEvidenceFinalizedCallback = buildConnectEvidenceFinalizedCallback;
exports.connectEvidenceStatuses = [
    'DIGITAL_EVIDENCE_READY',
    'DIGITAL_EVIDENCE_WITH_LIMITATIONS',
];
exports.connectEvidenceStatusReasonCodes = [
    'SERVER_FINALIZATION_NOT_RECORDED',
    'STRONGEST_APP_DEVICE_CONTEXT_NOT_AVAILABLE',
    'CLIENT_SERVER_HASH_MATCH_NOT_ESTABLISHED',
    'CLIENT_SERVER_SIZE_MATCH_NOT_ESTABLISHED',
    'DECLARED_MEDIA_TYPE_MATCH_NOT_ESTABLISHED',
    'CARRIER_CONTEXT_REQUIREMENT_NOT_SATISFIED',
    'PHYSICAL_CORRESPONDENCE_NOT_AVAILABLE',
    'BUSINESS_LEGAL_REVIEW_REQUIRED',
];
exports.strongestAppDeviceContextStatuses = [
    'ONLINE_APP_CHECK_AND_KEY_POSSESSION',
    'JIT_VERIFIED',
];
exports.connectAcquisitionProfiles = {
    NATIVE_MOBILE: {
        strongestAttestation: exports.strongestAppDeviceContextStatuses,
    },
    ENTERPRISE_EDGE: {
        strongestAttestation: ['ENTERPRISE_EDGE_CERTIFICATE'],
        additionalRequirements: ['station binding', 'registered device', 'session capability'],
    },
    EXTERNAL_DECLARED: {
        strongestAttestation: [],
    },
};
function connectEvidenceIsReady(input) {
    const trackingSatisfied = input.trackingNumberWasSupplied
        ? input.carrierTrackingMatchStatus === 'MATCHED'
        : input.carrierTrackingMatchStatus !== 'MISMATCH';
    return input.serverFinalized === true
        && exports.strongestAppDeviceContextStatuses.includes(input.attestationStatus)
        && input.clientHashMatched === true
        && input.clientSizeMatched === true
        && input.contentTypeMatched === true
        && input.byteIntegrityStatus !== 'MISMATCH'
        && trackingSatisfied;
}
function connectEvidenceReasonCodes(input) {
    const trackingSatisfied = input.trackingNumberWasSupplied
        ? input.carrierTrackingMatchStatus === 'MATCHED'
        : input.carrierTrackingMatchStatus !== 'MISMATCH';
    return [
        ...(input.serverFinalized === true ? [] : ['SERVER_FINALIZATION_NOT_RECORDED']),
        ...(exports.strongestAppDeviceContextStatuses.includes(input.attestationStatus)
            ? []
            : ['STRONGEST_APP_DEVICE_CONTEXT_NOT_AVAILABLE']),
        ...(input.clientHashMatched === true ? [] : ['CLIENT_SERVER_HASH_MATCH_NOT_ESTABLISHED']),
        ...(input.clientSizeMatched === true ? [] : ['CLIENT_SERVER_SIZE_MATCH_NOT_ESTABLISHED']),
        ...(input.contentTypeMatched === true ? [] : ['DECLARED_MEDIA_TYPE_MATCH_NOT_ESTABLISHED']),
        ...(trackingSatisfied ? [] : ['CARRIER_CONTEXT_REQUIREMENT_NOT_SATISFIED']),
        'PHYSICAL_CORRESPONDENCE_NOT_AVAILABLE',
        'BUSINESS_LEGAL_REVIEW_REQUIRED',
    ];
}
function manifestAuthentication(input) {
    const supplied = input.manifestAuthentication;
    if (supplied && supplied.type === 'SERVICE_MAC' && supplied.macBase64url) {
        return {
            type: 'SERVICE_MAC',
            algorithm: 'HMAC-SHA256',
            keyId: supplied.keyId,
            macBase64url: supplied.macBase64url,
            verificationScope: 'PACKPROOF_SERVICE_ONLY',
        };
    }
    return {
        type: 'LEGACY_SERVICE_MAC',
        macBase64url: typeof supplied?.macBase64url === 'string'
            ? supplied.macBase64url
            : input.legacyManifestMac ?? null,
        verificationScope: 'PACKPROOF_SERVICE_ONLY',
    };
}
function buildConnectEvidenceFinalizedCallback(input) {
    const evidenceStatus = connectEvidenceIsReady(input) ? 'DIGITAL_EVIDENCE_READY' : 'DIGITAL_EVIDENCE_WITH_LIMITATIONS';
    return {
        event: 'packproof.evidence.finalized',
        orderId: input.orderId,
        trackingNumber: input.trackingNumber,
        evidenceStatus,
        statusReasonCodes: connectEvidenceReasonCodes(input),
        fileSha256: input.fileSha256,
        sha256Hash: input.fileSha256,
        manifestSha256: input.manifestSha256,
        evidenceBundleSha256: input.evidenceBundleSha256,
        manifestAuthentication: manifestAuthentication(input),
        assurance: input.assurance,
        attestationStatus: input.attestationStatus,
        carrierTrackingMatchStatus: input.carrierTrackingMatchStatus ?? 'NOT_SCANNED',
        shippingTracker: input.shippingTracker ?? null,
        declaredWeightGrams: input.declaredWeightGrams,
        dossierSha256: input.dossierSha256,
    };
}
//# sourceMappingURL=connect-callback.js.map