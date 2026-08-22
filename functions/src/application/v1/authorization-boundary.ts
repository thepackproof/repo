import type { MerchantPrincipal } from './merchant-types';

export function recordVisibleToActor<T extends { participantIds: readonly string[] }>(
  record: T | null | undefined,
  actorId: string,
): T | null {
  if (!record || !actorId) return null;
  return record.participantIds.includes(actorId) ? record : null;
}

export function recordsVisibleToActor<T extends { participantIds: readonly string[] }>(
  records: readonly T[],
  actorId: string,
): T[] {
  return records.filter((record) => recordVisibleToActor(record, actorId) !== null);
}

export function merchantCanAccessTransaction(
  transaction: { organizationId?: string | null; integrationId?: string | null } | null | undefined,
  principal: Pick<MerchantPrincipal, 'organizationId' | 'integrationId'>,
): boolean {
  if (!transaction) return false;
  if (transaction.organizationId && transaction.organizationId === principal.organizationId) return true;
  if (transaction.integrationId && principal.integrationId && transaction.integrationId === principal.integrationId) {
    return true;
  }
  return false;
}
