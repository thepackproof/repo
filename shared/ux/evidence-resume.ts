import type { EvidenceProcessingPhase } from './next-action';

export type EvidenceResumeObservation = {
  transactionId: string;
  state: string;
  lastErrorClass?: 'RETRYABLE' | 'TERMINAL' | null;
  lastError?: string | null;
  uploadId?: string | null;
};

export type QueueCrashPhase = 'ENCRYPTING' | 'DECRYPTING_FOR_UPLOAD' | 'UPLOADING' | 'AWAITING_FINALIZATION';

const IN_FLIGHT_UPLOAD_STATES = new Set([
  'ENCRYPTING',
  'DECRYPTING_FOR_UPLOAD',
  'GRANT_REQUESTED',
  'UPLOADING',
]);

const UNREADABLE_CIPHERTEXT_TOKENS = [
  'authentication tag',
  'aeadbadtagexception',
  'invalid packproof encrypted file header',
  'unsupported packproof encrypted file version',
  'truncated packproof encrypted file',
  'key permanently invalidated',
];

const PHASE_RANK: Record<Exclude<EvidenceProcessingPhase, 'FAILED_RETRY'>, number> = {
  UPLOADING: 1,
  SECURING: 2,
  UPLOAD_FAILED: 3,
  FINALIZATION_FAILED: 4,
  FAILED_RECAPTURE: 5,
};

export function recaptureIsRequired(lastError: string | null | undefined): boolean {
  const message = lastError?.toLowerCase() ?? '';
  return UNREADABLE_CIPHERTEXT_TOKENS.some((token) => message.includes(token));
}

export function recoverInFlightQueueState(state: string): string {
  if (IN_FLIGHT_UPLOAD_STATES.has(state) || state === 'AWAITING_FINALIZATION') return 'FAILED_RETRYABLE';
  return state;
}

export function isProcessDeathResumeState(state: string): boolean {
  return IN_FLIGHT_UPLOAD_STATES.has(state) || state === 'AWAITING_FINALIZATION';
}

export function queueCrashResumePolicy(phase: QueueCrashPhase): {
  retainCiphertext: true;
  scrubPlaintextTemp: true;
  recapture: false;
  resumePhase: Extract<EvidenceProcessingPhase, 'UPLOAD_FAILED' | 'FINALIZATION_FAILED'>;
} {
  return {
    retainCiphertext: true,
    scrubPlaintextTemp: true,
    recapture: false,
    resumePhase: phase === 'AWAITING_FINALIZATION' ? 'FINALIZATION_FAILED' : 'UPLOAD_FAILED',
  };
}

export function evidenceProcessingFromQueue(
  item: EvidenceResumeObservation,
): { phase: EvidenceProcessingPhase } | null {
  if (item.state === 'FINALIZED') return null;
  if (item.state === 'FAILED_TERMINAL' && recaptureIsRequired(item.lastError)) {
    return { phase: 'FAILED_RECAPTURE' };
  }
  if (item.state === 'AWAITING_FINALIZATION') return { phase: 'SECURING' };
  if (item.state === 'FAILED_RETRYABLE' || item.state === 'FAILED_TERMINAL') {
    return { phase: item.uploadId ? 'FINALIZATION_FAILED' : 'UPLOAD_FAILED' };
  }
  if (
    item.state === 'ENCRYPTING'
    || item.state === 'QUEUED'
    || item.state === 'DECRYPTING_FOR_UPLOAD'
    || item.state === 'GRANT_REQUESTED'
    || item.state === 'UPLOADING'
  ) {
    return { phase: 'UPLOADING' };
  }
  return null;
}

export function evidenceProcessingFromQueueItems(
  items: readonly EvidenceResumeObservation[],
): { phase: EvidenceProcessingPhase } | null {
  let chosen: { phase: EvidenceProcessingPhase } | null = null;
  let rank = 0;
  for (const item of items) {
    const next = evidenceProcessingFromQueue(item);
    if (!next) continue;
    const nextRank = PHASE_RANK[next.phase === 'FAILED_RETRY' ? 'UPLOAD_FAILED' : next.phase] ?? 0;
    if (nextRank >= rank) {
      chosen = next;
      rank = nextRank;
    }
  }
  return chosen;
}

export function evidenceProcessingForTransaction(
  transactionId: string,
  items: readonly EvidenceResumeObservation[],
): { phase: EvidenceProcessingPhase } | null {
  return evidenceProcessingFromQueueItems(items.filter((item) => item.transactionId === transactionId));
}
