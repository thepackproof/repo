import type { DateLike, TransactionStatus } from '@/types/models';

export function formatMoney(minor = 0, currency = 'USD'): string {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency }).format(minor / 100);
  } catch {
    return `${currency} ${(minor / 100).toFixed(2)}`;
  }
}

export function formatDate(value: DateLike): string {
  if (!value) return 'Pending';
  const date = typeof value === 'string' ? new Date(value) : value.toDate?.() ?? new Date((value.seconds ?? 0) * 1000);
  if (Number.isNaN(date.getTime())) return 'Pending';
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(date);
}

export const statusLabel: Record<TransactionStatus, string> = {
  DRAFT: 'Draft',
  AWAITING_BUYER: 'Awaiting buyer',
  TERMS_REVIEW: 'Reviewing terms',
  TERMS_LOCKED: 'Terms locked',
  PACKED: 'Packing evidence finalized',
  SHIPPED: 'Shipped',
  BUYER_REVIEW: 'Buyer review',
  COMPLETED: 'Complete',
  DISPUTED: 'Concern raised',
  CANCELLED: 'Cancelled',
  ARCHIVED: 'Archived',
};

export const statusProgress: Record<TransactionStatus, number> = {
  DRAFT: 0.08,
  AWAITING_BUYER: 0.18,
  TERMS_REVIEW: 0.32,
  TERMS_LOCKED: 0.48,
  PACKED: 0.62,
  SHIPPED: 0.76,
  BUYER_REVIEW: 0.88,
  COMPLETED: 1,
  DISPUTED: 0.88,
  CANCELLED: 0,
  ARCHIVED: 1,
};

export const readableError = (error: unknown): string => {
  if (error && typeof error === 'object' && 'message' in error) return String((error as { message: unknown }).message).replace(/^\[[^\]]+\]\s*/, '');
  return 'Something went wrong. Please try again.';
};
