"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CommerceContextApplicationService = void 0;
const commerce_1 = require("../../domain/v1/commerce");
const errors_1 = require("./errors");
const merchant_transaction_service_1 = require("./merchant-transaction-service");
function commercePlatform(value) {
    switch (value.trim().toLowerCase()) {
        case 'shopify': return 'SHOPIFY';
        case 'woocommerce': return 'WOOCOMMERCE';
        case 'magento': return 'MAGENTO';
        case 'marketplace': return 'MARKETPLACE';
        default: return 'CUSTOM';
    }
}
function itemDescriptor(input) {
    return {
        title: input.itemTitle,
        description: input.itemDescription,
        category: null,
        brand: null,
        model: null,
        sku: null,
        gtin: null,
        upc: null,
        mpn: null,
        serialNumber: null,
        selectedOptions: [],
        identifiers: [{ type: 'EXTERNAL_ORDER_ID', value: input.orderId }],
        quantity: 1,
        amount: { currency: input.currency, minorUnits: input.priceMinor },
        imageReferences: [],
    };
}
class CommerceContextApplicationService {
    repository;
    tokenIssuer;
    now;
    constructor(repository, tokenIssuer, now = () => new Date()) {
        this.repository = repository;
        this.tokenIssuer = tokenIssuer;
        this.now = now;
    }
    async ingestConnectOrder(principal, input, requestId) {
        if (principal.platform.trim().toLowerCase() !== input.platform.trim().toLowerCase()) {
            throw new errors_1.ApplicationError('FORBIDDEN', 'PLATFORM_MISMATCH', 'The order platform does not match the authenticated integration.');
        }
        const timestamp = this.now();
        const expiresAt = new Date(timestamp.getTime() + 7 * 86_400_000);
        const sessionId = (0, merchant_transaction_service_1.sha256)(`${principal.integrationId}\n${input.idempotencyKey}`);
        const commerceContextId = `ctx_${(0, merchant_transaction_service_1.sha256)(`commerce-context\n${sessionId}`).slice(0, 40)}`;
        const requestPayloadHash = (0, merchant_transaction_service_1.sha256)(JSON.stringify(input));
        const sessionToken = this.tokenIssuer.issue(sessionId, principal.webhookSigningSecret);
        const descriptor = itemDescriptor(input);
        const provenance = {
            source: 'MERCHANT_API',
            confidence: 'ASSERTED',
            importedAt: timestamp.toISOString(),
            sourceReference: input.orderId,
        };
        const commerceContext = commerce_1.commerceContextDtoSchema.parse({
            id: commerceContextId,
            object: 'commerce_context',
            schemaVersion: 1,
            integrationId: principal.integrationId,
            source: {
                platform: commercePlatform(input.platform),
                trustLevel: 'MERCHANT_SERVER_ATTESTED',
                externalShopId: null,
                externalProductId: null,
                externalListingId: null,
                externalVariantId: null,
                externalOrderId: input.orderId,
                externalLineItemId: null,
                productUrl: null,
                capturedAt: timestamp.toISOString(),
            },
            item: descriptor,
            fieldProvenance: {
                'item.title': provenance,
                'item.description': provenance,
                'item.amount': provenance,
                'item.identifiers': provenance,
            },
            canonicalPayloadSha256: (0, merchant_transaction_service_1.sha256)((0, merchant_transaction_service_1.canonicalize)({ integrationId: principal.integrationId, input })),
            status: 'ORDER_BOUND',
            supersedesCommerceContextId: null,
            expiresAt: expiresAt.toISOString(),
            createdAt: timestamp.toISOString(),
            updatedAt: timestamp.toISOString(),
        });
        const event = {
            id: `evt_${(0, merchant_transaction_service_1.sha256)(`commerce-context-created\n${commerceContextId}`).slice(0, 40)}`,
            schemaVersion: 1,
            type: 'COMMERCE_CONTEXT_CREATED',
            organizationId: null,
            actor: { type: 'MERCHANT_API_CLIENT', id: principal.integrationId },
            resourceType: 'commerce_context',
            resourceId: commerceContextId,
            requestId,
            occurredAt: timestamp,
            data: {
                trustLevel: commerceContext.source.trustLevel,
                platform: commerceContext.source.platform,
                externalOrderIdHash: (0, merchant_transaction_service_1.sha256)(input.orderId),
                requestPayloadHash,
            },
        };
        const result = await this.repository.createOrReplay({
            sessionId,
            commerceContext,
            requestPayloadHash,
            sessionTokenHash: this.tokenIssuer.digest(sessionToken),
            session: {
                integrationId: principal.integrationId,
                platform: input.platform,
                externalOrderId: input.orderId,
                externalSellerId: input.sellerId,
                trackingNumber: input.trackingNumber ?? null,
                carrier: input.carrier ?? null,
                itemTitle: input.itemTitle,
                itemDescription: input.itemDescription,
                declaredWeightGrams: input.declaredWeightGrams ?? null,
                priceMinor: input.priceMinor,
                currency: input.currency,
                callbackUrl: input.callbackUrl,
                status: 'PENDING_REDEMPTION',
                expiresAt,
            },
            event,
        });
        return { sessionId, commerceContextId, sessionToken, expiresAt: result.expiresAt, replayed: !result.created };
    }
}
exports.CommerceContextApplicationService = CommerceContextApplicationService;
//# sourceMappingURL=commerce-context-service.js.map