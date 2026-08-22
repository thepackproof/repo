const QUEUE_TEMP_SUFFIXES = ['.json', '.read.json', '.upload'] as const;

export function isStaleQueueTempFileName(name: string): boolean {
  const fileName = name.split(/[/\\]/).pop() ?? name;
  return QUEUE_TEMP_SUFFIXES.some((suffix) => fileName.endsWith(suffix));
}

export function queueTempNamesForItem(id: string): { metadataWrite: string; metadataRead: string; upload: string } {
  return {
    metadataWrite: `${id}.json`,
    metadataRead: `${id}.read.json`,
    upload: `${id}.upload`,
  };
}

export function shouldDeleteOriginalAfterEncryption(sourceUri: string, queueDir: string): boolean {
  const source = sourceUri.replace(/\\/g, '/');
  const queue = queueDir.replace(/\\/g, '/');
  return Boolean(source) && !source.includes(queue.replace(/\/$/, ''));
}

export function canDiscardQueuedEvidence(state: string): boolean {
  return state === 'QUEUED' || state === 'FAILED_RETRYABLE';
}

export const QUEUE_STATES = [
  'CAPTURED',
  'ENCRYPTING',
  'QUEUED',
  'DECRYPTING_FOR_UPLOAD',
  'GRANT_REQUESTED',
  'UPLOADING',
  'AWAITING_FINALIZATION',
  'FINALIZED',
] as const;
export type QueueState = (typeof QUEUE_STATES)[number];

export type QueueCrashPhase = 'ENCRYPTING' | 'DECRYPTING_FOR_UPLOAD' | 'UPLOADING' | 'AWAITING_FINALIZATION';

export const QUEUE_FAULTS = [
  'KILL_APP',
  'REBOOT',
  'NETWORK_OFF',
  'TOKEN_EXPIRED',
  'DISK_FULL',
  'KEYSTORE_UNAVAILABLE',
  'FUNCTION_LOST',
  'DUPLICATE_TRIGGER',
  'METADATA_CORRUPT',
  'CIPHERTEXT_CORRUPT',
] as const;
export type QueueFault = (typeof QUEUE_FAULTS)[number];

export function queueFaultOutcome(state: QueueState, _fault: QueueFault): {
  retainCiphertext: boolean;
  upgradeToFinalized: boolean;
  visibleFailure: boolean;
} {
  return {
    retainCiphertext: state !== 'FINALIZED',
    upgradeToFinalized: false,
    visibleFailure: state !== 'FINALIZED',
  };
}

export function queueCrashRecovery(phase: QueueCrashPhase): {
  retainCiphertext: boolean;
  scrubPlaintextTemp: boolean;
  treatUnreadableMetadataAsVisibleFault: boolean;
} {
  return {
    retainCiphertext: true,
    scrubPlaintextTemp: phase !== 'AWAITING_FINALIZATION',
    treatUnreadableMetadataAsVisibleFault: true,
  };
}
