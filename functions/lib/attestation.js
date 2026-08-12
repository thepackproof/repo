"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.beginCaptureSession = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const config_1 = require("./config");
const helpers_1 = require("./helpers");
const validation_1 = require("./validation");
exports.beginCaptureSession = (0, https_1.onCall)({ enforceAppCheck: true, consumeAppCheckToken: true }, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    if (!request.app)
        throw new https_1.HttpsError('failed-precondition', 'Device attestation was not available.');
    if (request.app.alreadyConsumed)
        throw new https_1.HttpsError('failed-precondition', 'The device attestation token was already used. Refresh and try again.');
    const input = validation_1.captureSessionSchema.parse(request.data);
    const { data } = await (0, helpers_1.getTransaction)(input.transactionId);
    (0, helpers_1.assertParticipant)(data, uid);
    if (input.returnPassportId) {
        const returnSnap = await config_1.db.collection('transactions').doc(input.transactionId).collection('returns').doc(input.returnPassportId).get();
        if (!returnSnap.exists || !returnSnap.data()?.participantIds?.includes(uid)) {
            throw new https_1.HttpsError('permission-denied', 'Return passport not found for this participant.');
        }
    }
    if (input.connectSessionId && data.source?.connectSessionId !== input.connectSessionId) {
        throw new https_1.HttpsError('permission-denied', 'PackProof Connect session mismatch.');
    }
    if (input.requestedEvidenceCount > 1) {
        if (input.requestedEvidenceCount !== 15 || input.captureProfileId !== 'PP-PHYSICAL-MATTE-V1' || !input.captureGroupId) {
            throw new https_1.HttpsError('invalid-argument', 'Batch capture requires the frozen 15-frame physical profile and a capture group identifier.');
        }
    }
    else if (input.captureProfileId || input.captureGroupId) {
        throw new https_1.HttpsError('invalid-argument', 'Capture profile and group identifiers are reserved for an approved batch profile.');
    }
    const ref = config_1.db.collection('captureSessions').doc();
    const sessionMode = input.requestedEvidenceCount > 1 ? 'BATCH' : 'SINGLE';
    const nonce = (0, helpers_1.randomToken)(32);
    const issuedAt = new Date();
    const captureWindowEndsAt = new Date(Date.now() + 10 * 60_000);
    await ref.set({
        id: ref.id,
        uid,
        transactionId: input.transactionId,
        returnPassportId: input.returnPassportId ?? null,
        connectSessionId: input.connectSessionId ?? null,
        nonce,
        appId: request.app.appId,
        tokenReplayDetected: Boolean(request.app.alreadyConsumed),
        runtimeArtifactHash: input.runtimeArtifactHash ?? null,
        captureProfileId: input.captureProfileId ?? null,
        captureGroupId: input.captureGroupId ?? null,
        sessionMode,
        maxEvidenceCount: input.requestedEvidenceCount,
        requestFingerprints: [],
        uploadBindings: {},
        issuedAt: firestore_1.FieldValue.serverTimestamp(),
        captureWindowEndsAt,
        redemptionExpiresAt: (0, helpers_1.expiresIn)(30 * 86400),
        usedAt: null,
    });
    return {
        mode: 'JIT_APP_CHECK',
        captureSessionId: ref.id,
        nonce,
        appId: request.app.appId,
        issuedAt: issuedAt.toISOString(),
        captureWindowEndsAt: captureWindowEndsAt.toISOString(),
        tokenReplayDetected: false,
        reasonCodes: [],
        sessionMode,
        maxEvidenceCount: input.requestedEvidenceCount,
        captureGroupId: input.captureGroupId ?? null,
    };
});
//# sourceMappingURL=attestation.js.map