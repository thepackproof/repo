import { onRequest } from 'firebase-functions/v2/https';
import {
  adminAppCheck,
  adminAuth,
  apiCredentialPepper,
  apiEnvironment,
  connectLinkBaseUrl,
  db,
  participantHandoffSigningSecret,
  publicHandoffSigningSecret,
} from '../../config';
import { PublicCommerceHandoffApplicationService } from '../../application/v1/public-commerce-handoff-service';
import { ParticipantCaptureApplicationService } from '../../application/v1/participant-capture-service';
import { HmacParticipantHandoffTokenIssuer } from '../../infrastructure/crypto/participant-handoff-token-issuer';
import { HmacPublicHandoffTokenIssuer } from '../../infrastructure/crypto/public-handoff-token-issuer';
import { Sha256TokenVerifier } from '../../infrastructure/crypto/sha256-token-verifier';
import { FirestorePublicCommerceHandoffRepository } from '../../infrastructure/firebase/v1/public-commerce-handoff-repository';
import { FirestoreParticipantCaptureRepository } from '../../infrastructure/firebase/v1/participant-capture-repository';
import { createApiV1App } from './app';
import { FirestoreAuditWriter, FirestoreIdempotencyStore, FirestoreRateLimiter } from './controls';
import type { ApiEnvironment } from './core';
import { FirestoreReadinessChecker, FirestoreTransactionRepository } from './firestore';
import { AuthorizationService, FirestoreMerchantAuthenticator } from './security';
import { FirebaseParticipantAuthenticator } from './participant-security';
import { TransactionService } from './transaction-service';

function configuredEnvironment(): ApiEnvironment {
  const value = apiEnvironment.value();
  if (value !== 'sandbox' && value !== 'live') throw new Error('API_ENVIRONMENT must be sandbox or live.');
  return value;
}

function productionApp() {
  const authenticator = new FirestoreMerchantAuthenticator(db, configuredEnvironment, () => apiCredentialPepper.value());
  const rateLimiter = new FirestoreRateLimiter(db);
  const firestoreReadiness = new FirestoreReadinessChecker(db);
  const readiness = {
    async check(): Promise<void> {
      configuredEnvironment();
      if (apiCredentialPepper.value().length < 32) throw new Error('API_CREDENTIAL_PEPPER is not configured.');
      if (publicHandoffSigningSecret.value().length < 32) throw new Error('PUBLIC_HANDOFF_SIGNING_SECRET is not configured.');
      if (participantHandoffSigningSecret.value().length < 32) throw new Error('PARTICIPANT_HANDOFF_SIGNING_SECRET is not configured.');
      await firestoreReadiness.check();
    },
  };
  const transactionService = new TransactionService(
    new FirestoreTransactionRepository(db),
    new FirestoreIdempotencyStore(db),
    new FirestoreAuditWriter(db),
    new AuthorizationService(),
    {
      get environment(): ApiEnvironment {
        return configuredEnvironment();
      },
    },
  );
  const publicCommerceRepository = new FirestorePublicCommerceHandoffRepository(db);
  const publicCommerceHandoffService = new PublicCommerceHandoffApplicationService(
    publicCommerceRepository,
    new HmacPublicHandoffTokenIssuer(() => publicHandoffSigningSecret.value()),
    new Sha256TokenVerifier(),
    configuredEnvironment,
  );
  const participantCaptureService = new ParticipantCaptureApplicationService(
    new FirestoreParticipantCaptureRepository(db),
    new HmacParticipantHandoffTokenIssuer(() => participantHandoffSigningSecret.value()),
    new FirestoreAuditWriter(db),
    new AuthorizationService(),
    {
      get environment(): ApiEnvironment {
        return configuredEnvironment();
      },
    },
  );
  return createApiV1App({
    authenticator,
    participantAuthenticator: new FirebaseParticipantAuthenticator(adminAuth, adminAppCheck, db),
    rateLimiter,
    readiness,
    transactionService,
    participantCaptureService,
    publicCommerceHandoffService,
    publicHandoffReviewBaseUrl: () => connectLinkBaseUrl.value(),
    participantHandoffBaseUrl: () => connectLinkBaseUrl.value(),
  });
}

export const packproofApi = onRequest({
  cors: false,
  timeoutSeconds: 60,
  memory: '512MiB',
  secrets: [apiCredentialPepper, publicHandoffSigningSecret, participantHandoffSigningSecret],
}, productionApp());
