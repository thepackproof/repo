"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPassportPdf = void 0;
exports.generatePassportPdfExport = generatePassportPdfExport;
const node_crypto_1 = require("node:crypto");
const firestore_1 = require("firebase-admin/firestore");
const config_1 = require("./config");
const passport_1 = require("./domain/v1/passport");
const passport_pdf_1 = require("./passport-pdf");
const MAX_STILL_BYTES = 8 * 1024 * 1024;
const IMAGE_TYPES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
async function loadPassportStills(transactionId, passport) {
    const snap = await config_1.db.collection('transactions').doc(transactionId).collection('evidence').get();
    const byId = new Map(snap.docs.map((doc) => [doc.id, doc.data()]));
    const chosen = new Map();
    for (const artifact of passport.artifacts) {
        if (artifact.finalization !== 'FINALIZED')
            continue;
        const role = (0, passport_pdf_1.stillRoleForArtifact)(artifact.type, artifact.contentType);
        if (!role || chosen.has(role))
            continue;
        const data = byId.get(artifact.artifactId);
        const storagePath = typeof data?.storagePath === 'string' ? data.storagePath : null;
        const contentType = artifact.contentType ?? (typeof data?.contentType === 'string' ? data.contentType : null);
        if (!storagePath || !contentType || !IMAGE_TYPES.has(contentType.toLowerCase()))
            continue;
        const file = config_1.storage.bucket().file(storagePath);
        const [metadata] = await file.getMetadata().catch(() => [null]);
        const size = Number(metadata?.size ?? 0);
        if (!Number.isFinite(size) || size <= 0 || size > MAX_STILL_BYTES)
            continue;
        const [bytes] = await file.download().catch(() => [null]);
        if (!bytes?.length)
            continue;
        chosen.set(role, { role, artifactId: artifact.artifactId, bytes, contentType });
    }
    return [...chosen.values()];
}
var passport_pdf_2 = require("./passport-pdf");
Object.defineProperty(exports, "renderPassportPdf", { enumerable: true, get: function () { return passport_pdf_2.renderPassportPdf; } });
async function generatePassportPdfExport(input) {
    const stills = await loadPassportStills(input.transactionId, input.passport).catch(() => []);
    const bytes = await (0, passport_pdf_1.renderPassportPdf)(input.passport, stills);
    const digest = (0, node_crypto_1.createHash)('sha256').update(bytes).digest('hex');
    const storagePath = `passports/${input.transactionId}/${input.snapshotId}.pdf`;
    await config_1.storage.bucket().file(storagePath).save(Buffer.from(bytes), {
        contentType: 'application/pdf',
        resumable: false,
        metadata: {
            cacheControl: 'private, max-age=0, no-store',
            metadata: { transactionId: input.transactionId, snapshotId: input.snapshotId, sha256: digest, rendererVersion: passport_1.PASSPORT_PDF_RENDERER_VERSION },
        },
    });
    await config_1.db.collection('transactions').doc(input.transactionId).collection('events').add({
        actorId: 'packproof-service',
        type: 'PASSPORT_EXPORT_GENERATED',
        summary: 'A presentation-only PackProof Passport PDF was generated from a frozen snapshot.',
        metadata: { snapshotId: input.snapshotId, sha256: digest, presentationOnly: true, rendererVersion: passport_1.PASSPORT_PDF_RENDERER_VERSION },
        createdAt: firestore_1.FieldValue.serverTimestamp(),
    });
    return { storagePath, sha256: digest };
}
//# sourceMappingURL=passport-export.js.map