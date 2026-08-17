import { FieldValue } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from './config';
import { assertParticipant, expiresIn, getTransaction, randomToken, requireUid } from './helpers';
import { captureSessionSchema } from './validation';

export const beginCaptureSession = onCall({ enforceAppCheck: true, consumeAppCheckToken: true }, async (request) => {
  const uid = requireUid(request);
  if (!request.app) throw new HttpsError('failed-precondition', 'Device attestation was not available.');
  if (request.app.alreadyConsumed) throw new HttpsError('failed-precondition', 'The device attestation token was already used. Refresh and try again.');
  const input = captureSessionSchema.parse(request.data);
  const { data } = await getTransaction(input.transactionId);
  assertParticipant(data, uid);

  if (input.returnPassportId) {
    const returnSnap = await db.collection('transactions').doc(input.transactionId).collection('returns').doc(input.returnPassportId).get();
    if (!returnSnap.exists || !(returnSnap.data()?.participantIds as string[] | undefined)?.includes(uid)) {
      throw new HttpsError('permission-denied', 'Return passport not found for this participant.');
    }
  }
  if (input.connectSessionId && data.source?.connectSessionId !== input.connectSessionId) {
    throw new HttpsError('permission-denied', 'PackProof API session mismatch.');
  }
  if (input.requestedEvidenceCount > 1) {
    if (input.requestedEvidenceCount !== 15 || input.captureProfileId !== 'PP-PHYSICAL-MATTE-V1' || !input.captureGroupId) {
      throw new HttpsError('invalid-argument', 'Batch capture requires the frozen 15-frame physical profile and a capture group identifier.');
    }
  } else if (input.captureProfileId || input.captureGroupId) {
    throw new HttpsError('invalid-argument', 'Capture profile and group identifiers are reserved for an approved batch profile.');
  }

  const ref = db.collection('captureSessions').doc();
  const sessionMode = input.requestedEvidenceCount > 1 ? 'BATCH' : 'SINGLE';
  const nonce = randomToken(32);
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
    issuedAt: FieldValue.serverTimestamp(),
    captureWindowEndsAt,
    redemptionExpiresAt: expiresIn(30 * 86400),
    usedAt: null,
  });
  return {
    mode: 'JIT_APP_CHECK' as const,
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
