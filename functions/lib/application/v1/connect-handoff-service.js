"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectHandoffApplicationService = void 0;
const compatibility_1 = require("../../domain/v1/compatibility");
const transactions_1 = require("../../domain/v1/transactions");
const errors_1 = require("./errors");
const merchant_transaction_service_1 = require("./merchant-transaction-service");
class ConnectHandoffApplicationService {
    repository;
    tokenVerifier;
    now;
    constructor(repository, tokenVerifier, now = () => new Date()) {
        this.repository = repository;
        this.tokenVerifier = tokenVerifier;
        this.now = now;
    }
    async redeem(command) {
        return this.repository.redeem(command.sessionId, (session, transactionId) => {
            if (!session)
                throw new errors_1.ApplicationError('NOT_FOUND', 'CONNECT_SESSION_NOT_FOUND', 'PackProof Connect session not found.');
            const timestamp = this.now();
            if (session.expiresAt.getTime() < timestamp.getTime()) {
                throw new errors_1.ApplicationError('DEADLINE_EXCEEDED', 'CONNECT_SESSION_EXPIRED', 'PackProof Connect session expired.');
            }
            if (session.claimedBy && session.claimedBy !== command.actorId) {
                throw new errors_1.ApplicationError('CONFLICT', 'CONNECT_SESSION_ALREADY_CLAIMED', 'This PackProof Connect session was claimed by another account.');
            }
            if (session.claimedBy === command.actorId && session.transactionId) {
                return { type: 'REPLAY', result: { transactionId: session.transactionId, connectSessionId: session.id } };
            }
            if (session.status !== 'PENDING_REDEMPTION') {
                throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'CONNECT_SESSION_NOT_REDEEMABLE', 'This PackProof Connect session cannot be redeemed in its current state.');
            }
            if (!session.tokenHash || !this.tokenVerifier.verify(command.token, session.tokenHash)) {
                throw new errors_1.ApplicationError('FORBIDDEN', 'INVALID_HANDOFF_TOKEN', 'Invalid PackProof Connect handoff token.');
            }
            const terms = {
                saleType: 'SHIPPED',
                shippingResponsibility: 'SELLER',
                returns: 'PLATFORM_POLICY',
                returnWindowDays: 0,
                customTerms: `Order imported from ${session.platform}.`,
            };
            const transaction = {
                sellerId: command.actorId,
                buyerId: null,
                participantIds: [command.actorId],
                status: 'TERMS_LOCKED',
                title: session.itemTitle,
                category: 'Platform order',
                description: session.itemDescription,
                priceMinor: session.priceMinor,
                currency: session.currency,
                identifiers: [{ label: 'External order ID', value: session.externalOrderId }],
                conditionNotes: '',
                terms,
                confirmedBy: [command.actorId],
                handoffConfirmedBy: [],
                completedBy: [],
                lockedAt: timestamp,
                createdAt: timestamp,
                updatedAt: timestamp,
                source: {
                    type: 'PACKPROOF_CONNECT',
                    platform: session.platform,
                    integrationId: session.integrationId,
                    connectSessionId: session.id,
                    commerceContextId: session.commerceContextId,
                    externalOrderId: session.externalOrderId,
                    externalSellerId: session.externalSellerId,
                    callbackUrl: session.callbackUrl,
                    trackingNumber: session.trackingNumber,
                    carrier: session.carrier,
                    declaredWeightGrams: session.declaredWeightGrams,
                },
            };
            transactions_1.transactionDtoSchema.parse((0, compatibility_1.mapLegacyConsumerTransaction)({ id: transactionId, ...transaction }));
            const event = {
                id: `evt_${(0, merchant_transaction_service_1.sha256)(`connect-redeemed\n${session.id}`).slice(0, 40)}`,
                schemaVersion: 1,
                type: 'TRANSACTION_CREATED',
                organizationId: null,
                actor: { type: 'USER', id: command.actorId },
                resourceType: 'transaction',
                resourceId: transactionId,
                requestId: command.requestId,
                occurredAt: timestamp,
                data: {
                    origin: 'PACKPROOF_CONNECT',
                    integrationId: session.integrationId,
                    connectSessionId: session.id,
                    commerceContextId: session.commerceContextId,
                    externalOrderIdHash: (0, merchant_transaction_service_1.sha256)(session.externalOrderId),
                },
            };
            return { type: 'CREATE', transaction, event };
        });
    }
}
exports.ConnectHandoffApplicationService = ConnectHandoffApplicationService;
//# sourceMappingURL=connect-handoff-service.js.map