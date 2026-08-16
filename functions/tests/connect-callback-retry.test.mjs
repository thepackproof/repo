import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  CONNECT_CALLBACK_RETRY_BATCH_SIZE,
  selectDueConnectCallbacks,
  selectDueConnectCallbacksLegacyStatusBatch,
} = require('../lib/application/v1/connect-callback-retry-policy.js');

function records() {
  const notDue = Array.from({ length: CONNECT_CALLBACK_RETRY_BATCH_SIZE + 5 }, (_, index) => ({
    id: `pending-future-${String(index).padStart(2, '0')}`,
    status: 'PENDING',
    nextAttemptAtMs: 5_000 + index,
  }));
  const due = [
    { id: 'failed-due-1', status: 'FAILED', nextAttemptAtMs: 100 },
    { id: 'failed-due-2', status: 'FAILED', nextAttemptAtMs: 200 },
    { id: 'pending-due-1', status: 'PENDING', nextAttemptAtMs: 50 },
  ];
  return [...notDue, ...due];
}

test('due-time selection prefers due Connect callbacks instead of starving behind a not-due status batch', () => {
  const nowMs = 1_000;
  const all = records();
  const legacy = selectDueConnectCallbacksLegacyStatusBatch(all, nowMs);
  assert.equal(legacy.length, 0);

  const selected = selectDueConnectCallbacks(all, nowMs);
  assert.deepEqual(selected.map((item) => item.id), ['pending-due-1', 'failed-due-1', 'failed-due-2']);
});
