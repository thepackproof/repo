import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  candidateFromValue,
  classifyIdentifier,
  collectCaseCandidates,
  extractFromText,
} from '../force-app/main/default/lwc/packProofProof/identifiers.js';

test('classifies Proof, transaction, Connect session, and order identifiers', () => {
  assert.equal(classifyIdentifier('PP-0123-ABCD-EFGH'), 'proof');
  assert.equal(classifyIdentifier('ppt_' + 'a'.repeat(40)), 'proof');
  assert.equal(classifyIdentifier('txn_merchantorder01'), 'transaction');
  assert.equal(classifyIdentifier('a'.repeat(64)), 'connect_session');
  assert.equal(classifyIdentifier('order-123'), 'order');
  assert.equal(classifyIdentifier(''), null);
});

test('extracts PackProof and commerce identifiers from Case text', () => {
  const text = 'Chargeback on Order: order-123 Proof PP-0123-ABCD-EFGH txn_merchantorder01 gid://shopify/Order/99';
  const found = extractFromText(text, 'case.subject');
  assert.deepEqual(found.map((item) => item.kind), ['proof', 'transaction', 'order', 'order']);
  assert.equal(found[0].value, 'PP-0123-ABCD-EFGH');
});

test('prefers a Case order field over subject order labels', () => {
  const candidates = collectCaseCandidates({
    subject: 'Order: other-9 INR',
    description: '',
    type: 'INR',
    reason: 'Item not received',
    orderFieldValue: 'order-123',
  });
  assert.equal(candidates[0].value, 'order-123');
  assert.equal(candidates[0].source, 'case.order_field');
});

test('manual lookup keeps the typed identifier', () => {
  const candidate = candidateFromValue('  PP-0123-abcd-efgh  ', 'manual');
  assert.equal(candidate?.kind, 'proof');
  assert.equal(candidate?.value, 'PP-0123-ABCD-EFGH');
});
