import { createHash, createHmac, randomUUID } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { CommerceContextApplicationService } from './application/v1/commerce-context-service';
import { ConnectHandoffApplicationService } from './application/v1/connect-handoff-service';
import { PublicCommerceHandoffApplicationService } from './application/v1/public-commerce-handoff-service';
import { ApplicationError } from './application/v1/errors';
import { apiEnvironment, connectLinkBaseUrl, db, publicHandoffSigningSecret, storage } from './config';
import { generateEvidencePacket } from './evidence';
import { assertAccountActive, expiresIn, hash, randomToken, requireUid } from './helpers';
import { HmacConnectSessionTokenIssuer } from './infrastructure/crypto/connect-session-token-issuer';
import { HmacPublicHandoffTokenIssuer } from './infrastructure/crypto/public-handoff-token-issuer';
import { Sha256TokenVerifier } from './infrastructure/crypto/sha256-token-verifier';
import { throwCallableError } from './infrastructure/firebase/v1/callable-errors';
import { FirestoreConnectHandoffRepository } from './infrastructure/firebase/v1/connect-handoff-repository';
import { FirestoreCommerceContextRepository } from './infrastructure/firebase/v1/commerce-context-repository';
import { FirestorePublicCommerceHandoffRepository } from './infrastructure/firebase/v1/public-commerce-handoff-repository';
import { connectOrderSchema, connectProvisionSchema, redeemConnectSchema, redeemPublicCommerceHandoffSchema, ValidationError } from './validation';

const provisionSchema = connectProvisionSchema;
const commerceContextService = new CommerceContextApplicationService(
  new FirestoreCommerceContextRepository(db),
  new HmacConnectSessionTokenIssuer(),
);
const connectHandoffService = new ConnectHandoffApplicationService(
  new FirestoreConnectHandoffRepository(db),
  new Sha256TokenVerifier(),
);
const publicCommerceHandoffService = new PublicCommerceHandoffApplicationService(
  new FirestorePublicCommerceHandoffRepository(db),
  new HmacPublicHandoffTokenIssuer(() => publicHandoffSigningSecret.value()),
  new Sha256TokenVerifier(),
  () => {
    const value = apiEnvironment.value();
    if (value !== 'sandbox' && value !== 'live') throw new Error('API_ENVIRONMENT must be sandbox or live.');
    return value;
  },
);

function isPrivateAddress(address: string): boolean {
  const value = address.toLowerCase().replace(/^::ffff:/, '');
  if (isIP(value) === 4) {
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
  if (isIP(value) === 6) {
    return value === '::' || value === '::1' || value.startsWith('fc') || value.startsWith('fd')
      || /^fe[89ab]/.test(value) || value.startsWith('ff') || value.startsWith('2001:db8:');
  }
  return true;
}

async function validateCallbackUrl(callbackUrl: string, allowedOrigins?: string[]): Promise<URL> {
  const parsed = new URL(callbackUrl);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password) throw new HttpsError('invalid-argument', 'Callback URL must use public HTTPS without embedded credentials.');
  if (allowedOrigins && !allowedOrigins.includes(parsed.origin)) throw new HttpsError('permission-denied', 'Callback origin is not allowlisted for this integration.');
  if (parsed.hostname === 'localhost' || parsed.hostname.endsWith('.local')) throw new HttpsError('invalid-argument', 'Callback hostname is not public.');
  const addresses = await lookup(parsed.hostname, { all: true, verbatim: true }).catch(() => []);
  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new HttpsError('invalid-argument', 'Callback hostname must resolve only to public network addresses.');
  }
  return parsed;
}

export const provisionConnectIntegration = onCall({ enforceAppCheck: true }, async (request) => {
  requireUid(request);
  if (request.auth?.token.packproofAdmin !== true) throw new HttpsError('permission-denied', 'PackProof administrator approval is required.');
  const input = provisionSchema.parse(request.data);
  const callbackOrigins = await Promise.all(input.callbackOrigins.map(async (value) => (await validateCallbackUrl(value)).origin));
  const buttonOrigins = await Promise.all(input.buttonOrigins.map(async (value) => (await validateCallbackUrl(value)).origin));
  const apiKey = `pp_${input.environment === 'PRODUCTION' ? 'live' : 'test'}_${randomToken(32)}`;
  const publishableKey = `pp_pub_${input.environment === 'PRODUCTION' ? 'live' : 'sandbox'}_${randomToken(24)}`;
  const webhookSigningSecret = `whsec_${randomToken(32)}`;
  const ref = db.collection('platformIntegrations').doc();
  await ref.set({
    id: ref.id,
    name: input.name,
    platform: input.platform,
    environment: input.environment,
    apiKeyHash: hash(apiKey),
    webhookSigningSecret,
    callbackOrigins: Array.from(new Set(callbackOrigins)),
    allowedOrigins: Array.from(new Set(buttonOrigins)),
    publishableKeyHash: hash(publishableKey),
    status: 'ACTIVE',
    createdBy: request.auth!.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { integrationId: ref.id, apiKey, webhookSigningSecret, publishableKey, allowedOrigins: Array.from(new Set(buttonOrigins)) };
});

export const handleMarketplaceOrder = onRequest({ cors: false, timeoutSeconds: 30 }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'method_not_allowed' }); return; }
  try {
    const authorization = req.get('authorization') ?? '';
    const apiKey = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';
    if (!apiKey.startsWith('pp_')) { res.status(401).json({ error: 'invalid_api_key' }); return; }
    const integrationQuery = await db.collection('platformIntegrations').where('apiKeyHash', '==', hash(apiKey)).limit(1).get();
    if (integrationQuery.empty) { res.status(401).json({ error: 'invalid_api_key' }); return; }
    const integrationDoc = integrationQuery.docs[0];
    const integration = integrationDoc.data();
    if (integration.status !== 'ACTIVE') { res.status(403).json({ error: 'integration_disabled' }); return; }
    const input = connectOrderSchema.parse(req.body);
    await validateCallbackUrl(input.callbackUrl, integration.callbackOrigins as string[]);
    const result = await commerceContextService.ingestConnectOrder({
      integrationId: integrationDoc.id,
      platform: String(integration.platform),
      webhookSigningSecret: String(integration.webhookSigningSecret),
    }, input, req.get('x-request-id') ?? randomUUID());
    const verificationUrl = `${connectLinkBaseUrl.value().replace(/\/$/, '')}/connect/capture?session=${encodeURIComponent(result.sessionId)}&token=${encodeURIComponent(result.sessionToken)}`;
    res.status(result.replayed ? 200 : 201).json({
      success: true,
      sessionId: result.sessionId,
      verificationUrl,
      expiresAt: result.expiresAt.toISOString(),
      ...(result.replayed ? { idempotentReplay: true } : {}),
    });
  } catch (error) {
    if (error instanceof ValidationError) { res.status(400).json({ error: 'invalid_payload', details: error.issues }); return; }
    if (error instanceof ApplicationError) {
      const status = error.category === 'FORBIDDEN' ? 403 : error.category === 'CONFLICT' ? 409 : 400;
      const compatibilityCode = error.code === 'IDEMPOTENCY_KEY_REUSED' ? 'idempotency_conflict'
        : error.code === 'PLATFORM_MISMATCH' ? 'platform_mismatch'
          : error.code.toLowerCase();
      res.status(status).json({ error: compatibilityCode, message: error.message });
      return;
    }
    if (error instanceof HttpsError) {
      const statusByCode: Partial<Record<typeof error.code, number>> = {
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

export const redeemConnectSession = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireUid(request);
  const input = redeemConnectSchema.parse(request.data);
  try {
    return await connectHandoffService.redeem({
      actorId: uid,
      sessionId: input.sessionId,
      token: input.token,
      requestId: request.rawRequest.get('x-request-id') ?? randomUUID(),
    });
  } catch (error) {
    return throwCallableError(error);
  }
});

export const redeemPublicCommerceHandoff = onCall({ enforceAppCheck: true }, async (request) => {
  const uid = requireUid(request);
  const profile = await assertAccountActive(uid);
  const input = redeemPublicCommerceHandoffSchema.parse(request.data);
  try {
    return await publicCommerceHandoffService.redeem({
      actorId: uid,
      plan: String(profile.plan ?? 'FREE'),
      handoffId: input.handoffId,
      token: input.token,
      requestId: request.rawRequest.get('x-request-id') ?? randomUUID(),
    });
  } catch (error) {
    return throwCallableError(error);
  }
});

async function deliverCallback(deliveryRef: FirebaseFirestore.DocumentReference, delivery: FirebaseFirestore.DocumentData): Promise<void> {
  const integrationSnap = await db.collection('platformIntegrations').doc(String(delivery.integrationId)).get();
  if (!integrationSnap.exists) throw new Error('Connect integration no longer exists.');
  const signingSecret = String(integrationSnap.data()?.webhookSigningSecret ?? '');
  await validateCallbackUrl(String(delivery.callbackUrl), integrationSnap.data()?.callbackOrigins as string[] | undefined);
  const payload = { ...delivery.payload, timestamp: new Date().toISOString() } as Record<string, unknown>;
  let dossierUrlExpiresAt: string | null = null;
  if (typeof delivery.dossierStoragePath === 'string') {
    const expiresAtMs = Date.now() + 15 * 60_000;
    const [dossierUrl] = await storage.bucket().file(delivery.dossierStoragePath).getSignedUrl({ action: 'read', expires: expiresAtMs });
    payload.dossierUrl = dossierUrl;
    dossierUrlExpiresAt = new Date(expiresAtMs).toISOString();
    payload.dossierUrlExpiresAt = dossierUrlExpiresAt;
  }
  const body = JSON.stringify(payload);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signature = createHmac('sha256', signingSecret).update(`${timestamp}.${body}`).digest('hex');
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
  if (!response.ok) throw new Error(`Callback returned HTTP ${response.status}.`);
  await deliveryRef.set({
    status: 'DELIVERED',
    deliveredAt: FieldValue.serverTimestamp(),
    responseStatus: response.status,
    deliveredPayloadSha256: createHash('sha256').update(body).digest('hex'),
    dossierUrlExpiresAt,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export const onConnectEvidenceVerified = onDocumentCreated('transactions/{transactionId}/evidence/{evidenceId}', async (event) => {
  const evidence = event.data?.data();
  if (!evidence || evidence.type !== 'PACKING_VIDEO') return;
  const transactionId = event.params.transactionId;
  const transactionSnap = await db.collection('transactions').doc(transactionId).get();
  const transaction = transactionSnap.data();
  if (!transaction?.source || transaction.source.type !== 'PACKPROOF_CONNECT') return;

  const deliveryRef = db.collection('webhookDeliveries').doc(`${transactionId}_${event.params.evidenceId}`);
  // Firestore create triggers are at-least-once. A deterministic delivery ID and
  // create-only record ensure one callback lifecycle per accepted evidence file.
  if ((await deliveryRef.get()).exists) return;
  const packet = await generateEvidencePacket(transactionId, 'PACKPROOF_CONNECT_SYSTEM');
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
    nextAttemptAt: expiresIn(300),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  try {
    await deliverCallback(deliveryRef, (await deliveryRef.get()).data()!);
  } catch (error) {
    await deliveryRef.set({ status: 'FAILED', lastError: error instanceof Error ? error.message.slice(0, 500) : 'Unknown callback error.', nextAttemptAt: expiresIn(300), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
});

export const retryConnectCallbacks = onSchedule('every 5 minutes', async () => {
  const due = await db.collection('webhookDeliveries').where('status', 'in', ['FAILED', 'PENDING']).limit(20).get();
  for (const doc of due.docs) {
    const delivery = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(doc.ref);
      const data = fresh.data();
      if (!fresh.exists || !data || !['FAILED', 'PENDING'].includes(String(data.status))) return null;
      const nextAttemptAt = data.nextAttemptAt as Timestamp | undefined;
      if (nextAttemptAt && nextAttemptAt.toMillis() > Date.now()) return null;
      tx.set(doc.ref, {
        status: 'PENDING',
        attempts: FieldValue.increment(1),
        // Lease the delivery so overlapping scheduler runs cannot double-send it.
        nextAttemptAt: expiresIn(120),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
      return data;
    });
    if (!delivery) continue;
    try {
      await deliverCallback(doc.ref, delivery);
    } catch (error) {
      const attempts = Number(delivery.attempts ?? 1) + 1;
      const delaySeconds = Math.min(6 * 3600, 300 * 2 ** Math.min(attempts, 6));
      await doc.ref.set({ status: 'FAILED', lastError: error instanceof Error ? error.message.slice(0, 500) : 'Unknown callback error.', nextAttemptAt: expiresIn(delaySeconds), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    }
  }
});
