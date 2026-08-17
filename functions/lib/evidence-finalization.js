"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hmacManifestSigner = hmacManifestSigner;
exports.acquisitionClassOf = acquisitionClassOf;
exports.attestationStatusForGrant = attestationStatusForGrant;
exports.uploaderAuthorizedForGrant = uploaderAuthorizedForGrant;
exports.uploaderRoleForGrant = uploaderRoleForGrant;
exports.assuranceForFinalization = assuranceForFinalization;
exports.finalizeReceivedEvidence = finalizeReceivedEvidence;
exports.sha256Bytes = sha256Bytes;
const node_crypto_1 = require("node:crypto");
const evidence_format_1 = require("./evidence-format");
function hmacManifestSigner(secret, keyId) {
    return {
        keyId,
        sign(canonicalJson) {
            return (0, node_crypto_1.createHmac)('sha256', secret).update(canonicalJson).digest('base64url');
        },
    };
}
function acquisitionClassOf(value) {
    if (value === 'NATIVE_MOBILE' || value === 'ENTERPRISE_EDGE' || value === 'EXTERNAL_DECLARED')
        return value;
    return null;
}
function attestationStatusForGrant(pending) {
    if (pending.attestationSnapshot?.mode === 'ENTERPRISE_EDGE') {
        return pending.attestationSnapshot.deviceKeySignatureValid === true
            ? 'ENTERPRISE_EDGE_CERTIFICATE'
            : 'ENTERPRISE_EDGE_INSTALLATION';
    }
    if (pending.attestationSnapshot?.mode === 'JIT_APP_CHECK') {
        return pending.attestationSnapshot.deviceKeySignatureValid === true
            ? 'ONLINE_APP_CHECK_AND_KEY_POSSESSION'
            : 'ONLINE_APP_CHECK_ONLY';
    }
    if (pending.clientManifest)
        return 'OFFLINE_UNATTESTED';
    return 'NOT_PROVIDED';
}
function uploaderAuthorizedForGrant(input) {
    if (input.pending.acquisitionClass === 'ENTERPRISE_EDGE') {
        return Boolean(input.pending.edgeAgentId) && input.pending.edgeAgentId === input.uploaderId;
    }
    return input.participantIds.includes(input.uploaderId);
}
function uploaderRoleForGrant(input) {
    if (input.pending.acquisitionClass === 'ENTERPRISE_EDGE')
        return 'ENTERPRISE_STATION';
    return input.sellerId === input.uploaderId ? 'SELLER' : 'BUYER';
}
function assuranceForFinalization(input) {
    const byteMismatch = input.clientHashMatched === false || input.clientSizeMatched === false || !input.contentTypeMatched;
    const manifest = input.clientManifest;
    return {
        acquisitionQuality: {
            status: manifest?.acquisitionQuality?.status ?? 'NOT_EVALUATED',
            reasonCodes: manifest?.acquisitionQuality?.reasonCodes ?? ['NO_CALIBRATED_QUALITY_GATE'],
        },
        appDeviceContext: {
            status: input.attestationStatus,
            reasonCodes: [
                ...(input.attestationStatus === 'OFFLINE_UNATTESTED'
                    ? manifest?.attestation?.reasonCodes ?? ['NO_FRESH_ONLINE_ATTESTATION']
                    : input.attestationStatus === 'ONLINE_APP_CHECK_ONLY'
                        ? ['DEVICE_KEY_PROOF_NOT_AVAILABLE']
                        : input.attestationStatus === 'ENTERPRISE_EDGE_INSTALLATION' || input.attestationStatus === 'ENTERPRISE_EDGE_CERTIFICATE'
                            ? ['NOT_NATIVE_APP_CHECK']
                            : []),
                ...(input.clientTimeConsistencyStatus === 'INCONSISTENT' ? ['CLIENT_WALL_MONOTONIC_DURATION_MISMATCH'] : []),
            ],
        },
        byteIntegrity: {
            status: byteMismatch ? 'MISMATCH' : input.clientHashMatched === true && input.clientSizeMatched === true ? 'MATCHED' : 'SERVER_HASH_ONLY',
            reasonCodes: [
                ...(input.clientHashMatched === false ? ['CLIENT_SERVER_HASH_MISMATCH'] : []),
                ...(input.clientSizeMatched === false ? ['CLIENT_SERVER_SIZE_MISMATCH'] : []),
                ...(!input.contentTypeMatched ? ['DECLARED_MEDIA_TYPE_MISMATCH'] : []),
            ],
        },
        physicalCorrespondence: {
            status: 'NOT_AVAILABLE',
            reasonCodes: ['NO_VALIDATED_PHYSICAL_MATCHER_ENABLED'],
        },
        carrierContext: {
            status: input.carrierStatus,
            reasonCodes: input.carrierStatus === 'MISMATCH' ? ['OBSERVED_TRACKING_DOES_NOT_MATCH_EXPECTED_CONTEXT'] : [],
        },
        businessLegalRelevance: {
            status: 'REVIEW_REQUIRED',
            reasonCodes: ['EXTERNAL_POLICY_AND_HUMAN_INTERPRETATION_REQUIRED'],
        },
    };
}
function finalizeReceivedEvidence(input) {
    const digest = input.digest ?? (input.bytes ? (0, evidence_format_1.sha256Hex)(input.bytes) : '');
    if (!digest)
        throw new Error('finalizeReceivedEvidence requires received bytes or a precomputed digest.');
    const detectedContentType = input.detectedContentType ?? (input.bytes ? (0, evidence_format_1.detectSupportedMediaType)(input.bytes.subarray(0, 32)) : null);
    const contentTypeMatched = detectedContentType === input.object.contentType;
    const clientSha256 = input.pending.clientSha256;
    const clientHashMatched = clientSha256 ? clientSha256 === digest : null;
    const clientSizeBytes = input.pending.clientSizeBytes;
    const clientSizeMatched = clientSizeBytes !== null ? clientSizeBytes === input.object.size : null;
    const attestationStatus = attestationStatusForGrant(input.pending);
    const carrierTrackingMatchStatus = input.pending.carrierContext?.matchStatus ?? 'NOT_SCANNED';
    const clientManifest = input.pending.clientManifest;
    const clientWallDurationMs = clientManifest
        ? Date.parse(String(clientManifest.captureFinishedAt)) - Date.parse(String(clientManifest.captureStartedAt))
        : null;
    const clientMonotonicElapsedMs = typeof clientManifest?.time === 'object' && clientManifest.time && 'monotonicElapsedMs' in clientManifest.time
        ? Number(clientManifest.time.monotonicElapsedMs)
        : null;
    const clientTimeConsistencyStatus = clientWallDurationMs === null || Number.isNaN(clientWallDurationMs)
        ? 'NOT_PROVIDED'
        : clientMonotonicElapsedMs === null || Number.isNaN(clientMonotonicElapsedMs)
            ? 'NO_MONOTONIC_REFERENCE'
            : Math.abs(clientWallDurationMs - clientMonotonicElapsedMs) <= 5_000
                ? 'CONSISTENT_WITHIN_5_SECONDS'
                : 'INCONSISTENT';
    const assurance = assuranceForFinalization({
        clientManifest,
        attestationStatus,
        clientHashMatched,
        clientSizeMatched,
        contentTypeMatched,
        carrierStatus: carrierTrackingMatchStatus,
        clientTimeConsistencyStatus,
    });
    const runtimeIntegrity = clientManifest && typeof clientManifest.runtimeIntegrity === 'object' && clientManifest.runtimeIntegrity
        ? clientManifest.runtimeIntegrity
        : null;
    const unsignedManifest = {
        schemaVersion: evidence_format_1.EVIDENCE_MANIFEST_SCHEMA_VERSION,
        format: {
            canonicalizationProfile: evidence_format_1.CANONICALIZATION_PROFILE,
            canonicalizationStandard: 'RFC8785_JCS',
            bundleBindingProfile: evidence_format_1.BUNDLE_BINDING_PROFILE,
        },
        evidence: {
            uploadId: input.pending.uploadId,
            clientEvidenceId: input.pending.clientEvidenceId,
            transactionId: input.pending.transactionId,
            uploaderId: input.pending.uploaderId,
            uploaderRole: input.uploaderRole,
            evidenceType: input.pending.evidenceType,
            acquisitionClass: input.pending.acquisitionClass,
            returnPassportId: input.pending.returnPassportId,
            connectSessionId: input.pending.connectSessionId,
            originalName: input.pending.originalName,
            declaredContentType: input.object.contentType,
            detectedContentType,
            sizeBytes: input.object.size,
            sha256: digest,
            storageGeneration: input.object.generation,
        },
        capture: clientManifest,
        appDeviceContext: input.pending.attestationSnapshot,
        carrierContext: input.pending.carrierContext,
        serverReceipt: {
            bucket: input.object.bucket,
            storagePath: input.object.storagePath,
            storageGeneration: input.object.generation,
            receivedAt: input.object.timeCreated,
            ingressNetwork: input.pending.ingressNetwork,
        },
        verification: {
            serverHashAlgorithm: 'SHA-256',
            clientSha256,
            clientHashMatched,
            clientSizeBytes,
            clientSizeMatched,
            declaredContentType: input.object.contentType,
            detectedContentType,
            contentTypeMatched,
            attestationStatus,
            runtimeIntegrityScope: runtimeIntegrity?.integrityScope ?? null,
            clientWallDurationMs,
            clientMonotonicElapsedMs,
            clientTimeConsistencyStatus,
        },
        assurance,
        governance: {
            accessClass: 'TRANSACTION_PARTICIPANTS',
            retentionPolicyId: 'DEFAULT_UNCONFIGURED',
            legalHoldStatus: 'NOT_EVALUATED',
        },
        authentication: {
            type: 'SERVICE_MAC',
            algorithm: 'HMAC-SHA256',
            keyId: input.signer.keyId,
            verificationScope: 'PACKPROOF_SERVICE_ONLY',
            publicVerificationAvailable: false,
        },
    };
    const manifestJson = (0, evidence_format_1.canonicalizeJson)(unsignedManifest);
    const manifestSha256 = (0, evidence_format_1.sha256Hex)(manifestJson);
    const evidenceBundleSha256 = (0, evidence_format_1.createEvidenceBundleSha256)(digest, manifestSha256);
    const manifestMacBase64url = input.signer.sign(manifestJson);
    const integrityAccepted = clientHashMatched !== false && clientSizeMatched !== false && contentTypeMatched;
    return {
        digest,
        detectedContentType,
        contentTypeMatched,
        clientHashMatched,
        clientSizeMatched,
        attestationStatus,
        assurance,
        carrierTrackingMatchStatus,
        clientTimeConsistencyStatus,
        integrityAccepted,
        manifestJson,
        manifestSha256,
        evidenceBundleSha256,
        manifestMacBase64url,
        acquisitionClass: input.pending.acquisitionClass,
    };
}
function sha256Bytes(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value).digest('hex');
}
//# sourceMappingURL=evidence-finalization.js.map