import type { MerchantPrincipal } from '../../application/v1/merchant-types';

export type {
  ApiRuntimeConfig,
  CreateMerchantTransactionResult as CreateTransactionResult,
  IdempotencyContext,
  IdempotencyExecution,
  IdempotencyFence,
  IdempotencyStore,
  MerchantAuditEventInput as AuditEventInput,
  MerchantAuditWriter as AuditWriter,
  MerchantTransactionRepository as TransactionRepository,
} from '../../application/v1/merchant-ports';

export interface MerchantAuthenticator {
  authenticate(authorization: string | undefined): Promise<MerchantPrincipal>;
}

export type RateLimitPolicy = {
  name: string;
  limit: number;
  windowSeconds: number;
};

export type RateLimitDecision = {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: Date;
};

export interface RateLimiter {
  consume(principalId: string, policy: RateLimitPolicy): Promise<RateLimitDecision>;
}

export interface ReadinessChecker {
  check(): Promise<void>;
}
