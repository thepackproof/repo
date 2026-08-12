"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.completeReturnPassport = exports.markReturnReceived = exports.submitReturnShipping = exports.authorizeReturnPassport = exports.initiateReturnPassport = void 0;
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const config_1 = require("./config");
const helpers_1 = require("./helpers");
const validation_1 = require("./validation");
const callOptions = { enforceAppCheck: true };
function normalizeTracking(value) {
    if (typeof value !== 'string')
        return null;
    const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    return normalized.length >= 3 ? normalized : null;
}
function evidenceReadyForWorkflow(value) {
    if (!value)
        return false;
    if (value.serverFinalized === true) {
        return value.clientHashMatched !== false
            && value.clientSizeMatched !== false
            && value.contentTypeMatched !== false
            && value.assurance?.byteIntegrity?.status !== 'MISMATCH';
    }
    return value.serverVerified === true && value.clientHashMatched !== false;
}
async function getReturnPassport(transactionId, returnPassportId) {
    const ref = config_1.db.collection('transactions').doc(transactionId).collection('returns').doc(returnPassportId);
    const snap = await ref.get();
    if (!snap.exists)
        throw new https_1.HttpsError('not-found', 'Return passport not found.');
    return { ref, data: snap.data() };
}
exports.initiateReturnPassport = (0, https_1.onCall)(callOptions, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    const input = validation_1.returnPassportSchema.parse(request.data);
    const { ref: transactionRef, data } = await (0, helpers_1.getTransaction)(input.transactionId);
    (0, helpers_1.assertParticipant)(data, uid);
    if (!data.buyerId)
        throw new https_1.HttpsError('failed-precondition', 'A return passport requires both transaction participants.');
    if (data.terms.returns === 'NO_RETURNS' && data.status !== 'DISPUTED') {
        throw new https_1.HttpsError('failed-precondition', 'The locked terms do not authorize returns. Raise a concern if the item materially differs from the agreement.');
    }
    if (!['SHIPPED', 'BUYER_REVIEW', 'COMPLETED', 'DISPUTED'].includes(data.status)) {
        throw new https_1.HttpsError('failed-precondition', 'A return passport can begin only after shipment.');
    }
    const active = await transactionRef.collection('returns').where('status', 'in', ['REQUESTED', 'AUTHORIZED', 'PACKED', 'IN_TRANSIT', 'RECEIVED_REVIEW', 'DISPUTED']).limit(1).get();
    if (!active.empty)
        throw new https_1.HttpsError('already-exists', 'An active return passport already exists for this transaction.');
    const evidence = await transactionRef.collection('evidence').get();
    const originalEvidenceHashes = evidence.docs
        .filter((item) => item.data().serverFinalized === true || item.data().serverVerified === true)
        .map((item) => String(item.data().sha256 ?? ''))
        .filter(Boolean);
    // Either party may request the workflow, but a commerce return always moves
    // from the buyer back to the seller. Keep requester and physical roles separate.
    const returningParticipantId = data.buyerId;
    const recipientId = data.sellerId;
    const returnRef = transactionRef.collection('returns').doc();
    await returnRef.set({
        id: returnRef.id,
        transactionId: input.transactionId,
        initiatedBy: uid,
        returningParticipantId,
        recipientId,
        authorizedBy: null,
        participantIds: [data.sellerId, data.buyerId],
        status: 'REQUESTED',
        reason: input.reason,
        originalEvidenceHashes,
        completedBy: [],
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    await (0, helpers_1.appendEvent)(input.transactionId, uid, 'RETURN_PASSPORT_REQUESTED', 'A participant requested a symmetric return passport.', { returnPassportId: returnRef.id });
    await (0, helpers_1.notifyOtherParticipants)(input.transactionId, uid, 'Return passport requested', 'Review and authorize the return passport before any repacking begins.');
    return { returnPassportId: returnRef.id };
});
exports.authorizeReturnPassport = (0, https_1.onCall)(callOptions, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    const input = validation_1.returnPassportIdSchema.parse(request.data);
    const { data: transaction } = await (0, helpers_1.getTransaction)(input.transactionId);
    (0, helpers_1.assertParticipant)(transaction, uid);
    const { ref, data } = await getReturnPassport(input.transactionId, input.returnPassportId);
    if (data.status !== 'REQUESTED')
        throw new https_1.HttpsError('failed-precondition', 'This return passport is not awaiting authorization.');
    if (data.initiatedBy === uid)
        throw new https_1.HttpsError('permission-denied', 'The other participant must authorize the return.');
    await ref.update({ status: 'AUTHORIZED', authorizedBy: uid, authorizedAt: firestore_1.FieldValue.serverTimestamp(), updatedAt: firestore_1.FieldValue.serverTimestamp() });
    await (0, helpers_1.appendEvent)(input.transactionId, uid, 'RETURN_PASSPORT_AUTHORIZED', 'The return passport was authorized.', { returnPassportId: input.returnPassportId });
    await (0, helpers_1.notifyOtherParticipants)(input.transactionId, uid, 'Return passport authorized', 'The buyer can now record continuous return repacking as the returning participant.');
    return { success: true };
});
exports.submitReturnShipping = (0, https_1.onCall)(callOptions, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    const input = validation_1.returnShippingSchema.parse(request.data);
    const { data: transaction } = await (0, helpers_1.getTransaction)(input.transactionId);
    (0, helpers_1.assertParticipant)(transaction, uid);
    const { ref, data } = await getReturnPassport(input.transactionId, input.returnPassportId);
    const returningParticipantId = data.returningParticipantId ?? transaction.buyerId;
    if (returningParticipantId !== uid)
        throw new https_1.HttpsError('permission-denied', 'Only the returning participant can record return shipping.');
    if (!['PACKED', 'AUTHORIZED'].includes(data.status))
        throw new https_1.HttpsError('failed-precondition', 'The return is not ready for shipping.');
    const packingVideos = await config_1.db.collection('transactions').doc(input.transactionId).collection('evidence')
        .where('returnPassportId', '==', input.returnPassportId).where('type', '==', 'RETURN_PACKING_VIDEO').get();
    const packingVideo = packingVideos.docs.find((item) => evidenceReadyForWorkflow(item.data()));
    if (!packingVideo)
        throw new https_1.HttpsError('failed-precondition', 'A server-finalized return repacking video with no recorded byte-integrity mismatch is required first.');
    const packingEvidenceRef = packingVideo.ref;
    const packingEvidence = packingVideo.data();
    const scannedTrackingNumber = normalizeTracking(packingEvidence.scannedTrackingNumber);
    const submittedTrackingNumber = normalizeTracking(input.trackingNumber);
    const labelEvidenceMatchStatus = !scannedTrackingNumber
        ? 'NOT_SCANNED'
        : scannedTrackingNumber === submittedTrackingNumber
            ? 'MATCHED'
            : 'MISMATCH';
    await config_1.db.runTransaction(async (tx) => {
        const [freshReturn, freshEvidence] = await Promise.all([tx.get(ref), tx.get(packingEvidenceRef)]);
        if (!freshReturn.exists || !freshEvidence.exists)
            throw new https_1.HttpsError('failed-precondition', 'Return evidence changed before shipping could be recorded.');
        const freshReturnData = freshReturn.data();
        if ((freshReturnData.returningParticipantId ?? transaction.buyerId) !== uid)
            throw new https_1.HttpsError('permission-denied', 'Only the returning participant can record return shipping.');
        if (!['PACKED', 'AUTHORIZED'].includes(freshReturnData.status))
            throw new https_1.HttpsError('failed-precondition', 'The return is not ready for shipping.');
        if (!evidenceReadyForWorkflow(freshEvidence.data()))
            throw new https_1.HttpsError('failed-precondition', 'The return packing evidence no longer satisfies byte-integrity workflow requirements.');
        tx.update(ref, {
            status: 'IN_TRANSIT',
            shipping: {
                carrier: input.carrier,
                trackingNumber: input.trackingNumber,
                shippedAt: firestore_1.FieldValue.serverTimestamp(),
                labelEvidenceMatchStatus,
                scannedTrackingNumber,
                packingEvidenceId: packingEvidenceRef.id,
            },
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
        });
        tx.update(packingEvidenceRef, {
            postSubmissionTrackingMatchStatus: labelEvidenceMatchStatus,
            postSubmissionExpectedTrackingNumber: submittedTrackingNumber,
            postSubmissionComparedAt: firestore_1.FieldValue.serverTimestamp(),
            ...(labelEvidenceMatchStatus === 'MISMATCH' && freshEvidence.data()?.moderationStatus === 'UNREVIEWED'
                ? { moderationStatus: 'TRACKING_MISMATCH_REVIEW' }
                : {}),
        });
    });
    await (0, helpers_1.appendEvent)(input.transactionId, uid, 'RETURN_SHIPPED', `Return shipment recorded with ${input.carrier}.`, {
        returnPassportId: input.returnPassportId,
        trackingNumber: input.trackingNumber,
        packingEvidenceId: packingEvidenceRef.id,
        labelEvidenceMatchStatus,
        scannedTrackingNumber,
    });
    await (0, helpers_1.notifyOtherParticipants)(input.transactionId, uid, 'Return shipment recorded', 'Return tracking was added to the symmetric passport.');
    return { success: true, labelEvidenceMatchStatus };
});
exports.markReturnReceived = (0, https_1.onCall)(callOptions, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    const input = validation_1.returnPassportIdSchema.parse(request.data);
    const { data: transaction } = await (0, helpers_1.getTransaction)(input.transactionId);
    (0, helpers_1.assertParticipant)(transaction, uid);
    const { ref, data } = await getReturnPassport(input.transactionId, input.returnPassportId);
    if (data.recipientId !== uid)
        throw new https_1.HttpsError('permission-denied', 'Only the return recipient can confirm receipt.');
    if (data.status !== 'IN_TRANSIT')
        throw new https_1.HttpsError('failed-precondition', 'This return is not in transit.');
    await ref.update({ status: 'RECEIVED_REVIEW', receivedAt: firestore_1.FieldValue.serverTimestamp(), updatedAt: firestore_1.FieldValue.serverTimestamp() });
    await (0, helpers_1.appendEvent)(input.transactionId, uid, 'RETURN_RECEIVED', 'The return recipient confirmed receipt.', { returnPassportId: input.returnPassportId });
    return { success: true };
});
exports.completeReturnPassport = (0, https_1.onCall)(callOptions, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    const input = validation_1.returnPassportIdSchema.parse(request.data);
    const { data: transaction } = await (0, helpers_1.getTransaction)(input.transactionId);
    (0, helpers_1.assertParticipant)(transaction, uid);
    const returnRef = config_1.db.collection('transactions').doc(input.transactionId).collection('returns').doc(input.returnPassportId);
    const completed = await config_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(returnRef);
        if (!snap.exists)
            throw new https_1.HttpsError('not-found', 'Return passport not found.');
        const data = snap.data();
        if (!['RECEIVED_REVIEW', 'DISPUTED'].includes(data.status))
            throw new https_1.HttpsError('failed-precondition', 'The return is not ready to complete.');
        const completedBy = Array.from(new Set([...(data.completedBy ?? []), uid]));
        const both = data.participantIds.every((participantId) => completedBy.includes(participantId));
        tx.update(returnRef, { completedBy, status: both ? 'COMPLETED' : data.status, completedAt: both ? firestore_1.FieldValue.serverTimestamp() : null, updatedAt: firestore_1.FieldValue.serverTimestamp() });
        return both;
    });
    await (0, helpers_1.appendEvent)(input.transactionId, uid, 'RETURN_COMPLETION_CONFIRMED', completed ? 'Both participants completed the return passport.' : 'A participant confirmed return completion.', { returnPassportId: input.returnPassportId });
    return { completed };
});
//# sourceMappingURL=returns.js.map