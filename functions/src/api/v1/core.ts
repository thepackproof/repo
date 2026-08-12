import { canonicalize, sha256 } from '../../application/v1/merchant-transaction-service';
import type { ListMerchantTransactionsInput } from '../../application/v1/merchant-types';

export { canonicalize, createTransactionId, sha256, toMerchantTransactionDto as toTransactionDto } from '../../application/v1/merchant-transaction-service';
export { apiScopes, captureArtifactTypes, merchantTransactionStatuses } from '../../application/v1/merchant-types';
export type {
  ApiEnvironment,
  ApiScope,
  CaptureArtifactType,
  CreateMerchantTransactionInput as CreateTransactionInput,
  ListMerchantTransactionsInput as ListTransactionsInput,
  MerchantParticipantReference as ParticipantReference,
  MerchantParticipantRole as ParticipantRole,
  MerchantPrincipal,
  MerchantTransaction,
  MerchantTransactionDto as TransactionDto,
  MerchantTransactionPage as TransactionPage,
  MerchantTransactionStatus,
} from '../../application/v1/merchant-types';

export type ApiErrorDetail = {
  field?: string;
  code: string;
  message: string;
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: readonly ApiErrorDetail[];
  readonly headers: Readonly<Record<string, string>>;

  constructor(
    status: number,
    code: string,
    message: string,
    details: readonly ApiErrorDetail[] = [],
    headers: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.headers = headers;
  }
}

export class InputValidationError extends ApiError {
  constructor(details: readonly ApiErrorDetail[]) {
    super(400, 'INVALID_REQUEST', 'The request did not satisfy the API contract.', details);
    this.name = 'InputValidationError';
  }
}

type CursorPayload = {
  v: 1;
  createdAt: string;
  id: string;
  queryHash: string;
};

export function encodeTransactionCursor(payload: Omit<CursorPayload, 'v'>): string {
  return Buffer.from(JSON.stringify({ v: 1, ...payload }), 'utf8').toString('base64url');
}

export function decodeTransactionCursor(cursor: string): CursorPayload {
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Partial<CursorPayload>;
    if (value.v !== 1 || typeof value.createdAt !== 'string' || !Number.isFinite(Date.parse(value.createdAt))
      || typeof value.id !== 'string' || !/^txn_[a-f0-9]{32}$/.test(value.id)
      || typeof value.queryHash !== 'string' || !/^[a-f0-9]{64}$/.test(value.queryHash)) {
      throw new Error('Invalid cursor shape.');
    }
    return value as CursorPayload;
  } catch {
    throw new InputValidationError([{ field: 'cursor', code: 'INVALID_CURSOR', message: 'The pagination cursor is invalid or expired.' }]);
  }
}

export function transactionQueryHash(organizationId: string, input: ListMerchantTransactionsInput): string {
  return sha256(canonicalize({
    organizationId,
    status: input.status ?? null,
    merchantReference: input.merchantReference ?? null,
    createdAfter: input.createdAfter?.toISOString() ?? null,
    createdBefore: input.createdBefore?.toISOString() ?? null,
  }));
}
