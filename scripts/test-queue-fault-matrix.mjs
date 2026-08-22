import assert from 'node:assert/strict';
import { QUEUE_FAULTS, QUEUE_STATES, queueFaultOutcome } from '../src/lib/queue-temp-lifecycle.ts';

for (const state of QUEUE_STATES) {
  for (const fault of QUEUE_FAULTS) {
    const outcome = queueFaultOutcome(state, fault);
    assert.equal(outcome.upgradeToFinalized, false, `${state} + ${fault} must not silently finalize`);
    if (state !== 'FINALIZED') {
      assert.equal(outcome.retainCiphertext, true, `${state} + ${fault} must retain ciphertext`);
      assert.equal(outcome.visibleFailure, true);
    }
  }
}

console.log('Queue fault matrix passed.');
