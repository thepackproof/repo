"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TransactionIntakeApplicationService = exports.CONSUMER_INTAKE_INTEGRATION_ID = void 0;
exports.overlayIntakeItem = overlayIntakeItem;
exports.pendingIntakeFromContext = pendingIntakeFromContext;
exports.isConsumerIntakeSourceType = isConsumerIntakeSourceType;
const commerce_1 = require("../../domain/v1/commerce");
const compatibility_1 = require("../../domain/v1/compatibility");
const common_1 = require("../../domain/v1/common");
const transaction_intake_parsers_1 = require("../../domain/v1/transaction-intake-parsers");
const runtime_1 = require("../../domain/v1/runtime");
const transactions_1 = require("../../domain/v1/transactions");
const consumer_transaction_service_1 = require("./consumer-transaction-service");
const errors_1 = require("./errors");
const merchant_transaction_service_1 = require("./merchant-transaction-service");
exports.CONSUMER_INTAKE_INTEGRATION_ID = 'int_consumerIntake01';
function intakePlatform(platformIdentifier) {
    const token = platformIdentifier?.trim().toUpperCase() ?? '';
    if (commerce_1.commercePlatforms.includes(token))
        return token;
    if (token === 'SHOPIFY' || token === 'WOOCOMMERCE' || token === 'MAGENTO')
        return token;
    return platformIdentifier ? 'MARKETPLACE' : 'CUSTOM';
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
function variantLabel(item) {
    const label = item.selectedOptions.map((option) => `${option.name}: ${option.value}`).join('; ').trim();
    return label || null;
}
function mergeOption(options, option) {
    const next = options.filter((entry) => entry.name.toLowerCase() !== option.name.toLowerCase());
    next.push(option);
    return next;
}
function overlayIntakeItem(base, confirmed) {
    if (!confirmed)
        return base;
    const variant = confirmed.variant?.trim();
    const title = confirmed.title?.trim();
    const sku = confirmed.sku?.trim();
    const currency = confirmed.currency?.trim().toUpperCase();
    return {
        ...base,
        title: title || base.title,
        description: confirmed.description != null ? confirmed.description : base.description,
        sku: sku || base.sku,
        selectedOptions: variant ? mergeOption(base.selectedOptions, { name: 'Variant', value: variant.slice(0, 300) }) : base.selectedOptions,
        quantity: confirmed.quantity && confirmed.quantity >= 1 ? Math.min(confirmed.quantity, 100_000) : base.quantity,
        amount: confirmed.priceMinor != null
            ? { currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : (base.amount?.currency ?? 'USD'), minorUnits: confirmed.priceMinor }
            : base.amount,
    };
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
        const name = `Option: ${option.name}`;
        if (!identifiers.some((entry) => entry.label === name && entry.value === option.value))
            identifiers.push({ label: name, value: option.value });
    }
    return identifiers.slice(0, 20);
}
function domainError(error) {
    if (error instanceof runtime_1.DomainValidationError) {
        throw new errors_1.ApplicationError('INVALID_ARGUMENT', 'INVALID_INTAKE_PAYLOAD', error.message, error.issues.map((issue) => ({
            field: issue.path,
            code: issue.code,
            message: issue.message,
        })));
    }
    throw error;
}
function pendingIntakeFromContext(commerceContext, passportDraftId) {
    return {
        commerceContextId: commerceContext.id,
        passportDraftId,
        title: commerceContext.item.title,
        variant: variantLabel(commerceContext.item),
        quantity: commerceContext.item.quantity,
        amount: commerceContext.item.amount,
        orderNumber: commerceContext.source.externalOrderId,
        intakeSourceType: commerceContext.source.intakeSourceType,
        platformIdentifier: commerceContext.source.platformIdentifier,
        importedAt: commerceContext.source.capturedAt,
        missingFields: (0, transaction_intake_parsers_1.missingIntakeFields)(commerceContext.item, commerceContext.source.externalOrderId),
    };
}
class TransactionIntakeApplicationService {
    repository;
    now;
    constructor(repository, now = () => new Date()) {
        this.repository = repository;
        this.now = now;
    }
    preview(artifactText, intakeSourceType) {
        if (!commerce_1.consumerIntakeSourceTypes.includes(intakeSourceType)) {
            throw new errors_1.ApplicationError('INVALID_ARGUMENT', 'UNSUPPORTED_INTAKE_SOURCE', 'This intake adapter is not a consumer correspondence source.');
        }
        try {
            return (0, transaction_intake_parsers_1.parseCommerceArtifact)(artifactText, intakeSourceType);
        }
        catch (error) {
            return domainError(error);
        }
    }
    async ingestArtifact(command) {
        if (command.artifactText !== null) {
            const digest = (0, merchant_transaction_service_1.sha256)(command.artifactText);
            if (digest !== command.originalArtifactSha256) {
                throw new errors_1.ApplicationError('INVALID_ARGUMENT', 'ARTIFACT_HASH_MISMATCH', 'The original artifact hash does not match the supplied correspondence text.');
            }
        }
        let parsed;
        try {
            parsed = (0, transaction_intake_parsers_1.parseCommerceArtifact)(command.artifactText, command.intakeSourceType);
        }
        catch (error) {
            return domainError(error);
        }
        const item = overlayIntakeItem(parsed.item, command.confirmed);
        const externalOrderId = command.confirmed?.orderNumber?.trim() || parsed.externalOrderId;
        if (!item.title.trim()) {
            throw new errors_1.ApplicationError('INVALID_ARGUMENT', 'INTAKE_TITLE_REQUIRED', 'Add the item name to import this purchase.', [{
                    field: 'title',
                    code: 'REQUIRED',
                    message: 'Could not determine the item name from this correspondence.',
                }]);
        }
        return this.ingest({
            actorId: command.actorId,
            integrationId: exports.CONSUMER_INTAKE_INTEGRATION_ID,
            organizationId: command.organizationId ?? null,
            operationKey: command.operationKey,
            requestId: command.requestId,
            intakeSourceType: command.intakeSourceType,
            platformIdentifier: parsed.platformIdentifier,
            parserVersion: parsed.parserVersion,
            originalArtifactSha256: command.originalArtifactSha256,
            item,
            externalOrderId,
            externalListingId: parsed.externalListingId,
            productUrl: parsed.productUrl,
        });
    }
    async ingest(command) {
        if (!commerce_1.consumerIntakeSourceTypes.includes(command.intakeSourceType)) {
            throw new errors_1.ApplicationError('INVALID_ARGUMENT', 'UNSUPPORTED_INTAKE_SOURCE', 'This intake adapter is not a consumer correspondence source.');
        }
        const timestamp = this.now();
        const importedAt = timestamp.toISOString();
        const expiresAt = new Date(timestamp.getTime() + 30 * 86_400_000);
        const identity = (0, merchant_transaction_service_1.canonicalize)({ actorId: command.actorId, operationKey: command.operationKey });
        const commerceContextId = `ctx_${(0, merchant_transaction_service_1.sha256)(`consumer-intake-context-v1\n${identity}`).slice(0, 40)}`;
        const passportDraftId = `draft_${(0, merchant_transaction_service_1.sha256)(`consumer-intake-draft-v1\n${identity}`).slice(0, 40)}`;
        const requestFingerprint = (0, merchant_transaction_service_1.sha256)((0, merchant_transaction_service_1.canonicalize)({
            actorId: command.actorId,
            intakeSourceType: command.intakeSourceType,
            platformIdentifier: command.platformIdentifier,
            parserVersion: command.parserVersion,
            originalArtifactSha256: command.originalArtifactSha256,
            item: command.item,
            externalOrderId: command.externalOrderId,
            externalListingId: command.externalListingId,
            productUrl: command.productUrl,
        }));
        const assertionSource = (0, commerce_1.assertionSourceForIntakeSource)(command.intakeSourceType);
        const fieldProvenance = Object.fromEntries(populatedItemFields(command.item).map((field) => [field, {
                source: assertionSource,
                confidence: 'ASSERTED',
                importedAt,
                sourceReference: command.externalOrderId ?? command.productUrl,
                extractionMethod: command.parserVersion,
                sourceArtifactSha256: command.originalArtifactSha256,
            }]));
        let context;
        let draft;
        try {
            context = commerce_1.commerceContextDtoSchema.parse({
                id: commerceContextId,
                object: 'commerce_context',
                schemaVersion: 1,
                integrationId: command.integrationId,
                source: {
                    platform: intakePlatform(command.platformIdentifier),
                    trustLevel: (0, commerce_1.commerceTrustLevelForIntakeSource)(command.intakeSourceType),
                    intakeSourceType: command.intakeSourceType,
                    platformIdentifier: command.platformIdentifier,
                    parserVersion: command.parserVersion,
                    originalArtifactSha256: command.originalArtifactSha256,
                    externalShopId: null,
                    externalProductId: null,
                    externalListingId: command.externalListingId,
                    externalVariantId: null,
                    externalOrderId: command.externalOrderId,
                    externalLineItemId: null,
                    productUrl: command.productUrl,
                    capturedAt: importedAt,
                },
                item: command.item,
                fieldProvenance,
                canonicalPayloadSha256: (0, merchant_transaction_service_1.sha256)((0, merchant_transaction_service_1.canonicalize)(command.item)),
                status: 'CREATED',
                supersedesCommerceContextId: null,
                expiresAt: expiresAt.toISOString(),
                createdAt: importedAt,
                updatedAt: importedAt,
            });
            draft = commerce_1.passportDraftDtoSchema.parse({
                id: passportDraftId,
                object: 'passport_draft',
                schemaVersion: 1,
                commerceContextId,
                transactionId: null,
                item: command.item,
                status: 'READY_FOR_REVIEW',
                expiresAt: expiresAt.toISOString(),
                createdAt: importedAt,
                updatedAt: importedAt,
            });
        }
        catch (error) {
            return domainError(error);
        }
        const event = {
            id: `evt_${(0, merchant_transaction_service_1.sha256)(`COMMERCE_CONTEXT_CREATED\n${commerceContextId}`).slice(0, 40)}`,
            schemaVersion: 1,
            type: 'COMMERCE_CONTEXT_CREATED',
            organizationId: command.organizationId,
            actor: { type: 'USER', id: command.actorId },
            resourceType: 'commerce_context',
            resourceId: commerceContextId,
            requestId: command.requestId,
            occurredAt: timestamp,
            data: {
                trustLevel: context.source.trustLevel,
                intakeSourceType: command.intakeSourceType,
                platformIdentifier: command.platformIdentifier,
                parserVersion: command.parserVersion,
                originalArtifactSha256: command.originalArtifactSha256,
                requestFingerprint,
            },
        };
        const pending = pendingIntakeFromContext(context, passportDraftId);
        const result = await this.repository.createOrReplay({
            actorId: command.actorId,
            organizationId: command.organizationId,
            operationKey: command.operationKey,
            requestFingerprint,
            commerceContextId,
            passportDraftId,
            commerceContext: context,
            passportDraft: draft,
            pending,
            event,
        });
        return {
            commerceContextId,
            passportDraftId,
            pending,
            parserVersion: command.parserVersion,
            replayed: !result.created,
        };
    }
    async listPending(actorId) {
        return this.repository.listPendingForActor(actorId);
    }
    async start(command) {
        const quotaExceeded = command.plan !== 'PRO'
            && await this.repository.hasActiveTransactionForSeller(command.actorId, consumer_transaction_service_1.activeConsumerTransactionStatuses);
        return this.repository.claim(command.commerceContextId, (snapshot, transactionId) => {
            if (!snapshot)
                throw new errors_1.ApplicationError('NOT_FOUND', 'INTAKE_NOT_FOUND', 'Imported purchase not found.');
            if (snapshot.actorId !== command.actorId) {
                throw new errors_1.ApplicationError('FORBIDDEN', 'INTAKE_ACTOR_MISMATCH', 'Only the account that imported this purchase can start a PackProof from it.');
            }
            const timestamp = this.now();
            if (snapshot.expiresAt.getTime() < timestamp.getTime()) {
                throw new errors_1.ApplicationError('DEADLINE_EXCEEDED', 'INTAKE_EXPIRED', 'This imported purchase expired. Import the receipt again.');
            }
            if (snapshot.status === 'CLAIMED' && snapshot.transactionId) {
                return {
                    type: 'REPLAY',
                    result: {
                        transactionId: snapshot.transactionId,
                        commerceContextId: snapshot.commerceContext.id,
                        passportDraftId: snapshot.passportDraft.id,
                        replayed: true,
                    },
                };
            }
            if (quotaExceeded) {
                throw new errors_1.ApplicationError('RESOURCE_EXHAUSTED', 'ACTIVE_TRANSACTION_LIMIT', 'The free plan supports one active PackProof. Upgrade to create another.');
            }
            if (snapshot.status !== 'PENDING' || snapshot.commerceContext.status !== 'CREATED' || snapshot.passportDraft.status !== 'READY_FOR_REVIEW') {
                throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'INTAKE_NOT_STARTABLE', 'This imported purchase cannot start a PackProof in its current state.');
            }
            try {
                (0, common_1.assertTransition)(commerce_1.commerceContextTransitions, snapshot.commerceContext.status, 'CLAIMED', 'commerceContext');
                (0, common_1.assertTransition)(commerce_1.passportDraftTransitions, snapshot.passportDraft.status, 'BOUND', 'passportDraft');
            }
            catch (error) {
                return domainError(error);
            }
            const item = overlayIntakeItem(snapshot.passportDraft.item, command.confirmed);
            if (!item.title.trim()) {
                throw new errors_1.ApplicationError('INVALID_ARGUMENT', 'INTAKE_TITLE_REQUIRED', 'Add the item name to start this PackProof.');
            }
            const amount = item.amount ?? { currency: 'USD', minorUnits: 0 };
            const terms = {
                saleType: 'SHIPPED',
                shippingResponsibility: 'SELLER',
                returns: 'AS_AGREED',
                returnWindowDays: 14,
                customTerms: '',
            };
            const transaction = {
                sellerId: command.actorId,
                buyerId: null,
                participantIds: [command.actorId],
                status: 'DRAFT',
                title: item.title,
                category: item.category ?? 'Imported purchase',
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
                    type: 'TRANSACTION_INTAKE',
                    intakeSourceType: snapshot.commerceContext.source.intakeSourceType,
                    commerceContextId: snapshot.commerceContext.id,
                    passportDraftId: snapshot.passportDraft.id,
                    trustLevel: snapshot.commerceContext.source.trustLevel,
                    platformIdentifier: snapshot.commerceContext.source.platformIdentifier,
                    parserVersion: snapshot.commerceContext.source.parserVersion,
                    originalArtifactSha256: snapshot.commerceContext.source.originalArtifactSha256,
                },
            };
            transactions_1.transactionDtoSchema.parse((0, compatibility_1.mapLegacyConsumerTransaction)({
                id: transactionId,
                ...transaction,
                source: { type: 'TRANSACTION_INTAKE', commerceContextId: snapshot.commerceContext.id, passportDraftId: snapshot.passportDraft.id },
            }));
            const events = [
                {
                    id: `evt_${(0, merchant_transaction_service_1.sha256)(`INTAKE_TRANSACTION_CREATED\n${snapshot.commerceContext.id}`).slice(0, 40)}`,
                    schemaVersion: 1,
                    type: 'TRANSACTION_CREATED',
                    organizationId: null,
                    actor: { type: 'USER', id: command.actorId },
                    resourceType: 'transaction',
                    resourceId: transactionId,
                    requestId: command.requestId,
                    occurredAt: timestamp,
                    data: {
                        origin: 'CONSUMER',
                        trustLevel: snapshot.commerceContext.source.trustLevel,
                        commerceContextId: snapshot.commerceContext.id,
                        passportDraftId: snapshot.passportDraft.id,
                        intakeSourceType: snapshot.commerceContext.source.intakeSourceType,
                    },
                },
                {
                    id: `evt_${(0, merchant_transaction_service_1.sha256)(`COMMERCE_CONTEXT_CLAIMED\n${snapshot.commerceContext.id}`).slice(0, 40)}`,
                    schemaVersion: 1,
                    type: 'COMMERCE_CONTEXT_CLAIMED',
                    organizationId: null,
                    actor: { type: 'USER', id: command.actorId },
                    resourceType: 'commerce_context',
                    resourceId: snapshot.commerceContext.id,
                    requestId: command.requestId,
                    occurredAt: timestamp,
                    data: { transactionId, passportDraftId: snapshot.passportDraft.id, trustLevel: snapshot.commerceContext.source.trustLevel },
                },
            ];
            return { type: 'CREATE', transaction, draftItem: item, events };
        });
    }
}
exports.TransactionIntakeApplicationService = TransactionIntakeApplicationService;
function isConsumerIntakeSourceType(value) {
    return commerce_1.consumerIntakeSourceTypes.includes(value);
}
//# sourceMappingURL=transaction-intake-service.js.map