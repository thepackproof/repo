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

export class PackProofConnectError extends Error {
  status: number;
  code: string;
  details: unknown;
}

export class PackProofConnect {
  constructor(options: { apiKey: string; baseUrl: string; fetchImpl?: typeof fetch });
  createEvidenceSession(input: CreateVerificationInput, options?: { signal?: AbortSignal }): Promise<CreateVerificationResponse>;
  /** @deprecated Use createEvidenceSession; the handoff returns structured evidence, not a physical-authenticity verdict. */
  createVerification(input: CreateVerificationInput, options?: { signal?: AbortSignal }): Promise<CreateVerificationResponse>;
}

export type EvidenceFinalizedCallback = {
  event: 'packproof.evidence.finalized';
  orderId: string;
  trackingNumber: string | null;
  evidenceStatus: 'DIGITAL_EVIDENCE_READY' | 'DIGITAL_EVIDENCE_WITH_LIMITATIONS';
  statusReasonCodes: string[];
  fileSha256: string;
  /** Compatibility alias for fileSha256. */
  sha256Hash: string;
  manifestSha256: string;
  evidenceBundleSha256: string;
  manifestAuthentication: {
    type: 'SERVICE_MAC';
    algorithm: 'HMAC-SHA256';
    keyId: string;
    macBase64url: string;
    verificationScope: 'PACKPROOF_SERVICE_ONLY';
  };
  assurance: Record<string, unknown>;
  attestationStatus: string;
  carrierTrackingMatchStatus: string;
  declaredWeightGrams: number | null;
  dossierUrl: string;
  dossierUrlExpiresAt: string;
  dossierSha256: string;
  timestamp: string;
};

export function verifyPackProofWebhook(input: {
  rawBody: string | Buffer;
  timestamp: string;
  signature: string;
  secret: string;
  toleranceSeconds?: number;
  now?: number;
}): boolean;
