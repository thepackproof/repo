import type { ApiEnvironment, OrganizationScopedResource, PublicResource, ResourceId, VersionedResource } from './common';
import { parseResourceId } from './common';
import type { AssuranceAssessment } from './evidence';
import { parseAssurance } from './evidence';
import type { JsonValue } from './runtime';
import { arrayValue, enumValue, integerValue, isoDateTime, jsonValue, literalValue, optionalIsoDateTime, optionalString, schema, sha256Value, strictObject, stringValue, urlValue } from './runtime';

export const organizationStatuses = ['ACTIVE', 'SUSPENDED', 'CLOSED'] as const;
export type OrganizationStatus = (typeof organizationStatuses)[number];

export type Organization = VersionedResource<'organization'> & {
  name: string;
  environment: ApiEnvironment;
  status: OrganizationStatus;
};

export type OrganizationDto = PublicResource<'organization', 'organization'> & {
  name: string;
  environment: ApiEnvironment;
  status: OrganizationStatus;
};

export const organizationDtoSchema = schema<OrganizationDto>((value) => {
  const input = strictObject(value, 'organization', ['id', 'object', 'schemaVersion', 'name', 'environment', 'status', 'createdAt', 'updatedAt']);
  literalValue(input.object, 'organization.object', 'organization');
  literalValue(input.schemaVersion, 'organization.schemaVersion', 1);
  return {
    id: parseResourceId('organization', input.id, 'organization.id'),
    object: 'organization',
    schemaVersion: 1,
    name: stringValue(input.name, 'organization.name', { min: 1, max: 200 }),
    environment: enumValue(input.environment, 'organization.environment', ['sandbox', 'live'] as const),
    status: enumValue(input.status, 'organization.status', organizationStatuses),
    createdAt: isoDateTime(input.createdAt, 'organization.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'organization.updatedAt'),
  };
});

export const integrationTypes = ['SHOPIFY', 'WOOCOMMERCE', 'MAGENTO', 'CUSTOM_CHECKOUT', 'MARKETPLACE', 'PACKPROOF_CONNECT'] as const;
export type IntegrationType = (typeof integrationTypes)[number];
export const integrationStatuses = ['ACTIVE', 'DISABLED', 'REVOKED'] as const;
export type IntegrationStatus = (typeof integrationStatuses)[number];

export type Integration = OrganizationScopedResource<'integration'> & {
  name: string;
  type: IntegrationType;
  environment: ApiEnvironment;
  status: IntegrationStatus;
  allowedOrigins: string[];
  externalAccountReference: string | null;
  secretReference: string | null;
};

export type IntegrationDto = PublicResource<'integration', 'integration'> & {
  name: string;
  type: IntegrationType;
  environment: ApiEnvironment;
  status: IntegrationStatus;
  allowedOrigins: string[];
  externalAccountReference: string | null;
};

export const integrationDtoSchema = schema<IntegrationDto>((value) => {
  const input = strictObject(value, 'integration', ['id', 'object', 'schemaVersion', 'name', 'type', 'environment', 'status', 'allowedOrigins', 'externalAccountReference', 'createdAt', 'updatedAt']);
  literalValue(input.object, 'integration.object', 'integration');
  literalValue(input.schemaVersion, 'integration.schemaVersion', 1);
  return {
    id: parseResourceId('integration', input.id, 'integration.id'),
    object: 'integration',
    schemaVersion: 1,
    name: stringValue(input.name, 'integration.name', { min: 1, max: 200 }),
    type: enumValue(input.type, 'integration.type', integrationTypes),
    environment: enumValue(input.environment, 'integration.environment', ['sandbox', 'live'] as const),
    status: enumValue(input.status, 'integration.status', integrationStatuses),
    allowedOrigins: arrayValue(input.allowedOrigins, 'integration.allowedOrigins', { max: 100, parse: (origin, path) => {
      const parsed = urlValue(origin, path);
      const url = new URL(parsed);
      return `${url.protocol}//${url.host}`;
    }, uniqueBy: (origin) => origin }),
    externalAccountReference: optionalString(input.externalAccountReference, 'integration.externalAccountReference', { min: 1, max: 300 }),
    createdAt: isoDateTime(input.createdAt, 'integration.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'integration.updatedAt'),
  };
});

export const canonicalApiScopes = [
  'commerce_contexts:read', 'commerce_contexts:write', 'transactions:read', 'transactions:write', 'participant_claims:write',
  'evidence:read', 'evidence:write', 'shipments:read', 'shipments:write', 'returns:read', 'returns:write',
  'reports:read', 'webhooks:read', 'webhooks:write', 'support:read', 'support:write', 'admin:organization',
] as const;
export type CanonicalApiScope = (typeof canonicalApiScopes)[number];

export type ApiClient = OrganizationScopedResource<'api_client'> & {
  name: string;
  integrationId: ResourceId<'integration'> | null;
  environment: ApiEnvironment;
  status: 'ACTIVE' | 'REVOKED';
  scopes: CanonicalApiScope[];
  credentialVerifier: string;
  credentialId: string;
};

export type ApiClientDto = PublicResource<'api_client', 'api_client'> & {
  name: string;
  integrationId: ResourceId<'integration'> | null;
  environment: ApiEnvironment;
  status: 'ACTIVE' | 'REVOKED';
  scopes: CanonicalApiScope[];
};

export const apiClientDtoSchema = schema<ApiClientDto>((value) => {
  const input = strictObject(value, 'apiClient', ['id', 'object', 'schemaVersion', 'name', 'integrationId', 'environment', 'status', 'scopes', 'createdAt', 'updatedAt']);
  literalValue(input.object, 'apiClient.object', 'api_client');
  literalValue(input.schemaVersion, 'apiClient.schemaVersion', 1);
  return {
    id: parseResourceId('api_client', input.id, 'apiClient.id'),
    object: 'api_client',
    schemaVersion: 1,
    name: stringValue(input.name, 'apiClient.name', { min: 1, max: 200 }),
    integrationId: input.integrationId === undefined || input.integrationId === null ? null : parseResourceId('integration', input.integrationId, 'apiClient.integrationId'),
    environment: enumValue(input.environment, 'apiClient.environment', ['sandbox', 'live'] as const),
    status: enumValue(input.status, 'apiClient.status', ['ACTIVE', 'REVOKED'] as const),
    scopes: arrayValue(input.scopes, 'apiClient.scopes', { min: 1, max: canonicalApiScopes.length, parse: (scope, path) => enumValue(scope, path, canonicalApiScopes), uniqueBy: (scope) => scope }),
    createdAt: isoDateTime(input.createdAt, 'apiClient.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'apiClient.updatedAt'),
  };
});

export const reportStatuses = ['PENDING', 'AVAILABLE', 'FAILED'] as const;
export type EvidenceReportStatus = (typeof reportStatuses)[number];

export type EvidenceReport = VersionedResource<'evidence_report'> & {
  transactionId: ResourceId<'transaction'>;
  status: EvidenceReportStatus;
  evidenceSessionIds: ResourceId<'evidence_session'>[];
  assurance: AssuranceAssessment;
  reportSha256: string | null;
  storagePath: string | null;
  generatedAt: Date | null;
};

export type EvidenceReportDto = PublicResource<'evidence_report', 'evidence_report'> & {
  transactionId: ResourceId<'transaction'>;
  status: EvidenceReportStatus;
  evidenceSessionIds: ResourceId<'evidence_session'>[];
  assurance: AssuranceAssessment;
  reportSha256: string | null;
  generatedAt: string | null;
};

export const evidenceReportDtoSchema = schema<EvidenceReportDto>((value) => {
  const input = strictObject(value, 'evidenceReport', ['id', 'object', 'schemaVersion', 'transactionId', 'status', 'evidenceSessionIds', 'assurance', 'reportSha256', 'generatedAt', 'createdAt', 'updatedAt']);
  literalValue(input.object, 'evidenceReport.object', 'evidence_report');
  literalValue(input.schemaVersion, 'evidenceReport.schemaVersion', 1);
  return {
    id: parseResourceId('evidence_report', input.id, 'evidenceReport.id'),
    object: 'evidence_report',
    schemaVersion: 1,
    transactionId: parseResourceId('transaction', input.transactionId, 'evidenceReport.transactionId', { allowLegacy: true }),
    status: enumValue(input.status, 'evidenceReport.status', reportStatuses),
    evidenceSessionIds: arrayValue(input.evidenceSessionIds, 'evidenceReport.evidenceSessionIds', { max: 1000, parse: (id, path) => parseResourceId('evidence_session', id, path), uniqueBy: (id) => id }),
    assurance: parseAssurance(input.assurance, 'evidenceReport.assurance'),
    reportSha256: input.reportSha256 === undefined || input.reportSha256 === null ? null : sha256Value(input.reportSha256, 'evidenceReport.reportSha256'),
    generatedAt: optionalIsoDateTime(input.generatedAt, 'evidenceReport.generatedAt'),
    createdAt: isoDateTime(input.createdAt, 'evidenceReport.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'evidenceReport.updatedAt'),
  };
});

export type WebhookEndpoint = OrganizationScopedResource<'webhook_endpoint'> & {
  url: string;
  status: 'ACTIVE' | 'DISABLED';
  subscribedEvents: string[];
  signingSecretReference: string;
};

export type WebhookEndpointDto = PublicResource<'webhook_endpoint', 'webhook_endpoint'> & {
  url: string;
  status: 'ACTIVE' | 'DISABLED';
  subscribedEvents: string[];
};

export const webhookEndpointDtoSchema = schema<WebhookEndpointDto>((value) => {
  const input = strictObject(value, 'webhookEndpoint', ['id', 'object', 'schemaVersion', 'url', 'status', 'subscribedEvents', 'createdAt', 'updatedAt']);
  literalValue(input.object, 'webhookEndpoint.object', 'webhook_endpoint');
  literalValue(input.schemaVersion, 'webhookEndpoint.schemaVersion', 1);
  return {
    id: parseResourceId('webhook_endpoint', input.id, 'webhookEndpoint.id'),
    object: 'webhook_endpoint',
    schemaVersion: 1,
    url: urlValue(input.url, 'webhookEndpoint.url'),
    status: enumValue(input.status, 'webhookEndpoint.status', ['ACTIVE', 'DISABLED'] as const),
    subscribedEvents: arrayValue(input.subscribedEvents, 'webhookEndpoint.subscribedEvents', { min: 1, max: 100, parse: (event, path) => stringValue(event, path, { min: 3, max: 160, pattern: /^[a-z][a-z0-9_.]+$/ }), uniqueBy: (event) => event }),
    createdAt: isoDateTime(input.createdAt, 'webhookEndpoint.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'webhookEndpoint.updatedAt'),
  };
});

export type WebhookEvent = OrganizationScopedResource<'webhook_event'> & {
  type: string;
  resourceType: string;
  resourceId: string;
  data: JsonValue;
  occurredAt: Date;
};

export type WebhookEventDto = PublicResource<'webhook_event', 'webhook_event'> & {
  type: string;
  resourceType: string;
  resourceId: string;
  data: JsonValue;
  occurredAt: string;
};

export const webhookEventDtoSchema = schema<WebhookEventDto>((value) => {
  const input = strictObject(value, 'webhookEvent', ['id', 'object', 'schemaVersion', 'type', 'resourceType', 'resourceId', 'data', 'occurredAt', 'createdAt', 'updatedAt']);
  literalValue(input.object, 'webhookEvent.object', 'webhook_event');
  literalValue(input.schemaVersion, 'webhookEvent.schemaVersion', 1);
  return {
    id: parseResourceId('webhook_event', input.id, 'webhookEvent.id'),
    object: 'webhook_event',
    schemaVersion: 1,
    type: stringValue(input.type, 'webhookEvent.type', { min: 3, max: 160, pattern: /^[a-z][a-z0-9_.]+$/ }),
    resourceType: stringValue(input.resourceType, 'webhookEvent.resourceType', { min: 1, max: 120, pattern: /^[a-z][a-z0-9_]+$/ }),
    resourceId: stringValue(input.resourceId, 'webhookEvent.resourceId', { min: 8, max: 160 }),
    data: jsonValue(input.data, 'webhookEvent.data'),
    occurredAt: isoDateTime(input.occurredAt, 'webhookEvent.occurredAt'),
    createdAt: isoDateTime(input.createdAt, 'webhookEvent.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'webhookEvent.updatedAt'),
  };
});

export const deliveryStatuses = ['PENDING', 'DELIVERING', 'DELIVERED', 'RETRY_SCHEDULED', 'DEAD_LETTERED', 'CANCELLED'] as const;
export type WebhookDeliveryStatus = (typeof deliveryStatuses)[number];

export const webhookDeliveryTransitions: Readonly<Record<WebhookDeliveryStatus, readonly WebhookDeliveryStatus[]>> = {
  PENDING: ['DELIVERING', 'CANCELLED'],
  DELIVERING: ['DELIVERED', 'RETRY_SCHEDULED', 'DEAD_LETTERED'],
  DELIVERED: [],
  RETRY_SCHEDULED: ['DELIVERING', 'DEAD_LETTERED', 'CANCELLED'],
  DEAD_LETTERED: ['RETRY_SCHEDULED', 'CANCELLED'],
  CANCELLED: [],
};

export type WebhookDelivery = OrganizationScopedResource<'webhook_delivery'> & {
  eventId: ResourceId<'webhook_event'>;
  endpointId: ResourceId<'webhook_endpoint'>;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  nextAttemptAt: Date | null;
  deliveredAt: Date | null;
  responseStatus: number | null;
  payloadSha256: string;
};

export type WebhookDeliveryDto = PublicResource<'webhook_delivery', 'webhook_delivery'> & {
  eventId: ResourceId<'webhook_event'>;
  endpointId: ResourceId<'webhook_endpoint'>;
  status: WebhookDeliveryStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  responseStatus: number | null;
  payloadSha256: string;
};

export const webhookDeliveryDtoSchema = schema<WebhookDeliveryDto>((value) => {
  const input = strictObject(value, 'webhookDelivery', ['id', 'object', 'schemaVersion', 'eventId', 'endpointId', 'status', 'attemptCount', 'nextAttemptAt', 'deliveredAt', 'responseStatus', 'payloadSha256', 'createdAt', 'updatedAt']);
  literalValue(input.object, 'webhookDelivery.object', 'webhook_delivery');
  literalValue(input.schemaVersion, 'webhookDelivery.schemaVersion', 1);
  return {
    id: parseResourceId('webhook_delivery', input.id, 'webhookDelivery.id'),
    object: 'webhook_delivery',
    schemaVersion: 1,
    eventId: parseResourceId('webhook_event', input.eventId, 'webhookDelivery.eventId'),
    endpointId: parseResourceId('webhook_endpoint', input.endpointId, 'webhookDelivery.endpointId'),
    status: enumValue(input.status, 'webhookDelivery.status', deliveryStatuses),
    attemptCount: integerValue(input.attemptCount, 'webhookDelivery.attemptCount', 0, 10_000),
    nextAttemptAt: optionalIsoDateTime(input.nextAttemptAt, 'webhookDelivery.nextAttemptAt'),
    deliveredAt: optionalIsoDateTime(input.deliveredAt, 'webhookDelivery.deliveredAt'),
    responseStatus: input.responseStatus === undefined || input.responseStatus === null ? null : integerValue(input.responseStatus, 'webhookDelivery.responseStatus', 100, 599),
    payloadSha256: sha256Value(input.payloadSha256, 'webhookDelivery.payloadSha256'),
    createdAt: isoDateTime(input.createdAt, 'webhookDelivery.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'webhookDelivery.updatedAt'),
  };
});

export type AuditEvent = OrganizationScopedResource<'audit_event'> & {
  type: string;
  actorType: 'USER' | 'MERCHANT_API_CLIENT' | 'SYSTEM' | 'EDGE_AGENT';
  actorId: string;
  resourceType: string;
  resourceId: string;
  requestId: string;
  previousEventSha256: string | null;
  eventSha256: string;
  metadata: JsonValue;
  occurredAt: Date;
};

export type AuditEventDto = PublicResource<'audit_event', 'audit_event'> & {
  type: string;
  actorType: AuditEvent['actorType'];
  actorId: string;
  resourceType: string;
  resourceId: string;
  requestId: string;
  previousEventSha256: string | null;
  eventSha256: string;
  metadata: JsonValue;
  occurredAt: string;
};

export const auditEventDtoSchema = schema<AuditEventDto>((value) => {
  const input = strictObject(value, 'auditEvent', ['id', 'object', 'schemaVersion', 'type', 'actorType', 'actorId', 'resourceType', 'resourceId', 'requestId', 'previousEventSha256', 'eventSha256', 'metadata', 'occurredAt', 'createdAt', 'updatedAt']);
  literalValue(input.object, 'auditEvent.object', 'audit_event');
  literalValue(input.schemaVersion, 'auditEvent.schemaVersion', 1);
  return {
    id: parseResourceId('audit_event', input.id, 'auditEvent.id'),
    object: 'audit_event',
    schemaVersion: 1,
    type: stringValue(input.type, 'auditEvent.type', { min: 3, max: 160, pattern: /^[A-Z][A-Z0-9_]+$/ }),
    actorType: enumValue(input.actorType, 'auditEvent.actorType', ['USER', 'MERCHANT_API_CLIENT', 'SYSTEM', 'EDGE_AGENT'] as const),
    actorId: stringValue(input.actorId, 'auditEvent.actorId', { min: 1, max: 200 }),
    resourceType: stringValue(input.resourceType, 'auditEvent.resourceType', { min: 1, max: 120, pattern: /^[a-z][a-z0-9_]+$/ }),
    resourceId: stringValue(input.resourceId, 'auditEvent.resourceId', { min: 8, max: 160 }),
    requestId: stringValue(input.requestId, 'auditEvent.requestId', { min: 8, max: 160 }),
    previousEventSha256: input.previousEventSha256 === undefined || input.previousEventSha256 === null ? null : sha256Value(input.previousEventSha256, 'auditEvent.previousEventSha256'),
    eventSha256: sha256Value(input.eventSha256, 'auditEvent.eventSha256'),
    metadata: jsonValue(input.metadata, 'auditEvent.metadata'),
    occurredAt: isoDateTime(input.occurredAt, 'auditEvent.occurredAt'),
    createdAt: isoDateTime(input.createdAt, 'auditEvent.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'auditEvent.updatedAt'),
  };
});
