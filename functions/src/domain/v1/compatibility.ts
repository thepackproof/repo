import type { TransactionDto, FulfillmentState, TermsState, TransactionStatus } from './transactions';

export type LegacyTimestampLike = Date | string | { toDate(): Date } | { seconds: number; nanoseconds?: number };

function iso(value: LegacyTimestampLike | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string') return new Date(value).toISOString();
  if ('toDate' in value) return value.toDate().toISOString();
  return new Date(value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1_000_000)).toISOString();
}

export type LegacyConsumerTransaction = {
  id: string;
  sellerId: string;
  buyerId: string | null;
  status: 'DRAFT' | 'AWAITING_BUYER' | 'TERMS_REVIEW' | 'TERMS_LOCKED' | 'PACKED' | 'SHIPPED' | 'BUYER_REVIEW' | 'COMPLETED' | 'DISPUTED' | 'CANCELLED' | 'ARCHIVED';
  title: string;
  category: string;
  description: string;
  priceMinor: number;
  currency: string;
  identifiers: Array<{ label: string; value: string }>;
  conditionNotes: string;
  terms: TransactionDto['terms'];
  source?:
    | { type: 'PACKPROOF_CONNECT'; externalOrderId: string; commerceContextId?: string | null }
    | { type: 'PACKPROOF_BUTTON'; commerceContextId: string; passportDraftId: string }
    | { type: 'TRANSACTION_INTAKE'; commerceContextId: string; passportDraftId: string };
  createdAt: LegacyTimestampLike;
  updatedAt: LegacyTimestampLike;
  lockedAt?: LegacyTimestampLike | null;
};

function legacyStates(status: LegacyConsumerTransaction['status']): { termsState: TermsState; fulfillmentState: FulfillmentState; status: TransactionStatus } {
  switch (status) {
    case 'DRAFT': return { termsState: 'DRAFT', fulfillmentState: 'NOT_STARTED', status: 'DRAFT' };
    case 'AWAITING_BUYER': return { termsState: 'AWAITING_PARTICIPANTS', fulfillmentState: 'NOT_STARTED', status: 'DRAFT' };
    case 'TERMS_REVIEW': return { termsState: 'IN_REVIEW', fulfillmentState: 'NOT_STARTED', status: 'ACTIVE' };
    case 'TERMS_LOCKED': return { termsState: 'LOCKED', fulfillmentState: 'NOT_STARTED', status: 'ACTIVE' };
    case 'PACKED': return { termsState: 'LOCKED', fulfillmentState: 'PACKED', status: 'ACTIVE' };
    case 'SHIPPED': return { termsState: 'LOCKED', fulfillmentState: 'IN_TRANSIT', status: 'ACTIVE' };
    case 'BUYER_REVIEW': return { termsState: 'LOCKED', fulfillmentState: 'RECEIVER_REVIEW', status: 'ACTIVE' };
    case 'COMPLETED': return { termsState: 'LOCKED', fulfillmentState: 'COMPLETED', status: 'COMPLETED' };
    case 'DISPUTED': return { termsState: 'LOCKED', fulfillmentState: 'DISPUTED', status: 'DISPUTED' };
    case 'CANCELLED': return { termsState: 'CANCELLED', fulfillmentState: 'NOT_STARTED', status: 'CANCELLED' };
    case 'ARCHIVED': return { termsState: 'LOCKED', fulfillmentState: 'COMPLETED', status: 'ARCHIVED' };
  }
}

export function mapLegacyConsumerTransaction(input: LegacyConsumerTransaction): TransactionDto {
  const states = legacyStates(input.status);
  const createdAt = iso(input.createdAt)!;
  const updatedAt = iso(input.updatedAt)!;
  return {
    id: input.id as TransactionDto['id'],
    object: 'transaction',
    schemaVersion: 1,
    origin: input.source?.type === 'PACKPROOF_CONNECT' ? 'PACKPROOF_CONNECT'
      : input.source?.type === 'PACKPROOF_BUTTON' ? 'COMMERCE_ADAPTER'
        : 'CONSUMER',
    merchantReference: input.source?.type === 'PACKPROOF_CONNECT' ? input.source.externalOrderId : null,
    commerceContextId: input.source?.commerceContextId as TransactionDto['commerceContextId'] ?? null,
    passportDraftId: input.source?.type === 'PACKPROOF_BUTTON' || input.source?.type === 'TRANSACTION_INTAKE'
      ? input.source.passportDraftId as TransactionDto['passportDraftId']
      : null,
    item: {
      title: input.title,
      description: input.description,
      category: input.category || null,
      amount: { currency: input.currency, minorUnits: input.priceMinor },
      identifiers: input.identifiers,
      conditionNotes: input.conditionNotes,
    },
    terms: input.terms,
    participants: [
      { role: 'SELLER', externalReference: 'legacy-packproof-seller', displayLabel: null, claimState: 'CLAIMED' },
      ...(input.buyerId ? [{ role: 'BUYER' as const, externalReference: 'legacy-packproof-buyer', displayLabel: null, claimState: 'CLAIMED' as const }] : []),
    ],
    ...states,
    termsLockedAt: iso(input.lockedAt),
    completedAt: input.status === 'COMPLETED' || input.status === 'ARCHIVED' ? updatedAt : null,
    createdAt,
    updatedAt,
  };
}

export type LegacyMerchantTransaction = {
  id: string;
  merchantReference: string;
  title: string;
  description: string;
  category: string | null;
  amount: { currency: string; minorUnits: number } | null;
  participants: Array<{ role: 'SELLER' | 'BUYER' | 'RECEIVER'; externalReference: string }>;
  status: 'CREATED' | 'CAPTURE_PENDING' | 'CAPTURE_IN_PROGRESS' | 'EVIDENCE_RECEIVED' | 'VERIFICATION_PENDING' | 'COMPLETED' | 'CANCELLED';
  createdAt: Date;
  updatedAt: Date;
};

export function mapLegacyMerchantTransaction(input: LegacyMerchantTransaction): TransactionDto {
  const status: TransactionStatus = input.status === 'COMPLETED' ? 'COMPLETED' : input.status === 'CANCELLED' ? 'CANCELLED' : input.status === 'CREATED' ? 'DRAFT' : 'ACTIVE';
  const fulfillmentState: FulfillmentState = input.status === 'COMPLETED' ? 'COMPLETED' : 'NOT_STARTED';
  return {
    id: input.id as TransactionDto['id'],
    object: 'transaction',
    schemaVersion: 1,
    origin: 'MERCHANT_API',
    merchantReference: input.merchantReference,
    commerceContextId: null,
    passportDraftId: null,
    item: {
      title: input.title,
      description: input.description,
      category: input.category,
      amount: input.amount,
      identifiers: [],
      conditionNotes: '',
    },
    terms: { saleType: 'SHIPPED', shippingResponsibility: 'SELLER', returns: 'PLATFORM_POLICY', returnWindowDays: 0, customTerms: '' },
    participants: input.participants.map((participant) => ({ ...participant, displayLabel: null, claimState: 'UNCLAIMED' })),
    termsState: input.status === 'CANCELLED' ? 'CANCELLED' : 'DRAFT',
    fulfillmentState,
    status,
    termsLockedAt: null,
    completedAt: input.status === 'COMPLETED' ? input.updatedAt.toISOString() : null,
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  };
}
