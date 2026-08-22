import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

const require = createRequire(import.meta.url);
const extraction = require('../lib/domain/v1/transaction-intake-extraction.js');
const parsers = require('../lib/domain/v1/transaction-intake-parsers.js');
const { TransactionIntakeApplicationService, ApplicationError } = (() => {
  const service = require('../lib/application/v1/transaction-intake-service.js');
  const errors = require('../lib/application/v1/errors.js');
  return { TransactionIntakeApplicationService: service.TransactionIntakeApplicationService, ApplicationError: errors.ApplicationError };
})();

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PNG_1X1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const RECEIPT_LINES = [
  'Item: Collectible camera',
  'Sold for: USD 1299.00',
  'Order number: A-998877',
  'SKU: A7-BODY',
];

function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function receiptPdf(lines = RECEIPT_LINES) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  let y = 720;
  for (const line of lines) {
    page.drawText(line, { x: 48, y, size: 12, font, color: rgb(0, 0, 0) });
    y -= 18;
  }
  return Buffer.from(await pdf.save());
}

async function imageOnlyPdf() {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([200, 200]);
  const image = await pdf.embedPng(PNG_1X1);
  page.drawImage(image, { x: 20, y: 20, width: 40, height: 40 });
  return Buffer.from(await pdf.save());
}

function memoryIntake() {
  const records = [];
  return {
    records,
    repository: {
      async createOrReplay(mutation) {
        const existing = records.find((item) => item.commerceContextId === mutation.commerceContextId);
        if (existing) return { created: false };
        records.push(mutation);
        return { created: true };
      },
      async listPendingForActor() {
        return records.map((item) => item.pending);
      },
      async hasActiveTransactionForSeller() {
        return false;
      },
      async claim() {
        throw new Error('not used');
      },
    },
  };
}

test('PDF text layer extracts candidates without confirming them', async () => {
  const bytes = await receiptPdf();
  const extracted = extraction.extractIntakeArtifact({ intakeSourceType: 'PDF_IMPORT', artifactBytes: bytes });
  assert.equal(extracted.hasTextLayer, true);
  assert.equal(extracted.extractionMethod, extraction.PDF_TEXT_LAYER_V1);
  assert.equal(extracted.item.title, 'Collectible camera');
  assert.equal(extracted.externalOrderId, 'A-998877');
  assert.equal(extracted.item.amount?.minorUnits, 129900);
  assert.equal(extracted.item.sku, 'A7-BODY');
  assert.equal(extracted.originalArtifactSha256, sha256Bytes(bytes));
  assert.notEqual(extracted.originalArtifactSha256, sha256Bytes(Buffer.from(extracted.extractedText)));
});

test('image-only PDF and screenshots do not invent commerce facts', async () => {
  const pdfBytes = await imageOnlyPdf();
  const emptyPdf = extraction.extractIntakeArtifact({ intakeSourceType: 'PDF_IMPORT', artifactBytes: pdfBytes });
  assert.equal(emptyPdf.hasTextLayer, false);
  assert.equal(emptyPdf.extractionMethod, parsers.PDF_IMPORT_V1);
  assert.deepEqual(emptyPdf.missingFields, ['title', 'price', 'variant', 'orderNumber']);
  assert.equal(emptyPdf.item.title, '');

  const screenshot = extraction.extractIntakeArtifact({ intakeSourceType: 'SCREENSHOT_IMPORT', artifactBytes: PNG_1X1 });
  assert.equal(screenshot.extractionMethod, extraction.SCREENSHOT_BYTES_V1);
  assert.equal(screenshot.hasTextLayer, false);
  assert.equal(screenshot.extractedText, null);
  assert.deepEqual(screenshot.missingFields, ['title', 'price', 'variant', 'orderNumber']);
  assert.equal(screenshot.originalArtifactSha256, sha256Bytes(PNG_1X1));
});

test('ingest hashes original PDF bytes and marks confirmed fields separately', async () => {
  const bytes = await receiptPdf();
  const digest = sha256Bytes(bytes);
  const { records, repository } = memoryIntake();
  const service = new TransactionIntakeApplicationService(repository, () => new Date('2026-08-22T16:00:00.000Z'));
  const preview = service.preview(null, 'PDF_IMPORT', bytes);
  assert.equal(preview.hasTextLayer, true);
  assert.equal(preview.item.title, 'Collectible camera');

  await assert.rejects(
    () => service.ingestArtifact({
      actorId: 'seller-1',
      operationKey: 'pdf-bad-hash',
      requestId: 'pdf-bad-hash',
      intakeSourceType: 'PDF_IMPORT',
      originalArtifactSha256: 'd'.repeat(64),
      artifactText: null,
      artifactBytes: bytes,
    }),
    (error) => error instanceof ApplicationError && error.code === 'ARTIFACT_HASH_MISMATCH',
  );

  const imported = await service.ingestArtifact({
    actorId: 'seller-1',
    operationKey: 'pdf-good',
    requestId: 'pdf-good',
    intakeSourceType: 'PDF_IMPORT',
    originalArtifactSha256: digest,
    artifactText: null,
    artifactBytes: bytes,
    confirmed: { title: 'Leica M6', priceMinor: 420000, currency: 'USD' },
  });
  assert.equal(imported.pending.title, 'Leica M6');
  assert.equal(imported.pending.orderNumber, 'A-998877');
  const context = records[0].commerceContext;
  assert.equal(context.source.originalArtifactSha256, digest);
  assert.equal(context.source.intakeSourceType, 'PDF_IMPORT');
  assert.equal(context.fieldProvenance['item.title'].source, 'SELLER_ENTERED');
  assert.equal(context.fieldProvenance['item.title'].extractionMethod, parsers.CONFIRMED_FIELDS_V1);
  assert.equal(context.fieldProvenance['item.amount'].source, 'SELLER_ENTERED');
  assert.equal(context.fieldProvenance['item.sku'].source, 'PDF_IMPORT');
  assert.equal(context.fieldProvenance['item.sku'].extractionMethod, extraction.PDF_TEXT_LAYER_V1);
  assert.equal(context.fieldProvenance['item.sku'].sourceArtifactSha256, digest);
});

test('screenshot ingest stores the file hash and only seller-entered facts', async () => {
  const digest = sha256Bytes(PNG_1X1);
  const { records, repository } = memoryIntake();
  const service = new TransactionIntakeApplicationService(repository, () => new Date('2026-08-22T16:00:00.000Z'));
  const imported = await service.ingestArtifact({
    actorId: 'seller-1',
    operationKey: 'shot-1',
    requestId: 'shot-1',
    intakeSourceType: 'SCREENSHOT_IMPORT',
    originalArtifactSha256: digest,
    artifactText: null,
    artifactBytes: PNG_1X1,
    confirmed: { title: 'Sony A7 Camera' },
  });
  assert.equal(imported.pending.title, 'Sony A7 Camera');
  assert.deepEqual(imported.pending.missingFields.filter((field) => field !== 'title'), ['price', 'variant', 'orderNumber']);
  const title = records[0].commerceContext.fieldProvenance['item.title'];
  assert.equal(title.source, 'SELLER_ENTERED');
  assert.equal(title.extractionMethod, parsers.CONFIRMED_FIELDS_V1);
  assert.equal(title.sourceArtifactSha256, digest);
  assert.equal(records[0].commerceContext.source.parserVersion, parsers.SCREENSHOT_IMPORT_V1);
});

test('extraction source stays free of OCR and Android sends PDF bytes only', () => {
  const extractor = readFileSync(join(root, 'functions', 'src', 'domain', 'v1', 'transaction-intake-extraction.ts'), 'utf8');
  const importer = readFileSync(join(root, 'src', 'app', 'transaction', 'import.tsx'), 'utf8');
  assert.doesNotMatch(extractor, /tesseract|vision|ocr|openai|anthropic/i);
  assert.match(importer, /artifactBytesBase64/);
  assert.match(importer, /sourceType === 'PDF_IMPORT' \? binaryBase64/);
  assert.match(importer, /setBinaryBase64\(null\)/);
  assert.match(importer, /does not read pixels/);
});
