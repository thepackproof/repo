import assert from 'node:assert/strict';
import test from 'node:test';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  ApplicationError,
  CommerceContextApplicationService,
  ConnectHandoffApplicationService,
  ConsumerTransactionApplicationService,
  MerchantAuthorizationPolicy,
  MerchantTransactionApplicationService,
  ParticipantCaptureApplicationService,
  PublicCommerceHandoffApplicationService,
  PortalWorkspaceApplicationService,
  TransactionIntakeApplicationService,
  canonicalize,
  passThroughIdempotencyFence,
  sha256,
} = require('../lib/application/v1/index.js');

const now = new Date('2026-08-11T12:00:00.000Z');

class MemoryIdempotencyStore {
  records = new Map();

  async execute(context, operation) {
    const key = sha256(canonicalize({ principalId: context.principalId, operation: context.operation, key: context.key }));
    const existing = this.records.get(key);
    if (existing && existing.fingerprint !== context.requestFingerprint) {
      throw new ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'changed request');
    }
    if (existing) return { value: existing.value, replayed: true, operationId: existing.operationId };
    const operationId = 'txn_1234567890abcdef1234567890abcdef';
    const value = await operation(operationId, passThroughIdempotencyFence(operationId));
    this.records.set(key, { fingerprint: context.requestFingerprint, value, operationId });
    return { value, replayed: false, operationId };
  }
}

class MemoryMerchantRepository {
  records = new Map();
  outbox = new Map();

  async create(transaction, event) {
    this.records.set(transaction.id, transaction);
    this.outbox.set(event.id, event);
    return transaction;
  }

  async findByIdForOrganization(id, organizationId) {
    const record = this.records.get(id);
    return record?.organizationId === organizationId ? record : null;
  }

  async listForOrganization(organizationId) {
    return { transactions: [...this.records.values()].filter((record) => record.organizationId === organizationId), nextCursor: null };
  }
}

test('merchant application service owns authorization, canonical mapping, idempotency, and the atomic event request', async () => {
  const repository = new MemoryMerchantRepository();
  const audits = [];
  const service = new MerchantTransactionApplicationService(
    repository,
    new MemoryIdempotencyStore(),
    { append: async (event) => { audits.push(event); } },
    new MerchantAuthorizationPolicy(),
    { environment: 'sandbox' },
    () => now,
  );
  const principal = {
    type: 'MERCHANT_API_CLIENT', credentialId: 'cred-1', apiClientId: 'client-1', organizationId: 'org-1',
    environment: 'sandbox', scopes: ['transactions:read', 'transactions:write'],
  };
  const input = {
    merchantReference: 'order-1', title: 'Merchant item', description: 'Imported description', category: null,
    amount: { currency: 'USD', minorUnits: 5000 }, participants: [{ role: 'SELLER', externalReference: 'seller-1' }],
    captureRequirements: { requiredArtifactTypes: ['ITEM_PHOTO'] },
  };
  const first = await service.create(principal, input, 'idempotency-1', 'request-1');
  const replay = await service.create(principal, input, 'idempotency-1', 'request-1');
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.transaction.id, first.transaction.id);
  assert.equal(repository.records.size, 1);
  assert.equal(repository.outbox.size, 1);
  assert.equal([...repository.outbox.values()][0].schemaVersion, 1);
  assert.equal([...repository.outbox.values()][0].type, 'TRANSACTION_CREATED');
  assert.equal(audits.length, 1);
  await assert.rejects(
    () => service.get({ ...principal, scopes: [] }, first.transaction.id),
    (error) => error instanceof ApplicationError && error.code === 'INSUFFICIENT_SCOPE',
  );
});

class MemoryConsumerRepository {
  nextId = 'legacyTransaction0001';
  active = false;
  snapshots = new Map();
  mutations = [];

  allocateTransactionId() { return this.nextId; }
  async hasActiveTransactionForSeller() { return this.active; }
  async findDraft(id) { return this.snapshots.get(id) ?? null; }
  async saveDraft(mutation) {
    this.mutations.push(mutation);
    this.snapshots.set(mutation.transactionId, {
      id: mutation.transactionId,
      sellerId: mutation.record.sellerId,
      buyerId: mutation.record.buyerId,
      status: mutation.record.status,
      handoffConfirmedBy: mutation.record.handoffConfirmedBy,
      completedBy: mutation.record.completedBy,
      createdAt: mutation.record.createdAt,
    });
  }
}

const consumerInput = {
  title: 'Consumer item', category: 'Collectible', description: 'Detailed description', priceMinor: 1200, currency: 'USD',
  identifiers: [{ label: 'SKU', value: 'SKU-1' }], conditionNotes: 'Used',
  terms: { saleType: 'SHIPPED', shippingResponsibility: 'SELLER', returns: 'AS_AGREED', returnWindowDays: 7, customTerms: '' },
};

test('consumer draft service preserves quota, ownership, editability, canonical mapping, and event semantics', async () => {
  const repository = new MemoryConsumerRepository();
  const service = new ConsumerTransactionApplicationService(repository, () => now);
  const created = await service.saveDraft({ actorId: 'seller-1', plan: 'FREE', input: consumerInput, requestId: 'request-consumer-1' });
  assert.equal(created.transactionId, repository.nextId);
  assert.equal(repository.mutations[0].record.status, 'DRAFT');
  assert.equal(repository.mutations[0].event.type, 'TRANSACTION_CREATED');
  assert.equal(repository.mutations[0].event.data.origin, 'CONSUMER');

  repository.snapshots.set(repository.nextId, {
    ...repository.snapshots.get(repository.nextId), buyerId: 'buyer-1', status: 'TERMS_REVIEW', handoffConfirmedBy: ['seller-1'], completedBy: [],
  });
  await service.saveDraft({ actorId: 'seller-1', plan: 'FREE', input: { ...consumerInput, transactionId: repository.nextId }, requestId: 'request-consumer-2' });
  assert.equal(repository.mutations[1].record.status, 'TERMS_REVIEW');
  assert.deepEqual(repository.mutations[1].record.participantIds, ['seller-1', 'buyer-1']);
  assert.equal(repository.mutations[1].event.type, 'DRAFT_UPDATED');

  await assert.rejects(
    () => service.saveDraft({ actorId: 'attacker', plan: 'PRO', input: { ...consumerInput, transactionId: repository.nextId }, requestId: 'request-consumer-3' }),
    (error) => error instanceof ApplicationError && error.code === 'SELLER_REQUIRED',
  );
  repository.active = true;
  await assert.rejects(
    () => service.saveDraft({ actorId: 'seller-2', plan: 'FREE', input: consumerInput, requestId: 'request-consumer-4' }),
    (error) => error instanceof ApplicationError && error.code === 'ACTIVE_TRANSACTION_LIMIT',
  );
});

class MemoryCommerceRepository {
  mutation = null;

  async createOrReplay(mutation) {
    if (this.mutation && this.mutation.requestPayloadHash !== mutation.requestPayloadHash) {
      throw new ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'changed order');
    }
    if (this.mutation) return { created: false, expiresAt: this.mutation.session.expiresAt };
    this.mutation = mutation;
    return { created: true, expiresAt: mutation.session.expiresAt };
  }
}

const tokenIssuer = {
  issue: (sessionId) => `token-${sessionId}`,
  digest: (token) => sha256(token),
};

const connectOrder = {
  platform: 'marketplace', orderId: 'order-42', sellerId: 'seller-ext', trackingNumber: '1Z999', carrier: 'UPS',
  itemTitle: 'Imported collectible', itemDescription: 'The complete merchant description.', declaredWeightGrams: 500,
  priceMinor: 4200, currency: 'USD', callbackUrl: 'https://merchant.example/callback', idempotencyKey: 'idempotency-connect-1',
};

test('commerce-context ingestion produces an order-bound provenance snapshot and stable handoff', async () => {
  const repository = new MemoryCommerceRepository();
  const service = new CommerceContextApplicationService(repository, tokenIssuer, () => now);
  const principal = { integrationId: 'legacyIntegration001', platform: 'marketplace', webhookSigningSecret: 'not-exposed' };
  const first = await service.ingestConnectOrder(principal, connectOrder, 'request-commerce-1');
  const replay = await service.ingestConnectOrder(principal, connectOrder, 'request-commerce-1');
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(first.sessionId, replay.sessionId);
  assert.equal(first.sessionToken, replay.sessionToken);
  assert.equal(repository.mutation.commerceContext.status, 'ORDER_BOUND');
  assert.equal(repository.mutation.commerceContext.source.trustLevel, 'MERCHANT_SERVER_ATTESTED');
  assert.equal(repository.mutation.commerceContext.item.description, connectOrder.itemDescription);
  assert.equal(repository.mutation.commerceContext.item.identifiers[0].value, connectOrder.orderId);
  assert.equal(repository.mutation.event.type, 'COMMERCE_CONTEXT_CREATED');
  assert.equal(JSON.stringify(repository.mutation).includes('not-exposed'), false);
  await assert.rejects(
    () => service.ingestConnectOrder({ ...principal, platform: 'shopify' }, connectOrder, 'request-commerce-2'),
    (error) => error instanceof ApplicationError && error.code === 'PLATFORM_MISMATCH',
  );
});

class MemoryConnectRepository {
  constructor(session) { this.session = session; }
  decision = null;
  consumeCount = 0;

  async redeem(sessionId, decide) {
    const snapshot = this.session?.id === sessionId ? { ...this.session } : null;
    const decision = decide(snapshot, 'legacyTransactionConnect1');
    if (decision.type === 'REPLAY') return decision.result;
    if (!snapshot?.tokenHash || snapshot.status !== 'PENDING_REDEMPTION' || this.session.tokenHash !== snapshot.tokenHash) {
      throw new ApplicationError('RETRYABLE_CONFLICT', 'CONNECT_GRANT_CONSUME_CONFLICT', 'The Connect grant changed before it could be consumed.');
    }
    this.decision = decision;
    this.consumeCount += 1;
    this.session = { ...this.session, claimedBy: decision.transaction.sellerId, transactionId: 'legacyTransactionConnect1', status: 'READY_FOR_CAPTURE', tokenHash: null, codeChallenge: null };
    return { transactionId: 'legacyTransactionConnect1', connectSessionId: sessionId };
  }
}

function connectSession(overrides = {}) {
  return {
    id: 'connectSession12345', commerceContextId: 'ctx_12345678', integrationId: 'legacyIntegration001', platform: 'marketplace',
    externalOrderId: 'order-42', externalSellerId: 'seller-ext', trackingNumber: '1Z999', carrier: 'UPS',
    itemTitle: 'Imported collectible', itemDescription: 'The complete merchant description.', declaredWeightGrams: 500,
    priceMinor: 4200, currency: 'USD', callbackUrl: 'https://merchant.example/callback', tokenHash: 'expected-token',
    codeChallenge: null,
    status: 'PENDING_REDEMPTION', transactionId: null, claimedBy: null, expiresAt: new Date('2026-08-12T12:00:00.000Z'),
    ...overrides,
  };
}

const verifier = { verify: (token, expected) => token === expected };

test('Connect redemption is atomic, idempotent, actor-bound, token-bound, and canonical-compatible', async () => {
  const repository = new MemoryConnectRepository(connectSession());
  const service = new ConnectHandoffApplicationService(repository, verifier, () => now);
  const first = await service.redeem({ actorId: 'seller-user', sessionId: 'connectSession12345', token: 'expected-token', requestId: 'request-redeem-1' });
  assert.equal(first.transactionId, 'legacyTransactionConnect1');
  assert.equal(repository.decision.transaction.description, connectOrder.itemDescription);
  assert.equal(repository.decision.transaction.source.commerceContextId, 'ctx_12345678');
  assert.equal(repository.decision.event.type, 'TRANSACTION_CREATED');
  const replay = await service.redeem({ actorId: 'seller-user', sessionId: 'connectSession12345', token: 'not-needed-after-claim', requestId: 'request-redeem-2' });
  assert.deepEqual(replay, first);

  const invalidTokenRepo = new MemoryConnectRepository(connectSession());
  const invalidTokenService = new ConnectHandoffApplicationService(invalidTokenRepo, verifier, () => now);
  await assert.rejects(
    () => invalidTokenService.redeem({ actorId: 'seller-user', sessionId: 'connectSession12345', token: 'wrong', requestId: 'request-redeem-3' }),
    (error) => error instanceof ApplicationError && error.code === 'INVALID_HANDOFF_TOKEN',
  );
  assert.equal(invalidTokenRepo.consumeCount, 0);
  assert.equal(invalidTokenRepo.session.tokenHash, 'expected-token');
  const claimedService = new ConnectHandoffApplicationService(new MemoryConnectRepository(connectSession({ claimedBy: 'other-user' })), verifier, () => now);
  await assert.rejects(
    () => claimedService.redeem({ actorId: 'seller-user', sessionId: 'connectSession12345', token: 'expected-token', requestId: 'request-redeem-4' }),
    (error) => error instanceof ApplicationError && error.code === 'CONNECT_SESSION_ALREADY_CLAIMED',
  );
  const expiredService = new ConnectHandoffApplicationService(new MemoryConnectRepository(connectSession({ expiresAt: new Date('2026-08-10T12:00:00.000Z') })), verifier, () => now);
  await assert.rejects(
    () => expiredService.redeem({ actorId: 'seller-user', sessionId: 'connectSession12345', token: 'expected-token', requestId: 'request-redeem-5' }),
    (error) => error instanceof ApplicationError && error.code === 'CONNECT_SESSION_EXPIRED',
  );
});

test('Connect grant exchange rejects wrong client, redirect, or PKCE without consuming the code', async () => {
  const { createHash } = await import('node:crypto');
  const verifierValue = 'a'.repeat(43);
  const challenge = createHash('sha256').update(verifierValue).digest('base64url');

  async function rejectWithoutConsume(overrides, command, code) {
    const repository = new MemoryConnectRepository(connectSession(overrides));
    const service = new ConnectHandoffApplicationService(repository, verifier, () => now);
    await assert.rejects(
      () => service.redeem({ actorId: 'seller-user', sessionId: 'connectSession12345', token: 'expected-token', requestId: 'request-grant', ...command }),
      (error) => error instanceof ApplicationError && error.code === code,
    );
    assert.equal(repository.consumeCount, 0);
    assert.equal(repository.session.tokenHash, 'expected-token');
  }

  await rejectWithoutConsume({}, { clientId: 'other-integration' }, 'CONNECT_CLIENT_MISMATCH');
  await rejectWithoutConsume({}, { redirectUri: 'https://attacker.example/callback' }, 'CONNECT_REDIRECT_MISMATCH');
  await rejectWithoutConsume({ codeChallenge: challenge }, { codeVerifier: 'b'.repeat(43) }, 'CONNECT_PKCE_MISMATCH');
  await rejectWithoutConsume({}, { codeVerifier: verifierValue }, 'CONNECT_PKCE_MISMATCH');

  const successRepo = new MemoryConnectRepository(connectSession({ codeChallenge: challenge }));
  const success = await new ConnectHandoffApplicationService(successRepo, verifier, () => now).redeem({
    actorId: 'seller-user',
    sessionId: 'connectSession12345',
    token: 'expected-token',
    clientId: 'legacyIntegration001',
    redirectUri: 'https://merchant.example/callback',
    codeVerifier: verifierValue,
    requestId: 'request-grant-ok',
  });
  assert.equal(success.transactionId, 'legacyTransactionConnect1');
  assert.equal(successRepo.consumeCount, 1);
  assert.equal(successRepo.session.tokenHash, null);
});

test('Connect grant compare-and-set allows only one consumer under concurrency', async () => {
  const session = connectSession();
  const repository = {
    consumeCount: 0,
    session,
    async redeem(sessionId, decide) {
      const snapshot = this.session?.id === sessionId ? { ...this.session } : null;
      const decision = decide(snapshot, 'legacyTransactionConnect1');
      if (decision.type === 'REPLAY') return decision.result;
      await new Promise((resolve) => setImmediate(resolve));
      if (!snapshot?.tokenHash || this.session.tokenHash !== snapshot.tokenHash || this.session.status !== 'PENDING_REDEMPTION') {
        throw new ApplicationError('RETRYABLE_CONFLICT', 'CONNECT_GRANT_CONSUME_CONFLICT', 'The Connect grant changed before it could be consumed.');
      }
      this.consumeCount += 1;
      this.session = { ...this.session, claimedBy: decision.transaction.sellerId, transactionId: 'legacyTransactionConnect1', status: 'READY_FOR_CAPTURE', tokenHash: null };
      return { transactionId: 'legacyTransactionConnect1', connectSessionId: sessionId };
    },
  };
  const service = new ConnectHandoffApplicationService(repository, verifier, () => now);
  const results = await Promise.allSettled([
    service.redeem({ actorId: 'seller-user', sessionId: 'connectSession12345', token: 'expected-token', requestId: 'request-cas-1' }),
    service.redeem({ actorId: 'seller-user', sessionId: 'connectSession12345', token: 'expected-token', requestId: 'request-cas-2' }),
  ]);
  const accepted = results.filter((result) => result.status === 'fulfilled');
  const rejected = results.filter((result) => result.status === 'rejected');
  assert.equal(accepted.length, 1);
  assert.equal(rejected.length, 1);
  assert.equal(rejected[0].reason.code, 'CONNECT_GRANT_CONSUME_CONFLICT');
  assert.equal(repository.consumeCount, 1);
  const replay = await service.redeem({ actorId: 'seller-user', sessionId: 'connectSession12345', token: 'already-consumed', requestId: 'request-cas-replay' });
  assert.deepEqual(replay, accepted[0].value);
});

class MemoryPublicCommerceRepository {
  mutation = null;
  claimed = null;
  decision = null;
  active = false;

  async findIntegrationByPublishableKey(key) {
    return key === `pp_pub_sandbox_${'A'.repeat(24)}`
      ? { id: 'integrationButton001', environment: 'sandbox', status: 'ACTIVE', allowedOrigins: ['https://shop.example'] }
      : null;
  }

  async createOrReplay(mutation) {
    if (this.mutation && this.mutation.requestFingerprint !== mutation.requestFingerprint) {
      throw new ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'changed listing');
    }
    if (this.mutation) return { created: false, expiresAt: this.mutation.expiresAt };
    this.mutation = mutation;
    return { created: true, expiresAt: mutation.expiresAt };
  }

  async hasActiveTransactionForSeller() { return this.active; }

  async redeem(handoffId, decide) {
    const snapshot = this.mutation?.handoffId === handoffId ? {
      id: handoffId,
      integrationId: this.mutation.commerceContext.integrationId,
      commerceContextId: this.mutation.commerceContext.id,
      passportDraftId: this.mutation.passportDraft.id,
      origin: this.mutation.origin,
      status: this.claimed ? 'CLAIMED' : 'PENDING_CLAIM',
      tokenHash: this.claimed ? null : this.mutation.tokenHash,
      claimedBy: this.claimed?.actorId ?? null,
      transactionId: this.claimed?.transactionId ?? null,
      expiresAt: this.mutation.expiresAt,
      context: { ...this.mutation.commerceContext, status: this.claimed ? 'CLAIMED' : 'HANDOFF_ISSUED' },
      draft: { ...this.mutation.passportDraft, status: this.claimed ? 'BOUND' : 'READY_FOR_REVIEW', transactionId: this.claimed?.transactionId ?? null },
    } : null;
    const decision = decide(snapshot, 'legacyPublicTransaction001');
    if (decision.type === 'REPLAY') return decision.result;
    this.decision = decision;
    this.claimed = { actorId: decision.transaction.sellerId, transactionId: 'legacyPublicTransaction001' };
    return {
      transactionId: 'legacyPublicTransaction001',
      publicHandoffId: handoffId,
      commerceContextId: snapshot.commerceContextId,
      passportDraftId: snapshot.passportDraftId,
    };
  }
}

const publicPageContext = {
  schemaVersion: 1,
  source: {
    platform: 'STRUCTURED_PAGE_DATA', productUrl: 'https://shop.example/products/camera',
    externalProductId: 'product-42', externalListingId: null, externalVariantId: 'black',
  },
  item: {
    title: 'Page-declared camera', description: 'Complete listing description imported without retyping.',
    category: 'Vintage cameras', brand: 'Example Optics', model: 'RF-50', sku: 'RF50-42', gtin: null, upc: null,
    mpn: null, serialNumber: null, selectedOptions: [{ name: 'Finish', value: 'Black' }],
    identifiers: [{ type: 'SKU', value: 'RF50-42' }], quantity: 1,
    amount: { currency: 'USD', minorUnits: 129900 },
    imageReferences: [{ url: 'https://cdn.example/camera.jpg', altText: 'Front image' }],
  },
};

test('public commerce handoff is origin-bound, retry-stable, page-declared, editable, and single-claim', async () => {
  const repository = new MemoryPublicCommerceRepository();
  const tokenIssuer = { issue: (id) => `token-${id}`, digest: (token) => sha256(token) };
  const verifier = { verify: (token, expected) => sha256(token) === expected };
  const service = new PublicCommerceHandoffApplicationService(repository, tokenIssuer, verifier, () => 'sandbox', () => now);
  const command = {
    publishableKey: `pp_pub_sandbox_${'A'.repeat(24)}`,
    origin: 'https://shop.example',
    operationKey: 'page-button-operation-1',
    input: publicPageContext,
    requestId: 'request-public-handoff-1',
  };
  const issued = await service.issue(command);
  const replay = await service.issue(command);
  assert.equal(issued.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.handoffId, issued.handoffId);
  assert.equal(replay.token, issued.token);
  assert.equal(repository.mutation.commerceContext.status, 'HANDOFF_ISSUED');
  assert.equal(repository.mutation.commerceContext.source.trustLevel, 'PAGE_DECLARED');
  assert.equal(repository.mutation.commerceContext.source.externalOrderId, null);
  assert.equal(repository.mutation.passportDraft.status, 'READY_FOR_REVIEW');
  assert.equal(repository.mutation.passportDraft.item.description, publicPageContext.item.description);
  assert.deepEqual(repository.mutation.events.map(({ type }) => type), ['COMMERCE_CONTEXT_CREATED', 'COMMERCE_HANDOFF_ISSUED']);

  await assert.rejects(
    () => service.issue({ ...command, origin: 'https://attacker.example' }),
    (error) => error instanceof ApplicationError && error.code === 'ORIGIN_NOT_ALLOWED',
  );
  await assert.rejects(
    () => service.issue({ ...command, input: { ...publicPageContext, source: { ...publicPageContext.source, productUrl: 'https://other.example/product' } } }),
    (error) => error instanceof ApplicationError && error.code === 'PRODUCT_ORIGIN_MISMATCH',
  );
  await assert.rejects(
    () => service.issue({ ...command, input: { ...publicPageContext, item: { ...publicPageContext.item, description: 'changed' } } }),
    (error) => error instanceof ApplicationError && error.code === 'IDEMPOTENCY_KEY_REUSED',
  );
  await assert.rejects(
    () => service.redeem({ actorId: 'seller-user', plan: 'PRO', handoffId: issued.handoffId, token: 'wrong', requestId: 'request-public-redeem-wrong' }),
    (error) => error instanceof ApplicationError && error.code === 'INVALID_HANDOFF_TOKEN',
  );
  const redeemed = await service.redeem({ actorId: 'seller-user', plan: 'PRO', handoffId: issued.handoffId, token: issued.token, requestId: 'request-public-redeem' });
  assert.equal(redeemed.transactionId, 'legacyPublicTransaction001');
  assert.equal(repository.decision.transaction.status, 'DRAFT');
  assert.equal(repository.decision.transaction.description, publicPageContext.item.description);
  assert.ok(repository.decision.transaction.identifiers.some(({ label, value }) => label === 'Brand' && value === 'Example Optics'));
  assert.ok(repository.decision.transaction.identifiers.some(({ label, value }) => label === 'Option: Finish' && value === 'Black'));
  assert.equal(repository.decision.transaction.source.type, 'PACKPROOF_BUTTON');
  assert.equal(repository.decision.transaction.source.trustLevel, 'PAGE_DECLARED');
  assert.equal(repository.decision.transaction.listingImageReferences[0].url, publicPageContext.item.imageReferences[0].url);
  assert.deepEqual(repository.decision.events.map(({ type }) => type), ['TRANSACTION_CREATED', 'COMMERCE_CONTEXT_CLAIMED']);
  repository.active = true;
  const claimReplay = await service.redeem({ actorId: 'seller-user', plan: 'FREE', handoffId: issued.handoffId, token: 'consumed', requestId: 'request-public-replay' });
  assert.deepEqual(claimReplay, redeemed);
  await assert.rejects(
    () => service.redeem({ actorId: 'attacker', plan: 'PRO', handoffId: issued.handoffId, token: 'consumed', requestId: 'request-public-other' }),
    (error) => error instanceof ApplicationError && error.code === 'PUBLIC_HANDOFF_ALREADY_CLAIMED',
  );
});

test('public handoff redemption preserves the consumer-plan quota boundary', async () => {
  const repository = new MemoryPublicCommerceRepository();
  repository.active = true;
  const service = new PublicCommerceHandoffApplicationService(
    repository,
    { issue: (id) => `token-${id}`, digest: (token) => sha256(token) },
    { verify: (token, expected) => sha256(token) === expected },
    () => 'sandbox',
    () => now,
  );
  const issued = await service.issue({
    publishableKey: `pp_pub_sandbox_${'A'.repeat(24)}`, origin: 'https://shop.example', operationKey: 'quota-operation',
    input: publicPageContext, requestId: 'request-public-quota-issue',
  });
  await assert.rejects(
    () => service.redeem({ actorId: 'free-user', plan: 'FREE', handoffId: issued.handoffId, token: issued.token, requestId: 'request-public-quota-redeem' }),
    (error) => error instanceof ApplicationError && error.code === 'ACTIVE_TRANSACTION_LIMIT',
  );
  assert.equal(repository.claimed, null);
});

class MemoryParticipantCaptureRepository {
  transaction = {
    id: 'txn_1234567890abcdef1234567890abcdef', organizationId: 'org-1', status: 'CREATED', commerceContextId: null,
    originalArtifactSha256: null, normalizedSnapshotSha256: null,
    participantReferences: [{ role: 'SELLER', externalReference: 'seller@example.test' }],
    requiredArtifactTypes: ['PACKING_VIDEO'],
  };
  invitation = null;
  sessionMutation = null;
  capture = null;

  async findTransactionForOrganization(id, organizationId) {
    return this.transaction.id === id && this.transaction.organizationId === organizationId ? this.transaction : null;
  }

  async createOrReplayInvitation(mutation) {
    if (this.invitation && this.invitation.requestFingerprint !== mutation.requestFingerprint) {
      throw new ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'changed invitation');
    }
    if (this.invitation) return { created: false, claim: this.invitation.claim };
    this.invitation = { ...mutation, claimedActorId: null };
    return { created: true, claim: mutation.claim };
  }

  async claimParticipant(id, decide) {
    const snapshot = this.invitation?.claim.id === id ? {
      claim: this.invitation.claim,
      organizationId: this.invitation.organizationId,
      externalReferenceHash: this.invitation.externalReferenceHash,
      tokenHash: this.invitation.claimedActorId ? null : this.invitation.tokenHash,
      claimedActorId: this.invitation.claimedActorId,
    } : null;
    const decision = decide(snapshot);
    if (decision.type === 'REPLAY') return decision.result;
    const claimedAt = decision.event.occurredAt.toISOString();
    this.invitation.claimedActorId = decision.actorId;
    this.invitation.claim = { ...this.invitation.claim, status: 'CLAIMED', claimedAt, updatedAt: claimedAt };
    return { claim: this.invitation.claim, transactionId: this.invitation.claim.transactionId, role: this.invitation.claim.role, replayed: false };
  }

  async findClaimForOrganization(id, organizationId) {
    if (this.invitation?.claim.id !== id || this.invitation.organizationId !== organizationId) return null;
    return {
      claim: this.invitation.claim,
      organizationId,
      externalReferenceHash: this.invitation.externalReferenceHash,
      tokenHash: null,
      claimedActorId: this.invitation.claimedActorId,
    };
  }

  async createOrReplayEvidenceSession(mutation) {
    if (this.sessionMutation && this.sessionMutation.requestFingerprint !== mutation.requestFingerprint) {
      throw new ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'changed evidence session');
    }
    if (this.sessionMutation) return { created: false, session: this.sessionMutation.session };
    this.sessionMutation = mutation;
    return { created: true, session: mutation.session };
  }

  sessionSnapshot() {
    return this.sessionMutation ? {
      session: this.sessionMutation.session,
      organizationId: this.sessionMutation.organizationId,
      actorId: this.sessionMutation.actorId,
      participantClaimId: this.sessionMutation.participantClaimId,
      tokenHash: this.capture ? null : this.sessionMutation.tokenHash,
    } : null;
  }

  async findEvidenceSessionForOrganization(id, organizationId) {
    const value = this.sessionSnapshot();
    return value?.session.id === id && value.organizationId === organizationId ? value : null;
  }

  async findEvidenceSessionForActor(id, actorId) {
    const value = this.sessionSnapshot();
    return value?.session.id === id && value.actorId === actorId ? value : null;
  }

  async redeemEvidenceSession(id, captureId, decide) {
    const snapshot = this.sessionSnapshot();
    const decision = decide(snapshot?.session.id === id ? snapshot : null, this.capture?.id === captureId ? this.capture : null);
    if (decision.type === 'REPLAY') return decision.result;
    this.capture = decision.captureSession;
    const frozenAt = decision.captureSession.issuedAt.toISOString();
    this.sessionMutation.session = {
      ...this.sessionMutation.session,
      status: 'CAPTURING', captureState: 'CAPTURING', redemptionCount: 1,
      startedAt: frozenAt, updatedAt: frozenAt,
      originalArtifactSha256: this.sessionMutation.session.originalArtifactSha256 ?? null,
      normalizedSnapshotSha256: this.sessionMutation.session.normalizedSnapshotSha256 ?? null,
      intakeFrozenAt: this.sessionMutation.session.intakeFrozenAt ?? frozenAt,
    };
    return {
      evidenceSession: this.sessionMutation.session,
      captureAttestation: {
        mode: 'JIT_APP_CHECK', captureSessionId: this.capture.id, nonce: this.capture.nonce, appId: this.capture.appId,
        issuedAt: this.capture.issuedAt.toISOString(), captureWindowEndsAt: this.capture.captureWindowEndsAt.toISOString(),
        tokenReplayDetected: false, reasonCodes: [], sessionMode: this.capture.sessionMode,
        maxEvidenceCount: this.capture.maxEvidenceCount, captureGroupId: this.capture.captureGroupId,
      },
      replayed: false,
    };
  }

  async cancelEvidenceSession(id, organizationId, _actor, _requestId, at) {
    const snapshot = this.sessionSnapshot();
    if (!snapshot || snapshot.session.id !== id || snapshot.organizationId !== organizationId) {
      throw new ApplicationError('NOT_FOUND', 'EVIDENCE_SESSION_NOT_FOUND', 'missing');
    }
    if (snapshot.session.status === 'CANCELLED') return { session: snapshot.session, changed: false };
    this.sessionMutation.session = { ...snapshot.session, status: 'CANCELLED', captureState: 'CANCELLED', updatedAt: at.toISOString() };
    return { session: this.sessionMutation.session, changed: true };
  }
}

const participantTokenService = {
  issue: (purpose, id) => `token:${purpose}:${id}`,
  digest: (token) => sha256(token),
  verify: (token, digest) => sha256(token) === digest,
};

const participantMerchant = {
  type: 'MERCHANT_API_CLIENT', credentialId: 'cred-1', apiClientId: 'client-1', organizationId: 'org-1',
  environment: 'sandbox', scopes: ['participant_claims:write', 'evidence:read', 'evidence:write'],
};

test('participant claim requires a declared reference, token, authenticated actor, and is safely replayable', async () => {
  const repository = new MemoryParticipantCaptureRepository();
  const service = new ParticipantCaptureApplicationService(
    repository, participantTokenService, { append: async () => undefined }, new MerchantAuthorizationPolicy(), { environment: 'sandbox' }, () => now,
  );
  const invitation = await service.createInvitation({
    principal: participantMerchant, transactionId: repository.transaction.id,
    input: { role: 'SELLER', externalReference: 'seller@example.test', expiresInSeconds: 3600 },
    operationKey: 'participant-invitation-1', requestId: 'request-invitation-1',
  });
  const replay = await service.createInvitation({
    principal: participantMerchant, transactionId: repository.transaction.id,
    input: { role: 'SELLER', externalReference: 'seller@example.test', expiresInSeconds: 3600 },
    operationKey: 'participant-invitation-1', requestId: 'request-invitation-2',
  });
  assert.equal(invitation.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(repository.invitation.tokenHash, sha256(invitation.token));
  assert.equal('externalReference' in repository.invitation, false);
  await assert.rejects(
    () => service.claimParticipant({ principal: { type: 'PACKPROOF_USER', actorId: 'user-1', appId: 'app-1' }, claimId: invitation.claim.id, token: 'wrong', requestId: 'claim-wrong' }),
    (error) => error instanceof ApplicationError && error.code === 'INVALID_PARTICIPANT_CLAIM_TOKEN',
  );
  const claimed = await service.claimParticipant({
    principal: { type: 'PACKPROOF_USER', actorId: 'user-1', appId: 'app-1' }, claimId: invitation.claim.id, token: invitation.token, requestId: 'claim-1',
  });
  assert.equal(claimed.replayed, false);
  assert.equal(claimed.role, 'SELLER');
  const claimedReplay = await service.claimParticipant({
    principal: { type: 'PACKPROOF_USER', actorId: 'user-1', appId: 'app-1' }, claimId: invitation.claim.id, token: 'consumed', requestId: 'claim-2',
  });
  assert.equal(claimedReplay.replayed, true);
  await assert.rejects(
    () => service.claimParticipant({ principal: { type: 'PACKPROOF_USER', actorId: 'attacker', appId: 'app-2' }, claimId: invitation.claim.id, token: 'consumed', requestId: 'claim-attacker' }),
    (error) => error instanceof ApplicationError && error.code === 'PARTICIPANT_CLAIM_ALREADY_USED',
  );
});

test('evidence session is role/type/artifact bounded, one-time redeemable, App-Check contextual, cancellable, and replay-safe', async () => {
  const repository = new MemoryParticipantCaptureRepository();
  const service = new ParticipantCaptureApplicationService(
    repository, participantTokenService, { append: async () => undefined }, new MerchantAuthorizationPolicy(), { environment: 'sandbox' }, () => now,
  );
  const invitation = await service.createInvitation({
    principal: participantMerchant, transactionId: repository.transaction.id,
    input: { role: 'SELLER', externalReference: 'seller@example.test', expiresInSeconds: 3600 },
    operationKey: 'participant-invitation-2', requestId: 'request-invitation-3',
  });
  await service.claimParticipant({
    principal: { type: 'PACKPROOF_USER', actorId: 'user-1', appId: 'app-1' }, claimId: invitation.claim.id, token: invitation.token, requestId: 'claim-3',
  });
  repository.transaction.requiredArtifactTypes = [];
  await assert.rejects(
    () => service.createEvidenceSession({
      principal: participantMerchant, transactionId: repository.transaction.id,
      input: { participantClaimId: invitation.claim.id, type: 'PHYSICAL_REFERENCE', allowedArtifactTypes: ['PACKING_VIDEO'], expiresInSeconds: 3600, maximumRedemptions: 1, requestedEvidenceCount: 15, captureProfileId: 'PP-PHYSICAL-MATTE-V1', captureGroupId: 'physical-group-1' },
      operationKey: 'evidence-invalid-physical-type', requestId: 'evidence-invalid-physical-type',
    }),
    (error) => error instanceof ApplicationError && error.code === 'INVALID_PHYSICAL_ARTIFACT_TYPE',
  );
  repository.transaction.requiredArtifactTypes = ['PACKING_VIDEO'];
  await assert.rejects(
    () => service.createEvidenceSession({
      principal: participantMerchant, transactionId: repository.transaction.id,
      input: { participantClaimId: invitation.claim.id, type: 'RECEIVER_OPEN', allowedArtifactTypes: ['PACKING_VIDEO'], expiresInSeconds: 3600, maximumRedemptions: 1, requestedEvidenceCount: 1, captureProfileId: null, captureGroupId: null },
      operationKey: 'evidence-invalid-role', requestId: 'evidence-invalid-role',
    }),
    (error) => error instanceof ApplicationError && error.code === 'ROLE_SESSION_TYPE_MISMATCH',
  );
  const issued = await service.createEvidenceSession({
    principal: participantMerchant, transactionId: repository.transaction.id,
    input: { participantClaimId: invitation.claim.id, type: 'OUTBOUND_PACK', allowedArtifactTypes: ['PACKING_VIDEO'], expiresInSeconds: 3600, maximumRedemptions: 1, requestedEvidenceCount: 1, captureProfileId: null, captureGroupId: null },
    operationKey: 'evidence-session-1', requestId: 'evidence-session-request-1',
  });
  assert.equal(issued.session.actorRole, 'SELLER');
  assert.deepEqual(issued.session.allowedArtifactTypes, ['PACKING_VIDEO']);
  await assert.rejects(
    () => service.redeemEvidenceSession({
      principal: { type: 'PACKPROOF_USER', actorId: 'attacker', appId: 'app-2' }, evidenceSessionId: issued.session.id,
      input: { operationKey: 'native-operation-1', token: issued.token, runtimeArtifactHash: null }, requestId: 'redeem-attacker',
    }),
    (error) => error instanceof ApplicationError && error.code === 'EVIDENCE_SESSION_ACTOR_MISMATCH',
  );
  const redeemed = await service.redeemEvidenceSession({
    principal: { type: 'PACKPROOF_USER', actorId: 'user-1', appId: 'app-1' }, evidenceSessionId: issued.session.id,
    input: { operationKey: 'native-operation-1', token: issued.token, runtimeArtifactHash: 'a'.repeat(64) }, requestId: 'redeem-1',
  });
  assert.equal(redeemed.replayed, false);
  assert.equal(redeemed.captureAttestation.appId, 'app-1');
  assert.equal(redeemed.evidenceSession.intakeFrozenAt, now.toISOString());
  assert.deepEqual(repository.capture.allowedEvidenceTypes, ['PACKING_VIDEO']);
  const redeemReplay = await service.redeemEvidenceSession({
    principal: { type: 'PACKPROOF_USER', actorId: 'user-1', appId: 'app-1' }, evidenceSessionId: issued.session.id,
    input: { operationKey: 'native-operation-1', token: 'consumed', runtimeArtifactHash: 'a'.repeat(64) }, requestId: 'redeem-2',
  });
  assert.equal(redeemReplay.replayed, true);
  const cancelled = await service.cancelEvidenceSession({ principal: participantMerchant, evidenceSessionId: issued.session.id, requestId: 'cancel-1' });
  assert.equal(cancelled.session.status, 'CANCELLED');
  assert.equal(cancelled.replayed, false);
  const cancelReplay = await service.cancelEvidenceSession({ principal: participantMerchant, evidenceSessionId: issued.session.id, requestId: 'cancel-2' });
  assert.equal(cancelReplay.replayed, true);
});

test('consumer intake normalizes share and email artifacts into pending commerce contexts', async () => {
  const records = [];
  const claimed = new Map();
  const repository = {
    async createOrReplay(mutation) {
      const existing = records.find((entry) => entry.actorId === mutation.actorId && entry.operationKey === mutation.operationKey);
      if (existing && existing.requestFingerprint !== mutation.requestFingerprint) {
        throw new ApplicationError('CONFLICT', 'IDEMPOTENCY_KEY_REUSED', 'changed intake');
      }
      if (existing) return { created: false };
      records.push(mutation);
      return { created: true };
    },
    async listPendingForActor(actorId) {
      return records.filter((entry) => entry.actorId === actorId && !claimed.has(entry.commerceContextId)).map((entry) => ({
        commerceContextId: entry.commerceContextId,
        passportDraftId: entry.passportDraftId,
        title: entry.commerceContext.item.title,
        variant: entry.commerceContext.item.selectedOptions.map((option) => `${option.name}: ${option.value}`).join('; ') || null,
        quantity: entry.commerceContext.item.quantity,
        amount: entry.commerceContext.item.amount,
        orderNumber: entry.commerceContext.source.externalOrderId,
        intakeSourceType: entry.commerceContext.source.intakeSourceType,
        platformIdentifier: entry.commerceContext.source.platformIdentifier,
        importedAt: entry.commerceContext.source.capturedAt,
        missingFields: entry.pending.missingFields,
      }));
    },
    async hasActiveTransactionForSeller() {
      return claimed.size > 0;
    },
    async claim(commerceContextId, decide) {
      const entry = records.find((item) => item.commerceContextId === commerceContextId) ?? null;
      const snapshot = entry ? {
        actorId: entry.actorId,
        status: claimed.has(commerceContextId) ? 'CLAIMED' : 'PENDING',
        transactionId: claimed.get(commerceContextId) ?? null,
        expiresAt: new Date(entry.commerceContext.expiresAt),
        commerceContext: entry.commerceContext,
        passportDraft: entry.passportDraft,
      } : null;
      const transactionId = claimed.get(commerceContextId) ?? `txn_intake${String(claimed.size + 1).padStart(8, '0')}`;
      const decision = decide(snapshot, transactionId);
      if (decision.type === 'REPLAY') return decision.result;
      claimed.set(commerceContextId, transactionId);
      return { transactionId, commerceContextId: snapshot.commerceContext.id, passportDraftId: snapshot.passportDraft.id, replayed: false };
    },
  };
  const service = new TransactionIntakeApplicationService(repository, () => now);
  const item = {
    title: 'Nintendo Switch 2',
    description: 'Mario Kart World Bundle',
    category: null,
    brand: 'Nintendo',
    model: 'Switch 2',
    sku: null,
    gtin: null,
    upc: null,
    mpn: null,
    serialNumber: null,
    selectedOptions: [{ name: 'Bundle', value: 'Mario Kart World' }],
    identifiers: [],
    quantity: 1,
    amount: { currency: 'USD', minorUnits: 44900 },
    imageReferences: [],
  };
  const first = await service.ingest({
    actorId: 'seller-1',
    integrationId: 'int_12345678',
    organizationId: null,
    operationKey: 'intake-1',
    requestId: 'request-intake-1',
    intakeSourceType: 'EMAIL_RECEIPT',
    platformIdentifier: 'EBAY',
    parserVersion: 'EBAY_EMAIL_PARSER_V1',
    originalArtifactSha256: 'a'.repeat(64),
    item,
    externalOrderId: '784920',
    externalListingId: null,
    productUrl: null,
  });
  const replay = await service.ingest({
    actorId: 'seller-1',
    integrationId: 'int_12345678',
    organizationId: null,
    operationKey: 'intake-1',
    requestId: 'request-intake-2',
    intakeSourceType: 'EMAIL_RECEIPT',
    platformIdentifier: 'EBAY',
    parserVersion: 'EBAY_EMAIL_PARSER_V1',
    originalArtifactSha256: 'a'.repeat(64),
    item,
    externalOrderId: '784920',
    externalListingId: null,
    productUrl: null,
  });
  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(first.pending.title, 'Nintendo Switch 2');
  assert.equal(first.pending.orderNumber, '784920');
  assert.equal(first.parserVersion, 'EBAY_EMAIL_PARSER_V1');
  assert.equal(records[0].commerceContext.source.trustLevel, 'USER_PROVIDED_COMMERCE_ARTIFACT');
  assert.equal(records[0].commerceContext.status, 'CREATED');
  const pending = await service.listPending('seller-1');
  assert.equal(pending.length, 1);
  assert.equal(pending[0].variant, 'Bundle: Mario Kart World');
  await assert.rejects(
    () => service.ingest({
      actorId: 'seller-1',
      integrationId: 'int_12345678',
      organizationId: null,
      operationKey: 'intake-1',
      requestId: 'request-intake-3',
      intakeSourceType: 'EMAIL_RECEIPT',
      platformIdentifier: 'EBAY',
      parserVersion: 'EBAY_EMAIL_PARSER_V1',
      originalArtifactSha256: 'b'.repeat(64),
      item,
      externalOrderId: '784920',
      externalListingId: null,
      productUrl: null,
    }),
    (error) => error instanceof ApplicationError && error.code === 'IDEMPOTENCY_KEY_REUSED',
  );

  const artifactText = [
    'From: "eBay" <ebay@ebay.com>',
    'Subject: You sold Nintendo Switch 2',
    '',
    'Congratulations! You sold an item.',
    'Item: Nintendo Switch 2',
    'Sold for: US $449.00',
    'Order number: 12-34567-89012',
    'Variant: Mario Kart World Bundle',
  ].join('\n');
  const parsed = service.preview(artifactText, 'EMAIL_RECEIPT');
  assert.equal(parsed.parserVersion, 'EBAY_EMAIL_PARSER_V1');
  assert.equal(parsed.item.title, 'Nintendo Switch 2');
  const imported = await service.ingestArtifact({
    actorId: 'seller-1',
    operationKey: 'intake-email-1',
    requestId: 'request-intake-email-1',
    intakeSourceType: 'EMAIL_RECEIPT',
    originalArtifactSha256: sha256(artifactText),
    artifactText,
  });
  assert.equal(imported.pending.orderNumber, '12-34567-89012');
  assert.equal(imported.pending.missingFields.includes('title'), false);
  await assert.rejects(
    () => service.ingestArtifact({
      actorId: 'seller-1',
      operationKey: 'intake-email-bad',
      requestId: 'request-intake-email-bad',
      intakeSourceType: 'EMAIL_RECEIPT',
      originalArtifactSha256: 'c'.repeat(64),
      artifactText,
    }),
    (error) => error instanceof ApplicationError && error.code === 'ARTIFACT_HASH_MISMATCH',
  );

  const started = await service.start({
    actorId: 'seller-1',
    plan: 'PRO',
    commerceContextId: imported.commerceContextId,
    requestId: 'request-intake-start-1',
  });
  assert.equal(started.replayed, false);
  assert.match(started.transactionId, /^txn_/);
  const startedReplay = await service.start({
    actorId: 'seller-1',
    plan: 'PRO',
    commerceContextId: imported.commerceContextId,
    requestId: 'request-intake-start-2',
  });
  assert.equal(startedReplay.replayed, true);
  assert.equal(startedReplay.transactionId, started.transactionId);
  await assert.rejects(
    () => service.start({ actorId: 'attacker', plan: 'PRO', commerceContextId: imported.commerceContextId, requestId: 'request-intake-start-3' }),
    (error) => error instanceof ApplicationError && error.code === 'INTAKE_ACTOR_MISMATCH',
  );
});

test('portal workspace authorizes participants, maps DTOs, and refuses browser capture semantics', async () => {
  const principal = { type: 'PORTAL_USER', actorId: 'seller-1', appId: 'app-1', channel: 'WEB_PORTAL' };
  const record = {
    id: 'legacyTxPortal01',
    organizationId: null,
    integrationId: null,
    merchantReference: '1284921',
    title: 'Sony WH-1000XM6',
    description: 'Headphones',
    category: 'electronics',
    status: 'ACTIVE',
    consumerStatus: 'TERMS_LOCKED',
    amount: { currency: 'USD', minorUnits: 34900 },
    terms: { saleType: 'SHIPPED', shippingResponsibility: 'SELLER', returns: 'AS_AGREED', returnWindowDays: 14, customTerms: '' },
    sellerId: 'seller-1',
    buyerId: 'buyer-1',
    participantIds: ['seller-1', 'buyer-1'],
    confirmedBy: ['seller-1', 'buyer-1'],
    handoffConfirmedBy: [],
    completedBy: [],
    identifiers: [],
    conditionNotes: '',
    lockedAt: null,
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
    passportId: null,
    passportDisplayId: null,
    passportIssuedAt: null,
    createdAt: now,
    updatedAt: now,
  };
  const repository = {
    records: new Map([[record.id, record]]),
    async listForParticipant(actorId) {
      return [...this.records.values()].filter((item) => item.participantIds.includes(actorId));
    },
    async findForParticipant(transactionId, actorId) {
      const item = this.records.get(transactionId);
      return item?.participantIds.includes(actorId) ? item : null;
    },
    async listEvidence() { return []; },
    async listTimeline() { return []; },
    async listReturns() { return []; },
    async findCommerceContext() { return null; },
    async bindPassportIdentity(_id, identity) {
      const item = this.records.get(_id);
      if (item) item.proofReady = true;
      return identity;
    },
  };
  const audits = [];
  const service = new PortalWorkspaceApplicationService(
    repository,
    { append: async (event) => { audits.push(event); } },
    () => 'https://packproof.link',
    () => now,
  );
  const listed = await service.listTransactions(principal);
  assert.equal(listed.length, 1);
  assert.equal(listed[0].object, 'portal_transaction');
  assert.equal(listed[0].status, 'TERMS_LOCKED');
  assert.equal(listed[0].source.platform, 'eBay');
  await assert.rejects(
    () => service.getTransaction(principal, 'not-yours-tx'),
    (error) => error instanceof ApplicationError && error.code === 'TRANSACTION_NOT_FOUND',
  );
  const outsider = { ...principal, actorId: 'stranger' };
  await assert.rejects(
    () => service.getTransaction(outsider, record.id),
    (error) => error instanceof ApplicationError && error.code === 'TRANSACTION_NOT_FOUND',
  );
  const handoff = await service.createMobileHandoff(principal, record.id, 'START_PACKING', 'request-portal-1');
  assert.equal(handoff.captureOnNativeOnly, true);
  assert.equal(handoff.channel, 'WEB_PORTAL');
  assert.match(handoff.universalLink, /\/portal\/open\?transaction=/);
  assert.match(handoff.appLink, /^packproof:\/\//);
  assert.equal(audits[0].metadata.channel, 'WEB_PORTAL');
  await assert.rejects(
    () => service.createMobileHandoff(principal, record.id, 'BROWSER_UPLOAD', 'request-portal-2'),
    (error) => error instanceof ApplicationError && error.code === 'UNSUPPORTED_PORTAL_HANDOFF',
  );
});

