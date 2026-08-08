import { createHash, createHmac } from 'node:crypto';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { onCall } from 'firebase-functions/v2/https';
import { onObjectFinalized } from 'firebase-functions/v2/storage';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { db, manifestSigningSecret, storage } from './config';
import { appendEvent, assertParticipant, getTransaction, notifyOtherParticipants, requireUid } from './helpers';
import type { EvidenceType } from './types';
import { transactionIdSchema } from './validation';

const MAX_EVIDENCE_BYTES = 600 * 1024 * 1024;

async function sha256File(file: ReturnType<ReturnType<typeof storage.bucket>['file']>): Promise<string> {
  const digest = createHash('sha256');
  await new Promise<void>((resolve, reject) => {
    file.createReadStream().on('data', (chunk) => digest.update(chunk)).on('error', reject).on('end', resolve);
  });
  return digest.digest('hex');
}

function canonicalize(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).filter((key) => record[key] !== undefined).sort();
  return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
}

function timestampIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value && typeof value === 'object' && 'toDate' in value && typeof (value as { toDate?: unknown }).toDate === 'function') {
    return ((value as { toDate: () => Date }).toDate()).toISOString();
  }
  return typeof value === 'string' ? value : null;
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
  if (!data.participantIds.includes(uploaderId)) {
    await file.delete({ ignoreNotFound: true });
    await pendingRef.delete();
    return;
  }

  const digest = await sha256File(file);
  const clientSha256 = typeof pending?.clientSha256 === 'string' ? pending.clientSha256 : null;
  const clientHashMatched = clientSha256 ? clientSha256 === digest : null;
  const clientSizeBytes = typeof pending?.clientSizeBytes === 'number' ? pending.clientSizeBytes : null;
  const clientSizeMatched = clientSizeBytes ? clientSizeBytes === size : null;
  const evidenceType = pending!.evidenceType as EvidenceType;
  const attestationStatus = pending?.attestationSnapshot?.mode === 'JIT_APP_CHECK'
    ? pending?.attestationSnapshot?.deviceKeySignatureValid === true ? 'JIT_VERIFIED' : 'JIT_APP_CHECK_ONLY'
    : pending?.clientManifest
      ? 'OFFLINE_UNATTESTED'
      : 'NOT_PROVIDED';

  const manifest = {
    schemaVersion: 1,
    evidence: {
      uploadId,
      transactionId,
      uploaderId,
      uploaderRole: data.sellerId === uploaderId ? 'SELLER' : 'BUYER',
      evidenceType,
      returnPassportId: pending?.returnPassportId ?? null,
      connectSessionId: pending?.connectSessionId ?? null,
      originalName: pending!.originalName,
      contentType,
      sizeBytes: size,
      sha256: digest,
    },
    capture: pending?.clientManifest ?? null,
    hardwareAttestation: pending?.attestationSnapshot ?? null,
    carrierContext: pending?.carrierContext ?? null,
    serverReceipt: {
      bucket: object.bucket,
      storagePath: path,
      storageGeneration: object.generation ?? null,
      receivedAt: object.timeCreated ?? new Date().toISOString(),
      finalizedEventId: event.id,
      ingressNetwork: pending?.ingressNetwork ?? null,
    },
    verification: {
      serverHashAlgorithm: 'SHA-256',
      clientSha256,
      clientHashMatched,
      clientSizeBytes,
      clientSizeMatched,
      attestationStatus,
      runtimeIntegrityScope: pending?.clientManifest?.runtimeIntegrity?.integrityScope ?? null,
    },
  };
  const manifestJson = canonicalize(manifest);
  const manifestSha256 = createHash('sha256').update(manifestJson).digest('hex');
  const evidenceBundleSha256 = createHash('sha256').update(`${digest}\n${manifestSha256}`).digest('hex');
  const manifestSignature = createHmac('sha256', manifestSigningSecret.value()).update(manifestJson).digest('base64url');
  const manifestPath = `manifests/${transactionId}/${uploadId}.json`;
  await bucket.file(manifestPath).save(Buffer.from(manifestJson), {
    contentType: 'application/json',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=0, no-store',
      metadata: { transactionId, uploadId, manifestSha256, evidenceBundleSha256 },
    },
  });

  const evidenceData = {
    id: uploadId,
    transactionId,
    uploaderId,
    role: data.sellerId === uploaderId ? 'SELLER' : 'BUYER',
    type: evidenceType,
    storagePath: path,
    manifestPath,
    contentType,
    originalName: pending!.originalName,
    sizeBytes: size,
    sha256: digest,
    clientSha256,
    clientHashMatched,
    clientSizeMatched,
    manifestSha256,
    evidenceBundleSha256,
    manifestSignature,
    attestationStatus,
    deviceKeySignatureValid: pending?.attestationSnapshot?.deviceKeySignatureValid ?? null,
    deviceKeyHardwareBacked: pending?.attestationSnapshot?.deviceKeyProof?.hardwareBacked ?? null,
    carrierTrackingMatchStatus: pending?.carrierContext?.matchStatus ?? 'NOT_SCANNED',
    scannedTrackingNumber: pending?.carrierContext?.scannedTrackingNumber ?? null,
    captureSessionId: pending?.captureSessionId ?? null,
    returnPassportId: pending?.returnPassportId ?? null,
    connectSessionId: pending?.connectSessionId ?? null,
    clientCreatedAt: pending!.clientCreatedAt ?? null,
    capturedAt: object.timeCreated ?? null,
    createdAt: FieldValue.serverTimestamp(),
    serverVerified: true,
    moderationStatus: clientHashMatched === false
      ? 'HASH_MISMATCH_REVIEW'
      : pending?.carrierContext?.matchStatus === 'MISMATCH'
        ? 'TRACKING_MISMATCH_REVIEW'
        : 'UNREVIEWED',
  };
  const returnPassportId = pending?.returnPassportId as string | null | undefined;
  const summary = `${evidenceType.replaceAll('_', ' ').toLowerCase()} was timestamped, hashed and sealed into a signed manifest.`;
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
      || !(freshTransactionData?.participantIds as string[] | undefined)?.includes(uploaderId)) {
      throw new Error('Evidence finalization prerequisites no longer match the uploaded object.');
    }

    tx.create(evidenceRef, evidenceData);
    tx.delete(pendingRef);
    if (captureSessionRef) {
      tx.set(captureSessionRef, { finalizedAt: FieldValue.serverTimestamp(), evidenceId: uploadId }, { merge: true });
    }
    if (evidenceType === 'PACKING_VIDEO' && freshTransactionData?.status === 'TERMS_LOCKED') {
      tx.update(transactionRef, { status: 'PACKED', updatedAt: FieldValue.serverTimestamp() });
    } else if (evidenceType === 'UNBOXING_VIDEO' && freshTransactionData?.status === 'SHIPPED') {
      tx.update(transactionRef, { status: 'BUYER_REVIEW', updatedAt: FieldValue.serverTimestamp() });
    }
    if (returnRef && freshReturn?.exists && evidenceType === 'RETURN_PACKING_VIDEO' && freshReturn.data()?.status === 'AUTHORIZED') {
      tx.update(returnRef, { status: 'PACKED', updatedAt: FieldValue.serverTimestamp() });
    } else if (returnRef && freshReturn?.exists && evidenceType === 'RETURN_UNBOXING_VIDEO' && freshReturn.data()?.status === 'IN_TRANSIT') {
      tx.update(returnRef, { status: 'RECEIVED_REVIEW', receivedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    }
    tx.create(eventRef, {
      actorId: uploaderId,
      type: clientHashMatched === false ? 'EVIDENCE_HASH_MISMATCH' : 'EVIDENCE_VERIFIED',
      summary: summary.slice(0, 500),
      metadata: {
        evidenceId: uploadId,
        sha256: digest,
        manifestSha256,
        evidenceBundleSha256,
        attestationStatus,
        clientHashMatched,
        carrierTrackingMatchStatus: pending?.carrierContext?.matchStatus ?? 'NOT_SCANNED',
        returnPassportId: returnPassportId ?? null,
      },
      createdAt: FieldValue.serverTimestamp(),
    });
    return true;
  });

  if (created) {
    await notifyOtherParticipants(transactionId, uploaderId, 'New evidence verified', `${evidenceType.replaceAll('_', ' ').toLowerCase()} was added to the PackProof.`);
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

export async function generateEvidencePacket(transactionId: string, generatedBy: string): Promise<{
  reportId: string;
  storagePath: string;
  sha256: string;
  evidenceCount: number;
}> {
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

  addLine('PACKPROOF FORENSIC EVIDENCE DOSSIER', { bold: true, size: 18, color: teal, gap: 8 });
  addLine(`Generated: ${new Date().toISOString()}`);
  addLine(`Transaction ID: ${transactionId}`);
  addLine('This dossier records user-confirmed terms, server-computed file hashes, signed manifest fingerprints and attestation status. PackProof does not authenticate items, insure shipments, provide escrow, or decide disputes.', { gap: 12 });

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
  if (data.source) addLine(`PackProof Connect: ${data.source.platform}; external order: ${data.source.externalOrderId}`);
  y -= 8;

  addLine('VERIFIED EVIDENCE', { bold: true, size: 12, gap: 5 });
  if (!evidence.length) addLine('No evidence files were present when this dossier was generated.');
  for (const item of evidence) {
    const created = timestampIso(item.createdAt) ?? item.capturedAt ?? 'Unknown time';
    addLine(`${item.type} — ${item.originalName}`, { bold: true });
    addLine(`Captured: ${created}; uploader role: ${item.role}; size: ${item.sizeBytes} bytes`);
    addLine(`File SHA-256: ${item.sha256}`);
    addLine(`Manifest SHA-256: ${item.manifestSha256 ?? 'Legacy evidence without manifest'}`);
    addLine(`Bundle SHA-256: ${item.evidenceBundleSha256 ?? 'Legacy evidence without bundle hash'}`);
    addLine(`Attestation: ${item.attestationStatus ?? 'NOT_RECORDED'}; device-key signature: ${String(item.deviceKeySignatureValid ?? 'not supplied')}; client hash matched: ${String(item.clientHashMatched ?? 'not supplied')}`);
    addLine(`Capture-time tracking context: ${item.carrierTrackingMatchStatus ?? 'NOT_SCANNED'}${item.scannedTrackingNumber ? `; barcode ${item.scannedTrackingNumber}` : ''}`);
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
  pdf.setSubject('Transaction evidence inventory, signed manifests and audit timeline');
  pdf.setCreator('PackProof');
  const bytes = await pdf.save();
  const reportId = db.collection('transactions').doc(transactionId).collection('packets').doc().id;
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
    createdAt: FieldValue.serverTimestamp(),
  });
  await appendEvent(transactionId, generatedBy, 'PACKET_GENERATED', 'A forensic evidence dossier was generated.', { reportId, sha256: digest });
  return { reportId, storagePath, sha256: digest, evidenceCount: evidence.length };
}

export const createEvidencePacket = onCall({ enforceAppCheck: true, timeoutSeconds: 180, memory: '1GiB' }, async (request) => {
  const uid = requireUid(request);
  const { transactionId } = transactionIdSchema.parse(request.data);
  const { data } = await getTransaction(transactionId);
  assertParticipant(data, uid);
  return generateEvidencePacket(transactionId, uid);
});
