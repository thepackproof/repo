import type { ResourceKind } from './common';

export type ResourceContract = {
  kind: ResourceKind;
  object: string;
  schemaVersion: 1;
  persistencePath: string;
  tenantBoundary: 'ORGANIZATION' | 'TRANSACTION_PARTICIPANTS' | 'USER' | 'SYSTEM';
  idempotency: string;
  auditEvents: readonly string[];
  sensitiveInternalFields: readonly string[];
};

export const resourceContracts: Readonly<Record<ResourceKind, ResourceContract>> = {
  organization: {
    kind: 'organization', object: 'organization', schemaVersion: 1, persistencePath: 'organizations/{organizationId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Administrator-created; organization slug/external reference uniqueness is enforced per environment.',
    auditEvents: ['ORGANIZATION_CREATED', 'ORGANIZATION_STATUS_CHANGED'], sensitiveInternalFields: ['billingProfile', 'administrativeNotes'],
  },
  integration: {
    kind: 'integration', object: 'integration', schemaVersion: 1, persistencePath: 'integrations/{integrationId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Installation/external-account binding is unique within an organization and platform.',
    auditEvents: ['INTEGRATION_CREATED', 'INTEGRATION_DISABLED', 'INTEGRATION_REVOKED'], sensitiveInternalFields: ['secretReference', 'oauthTokens', 'webhookSecret'],
  },
  api_client: {
    kind: 'api_client', object: 'api_client', schemaVersion: 1, persistencePath: 'apiClients/{apiClientId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Provisioning is keyed by organization, environment and requested client identifier.',
    auditEvents: ['API_CLIENT_CREATED', 'API_CLIENT_SCOPES_CHANGED', 'API_CLIENT_REVOKED', 'API_CREDENTIAL_ROTATED'], sensitiveInternalFields: ['credentialVerifier', 'credentialId', 'pepperVersion'],
  },
  commerce_context: {
    kind: 'commerce_context', object: 'commerce_context', schemaVersion: 1, persistencePath: 'commerceContexts/{commerceContextId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Bound to organization, integration, operation key and canonical source fingerprint; changed input conflicts or creates an explicit superseding version.',
    auditEvents: ['COMMERCE_CONTEXT_CREATED', 'COMMERCE_HANDOFF_ISSUED', 'COMMERCE_CONTEXT_CLAIMED', 'COMMERCE_CONTEXT_ORDER_BOUND', 'COMMERCE_CONTEXT_REVOKED'], sensitiveInternalFields: ['rawProviderPayload', 'handoffTokenHash', 'buyerContactReference'],
  },
  passport_draft: {
    kind: 'passport_draft', object: 'passport_draft', schemaVersion: 1, persistencePath: 'passportDrafts/{passportDraftId}', tenantBoundary: 'TRANSACTION_PARTICIPANTS',
    idempotency: 'One active draft per commerce-context handoff identity; review edits use optimistic version checks.',
    auditEvents: ['PASSPORT_DRAFT_CREATED', 'PASSPORT_DRAFT_UPDATED', 'PASSPORT_DRAFT_BOUND', 'PASSPORT_DRAFT_CANCELLED'], sensitiveInternalFields: ['editorActorIds'],
  },
  transaction: {
    kind: 'transaction', object: 'transaction', schemaVersion: 1, persistencePath: 'transactions/{transactionId}', tenantBoundary: 'TRANSACTION_PARTICIPANTS',
    idempotency: 'Creation uses a stable operation ID and canonical request fingerprint; state commands use command IDs and expected version.',
    auditEvents: ['TRANSACTION_CREATED', 'TRANSACTION_TERMS_REVIEWED', 'TRANSACTION_TERMS_LOCKED', 'TRANSACTION_COMPLETED', 'TRANSACTION_DISPUTED', 'TRANSACTION_CANCELLED'], sensitiveInternalFields: ['participantActorIds', 'activeInviteHash', 'moderationState'],
  },
  participant_claim: {
    kind: 'participant_claim', object: 'participant_claim', schemaVersion: 1, persistencePath: 'participantClaims/{claimId}', tenantBoundary: 'TRANSACTION_PARTICIPANTS',
    idempotency: 'One claim per transaction, role and external-reference hash; token redemption is one-time.',
    auditEvents: ['PARTICIPANT_CLAIM_ISSUED', 'PARTICIPANT_CLAIMED', 'PARTICIPANT_CLAIM_EXPIRED', 'PARTICIPANT_CLAIM_REVOKED'], sensitiveInternalFields: ['tokenHash', 'externalReferenceHash', 'claimedActorId'],
  },
  evidence_session: {
    kind: 'evidence_session', object: 'evidence_session', schemaVersion: 1, persistencePath: 'evidenceSessions/{evidenceSessionId}', tenantBoundary: 'TRANSACTION_PARTICIPANTS',
    idempotency: 'Creation is bound to transaction, purpose, actor, capture profile and command key; redemption is bounded and one-time where specified.',
    auditEvents: ['EVIDENCE_SESSION_CREATED', 'EVIDENCE_SESSION_STARTED', 'EVIDENCE_SESSION_CAPTURED', 'EVIDENCE_SESSION_FINALIZED', 'EVIDENCE_SESSION_FAILED'], sensitiveInternalFields: ['actorId', 'nonceHash', 'redemptionTokenHash', 'appCheckContext'],
  },
  evidence_artifact: {
    kind: 'evidence_artifact', object: 'evidence_artifact', schemaVersion: 1, persistencePath: 'transactions/{transactionId}/evidence/{artifactId}', tenantBoundary: 'TRANSACTION_PARTICIPANTS',
    idempotency: 'Deterministic from transaction, uploader and retry-stable client evidence identity; request fingerprint cannot change after first reservation.',
    auditEvents: ['EVIDENCE_ARTIFACT_RESERVED', 'EVIDENCE_ARTIFACT_UPLOADED', 'EVIDENCE_ARTIFACT_FINALIZED', 'EVIDENCE_ARTIFACT_QUARANTINED'], sensitiveInternalFields: ['storagePath', 'uploaderId', 'ingressNetworkSignal', 'rawTelemetry'],
  },
  evidence_manifest: {
    kind: 'evidence_manifest', object: 'evidence_manifest', schemaVersion: 1, persistencePath: 'manifests/{transactionId}/{manifestId}', tenantBoundary: 'TRANSACTION_PARTICIPANTS',
    idempotency: 'Manifest bytes are deterministic for immutable finalizer inputs; duplicate trigger delivery reproduces the same digests and authentication.',
    auditEvents: ['EVIDENCE_MANIFEST_FINALIZED', 'EVIDENCE_MANIFEST_AUTHENTICATED'], sensitiveInternalFields: ['serviceSigningSecret', 'privateSigningKey'],
  },
  shipment: {
    kind: 'shipment', object: 'shipment', schemaVersion: 1, persistencePath: 'transactions/{transactionId}/shipments/{shipmentId}', tenantBoundary: 'TRANSACTION_PARTICIPANTS',
    idempotency: 'Carrier/tracking association is unique per transaction and normalized tracking identity; changes create explicit audit events.',
    auditEvents: ['SHIPMENT_ASSOCIATED', 'SHIPMENT_STATUS_CHANGED', 'TRACKING_OBSERVED'], sensitiveInternalFields: ['carrierRawResponse', 'recipientAddress'],
  },
  return_passport: {
    kind: 'return_passport', object: 'return_passport', schemaVersion: 1, persistencePath: 'transactions/{transactionId}/returns/{returnPassportId}', tenantBoundary: 'TRANSACTION_PARTICIPANTS',
    idempotency: 'Return request command key prevents duplicate active return creation; later transitions use expected version.',
    auditEvents: ['RETURN_REQUESTED', 'RETURN_AUTHORIZED', 'RETURN_SHIPPED', 'RETURN_RECEIVED', 'RETURN_COMPLETED'], sensitiveInternalFields: ['requestedByActorId', 'returningActorId', 'recipientActorId'],
  },
  evidence_report: {
    kind: 'evidence_report', object: 'evidence_report', schemaVersion: 1, persistencePath: 'transactions/{transactionId}/reports/{reportId}', tenantBoundary: 'TRANSACTION_PARTICIPANTS',
    idempotency: 'Report identity is bound to transaction, source manifest set, template version and locale; identical inputs reuse the report.',
    auditEvents: ['EVIDENCE_REPORT_REQUESTED', 'EVIDENCE_REPORT_AVAILABLE', 'EVIDENCE_REPORT_VIEWED'], sensitiveInternalFields: ['storagePath', 'signedUrl', 'viewerIdentity'],
  },
  webhook_endpoint: {
    kind: 'webhook_endpoint', object: 'webhook_endpoint', schemaVersion: 1, persistencePath: 'organizations/{organizationId}/webhookEndpoints/{endpointId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Endpoint registration is keyed by organization and normalized URL; secret rotation is a separate command.',
    auditEvents: ['WEBHOOK_ENDPOINT_CREATED', 'WEBHOOK_ENDPOINT_DISABLED', 'WEBHOOK_SECRET_ROTATED'], sensitiveInternalFields: ['signingSecretReference', 'previousSecretReference'],
  },
  webhook_event: {
    kind: 'webhook_event', object: 'webhook_event', schemaVersion: 1, persistencePath: 'webhookEvents/{eventId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Stable event ID derives from the committed domain event; one event fans out to subscribed endpoint deliveries.',
    auditEvents: ['WEBHOOK_EVENT_CREATED'], sensitiveInternalFields: ['internalTrace'],
  },
  webhook_delivery: {
    kind: 'webhook_delivery', object: 'webhook_delivery', schemaVersion: 1, persistencePath: 'webhookDeliveries/{deliveryId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'One delivery per event and endpoint; attempts reuse the delivery ID and exact logical payload identity.',
    auditEvents: ['WEBHOOK_DELIVERY_ATTEMPTED', 'WEBHOOK_DELIVERED', 'WEBHOOK_DEAD_LETTERED', 'WEBHOOK_REPLAYED'], sensitiveInternalFields: ['leaseOwner', 'responseBody', 'requestHeaders'],
  },
  audit_event: {
    kind: 'audit_event', object: 'audit_event', schemaVersion: 1, persistencePath: 'organizations/{organizationId}/auditEvents/{auditEventId}', tenantBoundary: 'ORGANIZATION',
    idempotency: 'Stable audit event ID per committed command/domain event; duplicate append is rejected or returns the existing hash-linked event.',
    auditEvents: ['AUDIT_EVENT_APPENDED'], sensitiveInternalFields: ['rawNetworkAddress', 'secrets', 'rawMedia'],
  },
};

export function assertResourceContractCatalogComplete(): void {
  const entries = Object.entries(resourceContracts);
  if (entries.length !== 17) throw new Error(`Expected 17 resource contracts; received ${entries.length}.`);
  for (const [key, contract] of entries) {
    if (contract.kind !== key || contract.schemaVersion !== 1 || !contract.auditEvents.length || !contract.persistencePath) {
      throw new Error(`Resource contract ${key} is incomplete.`);
    }
  }
}
