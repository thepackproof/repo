"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MerchantTransactionApplicationService = exports.MerchantAuthorizationPolicy = void 0;
exports.canonicalize = canonicalize;
exports.sha256 = sha256;
exports.createTransactionId = createTransactionId;
exports.toMerchantTransactionDto = toMerchantTransactionDto;
const node_crypto_1 = require("node:crypto");
const compatibility_1 = require("../../domain/v1/compatibility");
const transactions_1 = require("../../domain/v1/transactions");
const errors_1 = require("./errors");
function canonicalize(value) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return JSON.stringify(value);
    if (typeof value === 'number') {
        if (!Number.isFinite(value))
            throw new Error('Canonical JSON does not support non-finite numbers.');
        return JSON.stringify(value);
    }
    if (Array.isArray(value))
        return `[${value.map(canonicalize).join(',')}]`;
    if (typeof value === 'object') {
        const record = value;
        return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
    }
    throw new Error('Canonical JSON does not support this value.');
}
function sha256(value) {
    return (0, node_crypto_1.createHash)('sha256').update(value, 'utf8').digest('hex');
}
function createTransactionId() {
    return `txn_${(0, node_crypto_1.randomUUID)().replaceAll('-', '')}`;
}
function toMerchantTransactionDto(transaction) {
    return {
        id: transaction.id,
        object: 'transaction',
        merchantReference: transaction.merchantReference,
        title: transaction.title,
        description: transaction.description,
        category: transaction.category,
        amount: transaction.amount,
        participants: transaction.participants,
        captureRequirements: transaction.captureRequirements,
        status: transaction.status,
        captureStatus: transaction.captureStatus,
        shipmentStatus: transaction.shipmentStatus,
        receiverStatus: transaction.receiverStatus,
        returnStatus: transaction.returnStatus,
        verificationStatus: transaction.verificationStatus,
        createdAt: transaction.createdAt.toISOString(),
        updatedAt: transaction.updatedAt.toISOString(),
    };
}
function assertCanonicalCompatibility(transaction) {
    transactions_1.transactionDtoSchema.parse((0, compatibility_1.mapLegacyMerchantTransaction)({
        id: transaction.id,
        merchantReference: transaction.merchantReference,
        title: transaction.title,
        description: transaction.description,
        category: transaction.category,
        amount: transaction.amount,
        participants: transaction.participants,
        status: transaction.status,
        createdAt: transaction.createdAt,
        updatedAt: transaction.updatedAt,
    }));
}
class MerchantAuthorizationPolicy {
    requireScope(principal, scope) {
        if (!principal.scopes.includes(scope)) {
            throw new errors_1.ApplicationError('FORBIDDEN', 'INSUFFICIENT_SCOPE', 'The API credential does not grant this operation.', [
                { code: 'REQUIRED_SCOPE', message: scope },
            ]);
        }
    }
    requireEnvironment(principal, environment) {
        if (principal.environment !== environment) {
            throw new errors_1.ApplicationError('FORBIDDEN', 'ENVIRONMENT_MISMATCH', 'The API credential belongs to a different environment.');
        }
    }
}
exports.MerchantAuthorizationPolicy = MerchantAuthorizationPolicy;
class MerchantTransactionApplicationService {
    repository;
    idempotency;
    audit;
    authorization;
    config;
    now;
    constructor(repository, idempotency, audit, authorization, config, now = () => new Date()) {
        this.repository = repository;
        this.idempotency = idempotency;
        this.audit = audit;
        this.authorization = authorization;
        this.config = config;
        this.now = now;
    }
    async create(principal, input, idempotencyKey, requestId) {
        this.authorization.requireEnvironment(principal, this.config.environment);
        this.authorization.requireScope(principal, 'transactions:write');
        const requestFingerprint = sha256(canonicalize(input));
        const execution = await this.idempotency.execute({
            principalId: `${principal.organizationId}:${principal.apiClientId}`,
            operation: 'POST /v1/transactions',
            key: idempotencyKey,
            requestFingerprint,
        }, async (transactionId, fence) => {
            const timestamp = this.now();
            const transaction = {
                id: transactionId,
                organizationId: principal.organizationId,
                merchantReference: input.merchantReference,
                title: input.title,
                description: input.description,
                category: input.category,
                amount: input.amount,
                participants: input.participants,
                captureRequirements: input.captureRequirements,
                status: 'CREATED',
                captureStatus: 'NOT_STARTED',
                shipmentStatus: 'NOT_ASSOCIATED',
                receiverStatus: 'NOT_STARTED',
                returnStatus: 'NOT_STARTED',
                verificationStatus: 'PENDING_EVIDENCE',
                createdByApiClientId: principal.apiClientId,
                createdAt: timestamp,
                updatedAt: timestamp,
            };
            assertCanonicalCompatibility(transaction);
            const event = {
                id: `evt_${sha256(`transaction-created\n${transaction.id}`).slice(0, 40)}`,
                schemaVersion: 1,
                type: 'TRANSACTION_CREATED',
                organizationId: principal.organizationId,
                actor: { type: 'MERCHANT_API_CLIENT', id: principal.apiClientId },
                resourceType: 'transaction',
                resourceId: transaction.id,
                requestId,
                occurredAt: timestamp,
                data: { origin: 'MERCHANT_API', requestFingerprint, merchantReferenceHash: sha256(input.merchantReference) },
            };
            const persisted = await this.repository.create(transaction, event);
            await fence.runSideEffect('audit-transaction-created', () => this.audit.append({
                eventId: `transaction_created_${persisted.id}`,
                organizationId: principal.organizationId,
                type: 'TRANSACTION_CREATED',
                actor: principal,
                resourceType: 'TRANSACTION',
                resourceId: persisted.id,
                requestId,
                metadata: {
                    apiVersion: 'v1',
                    requestFingerprint,
                    merchantReferenceHash: sha256(input.merchantReference),
                    outboxEventId: event.id,
                },
            }));
            return { transaction: toMerchantTransactionDto(persisted) };
        });
        return {
            transaction: execution.value.transaction,
            captureInstructions: { state: 'NOT_ISSUED', reason: 'CAPTURE_SESSION_REQUIRED' },
            replayed: execution.replayed,
        };
    }
    async get(principal, transactionId) {
        this.authorization.requireEnvironment(principal, this.config.environment);
        this.authorization.requireScope(principal, 'transactions:read');
        const transaction = await this.repository.findByIdForOrganization(transactionId, principal.organizationId);
        if (!transaction)
            throw new errors_1.ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'The requested transaction was not found.');
        assertCanonicalCompatibility(transaction);
        return toMerchantTransactionDto(transaction);
    }
    async list(principal, input) {
        this.authorization.requireEnvironment(principal, this.config.environment);
        this.authorization.requireScope(principal, 'transactions:read');
        const page = await this.repository.listForOrganization(principal.organizationId, input);
        page.transactions.forEach(assertCanonicalCompatibility);
        return { transactions: page.transactions.map(toMerchantTransactionDto), nextCursor: page.nextCursor };
    }
}
exports.MerchantTransactionApplicationService = MerchantTransactionApplicationService;
//# sourceMappingURL=merchant-transaction-service.js.map