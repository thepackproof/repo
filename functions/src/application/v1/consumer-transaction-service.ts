import { mapLegacyConsumerTransaction, type LegacyConsumerTransaction } from '../../domain/v1/compatibility';
import { transactionDtoSchema, type TransactionTerms } from '../../domain/v1/transactions';
import { ApplicationError } from './errors';
import type { ApplicationEvent } from './events';
import { sha256 } from './merchant-transaction-service';

export const activeConsumerTransactionStatuses: readonly LegacyConsumerTransaction['status'][] = [
  'DRAFT', 'AWAITING_BUYER', 'TERMS_REVIEW', 'TERMS_LOCKED', 'PACKED', 'SHIPPED', 'BUYER_REVIEW', 'DISPUTED',
];

export const editableConsumerDraftStatuses: readonly LegacyConsumerTransaction['status'][] = ['DRAFT', 'AWAITING_BUYER', 'TERMS_REVIEW'];

export type ConsumerDraftInput = {
  transactionId?: string;
  title: string;
  category: string;
  description: string;
  priceMinor: number;
  currency: string;
  identifiers: Array<{ label: string; value: string }>;
  conditionNotes: string;
  terms: TransactionTerms;
};

export type ConsumerDraftSnapshot = {
  id: string;
  sellerId: string;
  buyerId: string | null;
  status: LegacyConsumerTransaction['status'];
  handoffConfirmedBy: string[];
  completedBy: string[];
  createdAt: Date;
};

export type ConsumerDraftRecord = {
  sellerId: string;
  buyerId: string | null;
  participantIds: string[];
  status: LegacyConsumerTransaction['status'];
  title: string;
  category: string;
  description: string;
  priceMinor: number;
  currency: string;
  identifiers: Array<{ label: string; value: string }>;
  conditionNotes: string;
  terms: TransactionTerms;
  confirmedBy: string[];
  handoffConfirmedBy: string[];
  completedBy: string[];
  lockedAt: null;
  createdAt: Date;
  updatedAt: Date;
};

export type SaveConsumerDraftMutation = {
  transactionId: string;
  expected: { exists: boolean; sellerId: string; editableStatuses: readonly LegacyConsumerTransaction['status'][] };
  record: ConsumerDraftRecord;
  event: ApplicationEvent;
};

export interface ConsumerTransactionRepository {
  allocateTransactionId(): string;
  hasActiveTransactionForSeller(sellerId: string, statuses: readonly LegacyConsumerTransaction['status'][]): Promise<boolean>;
  findDraft(transactionId: string): Promise<ConsumerDraftSnapshot | null>;
  saveDraft(mutation: SaveConsumerDraftMutation): Promise<void>;
}

export class ConsumerTransactionApplicationService {
  constructor(
    private readonly repository: ConsumerTransactionRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async saveDraft(command: {
    actorId: string;
    plan: string;
    input: ConsumerDraftInput;
    requestId: string;
  }): Promise<{ transactionId: string }> {
    const isUpdate = Boolean(command.input.transactionId);
    if (!isUpdate && command.plan !== 'PRO'
      && await this.repository.hasActiveTransactionForSeller(command.actorId, activeConsumerTransactionStatuses)) {
      throw new ApplicationError('RESOURCE_EXHAUSTED', 'ACTIVE_TRANSACTION_LIMIT', 'The free plan supports one active PackProof. Upgrade to create another.');
    }

    const transactionId = command.input.transactionId ?? this.repository.allocateTransactionId();
    const existing = await this.repository.findDraft(transactionId);
    if (isUpdate && !existing) throw new ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'PackProof draft not found.');
    if (existing && existing.sellerId !== command.actorId) {
      throw new ApplicationError('FORBIDDEN', 'SELLER_REQUIRED', 'Only the seller can edit this draft.');
    }
    if (existing && !editableConsumerDraftStatuses.includes(existing.status)) {
      throw new ApplicationError('FAILED_PRECONDITION', 'TERMS_ALREADY_LOCKED', 'Locked terms cannot be edited.');
    }

    const timestamp = this.now();
    const buyerId = existing?.buyerId ?? null;
    const status: LegacyConsumerTransaction['status'] = buyerId ? 'TERMS_REVIEW' : (existing?.status ?? 'DRAFT');
    const record: ConsumerDraftRecord = {
      sellerId: command.actorId,
      buyerId,
      participantIds: buyerId ? [command.actorId, buyerId] : [command.actorId],
      status,
      title: command.input.title,
      category: command.input.category,
      description: command.input.description,
      priceMinor: command.input.priceMinor,
      currency: command.input.currency,
      identifiers: command.input.identifiers,
      conditionNotes: command.input.conditionNotes,
      terms: command.input.terms,
      confirmedBy: [],
      handoffConfirmedBy: existing?.handoffConfirmedBy ?? [],
      completedBy: existing?.completedBy ?? [],
      lockedAt: null,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp,
    };
    transactionDtoSchema.parse(mapLegacyConsumerTransaction({ id: transactionId, ...record }));

    const eventType = existing ? 'DRAFT_UPDATED' : 'TRANSACTION_CREATED';
    const event: ApplicationEvent = {
      id: `evt_${sha256(`${eventType}\n${transactionId}\n${existing ? command.requestId : transactionId}`).slice(0, 40)}`,
      schemaVersion: 1,
      type: eventType,
      organizationId: null,
      actor: { type: 'USER', id: command.actorId },
      resourceType: 'transaction',
      resourceId: transactionId,
      requestId: command.requestId,
      occurredAt: timestamp,
      data: { origin: 'CONSUMER', status },
    };
    await this.repository.saveDraft({
      transactionId,
      expected: { exists: Boolean(existing), sellerId: command.actorId, editableStatuses: editableConsumerDraftStatuses },
      record,
      event,
    });
    return { transactionId };
  }
}
