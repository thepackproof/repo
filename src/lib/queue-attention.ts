export type QueueAttentionReason =
  | 'PROTECTED_UPLOAD_DENIED'
  | 'EVIDENCE_METADATA_REJECTED'
  | 'UPLOAD_PRECONDITION_FAILED'
  | 'SIGNED_IN_USER_CHANGED'
  | 'LOCAL_CIPHERTEXT_UNREADABLE'
  | 'TERMINAL_QUEUE_FAILURE';

export function classifyQueueAttentionReason(error: string | null | undefined): QueueAttentionReason {
  const message = error?.toLowerCase() ?? '';
  if (message.includes('permission-denied') || message.includes('unauthenticated')) return 'PROTECTED_UPLOAD_DENIED';
  if (message.includes('invalid-argument')) return 'EVIDENCE_METADATA_REJECTED';
  if (message.includes('failed-precondition')) return 'UPLOAD_PRECONDITION_FAILED';
  if (message.includes('different signed-in')) return 'SIGNED_IN_USER_CHANGED';
  if ([
    'authentication tag',
    'aeadbadtagexception',
    'invalid packproof encrypted file header',
    'unsupported packproof encrypted file version',
    'truncated packproof encrypted file',
    'key permanently invalidated',
  ].some((token) => message.includes(token))) return 'LOCAL_CIPHERTEXT_UNREADABLE';
  return 'TERMINAL_QUEUE_FAILURE';
}

export function queueAttentionMessage(reason: QueueAttentionReason): string {
  switch (reason) {
    case 'PROTECTED_UPLOAD_DENIED':
      return 'Protected upload authorization was denied. Confirm sign-in and app-integrity access, then retry the retained ciphertext.';
    case 'EVIDENCE_METADATA_REJECTED':
      return 'The server rejected evidence metadata. Keep the ciphertext and record this condition for support review.';
    case 'UPLOAD_PRECONDITION_FAILED':
      return 'The transaction no longer satisfies an upload precondition. Keep the ciphertext and review the transaction state.';
    case 'SIGNED_IN_USER_CHANGED':
      return 'This encrypted capture belongs to a different signed-in user. Sign back into the original account before retrying.';
    case 'LOCAL_CIPHERTEXT_UNREADABLE':
      return 'The device could not authenticate or decrypt the retained ciphertext. Do not clear app data or uninstall.';
    default:
      return 'The ciphertext was retained after a non-retryable queue failure. Retry explicitly or record the condition for support review.';
  }
}
