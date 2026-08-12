import type { AppCheck } from 'firebase-admin/app-check';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import type { ParticipantActorPrincipal } from '../../application/v1/participant-capture-service';
import { ApiError } from './core';

export interface ParticipantAuthenticator {
  authenticate(authorization: string | undefined, appCheckToken: string | undefined): Promise<ParticipantActorPrincipal>;
}

function participantAuthenticationError(): ApiError {
  return new ApiError(
    401,
    'INVALID_PARTICIPANT_AUTHENTICATION',
    'A valid PackProof user session and App Check token are required.',
    [],
    { 'WWW-Authenticate': 'Bearer realm="PackProof participant API", error="invalid_token"' },
  );
}

export class FirebaseParticipantAuthenticator implements ParticipantAuthenticator {
  constructor(
    private readonly auth: Auth,
    private readonly appCheck: AppCheck,
    private readonly firestore: Firestore,
  ) {}

  async authenticate(authorization: string | undefined, appCheckToken: string | undefined): Promise<ParticipantActorPrincipal> {
    const bearer = authorization ? /^Bearer\s+([^\s]+)$/i.exec(authorization.trim()) : null;
    if (!bearer || !appCheckToken || appCheckToken.length > 8_192) throw participantAuthenticationError();
    try {
      const [identity, attestation] = await Promise.all([
        this.auth.verifyIdToken(bearer[1], true),
        this.appCheck.verifyToken(appCheckToken),
      ]);
      if (!identity.uid || !attestation.appId) throw participantAuthenticationError();
      const user = await this.firestore.collection('users').doc(identity.uid).get();
      const account = user.data() ?? {};
      if (account.moderationState === 'SUSPENDED') {
        throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'This PackProof account is suspended.');
      }
      if (account.deletionScheduledAt) {
        throw new ApiError(409, 'ACCOUNT_DELETION_PENDING', 'Cancel account deletion before claiming or redeeming a PackProof session.');
      }
      return { type: 'PACKPROOF_USER', actorId: identity.uid, appId: attestation.appId };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw participantAuthenticationError();
    }
  }
}
