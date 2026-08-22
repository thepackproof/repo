import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const keys = require('../lib/domain/v1/key-registry.js');
const privacy = require('../lib/domain/v1/privacy-intake.js');
const retry = require('../lib/domain/v1/retry-policy.js');
const science = require('../lib/domain/v1/scientific-gate.js');
const enterprise = require('../lib/domain/v1/enterprise-pilot.js');
const schema = require('../lib/domain/v1/schema-policy.js');
const idem = require('../lib/domain/v1/idempotency-contract.js');
const finale = require('../lib/domain/v1/finalization-outcome.js');
const parsers = require('../lib/domain/v1/transaction-intake-parsers.js');
const flags = require('../lib/application/v1/feature-flags.js');
const telemetry = require('../lib/application/v1/telemetry.js');
const { overlayIntakeItem } = require('../lib/application/v1/transaction-intake-service.js');

test('HMAC keys cannot become public signatures', () => {
  for (const record of keys.HC1_KEY_REGISTRY) {
    keys.assertHmacNotPublicSignature(record);
    assert.equal(record.publicVerificationAvailable, false);
  }
  const rotated = keys.rotateKey(keys.HC1_KEY_REGISTRY[0], 'packproof-manifest-v2', '2026-08-22T00:00:00.000Z');
  assert.equal(rotated.keyId, 'packproof-manifest-v2');
  assert.equal(rotated.algorithm, 'HMAC-SHA256');
  assert.throws(() => keys.assertHmacNotPublicSignature({
    algorithm: 'HMAC-SHA256',
    verificationPolicy: 'PACKPROOF_SERVICE_ONLY',
    publicVerificationAvailable: true,
  }));
});

test('intake redacts personal data and does not retain raw correspondence', () => {
  assert.equal(privacy.shouldRetainRawCorrespondence('receipt'), false);
  const redacted = privacy.redactUnnecessaryPersonalData('Sold to ada@example.com phone 555-201-3344 card 4111111111111111');
  assert.match(redacted, /REDACTED_EMAIL/);
  assert.match(redacted, /REDACTED_PHONE/);
  assert.match(redacted, /REDACTED_PAYMENT/);
  const item = overlayIntakeItem({
    title: 'Camera ada@example.com',
    description: 'Ship to 555-201-3344',
    category: null,
    brand: null,
    model: null,
    sku: null,
    gtin: null,
    upc: null,
    mpn: null,
    serialNumber: null,
    selectedOptions: [],
    identifiers: [],
    quantity: 1,
    amount: null,
    imageReferences: [],
  }, null);
  assert.equal(item.title.includes('@'), false);
  assert.equal(item.description.includes('555-201-3344'), false);
});

test('retries are bounded and honor Retry-After', () => {
  const stopped = retry.retryAfterMs({ ...retry.HC1_CLIENT_RETRY, attempt: 6 });
  assert.equal(stopped.retry, false);
  const honored = retry.retryAfterMs({ ...retry.HC1_CLIENT_RETRY, attempt: 2, serverRetryAfterMs: 12_000 });
  assert.equal(honored.delayMs, 12_000);
  const jittered = retry.retryAfterMs({ ...retry.HC1_CLIENT_RETRY, attempt: 1, random: () => 0 });
  assert.equal(jittered.retry, true);
  assert.equal(jittered.delayMs, 1_000);
});

test('physical correspondence stays NOT_AVAILABLE without a scientific gate', () => {
  assert.equal(science.scientificGatePassed(science.HC1_SCIENTIFIC_GATE), false);
  assert.equal(science.physicalCorrespondenceStatus(), 'NOT_AVAILABLE');
  assert.throws(() => science.rejectModelMatchShortcut('MATCH'));
});

test('Enterprise ENFORCE stays closed until the pilot checklist is complete', () => {
  assert.equal(enterprise.enterprisePilotReady(enterprise.HC1_ENTERPRISE_PILOT), false);
  assert.equal(enterprise.startingEnterpriseMode(enterprise.HC1_ENTERPRISE_PILOT), 'OBSERVE');
  assert.equal(enterprise.enforceAllowed(enterprise.HC1_ENTERPRISE_PILOT), false);
});

test('old evidence stays on its capture policy', () => {
  const captured = { schemaVersion: 1, policyVersion: 'outbound-v1', producerVersion: '0.9.5.0' };
  const current = { schemaVersion: 1, policyVersion: 'outbound-v2', producerVersion: '0.9.6.0' };
  assert.equal(schema.evaluationPolicyForRecord(captured, current).policyVersion, 'outbound-v1');
  assert.equal(schema.maySilentlyReinterpret(captured, current), false);
});

test('idempotent mutations replay, conflict, or execute exactly once', () => {
  assert.equal(idem.resolveIdempotentMutation({
    existing: null,
    incomingFingerprint: 'a',
    simultaneous: true,
  }).type, 'EXECUTE');
  assert.equal(idem.resolveIdempotentMutation({
    existing: { fingerprint: 'a', state: 'COMPLETE' },
    incomingFingerprint: 'a',
    simultaneous: false,
  }).type, 'REPLAY');
  assert.equal(idem.resolveIdempotentMutation({
    existing: { fingerprint: 'a', state: 'COMPLETE' },
    incomingFingerprint: 'b',
    simultaneous: false,
  }).type, 'CONFLICT');
  assert.equal(idem.lostResponseAfterSuccess().type, 'REPLAY');
  assert.ok(idem.HC1_IDEMPOTENT_OPERATIONS.includes('proof.snapshot'));
});

test('integrity mismatches quarantine and never finalize', () => {
  assert.equal(finale.finalizationOutcomeFromIntegrity({
    clientHashMatched: false,
    clientSizeMatched: true,
    contentTypeMatched: true,
  }), 'QUARANTINED');
  assert.equal(finale.finalizationOutcomeFromIntegrity({
    clientHashMatched: true,
    clientSizeMatched: false,
    contentTypeMatched: true,
  }), 'QUARANTINED');
  assert.equal(finale.finalizationOutcomeFromIntegrity({
    clientHashMatched: true,
    clientSizeMatched: true,
    contentTypeMatched: false,
  }), 'QUARANTINED');
  assert.equal(finale.mutationNeverFinalizes('FLIP_BYTE'), 'QUARANTINED');
  assert.equal(finale.finalizationOutcomeFromIntegrity({
    clientHashMatched: true,
    clientSizeMatched: true,
    contentTypeMatched: true,
  }), 'FINALIZED');
});

test('commerce parsers leave missing facts missing', () => {
  const unlabeled = parsers.parseCommerceArtifact('US $1,299.00\nhttps://evil.example/phish', 'EMAIL_RECEIPT');
  assert.equal(unlabeled.item.title, '');
  assert.ok(unlabeled.missingFields.includes('title'));
  const hugeQty = parsers.parseCommerceArtifact('Item: Widget\nQuantity: 999999999\nOrder number: ZZ-00001', 'EMAIL_RECEIPT');
  assert.ok(hugeQty.item.quantity === 1 || hugeQty.item.quantity <= 100_000);
});

test('feature flags can disable intake without an Android release', () => {
  const previous = process.env.PACKPROOF_FLAG_RECEIPT_INTAKE;
  process.env.PACKPROOF_FLAG_RECEIPT_INTAKE = 'false';
  try {
    assert.equal(flags.packProofFeatureFlags().receiptIntake, false);
    assert.throws(() => flags.assertIntakeEnabled('EMAIL_RECEIPT'));
  } finally {
    if (previous == null) delete process.env.PACKPROOF_FLAG_RECEIPT_INTAKE;
    else process.env.PACKPROOF_FLAG_RECEIPT_INTAKE = previous;
  }
});

test('telemetry percentiles are computed from stage samples', () => {
  const samples = [10, 20, 30, 40, 100].map((durationMs) => ({ stage: 'finalize', durationMs }));
  const stats = telemetry.stagePercentiles(samples, 'finalize');
  assert.equal(stats.count, 5);
  assert.equal(stats.p50, 30);
  assert.equal(stats.p95, 100);
});
