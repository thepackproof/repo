import type { CommerceContextApplicationService } from './commerce-context-service';
import { ApplicationError } from './errors';
import type { ApplicationEvent } from './events';
import type {
  ConnectSessionCancelDecision,
  MerchantConnectIntegrationLookup,
  MerchantConnectSessionReader,
  PublicCallbackUrlValidator,
  StoredConnectSession,
} from './merchant-evidence-ports';
import { publicConnectSessionStatus } from './merchant-evidence-ports';
import type { CreateMerchantConnectSessionInput, MerchantConnectSessionDto } from './merchant-evidence-types';
import { MerchantAuthorizationPolicy, sha256 } from './merchant-transaction-service';
import type { ApiRuntimeConfig } from './merchant-ports';
import type { MerchantPrincipal } from './merchant-types';

export function toMerchantConnectSessionDto(
  session: StoredConnectSession,
  now: Date = new Date(),
): MerchantConnectSessionDto {
  return {
    id: session.id,
    object: 'connect_session',
    schemaVersion: 1,
    platform: session.platform,
    externalOrderId: session.externalOrderId,
    status: publicConnectSessionStatus(session.status, session.expiresAt, now),
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

export function evaluateConnectSessionCancel(
  session: StoredConnectSession | null,
  principal: MerchantPrincipal,
  requestId: string,
  now: Date,
): ConnectSessionCancelDecision {
  if (!session) {
    throw new ApplicationError('NOT_FOUND', 'CONNECT_SESSION_NOT_FOUND', 'The requested Connect session was not found.');
  }
  if (session.status === 'CANCELLED') {
    return { type: 'REPLAY', session };
  }
  if (session.status === 'READY_FOR_CAPTURE' || session.transactionId) {
    throw new ApplicationError(
      'CONFLICT',
      'CONNECT_SESSION_NOT_CANCELLABLE',
      'This PackProof API session was already redeemed and cannot be cancelled.',
    );
  }
  if (session.status !== 'PENDING_REDEMPTION') {
    throw new ApplicationError(
      'FAILED_PRECONDITION',
      'CONNECT_SESSION_NOT_CANCELLABLE',
      'This PackProof API session cannot be cancelled in its current state.',
    );
  }
  const event: ApplicationEvent = {
    id: `evt_${sha256(`connect-cancelled\n${session.id}`).slice(0, 40)}`,
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
      externalOrderIdHash: sha256(session.externalOrderId),
    },
  };
  return {
    type: 'CANCEL',
    session: { ...session, status: 'CANCELLED' },
    event,
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
    private readonly now: () => Date = () => new Date(),
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
        'This API credential is not bound to an active PackProof API integration.',
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

  async getSession(principal: MerchantPrincipal, sessionId: string): Promise<MerchantConnectSessionDto> {
    this.authorization.requireEnvironment(principal, this.config.environment);
    this.authorization.requireScope(principal, 'transactions:read');
    const session = await this.sessions.findAccessibleSession(sessionId, principal);
    if (!session) {
      throw new ApplicationError('NOT_FOUND', 'CONNECT_SESSION_NOT_FOUND', 'The requested Connect session was not found.');
    }
    return toMerchantConnectSessionDto(session, this.now());
  }

  async listSessions(principal: MerchantPrincipal, externalOrderId: string): Promise<MerchantConnectSessionDto[]> {
    this.authorization.requireEnvironment(principal, this.config.environment);
    this.authorization.requireScope(principal, 'transactions:read');
    const sessions = await this.sessions.listAccessibleSessions(principal, externalOrderId);
    const now = this.now();
    return sessions.map((session) => toMerchantConnectSessionDto(session, now));
  }

  async cancelSession(
    principal: MerchantPrincipal,
    sessionId: string,
    requestId: string,
  ): Promise<{ session: MerchantConnectSessionDto; replayed: boolean }> {
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
