"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PublicCommerceHandoffApplicationService = void 0;
const commerce_1 = require("../../domain/v1/commerce");
const compatibility_1 = require("../../domain/v1/compatibility");
const transactions_1 = require("../../domain/v1/transactions");
const errors_1 = require("./errors");
const consumer_transaction_service_1 = require("./consumer-transaction-service");
const merchant_transaction_service_1 = require("./merchant-transaction-service");
function canonicalOrigin(value) {
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        throw new errors_1.ApplicationError('INVALID_ARGUMENT', 'INVALID_ORIGIN', 'The browser Origin header is invalid.');
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.origin !== value) {
        throw new errors_1.ApplicationError('FORBIDDEN', 'ORIGIN_NOT_ALLOWED', 'This storefront origin is not authorized for the PackProof Button.');
    }
    return parsed.origin;
}
function assertHttpsReference(value, code, message) {
    let parsed;
    try {
        parsed = new URL(value);
    }
    catch {
        throw new errors_1.ApplicationError('INVALID_ARGUMENT', code, message);
    }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password) {
        throw new errors_1.ApplicationError('INVALID_ARGUMENT', code, message);
    }
    return parsed;
}
function populatedItemFields(item) {
    const fields = ['item.title', 'item.description', 'item.quantity'];
    if (item.category)
        fields.push('item.category');
    if (item.brand)
        fields.push('item.brand');
    if (item.model)
        fields.push('item.model');
    if (item.sku)
        fields.push('item.sku');
    if (item.gtin)
        fields.push('item.gtin');
    if (item.upc)
        fields.push('item.upc');
    if (item.mpn)
        fields.push('item.mpn');
    if (item.serialNumber)
        fields.push('item.serialNumber');
    if (item.selectedOptions.length)
        fields.push('item.selectedOptions');
    if (item.identifiers.length)
        fields.push('item.identifiers');
    if (item.amount)
        fields.push('item.amount');
    if (item.imageReferences.length)
        fields.push('item.imageReferences');
    return fields;
}
function legacyIdentifiers(item) {
    const identifiers = item.identifiers.map(({ type, value }) => ({ label: type.replaceAll('_', ' '), value }));
    const direct = [
        ['Brand', item.brand], ['Model', item.model], ['SKU', item.sku], ['GTIN', item.gtin], ['UPC', item.upc], ['MPN', item.mpn], ['Serial number', item.serialNumber],
    ];
    for (const [label, value] of direct) {
        if (value && !identifiers.some((entry) => entry.label === label && entry.value === value))
            identifiers.push({ label, value });
    }
    for (const option of item.selectedOptions) {
        const label = `Option: ${option.name}`;
        if (!identifiers.some((entry) => entry.label === label && entry.value === option.value))
            identifiers.push({ label, value: option.value });
    }
    return identifiers.slice(0, 20);
}
class PublicCommerceHandoffApplicationService {
    repository;
    tokenIssuer;
    tokenVerifier;
    environment;
    now;
    constructor(repository, tokenIssuer, tokenVerifier, environment, now = () => new Date()) {
        this.repository = repository;
        this.tokenIssuer = tokenIssuer;
        this.tokenVerifier = tokenVerifier;
        this.environment = environment;
        this.now = now;
    }
    async authorizeOrigin(publishableKey, originValue) {
        const origin = canonicalOrigin(originValue);
        const integration = await this.repository.findIntegrationByPublishableKey(publishableKey);
        if (!integration || integration.status !== 'ACTIVE' || integration.environment !== this.environment()) {
            throw new errors_1.ApplicationError('FORBIDDEN', 'BUTTON_INSTALLATION_NOT_AUTHORIZED', 'This PackProof Button installation is not active for this environment.');
        }
        if (!integration.allowedOrigins.includes(origin)) {
            throw new errors_1.ApplicationError('FORBIDDEN', 'ORIGIN_NOT_ALLOWED', 'This storefront origin is not authorized for the PackProof Button.');
        }
        return { integration, origin };
    }
    async issue(command) {
        const { integration, origin } = command.authorization ?? await this.authorizeOrigin(command.publishableKey, command.origin);
        const productUrl = assertHttpsReference(command.input.source.productUrl, 'INVALID_PRODUCT_URL', 'source.productUrl must be a public HTTPS URL.');
        if (productUrl.origin !== origin) {
            throw new errors_1.ApplicationError('FORBIDDEN', 'PRODUCT_ORIGIN_MISMATCH', 'source.productUrl must belong to the storefront origin that invoked the button.');
        }
        for (const image of command.input.item.imageReferences) {
            assertHttpsReference(image.url, 'INVALID_IMAGE_URL', 'Item image references must use public HTTPS URLs.');
        }
        const timestamp = this.now();
        const expiresAt = new Date(timestamp.getTime() + 30 * 60_000);
        const operationIdentity = (0, merchant_transaction_service_1.canonicalize)({ integrationId: integration.id, origin, operationKey: command.operationKey });
        const handoffId = `hnd_${(0, merchant_transaction_service_1.sha256)(`public-commerce-handoff-v1\n${operationIdentity}`).slice(0, 40)}`;
        const commerceContextId = `ctx_${(0, merchant_transaction_service_1.sha256)(`public-commerce-context-v1\n${handoffId}`).slice(0, 40)}`;
        const passportDraftId = `draft_${(0, merchant_transaction_service_1.sha256)(`public-passport-draft-v1\n${handoffId}`).slice(0, 40)}`;
        const requestFingerprint = (0, merchant_transaction_service_1.sha256)((0, merchant_transaction_service_1.canonicalize)({ integrationId: integration.id, origin, input: command.input }));
        const token = this.tokenIssuer.issue(handoffId);
        const importedAt = timestamp.toISOString();
        const fieldProvenance = Object.fromEntries(populatedItemFields(command.input.item).map((field) => [field, {
                source: 'MERCHANT_PAGE_STRUCTURED_DATA',
                confidence: 'ASSERTED',
                importedAt,
                sourceReference: command.input.source.productUrl,
            }]));
        const context = commerce_1.commerceContextDtoSchema.parse({
            id: commerceContextId,
            object: 'commerce_context',
            schemaVersion: 1,
            integrationId: integration.id,
            source: {
                platform: command.input.source.platform,
                trustLevel: 'PAGE_DECLARED',
                externalShopId: null,
                externalProductId: command.input.source.externalProductId,
                externalListingId: command.input.source.externalListingId,
                externalVariantId: command.input.source.externalVariantId,
                externalOrderId: null,
                externalLineItemId: null,
                productUrl: command.input.source.productUrl,
                capturedAt: importedAt,
            },
            item: command.input.item,
            fieldProvenance,
            canonicalPayloadSha256: requestFingerprint,
            status: 'HANDOFF_ISSUED',
            supersedesCommerceContextId: null,
            expiresAt: expiresAt.toISOString(),
            createdAt: importedAt,
            updatedAt: importedAt,
        });
        const draft = commerce_1.passportDraftDtoSchema.parse({
            id: passportDraftId,
            object: 'passport_draft',
            schemaVersion: 1,
            commerceContextId,
            transactionId: null,
            item: command.input.item,
            status: 'READY_FOR_REVIEW',
            expiresAt: expiresAt.toISOString(),
            createdAt: importedAt,
            updatedAt: importedAt,
        });
        const baseEvent = {
            schemaVersion: 1,
            organizationId: null,
            actor: { type: 'SYSTEM', id: `button:${integration.id}` },
            resourceType: 'commerce_context',
            resourceId: commerceContextId,
            requestId: command.requestId,
            occurredAt: timestamp,
        };
        const events = [
            {
                ...baseEvent,
                id: `evt_${(0, merchant_transaction_service_1.sha256)(`COMMERCE_CONTEXT_CREATED\n${commerceContextId}`).slice(0, 40)}`,
                type: 'COMMERCE_CONTEXT_CREATED',
                data: { trustLevel: 'PAGE_DECLARED', platform: context.source.platform, originHash: (0, merchant_transaction_service_1.sha256)(origin), requestFingerprint },
            },
            {
                ...baseEvent,
                id: `evt_${(0, merchant_transaction_service_1.sha256)(`COMMERCE_HANDOFF_ISSUED\n${handoffId}`).slice(0, 40)}`,
                type: 'COMMERCE_HANDOFF_ISSUED',
                data: { handoffId, passportDraftId, expiresAt: expiresAt.toISOString() },
            },
        ];
        const result = await this.repository.createOrReplay({
            handoffId,
            operationKey: command.operationKey,
            requestFingerprint,
            origin,
            tokenHash: this.tokenIssuer.digest(token),
            expiresAt,
            commerceContext: context,
            passportDraft: draft,
            events,
        });
        return { handoffId, commerceContextId, passportDraftId, token, expiresAt: result.expiresAt, replayed: !result.created };
    }
    async redeem(command) {
        const quotaExceeded = command.plan !== 'PRO'
            && await this.repository.hasActiveTransactionForSeller(command.actorId, consumer_transaction_service_1.activeConsumerTransactionStatuses);
        return this.repository.redeem(command.handoffId, (snapshot, transactionId) => {
            if (!snapshot)
                throw new errors_1.ApplicationError('NOT_FOUND', 'PUBLIC_HANDOFF_NOT_FOUND', 'PackProof Button handoff not found.');
            const timestamp = this.now();
            if (snapshot.expiresAt.getTime() < timestamp.getTime()) {
                throw new errors_1.ApplicationError('DEADLINE_EXCEEDED', 'PUBLIC_HANDOFF_EXPIRED', 'This PackProof Button handoff has expired. Return to the listing and try again.');
            }
            if (snapshot.claimedBy && snapshot.claimedBy !== command.actorId) {
                throw new errors_1.ApplicationError('CONFLICT', 'PUBLIC_HANDOFF_ALREADY_CLAIMED', 'This PackProof Button handoff was claimed by another account.');
            }
            if (snapshot.claimedBy === command.actorId && snapshot.transactionId) {
                return { type: 'REPLAY', result: {
                        transactionId: snapshot.transactionId,
                        publicHandoffId: snapshot.id,
                        commerceContextId: snapshot.commerceContextId,
                        passportDraftId: snapshot.passportDraftId,
                    } };
            }
            if (quotaExceeded) {
                throw new errors_1.ApplicationError('RESOURCE_EXHAUSTED', 'ACTIVE_TRANSACTION_LIMIT', 'The free plan supports one active PackProof. Upgrade to create another.');
            }
            if (snapshot.status !== 'PENDING_CLAIM' || snapshot.context.status !== 'HANDOFF_ISSUED' || snapshot.draft.status !== 'READY_FOR_REVIEW') {
                throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'PUBLIC_HANDOFF_NOT_REDEEMABLE', 'This PackProof Button handoff cannot be redeemed in its current state.');
            }
            if (snapshot.context.source.trustLevel !== 'PAGE_DECLARED' || snapshot.context.source.externalOrderId !== null) {
                throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'PUBLIC_HANDOFF_TRUST_BOUNDARY_VIOLATION', 'The public handoff is not a valid page-declared commerce context.');
            }
            if (!snapshot.tokenHash || !this.tokenVerifier.verify(command.token, snapshot.tokenHash)) {
                throw new errors_1.ApplicationError('FORBIDDEN', 'INVALID_HANDOFF_TOKEN', 'Invalid PackProof Button handoff token.');
            }
            const item = snapshot.draft.item;
            const amount = item.amount ?? { currency: 'USD', minorUnits: 0 };
            const terms = {
                saleType: 'SHIPPED',
                shippingResponsibility: 'SELLER',
                returns: 'PLATFORM_POLICY',
                returnWindowDays: 0,
                customTerms: 'Listing details were imported as page-declared context. Review and edit them before inviting another participant.',
            };
            const transaction = {
                sellerId: command.actorId,
                buyerId: null,
                participantIds: [command.actorId],
                status: 'DRAFT',
                title: item.title,
                category: item.category ?? 'Imported listing',
                description: item.description,
                priceMinor: amount.minorUnits,
                currency: amount.currency,
                identifiers: legacyIdentifiers(item),
                conditionNotes: '',
                terms,
                confirmedBy: [],
                handoffConfirmedBy: [],
                completedBy: [],
                lockedAt: null,
                createdAt: timestamp,
                updatedAt: timestamp,
                source: {
                    type: 'PACKPROOF_BUTTON',
                    integrationId: snapshot.integrationId,
                    commerceContextId: snapshot.commerceContextId,
                    passportDraftId: snapshot.passportDraftId,
                    publicHandoffId: snapshot.id,
                    trustLevel: 'PAGE_DECLARED',
                    origin: snapshot.origin,
                    productUrl: snapshot.context.source.productUrl,
                },
            };
            transactions_1.transactionDtoSchema.parse((0, compatibility_1.mapLegacyConsumerTransaction)({ id: transactionId, ...transaction }));
            const events = [
                {
                    id: `evt_${(0, merchant_transaction_service_1.sha256)(`PUBLIC_HANDOFF_TRANSACTION_CREATED\n${snapshot.id}`).slice(0, 40)}`,
                    schemaVersion: 1,
                    type: 'TRANSACTION_CREATED',
                    organizationId: null,
                    actor: { type: 'USER', id: command.actorId },
                    resourceType: 'transaction',
                    resourceId: transactionId,
                    requestId: command.requestId,
                    occurredAt: timestamp,
                    data: {
                        origin: 'COMMERCE_ADAPTER',
                        trustLevel: 'PAGE_DECLARED',
                        commerceContextId: snapshot.commerceContextId,
                        passportDraftId: snapshot.passportDraftId,
                        publicHandoffId: snapshot.id,
                    },
                },
                {
                    id: `evt_${(0, merchant_transaction_service_1.sha256)(`COMMERCE_CONTEXT_CLAIMED\n${snapshot.id}`).slice(0, 40)}`,
                    schemaVersion: 1,
                    type: 'COMMERCE_CONTEXT_CLAIMED',
                    organizationId: null,
                    actor: { type: 'USER', id: command.actorId },
                    resourceType: 'commerce_context',
                    resourceId: snapshot.commerceContextId,
                    requestId: command.requestId,
                    occurredAt: timestamp,
                    data: { transactionId, passportDraftId: snapshot.passportDraftId, trustLevel: 'PAGE_DECLARED' },
                },
            ];
            return { type: 'CREATE', transaction, events };
        });
    }
}
exports.PublicCommerceHandoffApplicationService = PublicCommerceHandoffApplicationService;
//# sourceMappingURL=public-commerce-handoff-service.js.map