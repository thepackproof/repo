import { commerceContextDtoSchema, type CommerceContextDto, type CommercePlatform, type ItemDescriptor } from '../../domain/v1/commerce';
import { ApplicationError } from './errors';
import type { ApplicationEvent } from './events';
import { canonicalize, sha256 } from './merchant-transaction-service';

export type CommerceIntegrationPrincipal = {
  integrationId: string;
  platform: string;
  webhookSigningSecret: string;
  organizationId?: string | null;
};

export type ConnectOrderInput = {
  platform: string;
  orderId: string;
  sellerId: string;
  trackingNumber?: string;
  carrier?: string;
  itemTitle: string;
  itemDescription: string;
  declaredWeightGrams?: number;
  priceMinor: number;
  currency: string;
  callbackUrl: string;
  idempotencyKey: string;
};

export type CommerceContextMutation = {
  sessionId: string;
  commerceContext: CommerceContextDto;
  requestPayloadHash: string;
  sessionTokenHash: string;
  session: {
    integrationId: string;
    platform: string;
    externalOrderId: string;
    externalSellerId: string;
    trackingNumber: string | null;
    carrier: string | null;
    itemTitle: string;
    itemDescription: string;
    declaredWeightGrams: number | null;
    priceMinor: number;
    currency: string;
    callbackUrl: string;
    organizationId: string | null;
    status: 'PENDING_REDEMPTION';
    expiresAt: Date;
  };
  event: ApplicationEvent;
};

export interface CommerceContextRepository {
  createOrReplay(mutation: CommerceContextMutation): Promise<{ created: boolean; expiresAt: Date }>;
}

export interface ConnectSessionTokenIssuer {
  issue(sessionId: string, signingSecret: string): string;
  digest(token: string): string;
}

function commercePlatform(value: string): CommercePlatform {
  switch (value.trim().toLowerCase()) {
    case 'shopify': return 'SHOPIFY';
    case 'woocommerce': return 'WOOCOMMERCE';
    case 'magento': return 'MAGENTO';
    case 'marketplace': return 'MARKETPLACE';
    default: return 'CUSTOM';
  }
}

function itemDescriptor(input: ConnectOrderInput): ItemDescriptor {
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

export class CommerceContextApplicationService {
  constructor(
    private readonly repository: CommerceContextRepository,
    private readonly tokenIssuer: ConnectSessionTokenIssuer,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async ingestConnectOrder(
    principal: CommerceIntegrationPrincipal,
    input: ConnectOrderInput,
    requestId: string,
  ): Promise<{ sessionId: string; commerceContextId: string; sessionToken: string; expiresAt: Date; replayed: boolean }> {
    if (principal.platform.trim().toLowerCase() !== input.platform.trim().toLowerCase()) {
      throw new ApplicationError('FORBIDDEN', 'PLATFORM_MISMATCH', 'The order platform does not match the authenticated integration.');
    }
    const timestamp = this.now();
    const expiresAt = new Date(timestamp.getTime() + 7 * 86_400_000);
    const sessionId = sha256(`${principal.integrationId}\n${input.idempotencyKey}`);
    const commerceContextId = `ctx_${sha256(`commerce-context\n${sessionId}`).slice(0, 40)}`;
    const requestPayloadHash = sha256(JSON.stringify(input));
    const sessionToken = this.tokenIssuer.issue(sessionId, principal.webhookSigningSecret);
    const descriptor = itemDescriptor(input);
    const provenance = {
      source: 'MERCHANT_API' as const,
      confidence: 'ASSERTED' as const,
      importedAt: timestamp.toISOString(),
      sourceReference: input.orderId,
    };
    const commerceContext = commerceContextDtoSchema.parse({
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
      canonicalPayloadSha256: sha256(canonicalize({ integrationId: principal.integrationId, input })),
      status: 'ORDER_BOUND',
      supersedesCommerceContextId: null,
      expiresAt: expiresAt.toISOString(),
      createdAt: timestamp.toISOString(),
      updatedAt: timestamp.toISOString(),
    });
    const event: ApplicationEvent = {
      id: `evt_${sha256(`commerce-context-created\n${commerceContextId}`).slice(0, 40)}`,
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
        externalOrderIdHash: sha256(input.orderId),
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
        organizationId: principal.organizationId ?? null,
        status: 'PENDING_REDEMPTION',
        expiresAt,
      },
      event,
    });
    return { sessionId, commerceContextId, sessionToken, expiresAt: result.expiresAt, replayed: !result.created };
  }
}
