"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMyEvidenceSession = exports.redeemEvidenceSession = exports.claimParticipantInvitation = void 0;
const node_crypto_1 = require("node:crypto");
const https_1 = require("firebase-functions/v2/https");
const participant_capture_service_1 = require("./application/v1/participant-capture-service");
const config_1 = require("./config");
const core_1 = require("./api/v1/core");
const controls_1 = require("./api/v1/controls");
const security_1 = require("./api/v1/security");
const validation_1 = require("./api/v1/validation");
const participant_handoff_token_issuer_1 = require("./infrastructure/crypto/participant-handoff-token-issuer");
const callable_errors_1 = require("./infrastructure/firebase/v1/callable-errors");
const participant_capture_repository_1 = require("./infrastructure/firebase/v1/participant-capture-repository");
const helpers_1 = require("./helpers");
function configuredEnvironment() {
    const value = config_1.apiEnvironment.value();
    if (value !== 'sandbox' && value !== 'live')
        throw new Error('API_ENVIRONMENT must be sandbox or live.');
    return value;
}
function service() {
    return new participant_capture_service_1.ParticipantCaptureApplicationService(new participant_capture_repository_1.FirestoreParticipantCaptureRepository(config_1.db), new participant_handoff_token_issuer_1.HmacParticipantHandoffTokenIssuer(() => config_1.participantHandoffSigningSecret.value()), new controls_1.FirestoreAuditWriter(config_1.db), new security_1.AuthorizationService(), { get environment() { return configuredEnvironment(); } });
}
function validation(parse) {
    try {
        return parse();
    }
    catch (error) {
        if (error instanceof core_1.ApiError) {
            throw new https_1.HttpsError('invalid-argument', error.message, { applicationCode: error.code, details: error.details });
        }
        throw error;
    }
}
exports.claimParticipantInvitation = (0, https_1.onCall)({
    enforceAppCheck: true,
    secrets: [config_1.participantHandoffSigningSecret],
}, async (request) => {
    const actorId = (0, helpers_1.requireUid)(request);
    if (!request.app?.appId)
        throw new https_1.HttpsError('failed-precondition', 'App Check attestation was not available.');
    await (0, helpers_1.assertAccountActive)(actorId);
    const input = validation(() => (0, validation_1.parseClaimParticipant)(request.data));
    try {
        return await service().claimParticipant({
            principal: { type: 'PACKPROOF_USER', actorId, appId: request.app.appId },
            claimId: input.claimId,
            token: input.token,
            requestId: (0, node_crypto_1.randomUUID)(),
        });
    }
    catch (error) {
        (0, callable_errors_1.throwCallableError)(error);
    }
});
exports.redeemEvidenceSession = (0, https_1.onCall)({
    enforceAppCheck: true,
    consumeAppCheckToken: true,
    secrets: [config_1.participantHandoffSigningSecret],
}, async (request) => {
    const actorId = (0, helpers_1.requireUid)(request);
    if (!request.app?.appId)
        throw new https_1.HttpsError('failed-precondition', 'App Check attestation was not available.');
    if (request.app.alreadyConsumed)
        throw new https_1.HttpsError('failed-precondition', 'The App Check token was already used. Refresh and try again.');
    await (0, helpers_1.assertAccountActive)(actorId);
    if (!request.data || typeof request.data !== 'object' || Array.isArray(request.data)) {
        throw new https_1.HttpsError('invalid-argument', 'Request data must be an object.');
    }
    const record = request.data;
    const evidenceSessionId = validation(() => (0, validation_1.parseEvidenceSessionId)(record.evidenceSessionId));
    const input = validation(() => (0, validation_1.parseRedeemEvidenceSession)({
        schemaVersion: record.schemaVersion,
        operationKey: record.operationKey,
        token: record.token,
        runtimeArtifactHash: record.runtimeArtifactHash,
    }));
    try {
        return await service().redeemEvidenceSession({
            principal: { type: 'PACKPROOF_USER', actorId, appId: request.app.appId },
            evidenceSessionId,
            input,
            requestId: (0, node_crypto_1.randomUUID)(),
        });
    }
    catch (error) {
        (0, callable_errors_1.throwCallableError)(error);
    }
});
exports.getMyEvidenceSession = (0, https_1.onCall)({
    enforceAppCheck: true,
    secrets: [config_1.participantHandoffSigningSecret],
}, async (request) => {
    const actorId = (0, helpers_1.requireUid)(request);
    if (!request.app?.appId)
        throw new https_1.HttpsError('failed-precondition', 'App Check attestation was not available.');
    await (0, helpers_1.assertAccountActive)(actorId);
    const evidenceSessionId = validation(() => (0, validation_1.parseEvidenceSessionId)(request.data && typeof request.data === 'object' && !Array.isArray(request.data)
        ? request.data.evidenceSessionId
        : undefined));
    try {
        return await service().getEvidenceSessionForActor({ type: 'PACKPROOF_USER', actorId, appId: request.app.appId }, evidenceSessionId);
    }
    catch (error) {
        (0, callable_errors_1.throwCallableError)(error);
    }
});
//# sourceMappingURL=participant-capture-callables.js.map