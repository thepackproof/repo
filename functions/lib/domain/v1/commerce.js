"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.passportDraftDtoSchema = exports.passportDraftTransitions = exports.passportDraftStatuses = exports.commerceContextDtoSchema = exports.commerceContextTransitions = exports.commerceContextStatuses = exports.consumerIntakeSourceTypes = exports.commerceIntakeSourceTypes = exports.commerceTrustLevels = exports.commercePlatforms = void 0;
exports.parseItemDescriptor = parseItemDescriptor;
exports.isAuthoritativeCommerceTrustLevel = isAuthoritativeCommerceTrustLevel;
exports.isUserProvidedCommerceArtifact = isUserProvidedCommerceArtifact;
exports.commerceContextMayAppearAsPassportOrderContext = commerceContextMayAppearAsPassportOrderContext;
exports.parseCommerceTrustLevel = parseCommerceTrustLevel;
exports.commerceTrustLevelForIntakeSource = commerceTrustLevelForIntakeSource;
exports.assertionSourceForIntakeSource = assertionSourceForIntakeSource;
exports.canAuthoritativelyBindOrder = canAuthoritativelyBindOrder;
exports.commerceContextCanAuthoritativelyBindOrder = commerceContextCanAuthoritativelyBindOrder;
exports.commerceImageReferenceIsFinalizedEvidence = commerceImageReferenceIsFinalizedEvidence;
const common_1 = require("./common");
const runtime_1 = require("./runtime");
exports.commercePlatforms = ['SHOPIFY', 'WOOCOMMERCE', 'MAGENTO', 'CUSTOM', 'MARKETPLACE', 'STRUCTURED_PAGE_DATA'];
exports.commerceTrustLevels = ['MERCHANT_SERVER_ATTESTED', 'PLATFORM_API_ATTESTED', 'USER_PROVIDED_COMMERCE_ARTIFACT', 'PAGE_DECLARED'];
exports.commerceIntakeSourceTypes = [
    'EMAIL_RECEIPT',
    'SHARE_SHEET',
    'BROWSER_EXTENSION',
    'SCREENSHOT_IMPORT',
    'PDF_IMPORT',
    'MERCHANT_API',
    'PLATFORM_API',
    'PACKPROOF_BUTTON',
];
exports.consumerIntakeSourceTypes = [
    'EMAIL_RECEIPT',
    'SHARE_SHEET',
    'BROWSER_EXTENSION',
    'SCREENSHOT_IMPORT',
    'PDF_IMPORT',
];
exports.commerceContextStatuses = ['CREATED', 'HANDOFF_ISSUED', 'CLAIMED', 'ORDER_BOUND', 'EXPIRED', 'REVOKED'];
exports.commerceContextTransitions = {
    CREATED: ['HANDOFF_ISSUED', 'CLAIMED', 'ORDER_BOUND', 'EXPIRED', 'REVOKED'],
    HANDOFF_ISSUED: ['CLAIMED', 'ORDER_BOUND', 'EXPIRED', 'REVOKED'],
    CLAIMED: ['ORDER_BOUND', 'EXPIRED', 'REVOKED'],
    ORDER_BOUND: [],
    EXPIRED: [],
    REVOKED: [],
};
function parseCommerceSource(value, path) {
    const input = (0, runtime_1.strictObject)(value, path, [
        'platform', 'trustLevel', 'intakeSourceType', 'platformIdentifier', 'parserVersion', 'originalArtifactSha256',
        'externalShopId', 'externalProductId', 'externalListingId', 'externalVariantId',
        'externalOrderId', 'externalLineItemId', 'productUrl', 'capturedAt',
    ]);
    const productUrl = input.productUrl === undefined || input.productUrl === null ? null : (0, runtime_1.urlValue)(input.productUrl, `${path}.productUrl`);
    return {
        platform: (0, runtime_1.enumValue)(input.platform, `${path}.platform`, exports.commercePlatforms),
        trustLevel: (0, runtime_1.enumValue)(input.trustLevel, `${path}.trustLevel`, exports.commerceTrustLevels),
        intakeSourceType: input.intakeSourceType === undefined || input.intakeSourceType === null
            ? null
            : (0, runtime_1.enumValue)(input.intakeSourceType, `${path}.intakeSourceType`, exports.commerceIntakeSourceTypes),
        platformIdentifier: (0, runtime_1.optionalString)(input.platformIdentifier, `${path}.platformIdentifier`, { min: 1, max: 200, pattern: /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/ }),
        parserVersion: (0, runtime_1.optionalString)(input.parserVersion, `${path}.parserVersion`, { min: 1, max: 80, pattern: /^[A-Z0-9][A-Z0-9._-]{0,79}$/ }),
        originalArtifactSha256: (0, runtime_1.optionalSha256)(input.originalArtifactSha256, `${path}.originalArtifactSha256`),
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
const assertionConfidences = ['ASSERTED', 'OBSERVED', 'DERIVED'];
function parseFieldProvenance(value, path) {
    const input = (0, runtime_1.strictObject)(value, path, [
        'source', 'confidence', 'importedAt', 'sourceReference', 'extractionMethod', 'sourceArtifactSha256',
        'assertionId', 'supersedesAssertionId',
    ]);
    const assertionId = (0, runtime_1.optionalString)(input.assertionId, `${path}.assertionId`, { min: 1, max: 120 });
    const supersedesAssertionId = (0, runtime_1.optionalString)(input.supersedesAssertionId, `${path}.supersedesAssertionId`, { min: 1, max: 120 });
    return {
        source: (0, runtime_1.enumValue)(input.source, `${path}.source`, common_1.assertionSources),
        confidence: (0, runtime_1.enumValue)(input.confidence, `${path}.confidence`, assertionConfidences),
        importedAt: (0, runtime_1.isoDateTime)(input.importedAt, `${path}.importedAt`),
        sourceReference: (0, runtime_1.optionalString)(input.sourceReference, `${path}.sourceReference`, { min: 1, max: 500 }),
        extractionMethod: (0, runtime_1.optionalString)(input.extractionMethod, `${path}.extractionMethod`, { min: 1, max: 80, pattern: /^[A-Z0-9][A-Z0-9._-]{0,79}$/ }),
        sourceArtifactSha256: (0, runtime_1.optionalSha256)(input.sourceArtifactSha256, `${path}.sourceArtifactSha256`),
        ...(assertionId ? { assertionId } : {}),
        ...(supersedesAssertionId ? { supersedesAssertionId } : {}),
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
    if (result.source.intakeSourceType) {
        const expectedTrust = commerceTrustLevelForIntakeSource(result.source.intakeSourceType);
        if (result.source.trustLevel !== expectedTrust) {
            throw new runtime_1.DomainValidationError({
                path: 'commerceContext.source.trustLevel',
                code: 'FORMAT',
                message: `intake source ${result.source.intakeSourceType} requires trustLevel ${expectedTrust}`,
            });
        }
        if (exports.consumerIntakeSourceTypes.includes(result.source.intakeSourceType) && !result.source.originalArtifactSha256) {
            throw new runtime_1.DomainValidationError({
                path: 'commerceContext.source.originalArtifactSha256',
                code: 'REQUIRED',
                message: 'consumer intake requires the original artifact SHA-256',
            });
        }
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
function isAuthoritativeCommerceTrustLevel(trust) {
    return trust === 'MERCHANT_SERVER_ATTESTED' || trust === 'PLATFORM_API_ATTESTED';
}
function isUserProvidedCommerceArtifact(trust) {
    return trust === 'USER_PROVIDED_COMMERCE_ARTIFACT';
}
function commerceContextMayAppearAsPassportOrderContext(trust) {
    return isAuthoritativeCommerceTrustLevel(trust) || isUserProvidedCommerceArtifact(trust);
}
function parseCommerceTrustLevel(value) {
    return typeof value === 'string' && exports.commerceTrustLevels.includes(value)
        ? value
        : null;
}
function commerceTrustLevelForIntakeSource(intakeSourceType) {
    switch (intakeSourceType) {
        case 'MERCHANT_API':
            return 'MERCHANT_SERVER_ATTESTED';
        case 'PLATFORM_API':
            return 'PLATFORM_API_ATTESTED';
        case 'BROWSER_EXTENSION':
        case 'PACKPROOF_BUTTON':
            return 'PAGE_DECLARED';
        default:
            return 'USER_PROVIDED_COMMERCE_ARTIFACT';
    }
}
function assertionSourceForIntakeSource(intakeSourceType) {
    switch (intakeSourceType) {
        case 'EMAIL_RECEIPT':
            return 'EMAIL_RECEIPT';
        case 'SHARE_SHEET':
            return 'SHARE_SHEET';
        case 'BROWSER_EXTENSION':
            return 'BROWSER_EXTENSION';
        case 'SCREENSHOT_IMPORT':
            return 'SCREENSHOT_IMPORT';
        case 'PDF_IMPORT':
            return 'PDF_IMPORT';
        case 'PLATFORM_API':
            return 'PLATFORM_API';
        case 'PACKPROOF_BUTTON':
            return 'MERCHANT_PAGE_STRUCTURED_DATA';
        default:
            return 'MERCHANT_API';
    }
}
function canAuthoritativelyBindOrder(source) {
    return isAuthoritativeCommerceTrustLevel(source.trustLevel);
}
function commerceContextCanAuthoritativelyBindOrder(context) {
    return canAuthoritativelyBindOrder(context.source) && context.source.externalOrderId !== null;
}
function commerceImageReferenceIsFinalizedEvidence(_image) {
    return false;
}
//# sourceMappingURL=commerce.js.map