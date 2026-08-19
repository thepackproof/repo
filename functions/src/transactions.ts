import { createHmac, createPublicKey, randomUUID, verify as verifySignature } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { ConsumerTransactionApplicationService } from './application/v1/consumer-transaction-service';
import { adminAuth, db, manifestSigningSecret, publicAppUrl, storage } from './config';
import { canonicalizeJson, deterministicUploadId, sha256Hex } from './evidence-format';
import { throwCallableError } from './infrastructure/firebase/v1/callable-errors';
import { FirestoreConsumerTransactionRepository } from './infrastructure/firebase/v1/consumer-transaction-repository';
import {
  appendEvent,
  assertAccountActive,
  assertParticipant,
  assertSeller,
  expiresIn,
  getTransaction,
  hash,
  notifyOtherParticipants,
  publicUser,
  randomToken,
  requireUid,
} from './helpers';
import { evidenceReadyForWorkflow, outboundPackingEvidenceTypes, outboundSealEvidenceTypes, SHIPMENT_PRECONDITION_MESSAGES, shipmentEvidenceDecision } from './package-seal-protocol';
import { asShippingTrackerObservation, hashShippingObservation, identifyTrackingNumber, SHIPPING_OBSERVATION_INTERPRETATION, type ShippingTrackerObservation } from './shipping-tracker';
import { inviteCodeSchema, reportSchema, shippingSchema, transactionDraftSchema, transactionIdSchema, uploadRequestSchema } from './validation';

const callOptions = { enforceAppCheck: true } as const;
const uploadCallOptions = { enforceAppCheck: true, secrets: [manifestSigningSecret] };
const consumerTransactionService = new ConsumerTransactionApplicationService(new FirestoreConsumerTransactionRepository(db));

type UploadGrant = {
  uploadId: string;
  storagePath: string;
  status: 'READY' | 'PROCESSING' | 'FINALIZED';
};

type PhysicalProfileInput = {
  profileId: 'PP-PHYSICAL-MATTE-V1';
  intendedUse: 'REFERENCE' | 'VERIFICATION';
  captureGroupId: string;
  frameIndex: number;
};

async function withStorageStatus(grant: Omit<UploadGrant, 'status'> & { status: 'READY' | 'FINALIZED' }, expiresAt: Timestamp) {
  if (grant.status === 'FINALIZED') return { ...grant, expiresAt: expiresAt.toDate().toISOString() };
  const [exists] = await storage.bucket().file(grant.storagePath).exists();
  return {
    ...grant,
    status: exists ? 'PROCESSING' as const : 'READY' as const,
    expiresAt: expiresAt.toDate().toISOString(),
  };
}


type DeviceKeyProofInput = {
  algorithm: 'SHA256withECDSA';
  keyAlias: string;
  publicKeySpkiBase64: string;
  challengeSignatureBase64: string;
  hardwareBacked: boolean;
};

function verifyDeviceKeyProof(proof: DeviceKeyProofInput, nonce: string): boolean {
  try {
    const publicKey = createPublicKey({ key: Buffer.from(proof.publicKeySpkiBase64, 'base64'), format: 'der', type: 'spki' });
    return verifySignature('sha256', Buffer.from(nonce, 'utf8'), publicKey, Buffer.from(proof.challengeSignatureBase64, 'base64'));
  } catch {
    return false;
  }
}

function normalizeTracking(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return normalized.length >= 3 ? normalized : null;
}

function privacySubnet(ip: string | undefined): string {
  const raw = (ip ?? 'unavailable').split(',')[0].trim().replace(/^::ffff:/, '');
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(raw);
  if (ipv4) return `${ipv4[1]}.${ipv4[2]}.${ipv4[3]}.0/24`;
  if (raw.includes(':')) return `${raw.split(':').slice(0, 4).join(':')}::/64`;
  return 'unavailable';
}

export const ensureUserProfile = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const authUser = await adminAuth.getUser(uid);
  const ref = db.collection('users').doc(uid);
  const snap = await ref.get();
  const providers = Array.from(new Set([
    ...((snap.data()?.providers as string[] | undefined) ?? []),
    ...authUser.providerData.map((provider) => provider.providerId),
  ]));
  const data = {
    ...publicUser(authUser),
    providers,
    updatedAt: FieldValue.serverTimestamp(),
    ...(snap.exists ? {} : { createdAt: FieldValue.serverTimestamp(), plan: 'FREE', moderationState: 'ACTIVE' }),
  };
  await ref.set(data, { merge: true });
  await db.collection('publicProfiles').doc(uid).set({ uid, displayName: data.displayName, photoURL: data.photoURL, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return {
    ...publicUser(authUser),
    providers,
    plan: snap.data()?.plan ?? 'FREE',
    deletionScheduledAt: snap.data()?.deletionScheduledAt ?? null,
  };
});

export const saveTransactionDraft = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const profile = await assertAccountActive(uid);
  const input = transactionDraftSchema.parse(request.data);
  try {
    return await consumerTransactionService.saveDraft({
      actorId: uid,
      plan: String(profile.plan ?? 'FREE'),
      input,
      requestId: request.rawRequest.get('x-request-id') ?? randomUUID(),
    });
  } catch (error) {
    return throwCallableError(error);
  }
});

export const cancelTransaction = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const { transactionId } = transactionIdSchema.parse(request.data);
  const ref = db.collection('transactions').doc(transactionId);

  const hadBuyer = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Transaction not found.');
    const record = snap.data() as Parameters<typeof assertSeller>[0] & { activeInviteHash?: string };
    assertSeller(record, uid);
    if (!['DRAFT', 'AWAITING_BUYER', 'TERMS_REVIEW'].includes(record.status)) {
      throw new HttpsError('failed-precondition', 'Only an unlocked PackProof can be cancelled.');
    }
    if (record.activeInviteHash) tx.delete(db.collection('invites').doc(record.activeInviteHash));
    tx.update(ref, {
      status: 'CANCELLED',
      confirmedBy: [],
      lockedAt: null,
      activeInviteHash: FieldValue.delete(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return Boolean(record.buyerId);
  });

  await appendEvent(transactionId, uid, 'TRANSACTION_CANCELLED', 'Seller cancelled the PackProof before the terms were locked.');
  if (hadBuyer) await notifyOtherParticipants(transactionId, uid, 'PackProof cancelled', 'The seller cancelled this PackProof before the terms were locked.');
  return { success: true };
});

export const createInvite = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  await assertAccountActive(uid);
  const { transactionId } = transactionIdSchema.parse(request.data);
  const { ref, data } = await getTransaction(transactionId);
  assertSeller(data, uid);
  if (data.buyerId) throw new HttpsError('already-exists', 'A buyer has already joined this transaction.');
  if (data.status === 'CANCELLED' || data.status === 'ARCHIVED') throw new HttpsError('failed-precondition', 'This transaction cannot be invited.');

  const code = randomToken(32);
  const codeHash = hash(code);
  const inviteRef = db.collection('invites').doc(codeHash);
  await db.runTransaction(async (tx) => {
    const fresh = (await tx.get(ref)).data() as typeof data | undefined;
    if (!fresh) throw new HttpsError('not-found', 'Transaction not found.');
    assertSeller(fresh, uid);
    if (fresh.buyerId) throw new HttpsError('already-exists', 'A buyer has already joined this transaction.');
    if (fresh.status === 'CANCELLED' || fresh.status === 'ARCHIVED') throw new HttpsError('failed-precondition', 'This transaction cannot be invited.');
    if (fresh.activeInviteHash) tx.delete(db.collection('invites').doc(fresh.activeInviteHash));
    tx.set(inviteRef, { transactionId, sellerId: uid, createdAt: FieldValue.serverTimestamp(), expiresAt: expiresIn(7 * 86400) });
    tx.update(ref, { status: 'AWAITING_BUYER', activeInviteHash: codeHash, updatedAt: FieldValue.serverTimestamp() });
  });
  await appendEvent(transactionId, uid, 'INVITE_CREATED', 'Seller created a private buyer invitation.');

  const url = `${publicAppUrl.value().replace(/\/$/, '')}/invite/?code=${encodeURIComponent(code)}`;
  return { code, url, expiresAt: new Date(Date.now() + 7 * 86400_000).toISOString() };
});

export const acceptInvite = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  await assertAccountActive(uid);
  const { code } = inviteCodeSchema.parse(request.data);
  const inviteRef = db.collection('invites').doc(hash(code));

  const result = await db.runTransaction(async (tx) => {
    const inviteSnap = await tx.get(inviteRef);
    if (!inviteSnap.exists) throw new HttpsError('not-found', 'This invitation is invalid or has already been used.');
    const invite = inviteSnap.data()!;
    if ((invite.expiresAt as Timestamp).toMillis() < Date.now()) throw new HttpsError('deadline-exceeded', 'This invitation has expired.');
    if (invite.sellerId === uid) throw new HttpsError('failed-precondition', 'The seller cannot accept their own invitation.');

    const transactionRef = db.collection('transactions').doc(invite.transactionId);
    const transactionSnap = await tx.get(transactionRef);
    if (!transactionSnap.exists) throw new HttpsError('not-found', 'Transaction not found.');
    const record = transactionSnap.data()!;
    if (record.buyerId && record.buyerId !== uid) throw new HttpsError('already-exists', 'Another buyer has already joined.');

    const blockedEitherWay = await Promise.all([
      tx.get(db.collection('users').doc(uid).collection('blocks').doc(record.sellerId)),
      tx.get(db.collection('users').doc(record.sellerId).collection('blocks').doc(uid)),
    ]);
    if (blockedEitherWay.some((snap) => snap.exists)) throw new HttpsError('permission-denied', 'This invitation is unavailable.');

    tx.update(transactionRef, { buyerId: uid, participantIds: [record.sellerId, uid], status: 'TERMS_REVIEW', confirmedBy: [], activeInviteHash: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    tx.delete(inviteRef);
    return { transactionId: transactionRef.id };
  });

  await appendEvent(result.transactionId, uid, 'BUYER_JOINED', 'Buyer joined the PackProof and can review the proposed terms.');
  await notifyOtherParticipants(result.transactionId, uid, 'Buyer joined your PackProof', 'Review the transaction before confirming the terms.');
  return result;
});

export const confirmTerms = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const { transactionId } = transactionIdSchema.parse(request.data);
  const ref = db.collection('transactions').doc(transactionId);

  const locked = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Transaction not found.');
    const record = snap.data() as Parameters<typeof assertParticipant>[0];
    assertParticipant(record, uid);
    if (!record.buyerId) throw new HttpsError('failed-precondition', 'A buyer must join before terms can be confirmed.');
    if (!['TERMS_REVIEW', 'TERMS_LOCKED'].includes(record.status)) throw new HttpsError('failed-precondition', 'Terms cannot be confirmed in this state.');

    const confirmedBy = Array.from(new Set([...(record.confirmedBy ?? []), uid]));
    const bothConfirmed = [record.sellerId, record.buyerId].every((id) => confirmedBy.includes(id));
    tx.update(ref, {
      confirmedBy,
      status: bothConfirmed ? 'TERMS_LOCKED' : 'TERMS_REVIEW',
      lockedAt: bothConfirmed ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return bothConfirmed;
  });

  await appendEvent(transactionId, uid, 'TERMS_CONFIRMED', locked ? 'Both parties confirmed and locked the transaction terms.' : 'A participant confirmed the proposed terms.');
  const { data: notified } = await getTransaction(transactionId);
  const actorIsSeller = uid === notified.sellerId;
  const shippedSale = notified.terms.saleType === 'SHIPPED';
  await notifyOtherParticipants(
    transactionId,
    uid,
    locked
      ? (actorIsSeller
        ? 'Both parties confirmed'
        : shippedSale ? 'Both parties confirmed — ready for packing' : 'Both parties confirmed')
      : 'Your turn',
    locked
      ? (actorIsSeller
        ? (shippedSale ? 'The seller is preparing the shipment. You don\'t need to do anything right now.' : 'Confirm when the item changes hands.')
        : (shippedSale ? 'Next, record the item being packed, sealed, and associated with its shipping label.' : 'Confirm when the item changes hands.'))
      : 'Review the sale details and confirm them.',
  );
  return { locked };
});

export const requestEvidenceUpload = onCall(uploadCallOptions, async (request) => {
  const uid = requireUid(request);
  await assertAccountActive(uid);
  const input = uploadRequestSchema.parse(request.data);
  const requestFingerprint = sha256Hex(canonicalizeJson({
    transactionId: input.transactionId,
    evidenceType: input.evidenceType,
    contentType: input.contentType,
    originalName: input.originalName,
    clientEvidenceId: input.clientEvidenceId ?? null,
    clientCreatedAt: input.clientCreatedAt ?? null,
    clientSha256: input.clientSha256 ?? null,
    clientSizeBytes: input.clientSizeBytes ?? null,
    captureSessionId: input.captureSessionId ?? null,
    returnPassportId: input.returnPassportId ?? null,
    connectSessionId: input.connectSessionId ?? null,
    manifest: input.manifest ?? null,
  }));
  const { data } = await getTransaction(input.transactionId);
  assertParticipant(data, uid);
  if (['COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(data.status) && !input.returnPassportId) {
    throw new HttpsError('failed-precondition', 'This transaction no longer accepts outbound evidence.');
  }

  const sellerOnly: string[] = ['ITEM_PHOTO', 'CONDITION_PHOTO', 'IDENTIFIER_PHOTO', 'COA_PHOTO', 'PACKING_VIDEO', 'SHIPPING_LABEL', 'PHYSICAL_REFERENCE_FRAME'];
  const buyerOnly: string[] = ['UNBOXING_VIDEO', 'DELIVERY_PHOTO', 'PHYSICAL_VERIFICATION_FRAME'];
  if (sellerOnly.includes(input.evidenceType) && data.sellerId !== uid) throw new HttpsError('permission-denied', 'Only the seller may upload that evidence type.');
  if (buyerOnly.includes(input.evidenceType) && data.buyerId !== uid) throw new HttpsError('permission-denied', 'Only the buyer may upload that evidence type.');
  if (['PACKING_VIDEO', 'SHIPPING_LABEL', 'UNBOXING_VIDEO'].includes(input.evidenceType) && !['TERMS_LOCKED', 'PACKED', 'SHIPPED', 'BUYER_REVIEW', 'DISPUTED'].includes(data.status)) {
    throw new HttpsError('failed-precondition', 'Both parties must lock the terms before fulfillment evidence is captured.');
  }
  if (input.evidenceType === 'DELIVERY_PHOTO') {
    const allowed = data.terms.saleType === 'LOCAL_HANDOFF'
      ? ['TERMS_LOCKED', 'SHIPPED', 'BUYER_REVIEW', 'DISPUTED']
      : ['SHIPPED', 'BUYER_REVIEW', 'DISPUTED'];
    if (!allowed.includes(data.status)) {
      throw new HttpsError('failed-precondition', 'Arrival package observations can be recorded after the item is marked shipped, or during a local handoff.');
    }
  }

  let returnPassport: FirebaseFirestore.DocumentData | null = null;
  if (input.evidenceType.startsWith('RETURN_')) {
    if (!input.returnPassportId) throw new HttpsError('invalid-argument', 'Return evidence requires a return passport.');
    const returnSnap = await db.collection('transactions').doc(input.transactionId).collection('returns').doc(input.returnPassportId).get();
    if (!returnSnap.exists) throw new HttpsError('not-found', 'Return passport not found.');
    const returnData = returnSnap.data()!;
    returnPassport = returnData;
    if (!(returnData.participantIds as string[]).includes(uid)) throw new HttpsError('permission-denied', 'You are not part of this return passport.');
    const returningParticipantId = returnData.returningParticipantId ?? data.buyerId;
    if (['RETURN_PACKING_VIDEO', 'RETURN_SHIPPING_LABEL'].includes(input.evidenceType) && returningParticipantId !== uid) {
      throw new HttpsError('permission-denied', 'Only the returning participant can add repacking or return-label evidence.');
    }
    if (input.evidenceType === 'RETURN_UNBOXING_VIDEO' && returnData.recipientId !== uid) {
      throw new HttpsError('permission-denied', 'Only the return recipient can record the returned-item unboxing.');
    }
    if (['CANCELLED', 'COMPLETED'].includes(String(returnData.status))) throw new HttpsError('failed-precondition', 'This return passport no longer accepts evidence.');
    if (input.evidenceType === 'RETURN_PACKING_VIDEO' && !['AUTHORIZED', 'PACKED'].includes(String(returnData.status))) {
      throw new HttpsError('failed-precondition', 'The return must be authorized before repacking.');
    }
    if (input.evidenceType === 'RETURN_SHIPPING_LABEL' && !['AUTHORIZED', 'PACKED'].includes(String(returnData.status))) {
      throw new HttpsError('failed-precondition', 'The return must be authorized before a seal reference can be recorded.');
    }
    if (input.evidenceType === 'RETURN_UNBOXING_VIDEO' && !['IN_TRANSIT', 'RECEIVED_REVIEW'].includes(String(returnData.status))) {
      throw new HttpsError('failed-precondition', 'The return must be in transit before unboxing.');
    }
  } else if (input.returnPassportId) {
    throw new HttpsError('invalid-argument', 'Return passport IDs may be used only with return evidence types.');
  }

  if (input.connectSessionId && data.source?.connectSessionId !== input.connectSessionId) {
    throw new HttpsError('permission-denied', 'PackProof API session mismatch.');
  }

  const isPhysicalFrame = input.evidenceType === 'PHYSICAL_REFERENCE_FRAME' || input.evidenceType === 'PHYSICAL_VERIFICATION_FRAME';
  const physicalProfile = input.manifest && 'physicalCaptureProfile' in input.manifest
    ? input.manifest.physicalCaptureProfile as PhysicalProfileInput | null
    : null;
  if (isPhysicalFrame && !physicalProfile) {
    throw new HttpsError('failed-precondition', 'Physical correspondence frames require the frozen physical capture profile in a v2 manifest.');
  }
  if (!isPhysicalFrame && physicalProfile) {
    throw new HttpsError('failed-precondition', 'The physical capture profile may be used only for physical correspondence frame evidence.');
  }
  if (input.evidenceType === 'PHYSICAL_REFERENCE_FRAME' && physicalProfile?.intendedUse !== 'REFERENCE') {
    throw new HttpsError('failed-precondition', 'Reference evidence must use a REFERENCE physical capture profile.');
  }
  if (input.evidenceType === 'PHYSICAL_VERIFICATION_FRAME' && physicalProfile?.intendedUse !== 'VERIFICATION') {
    throw new HttpsError('failed-precondition', 'Verification evidence must use a VERIFICATION physical capture profile.');
  }

  let captureSessionRef: FirebaseFirestore.DocumentReference | null = null;
  let boundEvidenceSessionRef: FirebaseFirestore.DocumentReference | null = null;
  let attestationSnapshot: Record<string, unknown> | null = null;
  if (input.captureSessionId) {
    captureSessionRef = db.collection('captureSessions').doc(input.captureSessionId);
    const captureSessionSnap = await captureSessionRef.get();
    const captureSession = captureSessionSnap.data();
    const redemptionExpiresAt = captureSession?.redemptionExpiresAt as Timestamp | undefined;
    const expired = !captureSessionSnap.exists || !redemptionExpiresAt || redemptionExpiresAt.toMillis() < Date.now();
    if (expired) throw new HttpsError('failed-precondition', 'Capture attestation session expired.');
    const sessionMode = captureSession?.sessionMode === 'BATCH' ? 'BATCH' : 'SINGLE';
    if (sessionMode === 'SINGLE' && captureSession?.usedAt && captureSession?.requestFingerprint !== requestFingerprint) {
      throw new HttpsError('failed-precondition', 'This attested capture is already bound to different evidence.');
    }
    if (captureSession?.uid !== uid || captureSession?.transactionId !== input.transactionId) throw new HttpsError('permission-denied', 'Capture attestation session mismatch.');
    if (typeof captureSession?.evidenceSessionId === 'string' && captureSession.evidenceSessionId) {
      boundEvidenceSessionRef = db.collection('evidenceSessions').doc(captureSession.evidenceSessionId);
      const evidenceSession = await boundEvidenceSessionRef.get();
      const evidenceSessionData = evidenceSession.data();
      if (!evidenceSession.exists || evidenceSessionData?.status !== 'CAPTURING'
        || evidenceSessionData?.actorId !== uid || evidenceSessionData?.transactionId !== input.transactionId) {
        throw new HttpsError('failed-precondition', 'The actor-bound evidence session is no longer active.');
      }
    }
    if ((captureSession?.returnPassportId ?? null) !== (input.returnPassportId ?? null)) throw new HttpsError('permission-denied', 'Return attestation context mismatch.');
    if ((captureSession?.connectSessionId ?? null) !== (input.connectSessionId ?? null)) throw new HttpsError('permission-denied', 'Connect attestation context mismatch.');
    if (input.manifest?.attestation.captureSessionId !== input.captureSessionId || input.manifest.attestation.nonce !== captureSession?.nonce) {
      throw new HttpsError('failed-precondition', 'The signed capture nonce does not match the attested session.');
    }
    const allowedEvidenceTypes = captureSession?.allowedEvidenceTypes;
    if (Array.isArray(allowedEvidenceTypes) && !allowedEvidenceTypes.includes(input.evidenceType)) {
      throw new HttpsError('permission-denied', 'This evidence type is outside the actor-bound evidence session authorization.');
    }
    const issuedAt = captureSession?.issuedAt as Timestamp | undefined;
    const captureWindowEndsAt = captureSession?.captureWindowEndsAt as Timestamp | undefined;
    const manifestStartedAt = input.manifest ? Date.parse(input.manifest.captureStartedAt) : Number.NaN;
    const manifestFinishedAt = input.manifest ? Date.parse(input.manifest.captureFinishedAt) : Number.NaN;
    if (!input.manifest || input.manifest.attestation.mode !== 'JIT_APP_CHECK' || !issuedAt || !captureWindowEndsAt) {
      throw new HttpsError('failed-precondition', 'Attested uploads require a complete capture manifest.');
    }
    if (manifestStartedAt < issuedAt.toMillis() - 30_000 || manifestStartedAt > captureWindowEndsAt.toMillis()) {
      throw new HttpsError('failed-precondition', 'Recording did not begin inside the attested capture window.');
    }
    if (manifestFinishedAt < manifestStartedAt || manifestFinishedAt - manifestStartedAt > 16 * 60_000) {
      throw new HttpsError('failed-precondition', 'Capture duration is inconsistent with the allowed recording window.');
    }
    if (captureSession?.runtimeArtifactHash && input.manifest.runtimeIntegrity.runtimeArtifactHash !== captureSession.runtimeArtifactHash) {
      throw new HttpsError('failed-precondition', 'Runtime integrity fingerprint changed after attestation.');
    }
    if (sessionMode === 'BATCH') {
      if (input.manifest.attestation.sessionMode !== 'BATCH'
        || input.manifest.attestation.maxEvidenceCount !== captureSession?.maxEvidenceCount
        || input.manifest.attestation.captureGroupId !== captureSession?.captureGroupId) {
        throw new HttpsError('failed-precondition', 'Batch attestation context changed after the session was issued.');
      }
      if (!physicalProfile || captureSession?.captureProfileId !== physicalProfile.profileId
        || captureSession?.captureGroupId !== physicalProfile.captureGroupId) {
        throw new HttpsError('failed-precondition', 'Physical capture profile or group changed after batch attestation.');
      }
      if (!isPhysicalFrame) {
        throw new HttpsError('failed-precondition', 'This batch capture session is reserved for physical correspondence frames.');
      }
    } else if (isPhysicalFrame) {
      throw new HttpsError('failed-precondition', 'Physical correspondence frames require a batch capture session.');
    }
    const deviceKeyProof = input.manifest.attestation.deviceKeyProof as DeviceKeyProofInput | null;
    const deviceKeySignatureValid = deviceKeyProof ? verifyDeviceKeyProof(deviceKeyProof, String(captureSession.nonce)) : null;
    if (deviceKeyProof && !deviceKeySignatureValid) {
      throw new HttpsError('failed-precondition', 'Device-key signature did not verify against the attested nonce.');
    }
    attestationSnapshot = {
      mode: 'JIT_APP_CHECK',
      captureSessionId: input.captureSessionId,
      evidenceSessionId: captureSession?.evidenceSessionId ?? null,
      nonce: captureSession.nonce,
      appId: captureSession.appId,
      issuedAt: captureSession.issuedAt ?? null,
      captureWindowEndsAt: captureSession.captureWindowEndsAt ?? null,
      tokenReplayDetected: Boolean(captureSession.tokenReplayDetected),
      deviceKeyProof: input.manifest.attestation.deviceKeyProof,
      deviceKeySignatureValid,
      sessionMode,
      maxEvidenceCount: captureSession?.maxEvidenceCount ?? 1,
      captureProfileId: captureSession?.captureProfileId ?? null,
      captureGroupId: captureSession?.captureGroupId ?? null,
    };
  } else if (input.manifest?.attestation.mode === 'JIT_APP_CHECK') {
    throw new HttpsError('failed-precondition', 'JIT-attested manifests require a valid capture session.');
  } else if (input.manifest) {
    attestationSnapshot = { ...input.manifest.attestation, mode: 'OFFLINE_UNATTESTED' };
  }

  const scannedTrackingNumber = normalizeTracking(input.manifest?.shippingLabel?.trackingNumber);
  const expectedTrackingNumber = normalizeTracking(
    returnPassport?.shipping?.trackingNumber ?? data.shipping?.trackingNumber ?? data.source?.trackingNumber,
  );
  const shippingLabel = input.manifest?.shippingLabel;
  const trackerObservation: ShippingTrackerObservation | null = scannedTrackingNumber && shippingLabel
    ? (() => {
      const identification = identifyTrackingNumber(
        typeof shippingLabel.rawDecodedValue === 'string' ? shippingLabel.rawDecodedValue : scannedTrackingNumber,
        scannedTrackingNumber,
      );
      const stillSha256 = typeof shippingLabel.still?.sha256 === 'string' ? shippingLabel.still.sha256 : null;
      const observationSha256 = hashShippingObservation({
        trackingNumber: scannedTrackingNumber,
        rawDecodedValue: typeof shippingLabel.rawDecodedValue === 'string' ? shippingLabel.rawDecodedValue : scannedTrackingNumber,
        symbology: typeof shippingLabel.symbology === 'string' ? shippingLabel.symbology : '',
        courierCode: identification.courierCode,
        trackerName: identification.trackerName,
        checksumValid: identification.checksumValid,
        publicTrackingUrl: identification.publicTrackingUrl,
        stillSha256,
      });
      const clientObservationSha256 = typeof shippingLabel.tracker?.sha256 === 'string' ? shippingLabel.tracker.sha256 : null;
      return asShippingTrackerObservation({
        lookupStatus: identification.lookupStatus,
        courierCode: identification.courierCode,
        courierName: identification.courierName,
        publicTrackingUrl: identification.publicTrackingUrl,
        stillSha256,
        stillCaptureStatus: shippingLabel.still?.captureStatus ?? null,
        observationSha256,
        clientObservationSha256,
        hashMatched: clientObservationSha256 ? clientObservationSha256 === observationSha256 : null,
        interpretation: SHIPPING_OBSERVATION_INTERPRETATION,
      });
    })()
    : null;
  const carrierContext = {
    scannedTrackingNumber,
    expectedTrackingNumber,
    carrier: returnPassport?.shipping?.carrier ?? data.shipping?.carrier ?? data.source?.carrier ?? null,
    declaredWeightGrams: data.source?.declaredWeightGrams ?? null,
    source: returnPassport?.shipping ? 'RETURN_SHIPPING' : data.shipping ? 'TRANSACTION_SHIPPING' : data.source?.trackingNumber ? 'PACKPROOF_CONNECT' : 'NONE',
    matchStatus: !scannedTrackingNumber ? 'NOT_SCANNED' : !expectedTrackingNumber ? 'NO_EXPECTED_TRACKING' : scannedTrackingNumber === expectedTrackingNumber ? 'MATCHED' : 'MISMATCH',
    tracker: trackerObservation,
  };
  const ingressSubnet = privacySubnet(request.rawRequest.ip);
  const ingressNetwork = {
    ipSubnetHmac: createHmac('sha256', manifestSigningSecret.value()).update(`v1\n${ingressSubnet}`).digest('hex'),
    privacyPrefix: ingressSubnet === 'unavailable' ? 'UNAVAILABLE' : ingressSubnet.endsWith('/24') ? 'IPV4_24' : 'IPV6_64',
    source: 'FUNCTION_INGRESS',
  };

  const grantExpiresAt = expiresIn(6 * 3600);
  const pendingBase = {
    transactionId: input.transactionId,
    uploaderId: uid,
    clientEvidenceId: input.clientEvidenceId ?? null,
    evidenceType: input.evidenceType,
    contentType: input.contentType,
    originalName: input.originalName.slice(0, 180),
    clientCreatedAt: input.clientCreatedAt ?? null,
    clientSha256: input.clientSha256 ?? null,
    clientSizeBytes: input.clientSizeBytes ?? null,
    captureSessionId: input.captureSessionId ?? null,
    returnPassportId: input.returnPassportId ?? null,
    connectSessionId: input.connectSessionId ?? null,
    clientManifest: input.manifest ?? null,
    attestationSnapshot,
    carrierContext,
    ingressNetwork,
    requestFingerprint,
  };

  if (captureSessionRef) {
    const grant = await db.runTransaction(async (tx) => {
      const fresh = await tx.get(captureSessionRef!);
      const session = fresh.data();
      const boundEvidenceSession = boundEvidenceSessionRef ? await tx.get(boundEvidenceSessionRef) : null;
      const freshRedemptionExpiresAt = session?.redemptionExpiresAt as Timestamp | undefined;
      if (!fresh.exists || !freshRedemptionExpiresAt || freshRedemptionExpiresAt.toMillis() < Date.now()) {
        throw new HttpsError('failed-precondition', 'Capture attestation session expired.');
      }
      if (session?.uid !== uid || session?.transactionId !== input.transactionId) {
        throw new HttpsError('permission-denied', 'Capture attestation session mismatch.');
      }
      if (boundEvidenceSession) {
        const evidenceSession = boundEvidenceSession.data();
        if (!boundEvidenceSession.exists || evidenceSession?.status !== 'CAPTURING'
          || evidenceSession?.actorId !== uid || evidenceSession?.transactionId !== input.transactionId) {
          throw new HttpsError('failed-precondition', 'The actor-bound evidence session is no longer active.');
        }
      }
      if ((session?.returnPassportId ?? null) !== (input.returnPassportId ?? null)
        || (session?.connectSessionId ?? null) !== (input.connectSessionId ?? null)) {
        throw new HttpsError('permission-denied', 'Capture attestation context mismatch.');
      }

      const freshSessionMode = session?.sessionMode === 'BATCH' ? 'BATCH' : 'SINGLE';
      if (freshSessionMode === 'BATCH') {
        if (!physicalProfile
          || session?.captureProfileId !== physicalProfile.profileId
          || session?.captureGroupId !== physicalProfile.captureGroupId
          || input.manifest?.attestation.sessionMode !== 'BATCH'
          || input.manifest.attestation.maxEvidenceCount !== session?.maxEvidenceCount
          || input.manifest.attestation.captureGroupId !== session?.captureGroupId) {
          throw new HttpsError('failed-precondition', 'Batch capture context changed before the evidence grant was bound.');
        }
        const fingerprints = Array.isArray(session?.requestFingerprints)
          ? session.requestFingerprints.filter((value: unknown): value is string => typeof value === 'string')
          : [];
        const bindings = session?.uploadBindings && typeof session.uploadBindings === 'object'
          ? session.uploadBindings as Record<string, string>
          : {};
        const frameBindings = session?.frameBindings && typeof session.frameBindings === 'object'
          ? session.frameBindings as Record<string, string>
          : {};
        const existingUploadId = bindings[requestFingerprint];
        if (existingUploadId) {
          const storagePath = `evidence/${input.transactionId}/${uid}/${existingUploadId}`;
          const evidenceRef = db.collection('transactions').doc(input.transactionId).collection('evidence').doc(existingUploadId);
          const pendingRef = db.collection('pendingUploads').doc(existingUploadId);
          const [evidenceSnap, pendingSnap] = await Promise.all([tx.get(evidenceRef), tx.get(pendingRef)]);
          if (evidenceSnap.exists) {
            if (evidenceSnap.data()?.requestFingerprint !== requestFingerprint) {
              throw new HttpsError('failed-precondition', 'The finalized batch frame identifier is bound to different evidence.');
            }
            return { uploadId: existingUploadId, storagePath, status: 'FINALIZED' as const };
          }
          if (pendingSnap.exists && pendingSnap.data()?.requestFingerprint !== requestFingerprint) {
            throw new HttpsError('failed-precondition', 'The reserved evidence grant does not match this batch frame.');
          }
          if (pendingSnap.exists) {
            tx.update(pendingRef, { reissuedAt: FieldValue.serverTimestamp(), expiresAt: grantExpiresAt });
          } else {
            tx.create(pendingRef, {
              ...pendingBase,
              uploadId: existingUploadId,
              storagePath,
              createdAt: FieldValue.serverTimestamp(),
              expiresAt: grantExpiresAt,
            });
          }
          return { uploadId: existingUploadId, storagePath, status: 'READY' as const };
        }

        const maxEvidenceCount = Math.min(Math.max(Number(session?.maxEvidenceCount ?? 1), 1), 24);
        if (fingerprints.length >= maxEvidenceCount) {
          throw new HttpsError('resource-exhausted', 'This attested capture batch has reached its evidence limit.');
        }
        const frameIndex = physicalProfile?.frameIndex;
        const frameKey = physicalProfile ? `${physicalProfile.intendedUse}:${frameIndex}` : null;
        if (!frameKey || frameIndex === undefined || frameBindings[frameKey]) {
          throw new HttpsError('failed-precondition', 'This physical capture frame position is missing or already bound.');
        }
        const uploadId = input.clientEvidenceId
          ? deterministicUploadId({ transactionId: input.transactionId, uploaderId: uid, clientEvidenceId: input.clientEvidenceId })
          : db.collection('pendingUploads').doc().id;
        const pendingRef = db.collection('pendingUploads').doc(uploadId);
        const evidenceRef = db.collection('transactions').doc(input.transactionId).collection('evidence').doc(uploadId);
        const storagePath = `evidence/${input.transactionId}/${uid}/${uploadId}`;
        const [evidenceSnap, pendingSnap] = await Promise.all([tx.get(evidenceRef), tx.get(pendingRef)]);
        if (evidenceSnap.exists || pendingSnap.exists) {
          const existingFingerprint = evidenceSnap.exists ? evidenceSnap.data()?.requestFingerprint : pendingSnap.data()?.requestFingerprint;
          if (existingFingerprint !== requestFingerprint) {
            throw new HttpsError('failed-precondition', 'The deterministic evidence identifier is already bound to different evidence.');
          }
          throw new HttpsError('failed-precondition', 'Batch binding state is incomplete for an existing evidence identifier.');
        }
        tx.create(pendingRef, {
          ...pendingBase,
          uploadId,
          storagePath,
          createdAt: FieldValue.serverTimestamp(),
          expiresAt: grantExpiresAt,
        });
        tx.update(captureSessionRef!, {
          usedAt: session?.usedAt ?? FieldValue.serverTimestamp(),
          requestFingerprints: [...fingerprints, requestFingerprint],
          uploadBindings: { ...bindings, [requestFingerprint]: uploadId },
          frameBindings: { ...frameBindings, [frameKey]: uploadId },
          lastBoundAt: FieldValue.serverTimestamp(),
        });
        return { uploadId, storagePath, status: 'READY' as const };
      }

      if (session?.usedAt) {
        if (!session.uploadId || session.requestFingerprint !== requestFingerprint) {
          throw new HttpsError('failed-precondition', 'This attested capture is already bound to different evidence.');
        }
        const uploadId = String(session.uploadId);
        const storagePath = `evidence/${input.transactionId}/${uid}/${uploadId}`;
        const evidenceRef = db.collection('transactions').doc(input.transactionId).collection('evidence').doc(uploadId);
        const pendingRef = db.collection('pendingUploads').doc(uploadId);
        const [evidenceSnap, pendingSnap] = await Promise.all([tx.get(evidenceRef), tx.get(pendingRef)]);
        if (evidenceSnap.exists) {
          if (evidenceSnap.data()?.requestFingerprint !== requestFingerprint) {
            throw new HttpsError('failed-precondition', 'The finalized evidence identifier is bound to different evidence.');
          }
          return { uploadId, storagePath, status: 'FINALIZED' as const };
        }
        if (pendingSnap.exists && pendingSnap.data()?.requestFingerprint !== requestFingerprint) {
          throw new HttpsError('failed-precondition', 'The reserved evidence grant does not match this capture.');
        }
        if (pendingSnap.exists) {
          // Preserve the first grant's request, attestation and ingress context.
          // A retry may extend authorization but cannot rewrite manifest inputs.
          tx.update(pendingRef, { reissuedAt: FieldValue.serverTimestamp(), expiresAt: grantExpiresAt });
        } else {
          tx.create(pendingRef, {
            ...pendingBase,
            uploadId,
            storagePath,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: grantExpiresAt,
          });
        }
        return { uploadId, storagePath, status: 'READY' as const };
      }

      const uploadId = input.clientEvidenceId
        ? deterministicUploadId({ transactionId: input.transactionId, uploaderId: uid, clientEvidenceId: input.clientEvidenceId })
        : db.collection('pendingUploads').doc().id;
      const pendingRef = db.collection('pendingUploads').doc(uploadId);
      const storagePath = `evidence/${input.transactionId}/${uid}/${uploadId}`;
      tx.create(pendingRef, {
        ...pendingBase,
        uploadId,
        storagePath,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: grantExpiresAt,
      });
      tx.update(captureSessionRef!, {
        usedAt: FieldValue.serverTimestamp(),
        uploadId,
        requestFingerprint,
      });
      return { uploadId, storagePath, status: 'READY' as const };
    });
    return withStorageStatus(grant, grantExpiresAt);
  }

  const uploadId = input.clientEvidenceId
    ? deterministicUploadId({ transactionId: input.transactionId, uploaderId: uid, clientEvidenceId: input.clientEvidenceId })
    : db.collection('pendingUploads').doc().id;
  const pendingRef = db.collection('pendingUploads').doc(uploadId);
  const storagePath = `evidence/${input.transactionId}/${uid}/${uploadId}`;
  const evidenceRef = db.collection('transactions').doc(input.transactionId).collection('evidence').doc(uploadId);
  const grant = await db.runTransaction(async (tx) => {
    const [evidenceSnap, pendingSnap] = await Promise.all([tx.get(evidenceRef), tx.get(pendingRef)]);
    if (evidenceSnap.exists) {
      if (evidenceSnap.data()?.requestFingerprint !== requestFingerprint) {
        throw new HttpsError('failed-precondition', 'The finalized evidence identifier is bound to different evidence.');
      }
      return { uploadId, storagePath, status: 'FINALIZED' as const };
    }
    if (pendingSnap.exists && pendingSnap.data()?.requestFingerprint !== requestFingerprint) {
      throw new HttpsError('failed-precondition', 'The reserved evidence identifier is bound to different evidence.');
    }
    if (pendingSnap.exists) {
      tx.update(pendingRef, { reissuedAt: FieldValue.serverTimestamp(), expiresAt: grantExpiresAt });
    } else {
      tx.create(pendingRef, {
        ...pendingBase,
        uploadId,
        storagePath,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: grantExpiresAt,
      });
    }
    return { uploadId, storagePath, status: 'READY' as const };
  });
  return withStorageStatus(grant, grantExpiresAt);

});

export const submitShipping = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const input = shippingSchema.parse(request.data);
  const { ref, data } = await getTransaction(input.transactionId);
  assertSeller(data, uid);
  const packingVideos = await ref.collection('evidence').where('type', 'in', [...outboundPackingEvidenceTypes]).get();
  const sealPhotos = await ref.collection('evidence').where('type', 'in', [...outboundSealEvidenceTypes]).get();
  const packingVideo = packingVideos.docs.find((item) => evidenceReadyForWorkflow(item.data()));
  const sealPhoto = sealPhotos.docs.find((item) => evidenceReadyForWorkflow(item.data()));
  const shipmentDecision = shipmentEvidenceDecision({ packingReady: Boolean(packingVideo), sealReady: Boolean(sealPhoto) });
  if (!shipmentDecision.ok || !packingVideo || !sealPhoto) {
    throw new HttpsError('failed-precondition', SHIPMENT_PRECONDITION_MESSAGES[shipmentDecision.ok ? 'SEAL_REFERENCE' : shipmentDecision.missing]);
  }
  if (!['PACKED', 'TERMS_LOCKED'].includes(data.status)) throw new HttpsError('failed-precondition', 'Shipping cannot be recorded in this state.');

  const packingEvidenceRef = packingVideo.ref;
  const sealEvidenceRef = sealPhoto.ref;
  const packingEvidence = packingVideo.data();
  const sealEvidence = sealPhoto.data();
  const scannedTrackingNumber = normalizeTracking(sealEvidence.scannedTrackingNumber) ?? normalizeTracking(packingEvidence.scannedTrackingNumber);
  const submittedTrackingNumber = normalizeTracking(input.trackingNumber);
  const labelEvidenceMatchStatus = !scannedTrackingNumber
    ? 'NOT_SCANNED'
    : scannedTrackingNumber === submittedTrackingNumber
      ? 'MATCHED'
      : 'MISMATCH';

  await db.runTransaction(async (tx) => {
    const [freshTransaction, freshPacking, freshSeal] = await Promise.all([tx.get(ref), tx.get(packingEvidenceRef), tx.get(sealEvidenceRef)]);
    if (!freshTransaction.exists || !freshPacking.exists || !freshSeal.exists) throw new HttpsError('failed-precondition', 'Shipping evidence changed before shipment could be recorded.');
    const freshData = freshTransaction.data()!;
    assertSeller(freshData as Parameters<typeof assertSeller>[0], uid);
    if (!['PACKED', 'TERMS_LOCKED'].includes(String(freshData.status))) throw new HttpsError('failed-precondition', 'Shipping cannot be recorded in this state.');
    if (!evidenceReadyForWorkflow(freshPacking.data())) throw new HttpsError('failed-precondition', 'The packing evidence no longer satisfies byte-integrity workflow requirements.');
    if (!evidenceReadyForWorkflow(freshSeal.data())) throw new HttpsError('failed-precondition', 'The seal-reference evidence no longer satisfies byte-integrity workflow requirements.');

    tx.update(ref, {
      status: 'SHIPPED',
      shipping: {
        carrier: input.carrier,
        trackingNumber: input.trackingNumber,
        shippedAt: FieldValue.serverTimestamp(),
        labelEvidenceMatchStatus,
        scannedTrackingNumber,
        packingEvidenceId: packingEvidenceRef.id,
        sealEvidenceId: sealEvidenceRef.id,
      },
      updatedAt: FieldValue.serverTimestamp(),
    });
    tx.update(packingEvidenceRef, {
      postSubmissionTrackingMatchStatus: labelEvidenceMatchStatus,
      postSubmissionExpectedTrackingNumber: submittedTrackingNumber,
      postSubmissionComparedAt: FieldValue.serverTimestamp(),
      ...(labelEvidenceMatchStatus === 'MISMATCH' && freshPacking.data()?.moderationStatus === 'UNREVIEWED'
        ? { moderationStatus: 'TRACKING_MISMATCH_REVIEW' }
        : {}),
    });
    tx.update(sealEvidenceRef, {
      postSubmissionTrackingMatchStatus: labelEvidenceMatchStatus,
      postSubmissionExpectedTrackingNumber: submittedTrackingNumber,
      postSubmissionComparedAt: FieldValue.serverTimestamp(),
      ...(labelEvidenceMatchStatus === 'MISMATCH' && freshSeal.data()?.moderationStatus === 'UNREVIEWED'
        ? { moderationStatus: 'TRACKING_MISMATCH_REVIEW' }
        : {}),
    });
  });
  await appendEvent(input.transactionId, uid, 'SHIPPED', `Seller recorded shipment with ${input.carrier}.`, {
    carrier: input.carrier,
    trackingNumber: input.trackingNumber,
    packingEvidenceId: packingEvidenceRef.id,
    sealEvidenceId: sealEvidenceRef.id,
    labelEvidenceMatchStatus,
    scannedTrackingNumber,
  });
  await notifyOtherParticipants(input.transactionId, uid, 'Package is in transit', 'The buyer will record the package when it arrives.');
  return { success: true, labelEvidenceMatchStatus };
});

export const markReceived = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const { transactionId } = transactionIdSchema.parse(request.data);
  const { ref, data } = await getTransaction(transactionId);
  assertParticipant(data, uid);
  if (data.buyerId !== uid) throw new HttpsError('permission-denied', 'Only the buyer can mark the item received.');
  if (data.status !== 'SHIPPED') throw new HttpsError('failed-precondition', 'This item is not currently marked as shipped.');
  await ref.update({ status: 'BUYER_REVIEW', receivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
  await appendEvent(transactionId, uid, 'RECEIVED', 'Buyer confirmed receipt of the shipment.');
  await notifyOtherParticipants(transactionId, uid, 'Buyer recorded delivery', 'The shipment is now in delivery review.');
  return { success: true };
});

export const confirmLocalHandoff = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const { transactionId } = transactionIdSchema.parse(request.data);
  const ref = db.collection('transactions').doc(transactionId);

  const completed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Transaction not found.');
    const record = snap.data() as Parameters<typeof assertParticipant>[0];
    assertParticipant(record, uid);
    if (record.terms.saleType !== 'LOCAL_HANDOFF') throw new HttpsError('failed-precondition', 'This transaction is not a local handoff.');
    if (record.status !== 'TERMS_LOCKED') throw new HttpsError('failed-precondition', 'Lock the terms before confirming the handoff.');
    if (!record.buyerId) throw new HttpsError('failed-precondition', 'A buyer must join before the handoff.');

    const handoffConfirmedBy = Array.from(new Set([...(record.handoffConfirmedBy ?? []), uid]));
    const both = [record.sellerId, record.buyerId].every((id) => handoffConfirmedBy.includes(id));
    tx.update(ref, {
      handoffConfirmedBy,
      status: both ? 'BUYER_REVIEW' : 'TERMS_LOCKED',
      handoffAt: both ? FieldValue.serverTimestamp() : null,
      updatedAt: FieldValue.serverTimestamp(),
    });
    return both;
  });

  await appendEvent(transactionId, uid, 'HANDOFF_CONFIRMED', completed ? 'Both parties confirmed the local handoff.' : 'A participant confirmed the local handoff.');
  await notifyOtherParticipants(transactionId, uid, completed ? 'Local handoff confirmed' : 'Handoff confirmation received', completed ? 'Both parties confirmed the item changed hands.' : 'Confirm the handoff in PackProof when it occurs.');
  return { completed };
});

export const completeTransaction = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const { transactionId } = transactionIdSchema.parse(request.data);
  const ref = db.collection('transactions').doc(transactionId);
  const completed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError('not-found', 'Transaction not found.');
    const record = snap.data() as Parameters<typeof assertParticipant>[0];
    assertParticipant(record, uid);
    if (!['BUYER_REVIEW', 'DISPUTED'].includes(record.status)) throw new HttpsError('failed-precondition', 'The transaction is not ready to complete.');
    const completedBy = Array.from(new Set([...(record.completedBy ?? []), uid]));
    const both = [record.sellerId, record.buyerId].filter(Boolean).every((id) => completedBy.includes(id!));
    tx.update(ref, { completedBy, status: both ? 'COMPLETED' : record.status, completedAt: both ? FieldValue.serverTimestamp() : null, updatedAt: FieldValue.serverTimestamp() });
    return both;
  });
  await appendEvent(transactionId, uid, 'COMPLETION_CONFIRMED', completed ? 'Both parties marked the PackProof complete.' : 'A participant marked the transaction complete.');
  await notifyOtherParticipants(transactionId, uid, completed ? 'PackProof complete' : 'Your turn', completed ? 'Your PackProof Passport is ready.' : 'Mark this PackProof complete.');
  return { completed };
});

export const raiseConcern = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const input = reportSchema.parse(request.data);
  const { ref, data } = await getTransaction(input.transactionId);
  assertParticipant(data, uid);
  const reportRef = db.collection('reports').doc();
  await reportRef.set({ ...input, reporterId: uid, status: 'OPEN', createdAt: FieldValue.serverTimestamp() });
  await ref.update({ status: 'DISPUTED', updatedAt: FieldValue.serverTimestamp() });
  await appendEvent(input.transactionId, uid, 'CONCERN_RAISED', 'A participant raised a concern. The evidence record remains unchanged.', { reportId: reportRef.id, reason: input.reason });
  await notifyOtherParticipants(input.transactionId, uid, 'Concern raised', 'The normal completion flow is paused. Review the private transaction record.');
  return { reportId: reportRef.id };
});

export const blockUser = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const targetUserId = String((request.data as { targetUserId?: unknown })?.targetUserId ?? '');
  if (!targetUserId || targetUserId === uid || targetUserId.length > 128) throw new HttpsError('invalid-argument', 'Choose another PackProof user.');
  await db.collection('users').doc(uid).collection('blocks').doc(targetUserId).set({ createdAt: FieldValue.serverTimestamp() });
  return { success: true };
});

export const registerPushToken = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const token = String((request.data as { token?: unknown })?.token ?? '');
  if (!/^ExponentPushToken\[[\w-]+\]$/.test(token) && !/^ExpoPushToken\[[\w-]+\]$/.test(token)) throw new HttpsError('invalid-argument', 'Invalid notification token.');
  const previousOwners = await db.collection('users').where('expoPushToken', '==', token).get();
  await Promise.all(previousOwners.docs.filter((doc) => doc.id !== uid).map((doc) => doc.ref.update({ expoPushToken: FieldValue.delete() })));
  await db.collection('users').doc(uid).set({ expoPushToken: token, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { success: true };
});

export const unregisterPushToken = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  await db.collection('users').doc(uid).set({ expoPushToken: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { success: true };
});
