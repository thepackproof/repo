"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.packproofApi = void 0;
const https_1 = require("firebase-functions/v2/https");
const config_1 = require("../../config");
const public_commerce_handoff_service_1 = require("../../application/v1/public-commerce-handoff-service");
const participant_capture_service_1 = require("../../application/v1/participant-capture-service");
const participant_handoff_token_issuer_1 = require("../../infrastructure/crypto/participant-handoff-token-issuer");
const public_handoff_token_issuer_1 = require("../../infrastructure/crypto/public-handoff-token-issuer");
const sha256_token_verifier_1 = require("../../infrastructure/crypto/sha256-token-verifier");
const public_commerce_handoff_repository_1 = require("../../infrastructure/firebase/v1/public-commerce-handoff-repository");
const participant_capture_repository_1 = require("../../infrastructure/firebase/v1/participant-capture-repository");
const app_1 = require("./app");
const controls_1 = require("./controls");
const firestore_1 = require("./firestore");
const security_1 = require("./security");
const participant_security_1 = require("./participant-security");
const transaction_service_1 = require("./transaction-service");
function configuredEnvironment() {
    const value = config_1.apiEnvironment.value();
    if (value !== 'sandbox' && value !== 'live')
        throw new Error('API_ENVIRONMENT must be sandbox or live.');
    return value;
}
function productionApp() {
    const authenticator = new security_1.FirestoreMerchantAuthenticator(config_1.db, configuredEnvironment, () => config_1.apiCredentialPepper.value());
    const rateLimiter = new controls_1.FirestoreRateLimiter(config_1.db);
    const firestoreReadiness = new firestore_1.FirestoreReadinessChecker(config_1.db);
    const readiness = {
        async check() {
            configuredEnvironment();
            if (config_1.apiCredentialPepper.value().length < 32)
                throw new Error('API_CREDENTIAL_PEPPER is not configured.');
            if (config_1.publicHandoffSigningSecret.value().length < 32)
                throw new Error('PUBLIC_HANDOFF_SIGNING_SECRET is not configured.');
            if (config_1.participantHandoffSigningSecret.value().length < 32)
                throw new Error('PARTICIPANT_HANDOFF_SIGNING_SECRET is not configured.');
            await firestoreReadiness.check();
        },
    };
    const transactionService = new transaction_service_1.TransactionService(new firestore_1.FirestoreTransactionRepository(config_1.db), new controls_1.FirestoreIdempotencyStore(config_1.db), new controls_1.FirestoreAuditWriter(config_1.db), new security_1.AuthorizationService(), {
        get environment() {
            return configuredEnvironment();
        },
    });
    const publicCommerceRepository = new public_commerce_handoff_repository_1.FirestorePublicCommerceHandoffRepository(config_1.db);
    const publicCommerceHandoffService = new public_commerce_handoff_service_1.PublicCommerceHandoffApplicationService(publicCommerceRepository, new public_handoff_token_issuer_1.HmacPublicHandoffTokenIssuer(() => config_1.publicHandoffSigningSecret.value()), new sha256_token_verifier_1.Sha256TokenVerifier(), configuredEnvironment);
    const participantCaptureService = new participant_capture_service_1.ParticipantCaptureApplicationService(new participant_capture_repository_1.FirestoreParticipantCaptureRepository(config_1.db), new participant_handoff_token_issuer_1.HmacParticipantHandoffTokenIssuer(() => config_1.participantHandoffSigningSecret.value()), new controls_1.FirestoreAuditWriter(config_1.db), new security_1.AuthorizationService(), {
        get environment() {
            return configuredEnvironment();
        },
    });
    return (0, app_1.createApiV1App)({
        authenticator,
        participantAuthenticator: new participant_security_1.FirebaseParticipantAuthenticator(config_1.adminAuth, config_1.adminAppCheck, config_1.db),
        rateLimiter,
        readiness,
        transactionService,
        participantCaptureService,
        publicCommerceHandoffService,
        publicHandoffReviewBaseUrl: () => config_1.connectLinkBaseUrl.value(),
        participantHandoffBaseUrl: () => config_1.connectLinkBaseUrl.value(),
    });
}
exports.packproofApi = (0, https_1.onRequest)({
    cors: false,
    // Cloud Run must accept the transport request so the API can apply its own
    // credential, scope, origin, rate-limit and route authorization controls.
    // Without this, even the intentionally public health/readiness routes are
    // rejected by IAM before the application boundary executes.
    invoker: 'public',
    timeoutSeconds: 60,
    memory: '512MiB',
    secrets: [config_1.apiCredentialPepper, config_1.publicHandoffSigningSecret, config_1.participantHandoffSigningSecret],
}, productionApp());
//# sourceMappingURL=production.js.map