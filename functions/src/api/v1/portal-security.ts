import type { AppCheck } from 'firebase-admin/app-check';
import type { Auth } from 'firebase-admin/auth';
import type { Firestore } from 'firebase-admin/firestore';
import { ApiError } from './core';
import type { PortalPrincipal } from './portal-principal';

export interface PortalAuthenticator {
  authenticate(authorization: string | undefined, appCheckToken: string | undefined): Promise<PortalPrincipal>;
}

function portalAuthenticationError(): ApiError {
  return new ApiError(
    401,
    'INVALID_PORTAL_AUTHENTICATION',
    'A valid PackProof user session and App Check token are required.',
    [],
    { 'WWW-Authenticate': 'Bearer realm="PackProof portal API", error="invalid_token"' },
  );
}

export class FirebasePortalAuthenticator implements PortalAuthenticator {
  constructor(
    private readonly auth: Auth,
    private readonly appCheck: AppCheck,
    private readonly firestore: Firestore,
  ) {}

  async authenticate(authorization: string | undefined, appCheckToken: string | undefined): Promise<PortalPrincipal> {
    const bearer = authorization ? /^Bearer\s+([^\s]+)$/i.exec(authorization.trim()) : null;
    if (!bearer || !appCheckToken || appCheckToken.length > 8_192) throw portalAuthenticationError();
    try {
      const identity = await this.auth.verifyIdToken(bearer[1], true);
      if (!identity.uid) throw portalAuthenticationError();
      let appId = 'emulator';
      if (process.env.FUNCTIONS_EMULATOR === 'true') {
        appId = 'emulator';
      } else {
        const attestation = await this.appCheck.verifyToken(appCheckToken);
        if (!attestation.appId) throw portalAuthenticationError();
        appId = attestation.appId;
      }
      const user = await this.firestore.collection('users').doc(identity.uid).get();
      const account = user.data() ?? {};
      if (account.moderationState === 'SUSPENDED') {
        throw new ApiError(403, 'ACCOUNT_SUSPENDED', 'This PackProof account is suspended.');
      }
      if (account.deletionScheduledAt) {
        throw new ApiError(409, 'ACCOUNT_DELETION_PENDING', 'Cancel account deletion before using the PackProof portal.');
      }
      return { type: 'PORTAL_USER', actorId: identity.uid, appId, channel: 'WEB_PORTAL' };
    } catch (error) {
      if (error instanceof ApiError) throw error;
      throw portalAuthenticationError();
    }
  }
}
