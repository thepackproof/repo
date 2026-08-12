import type { FieldProvenance, FieldProvenanceDto, Money, OrganizationScopedResource, PublicResource, ResourceId, VersionedResource } from './common';
import { parseMoney, parseResourceId } from './common';
import {
  arrayValue,
  DomainValidationError,
  enumValue,
  integerValue,
  isoDateTime,
  literalValue,
  optionalIsoDateTime,
  optionalString,
  recordValue,
  schema,
  sha256Value,
  strictObject,
  stringValue,
  urlValue,
} from './runtime';

export const commercePlatforms = ['SHOPIFY', 'WOOCOMMERCE', 'MAGENTO', 'CUSTOM', 'MARKETPLACE', 'STRUCTURED_PAGE_DATA'] as const;
export type CommercePlatform = (typeof commercePlatforms)[number];

export const commerceTrustLevels = ['MERCHANT_SERVER_ATTESTED', 'PLATFORM_API_ATTESTED', 'PAGE_DECLARED'] as const;
export type CommerceTrustLevel = (typeof commerceTrustLevels)[number];

export const commerceContextStatuses = ['CREATED', 'HANDOFF_ISSUED', 'CLAIMED', 'ORDER_BOUND', 'EXPIRED', 'REVOKED'] as const;
export type CommerceContextStatus = (typeof commerceContextStatuses)[number];

export const commerceContextTransitions: Readonly<Record<CommerceContextStatus, readonly CommerceContextStatus[]>> = {
  CREATED: ['HANDOFF_ISSUED', 'ORDER_BOUND', 'EXPIRED', 'REVOKED'],
  HANDOFF_ISSUED: ['CLAIMED', 'ORDER_BOUND', 'EXPIRED', 'REVOKED'],
  CLAIMED: ['ORDER_BOUND', 'EXPIRED', 'REVOKED'],
  ORDER_BOUND: [],
  EXPIRED: [],
  REVOKED: [],
};

export type CommerceSource = {
  platform: CommercePlatform;
  trustLevel: CommerceTrustLevel;
  externalShopId: string | null;
  externalProductId: string | null;
  externalListingId: string | null;
  externalVariantId: string | null;
  externalOrderId: string | null;
  externalLineItemId: string | null;
  productUrl: string | null;
  capturedAt: Date;
};

export type CommerceSourceDto = Omit<CommerceSource, 'capturedAt'> & { capturedAt: string };

export type ItemOption = { name: string; value: string };
export type ItemIdentifier = { type: string; value: string };
export type ImageReference = { url: string; altText: string | null };

export type ItemDescriptor = {
  title: string;
  description: string;
  category: string | null;
  brand: string | null;
  model: string | null;
  sku: string | null;
  gtin: string | null;
  upc: string | null;
  mpn: string | null;
  serialNumber: string | null;
  selectedOptions: ItemOption[];
  identifiers: ItemIdentifier[];
  quantity: number;
  amount: Money | null;
  imageReferences: ImageReference[];
};

export type CommerceContext = OrganizationScopedResource<'commerce_context'> & {
  integrationId: ResourceId<'integration'>;
  source: CommerceSource;
  item: ItemDescriptor;
  fieldProvenance: Record<string, FieldProvenance>;
  canonicalPayloadSha256: string;
  status: CommerceContextStatus;
  supersedesCommerceContextId: ResourceId<'commerce_context'> | null;
  expiresAt: Date | null;
};

export type CommerceContextDto = PublicResource<'commerce_context', 'commerce_context'> & {
  integrationId: ResourceId<'integration'>;
  source: CommerceSourceDto;
  item: ItemDescriptor;
  fieldProvenance: Record<string, FieldProvenanceDto>;
  canonicalPayloadSha256: string;
  status: CommerceContextStatus;
  supersedesCommerceContextId: ResourceId<'commerce_context'> | null;
  expiresAt: string | null;
};

function parseCommerceSource(value: unknown, path: string): CommerceSourceDto {
  const input = strictObject(value, path, [
    'platform', 'trustLevel', 'externalShopId', 'externalProductId', 'externalListingId', 'externalVariantId',
    'externalOrderId', 'externalLineItemId', 'productUrl', 'capturedAt',
  ]);
  const productUrl = input.productUrl === undefined || input.productUrl === null ? null : urlValue(input.productUrl, `${path}.productUrl`);
  return {
    platform: enumValue(input.platform, `${path}.platform`, commercePlatforms),
    trustLevel: enumValue(input.trustLevel, `${path}.trustLevel`, commerceTrustLevels),
    externalShopId: optionalString(input.externalShopId, `${path}.externalShopId`, { min: 1, max: 200 }),
    externalProductId: optionalString(input.externalProductId, `${path}.externalProductId`, { min: 1, max: 200 }),
    externalListingId: optionalString(input.externalListingId, `${path}.externalListingId`, { min: 1, max: 200 }),
    externalVariantId: optionalString(input.externalVariantId, `${path}.externalVariantId`, { min: 1, max: 200 }),
    externalOrderId: optionalString(input.externalOrderId, `${path}.externalOrderId`, { min: 1, max: 200 }),
    externalLineItemId: optionalString(input.externalLineItemId, `${path}.externalLineItemId`, { min: 1, max: 200 }),
    productUrl,
    capturedAt: isoDateTime(input.capturedAt, `${path}.capturedAt`),
  };
}

function parsePair(value: unknown, path: string): ItemOption {
  const input = strictObject(value, path, ['name', 'value']);
  return {
    name: stringValue(input.name, `${path}.name`, { min: 1, max: 120 }),
    value: stringValue(input.value, `${path}.value`, { min: 1, max: 300 }),
  };
}

function parseIdentifier(value: unknown, path: string): ItemIdentifier {
  const input = strictObject(value, path, ['type', 'value']);
  return {
    type: stringValue(input.type, `${path}.type`, { min: 1, max: 80, pattern: /^[A-Z0-9_-]+$/ }),
    value: stringValue(input.value, `${path}.value`, { min: 1, max: 300 }),
  };
}

function parseImage(value: unknown, path: string): ImageReference {
  const input = strictObject(value, path, ['url', 'altText']);
  return {
    url: urlValue(input.url, `${path}.url`),
    altText: optionalString(input.altText, `${path}.altText`, { max: 500, trim: false }),
  };
}

export function parseItemDescriptor(value: unknown, path: string): ItemDescriptor {
  const input = strictObject(value, path, [
    'title', 'description', 'category', 'brand', 'model', 'sku', 'gtin', 'upc', 'mpn', 'serialNumber',
    'selectedOptions', 'identifiers', 'quantity', 'amount', 'imageReferences',
  ]);
  return {
    title: stringValue(input.title, `${path}.title`, { min: 1, max: 300 }),
    description: stringValue(input.description, `${path}.description`, { max: 10_000, trim: false }),
    category: optionalString(input.category, `${path}.category`, { min: 1, max: 160 }),
    brand: optionalString(input.brand, `${path}.brand`, { min: 1, max: 160 }),
    model: optionalString(input.model, `${path}.model`, { min: 1, max: 160 }),
    sku: optionalString(input.sku, `${path}.sku`, { min: 1, max: 160 }),
    gtin: optionalString(input.gtin, `${path}.gtin`, { min: 8, max: 14, pattern: /^\d{8,14}$/ }),
    upc: optionalString(input.upc, `${path}.upc`, { min: 8, max: 14, pattern: /^\d{8,14}$/ }),
    mpn: optionalString(input.mpn, `${path}.mpn`, { min: 1, max: 160 }),
    serialNumber: optionalString(input.serialNumber, `${path}.serialNumber`, { min: 1, max: 200 }),
    selectedOptions: arrayValue(input.selectedOptions, `${path}.selectedOptions`, { max: 30, parse: parsePair, uniqueBy: (item) => item.name.toLowerCase() }),
    identifiers: arrayValue(input.identifiers, `${path}.identifiers`, { max: 30, parse: parseIdentifier, uniqueBy: (item) => `${item.type}:${item.value}` }),
    quantity: integerValue(input.quantity, `${path}.quantity`, 1, 100_000),
    amount: input.amount === undefined || input.amount === null ? null : parseMoney(input.amount, `${path}.amount`),
    imageReferences: arrayValue(input.imageReferences, `${path}.imageReferences`, { max: 20, parse: parseImage, uniqueBy: (item) => item.url }),
  };
}

const assertionSources = ['MERCHANT_API', 'PLATFORM_API', 'MERCHANT_PAGE_STRUCTURED_DATA', 'SELLER_ENTERED', 'BUYER_ENTERED', 'PACKPROOF_OBSERVED', 'EXTERNAL_ADAPTER'] as const;
const assertionConfidences = ['ASSERTED', 'OBSERVED', 'DERIVED'] as const;

function parseFieldProvenance(value: unknown, path: string): FieldProvenanceDto {
  const input = strictObject(value, path, ['source', 'confidence', 'importedAt', 'sourceReference']);
  return {
    source: enumValue(input.source, `${path}.source`, assertionSources),
    confidence: enumValue(input.confidence, `${path}.confidence`, assertionConfidences),
    importedAt: isoDateTime(input.importedAt, `${path}.importedAt`),
    sourceReference: optionalString(input.sourceReference, `${path}.sourceReference`, { min: 1, max: 500 }),
  };
}

export const commerceContextDtoSchema = schema<CommerceContextDto>((value) => {
  const input = strictObject(value, 'commerceContext', [
    'id', 'object', 'schemaVersion', 'integrationId', 'source', 'item', 'fieldProvenance', 'canonicalPayloadSha256',
    'status', 'supersedesCommerceContextId', 'expiresAt', 'createdAt', 'updatedAt',
  ]);
  literalValue(input.object, 'commerceContext.object', 'commerce_context');
  literalValue(input.schemaVersion, 'commerceContext.schemaVersion', 1);
  const result: CommerceContextDto = {
    id: parseResourceId('commerce_context', input.id, 'commerceContext.id'),
    object: 'commerce_context',
    schemaVersion: 1,
    integrationId: parseResourceId('integration', input.integrationId, 'commerceContext.integrationId', { allowLegacy: true }),
    source: parseCommerceSource(input.source, 'commerceContext.source'),
    item: parseItemDescriptor(input.item, 'commerceContext.item'),
    fieldProvenance: recordValue(input.fieldProvenance, 'commerceContext.fieldProvenance', { maxKeys: 200, parse: parseFieldProvenance }),
    canonicalPayloadSha256: sha256Value(input.canonicalPayloadSha256, 'commerceContext.canonicalPayloadSha256'),
    status: enumValue(input.status, 'commerceContext.status', commerceContextStatuses),
    supersedesCommerceContextId: input.supersedesCommerceContextId === undefined || input.supersedesCommerceContextId === null
      ? null
      : parseResourceId('commerce_context', input.supersedesCommerceContextId, 'commerceContext.supersedesCommerceContextId'),
    expiresAt: optionalIsoDateTime(input.expiresAt, 'commerceContext.expiresAt'),
    createdAt: isoDateTime(input.createdAt, 'commerceContext.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'commerceContext.updatedAt'),
  };
  if (result.status === 'ORDER_BOUND' && !commerceContextCanAuthoritativelyBindOrder(result)) {
    throw new DomainValidationError({
      path: 'commerceContext.status',
      code: 'FORMAT',
      message: 'ORDER_BOUND requires an authoritative merchant-server or platform-API source with an external order ID',
    });
  }
  return result;
});

export const passportDraftStatuses = ['DRAFT', 'READY_FOR_REVIEW', 'BOUND', 'EXPIRED', 'CANCELLED'] as const;
export type PassportDraftStatus = (typeof passportDraftStatuses)[number];

export const passportDraftTransitions: Readonly<Record<PassportDraftStatus, readonly PassportDraftStatus[]>> = {
  DRAFT: ['READY_FOR_REVIEW', 'EXPIRED', 'CANCELLED'],
  READY_FOR_REVIEW: ['DRAFT', 'BOUND', 'EXPIRED', 'CANCELLED'],
  BOUND: [],
  EXPIRED: [],
  CANCELLED: [],
};

export type PassportDraft = VersionedResource<'passport_draft'> & {
  commerceContextId: ResourceId<'commerce_context'>;
  transactionId: ResourceId<'transaction'> | null;
  item: ItemDescriptor;
  status: PassportDraftStatus;
  expiresAt: Date | null;
};

export type PassportDraftDto = PublicResource<'passport_draft', 'passport_draft'> & {
  commerceContextId: ResourceId<'commerce_context'>;
  transactionId: ResourceId<'transaction'> | null;
  item: ItemDescriptor;
  status: PassportDraftStatus;
  expiresAt: string | null;
};

export const passportDraftDtoSchema = schema<PassportDraftDto>((value) => {
  const input = strictObject(value, 'passportDraft', ['id', 'object', 'schemaVersion', 'commerceContextId', 'transactionId', 'item', 'status', 'expiresAt', 'createdAt', 'updatedAt']);
  literalValue(input.object, 'passportDraft.object', 'passport_draft');
  literalValue(input.schemaVersion, 'passportDraft.schemaVersion', 1);
  const result: PassportDraftDto = {
    id: parseResourceId('passport_draft', input.id, 'passportDraft.id'),
    object: 'passport_draft',
    schemaVersion: 1,
    commerceContextId: parseResourceId('commerce_context', input.commerceContextId, 'passportDraft.commerceContextId'),
    transactionId: input.transactionId === undefined || input.transactionId === null ? null : parseResourceId('transaction', input.transactionId, 'passportDraft.transactionId', { allowLegacy: true }),
    item: parseItemDescriptor(input.item, 'passportDraft.item'),
    status: enumValue(input.status, 'passportDraft.status', passportDraftStatuses),
    expiresAt: optionalIsoDateTime(input.expiresAt, 'passportDraft.expiresAt'),
    createdAt: isoDateTime(input.createdAt, 'passportDraft.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'passportDraft.updatedAt'),
  };
  if (result.status === 'BOUND' && result.transactionId === null) {
    throw new DomainValidationError({ path: 'passportDraft.transactionId', code: 'REQUIRED', message: 'is required when the draft is BOUND' });
  }
  return result;
});

export function commerceContextCanAuthoritativelyBindOrder(context: CommerceContextDto): boolean {
  return context.source.trustLevel !== 'PAGE_DECLARED' && context.source.externalOrderId !== null;
}

export function commerceImageReferenceIsFinalizedEvidence(_image: ImageReference): false {
  return false;
}
