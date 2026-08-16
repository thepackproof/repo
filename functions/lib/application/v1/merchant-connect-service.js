"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MerchantConnectApplicationService = void 0;
exports.toMerchantConnectSessionDto = toMerchantConnectSessionDto;
exports.evaluateConnectSessionCancel = evaluateConnectSessionCancel;
const errors_1 = require("./errors");
const merchant_evidence_ports_1 = require("./merchant-evidence-ports");
const merchant_transaction_service_1 = require("./merchant-transaction-service");
function toMerchantConnectSessionDto(session, now = new Date()) {
    return {
        id: session.id,
        object: 'connect_session',
        schemaVersion: 1,
        platform: session.platform,
        externalOrderId: session.externalOrderId,
        status: (0, merchant_evidence_ports_1.publicConnectSessionStatus)(session.status, session.expiresAt, now),
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
function evaluateConnectSessionCancel(session, principal, requestId, now) {
    if (!session) {
        throw new errors_1.ApplicationError('NOT_FOUND', 'CONNECT_SESSION_NOT_FOUND', 'The requested Connect session was not found.');
    }
    if (session.status === 'CANCELLED') {
        return { type: 'REPLAY', session };
    }
    if (session.status === 'READY_FOR_CAPTURE' || session.transactionId) {
        throw new errors_1.ApplicationError('CONFLICT', 'CONNECT_SESSION_NOT_CANCELLABLE', 'This PackProof Connect session was already redeemed and cannot be cancelled.');
    }
    if (session.status !== 'PENDING_REDEMPTION') {
        throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'CONNECT_SESSION_NOT_CANCELLABLE', 'This PackProof Connect session cannot be cancelled in its current state.');
    }
    const event = {
        id: `evt_${(0, merchant_transaction_service_1.sha256)(`connect-cancelled\n${session.id}`).slice(0, 40)}`,
        schemaVersion: 1,
        type: 'CONNECT_SESSION_CANCELLED',
        organizationId: principal.organizationId,
        actor: { type: 'MERCHANT_API_CLIENT', id: principal.apiClientId },
        resourceType: 'connect_session',
        resourceId: session.id,
        requestId,
        occurredAt: now,
        data: {
            integrationId: session.integrationId,
            externalOrderIdHash: (0, merchant_transaction_service_1.sha256)(session.externalOrderId),
        },
    };
    return {
        type: 'CANCEL',
        session: { ...session, status: 'CANCELLED' },
        event,
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
    now;
    constructor(commerceContext, integrations, sessions, callbacks, authorization, config, captureBaseUrl, now = () => new Date()) {
        this.commerceContext = commerceContext;
        this.integrations = integrations;
        this.sessions = sessions;
        this.callbacks = callbacks;
        this.authorization = authorization;
        this.config = config;
        this.captureBaseUrl = captureBaseUrl;
        this.now = now;
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
            itemTitle: input.itemTitle,
            itemDescription: input.itemDescription,
            priceMinor: input.amount.minorUnits,
            currency: input.amount.currency,
            callbackUrl: input.callbackUrl,
            idempotencyKey,
            ...(input.trackingNumber !== undefined ? { trackingNumber: input.trackingNumber } : {}),
            ...(input.carrier !== undefined ? { carrier: input.carrier } : {}),
            ...(input.declaredWeightGrams !== undefined ? { declaredWeightGrams: input.declaredWeightGrams } : {}),
        }, requestId);
        const captureUrl = `${this.captureBaseUrl().replace(/\/$/, '')}/connect/capture?session=${encodeURIComponent(result.sessionId)}&token=${encodeURIComponent(result.sessionToken)}`;
        const createdAt = new Date(result.expiresAt.getTime() - 7 * 86_400_000);
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
                createdAt: createdAt.toISOString(),
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
        return toMerchantConnectSessionDto(session, this.now());
    }
    async listSessions(principal, externalOrderId) {
        this.authorization.requireEnvironment(principal, this.config.environment);
        this.authorization.requireScope(principal, 'transactions:read');
        const sessions = await this.sessions.listAccessibleSessions(principal, externalOrderId);
        const now = this.now();
        return sessions.map((session) => toMerchantConnectSessionDto(session, now));
    }
    async cancelSession(principal, sessionId, requestId) {
        this.authorization.requireEnvironment(principal, this.config.environment);
        this.authorization.requireScope(principal, 'transactions:write');
        const now = this.now();
        let replayed = false;
        const session = await this.sessions.cancelAccessibleSession(sessionId, principal, (current) => {
            const decision = evaluateConnectSessionCancel(current, principal, requestId, now);
            replayed = decision.type === 'REPLAY';
            return decision;
        });
        return { session: toMerchantConnectSessionDto(session, now), replayed };
    }
}
exports.MerchantConnectApplicationService = MerchantConnectApplicationService;
//# sourceMappingURL=merchant-connect-service.js.map