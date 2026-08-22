import type { PackProofTransaction } from './next-action';

export type PortalTransactionLike = {
  id: string;
  sellerId: string | null;
  buyerId: string | null;
  participantIds: string[];
  status: string;
  title: string;
  category: string;
  description: string;
  priceMinor: number | null;
  currency: string | null;
  identifiers: { label: string; value: string }[];
  conditionNotes: string;
  terms: PackProofTransaction['terms'] | null;
  confirmedBy: string[];
  handoffConfirmedBy: string[];
  completedBy: string[];
  createdAt: string;
  updatedAt: string;
  lockedAt: string | null;
  passportId: string | null;
  passportDisplayId: string | null;
  source: { type: string | null; platform: string | null; externalOrderId: string | null } | null;
};

export function toUxTransaction(item: PortalTransactionLike): PackProofTransaction {
  return {
    id: item.id,
    sellerId: item.sellerId ?? '',
    buyerId: item.buyerId,
    participantIds: item.participantIds,
    status: item.status as PackProofTransaction['status'],
    title: item.title,
    category: item.category,
    description: item.description,
    priceMinor: item.priceMinor ?? 0,
    currency: item.currency ?? 'USD',
    identifiers: item.identifiers,
    conditionNotes: item.conditionNotes,
    terms: item.terms ?? {
      saleType: 'SHIPPED',
      shippingResponsibility: 'SELLER',
      returns: 'AS_AGREED',
      returnWindowDays: 0,
      customTerms: '',
    },
    confirmedBy: item.confirmedBy,
    handoffConfirmedBy: item.handoffConfirmedBy,
    completedBy: item.completedBy,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    lockedAt: item.lockedAt,
    passportId: item.passportId,
    passportDisplayId: item.passportDisplayId,
    source: item.source
      ? {
          type: item.source.type ?? undefined,
          platform: item.source.platform ?? undefined,
          externalOrderId: item.source.externalOrderId ?? undefined,
        }
      : null,
  };
}

export function toPortalTransactionLike(transaction: PackProofTransaction): PortalTransactionLike {
  return {
    id: transaction.id,
    sellerId: transaction.sellerId || null,
    buyerId: transaction.buyerId,
    participantIds: transaction.participantIds,
    status: transaction.status,
    title: transaction.title,
    category: transaction.category,
    description: transaction.description,
    priceMinor: transaction.priceMinor,
    currency: transaction.currency,
    identifiers: transaction.identifiers,
    conditionNotes: transaction.conditionNotes,
    terms: transaction.terms,
    confirmedBy: transaction.confirmedBy,
    handoffConfirmedBy: transaction.handoffConfirmedBy ?? [],
    completedBy: transaction.completedBy ?? [],
    createdAt: typeof transaction.createdAt === 'string' ? transaction.createdAt : '2026-08-21T12:00:00.000Z',
    updatedAt: typeof transaction.updatedAt === 'string' ? transaction.updatedAt : '2026-08-21T12:00:00.000Z',
    lockedAt: typeof transaction.lockedAt === 'string' ? transaction.lockedAt : null,
    passportId: transaction.passportId ?? null,
    passportDisplayId: transaction.passportDisplayId ?? null,
    source: transaction.source
      ? {
          type: transaction.source.type ?? null,
          platform: 'platform' in transaction.source ? transaction.source.platform ?? null : null,
          externalOrderId: 'externalOrderId' in transaction.source ? transaction.source.externalOrderId ?? null : null,
        }
      : null,
  };
}
