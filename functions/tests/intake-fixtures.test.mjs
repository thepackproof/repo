import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import {
  PDF_IMPORT_V1,
  SCREENSHOT_IMPORT_V1,
  parseCommerceArtifact,
} from '../lib/domain/v1/index.js';

const fixtureDir = join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'commerce-intake');
const snapshots = JSON.parse(readFileSync(join(fixtureDir, 'snapshots.json'), 'utf8'));
const longFooter = 'This is a sanitized footer repeated to keep a long artifact boringly parseable.\n';

function compactSnapshot(parsed, sourceType) {
  return {
    sourceType,
    parserVersion: parsed.parserVersion,
    platformIdentifier: parsed.platformIdentifier,
    title: parsed.item.title,
    variant: parsed.item.selectedOptions[0]?.value ?? null,
    sku: parsed.item.sku,
    quantity: parsed.item.quantity,
    itemAmount: parsed.amounts.itemAmount,
    orderSubtotal: parsed.amounts.orderSubtotal,
    shippingAmount: parsed.amounts.shippingAmount,
    taxAmount: parsed.amounts.taxAmount,
    discountAmount: parsed.amounts.discountAmount,
    orderTotal: parsed.amounts.orderTotal,
    exposedPrice: parsed.item.amount,
    externalOrderId: parsed.externalOrderId,
    missingFields: parsed.missingFields,
  };
}

function artifactTextFor(filename, raw) {
  if (filename !== 'very-long-receipt.txt') return raw;
  return `${raw.trimEnd()}\n${longFooter.repeat(80)}`;
}

function parseFixture(filename) {
  const expected = snapshots[filename];
  assert.ok(expected, `missing snapshot for ${filename}`);
  const raw = readFileSync(join(fixtureDir, filename), 'utf8');
  return parseCommerceArtifact(artifactTextFor(filename, raw), expected.sourceType);
}

test('fixture corpus and snapshots stay paired', () => {
  const files = readdirSync(fixtureDir).filter((name) => name !== 'snapshots.json').sort();
  assert.deepEqual(files, Object.keys(snapshots).sort());
});

for (const filename of Object.keys(snapshots).sort()) {
  test(`commerce intake fixture ${filename}`, () => {
    const expected = snapshots[filename];
    const parsed = parseFixture(filename);
    assert.deepEqual(compactSnapshot(parsed, expected.sourceType), expected);
    assert.equal(parsed.item.title.includes('secret'), false);
    assert.equal(parsed.item.description.includes('secret'), false);
    if (parsed.amounts.shippingAmount || parsed.amounts.taxAmount || parsed.amounts.discountAmount) {
      assert.notDeepEqual(parsed.item.amount, parsed.amounts.orderTotal);
    }
  });
}

test('empty screenshot and PDF stubs stay missing rather than guessed', () => {
  const screenshot = parseCommerceArtifact(null, 'SCREENSHOT_IMPORT');
  assert.equal(screenshot.parserVersion, SCREENSHOT_IMPORT_V1);
  assert.deepEqual(screenshot.missingFields, ['title', 'price', 'variant', 'orderNumber']);
  assert.equal(screenshot.item.amount, null);

  const pdf = parseCommerceArtifact(null, 'PDF_IMPORT');
  assert.equal(pdf.parserVersion, PDF_IMPORT_V1);
  assert.deepEqual(pdf.missingFields, ['title', 'price', 'variant', 'orderNumber']);
  assert.equal(pdf.item.amount, null);
});

test('item plus shipping plus tax does not record the order total as the item price', () => {
  const parsed = parseFixture('item-shipping-tax-total.txt');
  assert.equal(parsed.item.amount?.minorUnits, 40000);
  assert.equal(parsed.amounts.orderTotal?.minorUnits, 44700);
  assert.equal(parsed.missingFields.includes('price'), false);
});

test('unlabeled money is missing rather than guessed', () => {
  const parsed = parseFixture('unlabeled-money.txt');
  assert.equal(parsed.item.amount, null);
  assert.equal(parsed.amounts.orderTotal, null);
  assert.equal(parsed.missingFields.includes('price'), true);
});
