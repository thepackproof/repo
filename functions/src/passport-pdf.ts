import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage, type RGB } from 'pdf-lib';
import QRCode from 'qrcode';
import {
  COMPARISON_FOOTNOTE_COPY,
  INTEGRITY_MEANING_LIMITED,
  INTEGRITY_MEANING_VERIFIED,
  PASSPORT_PAGE_ONE_FOOTER,
  PASSPORT_PDF_RENDERER_VERSION,
  type PackProofPassportV1,
} from './domain/v1/passport';

export const PASSPORT_PDF_PAGE_WIDTH = 612;
export const PASSPORT_PDF_PAGE_HEIGHT = 792;

export type PassportPdfStillRole = 'ITEM' | 'INTERIOR' | 'SEAL' | 'LABEL';

export type PassportPdfStill = {
  role: PassportPdfStillRole;
  artifactId: string;
  bytes: Uint8Array;
  contentType: string;
};

export type PassportPdfPageId = 'COVER' | 'STILLS' | 'COMPARISON' | 'SHIPMENT' | 'RETURNS' | 'APPENDIX';

const STILL_ORDER: PassportPdfStillRole[] = ['ITEM', 'INTERIOR', 'SEAL', 'LABEL'];

export function stillRoleForArtifact(type: string, contentType: string | null): PassportPdfStillRole | null {
  const media = (contentType ?? '').toLowerCase();
  if (media.startsWith('video/')) return null;
  if (type === 'ITEM_PHOTO' || type === 'IDENTIFIER_PHOTO' || type === 'CONDITION_PHOTO' || type === 'COA_PHOTO') return 'ITEM';
  if (type === 'PHYSICAL_REFERENCE_FRAME') return 'INTERIOR';
  if (type === 'STATION_SEAL_REFERENCE') return 'SEAL';
  if (type === 'SHIPPING_LABEL' || type === 'RETURN_SHIPPING_LABEL') return 'LABEL';
  return null;
}

export function passportQrMatrix(payload: string): { size: number; dark: (row: number, column: number) => boolean } {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  return {
    size: qr.modules.size,
    dark: (row, column) => Boolean(qr.modules.get(row, column)),
  };
}

export function passportPdfPagePlan(
  passport: PackProofPassportV1,
  stills: readonly PassportPdfStill[] = [],
): PassportPdfPageId[] {
  const pages: PassportPdfPageId[] = ['COVER'];
  if (stills.length || passport.fulfillment.packingArtifactId) pages.push('STILLS');
  pages.push('COMPARISON');
  if (passport.shipment || passport.delivery || passport.fulfillment.trackingObserved.value) pages.push('SHIPMENT');
  if (passport.returns.length || passport.receiver) pages.push('RETURNS');
  pages.push('APPENDIX');
  return pages;
}

function wrapText(text: string, maxChars: number): string[] {
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

function money(amount: { currency: string; minorUnits: number } | null): string {
  return amount ? `${amount.currency} ${(amount.minorUnits / 100).toFixed(2)}` : 'NOT AVAILABLE';
}

function labelize(value: string): string {
  return value.replaceAll('_', ' ');
}

function pdfSafe(text: string): string {
  return text
    .replaceAll('↔', 'vs')
    .replaceAll('™', '(TM)')
    .replaceAll('—', '-')
    .replaceAll('–', '-')
    .replaceAll('‘', "'")
    .replaceAll('’', "'")
    .replaceAll('“', '"')
    .replaceAll('”', '"');
}

class PassportPdfWriter {
  readonly pdf: PDFDocument;
  page!: PDFPage;
  y = 744;
  overflow = false;
  private readonly regular: PDFFont;
  private readonly bold: PDFFont;
  readonly dark: RGB;
  readonly teal: RGB;
  readonly muted: RGB;
  readonly rule: RGB;

  constructor(pdf: PDFDocument, regular: PDFFont, bold: PDFFont) {
    this.pdf = pdf;
    this.regular = regular;
    this.bold = bold;
    this.dark = rgb(0.07, 0.09, 0.12);
    this.teal = rgb(0.27, 0.49, 0.39);
    this.muted = rgb(0.36, 0.40, 0.47);
    this.rule = rgb(0.82, 0.85, 0.88);
  }

  startPage(overflow = false): void {
    this.page = this.pdf.addPage([PASSPORT_PDF_PAGE_WIDTH, PASSPORT_PDF_PAGE_HEIGHT]);
    this.overflow = overflow;
    this.y = 744;
  }

  private ensure(height: number): void {
    if (!this.overflow) return;
    if (this.y - height < 48) {
      this.startPage(true);
    }
  }

  line(text: string, options: { bold?: boolean; size?: number; color?: RGB; gap?: number; x?: number; widthChars?: number } = {}): void {
    const size = options.size ?? 9;
    const x = options.x ?? 48;
    for (const entry of wrapText(text, options.widthChars ?? Math.floor(92 * (9 / size)))) {
      this.ensure(size + 6);
      this.page.drawText(pdfSafe(entry), { x, y: this.y, size, font: options.bold ? this.bold : this.regular, color: options.color ?? this.dark });
      this.y -= size + 4;
    }
    this.y -= options.gap ?? 2;
  }

  heading(text: string): void {
    this.line(text, { bold: true, size: 11, color: this.teal, gap: 4 });
  }

  footer(text: string): void {
    this.page.drawText(pdfSafe(text), { x: 48, y: 28, size: 7, font: this.regular, color: this.muted });
  }

  drawQr(payload: string, x: number, y: number, size: number): void {
    const matrix = passportQrMatrix(payload);
    const cell = size / matrix.size;
    this.page.drawRectangle({ x, y, width: size, height: size, color: rgb(1, 1, 1) });
    for (let row = 0; row < matrix.size; row += 1) {
      for (let column = 0; column < matrix.size; column += 1) {
        if (!matrix.dark(row, column)) continue;
        this.page.drawRectangle({
          x: x + column * cell,
          y: y + (matrix.size - 1 - row) * cell,
          width: cell,
          height: cell,
          color: this.dark,
        });
      }
    }
  }
}

async function embedStill(pdf: PDFDocument, still: PassportPdfStill) {
  try {
    if (still.contentType.toLowerCase().includes('png')) return await pdf.embedPng(still.bytes);
    return await pdf.embedJpg(still.bytes);
  } catch {
    return null;
  }
}

export async function renderPassportPdf(
  passport: PackProofPassportV1,
  stills: readonly PassportPdfStill[] = [],
): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const writer = new PassportPdfWriter(pdf, regular, bold);
  const pages = passportPdfPagePlan(passport, stills);
  const uniqueStills = STILL_ORDER.flatMap((role) => {
    const match = stills.find((item) => item.role === role);
    return match ? [match] : [];
  });

  for (const pageId of pages) {
    writer.startPage(pageId === 'APPENDIX');
    if (pageId === 'COVER') {
      writer.line('PACKPROOF', { bold: true, size: 12, color: writer.teal, gap: 2, widthChars: 46 });
      writer.line(`Proof ${passport.identity.displayId}`, { bold: true, size: 18, gap: 2, widthChars: 46 });
      writer.line(passport.identity.verificationUrl, { size: 7, color: writer.muted, gap: 6, widthChars: 52 });
      writer.drawQr(passport.identity.qrPayload, 454, 616, 110);
      writer.y = Math.min(writer.y, 604);
      writer.line(labelize(passport.integrity.banner), { bold: true, size: 13, color: writer.teal, gap: 2 });
      writer.line(passport.integrity.summary, { bold: true, size: 10, gap: 2 });
      writer.line(passport.integrity.banner === 'AUTHENTIC_PACKPROOF' ? INTEGRITY_MEANING_VERIFIED : INTEGRITY_MEANING_LIMITED, { gap: 8 });
      writer.heading('TRANSACTION');
      writer.line(`Platform: ${passport.transaction.platform.value ?? 'NOT AVAILABLE'} (${passport.transaction.sourceTrustClass ?? 'unspecified trust'})`);
      writer.line(`Order: ${passport.transaction.externalOrderId.value ?? 'NOT AVAILABLE'}`);
      writer.line(`Date: ${passport.transaction.transactionDate.value ?? 'NOT AVAILABLE'}`);
      writer.line(`Amount: ${money(passport.transaction.amount.value)}`);
      writer.line(`Expected item: ${passport.items[0]?.expected.title.value ?? 'NOT AVAILABLE'}`, { gap: 8 });
      writer.heading('EXPECTED vs OBSERVED');
      writer.line(COMPARISON_FOOTNOTE_COPY, { size: 8, color: writer.muted, gap: 4 });
      for (const comparison of passport.items[0]?.comparisons ?? []) {
        writer.line(`${comparison.attribute}: ${comparison.result}`);
      }
      writer.y -= 4;
      writer.heading('EVIDENCE AVAILABLE');
      const inventory = passport.evidenceInventory;
      for (let index = 0; index < inventory.length; index += 2) {
        const left = inventory[index];
        const right = inventory[index + 1];
        const rowY = writer.y;
        writer.page.drawText(pdfSafe(`${labelize(left.category)} - ${labelize(left.state)}`), {
          x: 48, y: rowY, size: 8, font: regular, color: writer.dark,
        });
        if (right) {
          writer.page.drawText(pdfSafe(`${labelize(right.category)} - ${labelize(right.state)}`), {
            x: 320, y: rowY, size: 8, font: regular, color: writer.dark,
          });
        }
        writer.y = rowY - 12;
      }
      writer.y -= 6;
      writer.heading('FULFILLMENT');
      writer.line(`Packing: ${passport.fulfillment.packingArtifactId ?? 'NOT AVAILABLE'}`);
      writer.line(`Seal: ${passport.fulfillment.sealArtifactId ?? 'NOT AVAILABLE'}`);
      writer.line(`Label: ${passport.fulfillment.labelArtifactId ?? 'NOT AVAILABLE'}`);
      writer.line(`Tracking observed: ${passport.fulfillment.trackingObserved.value ?? 'NOT AVAILABLE'}`);
      const tracker = passport.fulfillment.shippingTracker.value;
      writer.line(`Tracker: ${tracker ? `${tracker.lookupStatus} ${tracker.courierCode ?? ''}`.trim() : 'NOT AVAILABLE'}`, { gap: 10 });
      writer.line(PASSPORT_PAGE_ONE_FOOTER, { size: 8, color: writer.muted, gap: 2 });
      writer.line(passport.limitations.humanReviewDisclaimer, { size: 8, color: writer.muted });
      writer.footer('Page 1 — identity, authenticity, transaction, inventory');
    } else if (pageId === 'STILLS') {
      writer.line('Item, interior, seal, and label stills', { bold: true, size: 14, color: writer.teal, gap: 6 });
      writer.line('Packing video is never embedded. Native artifact bytes remain the source.', { size: 8, color: writer.muted, gap: 8 });
      if (passport.fulfillment.packingArtifactId) {
        const packing = passport.artifacts.find((item) => item.artifactId === passport.fulfillment.packingArtifactId);
        writer.line(`Packing capture: ${passport.fulfillment.packingArtifactId}${packing?.contentType ? ` (${packing.contentType})` : ''}`, { gap: 4 });
        writer.line('Video duration is not stored as a first-class 1.0 field. Open the verification URL for the native packing artifact.', { size: 8, color: writer.muted, gap: 10 });
      }
      let column = 0;
      let rowTop = writer.y;
      for (const still of uniqueStills) {
        const x = column === 0 ? 48 : 318;
        if (column === 0) rowTop = writer.y;
        const image = await embedStill(pdf, still);
        writer.page.drawText(pdfSafe(`${still.role}  ${still.artifactId}`), {
          x, y: rowTop, size: 8, font: bold, color: writer.dark,
        });
        if (image) {
          const boxed = image.scaleToFit(246, 186);
          writer.page.drawImage(image, { x, y: rowTop - 12 - boxed.height, width: boxed.width, height: boxed.height });
        } else {
          writer.page.drawRectangle({ x, y: rowTop - 198, width: 246, height: 186, borderColor: writer.rule, borderWidth: 1 });
          writer.page.drawText('Still not embedded. See native artifact.', {
            x: x + 12, y: rowTop - 100, size: 8, font: regular, color: writer.muted,
          });
        }
        column += 1;
        if (column === 2) {
          column = 0;
          writer.y = rowTop - 214;
        }
      }
      if (column === 1) writer.y = rowTop - 214;
      if (!uniqueStills.length) {
        writer.line('No still images were available to embed. Packing duration/reference is shown above when a packing artifact exists.');
      }
      writer.footer('Page 2 — stills and packing reference');
    } else if (pageId === 'COMPARISON') {
      writer.line('Expected vs observed detail', { bold: true, size: 14, color: writer.teal, gap: 6 });
      writer.line(COMPARISON_FOOTNOTE_COPY, { size: 8, color: writer.muted, gap: 8 });
      for (const comparison of passport.items[0]?.comparisons ?? []) {
        writer.line(`${comparison.attribute}`, { bold: true, gap: 1 });
        writer.line(`Result: ${comparison.result}   Method: ${comparison.method}   Footnote: ${comparison.footnote}`);
        writer.line(`Expected: ${comparison.expected ?? 'null'}`, { size: 8 });
        writer.line(`Observed: ${comparison.observed ?? 'null'}`, { size: 8, gap: 8 });
      }
      writer.heading('Observations');
      for (const observation of passport.items[0]?.observations ?? []) {
        writer.line(`${observation.kind}: ${String(observation.result.value ?? 'null')} (${observation.artifactId ?? 'no artifact'})`);
      }
      writer.footer('Page 3 — expected vs observed');
    } else if (pageId === 'SHIPMENT') {
      writer.line('Shipment and delivery', { bold: true, size: 14, color: writer.teal, gap: 6 });
      writer.line('Merchant-associated tracking is a source assertion unless a carrier adapter supplied a third-party assertion.', { size: 8, color: writer.muted, gap: 8 });
      if (passport.shipment) {
        writer.heading('SHIPMENT');
        writer.line(`Merchant-asserted carrier: ${passport.shipment.carrier.value ?? 'NOT AVAILABLE'}`);
        writer.line(`Tracking supplied: ${passport.shipment.trackingSupplied.value ?? 'NOT AVAILABLE'}`);
        writer.line(`Tracking observed: ${passport.shipment.trackingObserved.value ?? 'NOT AVAILABLE'}`);
        writer.line(`Label observed by PackProof: ${passport.shipment.labelObservedByPackProof ? 'YES' : 'NO'}`, { gap: 8 });
      }
      if (passport.delivery) {
        writer.heading('DELIVERY');
        writer.line(`Delivery associated at: ${passport.delivery.receivedAt.value ?? 'NOT AVAILABLE'}`);
        writer.line(`Arrival artifact: ${passport.delivery.arrivalArtifactId ?? 'NOT AVAILABLE'}`);
        writer.line('Carrier signature: NOT AVAILABLE');
      }
      writer.footer('Page 4 — shipment and delivery');
    } else if (pageId === 'RETURNS') {
      writer.line('Returns and receiver capture', { bold: true, size: 14, color: writer.teal, gap: 8 });
      if (passport.receiver) {
        writer.line(`Receiver capture: arrival ${passport.receiver.arrivalArtifactId ?? 'none'}; unboxing ${passport.receiver.unboxingArtifactId ?? 'none'}`, { gap: 8 });
      }
      for (const item of passport.returns) {
        writer.line(`${item.returnPassportId} — ${item.status}`, { bold: true });
        writer.line(`Reason: ${item.reason ?? 'NOT AVAILABLE'}`);
        writer.line(`Tracking supplied: ${item.trackingSupplied.value ?? 'NOT AVAILABLE'}`, { gap: 6 });
      }
      writer.footer('Page 5 — returns');
    } else {
      writer.line('Cryptographic appendix', { bold: true, size: 14, color: writer.teal, gap: 6 });
      writer.line('This appendix is presentation-only. Native evidence records remain the source.', { size: 8, color: writer.muted, gap: 8 });
      writer.line(`Proof ID: ${passport.identity.passportId}`);
      writer.line(`Transaction: ${passport.identity.transactionId}`);
      writer.line(`Canonicalization: ${passport.integrity.canonicalizationProfile}; bundle: ${passport.integrity.bundleBindingProfile}`);
      writer.line(`Manifest authentication: ${passport.integrity.manifestAuthentication.type} ${passport.integrity.manifestAuthentication.algorithm ?? ''} key ${passport.integrity.manifestAuthentication.keyId ?? 'not recorded'}`);
      writer.line('HMAC-SHA256 is PackProof service verification only. It is not a digital signature and is not publicly verifiable.', { gap: 6 });
      writer.line(`Renderer: ${PASSPORT_PDF_RENDERER_VERSION}`);
      writer.line(`Verification URL: ${passport.identity.verificationUrl}`, { gap: 8 });
      writer.heading('INTEGRITY CRITERIA');
      for (const [name, status] of Object.entries(passport.integrity.criteria)) {
        writer.line(`${labelize(name)}: ${status}`);
      }
      writer.y -= 6;
      writer.heading('ARTIFACT DIGESTS');
      if (!passport.artifacts.length) writer.line('No artifacts were present.');
      for (const artifact of passport.artifacts) {
        writer.line(`${artifact.artifactId} — ${artifact.type} — ${artifact.finalization}`, { bold: true });
        writer.line(`SHA-256: ${artifact.sha256 ?? 'not recorded'}`, { size: 8 });
        writer.line(`Manifest SHA-256: ${artifact.manifestSha256 ?? 'not recorded'}`, { size: 8 });
        writer.line(`Bundle SHA-256: ${artifact.evidenceBundleSha256 ?? 'not recorded'}`, { size: 8, gap: 6 });
      }
      writer.footer('Appendix — hashes, manifests, and verification');
    }
  }

  pdf.setTitle(`PackProof Proof ${passport.identity.displayId}`);
  pdf.setSubject('PackProof Proof presentation export. Native evidence records remain the source.');
  pdf.setCreator('PackProof');
  pdf.setKeywords(pages);
  return pdf.save();
}
