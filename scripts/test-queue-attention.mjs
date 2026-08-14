import assert from 'node:assert/strict';
import { classifyQueueAttentionReason, queueAttentionMessage } from '../src/lib/queue-attention.ts';

const cases = [
  ['functions/permission-denied', 'PROTECTED_UPLOAD_DENIED'],
  ['Unauthenticated request', 'PROTECTED_UPLOAD_DENIED'],
  ['functions/invalid-argument', 'EVIDENCE_METADATA_REJECTED'],
  ['functions/failed-precondition', 'UPLOAD_PRECONDITION_FAILED'],
  ['A different signed-in user owns this queue item', 'SIGNED_IN_USER_CHANGED'],
  ['AEADBadTagException', 'LOCAL_CIPHERTEXT_UNREADABLE'],
  ['unknown terminal problem', 'TERMINAL_QUEUE_FAILURE'],
];

for (const [message, expected] of cases) {
  assert.equal(classifyQueueAttentionReason(message), expected);
  assert.ok(queueAttentionMessage(expected).length > 20);
}

console.log(`Queue attention classification passed (${cases.length} cases).`);
