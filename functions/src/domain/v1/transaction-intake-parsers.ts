import type { ExtractionQuality, Money } from './common';
import type { ConsumerIntakeSourceType, ItemDescriptor } from './commerce';
import { DomainValidationError } from './runtime';

export const MAX_INTAKE_ARTIFACT_CHARS = 100_000;
export const EBAY_EMAIL_PARSER_V1 = 'EBAY_EMAIL_PARSER_V1';
export const ETSY_EMAIL_PARSER_V1 = 'ETSY_EMAIL_PARSER_V1';
export const SHOPIFY_EMAIL_PARSER_V1 = 'SHOPIFY_EMAIL_PARSER_V1';
export const GENERIC_COMMERCE_TEXT_PARSER_V1 = 'GENERIC_COMMERCE_TEXT_PARSER_V1';
export const SCREENSHOT_IMPORT_V1 = 'SCREENSHOT_IMPORT_V1';
export const PDF_IMPORT_V1 = 'PDF_IMPORT_V1';
export const CONFIRMED_FIELDS_V1 = 'CONFIRMED_FIELDS_V1';

export const intakeMissingFieldNames = ['title', 'price', 'variant', 'orderNumber'] as const;
export type IntakeMissingField = (typeof intakeMissingFieldNames)[number];
export const intakeExtractedFieldNames = ['title', 'price', 'variant', 'orderNumber', 'platform'] as const;
export type IntakeExtractedField = (typeof intakeExtractedFieldNames)[number];
export const confirmableHeuristicFields = ['title', 'price', 'variant', 'orderNumber'] as const;

export type ExtractionQualityMap = Partial<Record<IntakeExtractedField, ExtractionQuality>>;

export type ExtractedCommerceMessage = {
  from: string;
  subject: string;
  body: string;
};

export type CommerceArtifactParseResult = {
  parserVersion: string;
  platformIdentifier: string | null;
  item: ItemDescriptor;
  externalOrderId: string | null;
  externalListingId: string | null;
  productUrl: string | null;
  missingFields: IntakeMissingField[];
  extractionQuality: ExtractionQualityMap;
  heuristicFields: IntakeExtractedField[];
};

const EBAY_SENDER = /@(?:ebay\.com|ebay\.[a-z]{2,3})\b/i;
const ETSY_SENDER = /@etsy\.com\b/i;
const SHOPIFY_SENDER = /@(?:shopify\.com|myshopify\.com)\b/i;
const EBAY_BODY = /you sold(?: an item)?|sold an item|congratulations[!.,]?\s+you sold/i;
const ETSY_BODY = /you made a sale(?: on etsy)?/i;
const SHOPIFY_BODY = /thank you for your (?:purchase|order)|your order is confirmed/i;

export function emptyIntakeItem(): ItemDescriptor {
  return {
    title: '',
    description: '',
    category: null,
    brand: null,
    model: null,
    sku: null,
    gtin: null,
    upc: null,
    mpn: null,
    serialNumber: null,
    selectedOptions: [],
    identifiers: [],
    quantity: 1,
    amount: null,
    imageReferences: [],
  };
}

export function missingIntakeFields(item: ItemDescriptor, externalOrderId: string | null): IntakeMissingField[] {
  const missing: IntakeMissingField[] = [];
  if (!item.title.trim()) missing.push('title');
  if (!item.amount) missing.push('price');
  if (!item.selectedOptions.length) missing.push('variant');
  if (!externalOrderId) missing.push('orderNumber');
  return missing;
}

export function extractCommerceMessage(raw: string): ExtractedCommerceMessage {
  const normalized = raw.replace(/\r\n/g, '\n');
  const headerSplit = normalized.indexOf('\n\n');
  const looksLikeEmail = /^(from|subject|mime-version|content-type):/im.test(normalized.slice(0, 800));
  if (!looksLikeEmail || headerSplit < 0) {
    return { from: '', subject: '', body: stripHtml(decodeQuotedPrintable(normalized)).trim() };
  }
  const headers = normalized.slice(0, headerSplit);
  const body = decodeQuotedPrintable(unwrapMimeBody(normalized.slice(headerSplit + 2))).trim();
  return {
    from: headerValue(headers, 'from'),
    subject: headerValue(headers, 'subject'),
    body,
  };
}

export function parseCommerceArtifact(
  artifactText: string | null,
  intakeSourceType: ConsumerIntakeSourceType,
): CommerceArtifactParseResult {
  if (artifactText !== null && artifactText.length > MAX_INTAKE_ARTIFACT_CHARS) {
    throw new DomainValidationError({
      path: 'artifactText',
      code: 'FORMAT',
      message: `artifact text must be at most ${MAX_INTAKE_ARTIFACT_CHARS} characters`,
    });
  }
  if (!artifactText?.trim()) {
    const item = emptyIntakeItem();
    const parserVersion = intakeSourceType === 'PDF_IMPORT' ? PDF_IMPORT_V1
      : intakeSourceType === 'SCREENSHOT_IMPORT' ? SCREENSHOT_IMPORT_V1
        : CONFIRMED_FIELDS_V1;
    return resultOf(parserVersion, null, item, null, null, null, {});
  }
  const message = extractCommerceMessage(artifactText);
  const combined = `${message.subject}\n${message.body}`;
  const ebay = parseEbaySoldMessage(message, combined);
  if (ebay) return ebay;
  const etsy = parseEtsySoldMessage(message, combined);
  if (etsy) return etsy;
  const shopify = parseShopifyOrderMessage(message, combined);
  if (shopify) return shopify;
  return parseGenericCommerceText(message, combined);
}

export function heuristicFieldsOf(extraction: ExtractionQualityMap): IntakeExtractedField[] {
  return intakeExtractedFieldNames.filter((field) => extraction[field] === 'HEURISTIC');
}

export function confirmableHeuristicFieldsOf(extraction: ExtractionQualityMap | IntakeExtractedField[]): IntakeExtractedField[] {
  const heuristic = Array.isArray(extraction) ? extraction : heuristicFieldsOf(extraction);
  return heuristic.filter((field): field is (typeof confirmableHeuristicFields)[number] => (
    (confirmableHeuristicFields as readonly string[]).includes(field)
  ));
}

function resultOf(
  parserVersion: string,
  platformIdentifier: string | null,
  item: ItemDescriptor,
  externalOrderId: string | null,
  externalListingId: string | null,
  productUrl: string | null,
  extraction: ExtractionQualityMap,
): CommerceArtifactParseResult {
  return {
    parserVersion,
    platformIdentifier,
    item,
    externalOrderId,
    externalListingId,
    productUrl,
    missingFields: missingIntakeFields(item, externalOrderId),
    extractionQuality: extraction,
    heuristicFields: heuristicFieldsOf(extraction),
  };
}

function parseEbaySoldMessage(message: ExtractedCommerceMessage, combined: string): CommerceArtifactParseResult | null {
  const sender = EBAY_SENDER.test(message.from);
  if (!sender && !EBAY_BODY.test(combined)) return null;
  const order = extractOrderNumber(combined, ['order number', 'order id', 'order #', 'order'], [
    /\b(\d{2}-\d{5}-\d{5})\b/,
    /\b(\d{10,20})\b/,
  ]);
  const listingId = firstMatch(combined, [/listing(?:\s*(?:id|number|#))[:\s]+(\d{8,20})/i]);
  const title = extractTitle(combined, message.subject, ['item', 'item title'], /you sold\s+(.+)$/i);
  const amount = parseListedMoney(combined, ['sold for', 'sale price', 'price', 'total']);
  const item = itemFromText(combined, {
    title: title?.value ?? null,
    quantity: labeledInteger(combined, ['quantity', 'qty']),
    amount: amount?.value ?? null,
  });
  return resultOf(EBAY_EMAIL_PARSER_V1, 'EBAY', item, order?.value ?? null, listingId, firstHttpsUrl(combined), {
    platform: sender ? 'FORMAT_MATCH' : 'HEURISTIC',
    ...(title ? { title: title.confidence } : {}),
    ...(amount ? { price: amount.confidence } : {}),
    ...(item.selectedOptions.length ? { variant: 'EXACT_LABELED' } : {}),
    ...(order ? { orderNumber: order.confidence } : {}),
  });
}

function parseEtsySoldMessage(message: ExtractedCommerceMessage, combined: string): CommerceArtifactParseResult | null {
  const sender = ETSY_SENDER.test(message.from);
  if (!sender && !ETSY_BODY.test(combined)) return null;
  const order = extractOrderNumber(combined, ['order number', 'order id', 'order #', 'order'], [/\b(\d{6,20})\b/]);
  const title = extractTitle(combined, message.subject, ['item', 'listing'], /you made a sale(?: on etsy)?[:\s]+(.+)$/i);
  const amount = parseListedMoney(combined, ['order total', 'total', 'price', 'sold for']);
  const item = itemFromText(combined, {
    title: title?.value ?? null,
    quantity: labeledInteger(combined, ['quantity', 'qty']),
    amount: amount?.value ?? null,
  });
  return resultOf(ETSY_EMAIL_PARSER_V1, 'ETSY', item, order?.value ?? null, null, firstHttpsUrl(combined), {
    platform: sender ? 'FORMAT_MATCH' : 'HEURISTIC',
    ...(title ? { title: title.confidence } : {}),
    ...(amount ? { price: amount.confidence } : {}),
    ...(item.selectedOptions.length ? { variant: 'EXACT_LABELED' } : {}),
    ...(order ? { orderNumber: order.confidence } : {}),
  });
}

function parseShopifyOrderMessage(message: ExtractedCommerceMessage, combined: string): CommerceArtifactParseResult | null {
  const sender = SHOPIFY_SENDER.test(message.from);
  const body = SHOPIFY_BODY.test(combined);
  const viaShopify = /via shopify/i.test(combined);
  if (!sender && !body && !viaShopify) return null;
  const order = extractOrderNumber(combined, ['order number', 'order id', 'order #', 'order'], [/\b(\d{3,12})\b/]);
  if (!sender && !body && !order) return null;
  const title = extractTitle(combined, message.subject, ['item', 'product'], null);
  const amount = parseListedMoney(combined, ['total', 'subtotal', 'price']);
  const item = itemFromText(combined, {
    title: title?.value ?? null,
    quantity: labeledInteger(combined, ['quantity', 'qty']),
    amount: amount?.value ?? null,
  });
  return resultOf(SHOPIFY_EMAIL_PARSER_V1, 'SHOPIFY', item, order?.value ?? null, null, firstHttpsUrl(combined), {
    platform: sender ? 'FORMAT_MATCH' : 'HEURISTIC',
    ...(title ? { title: title.confidence } : {}),
    ...(amount ? { price: amount.confidence } : {}),
    ...(item.selectedOptions.length ? { variant: 'EXACT_LABELED' } : {}),
    ...(order ? { orderNumber: order.confidence } : {}),
  });
}

function parseGenericCommerceText(message: ExtractedCommerceMessage, combined: string): CommerceArtifactParseResult {
  const order = extractOrderNumber(combined, ['order number', 'order id', 'order #', 'order'], [/\b([A-Z]{1,4}-\d{5,20})\b/]);
  const title = extractTitle(combined, message.subject, ['item', 'item title', 'product'], /(?:sold|order|receipt)[:\s]+(.+)$/i);
  const amount = parseListedMoney(combined, ['sold for', 'total', 'price', 'amount']);
  const item = itemFromText(combined, {
    title: title?.value ?? null,
    quantity: labeledInteger(combined, ['quantity', 'qty']),
    amount: amount?.value ?? null,
  });
  return resultOf(GENERIC_COMMERCE_TEXT_PARSER_V1, null, item, order?.value ?? null, null, firstHttpsUrl(combined), {
    ...(title ? { title: title.confidence } : {}),
    ...(amount ? { price: amount.confidence } : {}),
    ...(item.selectedOptions.length ? { variant: 'EXACT_LABELED' } : {}),
    ...(order ? { orderNumber: order.confidence } : {}),
  });
}

function itemFromText(
  text: string,
  extracted: { title: string | null; quantity: number | null; amount: Money | null },
): ItemDescriptor {
  const title = cleanTitle(extracted.title);
  const variant = labeledValue(text, ['variant', 'variation', 'style', 'color', 'size']);
  return {
    ...emptyIntakeItem(),
    title,
    description: title ? text.slice(0, 2_000) : '',
    sku: labeledValue(text, ['sku']),
    selectedOptions: variant ? [{ name: 'Variant', value: variant.slice(0, 300) }] : [],
    quantity: extracted.quantity && extracted.quantity >= 1 ? Math.min(extracted.quantity, 100_000) : 1,
    amount: extracted.amount,
  };
}

function cleanTitle(value: string | null): string {
  if (!value) return '';
  return value.replace(/\s+/g, ' ').replace(/^[\s"'“”]+|[\s"'“”]+$/g, '').slice(0, 300);
}

function labeledValue(text: string, labels: string[]): string | null {
  for (const label of labels) {
    const match = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(label)}\\s*[:\\-–]\\s*(.+)$`, 'im').exec(text);
    const value = match?.[1]?.trim();
    if (value) return value.split('\n')[0]!.trim().slice(0, 300);
  }
  return null;
}

function labeledInteger(text: string, labels: string[]): number | null {
  const raw = labeledValue(text, labels);
  if (!raw) return null;
  const match = /(\d{1,6})/.exec(raw);
  return match ? Number.parseInt(match[1]!, 10) : null;
}

function extractTitle(
  text: string,
  subject: string,
  labels: string[],
  subjectPattern: RegExp | null,
): { value: string; confidence: ExtractionQuality } | null {
  const labeled = labeledValue(text, labels);
  if (labeled) return { value: labeled, confidence: 'EXACT_LABELED' };
  const fromSubject = subjectPattern ? titleFromSubject(subject, subjectPattern) : null;
  if (fromSubject) return { value: fromSubject, confidence: 'FORMAT_MATCH' };
  const line = firstItemLine(text);
  return line ? { value: line, confidence: 'HEURISTIC' } : null;
}

function extractOrderNumber(
  text: string,
  labels: string[],
  unlabeledPatterns: RegExp[],
): { value: string; confidence: ExtractionQuality } | null {
  const labeled = labeledValue(text, labels);
  if (labeled) {
    const cleaned = labeled.replace(/^#/, '').trim().split(/\s/)[0] ?? '';
    if (cleaned) return { value: cleaned.slice(0, 40), confidence: 'EXACT_LABELED' };
  }
  const formatted = firstMatch(text, unlabeledPatterns);
  return formatted ? { value: formatted, confidence: 'FORMAT_MATCH' } : null;
}

function parseListedMoney(text: string, labels: string[]): { value: Money; confidence: ExtractionQuality } | null {
  for (const label of labels) {
    const match = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(label)}\\s*[:\\-–]?\\s*(.+)$`, 'im').exec(text);
    const labeled = match?.[1]?.trim().split('\n')[0]?.trim() ?? null;
    const parsed = labeled ? parseMoneyToken(labeled) : null;
    if (parsed) return { value: parsed, confidence: 'EXACT_LABELED' };
  }
  const fallback = parseMoneyToken(text);
  return fallback ? { value: fallback, confidence: 'HEURISTIC' } : null;
}

function parseMoneyToken(value: string): Money | null {
  const match = /(?:(USD|EUR|GBP|CAD|AUD|US\$)|([$€£]))\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(USD|EUR|GBP)/i.exec(value);
  if (!match) return null;
  const currencyToken = (match[1] ?? match[2] ?? match[5] ?? 'USD').toUpperCase();
  const amount = match[3] ?? match[4];
  if (!amount) return null;
  const currency = currencyToken === '$' || currencyToken === 'US$' ? 'USD'
    : currencyToken === '€' ? 'EUR'
      : currencyToken === '£' ? 'GBP'
        : currencyToken;
  const [whole, fraction = '00'] = amount.replace(/,/g, '').split('.');
  const minorUnits = Number.parseInt(whole || '0', 10) * 100 + Number.parseInt(fraction.padEnd(2, '0').slice(0, 2), 10);
  if (!Number.isFinite(minorUnits) || minorUnits < 0) return null;
  return { currency, minorUnits };
}

function titleFromSubject(subject: string, pattern: RegExp): string | null {
  const match = pattern.exec(subject.trim());
  return match?.[1]?.trim() || null;
}

function firstItemLine(text: string): string | null {
  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed.length < 4 || trimmed.length > 180) continue;
    if (/^(from|to|subject|date|order|quantity|qty|total|subtotal|sold for|price|hi |hello|dear|thank)/i.test(trimmed)) continue;
    if (/^https?:\/\//i.test(trimmed)) continue;
    if (/^[\d$€£.,\s]+$/.test(trimmed)) continue;
    return trimmed;
  }
  return null;
}

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match?.[1]) return match[1].trim();
  }
  return null;
}

function firstHttpsUrl(text: string): string | null {
  const match = /https:\/\/[^\s<>"']+/i.exec(text);
  if (!match) return null;
  try {
    const parsed = new URL(match[0].replace(/[).,;]+$/, ''));
    return parsed.protocol === 'https:' ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function headerValue(headers: string, name: string): string {
  const match = new RegExp(`^${escapeRegExp(name)}:\\s*(.*(?:\\n[ \\t].*)*)`, 'im').exec(headers);
  return match ? match[1]!.replace(/\n[ \t]/g, ' ').trim() : '';
}

function unwrapMimeBody(body: string): string {
  const boundary = /boundary="?([^";\n]+)"?/i.exec(body);
  if (!boundary) return stripHtml(body);
  const parts = body.split(new RegExp(`--${escapeRegExp(boundary[1]!.trim())}`));
  const plain = parts.find((part) => /content-type:\s*text\/plain/i.test(part));
  const html = parts.find((part) => /content-type:\s*text\/html/i.test(part));
  const chosen = plain ?? html ?? body;
  const split = chosen.indexOf('\n\n');
  return stripHtml(split >= 0 ? chosen.slice(split + 2) : chosen);
}

function stripHtml(value: string): string {
  if (!/<[a-z][\s\S]*>/i.test(value)) return value;
  return value
    .replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, ' ')
    .replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&');
}

function decodeQuotedPrintable(value: string): string {
  return value
    .replace(/=\n/g, '')
    .replace(/=([0-9A-F]{2})/gi, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
