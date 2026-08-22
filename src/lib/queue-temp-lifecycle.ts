import { queueCrashResumePolicy, type QueueCrashPhase } from '../../shared/ux/evidence-resume.ts';

export type { QueueCrashPhase } from '../../shared/ux/evidence-resume.ts';
export { recoverInFlightQueueState, recaptureIsRequired } from '../../shared/ux/evidence-resume.ts';

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

export function queueCrashRecovery(phase: QueueCrashPhase): {
  retainCiphertext: boolean;
  scrubPlaintextTemp: boolean;
  treatUnreadableMetadataAsVisibleFault: boolean;
  recapture: boolean;
  resumePhase: 'UPLOAD_FAILED' | 'FINALIZATION_FAILED';
} {
  const policy = queueCrashResumePolicy(phase);
  return {
    retainCiphertext: policy.retainCiphertext,
    scrubPlaintextTemp: policy.scrubPlaintextTemp,
    treatUnreadableMetadataAsVisibleFault: true,
    recapture: policy.recapture,
    resumePhase: policy.resumePhase,
  };
}
