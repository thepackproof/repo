"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryConnectCallbacks = exports.onConnectEvidenceVerified = exports.redeemPublicCommerceHandoff = exports.redeemConnectSession = exports.handleMarketplaceOrder = exports.provisionConnectIntegration = void 0;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const connect_callback_1 = require("./application/v1/connect-callback");
const commerce_context_service_1 = require("./application/v1/commerce-context-service");
const connect_handoff_service_1 = require("./application/v1/connect-handoff-service");
const connect_callback_retry_1 = require("./infrastructure/firebase/v1/connect-callback-retry");
const public_commerce_handoff_service_1 = require("./application/v1/public-commerce-handoff-service");
const errors_1 = require("./application/v1/errors");
const config_1 = require("./config");
const evidence_1 = require("./evidence");
const helpers_1 = require("./helpers");
const http_security_1 = require("./http-security");
const connect_session_token_issuer_1 = require("./infrastructure/crypto/connect-session-token-issuer");
const public_handoff_token_issuer_1 = require("./infrastructure/crypto/public-handoff-token-issuer");
const sha256_token_verifier_1 = require("./infrastructure/crypto/sha256-token-verifier");
const callable_errors_1 = require("./infrastructure/firebase/v1/callable-errors");
const connect_handoff_repository_1 = require("./infrastructure/firebase/v1/connect-handoff-repository");
const commerce_context_repository_1 = require("./infrastructure/firebase/v1/commerce-context-repository");
const public_commerce_handoff_repository_1 = require("./infrastructure/firebase/v1/public-commerce-handoff-repository");
const public_https_callback_1 = require("./infrastructure/net/public-https-callback");
const validation_1 = require("./validation");
const provisionSchema = validation_1.connectProvisionSchema;
const callbackUrlValidator = new public_https_callback_1.DnsPublicHttpsCallbackValidator();
const commerceContextService = new commerce_context_service_1.CommerceContextApplicationService(new commerce_context_repository_1.FirestoreCommerceContextRepository(config_1.db), new connect_session_token_issuer_1.HmacConnectSessionTokenIssuer());
const connectHandoffService = new connect_handoff_service_1.ConnectHandoffApplicationService(new connect_handoff_repository_1.FirestoreConnectHandoffRepository(config_1.db), new sha256_token_verifier_1.Sha256TokenVerifier());
const publicCommerceHandoffService = new public_commerce_handoff_service_1.PublicCommerceHandoffApplicationService(new public_commerce_handoff_repository_1.FirestorePublicCommerceHandoffRepository(config_1.db), new public_handoff_token_issuer_1.HmacPublicHandoffTokenIssuer(() => config_1.publicHandoffSigningSecret.value()), new sha256_token_verifier_1.Sha256TokenVerifier(), () => {
    const value = config_1.apiEnvironment.value();
    if (value !== 'sandbox' && value !== 'live')
        throw new Error('API_ENVIRONMENT must be sandbox or live.');
    return value;
});
async function validateCallbackUrl(callbackUrl, allowedOrigins) {
    try {
        await callbackUrlValidator.validate(callbackUrl, allowedOrigins ?? []);
    }
    catch (error) {
        if (error instanceof errors_1.ApplicationError) {
            throw new https_1.HttpsError(error.category === 'FORBIDDEN' ? 'permission-denied' : 'invalid-argument', error.message);
        }
        throw error;
    }
    return new URL(callbackUrl);
}
exports.provisionConnectIntegration = (0, https_1.onCall)({ enforceAppCheck: true }, async (request) => {
    (0, helpers_1.requireUid)(request);
    if (request.auth?.token.packproofAdmin !== true)
        throw new https_1.HttpsError('permission-denied', 'PackProof administrator approval is required.');
    const input = provisionSchema.parse(request.data);
    const callbackOrigins = await Promise.all(input.callbackOrigins.map(async (value) => (await validateCallbackUrl(value)).origin));
    const buttonOrigins = await Promise.all(input.buttonOrigins.map(async (value) => (await validateCallbackUrl(value)).origin));
    const apiKey = `pp_${input.environment === 'PRODUCTION' ? 'live' : 'test'}_${(0, helpers_1.randomToken)(32)}`;
    const publishableKey = `pp_pub_${input.environment === 'PRODUCTION' ? 'live' : 'sandbox'}_${(0, helpers_1.randomToken)(24)}`;
    const webhookSigningSecret = `whsec_${(0, helpers_1.randomToken)(32)}`;
    const ref = config_1.db.collection('platformIntegrations').doc();
    await ref.set({
        id: ref.id,
        name: input.name,
        platform: input.platform,
        environment: input.environment,
        apiKeyHash: (0, helpers_1.hash)(apiKey),
        webhookSigningSecret,
        callbackOrigins: Array.from(new Set(callbackOrigins)),
        allowedOrigins: Array.from(new Set(buttonOrigins)),
        publishableKeyHash: (0, helpers_1.hash)(publishableKey),
        status: 'ACTIVE',
        createdBy: request.auth.uid,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return { integrationId: ref.id, apiKey, webhookSigningSecret, publishableKey, allowedOrigins: Array.from(new Set(buttonOrigins)) };
});
exports.handleMarketplaceOrder = (0, https_1.onRequest)({ cors: false, timeoutSeconds: 30 }, async (req, res) => {
    (0, http_security_1.applySecurityHeaders)(res);
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'method_not_allowed' });
        return;
    }
    try {
        const authorization = req.get('authorization') ?? '';
        const apiKey = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
        if (!apiKey.startsWith('pp_')) {
            res.status(401).json({ error: 'invalid_api_key' });
            return;
        }
        const integrationQuery = await config_1.db.collection('platformIntegrations').where('apiKeyHash', '==', (0, helpers_1.hash)(apiKey)).limit(1).get();
        if (integrationQuery.empty) {
            res.status(401).json({ error: 'invalid_api_key' });
            return;
        }
        const integrationDoc = integrationQuery.docs[0];
        const integration = integrationDoc.data();
        if (integration.status !== 'ACTIVE') {
            res.status(403).json({ error: 'integration_disabled' });
            return;
        }
        const input = validation_1.connectOrderSchema.parse(req.body);
        await validateCallbackUrl(input.callbackUrl, integration.callbackOrigins);
        const result = await commerceContextService.ingestConnectOrder({
            integrationId: integrationDoc.id,
            platform: String(integration.platform),
            webhookSigningSecret: String(integration.webhookSigningSecret),
        }, input, req.get('x-request-id') ?? (0, node_crypto_1.randomUUID)());
        const verificationUrl = `${config_1.connectLinkBaseUrl.value().replace(/\/$/, '')}/connect/capture?session=${encodeURIComponent(result.sessionId)}&token=${encodeURIComponent(result.sessionToken)}`;
        res.status(result.replayed ? 200 : 201).json({
            success: true,
            sessionId: result.sessionId,
            verificationUrl,
            expiresAt: result.expiresAt.toISOString(),
            ...(result.replayed ? { idempotentReplay: true } : {}),
        });
    }
    catch (error) {
        if (error instanceof validation_1.ValidationError) {
            res.status(400).json({ error: 'invalid_payload', details: error.issues });
            return;
        }
        if (error instanceof errors_1.ApplicationError) {
            const status = error.category === 'FORBIDDEN' ? 403 : error.category === 'CONFLICT' ? 409 : 400;
            const compatibilityCode = error.code === 'IDEMPOTENCY_KEY_REUSED' ? 'idempotency_conflict'
                : error.code === 'PLATFORM_MISMATCH' ? 'platform_mismatch'
                    : error.code.toLowerCase();
            res.status(status).json({ error: compatibilityCode, message: error.message });
            return;
        }
        if (error instanceof https_1.HttpsError) {
            const statusByCode = {
                'invalid-argument': 400,
                'failed-precondition': 400,
                'unauthenticated': 401,
                'permission-denied': 403,
                'not-found': 404,
                'already-exists': 409,
                'resource-exhausted': 429,
            };
            res.status(statusByCode[error.code] ?? 500).json({ error: error.code, message: error.message });
            return;
        }
        console.error(JSON.stringify({
            severity: 'ERROR',
            message: 'packproof_connect_ingestion_failed',
            errorType: error instanceof Error ? error.name : typeof error,
        }));
        res.status(500).json({ error: 'internal_error' });
    }
});
exports.redeemConnectSession = (0, https_1.onCall)({ enforceAppCheck: true }, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    const input = validation_1.redeemConnectSchema.parse(request.data);
    try {
        return await connectHandoffService.redeem({
            actorId: uid,
            sessionId: input.sessionId,
            token: input.token,
            clientId: input.clientId,
            redirectUri: input.redirectUri,
            codeVerifier: input.codeVerifier,
            requestId: request.rawRequest.get('x-request-id') ?? (0, node_crypto_1.randomUUID)(),
        });
    }
    catch (error) {
        return (0, callable_errors_1.throwCallableError)(error);
    }
});
exports.redeemPublicCommerceHandoff = (0, https_1.onCall)({ enforceAppCheck: true, invoker: 'public' }, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    const profile = await (0, helpers_1.assertAccountActive)(uid);
    const input = validation_1.redeemPublicCommerceHandoffSchema.parse(request.data);
    try {
        return await publicCommerceHandoffService.redeem({
            actorId: uid,
            plan: String(profile.plan ?? 'FREE'),
            handoffId: input.handoffId,
            token: input.token,
            requestId: request.rawRequest.get('x-request-id') ?? (0, node_crypto_1.randomUUID)(),
        });
    }
    catch (error) {
        return (0, callable_errors_1.throwCallableError)(error);
    }
});
async function deliverCallback(deliveryRef, delivery) {
    const integrationSnap = await config_1.db.collection('platformIntegrations').doc(String(delivery.integrationId)).get();
    if (!integrationSnap.exists)
        throw new Error('Connect integration no longer exists.');
    const signingSecret = String(integrationSnap.data()?.webhookSigningSecret ?? '');
    await validateCallbackUrl(String(delivery.callbackUrl), integrationSnap.data()?.callbackOrigins);
    const payload = { ...delivery.payload, timestamp: new Date().toISOString() };
    let dossierUrlExpiresAt = null;
    if (typeof delivery.dossierStoragePath === 'string') {
        const expiresAtMs = Date.now() + 15 * 60_000;
        const [dossierUrl] = await config_1.storage.bucket().file(delivery.dossierStoragePath).getSignedUrl({ action: 'read', expires: expiresAtMs });
        payload.dossierUrl = dossierUrl;
        dossierUrlExpiresAt = new Date(expiresAtMs).toISOString();
        payload.dossierUrlExpiresAt = dossierUrlExpiresAt;
    }
    const body = JSON.stringify(payload);
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signature = (0, node_crypto_1.createHmac)('sha256', signingSecret).update(`${timestamp}.${body}`).digest('hex');
    const response = await fetch(String(delivery.callbackUrl), {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'PackProof-Connect/1.0',
            'X-PackProof-Timestamp': timestamp,
            'X-PackProof-Signature': `v1=${signature}`,
            'X-PackProof-Delivery': deliveryRef.id,
        },
        body,
        signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
        throw new Error(`Callback returned HTTP ${response.status}.`);
    await deliveryRef.set({
        status: 'DELIVERED',
        deliveredAt: firestore_1.FieldValue.serverTimestamp(),
        responseStatus: response.status,
        deliveredPayloadSha256: (0, node_crypto_1.createHash)('sha256').update(body).digest('hex'),
        dossierUrlExpiresAt,
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    }, { merge: true });
}
exports.onConnectEvidenceVerified = (0, firestore_2.onDocumentCreated)('transactions/{transactionId}/evidence/{evidenceId}', async (event) => {
    const evidence = event.data?.data();
    if (!evidence || evidence.type !== 'PACKING_VIDEO')
        return;
    const transactionId = event.params.transactionId;
    const transactionSnap = await config_1.db.collection('transactions').doc(transactionId).get();
    const transaction = transactionSnap.data();
    if (!transaction?.source || transaction.source.type !== 'PACKPROOF_CONNECT')
        return;
    const deliveryRef = config_1.db.collection('webhookDeliveries').doc(`${transactionId}_${event.params.evidenceId}`);
    // Firestore create triggers are at-least-once. A deterministic delivery ID and
    // create-only record ensure one callback lifecycle per accepted evidence file.
    if ((await deliveryRef.get()).exists)
        return;
    const packet = await (0, evidence_1.generateEvidencePacket)(transactionId, 'PACKPROOF_CONNECT_SYSTEM');
    const payload = (0, connect_callback_1.buildConnectEvidenceFinalizedCallback)({
        orderId: String(transaction.source.externalOrderId),
        trackingNumber: transaction.shipping?.trackingNumber ?? transaction.source.trackingNumber ?? null,
        fileSha256: String(evidence.sha256),
        manifestSha256: typeof evidence.manifestSha256 === 'string' ? evidence.manifestSha256 : null,
        evidenceBundleSha256: typeof evidence.evidenceBundleSha256 === 'string' ? evidence.evidenceBundleSha256 : null,
        manifestAuthentication: evidence.manifestAuthentication ?? null,
        legacyManifestMac: typeof evidence.manifestSignature === 'string' ? evidence.manifestSignature : null,
        assurance: evidence.assurance && typeof evidence.assurance === 'object' ? evidence.assurance : null,
        attestationStatus: String(evidence.attestationStatus ?? ''),
        carrierTrackingMatchStatus: typeof evidence.carrierTrackingMatchStatus === 'string' ? evidence.carrierTrackingMatchStatus : null,
        declaredWeightGrams: transaction.source.declaredWeightGrams ?? null,
        dossierSha256: packet.sha256,
        serverFinalized: evidence.serverFinalized === true,
        clientHashMatched: evidence.clientHashMatched === true ? true : evidence.clientHashMatched === false ? false : null,
        clientSizeMatched: evidence.clientSizeMatched === true ? true : evidence.clientSizeMatched === false ? false : null,
        contentTypeMatched: evidence.contentTypeMatched === true ? true : evidence.contentTypeMatched === false ? false : null,
        trackingNumberWasSupplied: Boolean(transaction.source.trackingNumber),
        byteIntegrityStatus: evidence.assurance?.byteIntegrity?.status ?? null,
    });
    await deliveryRef.create({
        integrationId: transaction.source.integrationId,
        transactionId,
        evidenceId: event.params.evidenceId,
        callbackUrl: transaction.source.callbackUrl,
        payload,
        dossierStoragePath: packet.storagePath,
        status: 'PENDING',
        attempts: 1,
        // A process crash after this create is recovered by the scheduled worker.
        nextAttemptAt: (0, helpers_1.expiresIn)(300),
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    try {
        await deliverCallback(deliveryRef, (await deliveryRef.get()).data());
    }
    catch (error) {
        await deliveryRef.set({ status: 'FAILED', lastError: error instanceof Error ? error.message.slice(0, 500) : 'Unknown callback error.', nextAttemptAt: (0, helpers_1.expiresIn)(300), updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
    }
});
exports.retryConnectCallbacks = (0, scheduler_1.onSchedule)('every 5 minutes', async () => {
    await (0, connect_callback_retry_1.processDueConnectCallbacks)({
        firestore: config_1.db,
        deliver: deliverCallback,
    });
});
//# sourceMappingURL=platform-webhooks.js.map