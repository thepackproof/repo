import type { Money } from './common';
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

export type ExtractedCommerceMessage = {
  from: string;
  subject: string;
  body: string;
};

export type IntakeMoneyBreakdown = {
  itemAmount: Money | null;
  orderSubtotal: Money | null;
  shippingAmount: Money | null;
  taxAmount: Money | null;
  discountAmount: Money | null;
  orderTotal: Money | null;
};

export type CommerceArtifactParseResult = {
  parserVersion: string;
  platformIdentifier: string | null;
  item: ItemDescriptor;
  amounts: IntakeMoneyBreakdown;
  externalOrderId: string | null;
  externalListingId: string | null;
  productUrl: string | null;
  missingFields: IntakeMissingField[];
};

export function emptyMoneyBreakdown(): IntakeMoneyBreakdown {
  return {
    itemAmount: null,
    orderSubtotal: null,
    shippingAmount: null,
    taxAmount: null,
    discountAmount: null,
    orderTotal: null,
  };
}

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
  const rawBody = normalized.slice(headerSplit + 2);
  const body = decodeQuotedPrintable(unwrapMimeBody(rawBody, headerValue(headers, 'content-type'))).trim();
  return {
    from: decodeQuotedPrintable(headerValue(headers, 'from')),
    subject: decodeQuotedPrintable(headerValue(headers, 'subject')),
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
    return resultOf(parserVersion, null, item, emptyMoneyBreakdown(), null, null, null);
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

function resultOf(
  parserVersion: string,
  platformIdentifier: string | null,
  item: ItemDescriptor,
  amounts: IntakeMoneyBreakdown,
  externalOrderId: string | null,
  externalListingId: string | null,
  productUrl: string | null,
): CommerceArtifactParseResult {
  return {
    parserVersion,
    platformIdentifier,
    item,
    amounts,
    externalOrderId,
    externalListingId,
    productUrl,
    missingFields: missingIntakeFields(item, externalOrderId),
  };
}

function parseEbaySoldMessage(message: ExtractedCommerceMessage, combined: string): CommerceArtifactParseResult | null {
  if (!EBAY_SENDER.test(message.from) && !EBAY_BODY.test(combined)) return null;
  const orderNumber = firstMatch(combined, [
    /order(?:\s*(?:number|id|#))[:\s]+(\d{2}-\d{5}-\d{5})/i,
    /order(?:\s*(?:number|id|#))[:\s]+(\d{10,20})/i,
    /order(?:\s*(?:number|id|#))[:\s]+([A-Z0-9][A-Z0-9-]{5,30})/i,
    /\b(\d{2}-\d{5}-\d{5})\b/,
  ]);
  const listingId = firstMatch(combined, [/listing(?:\s*(?:id|number|#))[:\s]+(\d{8,20})/i]);
  const amounts = extractMoneyBreakdown(combined);
  const item = itemFromText(combined, {
    title: labeledValue(combined, ['item', 'item title']) ?? titleFromSubject(message.subject, /you sold\s+(.+)$/i),
    quantity: labeledInteger(combined, ['quantity', 'qty']),
    amount: resolveExposedItemAmount(combined, amounts),
  });
  return resultOf(EBAY_EMAIL_PARSER_V1, 'EBAY', item, amounts, orderNumber, listingId, firstHttpsUrl(combined));
}

function parseEtsySoldMessage(message: ExtractedCommerceMessage, combined: string): CommerceArtifactParseResult | null {
  if (!ETSY_SENDER.test(message.from) && !ETSY_BODY.test(combined)) return null;
  const orderNumber = firstMatch(combined, [
    /order\s*#\s*([A-Z0-9][A-Z0-9-]{5,20})/i,
    /order(?:\s*(?:number|id))[:\s]+([A-Z0-9][A-Z0-9-]{5,20})/i,
  ]);
  const amounts = extractMoneyBreakdown(combined);
  const item = itemFromText(combined, {
    title: labeledValue(combined, ['item', 'listing']) ?? titleFromSubject(message.subject, /you made a sale(?: on etsy)?[:\s]+(.+)$/i),
    quantity: labeledInteger(combined, ['quantity', 'qty']),
    amount: resolveExposedItemAmount(combined, amounts),
  });
  return resultOf(ETSY_EMAIL_PARSER_V1, 'ETSY', item, amounts, orderNumber, null, firstHttpsUrl(combined));
}

function parseShopifyOrderMessage(message: ExtractedCommerceMessage, combined: string): CommerceArtifactParseResult | null {
  const shopifyShaped = SHOPIFY_SENDER.test(message.from) || SHOPIFY_BODY.test(combined) || /via shopify/i.test(combined);
  if (!shopifyShaped) return null;
  const orderNumber = firstMatch(combined, [
    /order\s*#\s*([A-Z0-9][A-Z0-9-]{2,20})/i,
    /order(?:\s*(?:number|id))[:\s]+#?([A-Z0-9][A-Z0-9-]{2,20})/i,
  ]);
  if (!SHOPIFY_SENDER.test(message.from) && !SHOPIFY_BODY.test(combined) && !orderNumber) return null;
  const amounts = extractMoneyBreakdown(combined);
  const item = itemFromText(combined, {
    title: labeledValue(combined, ['item', 'product']) ?? firstItemLine(combined),
    quantity: labeledInteger(combined, ['quantity', 'qty']),
    amount: resolveExposedItemAmount(combined, amounts),
  });
  return resultOf(SHOPIFY_EMAIL_PARSER_V1, 'SHOPIFY', item, amounts, orderNumber, null, firstHttpsUrl(combined));
}

function parseGenericCommerceText(message: ExtractedCommerceMessage, combined: string): CommerceArtifactParseResult {
  const orderNumber = firstMatch(combined, [
    /order(?:\s*(?:number|id|#))[:\s]+([A-Z0-9][A-Z0-9-]{4,30})/i,
    /\b([A-Z]{1,4}-\d{5,20})\b/,
  ]);
  const amounts = extractMoneyBreakdown(combined);
  const item = itemFromText(combined, {
    title: labeledValue(combined, ['item', 'item title', 'product']) ?? titleFromSubject(message.subject, /(?:sold|order|receipt)[:\s]+(.+)$/i) ?? firstItemLine(combined),
    quantity: labeledInteger(combined, ['quantity', 'qty']),
    amount: resolveExposedItemAmount(combined, amounts),
  });
  return resultOf(GENERIC_COMMERCE_TEXT_PARSER_V1, null, item, amounts, orderNumber, null, firstHttpsUrl(combined));
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

function extractMoneyBreakdown(text: string): IntakeMoneyBreakdown {
  return {
    itemAmount: firstLabeledMoney(text, ['sold for', 'sale price', 'item price', 'item total', 'unit price', 'price']),
    orderSubtotal: firstLabeledMoney(text, ['order subtotal', 'subtotal']),
    shippingAmount: firstLabeledMoney(text, ['shipping charge', 'shipping', 'postage', 'delivery']),
    taxAmount: firstLabeledMoney(text, ['sales tax', 'vat', 'tax']),
    discountAmount: firstLabeledMoney(text, ['discount', 'coupon', 'promo']),
    orderTotal: firstLabeledMoney(text, ['order total', 'grand total', 'refund total', 'total']),
  };
}

function looksLikeRefundOrCancellation(text: string): boolean {
  return /\b(refund(?:ed)?|cancelled|canceled|cancellation)\b/i.test(text);
}

function looksLikeBuyerConfirmation(text: string): boolean {
  return /\byou (?:purchased|bought|ordered)\b/i.test(text) && !EBAY_BODY.test(text);
}

function hasOrderAddons(amounts: IntakeMoneyBreakdown): boolean {
  return Boolean(amounts.shippingAmount || amounts.taxAmount || amounts.discountAmount);
}

function resolveExposedItemAmount(text: string, amounts: IntakeMoneyBreakdown): Money | null {
  if (looksLikeRefundOrCancellation(text) || looksLikeBuyerConfirmation(text)) return null;
  if (amounts.itemAmount) return amounts.itemAmount;
  if (hasOrderAddons(amounts)) return null;
  return amounts.orderSubtotal ?? amounts.orderTotal;
}

function firstLabeledMoney(text: string, labels: string[]): Money | null {
  for (const label of labels) {
    const labeled = labeledValue(text, [label]);
    const parsed = labeled ? parseMoneyToken(labeled) : null;
    if (parsed) return parsed;
    const spaced = new RegExp(
      `(?:^|\\n)\\s*${escapeRegExp(label)}\\s+((?:USD|EUR|GBP|CAD|AUD|JPY|MXN|US\\$|[$€£¥])\\s*[\\d,]+(?:\\.\\d{1,2})?|[\\d,]+(?:\\.\\d{1,2})?\\s*(?:USD|EUR|GBP|CAD|AUD|JPY|MXN))`,
      'im',
    ).exec(text);
    const spacedParsed = spaced?.[1] ? parseMoneyToken(spaced[1]) : null;
    if (spacedParsed) return spacedParsed;
  }
  return null;
}

function parseMoneyToken(value: string): Money | null {
  if (/\d{1,3}(?:\.\d{3})+,\d{2}/.test(value) && !/\$\s*[\d,]+(?:\.\d{1,2})?/.test(value)) return null;
  const match = /(?:(USD|EUR|GBP|CAD|AUD|JPY|MXN|US\$)|([$€£¥]))\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(USD|EUR|GBP|CAD|AUD|JPY|MXN)/i.exec(value);
  if (!match) return null;
  const currencyToken = (match[1] ?? match[2] ?? match[5] ?? 'USD').toUpperCase();
  const amount = match[3] ?? match[4];
  if (!amount) return null;
  const currency = currencyToken === '$' || currencyToken === 'US$' ? 'USD'
    : currencyToken === '€' ? 'EUR'
      : currencyToken === '£' ? 'GBP'
        : currencyToken === '¥' ? 'JPY'
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

function unwrapMimeBody(body: string, contentType = ''): string {
  const boundary = /boundary="?([^";\n]+)"?/i.exec(`${contentType}\n${body}`);
  if (!boundary) return stripHtml(body);
  const parts = body.split(new RegExp(`--${escapeRegExp(boundary[1]!.trim())}`));
  const plain = parts.find((part) => /content-type:\s*text\/plain/i.test(part));
  const html = parts.find((part) => /content-type:\s*text\/html/i.test(part));
  const chosen = plain ?? html ?? body;
  const encoding = /content-transfer-encoding:\s*quoted-printable/i.test(chosen) ? 'qp' : 'raw';
  const split = chosen.indexOf('\n\n');
  const payload = split >= 0 ? chosen.slice(split + 2) : chosen;
  return stripHtml(encoding === 'qp' ? decodeQuotedPrintable(payload) : payload);
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
