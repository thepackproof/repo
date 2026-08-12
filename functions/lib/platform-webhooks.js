"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryConnectCallbacks = exports.onConnectEvidenceVerified = exports.redeemPublicCommerceHandoff = exports.redeemConnectSession = exports.handleMarketplaceOrder = exports.provisionConnectIntegration = void 0;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:dns/promises");
const node_net_1 = require("node:net");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const commerce_context_service_1 = require("./application/v1/commerce-context-service");
const connect_handoff_service_1 = require("./application/v1/connect-handoff-service");
const public_commerce_handoff_service_1 = require("./application/v1/public-commerce-handoff-service");
const errors_1 = require("./application/v1/errors");
const config_1 = require("./config");
const evidence_1 = require("./evidence");
const helpers_1 = require("./helpers");
const connect_session_token_issuer_1 = require("./infrastructure/crypto/connect-session-token-issuer");
const public_handoff_token_issuer_1 = require("./infrastructure/crypto/public-handoff-token-issuer");
const sha256_token_verifier_1 = require("./infrastructure/crypto/sha256-token-verifier");
const callable_errors_1 = require("./infrastructure/firebase/v1/callable-errors");
const connect_handoff_repository_1 = require("./infrastructure/firebase/v1/connect-handoff-repository");
const commerce_context_repository_1 = require("./infrastructure/firebase/v1/commerce-context-repository");
const public_commerce_handoff_repository_1 = require("./infrastructure/firebase/v1/public-commerce-handoff-repository");
const validation_1 = require("./validation");
const provisionSchema = validation_1.connectProvisionSchema;
const commerceContextService = new commerce_context_service_1.CommerceContextApplicationService(new commerce_context_repository_1.FirestoreCommerceContextRepository(config_1.db), new connect_session_token_issuer_1.HmacConnectSessionTokenIssuer());
const connectHandoffService = new connect_handoff_service_1.ConnectHandoffApplicationService(new connect_handoff_repository_1.FirestoreConnectHandoffRepository(config_1.db), new sha256_token_verifier_1.Sha256TokenVerifier());
const publicCommerceHandoffService = new public_commerce_handoff_service_1.PublicCommerceHandoffApplicationService(new public_commerce_handoff_repository_1.FirestorePublicCommerceHandoffRepository(config_1.db), new public_handoff_token_issuer_1.HmacPublicHandoffTokenIssuer(() => config_1.publicHandoffSigningSecret.value()), new sha256_token_verifier_1.Sha256TokenVerifier(), () => {
    const value = config_1.apiEnvironment.value();
    if (value !== 'sandbox' && value !== 'live')
        throw new Error('API_ENVIRONMENT must be sandbox or live.');
    return value;
});
function isPrivateAddress(address) {
    const value = address.toLowerCase().replace(/^::ffff:/, '');
    if ((0, node_net_1.isIP)(value) === 4) {
        const parts = value.split('.').map(Number);
        return parts[0] === 0 || parts[0] === 10 || parts[0] === 127 || parts[0] >= 224
            || (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
            || (parts[0] === 169 && parts[1] === 254)
            || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31)
            || (parts[0] === 192 && parts[1] === 0)
            || (parts[0] === 192 && parts[1] === 168)
            || (parts[0] === 198 && (parts[1] === 18 || parts[1] === 19))
            || (parts[0] === 198 && parts[1] === 51 && parts[2] === 100)
            || (parts[0] === 203 && parts[1] === 0 && parts[2] === 113);
    }
    if ((0, node_net_1.isIP)(value) === 6) {
        return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd')
            || /^fe[89ab]/.test(value) || value.startsWith('ff') || value.startsWith('2001:db8:');
    }
    return true;
}
async function validateCallbackUrl(callbackUrl, allowedOrigins) {
    const parsed = new URL(callbackUrl);
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password)
        throw new https_1.HttpsError('invalid-argument', 'Callback URL must use public HTTPS without embedded credentials.');
    if (allowedOrigins && !allowedOrigins.includes(parsed.origin))
        throw new https_1.HttpsError('permission-denied', 'Callback origin is not allowlisted for this integration.');
    if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local'))
        throw new https_1.HttpsError('invalid-argument', 'Callback hostname is not public.');
    const addresses = await (0, promises_1.lookup)(parsed.hostname, { all: true, verbatim: true }).catch(() => []);
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
        throw new https_1.HttpsError('invalid-argument', 'Callback hostname must resolve only to public network addresses.');
    }
    return parsed;
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
        console.error('PackProof Connect ingestion failed', error);
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
            requestId: request.rawRequest.get('x-request-id') ?? (0, node_crypto_1.randomUUID)(),
        });
    }
    catch (error) {
        return (0, callable_errors_1.throwCallableError)(error);
    }
});
exports.redeemPublicCommerceHandoff = (0, https_1.onCall)({ enforceAppCheck: true }, async (request) => {
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
    const trackingRequired = Boolean(transaction.source.trackingNumber);
    const trackingSatisfied = trackingRequired
        ? evidence.carrierTrackingMatchStatus === 'MATCHED'
        : evidence.carrierTrackingMatchStatus !== 'MISMATCH';
    const digitalEvidenceReady = evidence.serverFinalized === true
        && ['ONLINE_APP_CHECK_AND_KEY_POSSESSION', 'JIT_VERIFIED'].includes(String(evidence.attestationStatus))
        && evidence.clientHashMatched === true
        && evidence.clientSizeMatched === true
        && evidence.contentTypeMatched === true
        && evidence.assurance?.byteIntegrity?.status !== 'MISMATCH'
        && trackingSatisfied;
    const evidenceStatus = digitalEvidenceReady ? 'DIGITAL_EVIDENCE_READY' : 'DIGITAL_EVIDENCE_WITH_LIMITATIONS';
    const statusReasonCodes = [
        ...(evidence.serverFinalized === true ? [] : ['SERVER_FINALIZATION_NOT_RECORDED']),
        ...(['ONLINE_APP_CHECK_AND_KEY_POSSESSION', 'JIT_VERIFIED'].includes(String(evidence.attestationStatus)) ? [] : ['STRONGEST_APP_DEVICE_CONTEXT_NOT_AVAILABLE']),
        ...(evidence.clientHashMatched === true ? [] : ['CLIENT_SERVER_HASH_MATCH_NOT_ESTABLISHED']),
        ...(evidence.clientSizeMatched === true ? [] : ['CLIENT_SERVER_SIZE_MATCH_NOT_ESTABLISHED']),
        ...(evidence.contentTypeMatched === true ? [] : ['DECLARED_MEDIA_TYPE_MATCH_NOT_ESTABLISHED']),
        ...(trackingSatisfied ? [] : ['CARRIER_CONTEXT_REQUIREMENT_NOT_SATISFIED']),
        'PHYSICAL_CORRESPONDENCE_NOT_AVAILABLE',
        'BUSINESS_LEGAL_REVIEW_REQUIRED',
    ];
    const payload = {
        event: 'packproof.evidence.finalized',
        orderId: transaction.source.externalOrderId,
        trackingNumber: transaction.shipping?.trackingNumber ?? transaction.source.trackingNumber ?? null,
        evidenceStatus,
        statusReasonCodes,
        fileSha256: evidence.sha256,
        sha256Hash: evidence.sha256,
        manifestSha256: evidence.manifestSha256,
        evidenceBundleSha256: evidence.evidenceBundleSha256,
        manifestAuthentication: evidence.manifestAuthentication ?? {
            type: 'LEGACY_SERVICE_MAC',
            macBase64url: evidence.manifestSignature ?? null,
            verificationScope: 'PACKPROOF_SERVICE_ONLY',
        },
        assurance: evidence.assurance ?? null,
        attestationStatus: evidence.attestationStatus,
        carrierTrackingMatchStatus: evidence.carrierTrackingMatchStatus ?? 'NOT_SCANNED',
        declaredWeightGrams: transaction.source.declaredWeightGrams ?? null,
        dossierSha256: packet.sha256,
    };
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
    const due = await config_1.db.collection('webhookDeliveries').where('status', 'in', ['FAILED', 'PENDING']).limit(20).get();
    for (const doc of due.docs) {
        const delivery = await config_1.db.runTransaction(async (tx) => {
            const fresh = await tx.get(doc.ref);
            const data = fresh.data();
            if (!fresh.exists || !data || !['FAILED', 'PENDING'].includes(String(data.status)))
                return null;
            const nextAttemptAt = data.nextAttemptAt;
            if (nextAttemptAt && nextAttemptAt.toMillis() > Date.now())
                return null;
            tx.set(doc.ref, {
                status: 'PENDING',
                attempts: firestore_1.FieldValue.increment(1),
                // Lease the delivery so overlapping scheduler runs cannot double-send it.
                nextAttemptAt: (0, helpers_1.expiresIn)(120),
                updatedAt: firestore_1.FieldValue.serverTimestamp(),
            }, { merge: true });
            return data;
        });
        if (!delivery)
            continue;
        try {
            await deliverCallback(doc.ref, delivery);
        }
        catch (error) {
            const attempts = Number(delivery.attempts ?? 1) + 1;
            const delaySeconds = Math.min(6 * 3600, 300 * 2 ** Math.min(attempts, 6));
            await doc.ref.set({ status: 'FAILED', lastError: error instanceof Error ? error.message.slice(0, 500) : 'Unknown callback error.', nextAttemptAt: (0, helpers_1.expiresIn)(delaySeconds), updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
        }
    }
});
//# sourceMappingURL=platform-webhooks.js.map