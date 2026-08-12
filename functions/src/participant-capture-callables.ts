import { randomUUID } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { ParticipantCaptureApplicationService } from './application/v1/participant-capture-service';
import { apiEnvironment, db, participantHandoffSigningSecret } from './config';
import { ApiError } from './api/v1/core';
import { FirestoreAuditWriter } from './api/v1/controls';
import { AuthorizationService } from './api/v1/security';
import { parseClaimParticipant, parseEvidenceSessionId, parseRedeemEvidenceSession } from './api/v1/validation';
import { HmacParticipantHandoffTokenIssuer } from './infrastructure/crypto/participant-handoff-token-issuer';
import { throwCallableError } from './infrastructure/firebase/v1/callable-errors';
import { FirestoreParticipantCaptureRepository } from './infrastructure/firebase/v1/participant-capture-repository';
import { assertAccountActive, requireUid } from './helpers';

function configuredEnvironment(): 'sandbox' | 'live' {
  const value = apiEnvironment.value();
  if (value !== 'sandbox' && value !== 'live') throw new Error('API_ENVIRONMENT must be sandbox or live.');
  return value;
}

function service(): ParticipantCaptureApplicationService {
  return new ParticipantCaptureApplicationService(
    new FirestoreParticipantCaptureRepository(db),
    new HmacParticipantHandoffTokenIssuer(() => participantHandoffSigningSecret.value()),
    new FirestoreAuditWriter(db),
    new AuthorizationService(),
    { get environment() { return configuredEnvironment(); } },
  );
}

function validation<T>(parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    if (error instanceof ApiError) {
      throw new HttpsError('invalid-argument', error.message, { applicationCode: error.code, details: error.details });
    }
    throw error;
  }
}

export const claimParticipantInvitation = onCall({
  enforceAppCheck: true,
  secrets: [participantHandoffSigningSecret],
}, async (request) => {
  const actorId = requireUid(request);
  if (!request.app?.appId) throw new HttpsError('failed-precondition', 'App Check attestation was not available.');
  await assertAccountActive(actorId);
  const input = validation(() => parseClaimParticipant(request.data));
  try {
    return await service().claimParticipant({
      principal: { type: 'PACKPROOF_USER', actorId, appId: request.app!.appId },
      claimId: input.claimId,
      token: input.token,
      requestId: randomUUID(),
    });
  } catch (error) {
    throwCallableError(error);
  }
});

export const redeemEvidenceSession = onCall({
  enforceAppCheck: true,
  consumeAppCheckToken: true,
  secrets: [participantHandoffSigningSecret],
}, async (request) => {
  const actorId = requireUid(request);
  if (!request.app?.appId) throw new HttpsError('failed-precondition', 'App Check attestation was not available.');
  if (request.app.alreadyConsumed) throw new HttpsError('failed-precondition', 'The App Check token was already used. Refresh and try again.');
  await assertAccountActive(actorId);
  if (!request.data || typeof request.data !== 'object' || Array.isArray(request.data)) {
    throw new HttpsError('invalid-argument', 'Request data must be an object.');
  }
  const record = request.data as Record<string, unknown>;
  const evidenceSessionId = validation(() => parseEvidenceSessionId(record.evidenceSessionId));
  const input = validation(() => parseRedeemEvidenceSession({
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
      requestId: randomUUID(),
    });
  } catch (error) {
    throwCallableError(error);
  }
});

export const getMyEvidenceSession = onCall({
  enforceAppCheck: true,
  secrets: [participantHandoffSigningSecret],
}, async (request) => {
  const actorId = requireUid(request);
  if (!request.app?.appId) throw new HttpsError('failed-precondition', 'App Check attestation was not available.');
  await assertAccountActive(actorId);
  const evidenceSessionId = validation(() => parseEvidenceSessionId(
    request.data && typeof request.data === 'object' && !Array.isArray(request.data)
      ? (request.data as Record<string, unknown>).evidenceSessionId
      : undefined,
  ));
  try {
    return await service().getEvidenceSessionForActor(
      { type: 'PACKPROOF_USER', actorId, appId: request.app.appId },
      evidenceSessionId,
    );
  } catch (error) {
    throwCallableError(error);
  }
});
