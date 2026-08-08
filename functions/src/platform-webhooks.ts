import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall, onRequest } from 'firebase-functions/v2/https';
import { onDocumentCreated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { connectLinkBaseUrl, db, storage } from './config';
import { generateEvidencePacket } from './evidence';
import { expiresIn, hash, randomToken, requireUid } from './helpers';
import { connectOrderSchema, connectProvisionSchema, redeemConnectSchema, ValidationError } from './validation';

const provisionSchema = connectProvisionSchema;

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

function safeKeyEquals(actual: string, expected: string): boolean {
  const a = Buffer.from(actual);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const provisionConnectIntegration = onCall({ enforceAppCheck: true }, async (request) => {
  requireUid(request);
  if (request.auth?.token.packproofAdmin !== true) throw new HttpsError('permission-denied', 'PackProof administrator approval is required.');
  const input = provisionSchema.parse(request.data);
  const callbackOrigins = await Promise.all(input.callbackOrigins.map(async (value) => (await validateCallbackUrl(value)).origin));
  const apiKey = `pp_${input.environment === 'PRODUCTION' ? 'live' : 'test'}_${randomToken(32)}`;
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
    status: 'ACTIVE',
    createdBy: request.auth!.uid,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  return { integrationId: ref.id, apiKey, webhookSigningSecret };
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
    if (String(integration.platform).toLowerCase() !== input.platform.toLowerCase()) { res.status(403).json({ error: 'platform_mismatch' }); return; }
    await validateCallbackUrl(input.callbackUrl, integration.callbackOrigins as string[]);

    const idempotencyHash = createHash('sha256').update(`${integrationDoc.id}\n${input.idempotencyKey}`).digest('hex');
    const requestPayloadHash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
    const sessionRef = db.collection('connectSessions').doc(idempotencyHash);
    // Derive a stable handoff token so idempotent API retries can receive the
    // same URL without ever storing the plaintext token or URL in Firestore.
    const sessionToken = createHmac('sha256', String(integration.webhookSigningSecret))
      .update(`connect-session-token-v1\n${idempotencyHash}`)
      .digest('base64url');
    const verificationUrl = `${connectLinkBaseUrl.value().replace(/\/$/, '')}/connect/capture?session=${encodeURIComponent(sessionRef.id)}&token=${encodeURIComponent(sessionToken)}`;
    const expiresAt = expiresIn(7 * 86400);
    const sessionResult = await db.runTransaction(async (tx) => {
      const existing = await tx.get(sessionRef);
      if (existing.exists) return { created: false, data: existing.data()! };
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
        tokenHash: hash(sessionToken),
        requestPayloadHash,
        status: 'PENDING_REDEMPTION',
        transactionId: null,
        claimedBy: null,
        createdAt: FieldValue.serverTimestamp(),
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
        expiresAt: (sessionResult.data.expiresAt as Timestamp).toDate().toISOString(),
        idempotentReplay: true,
      });
      return;
    }
    res.status(201).json({ success: true, sessionId: sessionRef.id, verificationUrl, expiresAt: expiresAt.toDate().toISOString() });
  } catch (error) {
    if (error instanceof ValidationError) { res.status(400).json({ error: 'invalid_payload', details: error.issues }); return; }
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
  const sessionRef = db.collection('connectSessions').doc(input.sessionId);
  const result = await db.runTransaction(async (tx) => {
    const snap = await tx.get(sessionRef);
    if (!snap.exists) throw new HttpsError('not-found', 'PackProof Connect session not found.');
    const session = snap.data()!;
    if ((session.expiresAt as Timestamp).toMillis() < Date.now()) throw new HttpsError('deadline-exceeded', 'PackProof Connect session expired.');
    if (session.claimedBy && session.claimedBy !== uid) throw new HttpsError('already-exists', 'This PackProof Connect session was claimed by another account.');
    if (session.claimedBy === uid && session.transactionId) return { transactionId: String(session.transactionId), connectSessionId: input.sessionId };
    if (!safeKeyEquals(hash(input.token), String(session.tokenHash))) throw new HttpsError('permission-denied', 'Invalid PackProof Connect handoff token.');

    const transactionRef = db.collection('transactions').doc();
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
      lockedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
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
    tx.update(sessionRef, { claimedBy: uid, transactionId: transactionRef.id, status: 'READY_FOR_CAPTURE', claimedAt: FieldValue.serverTimestamp(), tokenHash: FieldValue.delete() });
    return { transactionId: transactionRef.id, connectSessionId: input.sessionId };
  });
  return result;
});

async function deliverCallback(deliveryRef: FirebaseFirestore.DocumentReference, delivery: FirebaseFirestore.DocumentData): Promise<void> {
  const integrationSnap = await db.collection('platformIntegrations').doc(String(delivery.integrationId)).get();
  if (!integrationSnap.exists) throw new Error('Connect integration no longer exists.');
  const signingSecret = String(integrationSnap.data()?.webhookSigningSecret ?? '');
  await validateCallbackUrl(String(delivery.callbackUrl), integrationSnap.data()?.callbackOrigins as string[] | undefined);
  const body = JSON.stringify(delivery.payload);
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
  await deliveryRef.set({ status: 'DELIVERED', deliveredAt: FieldValue.serverTimestamp(), responseStatus: response.status, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
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
  const [dossierUrl] = await storage.bucket().file(packet.storagePath).getSignedUrl({ action: 'read', expires: Date.now() + 7 * 86400_000 });
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
