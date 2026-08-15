import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './config';
import { appendEvent, assertParticipant, getTransaction, notifyOtherParticipants, requireUid } from './helpers';
import type { ReturnPassportRecord } from './types';
import { returnPassportIdSchema, returnPassportSchema, returnShippingSchema } from './validation';

const callOptions = { enforceAppCheck: true } as const;

function normalizeTracking(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized.length >= 3 ? normalized : null;
}

function evidenceReadyForWorkflow(value: FirebaseFirestore.DocumentData | undefined): boolean {
  if (!value) return false;
  if (value.serverFinalized === true) {
    return value.clientHashMatched !== false
      && value.clientSizeMatched !== false
      && value.contentTypeMatched !== false
      && value.assurance?.byteIntegrity?.status !== 'MISMATCH';
  }
  return value.serverVerified === true && value.clientHashMatched !== false;
}

async function getReturnPassport(transactionId: string, returnPassportId: string): Promise<{
  ref: FirebaseFirestore.DocumentReference;
  data: ReturnPassportRecord;
}> {
  const ref = db.collection('transactions').doc(transactionId).collection('returns').doc(returnPassportId);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError('not-found', 'Return passport not found.');
  return { ref, data: snap.data() as ReturnPassportRecord };
}

export const initiateReturnPassport = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const input = returnPassportSchema.parse(request.data);
  const { ref: transactionRef, data } = await getTransaction(input.transactionId);
  assertParticipant(data, uid);
  if (!data.buyerId) throw new HttpsError('failed-precondition', 'A return passport requires both transaction participants.');
  if (data.terms.returns === 'NO_RETURNS' && data.status !== 'DISPUTED') {
    throw new HttpsError('failed-precondition', 'The locked terms do not authorize returns. Raise a concern if the item materially differs from the agreement.');
  }
  if (!['SHIPPED', 'BUYER_REVIEW', 'COMPLETED', 'DISPUTED'].includes(data.status)) {
    throw new HttpsError('failed-precondition', 'A return passport can begin only after shipment.');
  }
  const active = await transactionRef.collection('returns').where('status', 'in', ['REQUESTED', 'AUTHORIZED', 'PACKED', 'IN_TRANSIT', 'RECEIVED_REVIEW', 'DISPUTED']).limit(1).get();
  if (!active.empty) throw new HttpsError('already-exists', 'An active return passport already exists for this transaction.');

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
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await appendEvent(input.transactionId, uid, 'RETURN_PASSPORT_REQUESTED', 'A participant requested a symmetric return passport.', { returnPassportId: returnRef.id });
  await notifyOtherParticipants(input.transactionId, uid, 'Return passport requested', 'Review and authorize the return passport before any repacking begins.');
  return { returnPassportId: returnRef.id };
});

export const authorizeReturnPassport = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const input = returnPassportIdSchema.parse(request.data);
  const { data: transaction } = await getTransaction(input.transactionId);
  assertParticipant(transaction, uid);
  const { ref, data } = await getReturnPassport(input.transactionId, input.returnPassportId);
  if (data.status !== 'REQUESTED') throw new HttpsError('failed-precondition', 'This return passport is not awaiting authorization.');
  if (data.initiatedBy === uid) throw new HttpsError('permission-denied', 'The other participant must authorize the return.');
  await ref.update({ status: 'AUTHORIZED', authorizedBy: uid, authorizedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await appendEvent(input.transactionId, uid, 'RETURN_PASSPORT_AUTHORIZED', 'The return passport was authorized.', { returnPassportId: input.returnPassportId });
  await notifyOtherParticipants(input.transactionId, uid, 'Return passport authorized', 'The buyer can now record continuous return repacking as the returning participant.');
  return { success: true };
});

export const submitReturnShipping = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const input = returnShippingSchema.parse(request.data);
  const { data: transaction } = await getTransaction(input.transactionId);
  assertParticipant(transaction, uid);
  const { ref, data } = await getReturnPassport(input.transactionId, input.returnPassportId);
  const returningParticipantId = data.returningParticipantId ?? transaction.buyerId;
  if (returningParticipantId !== uid) throw new HttpsError('permission-denied', 'Only the returning participant can record return shipping.');
  if (!['PACKED', 'AUTHORIZED'].includes(data.status)) throw new HttpsError('failed-precondition', 'The return is not ready for shipping.');
  const evidenceRef = db.collection('transactions').doc(input.transactionId).collection('evidence');
  const packingVideos = await evidenceRef.where('returnPassportId', '==', input.returnPassportId).where('type', '==', 'RETURN_PACKING_VIDEO').get();
  const sealPhotos = await evidenceRef.where('returnPassportId', '==', input.returnPassportId).where('type', '==', 'RETURN_SHIPPING_LABEL').get();
  const packingVideo = packingVideos.docs.find((item) => evidenceReadyForWorkflow(item.data()));
  const sealPhoto = sealPhotos.docs.find((item) => evidenceReadyForWorkflow(item.data()));
  if (!packingVideo) throw new HttpsError('failed-precondition', 'A server-finalized return repacking video with no recorded byte-integrity mismatch is required first.');
  if (!sealPhoto) throw new HttpsError('failed-precondition', 'A server-finalized high-resolution return seal reference photograph with no recorded byte-integrity mismatch is required first.');

  const packingEvidenceRef = packingVideo.ref;
  const sealEvidenceRef = sealPhoto.ref;
  const packingEvidence = packingVideo.data();
  const sealEvidence = sealPhoto.data();
  const scannedTrackingNumber = normalizeTracking(sealEvidence.scannedTrackingNumber) ?? normalizeTracking(packingEvidence.scannedTrackingNumber);
  const submittedTrackingNumber = normalizeTracking(input.trackingNumber);
  const labelEvidenceMatchStatus = !scannedTrackingNumber
    ? 'NOT_SCANNED'
    : scannedTrackingNumber === submittedTrackingNumber
      ? 'MATCHED'
      : 'MISMATCH';

  await db.runTransaction(async (tx) => {
    const [freshReturn, freshPacking, freshSeal] = await Promise.all([tx.get(ref), tx.get(packingEvidenceRef), tx.get(sealEvidenceRef)]);
    if (!freshReturn.exists || !freshPacking.exists || !freshSeal.exists) throw new HttpsError('failed-precondition', 'Return evidence changed before shipping could be recorded.');
    const freshReturnData = freshReturn.data() as ReturnPassportRecord;
    if ((freshReturnData.returningParticipantId ?? transaction.buyerId) !== uid) throw new HttpsError('permission-denied', 'Only the returning participant can record return shipping.');
    if (!['PACKED', 'AUTHORIZED'].includes(freshReturnData.status)) throw new HttpsError('failed-precondition', 'The return is not ready for shipping.');
    if (!evidenceReadyForWorkflow(freshPacking.data())) throw new HttpsError('failed-precondition', 'The return packing evidence no longer satisfies byte-integrity workflow requirements.');
    if (!evidenceReadyForWorkflow(freshSeal.data())) throw new HttpsError('failed-precondition', 'The return seal-reference evidence no longer satisfies byte-integrity workflow requirements.');

    tx.update(ref, {
      status: 'IN_TRANSIT',
      shipping: {
        carrier: input.carrier,
        trackingNumber: input.trackingNumber,
        shippedAt: FieldValue.serverTimestamp(),
        labelEvidenceMatchStatus,
        scannedTrackingNumber,
        packingEvidenceId: packingEvidenceRef.id,
        sealEvidenceId: sealEvidenceRef.id,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(packingEvidenceRef, {
      postSubmissionTrackingMatchStatus: labelEvidenceMatchStatus,
      postSubmissionExpectedTrackingNumber: submittedTrackingNumber,
      postSubmissionComparedAt: FieldValue.serverTimestamp(),
      ...(labelEvidenceMatchStatus === 'MISMATCH' && freshPacking.data()?.moderationStatus === 'UNREVIEWED'
        ? { moderationStatus: 'TRACKING_MISMATCH_REVIEW' }
        : {}),
    });
    tx.update(sealEvidenceRef, {
      postSubmissionTrackingMatchStatus: labelEvidenceMatchStatus,
      postSubmissionExpectedTrackingNumber: submittedTrackingNumber,
      postSubmissionComparedAt: FieldValue.serverTimestamp(),
      ...(labelEvidenceMatchStatus === 'MISMATCH' && freshSeal.data()?.moderationStatus === 'UNREVIEWED'
        ? { moderationStatus: 'TRACKING_MISMATCH_REVIEW' }
        : {}),
    });
  });
  await appendEvent(input.transactionId, uid, 'RETURN_SHIPPED', `Return shipment recorded with ${input.carrier}.`, {
    returnPassportId: input.returnPassportId,
    trackingNumber: input.trackingNumber,
    packingEvidenceId: packingEvidenceRef.id,
    sealEvidenceId: sealEvidenceRef.id,
    labelEvidenceMatchStatus,
    scannedTrackingNumber,
  });
  await notifyOtherParticipants(input.transactionId, uid, 'Return shipment recorded', 'Return tracking was added to the symmetric passport.');
  return { success: true, labelEvidenceMatchStatus };
});

export const markReturnReceived = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const input = returnPassportIdSchema.parse(request.data);
  const { data: transaction } = await getTransaction(input.transactionId);
  assertParticipant(transaction, uid);
  const { ref, data } = await getReturnPassport(input.transactionId, input.returnPassportId);
  if (data.recipientId !== uid) throw new HttpsError('permission-denied', 'Only the return recipient can confirm receipt.');
  if (data.status !== 'IN_TRANSIT') throw new HttpsError('failed-precondition', 'This return is not in transit.');
  await ref.update({ status: 'RECEIVED_REVIEW', receivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await appendEvent(input.transactionId, uid, 'RETURN_RECEIVED', 'The return recipient confirmed receipt.', { returnPassportId: input.returnPassportId });
  return { success: true };
});

export const completeReturnPassport = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const input = returnPassportIdSchema.parse(request.data);
  const { data: transaction } = await getTransaction(input.transactionId);
  assertParticipant(transaction, uid);
  const returnRef = db.collection('transactions').doc(input.transactionId).collection('returns').doc(input.returnPassportId);
  const completed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(returnRef);
    if (!snap.exists) throw new HttpsError('not-found', 'Return passport not found.');
    const data = snap.data() as ReturnPassportRecord;
    if (!['RECEIVED_REVIEW', 'DISPUTED'].includes(data.status)) throw new HttpsError('failed-precondition', 'The return is not ready to complete.');
    const completedBy = Array.from(new Set([...(data.completedBy ?? []), uid]));
    const both = data.participantIds.every((participantId) => completedBy.includes(participantId));
    tx.update(returnRef, { completedBy, status: both ? 'COMPLETED' : data.status, completedAt: both ? FieldValue.serverTimestamp() : null, updatedAt: FieldValue.serverTimestamp() });
    return both;
  });
  await appendEvent(input.transactionId, uid, 'RETURN_COMPLETION_CONFIRMED', completed ? 'Both participants completed the return passport.' : 'A participant confirmed return completion.', { returnPassportId: input.returnPassportId });
  return { completed };
});
