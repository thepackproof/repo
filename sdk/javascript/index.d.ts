export type Amount = {
  currency: string;
  minorUnits: number;
};

export type CreateVerificationInput = {
  platform: string;
  orderId: string;
  sellerId: string;
  trackingNumber?: string;
  carrier?: string;
  itemTitle: string;
  itemDescription?: string;
  declaredWeightGrams?: number;
  priceMinor?: number;
  currency?: string;
  callbackUrl: string;
  idempotencyKey: string;
};

export type CreateVerificationResponse = {
  success: true;
  sessionId: string;
  verificationUrl: string;
  expiresAt: string;
  idempotentReplay?: boolean;
};

export type ConnectSessionStatus = 'PENDING_REDEMPTION' | 'READY_FOR_CAPTURE' | 'CANCELLED' | 'EXPIRED';

export type ConnectSession = {
  id: string;
  object: 'connect_session';
  schemaVersion: 1;
  platform: string;
  externalOrderId: string;
  status: ConnectSessionStatus;
  transactionId: string | null;
  commerceContextId: string | null;
  itemTitle: string;
  amount: Amount;
  trackingNumber: string | null;
  carrier: string | null;
  expiresAt: string;
  createdAt: string;
};

export type CreateConnectSessionInput = {
  platform: string;
  externalOrderId: string;
  externalSellerId: string;
  itemTitle: string;
  itemDescription?: string;
  amount: Amount;
  trackingNumber?: string;
  carrier?: string;
  declaredWeightGrams?: number;
  callbackUrl: string;
  idempotencyKey?: string;
};

export type CreateConnectSessionResponse = {
  data: ConnectSession;
  captureInstructions: {
    state: 'PENDING_REDEMPTION';
    captureUrl: string;
    token: string;
    expiresAt: string;
  };
};

export type ConnectSessionResponse = {
  data: ConnectSession;
};

export type ConnectSessionListResponse = {
  data: ConnectSession[];
};

export type EvidenceFinalizedCallback = {
  event: 'packproof.evidence.finalized';
  orderId: string;
  trackingNumber: string | null;
  evidenceStatus: 'DIGITAL_EVIDENCE_READY' | 'DIGITAL_EVIDENCE_WITH_LIMITATIONS';
  statusReasonCodes: string[];
  fileSha256: string;
  /** Compatibility alias for fileSha256. */
  sha256Hash: string;
  manifestSha256: string | null;
  evidenceBundleSha256: string | null;
  manifestAuthentication: {
    type: 'SERVICE_MAC' | 'LEGACY_SERVICE_MAC';
    algorithm?: 'HMAC-SHA256';
    keyId?: string;
    macBase64url: string | null;
    verificationScope: 'PACKPROOF_SERVICE_ONLY';
  };
  assurance: Record<string, unknown> | null;
  attestationStatus: string;
  carrierTrackingMatchStatus: string;
  shippingTracker?: {
    lookupStatus: 'DATASET_VALIDATED' | 'UNRECOGNIZED' | 'LOOKUP_INCOMPLETE';
    courierCode: string | null;
    courierName: string | null;
    publicTrackingUrl: string | null;
    stillSha256: string | null;
    stillCaptureStatus: 'CAPTURED' | 'FAILED' | 'UNAVAILABLE_WHILE_RECORDING' | 'NOT_ATTEMPTED' | null;
    observationSha256: string;
    clientObservationSha256: string | null;
    hashMatched: boolean | null;
    interpretation: 'OPEN_SOURCE_TRACKING_NUMBER_VALIDATION_NOT_CARRIER_CUSTODY';
  } | null;
  declaredWeightGrams: number | null;
  dossierUrl: string;
  dossierUrlExpiresAt: string;
  dossierSha256: string;
  timestamp: string;
};

export type WebhookVerifyInput = {
  rawBody: string | Buffer;
  timestamp: string;
  signature: string;
  secret: string;
  toleranceSeconds?: number;
  now?: number;
};

export class PackProofConnectError extends Error {
  status: number;
  code: string;
  details: unknown;
  constructor(message: string, options?: { status?: number; code?: string; details?: unknown });
}

export class PackProofConnect {
  constructor(options: { apiKey: string; baseUrl: string; fetchImpl?: typeof fetch });
  createEvidenceSession(input: CreateVerificationInput, options?: { signal?: AbortSignal }): Promise<CreateVerificationResponse>;
  /** @deprecated Use createEvidenceSession; the handoff returns structured evidence, not a physical-authenticity verdict. */
  createVerification(input: CreateVerificationInput, options?: { signal?: AbortSignal }): Promise<CreateVerificationResponse>;
  createConnectSession(input: CreateConnectSessionInput, options?: { idempotencyKey?: string; signal?: AbortSignal }): Promise<CreateConnectSessionResponse>;
  getConnectSession(sessionId: string, options?: { signal?: AbortSignal }): Promise<ConnectSessionResponse>;
  listConnectSessions(externalOrderId: string, options?: { signal?: AbortSignal }): Promise<ConnectSessionListResponse>;
  cancelConnectSession(sessionId: string, options?: { signal?: AbortSignal }): Promise<ConnectSessionResponse>;
  listEvidence(transactionId: string, options?: { signal?: AbortSignal }): Promise<{ data: unknown[] }>;
  getEvidence(transactionId: string, artifactId: string, options?: { signal?: AbortSignal }): Promise<{ data: unknown }>;
  getReviewPackage(transactionId: string, options?: { signal?: AbortSignal }): Promise<{ data: unknown }>;
  createEvidenceReport(transactionId: string, options: { idempotencyKey: string; signal?: AbortSignal }): Promise<{ data: unknown }>;
  getEvidenceReport(transactionId: string, reportId: string, options?: { signal?: AbortSignal }): Promise<{ data: unknown }>;
  getTimeline(transactionId: string, options?: { signal?: AbortSignal }): Promise<{ data: unknown[] }>;
  associateShipment(transactionId: string, input: { carrier: string; trackingNumber: string }, options: { idempotencyKey: string; signal?: AbortSignal }): Promise<{ data: unknown }>;
  getShipment(transactionId: string, options?: { signal?: AbortSignal }): Promise<{ data: unknown }>;
  listReturns(transactionId: string, options?: { signal?: AbortSignal }): Promise<{ data: unknown[] }>;
  createReturn(transactionId: string, input: { reason: string }, options: { idempotencyKey: string; signal?: AbortSignal }): Promise<{ data: unknown }>;
  getReturn(transactionId: string, returnPassportId: string, options?: { signal?: AbortSignal }): Promise<{ data: unknown }>;
  associateReturnShipment(transactionId: string, returnPassportId: string, input: { carrier: string; trackingNumber: string }, options: { idempotencyKey: string; signal?: AbortSignal }): Promise<{ data: unknown }>;
  getDelivery(transactionId: string, options?: { signal?: AbortSignal }): Promise<{ data: unknown }>;
  associateDelivery(transactionId: string, input: { carrier?: string; trackingNumber?: string }, options: { idempotencyKey: string; signal?: AbortSignal }): Promise<{ data: unknown }>;
}

export function verifyPackProofWebhook(input: WebhookVerifyInput): boolean;
export function parsePackProofWebhook(input: WebhookVerifyInput): EvidenceFinalizedCallback;
