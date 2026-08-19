import { createHash } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { db, manifestSigningKeyId, manifestSigningSecret, storage } from './config';
import {
  BUNDLE_BINDING_PROFILE,
  CANONICALIZATION_PROFILE,
  EVIDENCE_MANIFEST_SCHEMA_VERSION,
  detectSupportedMediaType,
} from './evidence-format';
import { appendEvent, assertParticipant, getTransaction, notifyOtherParticipants, requireUid } from './helpers';
import {
  acquisitionClassOf,
  finalizeReceivedEvidence,
  hmacManifestSigner,
  uploaderAuthorizedForGrant,
  uploaderRoleForGrant,
  type PendingEvidenceGrant,
} from './evidence-finalization';
import { HUMAN_REVIEW_DISCLAIMER, groupPackageSealObservations, isOutboundPackingEvidenceType } from './package-seal-protocol';
import { asShippingTrackerObservation, type ShippingTrackerObservation } from './shipping-tracker';
import { transactionIdSchema } from './validation';

const MAX_EVIDENCE_BYTES = 600 * 1024 * 1024;

type StorageFile = ReturnType<ReturnType<typeof storage.bucket>['file']>;

async function sha256File(file: StorageFile): Promise<string> {
  const digest = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    file.createReadStream().on('data', (chunk) => digest.update(chunk)).on('error', reject).on('end', resolve);
  });
  return digest.digest('hex');
}

async function readPrefix(file: StorageFile, length = 32): Promise<Buffer> {
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    file.createReadStream({ start: 0, end: length - 1 })
      .on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
      .on('error', reject)
      .on('end', resolve);
  });
  return Buffer.concat(chunks);
}

function grantFieldsFromPending(pending: FirebaseFirestore.DocumentData | undefined) {
  const mode = pending?.attestationSnapshot?.mode;
  return {
    acquisitionClass: acquisitionClassOf(pending?.acquisitionClass),
    edgeAgentId: typeof pending?.edgeAgentId === 'string' ? pending.edgeAgentId : null,
    clientManifest: pending?.clientManifest && typeof pending.clientManifest === 'object'
      ? pending.clientManifest as Record<string, unknown>
      : null,
    attestationSnapshot: mode === 'ENTERPRISE_EDGE' || mode === 'JIT_APP_CHECK' || mode === 'OFFLINE_UNATTESTED'
      ? {
          mode,
          deviceKeySignatureValid: pending?.attestationSnapshot?.deviceKeySignatureValid === true,
        }
      : null,
  };
}

function timestampIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }
  return typeof value === 'string' ? value : null;
}

function normalizedAppDeviceContext(value: FirebaseFirestore.DocumentData | null | undefined) {
  if (!value) return null;
  const proof = value.deviceKeyProof as FirebaseFirestore.DocumentData | null | undefined;
  return {
    mode: typeof value.mode === 'string' ? value.mode : 'NOT_PROVIDED',
    captureSessionId: typeof value.captureSessionId === 'string' ? value.captureSessionId : null,
    nonce: typeof value.nonce === 'string' ? value.nonce : null,
    appId: typeof value.appId === 'string' ? value.appId : null,
    issuedAt: timestampIso(value.issuedAt),
    captureWindowEndsAt: timestampIso(value.captureWindowEndsAt),
    tokenReplayDetected: typeof value.tokenReplayDetected === 'boolean' ? value.tokenReplayDetected : null,
    reasonCodes: Array.isArray(value.reasonCodes) ? value.reasonCodes.filter((item): item is string => typeof item === 'string') : [],
    deviceKeyProof: proof ? {
      algorithm: typeof proof.algorithm === 'string' ? proof.algorithm : null,
      keyAlias: typeof proof.keyAlias === 'string' ? proof.keyAlias : null,
      publicKeySpkiBase64: typeof proof.publicKeySpkiBase64 === 'string' ? proof.publicKeySpkiBase64 : null,
      challengeSignatureBase64: typeof proof.challengeSignatureBase64 === 'string' ? proof.challengeSignatureBase64 : null,
      hardwareBackedSignal: typeof proof.hardwareBacked === 'boolean' ? proof.hardwareBacked : null,
    } : null,
    deviceKeySignatureValid: typeof value.deviceKeySignatureValid === 'boolean' ? value.deviceKeySignatureValid : null,
    sessionMode: typeof value.sessionMode === 'string' ? value.sessionMode : null,
    maxEvidenceCount: typeof value.maxEvidenceCount === 'number' ? value.maxEvidenceCount : null,
    captureProfileId: typeof value.captureProfileId === 'string' ? value.captureProfileId : null,
    captureGroupId: typeof value.captureGroupId === 'string' ? value.captureGroupId : null,
  };
}

function pendingDocumentToGrant(input: {
  pending: FirebaseFirestore.DocumentData | undefined;
  transactionId: string;
  uploaderId: string;
  uploadId: string;
  storagePath: string;
  appDeviceContext: ReturnType<typeof normalizedAppDeviceContext>;
}): PendingEvidenceGrant {
  const pending = input.pending ?? {};
  const fields = grantFieldsFromPending(pending);
  const mode = input.appDeviceContext?.mode;
  return {
    transactionId: input.transactionId,
    uploaderId: input.uploaderId,
    uploadId: input.uploadId,
    clientEvidenceId: typeof pending.clientEvidenceId === 'string' ? pending.clientEvidenceId : null,
    evidenceType: String(pending.evidenceType ?? ''),
    contentType: String(pending.contentType ?? ''),
    originalName: String(pending.originalName ?? ''),
    clientSha256: typeof pending.clientSha256 === 'string' ? pending.clientSha256 : null,
    clientSizeBytes: typeof pending.clientSizeBytes === 'number' ? pending.clientSizeBytes : null,
    storagePath: input.storagePath,
    captureSessionId: typeof pending.captureSessionId === 'string' ? pending.captureSessionId : null,
    returnPassportId: typeof pending.returnPassportId === 'string' ? pending.returnPassportId : null,
    connectSessionId: typeof pending.connectSessionId === 'string' ? pending.connectSessionId : null,
    clientManifest: fields.clientManifest,
    attestationSnapshot: mode === 'ENTERPRISE_EDGE' || mode === 'JIT_APP_CHECK' || mode === 'OFFLINE_UNATTESTED'
      ? {
          mode,
          deviceKeySignatureValid: input.appDeviceContext?.deviceKeySignatureValid ?? null,
          deviceKeyProof: input.appDeviceContext?.deviceKeyProof ? {
            hardwareBacked: input.appDeviceContext.deviceKeyProof.hardwareBackedSignal,
          } : null,
          captureSessionId: input.appDeviceContext?.captureSessionId ?? null,
          nonce: input.appDeviceContext?.nonce ?? null,
          appId: input.appDeviceContext?.appId ?? null,
          issuedAt: input.appDeviceContext?.issuedAt ?? null,
          captureWindowEndsAt: input.appDeviceContext?.captureWindowEndsAt ?? null,
          tokenReplayDetected: input.appDeviceContext?.tokenReplayDetected ?? null,
          reasonCodes: input.appDeviceContext?.reasonCodes ?? [],
          sessionMode: input.appDeviceContext?.sessionMode ?? null,
          maxEvidenceCount: input.appDeviceContext?.maxEvidenceCount ?? null,
          captureProfileId: input.appDeviceContext?.captureProfileId ?? null,
          captureGroupId: input.appDeviceContext?.captureGroupId ?? null,
        }
      : fields.attestationSnapshot,
    carrierContext: pending.carrierContext && typeof pending.carrierContext === 'object'
      ? pending.carrierContext as {
        matchStatus?: string;
        scannedTrackingNumber?: string | null;
        tracker?: ShippingTrackerObservation | null;
      }
      : null,
    requestFingerprint: typeof pending.requestFingerprint === 'string' ? pending.requestFingerprint : null,
    acquisitionClass: fields.acquisitionClass,
    edgeAgentId: fields.edgeAgentId,
    organizationId: typeof pending.organizationId === 'string' ? pending.organizationId : null,
    fulfillmentSessionId: typeof pending.fulfillmentSessionId === 'string' ? pending.fulfillmentSessionId : null,
    ingressNetwork: pending.ingressNetwork && typeof pending.ingressNetwork === 'object'
      ? pending.ingressNetwork as Record<string, unknown>
      : null,
  };
}

export const onEvidenceUploaded = onObjectFinalized({ timeoutSeconds: 540, memory: '1GiB', secrets: [manifestSigningSecret] }, async (event) => {
  const object = event.data;
  const path = object.name;
  if (!path?.startsWith('evidence/')) return;
  const match = /^evidence\/([^/]+)\/([^/]+)\/([^/]+)$/i.exec(path);
  const bucket = storage.bucket(object.bucket);
  const file = bucket.file(path);
  if (!match) {
    await file.delete({ ignoreNotFound: true });
    return;
  }

  const [, transactionId, uploaderId, uploadId] = match;
  const evidenceRef = db.collection('transactions').doc(transactionId).collection('evidence').doc(uploadId);
  // Cloud Storage finalize events are delivered at least once. If this upload has
  // already been accepted, return before consulting the now-consumed grant so a
  // duplicate delivery can never delete valid evidence.
  if ((await evidenceRef.get()).exists) return;

  const pendingRef = db.collection('pendingUploads').doc(uploadId);
  const pendingSnap = await pendingRef.get();
  const pending = pendingSnap.data();
  const size = Number(object.size ?? 0);
  const contentType = object.contentType ?? '';
  const expiresAt = pending?.expiresAt as Timestamp | undefined;
  const invalid = !pendingSnap.exists
    || pending?.transactionId !== transactionId
    || pending?.uploaderId !== uploaderId
    || pending?.storagePath !== path
    || pending?.contentType !== contentType
    || !expiresAt
    || expiresAt.toMillis() < Date.now()
    || size <= 0
    || size > MAX_EVIDENCE_BYTES;

  if (invalid) {
    await file.delete({ ignoreNotFound: true });
    if (pendingSnap.exists) await pendingRef.delete();
    return;
  }

  const { data } = await getTransaction(transactionId);
  const pendingGrant = grantFieldsFromPending(pending);
  if (!uploaderAuthorizedForGrant({
    participantIds: data.participantIds,
    uploaderId,
    pending: pendingGrant,
  })) {
    await file.delete({ ignoreNotFound: true });
    await pendingRef.delete();
    return;
  }

  const digest = await sha256File(file);
  const detectedContentType = detectSupportedMediaType(await readPrefix(file));
  const grant = pendingDocumentToGrant({
    pending,
    transactionId,
    uploaderId,
    uploadId,
    storagePath: path,
    appDeviceContext: normalizedAppDeviceContext(pending?.attestationSnapshot),
  });
  const finalized = finalizeReceivedEvidence({
    pending: grant,
    object: {
      bucket: object.bucket,
      storagePath: path,
      generation: object.generation != null ? String(object.generation) : null,
      timeCreated: typeof object.timeCreated === 'string' ? object.timeCreated : new Date().toISOString(),
      size,
      contentType,
    },
    uploaderRole: uploaderRoleForGrant({
      sellerId: data.sellerId,
      buyerId: data.buyerId ?? null,
      uploaderId,
      pending: pendingGrant,
    }),
    signer: hmacManifestSigner(manifestSigningSecret.value(), manifestSigningKeyId.value()),
    digest,
    detectedContentType,
  });
  const {
    clientHashMatched,
    clientSizeMatched,
    contentTypeMatched,
    attestationStatus,
    assurance,
    carrierTrackingMatchStatus,
    clientTimeConsistencyStatus,
    integrityAccepted,
    manifestJson,
    manifestSha256,
    evidenceBundleSha256,
    manifestMacBase64url,
  } = finalized;
  const evidenceType = String(pending!.evidenceType);
  const clientSha256 = typeof pending?.clientSha256 === 'string' ? pending.clientSha256 : null;

  // Remove any client-upload download token and force private/no-store object
  // metadata. Participant reads remain available through authenticated Storage
  // rules; the app obtains only short-lived signed links from a callable.
  await file.setMetadata({
    cacheControl: 'private, max-age=0, no-store',
    contentDisposition: 'attachment',
    metadata: { transactionId, uploaderId, uploadId, accessClass: 'TRANSACTION_PARTICIPANTS' },
  });

  const manifestPath = `manifests/${transactionId}/${uploadId}.json`;
  await bucket.file(manifestPath).save(Buffer.from(manifestJson), {
    contentType: 'application/json',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=0, no-store',
      metadata: {
        transactionId,
        uploadId,
        schemaVersion: String(EVIDENCE_MANIFEST_SCHEMA_VERSION),
        manifestSha256,
        evidenceBundleSha256,
        manifestMacAlgorithm: 'HMAC-SHA256',
        manifestMacKeyId: manifestSigningKeyId.value(),
        manifestMacBase64url,
      },
    },
  });

  const evidenceData = {
    id: uploadId,
    transactionId,
    uploaderId,
    role: uploaderRoleForGrant({
      sellerId: data.sellerId,
      buyerId: data.buyerId ?? null,
      uploaderId,
      pending: pendingGrant,
    }),
    type: evidenceType,
    storagePath: path,
    manifestPath,
    contentType,
    originalName: pending!.originalName,
    sizeBytes: size,
    sha256: digest,
    requestFingerprint: pending?.requestFingerprint ?? null,
    clientEvidenceId: pending?.clientEvidenceId ?? null,
    clientSha256,
    clientHashMatched,
    clientSizeMatched,
    detectedContentType,
    contentTypeMatched,
    clientTimeConsistencyStatus,
    manifestSchemaVersion: EVIDENCE_MANIFEST_SCHEMA_VERSION,
    canonicalizationProfile: CANONICALIZATION_PROFILE,
    bundleBindingProfile: BUNDLE_BINDING_PROFILE,
    manifestSha256,
    evidenceBundleSha256,
    manifestAuthentication: {
      type: 'SERVICE_MAC',
      algorithm: 'HMAC-SHA256',
      keyId: manifestSigningKeyId.value(),
      macBase64url: manifestMacBase64url,
      verificationScope: 'PACKPROOF_SERVICE_ONLY',
    },
    attestationStatus,
    deviceKeySignatureValid: pending?.attestationSnapshot?.deviceKeySignatureValid ?? null,
    deviceKeyHardwareBackedSignal: pending?.attestationSnapshot?.deviceKeyProof?.hardwareBacked ?? null,
    carrierTrackingMatchStatus,
    scannedTrackingNumber: pending?.carrierContext?.scannedTrackingNumber ?? null,
    shippingTracker: asShippingTrackerObservation(pending?.carrierContext?.tracker),
    captureSessionId: pending?.captureSessionId ?? null,
    returnPassportId: pending?.returnPassportId ?? null,
    connectSessionId: pending?.connectSessionId ?? null,
    acquisitionClass: pendingGrant.acquisitionClass,
    edgeAgentId: pendingGrant.edgeAgentId,
    fulfillmentSessionId: typeof pending?.fulfillmentSessionId === 'string' ? pending.fulfillmentSessionId : null,
    organizationId: typeof pending?.organizationId === 'string' ? pending.organizationId : null,
    captureGroupId: pending?.clientManifest?.physicalCaptureProfile?.captureGroupId ?? null,
    physicalRegionId: pending?.clientManifest?.physicalCaptureProfile?.observedRegion ?? null,
    captureProfileId: pending?.clientManifest?.physicalCaptureProfile?.profileId ?? null,
    physicalCaptureIntent: pending?.clientManifest?.physicalCaptureProfile?.intendedUse ?? null,
    physicalFrameIndex: pending?.clientManifest?.physicalCaptureProfile?.frameIndex ?? null,
    clientCreatedAt: pending!.clientCreatedAt ?? null,
    serverReceivedAt: object.timeCreated ?? null,
    createdAt: FieldValue.serverTimestamp(),
    serverFinalized: true,
    assurance,
    moderationStatus: clientHashMatched === false || clientSizeMatched === false || !contentTypeMatched
      ? 'INTEGRITY_MISMATCH_REVIEW'
      : pending?.carrierContext?.matchStatus === 'MISMATCH'
        ? 'TRACKING_MISMATCH_REVIEW'
        : 'UNREVIEWED',
  };
  const returnPassportId = pending?.returnPassportId as string | null | undefined;
  const summary = integrityAccepted
    ? `${evidenceType.replaceAll('_', ' ').toLowerCase()} was server-hashed and sealed into a service-authenticated manifest.`
    : `${evidenceType.replaceAll('_', ' ').toLowerCase()} was preserved but quarantined because an integrity or media-type check failed.`;
  const transactionRef = db.collection('transactions').doc(transactionId);
  const returnRef = returnPassportId ? transactionRef.collection('returns').doc(returnPassportId) : null;
  const captureSessionRef = pending?.captureSessionId ? db.collection('captureSessions').doc(String(pending.captureSessionId)) : null;
  const eventRef = transactionRef.collection('events').doc(`evidence_${uploadId}`);

  const created = await db.runTransaction(async (tx) => {
    // Read every dependent record before writing so the evidence record, one-time
    // grant consumption, state transitions and deterministic timeline entry are
    // committed as one idempotent unit.
    const freshEvidence = await tx.get(evidenceRef);
    if (freshEvidence.exists) return false;
    const freshPending = await tx.get(pendingRef);
    const freshTransaction = await tx.get(transactionRef);
    const freshReturn = returnRef ? await tx.get(returnRef) : null;
    if (!freshPending.exists || !freshTransaction.exists) throw new Error('Evidence finalization prerequisites disappeared.');
    const freshPendingData = freshPending.data();
    const freshTransactionData = freshTransaction.data();
    if (freshPendingData?.storagePath !== path || freshPendingData?.uploaderId !== uploaderId
      || !uploaderAuthorizedForGrant({
        participantIds: (freshTransactionData?.participantIds as string[] | undefined) ?? [],
        uploaderId,
        pending: grantFieldsFromPending(freshPendingData),
      })) {
      throw new Error('Evidence finalization prerequisites no longer match the uploaded object.');
    }

    tx.create(evidenceRef, evidenceData);
    tx.delete(pendingRef);
    if (captureSessionRef) {
      tx.set(captureSessionRef, { finalizedAt: FieldValue.serverTimestamp(), evidenceId: uploadId }, { merge: true });
    }
    if (integrityAccepted && isOutboundPackingEvidenceType(evidenceType) && freshTransactionData?.status === 'TERMS_LOCKED') {
      tx.update(transactionRef, { status: 'PACKED', updatedAt: FieldValue.serverTimestamp() });
    } else if (integrityAccepted && evidenceType === 'UNBOXING_VIDEO' && freshTransactionData?.status === 'SHIPPED') {
      tx.update(transactionRef, { status: 'BUYER_REVIEW', updatedAt: FieldValue.serverTimestamp() });
    }
    if (integrityAccepted && returnRef && freshReturn?.exists && evidenceType === 'RETURN_PACKING_VIDEO' && freshReturn.data()?.status === 'AUTHORIZED') {
      tx.update(returnRef, { status: 'PACKED', updatedAt: FieldValue.serverTimestamp() });
    } else if (integrityAccepted && returnRef && freshReturn?.exists && evidenceType === 'RETURN_UNBOXING_VIDEO' && freshReturn.data()?.status === 'IN_TRANSIT') {
      tx.update(returnRef, { status: 'RECEIVED_REVIEW', receivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
    tx.create(eventRef, {
      actorId: uploaderId,
      type: integrityAccepted ? 'EVIDENCE_FINALIZED' : 'EVIDENCE_INTEGRITY_MISMATCH',
      summary: summary.slice(0, 500),
      metadata: {
        evidenceId: uploadId,
        sha256: digest,
        manifestSha256,
        evidenceBundleSha256,
        attestationStatus,
        clientHashMatched,
        clientSizeMatched,
        contentTypeMatched,
        carrierTrackingMatchStatus: pending?.carrierContext?.matchStatus ?? 'NOT_SCANNED',
        returnPassportId: returnPassportId ?? null,
      },
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (created) {
    await notifyOtherParticipants(
      transactionId,
      uploaderId,
      integrityAccepted ? 'New evidence finalized' : 'Evidence requires integrity review',
      integrityAccepted
        ? `${evidenceType.replaceAll('_', ' ').toLowerCase()} was server-hashed and added to the evidence record.`
        : `${evidenceType.replaceAll('_', ' ').toLowerCase()} did not advance the workflow because an integrity check failed.`,
    );
  }
});

function money(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

function wrapText(text: string, maxChars = 84): string[] {
  const words = text.replace(/\s+/g, ' ').trim().split(' ');
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    if (`${line} ${word}`.trim().length > maxChars) {
      if (line) lines.push(line);
      line = word;
    } else line = `${line} ${word}`.trim();
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

export async function generateEvidencePacket(transactionId: string, generatedBy: string, options?: { reportId?: string }): Promise<{
  reportId: string;
  storagePath: string;
  sha256: string;
  evidenceCount: number;
}> {
  if (options?.reportId) {
    const existing = await db.collection('transactions').doc(transactionId).collection('packets').doc(options.reportId).get();
    const stored = existing.data();
    if (existing.exists && stored && typeof stored.storagePath === 'string' && typeof stored.sha256 === 'string') {
      return {
        reportId: options.reportId,
        storagePath: stored.storagePath,
        sha256: stored.sha256,
        evidenceCount: Number(stored.evidenceCount ?? 0),
      };
    }
  }
  const { data } = await getTransaction(transactionId);
  const [evidenceSnap, eventsSnap, returnsSnap] = await Promise.all([
    db.collection('transactions').doc(transactionId).collection('evidence').orderBy('createdAt', 'asc').get(),
    db.collection('transactions').doc(transactionId).collection('events').orderBy('createdAt', 'asc').get(),
    db.collection('transactions').doc(transactionId).collection('returns').orderBy('createdAt', 'asc').get(),
  ]);
  const evidence = evidenceSnap.docs.map((item) => item.data());
  const events = eventsSnap.docs.map((item) => item.data());
  const returns = returnsSnap.docs.map((item) => item.data());

  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const dark = rgb(0.03, 0.07, 0.12);
  const teal = rgb(0.13, 0.83, 0.71);
  let page = pdf.addPage([612, 792]);
  let y = 744;

  const addLine = (text: string, options: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb>; gap?: number } = {}) => {
    const size = options.size ?? 9;
    for (const line of wrapText(text, Math.floor(92 * (9 / size)))) {
      if (y < 54) { page = pdf.addPage([612, 792]); y = 744; }
      page.drawText(line, { x: 48, y, size, font: options.bold ? bold : regular, color: options.color ?? dark });
      y -= size + 4;
    }
    y -= options.gap ?? 2;
  };

  addLine('PACKPROOF EVIDENCE DOSSIER', { bold: true, size: 18, color: teal, gap: 8 });
  addLine(`Generated: ${new Date().toISOString()}`);
  addLine(`Transaction ID: ${transactionId}`);
  addLine('This dossier inventories participant-entered terms, server-computed byte hashes, service-authenticated manifest fingerprints, and separately reported assurance dimensions. PackProof does not authenticate item contents, prove uninterrupted physical custody, insure shipments, provide escrow, decide fraud, or guarantee a legal, carrier, marketplace, or payment outcome.', { gap: 12 });

  addLine('TRANSACTION', { bold: true, size: 12, gap: 5 });
  addLine(`Item: ${data.title}`);
  addLine(`Category: ${data.category}`);
  addLine(`Agreed price: ${money(data.priceMinor, data.currency)}`);
  addLine(`Status: ${data.status}`);
  addLine(`Seller account: ${data.sellerId}`);
  addLine(`Buyer account: ${data.buyerId ?? 'Platform-managed / not joined'}`);
  if (data.conditionNotes) addLine(`Condition notes: ${data.conditionNotes}`);
  for (const identifier of data.identifiers ?? []) addLine(`${identifier.label}: ${identifier.value}`);
  addLine(`Sale type: ${data.terms.saleType}; returns: ${data.terms.returns}; return window: ${data.terms.returnWindowDays} days`);
  if (data.source) addLine(`PackProof API: ${data.source.platform}; external order: ${data.source.externalOrderId}`);
  y -= 8;

  const observations = groupPackageSealObservations(evidence);
  addLine('HUMAN-REVIEWABLE PACKAGE OBSERVATIONS', { bold: true, size: 12, gap: 5 });
  addLine(HUMAN_REVIEW_DISCLAIMER, { gap: 8 });
  addLine('Seller reference', { bold: true });
  if (!observations.sellerReference.length) addLine('No seller packing video or high-resolution seal reference was present.');
  for (const item of observations.sellerReference) {
    addLine(`${item.type} — SHA-256 ${item.sha256 ?? 'not recorded'}; server time ${timestampIso(item.serverReceivedAt) ?? timestampIso(item.createdAt) ?? 'unknown'}`);
  }
  addLine('Buyer arrival', { bold: true });
  if (!observations.buyerArrival.length) addLine('No buyer arrival observation or unboxing video was present.');
  for (const item of observations.buyerArrival) {
    addLine(`${item.type} — SHA-256 ${item.sha256 ?? 'not recorded'}; server time ${timestampIso(item.serverReceivedAt) ?? timestampIso(item.createdAt) ?? 'unknown'}`);
  }
  if (observations.returnReference.length || observations.returnArrival.length) {
    addLine('Return observations', { bold: true });
    for (const item of [...observations.returnReference, ...observations.returnArrival]) {
      addLine(`${item.type} — SHA-256 ${item.sha256 ?? 'not recorded'}; server time ${timestampIso(item.serverReceivedAt) ?? timestampIso(item.createdAt) ?? 'unknown'}`);
    }
  }
  y -= 8;

  addLine('FINALIZED EVIDENCE', { bold: true, size: 12, gap: 5 });
  if (!evidence.length) addLine('No evidence files were present when this dossier was generated.');
  for (const item of evidence) {
    const serverReceived = timestampIso(item.serverReceivedAt) ?? timestampIso(item.createdAt) ?? item.capturedAt ?? 'Unknown time';
    addLine(`${item.type} — ${item.originalName}`, { bold: true });
    addLine(`Client-reported capture/start time: ${item.clientCreatedAt ?? 'NOT_RECORDED'}; source: CLIENT_OBSERVED_UNTRUSTED`);
    addLine(`Server received/finalized record time: ${serverReceived}; uploader role: ${item.role}; size: ${item.sizeBytes} bytes`);
    addLine(`File SHA-256: ${item.sha256}`);
    addLine(`Manifest SHA-256: ${item.manifestSha256 ?? 'Legacy evidence without manifest'}`);
    addLine(`Bundle SHA-256: ${item.evidenceBundleSha256 ?? 'Legacy evidence without bundle hash'}; binding: ${item.bundleBindingProfile ?? 'LEGACY_V1'}`);
    addLine(`Manifest authentication: ${item.manifestAuthentication?.algorithm ?? 'LEGACY_HMAC_OR_NOT_RECORDED'}; key: ${item.manifestAuthentication?.keyId ?? 'not recorded'}; scope: ${item.manifestAuthentication?.verificationScope ?? 'service verification only'}`);
    addLine(`App/device context: ${item.assurance?.appDeviceContext?.status ?? item.attestationStatus ?? 'NOT_RECORDED'}; device-key possession signature: ${String(item.deviceKeySignatureValid ?? 'not supplied')}; client-reported hardware signal: ${String(item.deviceKeyHardwareBackedSignal ?? item.deviceKeyHardwareBacked ?? 'not supplied')}`);
    addLine(`Byte integrity: ${item.assurance?.byteIntegrity?.status ?? (item.clientHashMatched === false ? 'MISMATCH' : 'SERVER_HASH_ONLY')}; client hash matched: ${String(item.clientHashMatched ?? 'not supplied')}; size matched: ${String(item.clientSizeMatched ?? 'not supplied')}; declared media type matched: ${String(item.contentTypeMatched ?? 'not supplied')}`);
    addLine(`Acquisition quality: ${item.assurance?.acquisitionQuality?.status ?? 'NOT_EVALUATED'}; physical correspondence: ${item.assurance?.physicalCorrespondence?.status ?? 'NOT_AVAILABLE'}; business/legal relevance: ${item.assurance?.businessLegalRelevance?.status ?? 'REVIEW_REQUIRED'}`);
    addLine(`Capture-time tracking context: ${item.carrierTrackingMatchStatus ?? 'NOT_SCANNED'}${item.scannedTrackingNumber ? `; barcode ${item.scannedTrackingNumber}` : ''}`);
    if (item.shippingTracker && typeof item.shippingTracker === 'object') {
      const tracker = item.shippingTracker as {
        lookupStatus?: string;
        courierCode?: string | null;
        observationSha256?: string;
        hashMatched?: boolean | null;
        stillCaptureStatus?: string | null;
        stillSha256?: string | null;
      };
      addLine(`Open-source tracker observation: ${tracker.lookupStatus ?? 'NOT_RECORDED'}; courier ${tracker.courierCode ?? 'unrecognized'}; observation SHA-256 ${tracker.observationSha256 ?? 'not recorded'}; client hash matched: ${String(tracker.hashMatched ?? 'not supplied')}; still ${tracker.stillCaptureStatus ?? 'NOT_ATTEMPTED'}${tracker.stillSha256 ? `; still SHA-256 ${tracker.stillSha256}` : ''}. This is checksum and courier identification from published tracking-number data, not carrier custody or a live scan event.`);
    }
    if (item.postSubmissionTrackingMatchStatus) {
      addLine(`Later submitted-tracking comparison: ${item.postSubmissionTrackingMatchStatus}${item.postSubmissionExpectedTrackingNumber ? `; submitted ${item.postSubmissionExpectedTrackingNumber}` : ''}; compared ${timestampIso(item.postSubmissionComparedAt) ?? 'after capture'}`, { gap: 6 });
    } else {
      addLine('Later submitted-tracking comparison: NOT_PERFORMED', { gap: 6 });
    }
  }

  if (returns.length) {
    addLine('SYMMETRIC RETURN PASSPORTS', { bold: true, size: 12, gap: 5 });
    for (const item of returns) {
      addLine(`${item.id ?? 'Return'} — ${item.status}`, { bold: true });
      addLine(`Requested by: ${item.initiatedBy}; returning participant: ${item.returningParticipantId ?? 'legacy requester'}; recipient: ${item.recipientId}; reason: ${item.reason}`);
      addLine(`Original evidence snapshot: ${(item.originalEvidenceHashes ?? []).length} hashes`);
      if (item.shipping) addLine(`Return shipping: ${item.shipping.carrier} ${item.shipping.trackingNumber}; repacking-label comparison: ${item.shipping.labelEvidenceMatchStatus ?? 'NOT_RECORDED'}`, { gap: 5 });
      else y -= 5;
    }
  }

  addLine('AUDIT TIMELINE', { bold: true, size: 12, gap: 5 });
  for (const item of events) {
    const created = timestampIso(item.createdAt) ?? 'Pending server time';
    addLine(`${created} — ${item.type}: ${item.summary}`);
  }

  pdf.setTitle(`PackProof ${transactionId}`);
  pdf.setSubject('Transaction evidence inventory, service-authenticated manifests, layered assurance and audit timeline');
  pdf.setCreator('PackProof');
  const bytes = await pdf.save();
  const reportId = options?.reportId ?? db.collection('transactions').doc(transactionId).collection('packets').doc().id;
  const storagePath = `reports/${transactionId}/${reportId}.pdf`;
  const digest = createHash('sha256').update(bytes).digest('hex');
  await storage.bucket().file(storagePath).save(Buffer.from(bytes), {
    contentType: 'application/pdf',
    resumable: false,
    metadata: { cacheControl: 'private, max-age=0, no-store', metadata: { transactionId, reportId, sha256: digest } },
  });
  await db.collection('transactions').doc(transactionId).collection('packets').doc(reportId).set({
    id: reportId,
    generatedBy,
    storagePath,
    sha256: digest,
    evidenceCount: evidence.length,
    sourceEvidenceBundleSha256s: evidence.map((item) => item.evidenceBundleSha256).filter((value): value is string => typeof value === 'string'),
    transformation: {
      id: 'packproof-evidence-dossier-pdf',
      version: '2.1.0',
      source: 'SERVER_DERIVED',
      presentationOnly: true,
      originalsReplaced: false,
    },
    createdAt: FieldValue.serverTimestamp(),
  });
  await appendEvent(transactionId, generatedBy, 'PACKET_GENERATED', 'A presentation evidence dossier was generated from the retained originals and manifests.', { reportId, sha256: digest });
  return { reportId, storagePath, sha256: digest, evidenceCount: evidence.length };
}

export const createEvidencePacket = onCall({ enforceAppCheck: true, timeoutSeconds: 180, memory: '1GiB' }, async (request) => {
  const uid = requireUid(request);
  const { transactionId } = transactionIdSchema.parse(request.data);
  const { data } = await getTransaction(transactionId);
  assertParticipant(data, uid);
  return generateEvidencePacket(transactionId, uid);
});

export const createPrivateDownloadUrl = onCall({ enforceAppCheck: true, invoker: 'public' }, async (request) => {
  const uid = requireUid(request);
  const storagePath = typeof request.data?.storagePath === 'string' ? request.data.storagePath : '';
  if (!storagePath || storagePath.length > 500 || storagePath.includes('\\') || storagePath.includes('..')) {
    throw new HttpsError('invalid-argument', 'A valid private object path is required.');
  }

  const transactionMatch = /^(?:evidence|manifests|reports|passports)\/([^/]+)\//.exec(storagePath);
  const exportMatch = /^exports\/([^/]+)\/[^/]+\.json$/.exec(storagePath);
  if (transactionMatch) {
    const { data } = await getTransaction(transactionMatch[1]);
    assertParticipant(data, uid);
  } else if (exportMatch) {
    if (exportMatch[1] !== uid) throw new HttpsError('permission-denied', 'This export belongs to another account.');
  } else {
    throw new HttpsError('invalid-argument', 'This object class is not available through the private download endpoint.');
  }

  const file = storage.bucket().file(storagePath);
  const [exists] = await file.exists();
  if (!exists) throw new HttpsError('not-found', 'Private object not found.');
  const expiresAtMs = Date.now() + 5 * 60_000;
  const [url] = await file.getSignedUrl({ action: 'read', expires: expiresAtMs });
  return { url, expiresAt: new Date(expiresAtMs).toISOString() };
});
