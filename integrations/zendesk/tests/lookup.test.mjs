import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PackProofApiError, pickConnectSession } from '../assets/lib/api.js';
import { receiveProof, zendeskPackproofRequest } from '../assets/lib/lookup.js';

const proof = {
  object: 'packproof_passport',
  identity: { passportId: 'ppt_' + 'b'.repeat(40), displayId: 'PP-0123-ABCD-EFGH', transactionId: 'txn_merchantorder01' },
  integrity: { banner: 'AUTHENTIC_PACKPROOF', summary: 'PackProof record integrity verified' },
  limitations: { humanReviewDisclaimer: 'PackProof does not determine fraud, fault, or liability.' },
};

function scriptedRequest(routes) {
  return async (path) => {
    if (!(path in routes)) throw new PackProofApiError(404, 'NOT_FOUND', path);
    const result = routes[path];
    if (result instanceof Error) throw result;
    return result;
  };
}

test('secure Zendesk proxy request never inlines the API key', () => {
  const options = zendeskPackproofRequest({ host: 'packproof-4cf53.web.app', path: '/v1/connect/sessions?externalOrderId=order-123' });
  assert.equal(options.url, 'https://packproof-4cf53.web.app/v1/connect/sessions?externalOrderId=order-123');
  assert.equal(options.headers.Authorization, 'Bearer {{setting.api_key}}');
  assert.equal(options.secure, true);
  assert.equal(options.cors, false);
});

test('receives Proof through Connect externalOrderId then transaction proof path', async () => {
  const result = await receiveProof({
    candidate: { kind: 'order', value: 'order-123', source: 'ticket.custom_field' },
    reviewQuery: { framework: 'VISA', category: 'MERCHANDISE_NOT_RECEIVED' },
    request: scriptedRequest({
      '/v1/connect/sessions?externalOrderId=order-123': { data: [{
        id: 'c'.repeat(64),
        status: 'READY_FOR_CAPTURE',
        transactionId: 'txn_merchantorder01',
        externalOrderId: 'order-123',
        createdAt: '2026-08-20T12:00:00.000Z',
      }] },
      '/v1/transactions/txn_merchantorder01/proof?framework=VISA&category=MERCHANDISE_NOT_RECEIVED': { data: proof },
    }),
  });
  assert.equal(result.type, 'proof');
  assert.equal(result.passport.identity.displayId, 'PP-0123-ABCD-EFGH');
});

test('reports Connect pending when the seller has not redeemed', async () => {
  const result = await receiveProof({
    candidate: { kind: 'order', value: 'order-123', source: 'manual' },
    reviewQuery: { framework: 'GENERIC', category: 'DEFAULT' },
    request: scriptedRequest({
      '/v1/connect/sessions?externalOrderId=order-123': { data: [{
        id: 'c'.repeat(64),
        status: 'PENDING_REDEMPTION',
        transactionId: null,
        externalOrderId: 'order-123',
        itemTitle: 'Vintage camera',
        createdAt: '2026-08-20T12:00:00.000Z',
      }] },
    }),
  });
  assert.equal(result.type, 'connect_pending');
  assert.equal(result.session.status, 'PENDING_REDEMPTION');
});

test('surfaces PASSPORT_NOT_READY instead of inventing a Proof', async () => {
  const result = await receiveProof({
    candidate: { kind: 'transaction', value: 'txn_merchantorder01', source: 'manual' },
    reviewQuery: { framework: 'GENERIC', category: 'DEFAULT' },
    request: scriptedRequest({
      '/v1/transactions/txn_merchantorder01/proof?framework=GENERIC&category=DEFAULT': new PackProofApiError(
        409,
        'PASSPORT_NOT_READY',
        'This transaction does not yet qualify for a Proof.',
        [{ code: 'NO_FINALIZED_MANIFEST_ARTIFACT', message: 'At least one FINALIZED evidence artifact is required.' }],
      ),
    }),
  });
  assert.equal(result.type, 'not_ready');
  assert.equal(result.error.code, 'PASSPORT_NOT_READY');
});

test('falls back to merchantReference when no Connect session exists', async () => {
  const result = await receiveProof({
    candidate: { kind: 'order', value: 'po-99', source: 'manual' },
    reviewQuery: { framework: 'GENERIC', category: 'DEFAULT' },
    request: scriptedRequest({
      '/v1/connect/sessions?externalOrderId=po-99': { data: [] },
      '/v1/transactions?merchantReference=po-99&limit=5': { data: [{ id: 'txn_merchantorder01', title: 'Camera', status: 'LOCKED' }] },
      '/v1/transactions/txn_merchantorder01/proof?framework=GENERIC&category=DEFAULT': { data: proof },
    }),
  });
  assert.equal(result.type, 'proof');
});

test('picks the newest redeemed Connect session', () => {
  const chosen = pickConnectSession([
    { id: '1', status: 'PENDING_REDEMPTION', transactionId: null, createdAt: '2026-08-21T00:00:00.000Z' },
    { id: '2', status: 'READY_FOR_CAPTURE', transactionId: 'txn_old', createdAt: '2026-08-19T00:00:00.000Z' },
    { id: '3', status: 'READY_FOR_CAPTURE', transactionId: 'txn_new', createdAt: '2026-08-20T00:00:00.000Z' },
  ]);
  assert.equal(chosen.transactionId, 'txn_new');
});
