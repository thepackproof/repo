import { createHash } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { db, storage } from './config';
import { PASSPORT_PDF_RENDERER_VERSION, type PackProofPassportV1 } from './domain/v1/passport';
import { renderPassportPdf, stillRoleForArtifact, type PassportPdfStill } from './passport-pdf';

const MAX_STILL_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);

async function loadPassportStills(transactionId: string, passport: PackProofPassportV1): Promise<PassportPdfStill[]> {
  const snap = await db.collection('transactions').doc(transactionId).collection('evidence').get();
  const byId = new Map(snap.docs.map((doc) => [doc.id, doc.data()]));
  const chosen = new Map<PassportPdfStill['role'], PassportPdfStill>();
  for (const artifact of passport.artifacts) {
    if (artifact.finalization !== 'FINALIZED') continue;
    const role = stillRoleForArtifact(artifact.type, artifact.contentType);
    if (!role || chosen.has(role)) continue;
    const data = byId.get(artifact.artifactId);
    const storagePath = typeof data?.storagePath === 'string' ? data.storagePath : null;
    const contentType = artifact.contentType ?? (typeof data?.contentType === 'string' ? data.contentType : null);
    if (!storagePath || !contentType || !IMAGE_TYPES.has(contentType.toLowerCase())) continue;
    const file = storage.bucket().file(storagePath);
    const [metadata] = await file.getMetadata().catch(() => [null]);
    const size = Number(metadata?.size ?? 0);
    if (!Number.isFinite(size) || size <= 0 || size > MAX_STILL_BYTES) continue;
    const [bytes] = await file.download().catch(() => [null]);
    if (!bytes?.length) continue;
    chosen.set(role, { role, artifactId: artifact.artifactId, bytes, contentType });
  }
  return [...chosen.values()];
}

export { renderPassportPdf } from './passport-pdf';

export async function generatePassportPdfExport(input: {
  transactionId: string;
  snapshotId: string;
  passport: PackProofPassportV1;
}): Promise<{ storagePath: string; sha256: string }> {
  const stills = await loadPassportStills(input.transactionId, input.passport).catch(() => []);
  const bytes = await renderPassportPdf(input.passport, stills);
  const digest = createHash('sha256').update(bytes).digest('hex');
  const storagePath = `passports/${input.transactionId}/${input.snapshotId}.pdf`;
  await storage.bucket().file(storagePath).save(Buffer.from(bytes), {
    contentType: 'application/pdf',
    resumable: false,
    metadata: {
      cacheControl: 'private, max-age=0, no-store',
      metadata: { transactionId: input.transactionId, snapshotId: input.snapshotId, sha256: digest, rendererVersion: PASSPORT_PDF_RENDERER_VERSION },
    },
  });
  await db.collection('transactions').doc(input.transactionId).collection('events').add({
    actorId: 'packproof-service',
    type: 'PASSPORT_EXPORT_GENERATED',
    summary: 'A presentation-only PackProof Passport PDF was generated from a frozen snapshot.',
    metadata: { snapshotId: input.snapshotId, sha256: digest, presentationOnly: true, rendererVersion: PASSPORT_PDF_RENDERER_VERSION },
    createdAt: FieldValue.serverTimestamp(),
  });
  return { storagePath, sha256: digest };
}
