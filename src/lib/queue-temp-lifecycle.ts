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

export type QueueCrashPhase = 'ENCRYPTING' | 'DECRYPTING_FOR_UPLOAD' | 'UPLOADING' | 'AWAITING_FINALIZATION';

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
