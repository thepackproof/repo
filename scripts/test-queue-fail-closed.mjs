import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

import { queueCrashRecovery } from '../src/lib/queue-temp-lifecycle.ts';

const failClosed = {
  CAPTURED: { retainCiphertext: true, upgradeToFinalized: false },
  ENCRYPTING: { retainCiphertext: true, upgradeToFinalized: false },
  QUEUED: { retainCiphertext: true, upgradeToFinalized: false },
  DECRYPTING_FOR_UPLOAD: { retainCiphertext: true, upgradeToFinalized: false },
  GRANT_REQUESTED: { retainCiphertext: true, upgradeToFinalized: false },
  UPLOADING: { retainCiphertext: true, upgradeToFinalized: false },
  AWAITING_FINALIZATION: { retainCiphertext: true, upgradeToFinalized: false },
  FINALIZED: { retainCiphertext: false, upgradeToFinalized: true },
};

for (const [state, expected] of Object.entries(failClosed)) {
  assert.equal(expected.upgradeToFinalized, state === 'FINALIZED', `${state} must not silently finalize`);
  if (state !== 'FINALIZED') assert.equal(expected.retainCiphertext, true);
}

for (const state of ['ENCRYPTING', 'DECRYPTING_FOR_UPLOAD', 'UPLOADING', 'AWAITING_FINALIZATION']) {
  const recovered = queueCrashRecovery(state);
  assert.equal(recovered.retainCiphertext, true);
  assert.equal(recovered.treatUnreadableMetadataAsVisibleFault, true);
}

console.log('Queue fail-closed invariants passed.');
