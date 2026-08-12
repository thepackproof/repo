import { createHash, randomUUID } from 'node:crypto';
import { mapLegacyMerchantTransaction } from '../../domain/v1/compatibility';
import { transactionDtoSchema } from '../../domain/v1/transactions';
import { ApplicationError } from './errors';
import type { ApplicationEvent } from './events';
import type {
  ApiRuntimeConfig,
  CreateMerchantTransactionResult,
  IdempotencyStore,
  MerchantAuditWriter,
  MerchantTransactionRepository,
} from './merchant-ports';
import type {
  ApiEnvironment,
  ApiScope,
  CreateMerchantTransactionInput,
  ListMerchantTransactionsInput,
  MerchantPrincipal,
  MerchantTransaction,
  MerchantTransactionDto,
} from './merchant-types';

export function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('Canonical JSON does not support non-finite numbers.');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
  }
  throw new Error('Canonical JSON does not support this value.');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function createTransactionId(): string {
  return `txn_${randomUUID().replaceAll('-', '')}`;
}

export function toMerchantTransactionDto(transaction: MerchantTransaction): MerchantTransactionDto {
  return {
    id: transaction.id,
    object: 'transaction',
    merchantReference: transaction.merchantReference,
    title: transaction.title,
    description: transaction.description,
    category: transaction.category,
    amount: transaction.amount,
    participants: transaction.participants,
    captureRequirements: transaction.captureRequirements,
    status: transaction.status,
    captureStatus: transaction.captureStatus,
    shipmentStatus: transaction.shipmentStatus,
    receiverStatus: transaction.receiverStatus,
    returnStatus: transaction.returnStatus,
    verificationStatus: transaction.verificationStatus,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
  };
}

function assertCanonicalCompatibility(transaction: MerchantTransaction): void {
  transactionDtoSchema.parse(mapLegacyMerchantTransaction({
    id: transaction.id,
    merchantReference: transaction.merchantReference,
    title: transaction.title,
    description: transaction.description,
    category: transaction.category,
    amount: transaction.amount,
    participants: transaction.participants,
    status: transaction.status,
    createdAt: transaction.createdAt,
    updatedAt: transaction.updatedAt,
  }));
}

export class MerchantAuthorizationPolicy {
  requireScope(principal: MerchantPrincipal, scope: ApiScope): void {
    if (!principal.scopes.includes(scope)) {
      throw new ApplicationError('FORBIDDEN', 'INSUFFICIENT_SCOPE', 'The API credential does not grant this operation.', [
        { code: 'REQUIRED_SCOPE', message: scope },
      ]);
    }
  }

  requireEnvironment(principal: MerchantPrincipal, environment: ApiEnvironment): void {
    if (principal.environment !== environment) {
      throw new ApplicationError('FORBIDDEN', 'ENVIRONMENT_MISMATCH', 'The API credential belongs to a different environment.');
    }
  }
}

export class MerchantTransactionApplicationService {
  constructor(
    private readonly repository: MerchantTransactionRepository,
    private readonly idempotency: IdempotencyStore,
    private readonly audit: MerchantAuditWriter,
    private readonly authorization: MerchantAuthorizationPolicy,
    private readonly config: ApiRuntimeConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(
    principal: MerchantPrincipal,
    input: CreateMerchantTransactionInput,
    idempotencyKey: string,
    requestId: string,
  ): Promise<CreateMerchantTransactionResult> {
    this.authorization.requireEnvironment(principal, this.config.environment);
    this.authorization.requireScope(principal, 'transactions:write');
    const requestFingerprint = sha256(canonicalize(input));
    const execution = await this.idempotency.execute(
      {
        principalId: `${principal.organizationId}:${principal.apiClientId}`,
        operation: 'POST /v1/transactions',
        key: idempotencyKey,
        requestFingerprint,
      },
      async (transactionId) => {
        const timestamp = this.now();
        const transaction: MerchantTransaction = {
          id: transactionId,
          organizationId: principal.organizationId,
          merchantReference: input.merchantReference,
          title: input.title,
          description: input.description,
          category: input.category,
          amount: input.amount,
          participants: input.participants,
          captureRequirements: input.captureRequirements,
          status: 'CREATED',
          captureStatus: 'NOT_STARTED',
          shipmentStatus: 'NOT_ASSOCIATED',
          receiverStatus: 'NOT_STARTED',
          returnStatus: 'NOT_STARTED',
          verificationStatus: 'PENDING_EVIDENCE',
          createdByApiClientId: principal.apiClientId,
          createdAt: timestamp,
          updatedAt: timestamp,
        };
        assertCanonicalCompatibility(transaction);
        const event: ApplicationEvent = {
          id: `evt_${sha256(`transaction-created\n${transaction.id}`).slice(0, 40)}`,
          schemaVersion: 1,
          type: 'TRANSACTION_CREATED',
          organizationId: principal.organizationId,
          actor: { type: 'MERCHANT_API_CLIENT', id: principal.apiClientId },
          resourceType: 'transaction',
          resourceId: transaction.id,
          requestId,
          occurredAt: timestamp,
          data: { origin: 'MERCHANT_API', requestFingerprint, merchantReferenceHash: sha256(input.merchantReference) },
        };
        const persisted = await this.repository.create(transaction, event);
        await this.audit.append({
          eventId: `transaction_created_${persisted.id}`,
          organizationId: principal.organizationId,
          type: 'TRANSACTION_CREATED',
          actor: principal,
          resourceType: 'TRANSACTION',
          resourceId: persisted.id,
          requestId,
          metadata: {
            apiVersion: 'v1',
            requestFingerprint,
            merchantReferenceHash: sha256(input.merchantReference),
            outboxEventId: event.id,
          },
        });
        return { transaction: toMerchantTransactionDto(persisted) };
      },
    );
    return {
      transaction: execution.value.transaction as MerchantTransactionDto,
      captureInstructions: { state: 'NOT_ISSUED', reason: 'CAPTURE_SESSION_REQUIRED' },
      replayed: execution.replayed,
    };
  }

  async get(principal: MerchantPrincipal, transactionId: string): Promise<MerchantTransactionDto> {
    this.authorization.requireEnvironment(principal, this.config.environment);
    this.authorization.requireScope(principal, 'transactions:read');
    const transaction = await this.repository.findByIdForOrganization(transactionId, principal.organizationId);
    if (!transaction) throw new ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'The requested transaction was not found.');
    assertCanonicalCompatibility(transaction);
    return toMerchantTransactionDto(transaction);
  }

  async list(principal: MerchantPrincipal, input: ListMerchantTransactionsInput): Promise<{ transactions: MerchantTransactionDto[]; nextCursor: string | null }> {
    this.authorization.requireEnvironment(principal, this.config.environment);
    this.authorization.requireScope(principal, 'transactions:read');
    const page = await this.repository.listForOrganization(principal.organizationId, input);
    page.transactions.forEach(assertCanonicalCompatibility);
    return { transactions: page.transactions.map(toMerchantTransactionDto), nextCursor: page.nextCursor };
  }
}
