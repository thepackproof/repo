import type { CommerceContextApplicationService } from './commerce-context-service';
import { ApplicationError } from './errors';
import type {
  MerchantConnectIntegrationLookup,
  MerchantConnectSessionReader,
  PublicCallbackUrlValidator,
  StoredConnectSession,
} from './merchant-evidence-ports';
import type { CreateMerchantConnectSessionInput, MerchantConnectSessionDto } from './merchant-evidence-types';
import { MerchantAuthorizationPolicy } from './merchant-transaction-service';
import type { ApiRuntimeConfig } from './merchant-ports';
import type { MerchantPrincipal } from './merchant-types';

export function toMerchantConnectSessionDto(session: StoredConnectSession): MerchantConnectSessionDto {
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

export class MerchantConnectApplicationService {
  constructor(
    private readonly commerceContext: CommerceContextApplicationService,
    private readonly integrations: MerchantConnectIntegrationLookup,
    private readonly sessions: MerchantConnectSessionReader,
    private readonly callbacks: PublicCallbackUrlValidator,
    private readonly authorization: MerchantAuthorizationPolicy,
    private readonly config: ApiRuntimeConfig,
    private readonly captureBaseUrl: () => string,
  ) {}

  async createSession(
    principal: MerchantPrincipal,
    input: CreateMerchantConnectSessionInput,
    idempotencyKey: string,
    requestId: string,
  ): Promise<{ session: MerchantConnectSessionDto; captureUrl: string; token: string; replayed: boolean }> {
    this.authorization.requireEnvironment(principal, this.config.environment);
    this.authorization.requireScope(principal, 'transactions:write');
    const integration = await this.integrations.findBoundIntegration(principal);
    if (!integration) {
      throw new ApplicationError(
        'FORBIDDEN',
        'INTEGRATION_NOT_BOUND',
        'This API credential is not bound to an active PackProof Connect integration.',
      );
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

  async getSession(principal: MerchantPrincipal, sessionId: string): Promise<MerchantConnectSessionDto> {
    this.authorization.requireEnvironment(principal, this.config.environment);
    this.authorization.requireScope(principal, 'transactions:read');
    const session = await this.sessions.findAccessibleSession(sessionId, principal);
    if (!session) {
      throw new ApplicationError('NOT_FOUND', 'CONNECT_SESSION_NOT_FOUND', 'The requested Connect session was not found.');
    }
    return toMerchantConnectSessionDto(session);
  }
}
