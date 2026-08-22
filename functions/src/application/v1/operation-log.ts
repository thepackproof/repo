export type OperationLog = {
  requestId?: string | null;
  operation: string;
  transactionIdHash?: string | null;
  durationMs: number;
  result: 'OK' | 'ERROR';
  retryCount?: number;
  errorClass?: string | null;
  finalizationState?: string | null;
  firestoreReads?: number;
  workspaceCount?: number;
  summaryHits?: number;
  hydratedCount?: number;
  evidenceHydrationMs?: number;
  commerceHydrationMs?: number;
  proofEligibilityMs?: number;
  captureSessionId?: string | null;
  evidenceId?: string | null;
  uploadState?: string | null;
  proofState?: string | null;
};

export function writeOperationLog(entry: OperationLog): void {
  const payload = {
    schemaVersion: 1,
    ...entry,
    at: new Date().toISOString(),
  };
  if (entry.result === 'ERROR') {
    console.error(JSON.stringify(payload));
    return;
  }
  console.info(JSON.stringify(payload));
}

export async function withOperationLog<T>(
  operation: string,
  work: () => Promise<T>,
  extras: Omit<OperationLog, 'operation' | 'durationMs' | 'result'> = {},
): Promise<T> {
  const started = Date.now();
  try {
    const value = await work();
    writeOperationLog({ ...extras, operation, durationMs: Date.now() - started, result: 'OK' });
    return value;
  } catch (error) {
    writeOperationLog({
      ...extras,
      operation,
      durationMs: Date.now() - started,
      result: 'ERROR',
      errorClass: error instanceof Error ? error.name : 'unknown',
    });
    throw error;
  }
}
