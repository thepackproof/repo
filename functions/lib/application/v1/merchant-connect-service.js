"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MerchantConnectApplicationService = void 0;
exports.toMerchantConnectSessionDto = toMerchantConnectSessionDto;
const errors_1 = require("./errors");
function toMerchantConnectSessionDto(session) {
    return {
        id: session.id,
        object: 'connect_session',
        schemaVersion: 1,
        platform: session.platform,
        externalOrderId: session.externalOrderId,
        status: session.status,
        transactionId: session.transactionId,
        commerceContextId: session.commerceContextId,
        itemTitle: session.itemTitle,
        amount: { currency: session.currency, minorUnits: session.priceMinor },
        trackingNumber: session.trackingNumber,
        carrier: session.carrier,
        expiresAt: session.expiresAt.toISOString(),
        createdAt: session.createdAt.toISOString(),
    };
}
class MerchantConnectApplicationService {
    commerceContext;
    integrations;
    sessions;
    callbacks;
    authorization;
    config;
    captureBaseUrl;
    constructor(commerceContext, integrations, sessions, callbacks, authorization, config, captureBaseUrl) {
        this.commerceContext = commerceContext;
        this.integrations = integrations;
        this.sessions = sessions;
        this.callbacks = callbacks;
        this.authorization = authorization;
        this.config = config;
        this.captureBaseUrl = captureBaseUrl;
    }
    async createSession(principal, input, idempotencyKey, requestId) {
        this.authorization.requireEnvironment(principal, this.config.environment);
        this.authorization.requireScope(principal, 'transactions:write');
        const integration = await this.integrations.findBoundIntegration(principal);
        if (!integration) {
            throw new errors_1.ApplicationError('FORBIDDEN', 'INTEGRATION_NOT_BOUND', 'This API credential is not bound to an active PackProof Connect integration.');
        }
        await this.callbacks.validate(input.callbackUrl, integration.callbackOrigins);
        const result = await this.commerceContext.ingestConnectOrder({
            integrationId: integration.id,
            platform: integration.platform,
            webhookSigningSecret: integration.webhookSigningSecret,
            organizationId: principal.organizationId,
        }, {
            platform: input.platform,
            orderId: input.externalOrderId,
            sellerId: input.externalSellerId,
            trackingNumber: input.trackingNumber,
            carrier: input.carrier,
            itemTitle: input.itemTitle,
            itemDescription: input.itemDescription,
            declaredWeightGrams: input.declaredWeightGrams,
            priceMinor: input.amount.minorUnits,
            currency: input.amount.currency,
            callbackUrl: input.callbackUrl,
            idempotencyKey,
        }, requestId);
        const captureUrl = `${this.captureBaseUrl().replace(/\/$/, '')}/connect/capture?session=${encodeURIComponent(result.sessionId)}&token=${encodeURIComponent(result.sessionToken)}`;
        return {
            session: {
                id: result.sessionId,
                object: 'connect_session',
                schemaVersion: 1,
                platform: input.platform,
                externalOrderId: input.externalOrderId,
                status: 'PENDING_REDEMPTION',
                transactionId: null,
                commerceContextId: result.commerceContextId,
                itemTitle: input.itemTitle,
                amount: input.amount,
                trackingNumber: input.trackingNumber ?? null,
                carrier: input.carrier ?? null,
                expiresAt: result.expiresAt.toISOString(),
                createdAt: new Date(result.expiresAt.getTime() - 7 * 86_400_000).toISOString(),
            },
            captureUrl,
            token: result.sessionToken,
            replayed: result.replayed,
        };
    }
    async getSession(principal, sessionId) {
        this.authorization.requireEnvironment(principal, this.config.environment);
        this.authorization.requireScope(principal, 'transactions:read');
        const session = await this.sessions.findAccessibleSession(sessionId, principal);
        if (!session) {
            throw new errors_1.ApplicationError('NOT_FOUND', 'CONNECT_SESSION_NOT_FOUND', 'The requested Connect session was not found.');
        }
        return toMerchantConnectSessionDto(session);
    }
}
exports.MerchantConnectApplicationService = MerchantConnectApplicationService;
//# sourceMappingURL=merchant-connect-service.js.map