import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  DEFAULT_IDEMPOTENCY_LEASE_SECONDS,
  EVIDENCE_REPORT_IDEMPOTENCY_LEASE_SECONDS,
  leaseSecondsForOperation,
  planIdempotencyAcquire,
} = require('../lib/api/v1/controls.js');

test('idempotency leases are operation-specific and do not steal a live fence', () => {
  assert.equal(leaseSecondsForOperation('POST /v1/transactions'), DEFAULT_IDEMPOTENCY_LEASE_SECONDS);
  assert.equal(leaseSecondsForOperation('POST /v1/transactions/{transactionId}/reports'), EVIDENCE_REPORT_IDEMPOTENCY_LEASE_SECONDS);
  assert.equal(leaseSecondsForOperation('POST /v1/transactions', 45), 45);

  const live = planIdempotencyAcquire({
    requestFingerprint: 'same',
    state: 'PROCESSING',
    operationId: 'op_1',
    leaseExpiresAtMs: 2_000,
  }, 'same', 1_000);
  assert.equal(live.type, 'IN_PROGRESS');

  const expired = planIdempotencyAcquire({
    requestFingerprint: 'same',
    state: 'PROCESSING',
    operationId: 'op_1',
    leaseExpiresAtMs: 500,
  }, 'same', 1_000);
  assert.deepEqual(expired, { type: 'ACQUIRE', operationId: 'op_1', reclaimExpired: true });

  const complete = planIdempotencyAcquire({
    requestFingerprint: 'same',
    state: 'COMPLETE',
    operationId: 'op_1',
    result: { id: 'op_1' },
  }, 'same', 1_000);
  assert.equal(complete.type, 'REPLAY');
  assert.equal(complete.operationId, 'op_1');

  const reused = planIdempotencyAcquire({
    requestFingerprint: 'left',
    state: 'COMPLETE',
    operationId: 'op_1',
    result: { id: 'op_1' },
  }, 'right', 1_000);
  assert.equal(reused.type, 'KEY_REUSED');
});
