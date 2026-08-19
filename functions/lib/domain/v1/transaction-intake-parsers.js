"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.intakeMissingFieldNames = exports.CONFIRMED_FIELDS_V1 = exports.PDF_IMPORT_V1 = exports.SCREENSHOT_IMPORT_V1 = exports.GENERIC_COMMERCE_TEXT_PARSER_V1 = exports.SHOPIFY_EMAIL_PARSER_V1 = exports.ETSY_EMAIL_PARSER_V1 = exports.EBAY_EMAIL_PARSER_V1 = exports.MAX_INTAKE_ARTIFACT_CHARS = void 0;
exports.emptyIntakeItem = emptyIntakeItem;
exports.missingIntakeFields = missingIntakeFields;
exports.extractCommerceMessage = extractCommerceMessage;
exports.parseCommerceArtifact = parseCommerceArtifact;
const runtime_1 = require("./runtime");
exports.MAX_INTAKE_ARTIFACT_CHARS = 100_000;
exports.EBAY_EMAIL_PARSER_V1 = 'EBAY_EMAIL_PARSER_V1';
exports.ETSY_EMAIL_PARSER_V1 = 'ETSY_EMAIL_PARSER_V1';
exports.SHOPIFY_EMAIL_PARSER_V1 = 'SHOPIFY_EMAIL_PARSER_V1';
exports.GENERIC_COMMERCE_TEXT_PARSER_V1 = 'GENERIC_COMMERCE_TEXT_PARSER_V1';
exports.SCREENSHOT_IMPORT_V1 = 'SCREENSHOT_IMPORT_V1';
exports.PDF_IMPORT_V1 = 'PDF_IMPORT_V1';
exports.CONFIRMED_FIELDS_V1 = 'CONFIRMED_FIELDS_V1';
exports.intakeMissingFieldNames = ['title', 'price', 'variant', 'orderNumber'];
const EBAY_SENDER = /@(?:ebay\.com|ebay\.[a-z]{2,3})\b/i;
const ETSY_SENDER = /@etsy\.com\b/i;
const SHOPIFY_SENDER = /@(?:shopify\.com|myshopify\.com)\b/i;
const EBAY_BODY = /you sold(?: an item)?|sold an item|congratulations[!.,]?\s+you sold/i;
const ETSY_BODY = /you made a sale(?: on etsy)?/i;
const SHOPIFY_BODY = /thank you for your (?:purchase|order)|your order is confirmed/i;
function emptyIntakeItem() {
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
function missingIntakeFields(item, externalOrderId) {
    const missing = [];
    if (!item.title.trim())
        missing.push('title');
    if (!item.amount)
        missing.push('price');
    if (!item.selectedOptions.length)
        missing.push('variant');
    if (!externalOrderId)
        missing.push('orderNumber');
    return missing;
}
function extractCommerceMessage(raw) {
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
function parseCommerceArtifact(artifactText, intakeSourceType) {
    if (artifactText !== null && artifactText.length > exports.MAX_INTAKE_ARTIFACT_CHARS) {
        throw new runtime_1.DomainValidationError({
            path: 'artifactText',
            code: 'FORMAT',
            message: `artifact text must be at most ${exports.MAX_INTAKE_ARTIFACT_CHARS} characters`,
        });
    }
    if (!artifactText?.trim()) {
        const item = emptyIntakeItem();
        const parserVersion = intakeSourceType === 'PDF_IMPORT' ? exports.PDF_IMPORT_V1
            : intakeSourceType === 'SCREENSHOT_IMPORT' ? exports.SCREENSHOT_IMPORT_V1
                : exports.CONFIRMED_FIELDS_V1;
        return resultOf(parserVersion, null, item, null, null, null);
    }
    const message = extractCommerceMessage(artifactText);
    const combined = `${message.subject}\n${message.body}`;
    const ebay = parseEbaySoldMessage(message, combined);
    if (ebay)
        return ebay;
    const etsy = parseEtsySoldMessage(message, combined);
    if (etsy)
        return etsy;
    const shopify = parseShopifyOrderMessage(message, combined);
    if (shopify)
        return shopify;
    return parseGenericCommerceText(message, combined);
}
function resultOf(parserVersion, platformIdentifier, item, externalOrderId, externalListingId, productUrl) {
    return {
        parserVersion,
        platformIdentifier,
        item,
        externalOrderId,
        externalListingId,
        productUrl,
        missingFields: missingIntakeFields(item, externalOrderId),
    };
}
function parseEbaySoldMessage(message, combined) {
    if (!EBAY_SENDER.test(message.from) && !EBAY_BODY.test(combined))
        return null;
    const orderNumber = firstMatch(combined, [
        /order(?:\s*(?:number|id|#))[:\s]+(\d{2}-\d{5}-\d{5})/i,
        /order(?:\s*(?:number|id|#))[:\s]+(\d{10,20})/i,
        /\b(\d{2}-\d{5}-\d{5})\b/,
    ]);
    const listingId = firstMatch(combined, [/listing(?:\s*(?:id|number|#))[:\s]+(\d{8,20})/i]);
    const item = itemFromText(combined, {
        title: labeledValue(combined, ['item', 'item title']) ?? titleFromSubject(message.subject, /you sold\s+(.+)$/i),
        quantity: labeledInteger(combined, ['quantity', 'qty']),
        amount: parseListedMoney(combined, ['sold for', 'sale price', 'price', 'total']),
    });
    return resultOf(exports.EBAY_EMAIL_PARSER_V1, 'EBAY', item, orderNumber, listingId, firstHttpsUrl(combined));
}
function parseEtsySoldMessage(message, combined) {
    if (!ETSY_SENDER.test(message.from) && !ETSY_BODY.test(combined))
        return null;
    const orderNumber = firstMatch(combined, [
        /order\s*#\s*(\d{6,20})/i,
        /order(?:\s*(?:number|id))[:\s]+(\d{6,20})/i,
    ]);
    const item = itemFromText(combined, {
        title: labeledValue(combined, ['item', 'listing']) ?? titleFromSubject(message.subject, /you made a sale(?: on etsy)?[:\s]+(.+)$/i),
        quantity: labeledInteger(combined, ['quantity', 'qty']),
        amount: parseListedMoney(combined, ['order total', 'total', 'price', 'sold for']),
    });
    return resultOf(exports.ETSY_EMAIL_PARSER_V1, 'ETSY', item, orderNumber, null, firstHttpsUrl(combined));
}
function parseShopifyOrderMessage(message, combined) {
    const shopifyShaped = SHOPIFY_SENDER.test(message.from) || SHOPIFY_BODY.test(combined) || /via shopify/i.test(combined);
    if (!shopifyShaped)
        return null;
    const orderNumber = firstMatch(combined, [
        /order\s*#\s*(\d{3,12})/i,
        /order(?:\s*(?:number|id))[:\s]+#?(\d{3,12})/i,
    ]);
    if (!SHOPIFY_SENDER.test(message.from) && !SHOPIFY_BODY.test(combined) && !orderNumber)
        return null;
    const item = itemFromText(combined, {
        title: labeledValue(combined, ['item', 'product']) ?? firstItemLine(combined),
        quantity: labeledInteger(combined, ['quantity', 'qty']),
        amount: parseListedMoney(combined, ['total', 'subtotal', 'price']),
    });
    return resultOf(exports.SHOPIFY_EMAIL_PARSER_V1, 'SHOPIFY', item, orderNumber, null, firstHttpsUrl(combined));
}
function parseGenericCommerceText(message, combined) {
    const orderNumber = firstMatch(combined, [
        /order(?:\s*(?:number|id|#))[:\s]+([A-Z0-9][A-Z0-9-]{4,30})/i,
        /\b([A-Z]{1,4}-\d{5,20})\b/,
    ]);
    const item = itemFromText(combined, {
        title: labeledValue(combined, ['item', 'item title', 'product']) ?? titleFromSubject(message.subject, /(?:sold|order|receipt)[:\s]+(.+)$/i) ?? firstItemLine(combined),
        quantity: labeledInteger(combined, ['quantity', 'qty']),
        amount: parseListedMoney(combined, ['sold for', 'total', 'price', 'amount']),
    });
    return resultOf(exports.GENERIC_COMMERCE_TEXT_PARSER_V1, null, item, orderNumber, null, firstHttpsUrl(combined));
}
function itemFromText(text, extracted) {
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
function cleanTitle(value) {
    if (!value)
        return '';
    return value.replace(/\s+/g, ' ').replace(/^[\s"'“”]+|[\s"'“”]+$/g, '').slice(0, 300);
}
function labeledValue(text, labels) {
    for (const label of labels) {
        const match = new RegExp(`(?:^|\\n)\\s*${escapeRegExp(label)}\\s*[:\\-–]\\s*(.+)$`, 'im').exec(text);
        const value = match?.[1]?.trim();
        if (value)
            return value.split('\n')[0].trim().slice(0, 300);
    }
    return null;
}
function labeledInteger(text, labels) {
    const raw = labeledValue(text, labels);
    if (!raw)
        return null;
    const match = /(\d{1,6})/.exec(raw);
    return match ? Number.parseInt(match[1], 10) : null;
}
function parseListedMoney(text, labels) {
    for (const label of labels) {
        const labeled = labeledValue(text, [label]);
        const parsed = labeled ? parseMoneyToken(labeled) : null;
        if (parsed)
            return parsed;
    }
    return parseMoneyToken(text);
}
function parseMoneyToken(value) {
    const match = /(?:(USD|EUR|GBP|CAD|AUD|US\$)|([$€£]))\s*([\d,]+(?:\.\d{1,2})?)|([\d,]+(?:\.\d{1,2})?)\s*(USD|EUR|GBP)/i.exec(value);
    if (!match)
        return null;
    const currencyToken = (match[1] ?? match[2] ?? match[5] ?? 'USD').toUpperCase();
    const amount = match[3] ?? match[4];
    if (!amount)
        return null;
    const currency = currencyToken === '$' || currencyToken === 'US$' ? 'USD'
        : currencyToken === '€' ? 'EUR'
            : currencyToken === '£' ? 'GBP'
                : currencyToken;
    const [whole, fraction = '00'] = amount.replace(/,/g, '').split('.');
    const minorUnits = Number.parseInt(whole || '0', 10) * 100 + Number.parseInt(fraction.padEnd(2, '0').slice(0, 2), 10);
    if (!Number.isFinite(minorUnits) || minorUnits < 0)
        return null;
    return { currency, minorUnits };
}
function titleFromSubject(subject, pattern) {
    const match = pattern.exec(subject.trim());
    return match?.[1]?.trim() || null;
}
function firstItemLine(text) {
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed.length < 4 || trimmed.length > 180)
            continue;
        if (/^(from|to|subject|date|order|quantity|qty|total|subtotal|sold for|price|hi |hello|dear|thank)/i.test(trimmed))
            continue;
        if (/^https?:\/\//i.test(trimmed))
            continue;
        if (/^[\d$€£.,\s]+$/.test(trimmed))
            continue;
        return trimmed;
    }
    return null;
}
function firstMatch(text, patterns) {
    for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (match?.[1])
            return match[1].trim();
    }
    return null;
}
function firstHttpsUrl(text) {
    const match = /https:\/\/[^\s<>"']+/i.exec(text);
    if (!match)
        return null;
    try {
        const parsed = new URL(match[0].replace(/[).,;]+$/, ''));
        return parsed.protocol === 'https:' ? parsed.toString() : null;
    }
    catch {
        return null;
    }
}
function headerValue(headers, name) {
    const match = new RegExp(`^${escapeRegExp(name)}:\\s*(.*(?:\\n[ \\t].*)*)`, 'im').exec(headers);
    return match ? match[1].replace(/\n[ \t]/g, ' ').trim() : '';
}
function unwrapMimeBody(body) {
    const boundary = /boundary="?([^";\n]+)"?/i.exec(body);
    if (!boundary)
        return stripHtml(body);
    const parts = body.split(new RegExp(`--${escapeRegExp(boundary[1].trim())}`));
    const plain = parts.find((part) => /content-type:\s*text\/plain/i.test(part));
    const html = parts.find((part) => /content-type:\s*text\/html/i.test(part));
    const chosen = plain ?? html ?? body;
    const split = chosen.indexOf('\n\n');
    return stripHtml(split >= 0 ? chosen.slice(split + 2) : chosen);
}
function stripHtml(value) {
    if (!/<[a-z][\s\S]*>/i.test(value))
        return value;
    return value
        .replace(/<style\b[\s\S]*?<\/style\b[^>]*>/gi, ' ')
        .replace(/<script\b[\s\S]*?<\/script\b[^>]*>/gi, ' ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&');
}
function decodeQuotedPrintable(value) {
    return value
        .replace(/=\n/g, '')
        .replace(/=([0-9A-F]{2})/gi, (_match, hex) => String.fromCharCode(Number.parseInt(hex, 16)));
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=transaction-intake-parsers.js.map