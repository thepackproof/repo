"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderPassportPdf = renderPassportPdf;
exports.generatePassportPdfExport = generatePassportPdfExport;
const node_crypto_1 = require("node:crypto");
const pdf_lib_1 = require("pdf-lib");
const firestore_1 = require("firebase-admin/firestore");
const config_1 = require("./config");
const passport_1 = require("./domain/v1/passport");
function wrapText(text, maxChars = 92) {
    const words = text.replace(/\s+/g, ' ').trim().split(' ');
    const lines = [];
    let line = '';
    for (const word of words) {
        if (`${line} ${word}`.trim().length > maxChars) {
            if (line)
                lines.push(line);
            line = word;
        }
        else
            line = `${line} ${word}`.trim();
    }
    if (line)
        lines.push(line);
    return lines.length ? lines : [''];
}
async function renderPassportPdf(passport) {
    const pdf = await pdf_lib_1.PDFDocument.create();
    const regular = await pdf.embedFont(pdf_lib_1.StandardFonts.Helvetica);
    const bold = await pdf.embedFont(pdf_lib_1.StandardFonts.HelveticaBold);
    const dark = (0, pdf_lib_1.rgb)(0.07, 0.09, 0.12);
    const teal = (0, pdf_lib_1.rgb)(0.27, 0.49, 0.39);
    const muted = (0, pdf_lib_1.rgb)(0.36, 0.40, 0.47);
    let page = pdf.addPage([612, 792]);
    let y = 744;
    const addLine = (text, options = {}) => {
        const size = options.size ?? 9;
        for (const line of wrapText(text, Math.floor(92 * (9 / size)))) {
            if (y < 54) {
                page = pdf.addPage([612, 792]);
                y = 744;
            }
            page.drawText(line, { x: 48, y, size, font: options.bold ? bold : regular, color: options.color ?? dark });
            y -= size + 4;
        }
        y -= options.gap ?? 2;
    };
    addLine('PackProof Passport™', { bold: true, size: 18, color: teal, gap: 2 });
    addLine(passport.identity.displayId, { bold: true, size: 14, gap: 4 });
    addLine(passport.identity.verificationUrl, { size: 8, color: muted, gap: 10 });
    addLine(passport.integrity.banner.replaceAll('_', ' '), { bold: true, size: 12, color: teal, gap: 2 });
    addLine(passport.integrity.summary, { bold: true, size: 10, gap: 2 });
    addLine(passport.integrity.banner === 'AUTHENTIC_PACKPROOF' ? passport_1.INTEGRITY_MEANING_VERIFIED : passport_1.INTEGRITY_MEANING_LIMITED, { gap: 10 });
    addLine('TRANSACTION', { bold: true, size: 11, gap: 4 });
    addLine(`Platform: ${passport.transaction.platform.value ?? 'NOT AVAILABLE'} (${passport.transaction.sourceTrustClass ?? 'unspecified trust'})`);
    addLine(`Order: ${passport.transaction.externalOrderId.value ?? 'NOT AVAILABLE'}`);
    addLine(`Date: ${passport.transaction.transactionDate.value ?? 'NOT AVAILABLE'}`);
    const amount = passport.transaction.amount.value;
    addLine(`Amount: ${amount ? `${amount.currency} ${(amount.minorUnits / 100).toFixed(2)}` : 'NOT AVAILABLE'}`);
    const expectedTitle = passport.items[0]?.expected.title.value ?? 'NOT AVAILABLE';
    addLine(`Expected item: ${expectedTitle}`, { gap: 10 });
    addLine('EXPECTED ↔ OBSERVED', { bold: true, size: 11, gap: 2 });
    addLine(passport_1.COMPARISON_FOOTNOTE_COPY, { size: 8, color: muted, gap: 4 });
    for (const comparison of passport.items[0]?.comparisons ?? []) {
        addLine(`${comparison.attribute}: ${comparison.result}  expected ${comparison.expected ?? 'null'}  observed ${comparison.observed ?? 'null'}`);
    }
    y -= 6;
    addLine('EVIDENCE AVAILABLE', { bold: true, size: 11, gap: 4 });
    for (const entry of passport.evidenceInventory) {
        addLine(`${entry.category.replaceAll('_', ' ')}: ${entry.state.replaceAll('_', ' ')}`);
    }
    y -= 6;
    addLine('FULFILLMENT', { bold: true, size: 11, gap: 4 });
    addLine(`Packing: ${passport.fulfillment.packingArtifactId ?? 'NOT AVAILABLE'}`);
    addLine(`Seal: ${passport.fulfillment.sealArtifactId ?? 'NOT AVAILABLE'}`);
    addLine(`Label: ${passport.fulfillment.labelArtifactId ?? 'NOT AVAILABLE'}`);
    addLine(`Tracking observed: ${passport.fulfillment.trackingObserved.value ?? 'NOT AVAILABLE'}`);
    const tracker = passport.fulfillment.shippingTracker.value;
    addLine(`Tracker: ${tracker ? `${tracker.lookupStatus} ${tracker.courierCode ?? ''}`.trim() : 'NOT AVAILABLE'} (${passport.limitations.shippingTrackerInterpretation})`, { gap: 8 });
    addLine(passport_1.PASSPORT_PAGE_ONE_FOOTER, { size: 8, color: muted, gap: 4 });
    addLine(passport.limitations.humanReviewDisclaimer, { size: 8, color: muted, gap: 12 });
    const showShipment = Boolean(passport.shipment || passport.delivery || passport.fulfillment.trackingObserved.value);
    if (showShipment) {
        addLine('SHIPMENT AND DELIVERY', { bold: true, size: 12, gap: 4 });
        if (passport.shipment) {
            addLine(`Merchant-asserted carrier: ${passport.shipment.carrier.value ?? 'NOT AVAILABLE'} (SOURCE ASSERTION, not a carrier API)`);
            addLine(`Tracking supplied: ${passport.shipment.trackingSupplied.value ?? 'NOT AVAILABLE'}`);
            addLine(`Tracking observed: ${passport.shipment.trackingObserved.value ?? 'NOT AVAILABLE'}`);
        }
        if (passport.delivery) {
            addLine(`Delivery associated at: ${passport.delivery.receivedAt.value ?? 'NOT AVAILABLE'}`);
            addLine(`Arrival artifact: ${passport.delivery.arrivalArtifactId ?? 'NOT AVAILABLE'}`);
            addLine('Carrier signature: NOT AVAILABLE');
        }
        y -= 8;
    }
    if (passport.returns.length || passport.receiver) {
        addLine('RECEIVER AND RETURNS', { bold: true, size: 12, gap: 4 });
        if (passport.receiver)
            addLine(`Receiver capture: arrival ${passport.receiver.arrivalArtifactId ?? 'none'}; unboxing ${passport.receiver.unboxingArtifactId ?? 'none'}`);
        for (const item of passport.returns) {
            addLine(`${item.returnPassportId} — ${item.status}; tracking ${item.trackingSupplied.value ?? 'NOT AVAILABLE'}`);
        }
        y -= 8;
    }
    addLine('CRYPTOGRAPHIC APPENDIX', { bold: true, size: 12, gap: 4 });
    addLine(`Passport ID: ${passport.identity.passportId}`);
    addLine(`Transaction: ${passport.identity.transactionId}`);
    addLine(`Canonicalization: ${passport.integrity.canonicalizationProfile}; bundle: ${passport.integrity.bundleBindingProfile}`);
    addLine(`Manifest authentication: ${passport.integrity.manifestAuthentication.type} ${passport.integrity.manifestAuthentication.algorithm ?? ''} key ${passport.integrity.manifestAuthentication.keyId ?? 'not recorded'}`);
    addLine('HMAC-SHA256 is PackProof service verification only. It is not a digital signature and is not publicly verifiable.', { gap: 6 });
    addLine(`Renderer: ${passport_1.PASSPORT_PDF_RENDERER_VERSION}`);
    addLine(`Verification URL: ${passport.identity.verificationUrl}`, { gap: 6 });
    if (!passport.artifacts.length)
        addLine('No artifacts were present.');
    for (const artifact of passport.artifacts) {
        addLine(`${artifact.artifactId} — ${artifact.type} — ${artifact.finalization}`, { bold: true });
        addLine(`SHA-256: ${artifact.sha256 ?? 'not recorded'}`);
        addLine(`Manifest SHA-256: ${artifact.manifestSha256 ?? 'not recorded'}`);
        addLine(`Bundle SHA-256: ${artifact.evidenceBundleSha256 ?? 'not recorded'}`);
        addLine('Do not treat this appendix as a substitute for native evidence bytes.');
        y -= 4;
    }
    pdf.setTitle(`PackProof Passport ${passport.identity.displayId}`);
    pdf.setSubject('PackProof Passport presentation export. Native evidence records remain the source.');
    pdf.setCreator('PackProof');
    return pdf.save();
}
async function generatePassportPdfExport(input) {
    const bytes = await renderPassportPdf(input.passport);
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