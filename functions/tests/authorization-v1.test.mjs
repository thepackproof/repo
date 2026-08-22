import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  ApplicationError,
  MerchantAuthorizationPolicy,
  MerchantEvidenceApplicationService,
  PortalWorkspaceApplicationService,
  merchantCanAccessTransaction,
  recordVisibleToActor,
  recordsVisibleToActor,
  canonicalize,
  sha256,
} = require('../lib/application/v1/index.js');
const { passThroughIdempotencyFence } = require('../lib/application/v1/merchant-ports.js');
const { ApiError } = require('../lib/api/v1/core.js');
const { FirebasePortalAuthenticator } = require('../lib/api/v1/portal-security.js');

const now = new Date('2026-08-21T16:00:00.000Z');
const USER_A = 'user-a';
const USER_B = 'user-b';
const TX_A = 'legacyTxUserA0001';
const TX_B = 'legacyTxUserB0001';
const TITLE_A = 'User A sealed camera';
const TITLE_B = 'User B draft item';
const PASSPORT_A = `ppt_${'a'.repeat(40)}`;
const DISPLAY_A = 'PP-AAAA-AAAA-AAAA';
const SECRET_ARTIFACT = 'secret-artifact-a';
const GUESSED_TX = 'legacyTxGuessed999';
const GUESSED_PROOF = 'PP-ZZZZ-ZZZZ-ZZZZ';

const userA = { type: 'PORTAL_USER', actorId: USER_A, appId: 'app-portal', channel: 'WEB_PORTAL' };
const userB = { type: 'PORTAL_USER', actorId: USER_B, appId: 'app-portal', channel: 'WEB_PORTAL' };
const orgA = {
  type: 'MERCHANT_API_CLIENT', credentialId: 'cred-a', apiClientId: 'client-a',
  organizationId: 'org-a', environment: 'sandbox', integrationId: 'int-a',
  scopes: ['evidence:read', 'transactions:read'],
};
const orgB = { ...orgA, organizationId: 'org-b', apiClientId: 'client-b', integrationId: 'int-b', credentialId: 'cred-b' };

const secrets = [TITLE_A, PASSPORT_A, DISPLAY_A, SECRET_ARTIFACT];

function portalRecord(overrides) {
  return {
    id: TX_A,
    organizationId: 'org-a',
    integrationId: 'int-a',
    merchantReference: 'order-a',
    title: TITLE_A,
    description: 'Do not leak this description',
    category: 'electronics',
    status: 'ACTIVE',
    consumerStatus: 'PACKED',
    amount: { currency: 'USD', minorUnits: 40000 },
    terms: { saleType: 'SHIPPED', shippingResponsibility: 'SELLER', returns: 'AS_AGREED', returnWindowDays: 14, customTerms: '' },
    sellerId: USER_A,
    buyerId: 'buyer-a',
    participantIds: [USER_A, 'buyer-a'],
    confirmedBy: [USER_A, 'buyer-a'],
    handoffConfirmedBy: [],
    completedBy: [],
    identifiers: [],
    conditionNotes: '',
    lockedAt: now,
    shipment: null,
    delivery: null,
    commerceContextId: null,
    sourceType: 'TRANSACTION_INTAKE',
    sourcePlatform: 'eBay',
    externalOrderId: '1284921',
    externalSellerId: null,
    declaredWeightGrams: null,
    sourceTrackingNumber: null,
    sourceTrustLevel: 'USER_PROVIDED_COMMERCE_ARTIFACT',
    passportId: PASSPORT_A,
    passportDisplayId: DISPLAY_A,
    passportIssuedAt: now,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

class LeakyPortalRepository {
  constructor(records) {
    this.records = new Map(records.map((record) => [record.id, record]));
  }

  async listForParticipant() {
    return [...this.records.values()];
  }

  async findForParticipant(transactionId) {
    return this.records.get(transactionId) ?? null;
  }

  async listEvidence(transactionId) {
    if (transactionId !== TX_A) return [];
    return [{
      id: SECRET_ARTIFACT,
      transactionId: TX_A,
      type: 'PACKING_VIDEO',
      status: 'FINALIZED',
      sha256: 'd'.repeat(64),
      manifestSha256: 'e'.repeat(64),
    }];
  }

  async listTimeline() {
    return [{ id: 'evt_secret', type: 'CREATED', summary: TITLE_A, occurredAt: now.toISOString() }];
  }

  async listReturns() { return []; }
  async findCommerceContext() { return null; }
  async bindPassportIdentity(_id, identity) { return identity; }
}

function portalService(records) {
  return new PortalWorkspaceApplicationService(
    new LeakyPortalRepository(records),
    { append: async () => undefined },
    () => 'https://packproof.link',
    () => now,
  );
}

function assertDenied(error, expectedCode) {
  assert.ok(error instanceof ApplicationError, `expected ApplicationError, got ${error?.name}: ${error?.message}`);
  assert.equal(error.code, expectedCode);
  assert.notEqual(error.code, 'PASSPORT_NOT_READY');
  const blob = `${error.message}\n${error.code}\n${JSON.stringify(error.details ?? [])}`;
  for (const secret of secrets) {
    assert.equal(blob.includes(secret), false, `denial leaked ${secret}`);
  }
}

async function rejectWith(run, expectedCode) {
  await assert.rejects(run, (error) => {
    assertDenied(error, expectedCode);
    return true;
  });
}

test('authorization boundary hides non-participant and cross-organization records', () => {
  const owned = portalRecord();
  const stranger = portalRecord({ id: TX_B, sellerId: USER_B, participantIds: [USER_B], title: TITLE_B, passportId: null, passportDisplayId: null });
  assert.equal(recordVisibleToActor(owned, USER_A)?.id, TX_A);
  assert.equal(recordVisibleToActor(owned, USER_B), null);
  assert.equal(recordVisibleToActor(null, USER_A), null);
  assert.deepEqual(recordsVisibleToActor([owned, stranger], USER_B).map((item) => item.id), [TX_B]);
  assert.equal(merchantCanAccessTransaction({ organizationId: 'org-a', integrationId: 'int-a' }, orgA), true);
  assert.equal(merchantCanAccessTransaction({ organizationId: 'org-a', integrationId: 'int-a' }, orgB), false);
  assert.equal(merchantCanAccessTransaction(null, orgA), false);
});

test('User B session cannot read User A portal transaction, evidence, Proof, or handoff', async () => {
  const service = portalService([
    portalRecord(),
    portalRecord({
      id: TX_B,
      organizationId: 'org-b',
      sellerId: USER_B,
      buyerId: null,
      participantIds: [USER_B],
      title: TITLE_B,
      consumerStatus: 'DRAFT',
      passportId: null,
      passportDisplayId: null,
    }),
  ]);

  const listedA = await service.listTransactions(userA);
  assert.deepEqual(listedA.map((item) => item.id), [TX_A]);
  assert.equal(listedA[0].title, TITLE_A);

  const listedB = await service.listTransactions(userB);
  assert.deepEqual(listedB.map((item) => item.id), [TX_B]);
  assert.equal(listedB.some((item) => item.title === TITLE_A || item.id === TX_A || item.passportId === PASSPORT_A), false);

  const own = await service.getTransaction(userA, TX_A);
  assert.equal(own.title, TITLE_A);
  const copiedUrl = await service.getTransaction(userB, TX_B);
  assert.equal(copiedUrl.title, TITLE_B);

  await rejectWith(() => service.getTransaction(userB, TX_A), 'TRANSACTION_NOT_FOUND');
  await rejectWith(() => service.getTimeline(userB, TX_A), 'TRANSACTION_NOT_FOUND');
  await rejectWith(() => service.listEvidence(userB, TX_A), 'TRANSACTION_NOT_FOUND');
  await rejectWith(() => service.getPassport(userB, TX_A), 'TRANSACTION_NOT_FOUND');
  await rejectWith(() => service.createMobileHandoff(userB, TX_A, 'START_PACKING', 'handoff-b'), 'TRANSACTION_NOT_FOUND');
  await rejectWith(() => service.getTransaction(userB, GUESSED_TX), 'TRANSACTION_NOT_FOUND');
  await rejectWith(() => service.getPassport(userB, GUESSED_TX), 'TRANSACTION_NOT_FOUND');

  const handoff = await service.createMobileHandoff(userA, TX_A, 'START_PACKING', 'handoff-a');
  assert.equal(handoff.captureOnNativeOnly, true);
  await assert.rejects(
    () => service.createMobileHandoff(userA, TX_A, 'BROWSER_UPLOAD', 'handoff-browser'),
    (error) => error instanceof ApplicationError && error.code === 'UNSUPPORTED_PORTAL_HANDOFF',
  );
});

class MemoryIdempotency {
  records = new Map();
  async execute(context, operation) {
    const key = sha256(canonicalize({ principalId: context.principalId, operation: context.operation, key: context.key }));
    const existing = this.records.get(key);
    if (existing) return { value: existing.value, replayed: true, operationId: existing.operationId };
    const value = await operation('op_1', passThroughIdempotencyFence('op_1'));
    this.records.set(key, { value, operationId: 'op_1' });
    return { value, replayed: false, operationId: 'op_1' };
  }
}

class LeakyMerchantRepository {
  constructor(transaction) {
    this.transaction = transaction;
  }

  async findAccessibleTransaction(id) {
    return this.transaction.id === id ? this.transaction : null;
  }

  async findAccessibleTransactionByPassportIdentity(passportIdentity) {
    if (passportIdentity === this.transaction.passportId || passportIdentity === this.transaction.passportDisplayId) {
      return this.transaction;
    }
    return null;
  }

  async listEvidence() { return []; }
  async listTimeline() { return []; }
  async listReturns() { return []; }
  async findCommerceContext() { return null; }
  async bindPassportIdentity(_id, identity) { return identity; }
  async findPassportSnapshot() { return null; }
}

function merchantService(transaction) {
  return new MerchantEvidenceApplicationService(
    new LeakyMerchantRepository(transaction),
    new MemoryIdempotency(),
    { append: async () => undefined },
    new MerchantAuthorizationPolicy(),
    { generate: async () => ({ reportId: 'report_1', storagePath: 'reports/x.pdf', sha256: 'd'.repeat(64), evidenceCount: 0 }) },
    { sign: async () => 'https://files.example/x.pdf' },
    { environment: 'sandbox' },
    () => now,
    { verificationBaseUrl: () => 'https://packproof.example' },
  );
}

test('User B organization cannot read User A transaction or valid Proof identifiers', async () => {
  const transaction = {
    id: 'txn_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    organizationId: 'org-a',
    integrationId: 'int-a',
    merchantReference: 'order-a',
    title: TITLE_A,
    description: '',
    category: null,
    status: 'CREATED',
    consumerStatus: 'PACKED',
    amount: { currency: 'USD', minorUnits: 40000 },
    terms: { saleType: 'SHIPPED', shippingResponsibility: 'SELLER', returns: 'AS_AGREED', returnWindowDays: 14, customTerms: '' },
    shipment: null,
    delivery: null,
    sellerId: USER_A,
    buyerId: 'buyer-a',
    participantIds: [USER_A, 'buyer-a'],
    createdAt: now,
    updatedAt: now,
    commerceContextId: null,
    sourceType: null,
    sourcePlatform: null,
    externalOrderId: null,
    externalSellerId: null,
    declaredWeightGrams: null,
    sourceTrackingNumber: null,
    sourceTrustLevel: null,
    passportId: PASSPORT_A,
    passportDisplayId: DISPLAY_A,
    passportIssuedAt: now,
  };
  const service = merchantService(transaction);

  await rejectWith(() => service.getPassport(orgB, transaction.id), 'TRANSACTION_NOT_FOUND');
  await rejectWith(() => service.listEvidence(orgB, transaction.id), 'TRANSACTION_NOT_FOUND');
  await rejectWith(() => service.getPassportByIdentity(orgB, DISPLAY_A), 'PASSPORT_NOT_FOUND');
  await rejectWith(() => service.getPassportByIdentity(orgB, PASSPORT_A), 'PASSPORT_NOT_FOUND');
  await rejectWith(() => service.getPassportByIdentity(orgB, GUESSED_PROOF), 'PASSPORT_NOT_FOUND');
  await rejectWith(() => service.getPassportSnapshot(orgB, DISPLAY_A, 'pps_missing'), 'PASSPORT_NOT_FOUND');
});

function fakeFirestore(users) {
  return {
    collection(name) {
      assert.equal(name, 'users');
      return {
        doc(uid) {
          return {
            async get() {
              const data = users[uid];
              return { exists: Boolean(data), data: () => data ?? {} };
            },
          };
        },
      };
    },
  };
}

function portalAuthenticator(users = { [USER_A]: {}, [USER_B]: {} }) {
  return new FirebasePortalAuthenticator(
    {
      async verifyIdToken(token) {
        if (token === 'expired') throw new Error('auth/id-token-expired');
        const uid = { 'token-a': USER_A, 'token-b': USER_B }[token];
        if (!uid) throw new Error('invalid-id-token');
        return { uid };
      },
    },
    {
      async verifyToken(token) {
        if (token === 'app-check-valid') return { appId: 'app-portal' };
        throw new Error('invalid-app-check');
      },
    },
    fakeFirestore(users),
  );
}

async function rejectApi(run, status, code) {
  await assert.rejects(run, (error) => {
    assert.ok(error instanceof ApiError);
    assert.equal(error.status, status);
    assert.equal(error.code, code);
    const blob = `${error.message}\n${error.code}`;
    for (const secret of secrets) {
      assert.equal(blob.includes(secret), false, `auth denial leaked ${secret}`);
    }
    return true;
  });
}

test('portal session rejects expired tokens, App Check failures, and blocked accounts', async () => {
  const previous = process.env.FUNCTIONS_EMULATOR;
  delete process.env.FUNCTIONS_EMULATOR;
  try {
    const auth = portalAuthenticator();
    const session = await auth.authenticate('Bearer token-b', 'app-check-valid');
    assert.equal(session.type, 'PORTAL_USER');
    assert.equal(session.actorId, USER_B);
    assert.equal(session.channel, 'WEB_PORTAL');

    await rejectApi(() => auth.authenticate(undefined, 'app-check-valid'), 401, 'INVALID_PORTAL_AUTHENTICATION');
    await rejectApi(() => auth.authenticate('Bearer token-b', undefined), 401, 'INVALID_PORTAL_AUTHENTICATION');
    await rejectApi(() => auth.authenticate('Bearer expired', 'app-check-valid'), 401, 'INVALID_PORTAL_AUTHENTICATION');
    await rejectApi(() => auth.authenticate('Bearer token-b', 'app-check-invalid'), 401, 'INVALID_PORTAL_AUTHENTICATION');
    await rejectApi(() => auth.authenticate('Bearer write-a', 'app-check-valid'), 401, 'INVALID_PORTAL_AUTHENTICATION');

    const suspended = portalAuthenticator({ [USER_B]: { moderationState: 'SUSPENDED' } });
    await rejectApi(() => suspended.authenticate('Bearer token-b', 'app-check-valid'), 403, 'ACCOUNT_SUSPENDED');

    const deleting = portalAuthenticator({ [USER_B]: { deletionScheduledAt: now.toISOString() } });
    await rejectApi(() => deleting.authenticate('Bearer token-b', 'app-check-valid'), 409, 'ACCOUNT_DELETION_PENDING');
  } finally {
    if (previous === undefined) delete process.env.FUNCTIONS_EMULATOR;
    else process.env.FUNCTIONS_EMULATOR = previous;
  }
});
