"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConsumerTransactionApplicationService = exports.editableConsumerDraftStatuses = exports.activeConsumerTransactionStatuses = void 0;
const compatibility_1 = require("../../domain/v1/compatibility");
const transactions_1 = require("../../domain/v1/transactions");
const errors_1 = require("./errors");
const merchant_transaction_service_1 = require("./merchant-transaction-service");
exports.activeConsumerTransactionStatuses = [
    'DRAFT', 'AWAITING_BUYER', 'TERMS_REVIEW', 'TERMS_LOCKED', 'PACKED', 'SHIPPED', 'BUYER_REVIEW', 'DISPUTED',
];
exports.editableConsumerDraftStatuses = ['DRAFT', 'AWAITING_BUYER', 'TERMS_REVIEW'];
class ConsumerTransactionApplicationService {
    repository;
    now;
    constructor(repository, now = () => new Date()) {
        this.repository = repository;
        this.now = now;
    }
    async saveDraft(command) {
        const isUpdate = Boolean(command.input.transactionId);
        if (!isUpdate && command.plan !== 'PRO'
            && await this.repository.hasActiveTransactionForSeller(command.actorId, exports.activeConsumerTransactionStatuses)) {
            throw new errors_1.ApplicationError('RESOURCE_EXHAUSTED', 'ACTIVE_TRANSACTION_LIMIT', 'The free plan supports one active PackProof. Upgrade to create another.');
        }
        const transactionId = command.input.transactionId ?? this.repository.allocateTransactionId();
        const existing = await this.repository.findDraft(transactionId);
        if (isUpdate && !existing)
            throw new errors_1.ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'PackProof draft not found.');
        if (existing && existing.sellerId !== command.actorId) {
            throw new errors_1.ApplicationError('FORBIDDEN', 'SELLER_REQUIRED', 'Only the seller can edit this draft.');
        }
        if (existing && !exports.editableConsumerDraftStatuses.includes(existing.status)) {
            throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'TERMS_ALREADY_LOCKED', 'Locked terms cannot be edited.');
        }
        const timestamp = this.now();
        const buyerId = existing?.buyerId ?? null;
        const status = buyerId ? 'TERMS_REVIEW' : (existing?.status ?? 'DRAFT');
        const record = {
            sellerId: command.actorId,
            buyerId,
            participantIds: buyerId ? [command.actorId, buyerId] : [command.actorId],
            status,
            title: command.input.title,
            category: command.input.category,
            description: command.input.description,
            priceMinor: command.input.priceMinor,
            currency: command.input.currency,
            identifiers: command.input.identifiers,
            conditionNotes: command.input.conditionNotes,
            terms: command.input.terms,
            confirmedBy: [],
            handoffConfirmedBy: existing?.handoffConfirmedBy ?? [],
            completedBy: existing?.completedBy ?? [],
            lockedAt: null,
            createdAt: existing?.createdAt ?? timestamp,
            updatedAt: timestamp,
        };
        transactions_1.transactionDtoSchema.parse((0, compatibility_1.mapLegacyConsumerTransaction)({ id: transactionId, ...record }));
        const eventType = existing ? 'DRAFT_UPDATED' : 'TRANSACTION_CREATED';
        const event = {
            id: `evt_${(0, merchant_transaction_service_1.sha256)(`${eventType}\n${transactionId}\n${existing ? command.requestId : transactionId}`).slice(0, 40)}`,
            schemaVersion: 1,
            type: eventType,
            organizationId: null,
            actor: { type: 'USER', id: command.actorId },
            resourceType: 'transaction',
            resourceId: transactionId,
            requestId: command.requestId,
            occurredAt: timestamp,
            data: { origin: 'CONSUMER', status },
        };
        await this.repository.saveDraft({
            transactionId,
            expected: { exists: Boolean(existing), sellerId: command.actorId, editableStatuses: exports.editableConsumerDraftStatuses },
            record,
            event,
        });
        return { transactionId };
    }
}
exports.ConsumerTransactionApplicationService = ConsumerTransactionApplicationService;
//# sourceMappingURL=consumer-transaction-service.js.map