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
  storage,
} from '../../config';
import { CommerceContextApplicationService } from '../../application/v1/commerce-context-service';
import { MerchantConnectApplicationService } from '../../application/v1/merchant-connect-service';
import { MerchantEvidenceApplicationService } from '../../application/v1/merchant-evidence-service';
import { PublicCommerceHandoffApplicationService } from '../../application/v1/public-commerce-handoff-service';
import { ParticipantCaptureApplicationService } from '../../application/v1/participant-capture-service';
import { generateEvidencePacket } from '../../evidence';
import { generatePassportPdfExport } from '../../passport-export';
import { HmacConnectSessionTokenIssuer } from '../../infrastructure/crypto/connect-session-token-issuer';
import { HmacParticipantHandoffTokenIssuer } from '../../infrastructure/crypto/participant-handoff-token-issuer';
import { HmacPublicHandoffTokenIssuer } from '../../infrastructure/crypto/public-handoff-token-issuer';
import { Sha256TokenVerifier } from '../../infrastructure/crypto/sha256-token-verifier';
import { FirestoreCommerceContextRepository } from '../../infrastructure/firebase/v1/commerce-context-repository';
import {
  FirestoreMerchantConnectAdapter,
  FirestoreMerchantEvidenceRepository,
} from '../../infrastructure/firebase/v1/merchant-evidence-repository';
import { FirestorePublicCommerceHandoffRepository } from '../../infrastructure/firebase/v1/public-commerce-handoff-repository';
import { FirestoreParticipantCaptureRepository } from '../../infrastructure/firebase/v1/participant-capture-repository';
import { DnsPublicHttpsCallbackValidator } from '../../infrastructure/net/public-https-callback';
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
  const runtimeConfig = {
    get environment(): ApiEnvironment {
      return configuredEnvironment();
    },
  };
  const merchantEvidenceService = new MerchantEvidenceApplicationService(
    new FirestoreMerchantEvidenceRepository(db),
    new FirestoreIdempotencyStore(db),
    new FirestoreAuditWriter(db),
    new AuthorizationService(),
    {
      generate(transactionId, generatedBy, options) {
        return generateEvidencePacket(transactionId, generatedBy, options);
      },
    },
    {
      async sign(storagePath, expiresAt) {
        const [url] = await storage.bucket().file(storagePath).getSignedUrl({
          action: 'read',
          expires: expiresAt.getTime(),
        });
        return url;
      },
    },
    runtimeConfig,
    () => new Date(),
    {
      verificationBaseUrl: () => connectLinkBaseUrl.value(),
      generatePdf: (input) => generatePassportPdfExport(input),
    },
  );
  const connectAdapter = new FirestoreMerchantConnectAdapter(db);
  const merchantConnectService = new MerchantConnectApplicationService(
    new CommerceContextApplicationService(
      new FirestoreCommerceContextRepository(db),
      new HmacConnectSessionTokenIssuer(),
    ),
    connectAdapter,
    connectAdapter,
    new DnsPublicHttpsCallbackValidator(),
    new AuthorizationService(),
    runtimeConfig,
    () => connectLinkBaseUrl.value(),
  );
  return createApiV1App({
    authenticator,
    participantAuthenticator: new FirebaseParticipantAuthenticator(adminAuth, adminAppCheck, db),
    rateLimiter,
    readiness,
    transactionService,
    participantCaptureService,
    publicCommerceHandoffService,
    merchantEvidenceService,
    merchantConnectService,
    publicHandoffReviewBaseUrl: () => connectLinkBaseUrl.value(),
    participantHandoffBaseUrl: () => connectLinkBaseUrl.value(),
  });
}

export const packproofApi = onRequest({
  cors: false,
  // Cloud Run must accept the transport request so the API can apply its own
  // credential, scope, origin, rate-limit and route authorization controls.
  // Without this, even the intentionally public health/readiness routes are
  // rejected by IAM before the application boundary executes.
  invoker: 'public',
  timeoutSeconds: 60,
  memory: '512MiB',
  secrets: [apiCredentialPepper, publicHandoffSigningSecret, participantHandoffSigningSecret],
}, productionApp());
