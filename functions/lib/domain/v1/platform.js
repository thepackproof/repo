"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auditEventDtoSchema = exports.webhookDeliveryDtoSchema = exports.webhookDeliveryTransitions = exports.deliveryStatuses = exports.webhookEventDtoSchema = exports.webhookEndpointDtoSchema = exports.evidenceReportDtoSchema = exports.reportStatuses = exports.apiClientDtoSchema = exports.canonicalApiScopes = exports.integrationDtoSchema = exports.integrationStatuses = exports.integrationTypes = exports.organizationDtoSchema = exports.organizationStatuses = void 0;
const common_1 = require("./common");
const evidence_1 = require("./evidence");
const runtime_1 = require("./runtime");
exports.organizationStatuses = ['ACTIVE', 'SUSPENDED', 'CLOSED'];
exports.organizationDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'organization', ['id', 'object', 'schemaVersion', 'name', 'environment', 'status', 'createdAt', 'updatedAt']);
    (0, runtime_1.literalValue)(input.object, 'organization.object', 'organization');
    (0, runtime_1.literalValue)(input.schemaVersion, 'organization.schemaVersion', 1);
    return {
        id: (0, common_1.parseResourceId)('organization', input.id, 'organization.id'),
        object: 'organization',
        schemaVersion: 1,
        name: (0, runtime_1.stringValue)(input.name, 'organization.name', { min: 1, max: 200 }),
        environment: (0, runtime_1.enumValue)(input.environment, 'organization.environment', ['sandbox', 'live']),
        status: (0, runtime_1.enumValue)(input.status, 'organization.status', exports.organizationStatuses),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'organization.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'organization.updatedAt'),
    };
});
exports.integrationTypes = ['SHOPIFY', 'WOOCOMMERCE', 'MAGENTO', 'CUSTOM_CHECKOUT', 'MARKETPLACE', 'PACKPROOF_CONNECT'];
exports.integrationStatuses = ['ACTIVE', 'DISABLED', 'REVOKED'];
exports.integrationDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'integration', ['id', 'object', 'schemaVersion', 'name', 'type', 'environment', 'status', 'allowedOrigins', 'externalAccountReference', 'createdAt', 'updatedAt']);
    (0, runtime_1.literalValue)(input.object, 'integration.object', 'integration');
    (0, runtime_1.literalValue)(input.schemaVersion, 'integration.schemaVersion', 1);
    return {
        id: (0, common_1.parseResourceId)('integration', input.id, 'integration.id'),
        object: 'integration',
        schemaVersion: 1,
        name: (0, runtime_1.stringValue)(input.name, 'integration.name', { min: 1, max: 200 }),
        type: (0, runtime_1.enumValue)(input.type, 'integration.type', exports.integrationTypes),
        environment: (0, runtime_1.enumValue)(input.environment, 'integration.environment', ['sandbox', 'live']),
        status: (0, runtime_1.enumValue)(input.status, 'integration.status', exports.integrationStatuses),
        allowedOrigins: (0, runtime_1.arrayValue)(input.allowedOrigins, 'integration.allowedOrigins', { max: 100, parse: (origin, path) => {
                const parsed = (0, runtime_1.urlValue)(origin, path);
                const url = new URL(parsed);
                return `${url.protocol}//${url.host}`;
            }, uniqueBy: (origin) => origin }),
        externalAccountReference: (0, runtime_1.optionalString)(input.externalAccountReference, 'integration.externalAccountReference', { min: 1, max: 300 }),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'integration.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'integration.updatedAt'),
    };
});
exports.canonicalApiScopes = [
    'commerce_contexts:read', 'commerce_contexts:write', 'transactions:read', 'transactions:write', 'participant_claims:write',
    'evidence:read', 'evidence:write', 'shipments:read', 'shipments:write', 'returns:read', 'returns:write',
    'reports:read', 'webhooks:read', 'webhooks:write', 'support:read', 'support:write', 'admin:organization',
];
exports.apiClientDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'apiClient', ['id', 'object', 'schemaVersion', 'name', 'integrationId', 'environment', 'status', 'scopes', 'createdAt', 'updatedAt']);
    (0, runtime_1.literalValue)(input.object, 'apiClient.object', 'api_client');
    (0, runtime_1.literalValue)(input.schemaVersion, 'apiClient.schemaVersion', 1);
    return {
        id: (0, common_1.parseResourceId)('api_client', input.id, 'apiClient.id'),
        object: 'api_client',
        schemaVersion: 1,
        name: (0, runtime_1.stringValue)(input.name, 'apiClient.name', { min: 1, max: 200 }),
        integrationId: input.integrationId === undefined || input.integrationId === null ? null : (0, common_1.parseResourceId)('integration', input.integrationId, 'apiClient.integrationId'),
        environment: (0, runtime_1.enumValue)(input.environment, 'apiClient.environment', ['sandbox', 'live']),
        status: (0, runtime_1.enumValue)(input.status, 'apiClient.status', ['ACTIVE', 'REVOKED']),
        scopes: (0, runtime_1.arrayValue)(input.scopes, 'apiClient.scopes', { min: 1, max: exports.canonicalApiScopes.length, parse: (scope, path) => (0, runtime_1.enumValue)(scope, path, exports.canonicalApiScopes), uniqueBy: (scope) => scope }),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'apiClient.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'apiClient.updatedAt'),
    };
});
exports.reportStatuses = ['PENDING', 'AVAILABLE', 'FAILED'];
exports.evidenceReportDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'evidenceReport', ['id', 'object', 'schemaVersion', 'transactionId', 'status', 'evidenceSessionIds', 'assurance', 'reportSha256', 'generatedAt', 'createdAt', 'updatedAt']);
    (0, runtime_1.literalValue)(input.object, 'evidenceReport.object', 'evidence_report');
    (0, runtime_1.literalValue)(input.schemaVersion, 'evidenceReport.schemaVersion', 1);
    return {
        id: (0, common_1.parseResourceId)('evidence_report', input.id, 'evidenceReport.id'),
        object: 'evidence_report',
        schemaVersion: 1,
        transactionId: (0, common_1.parseResourceId)('transaction', input.transactionId, 'evidenceReport.transactionId', { allowLegacy: true }),
        status: (0, runtime_1.enumValue)(input.status, 'evidenceReport.status', exports.reportStatuses),
        evidenceSessionIds: (0, runtime_1.arrayValue)(input.evidenceSessionIds, 'evidenceReport.evidenceSessionIds', { max: 1000, parse: (id, path) => (0, common_1.parseResourceId)('evidence_session', id, path), uniqueBy: (id) => id }),
        assurance: (0, evidence_1.parseAssurance)(input.assurance, 'evidenceReport.assurance'),
        reportSha256: input.reportSha256 === undefined || input.reportSha256 === null ? null : (0, runtime_1.sha256Value)(input.reportSha256, 'evidenceReport.reportSha256'),
        generatedAt: (0, runtime_1.optionalIsoDateTime)(input.generatedAt, 'evidenceReport.generatedAt'),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'evidenceReport.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'evidenceReport.updatedAt'),
    };
});
exports.webhookEndpointDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'webhookEndpoint', ['id', 'object', 'schemaVersion', 'url', 'status', 'subscribedEvents', 'createdAt', 'updatedAt']);
    (0, runtime_1.literalValue)(input.object, 'webhookEndpoint.object', 'webhook_endpoint');
    (0, runtime_1.literalValue)(input.schemaVersion, 'webhookEndpoint.schemaVersion', 1);
    return {
        id: (0, common_1.parseResourceId)('webhook_endpoint', input.id, 'webhookEndpoint.id'),
        object: 'webhook_endpoint',
        schemaVersion: 1,
        url: (0, runtime_1.urlValue)(input.url, 'webhookEndpoint.url'),
        status: (0, runtime_1.enumValue)(input.status, 'webhookEndpoint.status', ['ACTIVE', 'DISABLED']),
        subscribedEvents: (0, runtime_1.arrayValue)(input.subscribedEvents, 'webhookEndpoint.subscribedEvents', { min: 1, max: 100, parse: (event, path) => (0, runtime_1.stringValue)(event, path, { min: 3, max: 160, pattern: /^[a-z][a-z0-9_.]+$/ }), uniqueBy: (event) => event }),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'webhookEndpoint.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'webhookEndpoint.updatedAt'),
    };
});
exports.webhookEventDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'webhookEvent', ['id', 'object', 'schemaVersion', 'type', 'resourceType', 'resourceId', 'data', 'occurredAt', 'createdAt', 'updatedAt']);
    (0, runtime_1.literalValue)(input.object, 'webhookEvent.object', 'webhook_event');
    (0, runtime_1.literalValue)(input.schemaVersion, 'webhookEvent.schemaVersion', 1);
    return {
        id: (0, common_1.parseResourceId)('webhook_event', input.id, 'webhookEvent.id'),
        object: 'webhook_event',
        schemaVersion: 1,
        type: (0, runtime_1.stringValue)(input.type, 'webhookEvent.type', { min: 3, max: 160, pattern: /^[a-z][a-z0-9_.]+$/ }),
        resourceType: (0, runtime_1.stringValue)(input.resourceType, 'webhookEvent.resourceType', { min: 1, max: 120, pattern: /^[a-z][a-z0-9_]+$/ }),
        resourceId: (0, runtime_1.stringValue)(input.resourceId, 'webhookEvent.resourceId', { min: 8, max: 160 }),
        data: (0, runtime_1.jsonValue)(input.data, 'webhookEvent.data'),
        occurredAt: (0, runtime_1.isoDateTime)(input.occurredAt, 'webhookEvent.occurredAt'),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'webhookEvent.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'webhookEvent.updatedAt'),
    };
});
exports.deliveryStatuses = ['PENDING', 'DELIVERING', 'DELIVERED', 'RETRY_SCHEDULED', 'DEAD_LETTERED', 'CANCELLED'];
exports.webhookDeliveryTransitions = {
    PENDING: ['DELIVERING', 'CANCELLED'],
    DELIVERING: ['DELIVERED', 'RETRY_SCHEDULED', 'DEAD_LETTERED'],
    DELIVERED: [],
    RETRY_SCHEDULED: ['DELIVERING', 'DEAD_LETTERED', 'CANCELLED'],
    DEAD_LETTERED: ['RETRY_SCHEDULED', 'CANCELLED'],
    CANCELLED: [],
};
exports.webhookDeliveryDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'webhookDelivery', ['id', 'object', 'schemaVersion', 'eventId', 'endpointId', 'status', 'attemptCount', 'nextAttemptAt', 'deliveredAt', 'responseStatus', 'payloadSha256', 'createdAt', 'updatedAt']);
    (0, runtime_1.literalValue)(input.object, 'webhookDelivery.object', 'webhook_delivery');
    (0, runtime_1.literalValue)(input.schemaVersion, 'webhookDelivery.schemaVersion', 1);
    return {
        id: (0, common_1.parseResourceId)('webhook_delivery', input.id, 'webhookDelivery.id'),
        object: 'webhook_delivery',
        schemaVersion: 1,
        eventId: (0, common_1.parseResourceId)('webhook_event', input.eventId, 'webhookDelivery.eventId'),
        endpointId: (0, common_1.parseResourceId)('webhook_endpoint', input.endpointId, 'webhookDelivery.endpointId'),
        status: (0, runtime_1.enumValue)(input.status, 'webhookDelivery.status', exports.deliveryStatuses),
        attemptCount: (0, runtime_1.integerValue)(input.attemptCount, 'webhookDelivery.attemptCount', 0, 10_000),
        nextAttemptAt: (0, runtime_1.optionalIsoDateTime)(input.nextAttemptAt, 'webhookDelivery.nextAttemptAt'),
        deliveredAt: (0, runtime_1.optionalIsoDateTime)(input.deliveredAt, 'webhookDelivery.deliveredAt'),
        responseStatus: input.responseStatus === undefined || input.responseStatus === null ? null : (0, runtime_1.integerValue)(input.responseStatus, 'webhookDelivery.responseStatus', 100, 599),
        payloadSha256: (0, runtime_1.sha256Value)(input.payloadSha256, 'webhookDelivery.payloadSha256'),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'webhookDelivery.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'webhookDelivery.updatedAt'),
    };
});
exports.auditEventDtoSchema = (0, runtime_1.schema)((value) => {
    const input = (0, runtime_1.strictObject)(value, 'auditEvent', ['id', 'object', 'schemaVersion', 'type', 'actorType', 'actorId', 'resourceType', 'resourceId', 'requestId', 'previousEventSha256', 'eventSha256', 'metadata', 'occurredAt', 'createdAt', 'updatedAt']);
    (0, runtime_1.literalValue)(input.object, 'auditEvent.object', 'audit_event');
    (0, runtime_1.literalValue)(input.schemaVersion, 'auditEvent.schemaVersion', 1);
    return {
        id: (0, common_1.parseResourceId)('audit_event', input.id, 'auditEvent.id'),
        object: 'audit_event',
        schemaVersion: 1,
        type: (0, runtime_1.stringValue)(input.type, 'auditEvent.type', { min: 3, max: 160, pattern: /^[A-Z][A-Z0-9_]+$/ }),
        actorType: (0, runtime_1.enumValue)(input.actorType, 'auditEvent.actorType', ['USER', 'MERCHANT_API_CLIENT', 'SYSTEM', 'EDGE_AGENT']),
        actorId: (0, runtime_1.stringValue)(input.actorId, 'auditEvent.actorId', { min: 1, max: 200 }),
        resourceType: (0, runtime_1.stringValue)(input.resourceType, 'auditEvent.resourceType', { min: 1, max: 120, pattern: /^[a-z][a-z0-9_]+$/ }),
        resourceId: (0, runtime_1.stringValue)(input.resourceId, 'auditEvent.resourceId', { min: 8, max: 160 }),
        requestId: (0, runtime_1.stringValue)(input.requestId, 'auditEvent.requestId', { min: 8, max: 160 }),
        previousEventSha256: input.previousEventSha256 === undefined || input.previousEventSha256 === null ? null : (0, runtime_1.sha256Value)(input.previousEventSha256, 'auditEvent.previousEventSha256'),
        eventSha256: (0, runtime_1.sha256Value)(input.eventSha256, 'auditEvent.eventSha256'),
        metadata: (0, runtime_1.jsonValue)(input.metadata, 'auditEvent.metadata'),
        occurredAt: (0, runtime_1.isoDateTime)(input.occurredAt, 'auditEvent.occurredAt'),
        createdAt: (0, runtime_1.isoDateTime)(input.createdAt, 'auditEvent.createdAt'),
        updatedAt: (0, runtime_1.isoDateTime)(input.updatedAt, 'auditEvent.updatedAt'),
    };
});
//# sourceMappingURL=platform.js.map