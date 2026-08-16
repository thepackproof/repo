export const CONNECT_CALLBACK_RETRY_STATUSES = ['FAILED', 'PENDING'] as const;
export const CONNECT_CALLBACK_RETRY_BATCH_SIZE = 20;
export const CONNECT_CALLBACK_LEASE_SECONDS = 120;

export type ConnectCallbackRetryStatus = typeof CONNECT_CALLBACK_RETRY_STATUSES[number];

export type ConnectCallbackRetryRecord = {
  id: string;
  status: string;
  nextAttemptAtMs: number | null;
};

export function isConnectCallbackRetryStatus(status: string): status is ConnectCallbackRetryStatus {
  return (CONNECT_CALLBACK_RETRY_STATUSES as readonly string[]).includes(status);
}

export function isDueConnectCallback(record: ConnectCallbackRetryRecord, nowMs: number): boolean {
  if (!isConnectCallbackRetryStatus(record.status)) return false;
  if (record.nextAttemptAtMs == null) return true;
  return record.nextAttemptAtMs <= nowMs;
}

export function selectDueConnectCallbacks(
  records: readonly ConnectCallbackRetryRecord[],
  nowMs: number,
  limit = CONNECT_CALLBACK_RETRY_BATCH_SIZE,
): ConnectCallbackRetryRecord[] {
  return records
    .filter((record) => isDueConnectCallback(record, nowMs))
    .sort((left, right) => (left.nextAttemptAtMs ?? 0) - (right.nextAttemptAtMs ?? 0) || left.id.localeCompare(right.id))
    .slice(0, limit);
}

export function selectDueConnectCallbacksLegacyStatusBatch(
  records: readonly ConnectCallbackRetryRecord[],
  nowMs: number,
  limit = CONNECT_CALLBACK_RETRY_BATCH_SIZE,
): ConnectCallbackRetryRecord[] {
  const batch = records.filter((record) => isConnectCallbackRetryStatus(record.status)).slice(0, limit);
  return batch.filter((record) => isDueConnectCallback(record, nowMs));
}
