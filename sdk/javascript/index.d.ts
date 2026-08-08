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
  createVerification(input: CreateVerificationInput, options?: { signal?: AbortSignal }): Promise<CreateVerificationResponse>;
}

export function verifyPackProofWebhook(input: {
  rawBody: string | Buffer;
  timestamp: string;
  signature: string;
  secret: string;
  toleranceSeconds?: number;
  now?: number;
}): boolean;
