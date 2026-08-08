"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.retryConnectCallbacks = exports.onConnectEvidenceVerified = exports.redeemConnectSession = exports.handleMarketplaceOrder = exports.provisionConnectIntegration = void 0;
const node_crypto_1 = require("node:crypto");
const promises_1 = require("node:dns/promises");
const node_net_1 = require("node:net");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const firestore_2 = require("firebase-functions/v2/firestore");
const scheduler_1 = require("firebase-functions/v2/scheduler");
const config_1 = require("./config");
const evidence_1 = require("./evidence");
const helpers_1 = require("./helpers");
const validation_1 = require("./validation");
const provisionSchema = validation_1.connectProvisionSchema;
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
function safeKeyEquals(actual, expected) {
    const a = Buffer.from(actual);
    const b = Buffer.from(expected);
    return a.length === b.length && (0, node_crypto_1.timingSafeEqual)(a, b);
}
exports.provisionConnectIntegration = (0, https_1.onCall)({ enforceAppCheck: true }, async (request) => {
    (0, helpers_1.requireUid)(request);
    if (request.auth?.token.packproofAdmin !== true)
        throw new https_1.HttpsError('permission-denied', 'PackProof administrator approval is required.');
    const input = provisionSchema.parse(request.data);
    const callbackOrigins = await Promise.all(input.callbackOrigins.map(async (value) => (await validateCallbackUrl(value)).origin));
    const apiKey = `pp_${input.environment === 'PRODUCTION' ? 'live' : 'test'}_${(0, helpers_1.randomToken)(32)}`;
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
        status: 'ACTIVE',
        createdBy: request.auth.uid,
        createdAt: firestore_1.FieldValue.serverTimestamp(),
        updatedAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return { integrationId: ref.id, apiKey, webhookSigningSecret };
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
        if (String(integration.platform).toLowerCase() !== input.platform.toLowerCase()) {
            res.status(403).json({ error: 'platform_mismatch' });
            return;
        }
        await validateCallbackUrl(input.callbackUrl, integration.callbackOrigins);
        const idempotencyHash = (0, node_crypto_1.createHash)('sha256').update(`${integrationDoc.id}\n${input.idempotencyKey}`).digest('hex');
        const requestPayloadHash = (0, node_crypto_1.createHash)('sha256').update(JSON.stringify(input)).digest('hex');
        const sessionRef = config_1.db.collection('connectSessions').doc(idempotencyHash);
        // Derive a stable handoff token so idempotent API retries can receive the
        // same URL without ever storing the plaintext token or URL in Firestore.
        const sessionToken = (0, node_crypto_1.createHmac)('sha256', String(integration.webhookSigningSecret))
            .update(`connect-session-token-v1\n${idempotencyHash}`)
            .digest('base64url');
        const verificationUrl = `${config_1.connectLinkBaseUrl.value().replace(/\/$/, '')}/connect/capture?session=${encodeURIComponent(sessionRef.id)}&token=${encodeURIComponent(sessionToken)}`;
        const expiresAt = (0, helpers_1.expiresIn)(7 * 86400);
        const sessionResult = await config_1.db.runTransaction(async (tx) => {
            const existing = await tx.get(sessionRef);
            if (existing.exists)
                return { created: false, data: existing.data() };
            const sessionData = {
                id: sessionRef.id,
                integrationId: integrationDoc.id,
                platform: input.platform,
                externalOrderId: input.orderId,
                externalSellerId: input.sellerId,
                trackingNumber: input.trackingNumber ?? null,
                carrier: input.carrier ?? null,
                itemTitle: input.itemTitle,
                itemDescription: input.itemDescription,
                declaredWeightGrams: input.declaredWeightGrams ?? null,
                priceMinor: input.priceMinor,
                currency: input.currency,
                callbackUrl: input.callbackUrl,
                tokenHash: (0, helpers_1.hash)(sessionToken),
                requestPayloadHash,
                status: 'PENDING_REDEMPTION',
                transactionId: null,
                claimedBy: null,
                createdAt: firestore_1.FieldValue.serverTimestamp(),
                expiresAt,
            };
            tx.create(sessionRef, sessionData);
            return { created: true, data: sessionData };
        });
        if (!sessionResult.created) {
            if (sessionResult.data.requestPayloadHash !== requestPayloadHash) {
                res.status(409).json({ error: 'idempotency_conflict', message: 'This idempotency key was already used with a different order payload.' });
                return;
            }
            res.status(200).json({
                success: true,
                sessionId: sessionRef.id,
                verificationUrl,
                expiresAt: sessionResult.data.expiresAt.toDate().toISOString(),
                idempotentReplay: true,
            });
            return;
        }
        res.status(201).json({ success: true, sessionId: sessionRef.id, verificationUrl, expiresAt: expiresAt.toDate().toISOString() });
    }
    catch (error) {
        if (error instanceof validation_1.ValidationError) {
            res.status(400).json({ error: 'invalid_payload', details: error.issues });
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
    const sessionRef = config_1.db.collection('connectSessions').doc(input.sessionId);
    const result = await config_1.db.runTransaction(async (tx) => {
        const snap = await tx.get(sessionRef);
        if (!snap.exists)
            throw new https_1.HttpsError('not-found', 'PackProof Connect session not found.');
        const session = snap.data();
        if (session.expiresAt.toMillis() < Date.now())
            throw new https_1.HttpsError('deadline-exceeded', 'PackProof Connect session expired.');
        if (session.claimedBy && session.claimedBy !== uid)
            throw new https_1.HttpsError('already-exists', 'This PackProof Connect session was claimed by another account.');
        if (session.claimedBy === uid && session.transactionId)
            return { transactionId: String(session.transactionId), connectSessionId: input.sessionId };
        if (!safeKeyEquals((0, helpers_1.hash)(input.token), String(session.tokenHash)))
            throw new https_1.HttpsError('permission-denied', 'Invalid PackProof Connect handoff token.');
        const transactionRef = config_1.db.collection('transactions').doc();
        tx.set(transactionRef, {
            sellerId: uid,
            buyerId: null,
            participantIds: [uid],
            status: 'TERMS_LOCKED',
            title: session.itemTitle,
            category: 'Platform order',
            description: session.itemDescription ?? '',
            priceMinor: session.priceMinor ?? 0,
            currency: session.currency ?? 'USD',
            identifiers: [{ label: 'External order ID', value: session.externalOrderId }],
            conditionNotes: '',
            terms: { saleType: 'SHIPPED', shippingResponsibility: 'SELLER', returns: 'PLATFORM_POLICY', returnWindowDays: 0, customTerms: `Order imported from ${session.platform}.` },
            confirmedBy: [uid],
            handoffConfirmedBy: [],
            completedBy: [],
            lockedAt: firestore_1.FieldValue.serverTimestamp(),
            createdAt: firestore_1.FieldValue.serverTimestamp(),
            updatedAt: firestore_1.FieldValue.serverTimestamp(),
            source: {
                type: 'PACKPROOF_CONNECT',
                platform: session.platform,
                integrationId: session.integrationId,
                connectSessionId: input.sessionId,
                externalOrderId: session.externalOrderId,
                externalSellerId: session.externalSellerId,
                callbackUrl: session.callbackUrl,
                trackingNumber: session.trackingNumber ?? null,
                carrier: session.carrier ?? null,
                declaredWeightGrams: session.declaredWeightGrams ?? null,
            },
        });
        tx.update(sessionRef, { claimedBy: uid, transactionId: transactionRef.id, status: 'READY_FOR_CAPTURE', claimedAt: firestore_1.FieldValue.serverTimestamp(), tokenHash: firestore_1.FieldValue.delete() });
        return { transactionId: transactionRef.id, connectSessionId: input.sessionId };
    });
    return result;
});
async function deliverCallback(deliveryRef, delivery) {
    const integrationSnap = await config_1.db.collection('platformIntegrations').doc(String(delivery.integrationId)).get();
    if (!integrationSnap.exists)
        throw new Error('Connect integration no longer exists.');
    const signingSecret = String(integrationSnap.data()?.webhookSigningSecret ?? '');
    await validateCallbackUrl(String(delivery.callbackUrl), integrationSnap.data()?.callbackOrigins);
    const body = JSON.stringify(delivery.payload);
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
    await deliveryRef.set({ status: 'DELIVERED', deliveredAt: firestore_1.FieldValue.serverTimestamp(), responseStatus: response.status, updatedAt: firestore_1.FieldValue.serverTimestamp() }, { merge: true });
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
    const [dossierUrl] = await config_1.storage.bucket().file(packet.storagePath).getSignedUrl({ action: 'read', expires: Date.now() + 7 * 86400_000 });
    const trackingRequired = Boolean(transaction.source.trackingNumber);
    const trackingSatisfied = trackingRequired
        ? evidence.carrierTrackingMatchStatus === 'MATCHED'
        : evidence.carrierTrackingMatchStatus !== 'MISMATCH';
    const verificationStatus = evidence.serverVerified === true
        && evidence.attestationStatus === 'JIT_VERIFIED'
        && evidence.clientHashMatched === true
        && evidence.clientSizeMatched === true
        && trackingSatisfied
        ? 'VERIFIED_FULFILLMENT'
        : 'VERIFIED_WITH_LIMITATIONS';
    const payload = {
        event: 'packproof.verification.completed',
        orderId: transaction.source.externalOrderId,
        trackingNumber: transaction.shipping?.trackingNumber ?? transaction.source.trackingNumber ?? null,
        verificationStatus,
        sha256Hash: evidence.sha256,
        manifestSha256: evidence.manifestSha256,
        evidenceBundleSha256: evidence.evidenceBundleSha256,
        manifestSignature: evidence.manifestSignature,
        attestationStatus: evidence.attestationStatus,
        carrierTrackingMatchStatus: evidence.carrierTrackingMatchStatus ?? 'NOT_SCANNED',
        declaredWeightGrams: transaction.source.declaredWeightGrams ?? null,
        dossierUrl,
        dossierSha256: packet.sha256,
        timestamp: new Date().toISOString(),
    };
    await deliveryRef.create({
        integrationId: transaction.source.integrationId,
        transactionId,
        evidenceId: event.params.evidenceId,
        callbackUrl: transaction.source.callbackUrl,
        payload,
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