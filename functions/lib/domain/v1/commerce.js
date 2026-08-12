"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.passportDraftDtoSchema = exports.passportDraftTransitions = exports.passportDraftStatuses = exports.commerceContextDtoSchema = exports.commerceContextTransitions = exports.commerceContextStatuses = exports.commerceTrustLevels = exports.commercePlatforms = void 0;
exports.parseItemDescriptor = parseItemDescriptor;
exports.commerceContextCanAuthoritativelyBindOrder = commerceContextCanAuthoritativelyBindOrder;
exports.commerceImageReferenceIsFinalizedEvidence = commerceImageReferenceIsFinalizedEvidence;
const common_1 = require("./common");
const runtime_1 = require("./runtime");
exports.commercePlatforms = ['SHOPIFY', 'WOOCOMMERCE', 'MAGENTO', 'CUSTOM', 'MARKETPLACE', 'STRUCTURED_PAGE_DATA'];
exports.commerceTrustLevels = ['MERCHANT_SERVER_ATTESTED', 'PLATFORM_API_ATTESTED', 'PAGE_DECLARED'];
exports.commerceContextStatuses = ['CREATED', 'HANDOFF_ISSUED', 'CLAIMED', 'ORDER_BOUND', 'EXPIRED', 'REVOKED'];
exports.commerceContextTransitions = {
    CREATED: ['HANDOFF_ISSUED', 'ORDER_BOUND', 'EXPIRED', 'REVOKED'],
    HANDOFF_ISSUED: ['CLAIMED', 'ORDER_BOUND', 'EXPIRED', 'REVOKED'],
    CLAIMED: ['ORDER_BOUND', 'EXPIRED', 'REVOKED'],
    ORDER_BOUND: [],
    EXPIRED: [],
    REVOKED: [],
};
function parseCommerceSource(value, path) {
    const input = (0, runtime_1.strictObject)(value, path, [
        'platform', 'trustLevel', 'externalShopId', 'externalProductId', 'externalListingId', 'externalVariantId',
        'externalOrderId', 'externalLineItemId', 'productUrl', 'capturedAt',
    ]);
    const productUrl = input.productUrl === undefined || input.productUrl === null ? null : (0, runtime_1.urlValue)(input.productUrl, `${path}.productUrl`);
    return {
        platform: (0, runtime_1.enumValue)(input.platform, `${path}.platform`, exports.commercePlatforms),
        trustLevel: (0, runtime_1.enumValue)(input.trustLevel, `${path}.trustLevel`, exports.commerceTrustLevels),
        externalShopId: (0, runtime_1.optionalString)(input.externalShopId, `${path}.externalShopId`, { min: 1, max: 200 }),
        externalProductId: (0, runtime_1.optionalString)(input.externalProductId, `${path}.externalProductId`, { min: 1, max: 200 }),
        externalListingId: (0, runtime_1.optionalString)(input.externalListingId, `${path}.externalListingId`, { min: 1, max: 200 }),
        externalVariantId: (0, runtime_1.optionalString)(input.externalVariantId, `${path}.externalVariantId`, { min: 1, max: 200 }),
        externalOrderId: (0, runtime_1.optionalString)(input.externalOrderId, `${path}.externalOrderId`, { min: 1, max: 200 }),
        externalLineItemId: (0, runtime_1.optionalString)(input.externalLineItemId, `${path}.externalLineItemId`, { min: 1, max: 200 }),
        productUrl,
        capturedAt: (0, runtime_1.isoDateTime)(input.capturedAt, `${path}.capturedAt`),
    };
}
function parsePair(value, path) {
    const input = (0, runtime_1.strictObject)(value, path, ['name', 'value']);
    return {
        name: (0, runtime_1.stringValue)(input.name, `${path}.name`, { min: 1, max: 120 }),
        value: (0, runtime_1.stringValue)(input.value, `${path}.value`, { min: 1, max: 300 }),
    };
}
function parseIdentifier(value, path) {
    const input = (0, runtime_1.strictObject)(value, path, ['type', 'value']);
    return {
        type: (0, runtime_1.stringValue)(input.type, `${path}.type`, { min: 1, max: 80, pattern: /^[A-Z0-9_-]+$/ }),
        value: (0, runtime_1.stringValue)(input.value, `${path}.value`, { min: 1, max: 300 }),
    };
}
function parseImage(value, path) {
    const input = (0, runtime_1.strictObject)(value, path, ['url', 'altText']);
    return {
        url: (0, runtime_1.urlValue)(input.url, `${path}.url`),
        altText: (0, runtime_1.optionalString)(input.altText, `${path}.altText`, { max: 500, trim: false }),
    };
}
function parseItemDescriptor(value, path) {
    const input = (0, runtime_1.strictObject)(value, path, [
        'title', 'description', 'category', 'brand', 'model', 'sku', 'gtin', 'upc', 'mpn', 'serialNumber',
        'selectedOptions', 'identifiers', 'quantity', 'amount', 'imageReferences',
    ]);
    return {
        title: (0, runtime_1.stringValue)(input.title, `${path}.title`, { min: 1, max: 300 }),
        description: (0, runtime_1.stringValue)(input.description, `${path}.description`, { max: 10_000, trim: false }),
        category: (0, runtime_1.optionalString)(input.category, `${path}.category`, { min: 1, max: 160 }),
        brand: (0, runtime_1.optionalString)(input.brand, `${path}.brand`, { min: 1, max: 160 }),
        model: (0, runtime_1.optionalString)(input.model, `${path}.model`, { min: 1, max: 160 }),
        sku: (0, runtime_1.optionalString)(input.sku, `${path}.sku`, { min: 1, max: 160 }),
        gtin: (0, runtime_1.optionalString)(input.gtin, `${path}.gtin`, { min: 8, max: 14, pattern: /^\d{8,14}$/ }),
        upc: (0, runtime_1.optionalString)(input.upc, `${path}.upc`, { min: 8, max: 14, pattern: /^\d{8,14}$/ }),
        mpn: (0, runtime_1.optionalString)(input.mpn, `${path}.mpn`, { min: 1, max: 160 }),
        serialNumber: (0, runtime_1.optionalString)(input.serialNumber, `${path}.serialNumber`, { min: 1, max: 200 }),
        selectedOptions: (0, runtime_1.arrayValue)(input.selectedOptions, `${path}.selectedOptions`, { max: 30, parse: parsePair, uniqueBy: (item) => item.name.toLowerCase() }),
        identifiers: (0, runtime_1.arrayValue)(input.identifiers, `${path}.identifiers`, { max: 30, parse: parseIdentifier, uniqueBy: (item) => `${item.type}:${item.value}` }),
        quantity: (0, runtime_1.integerValue)(input.quantity, `${path}.quantity`, 1, 100_000),
        amount: input.amount === undefined || input.amount === null ? null : (0, common_1.parseMoney)(input.amount, `${path}.amount`),
        imageReferences: (0, runtime_1.arrayValue)(input.imageReferences, `${path}.imageReferences`, { max: 20, parse: parseImage, uniqueBy: (item) => item.url }),
    };
}
const assertionSources = ['MERCHANT_API', 'PLATFORM_API', 'MERCHANT_PAGE_STRUCTURED_DATA', 'SELLER_ENTERED', 'BUYER_ENTERED', 'PACKPROOF_OBSERVED', 'EXTERNAL_ADAPTER'];
const assertionConfidences = ['ASSERTED', 'OBSERVED', 'DERIVED'];
function parseFieldProvenance(value, path) {
    const input = (0, runtime_1.strictObject)(value, path, ['source', 'confidence', 'importedAt', 'sourceReference']);
    return {
        source: (0, runtime_1.enumValue)(input.source, `${path}.source`, assertionSources),
        confidence: (0, runtime_1.enumValue)(input.confidence, `${path}.confidence`, assertionConfidences),
        importedAt: (0, runtime_1.isoDateTime)(input.importedAt, `${path}.importedAt`),
        sourceReference: (0, runtime_1.optionalString)(input.sourceReference, `${path}.sourceReference`, { min: 1, max: 500 }),
    };
}
exports.commerceContextDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'commerceContext', [
        'id', 'object', 'schemaVersion', 'integrationId', 'source', 'item', 'fieldProvenance', 'canonicalPayloadSha256',
        'status', 'supersedesCommerceContextId', 'expiresAt', 'createdAt', 'updatedAt',
    ]);
    (0, runtime_1.literalValue)(input.object, 'commerceContext.object', 'commerce_context');
    (0, runtime_1.literalValue)(input.schemaVersion, 'commerceContext.schemaVersion', 1);
    const result = {
        id: (0, common_1.parseResourceId)('commerce_context', input.id, 'commerceContext.id'),
        object: 'commerce_context',
        schemaVersion: 1,
        integrationId: (0, common_1.parseResourceId)('integration', input.integrationId, 'commerceContext.integrationId', { allowLegacy: true }),
        source: parseCommerceSource(input.source, 'commerceContext.source'),
        item: parseItemDescriptor(input.item, 'commerceContext.item'),
        fieldProvenance: (0, runtime_1.recordValue)(input.fieldProvenance, 'commerceContext.fieldProvenance', { maxKeys: 200, parse: parseFieldProvenance }),
        canonicalPayloadSha256: (0, runtime_1.sha256Value)(input.canonicalPayloadSha256, 'commerceContext.canonicalPayloadSha256'),
        status: (0, runtime_1.enumValue)(input.status, 'commerceContext.status', exports.commerceContextStatuses),
        supersedesCommerceContextId: input.supersedesCommerceContextId === undefined || input.supersedesCommerceContextId === null
            ? null
            : (0, common_1.parseResourceId)('commerce_context', input.supersedesCommerceContextId, 'commerceContext.supersedesCommerceContextId'),
        expiresAt: (0, runtime_1.optionalIsoDateTime)(input.expiresAt, 'commerceContext.expiresAt'),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'commerceContext.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'commerceContext.updatedAt'),
    };
    if (result.status === 'ORDER_BOUND' && !commerceContextCanAuthoritativelyBindOrder(result)) {
        throw new runtime_1.DomainValidationError({
            path: 'commerceContext.status',
            code: 'FORMAT',
            message: 'ORDER_BOUND requires an authoritative merchant-server or platform-API source with an external order ID',
        });
    }
    return result;
});
exports.passportDraftStatuses = ['DRAFT', 'READY_FOR_REVIEW', 'BOUND', 'EXPIRED', 'CANCELLED'];
exports.passportDraftTransitions = {
    DRAFT: ['READY_FOR_REVIEW', 'EXPIRED', 'CANCELLED'],
    READY_FOR_REVIEW: ['DRAFT', 'BOUND', 'EXPIRED', 'CANCELLED'],
    BOUND: [],
    EXPIRED: [],
    CANCELLED: [],
};
exports.passportDraftDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'passportDraft', ['id', 'object', 'schemaVersion', 'commerceContextId', 'transactionId', 'item', 'status', 'expiresAt', 'createdAt', 'updatedAt']);
    (0, runtime_1.literalValue)(input.object, 'passportDraft.object', 'passport_draft');
    (0, runtime_1.literalValue)(input.schemaVersion, 'passportDraft.schemaVersion', 1);
    const result = {
        id: (0, common_1.parseResourceId)('passport_draft', input.id, 'passportDraft.id'),
        object: 'passport_draft',
        schemaVersion: 1,
        commerceContextId: (0, common_1.parseResourceId)('commerce_context', input.commerceContextId, 'passportDraft.commerceContextId'),
        transactionId: input.transactionId === undefined || input.transactionId === null ? null : (0, common_1.parseResourceId)('transaction', input.transactionId, 'passportDraft.transactionId', { allowLegacy: true }),
        item: parseItemDescriptor(input.item, 'passportDraft.item'),
        status: (0, runtime_1.enumValue)(input.status, 'passportDraft.status', exports.passportDraftStatuses),
        expiresAt: (0, runtime_1.optionalIsoDateTime)(input.expiresAt, 'passportDraft.expiresAt'),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'passportDraft.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'passportDraft.updatedAt'),
    };
    if (result.status === 'BOUND' && result.transactionId === null) {
        throw new runtime_1.DomainValidationError({ path: 'passportDraft.transactionId', code: 'REQUIRED', message: 'is required when the draft is BOUND' });
    }
    return result;
});
function commerceContextCanAuthoritativelyBindOrder(context) {
    return context.source.trustLevel !== 'PAGE_DECLARED' && context.source.externalOrderId !== null;
}
function commerceImageReferenceIsFinalizedEvidence(_image) {
    return false;
}
//# sourceMappingURL=commerce.js.map