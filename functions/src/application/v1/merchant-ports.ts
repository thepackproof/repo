import type { ApplicationEvent } from './events';
import type {
  ApiEnvironment,
  ListMerchantTransactionsInput,
  MerchantPrincipal,
  MerchantTransaction,
  MerchantTransactionDto,
  MerchantTransactionPage,
} from './merchant-types';

export type IdempotencyContext = {
  principalId: string;
  operation: string;
  key: string;
  requestFingerprint: string;
};

export type IdempotencyExecution<T> = {
  value: T;
  replayed: boolean;
  operationId: string;
};

export interface IdempotencyStore {
  execute<T extends object>(
    context: IdempotencyContext,
    operation: (operationId: string) => Promise<T>,
  ): Promise<IdempotencyExecution<T>>;
}

export interface MerchantTransactionRepository {
  create(transaction: MerchantTransaction, event: ApplicationEvent): Promise<MerchantTransaction>;
  findByIdForOrganization(id: string, organizationId: string): Promise<MerchantTransaction | null>;
  listForOrganization(organizationId: string, input: ListMerchantTransactionsInput): Promise<MerchantTransactionPage>;
}

export type MerchantAuditEventInput = {
  eventId: string;
  organizationId: string;
  type: string;
  actor: MerchantPrincipal;
  resourceType: string;
  resourceId: string;
  requestId: string;
  metadata: Record<string, unknown>;
};

export interface MerchantAuditWriter {
  append(event: MerchantAuditEventInput): Promise<void>;
}

export type CreateMerchantTransactionResult = {
  transaction: MerchantTransactionDto;
  captureInstructions: {
    state: 'NOT_ISSUED';
    reason: 'CAPTURE_SESSION_REQUIRED';
  };
  replayed: boolean;
};

export type ApiRuntimeConfig = {
  environment: ApiEnvironment;
};
