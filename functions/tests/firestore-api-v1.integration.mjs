import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const { createApiV1App } = require('../lib/api/v1/app.js');
const { FirestoreAuditWriter, FirestoreIdempotencyStore, FirestoreRateLimiter } = require('../lib/api/v1/controls.js');
const { ApiError, canonicalize, sha256 } = require('../lib/api/v1/core.js');
const { FirestoreReadinessChecker, FirestoreTransactionRepository } = require('../lib/api/v1/firestore.js');
const { AuthorizationService, FirestoreMerchantAuthenticator, createApiSecretVerifier } = require('../lib/api/v1/security.js');
const { TransactionService } = require('../lib/api/v1/transaction-service.js');
const { PublicCommerceHandoffApplicationService } = require('../lib/application/v1/public-commerce-handoff-service.js');
const { ParticipantCaptureApplicationService } = require('../lib/application/v1/participant-capture-service.js');
const { MerchantAuthorizationPolicy } = require('../lib/application/v1/merchant-transaction-service.js');
const { MerchantEvidenceApplicationService } = require('../lib/application/v1/merchant-evidence-service.js');
const { MerchantConnectApplicationService } = require('../lib/application/v1/merchant-connect-service.js');
const { CommerceContextApplicationService } = require('../lib/application/v1/commerce-context-service.js');
const { HmacParticipantHandoffTokenIssuer } = require('../lib/infrastructure/crypto/participant-handoff-token-issuer.js');
const { HmacPublicHandoffTokenIssuer } = require('../lib/infrastructure/crypto/public-handoff-token-issuer.js');
const { HmacConnectSessionTokenIssuer } = require('../lib/infrastructure/crypto/connect-session-token-issuer.js');
const { Sha256TokenVerifier } = require('../lib/infrastructure/crypto/sha256-token-verifier.js');
const { FirestorePublicCommerceHandoffRepository } = require('../lib/infrastructure/firebase/v1/public-commerce-handoff-repository.js');
const { FirestoreParticipantCaptureRepository } = require('../lib/infrastructure/firebase/v1/participant-capture-repository.js');
const { FirestoreCommerceContextRepository } = require('../lib/infrastructure/firebase/v1/commerce-context-repository.js');
const {
  FirestoreMerchantConnectAdapter,
  FirestoreMerchantEvidenceRepository,
} = require('../lib/infrastructure/firebase/v1/merchant-evidence-repository.js');

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const adminApp = emulatorAvailable ? initializeApp({ projectId: 'packproof-api-test' }, `api-v1-${Date.now()}`) : null;
const firestore = adminApp ? getFirestore(adminApp) : null;
const pepper = 'integration-test-pepper-that-is-never-production';
const secretA = 'A'.repeat(43);
const secretB = 'B'.repeat(43);
const credentialA = 'credential_test_a1';
const credentialB = 'credential_test_b1';
const tokenA = `pp_sandbox_${credentialA}.${secretA}`;
const tokenB = `pp_sandbox_${credentialB}.${secretB}`;
let server;
let baseUrl;

async function seedIdentity(organizationId, apiClientId, credentialId, secret) {
  await Promise.all([
    firestore.collection('organizations').doc(organizationId).set({ id: organizationId, name: organizationId, status: 'ACTIVE' }),
    firestore.collection('apiClients').doc(apiClientId).set({
      id: apiClientId,
      organizationId,
      environment: 'sandbox',
      status: 'ACTIVE',
      scopes: ['transactions:read', 'transactions:write', 'participant_claims:write', 'evidence:read', 'evidence:write'],
    }),
    firestore.collection('apiCredentials').doc(credentialId).set({
      id: credentialId,
      apiClientId,
      organizationId,
      environment: 'sandbox',
      status: 'ACTIVE',
      scopes: ['transactions:read', 'transactions:write', 'participant_claims:write', 'evidence:read', 'evidence:write'],
      secretVerifier: createApiSecretVerifier(secret, pepper),
    }),
  ]);
}

before(async () => {
  if (!emulatorAvailable) return;
  await seedIdentity('org-integration-a', 'client-integration-a', credentialA, secretA);
  await seedIdentity('org-integration-b', 'client-integration-b', credentialB, secretB);
  await firestore.collection('platformIntegrations').doc('integration-http-button').set({
    status: 'ACTIVE',
    environment: 'SANDBOX',
    publishableKeyHash: sha256(`pp_pub_sandbox_${'A'.repeat(24)}`),
    allowedOrigins: ['https://shop.example'],
  });
  const transactionService = new TransactionService(
    new FirestoreTransactionRepository(firestore),
    new FirestoreIdempotencyStore(firestore),
    new FirestoreAuditWriter(firestore),
    new AuthorizationService(),
    { environment: 'sandbox' },
  );
  const app = createApiV1App({
    authenticator: new FirestoreMerchantAuthenticator(firestore, () => 'sandbox', () => pepper),
    participantAuthenticator: {
      authenticate: async (authorization, appCheckToken) => {
        if (authorization !== 'Bearer participant-http-token' || appCheckToken !== 'participant-http-app-check') {
          throw new ApiError(401, 'INVALID_PARTICIPANT_AUTHENTICATION', 'A valid PackProof user session and App Check token are required.');
        }
        return { type: 'PACKPROOF_USER', actorId: 'participant-http-user', appId: 'participant-http-app' };
      },
    },
    rateLimiter: new FirestoreRateLimiter(firestore),
    readiness: new FirestoreReadinessChecker(firestore),
    transactionService,
    publicCommerceHandoffService: new PublicCommerceHandoffApplicationService(
      new FirestorePublicCommerceHandoffRepository(firestore),
      new HmacPublicHandoffTokenIssuer(() => 'firestore-http-public-handoff-secret-with-32-characters'),
      new Sha256TokenVerifier(),
      () => 'sandbox',
    ),
    participantCaptureService: new ParticipantCaptureApplicationService(
      new FirestoreParticipantCaptureRepository(firestore),
      new HmacParticipantHandoffTokenIssuer(() => 'firestore-http-participant-handoff-secret-over-32-chars'),
      new FirestoreAuditWriter(firestore),
      new MerchantAuthorizationPolicy(),
      { environment: 'sandbox' },
    ),
    merchantEvidenceService: new MerchantEvidenceApplicationService(
      new FirestoreMerchantEvidenceRepository(firestore),
      new FirestoreIdempotencyStore(firestore),
      new FirestoreAuditWriter(firestore),
      new MerchantAuthorizationPolicy(),
      { generate: async (transactionId) => ({ reportId: 'report_emulator', storagePath: `reports/${transactionId}/emulator.pdf`, sha256: 'e'.repeat(64), evidenceCount: 0 }) },
      { sign: async () => 'https://files.example/emulator.pdf' },
      { environment: 'sandbox' },
    ),
    merchantConnectService: new MerchantConnectApplicationService(
      new CommerceContextApplicationService(
        new FirestoreCommerceContextRepository(firestore),
        new HmacConnectSessionTokenIssuer(),
      ),
      new FirestoreMerchantConnectAdapter(firestore),
      new FirestoreMerchantConnectAdapter(firestore),
      { validate: async () => undefined },
      new MerchantAuthorizationPolicy(),
      { environment: 'sandbox' },
      () => 'https://packproof.example',
    ),
    publicHandoffReviewBaseUrl: () => 'https://packproof.example',
    participantHandoffBaseUrl: () => 'https://packproof.example',
  });
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  if (server) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (adminApp) await deleteApp(adminApp);
});

async function request(path, token, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, ...(init.headers ?? {}) },
  });
  return { response, body: await response.json() };
}

test('public HTTP handoff persists a page-declared context and exact replay through Firestore', { skip: !emulatorAvailable }, async () => {
  const publishableKey = `pp_pub_sandbox_${'A'.repeat(24)}`;
  const payload = {
    schemaVersion: 1,
    source: {
      platform: 'STRUCTURED_PAGE_DATA',
      productUrl: 'https://shop.example/products/http-camera',
      externalProductId: 'http-product-42',
      externalListingId: null,
      externalVariantId: 'black',
    },
    item: {
      title: 'HTTP emulator camera',
      description: 'Complete structured product description through the HTTP boundary.',
      category: 'Vintage cameras',
      brand: 'Example Optics',
      model: 'RF-50',
      sku: 'RF50-HTTP',
      gtin: null,
      upc: null,
      mpn: null,
      serialNumber: null,
      selectedOptions: [{ name: 'Finish', value: 'Black' }],
      identifiers: [{ type: 'SKU', value: 'RF50-HTTP' }],
      quantity: 1,
      amount: { currency: 'USD', minorUnits: 119900 },
      imageReferences: [],
    },
  };
  const init = {
    method: 'POST',
    headers: { origin: 'https://shop.example', 'content-type': 'application/json', 'idempotency-key': 'http-public-handoff-1' },
    body: JSON.stringify(payload),
  };
  const firstResponse = await fetch(`${baseUrl}/v1/public/integrations/${publishableKey}/handoffs`, init);
  const first = await firstResponse.json();
  assert.equal(firstResponse.status, 201);
  assert.equal(firstResponse.headers.get('access-control-allow-origin'), 'https://shop.example');
  assert.equal(first.data.trustLevel, 'PAGE_DECLARED');
  const replayResponse = await fetch(`${baseUrl}/v1/public/integrations/${publishableKey}/handoffs`, init);
  const replay = await replayResponse.json();
  assert.equal(replayResponse.status, 200);
  assert.equal(replayResponse.headers.get('idempotent-replayed'), 'true');
  assert.equal(replay.data.id, first.data.id);

  const [handoff, context, draft] = await Promise.all([
    firestore.collection('publicCommerceHandoffs').doc(first.data.id).get(),
    firestore.collection('commerceContexts').doc(first.data.commerceContextId).get(),
    firestore.collection('passportDrafts').doc(first.data.passportDraftId).get(),
  ]);
  assert.equal(handoff.data().status, 'PENDING_CLAIM');
  assert.equal(context.data().source.trustLevel, 'PAGE_DECLARED');
  assert.equal(context.data().source.externalOrderId, null);
  assert.equal(context.data().item.description, payload.item.description);
  assert.equal(draft.data().status, 'READY_FOR_REVIEW');
  assert.equal(draft.data().item.description, payload.item.description);
});

test('Firestore adapters preserve idempotency, organization isolation, audit linkage, and credential usage', { skip: !emulatorAvailable }, async () => {
  const payload = {
    merchantReference: 'firestore-order-1',
    title: 'Emulator-backed transaction',
    amount: { currency: 'USD', minorUnits: 9999 },
    participants: [{ role: 'SELLER', externalReference: 'seller-emulator' }],
    captureRequirements: { requiredArtifactTypes: ['ITEM_PHOTO'] },
  };
  const init = {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'firestore-idempotency-1', 'x-request-id': 'firestore-request-1' },
    body: JSON.stringify(payload),
  };
  const created = await request('/v1/transactions', tokenA, init);
  assert.equal(created.response.status, 201);
  assert.match(created.body.data.id, /^txn_[a-f0-9]{32}$/);

  const replay = await request('/v1/transactions', tokenA, init);
  assert.equal(replay.response.status, 200);
  assert.equal(replay.response.headers.get('idempotent-replayed'), 'true');
  assert.equal(replay.body.data.id, created.body.data.id);

  const wrongSecret = await request('/v1/transactions', `pp_sandbox_${credentialA}.${'C'.repeat(43)}`);
  assert.equal(wrongSecret.response.status, 401);
  const wrongEnvironment = await request('/v1/transactions', tokenA.replace('pp_sandbox_', 'pp_live_'));
  assert.equal(wrongEnvironment.response.status, 401);

  const ownerRead = await request(`/v1/transactions/${created.body.data.id}`, tokenA);
  assert.equal(ownerRead.response.status, 200);
  assert.equal(ownerRead.body.data.category, null);
  const crossOrganizationRead = await request(`/v1/transactions/${created.body.data.id}`, tokenB);
  assert.equal(crossOrganizationRead.response.status, 404);

  const listed = await request('/v1/transactions?merchantReference=firestore-order-1&limit=1', tokenA);
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.data.length, 1);
  assert.equal(listed.body.data[0].id, created.body.data.id);

  const transactionSnap = await firestore.collection('transactions').doc(created.body.data.id).get();
  assert.equal(transactionSnap.data().sourceType, 'MERCHANT_API');
  assert.deepEqual(transactionSnap.data().participantIds, []);
  assert.equal(transactionSnap.data().sellerId, null);

  const outboxSnap = await firestore.collection('domainOutbox').where('resourceId', '==', created.body.data.id).get();
  assert.equal(outboxSnap.size, 1);
  assert.equal(outboxSnap.docs[0].data().type, 'TRANSACTION_CREATED');
  assert.equal(outboxSnap.docs[0].data().deliveryState, 'PENDING');

  const idempotencySnap = await firestore.collection('apiIdempotencyRecords').get();
  assert.ok(idempotencySnap.size >= 1);
  const matching = idempotencySnap.docs.find((d) => d.data().keyHash === sha256('firestore-idempotency-1'));
  assert.ok(matching, 'expected an idempotency record for the request key');
  assert.equal(matching.data().state, 'COMPLETE');
  assert.equal(JSON.stringify(idempotencySnap.docs[0].data()).includes(secretA), false);

  const auditSnap = await firestore.collection('apiAuditStreams').doc('org-integration-a').collection('events').get();
  assert.equal(auditSnap.size, 1);
  const audit = auditSnap.docs[0].data();
  const expectedHash = sha256(canonicalize({
    eventId: audit.eventId,
    sequence: audit.sequence,
    type: audit.type,
    organizationId: audit.organizationId,
    actor: audit.actor,
    resourceType: audit.resourceType,
    resourceId: audit.resourceId,
    requestId: audit.requestId,
    occurredAt: audit.occurredAt,
    metadata: audit.metadata,
    previousHash: audit.previousHash,
  }));
  assert.equal(audit.eventHash, expectedHash);
  assert.equal(audit.previousHash, 'GENESIS');

  const credentialSnap = await firestore.collection('apiCredentials').doc(credentialA).get();
  assert.equal(credentialSnap.data().secret, undefined);
  assert.equal(credentialSnap.data().usageCount, undefined);
  let credentialUsageSnap;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    credentialUsageSnap = await firestore.collection('apiCredentials').doc(credentialA).collection('usage').get();
    if (credentialUsageSnap.size >= 4) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.ok(credentialUsageSnap.size >= 4);
  assert.ok(credentialUsageSnap.docs.every((doc) => doc.data().usedAt));
  const rateSnap = await firestore.collection('apiRateLimits').get();
  assert.ok(rateSnap.size >= 3);

  await firestore.collection('transactions').doc(created.body.data.id).update({ amount: { currency: 'USD', minorUnits: 'corrupt' } });
  const corruptPersistence = await request(`/v1/transactions/${created.body.data.id}`, tokenA);
  assert.equal(corruptPersistence.response.status, 500);
  assert.equal(corruptPersistence.body.error.code, 'INTERNAL_ERROR');
  assert.equal(JSON.stringify(corruptPersistence.body).includes('minorUnits'), false);
  await firestore.collection('transactions').doc(created.body.data.id).update({ amount: { currency: 'USD', minorUnits: 9999 } });

  await firestore.collection('apiCredentials').doc(credentialA).update({ status: 'REVOKED' });
  const revoked = await request('/v1/transactions', tokenA);
  assert.equal(revoked.response.status, 401);
  await firestore.collection('apiCredentials').doc(credentialA).update({ status: 'ACTIVE' });
});

test('HTTP participant claim and evidence-session flow persists one actor-bound native capture authorization', { skip: !emulatorAvailable }, async () => {
  const transaction = await request('/v1/transactions', tokenA, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'firestore-participant-transaction-1' },
    body: JSON.stringify({
      merchantReference: 'firestore-participant-order-1',
      title: 'Actor-bound HTTP evidence transaction',
      participants: [{ role: 'SELLER', externalReference: 'seller-http-reference-1' }],
      captureRequirements: { requiredArtifactTypes: ['PACKING_VIDEO'] },
    }),
  });
  assert.equal(transaction.response.status, 201);

  const invitation = await request(`/v1/transactions/${transaction.body.data.id}/participant-invitations`, tokenA, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'firestore-participant-invitation-1' },
    body: JSON.stringify({ schemaVersion: 1, role: 'SELLER', externalReference: 'seller-http-reference-1', expiresInSeconds: 3600 }),
  });
  assert.equal(invitation.response.status, 201);
  assert.equal(invitation.body.data.status, 'ISSUED');
  assert.match(invitation.body.claimInstructions.token, /^pp_claim_v1_/);
  const claimAtRest = await firestore.collection('participantClaims').doc(invitation.body.data.id).get();
  assert.notEqual(claimAtRest.data().tokenHash, invitation.body.claimInstructions.token);
  assert.equal(claimAtRest.data().token, undefined);

  const missingAppCheck = await fetch(`${baseUrl}/v1/participant-claims`, {
    method: 'POST',
    headers: { authorization: 'Bearer participant-http-token', 'content-type': 'application/json' },
    body: JSON.stringify({ schemaVersion: 1, claimId: invitation.body.data.id, token: invitation.body.claimInstructions.token }),
  });
  assert.equal(missingAppCheck.status, 401);

  const claimedResponse = await fetch(`${baseUrl}/v1/participant-claims`, {
    method: 'POST',
    headers: {
      authorization: 'Bearer participant-http-token',
      'x-firebase-appcheck': 'participant-http-app-check',
      'content-type': 'application/json',
    },
    body: JSON.stringify({ schemaVersion: 1, claimId: invitation.body.data.id, token: invitation.body.claimInstructions.token }),
  });
  const claimed = await claimedResponse.json();
  assert.equal(claimedResponse.status, 201);
  assert.equal(claimed.data.status, 'CLAIMED');

  const evidence = await request(`/v1/transactions/${transaction.body.data.id}/evidence-sessions`, tokenA, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'firestore-evidence-session-1' },
    body: JSON.stringify({
      schemaVersion: 1,
      participantClaimId: invitation.body.data.id,
      type: 'OUTBOUND_PACK',
      allowedArtifactTypes: ['PACKING_VIDEO'],
      expiresInSeconds: 3600,
      maximumRedemptions: 1,
      requestedEvidenceCount: 1,
      captureProfileId: null,
      captureGroupId: null,
    }),
  });
  assert.equal(evidence.response.status, 201);
  assert.match(evidence.body.redemptionInstructions.token, /^pp_capture_v1_/);
  const ownerRead = await request(`/v1/evidence-sessions/${evidence.body.data.id}`, tokenA);
  assert.equal(ownerRead.response.status, 200);
  const crossOrganizationRead = await request(`/v1/evidence-sessions/${evidence.body.data.id}`, tokenB);
  assert.equal(crossOrganizationRead.response.status, 404);

  const redemptionInit = {
    method: 'POST',
    headers: {
      authorization: 'Bearer participant-http-token',
      'x-firebase-appcheck': 'participant-http-app-check',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      schemaVersion: 1,
      operationKey: 'firestore-native-redemption-1',
      token: evidence.body.redemptionInstructions.token,
      runtimeArtifactHash: 'b'.repeat(64),
    }),
  };
  const redeemedResponse = await fetch(`${baseUrl}/v1/evidence-sessions/${evidence.body.data.id}/redeem`, redemptionInit);
  const redeemed = await redeemedResponse.json();
  assert.equal(redeemedResponse.status, 201);
  assert.equal(redeemed.captureAttestation.appId, 'participant-http-app');
  assert.equal(redeemed.data.status, 'CAPTURING');

  const replayResponse = await fetch(`${baseUrl}/v1/evidence-sessions/${evidence.body.data.id}/redeem`, {
    ...redemptionInit,
    body: JSON.stringify({
      schemaVersion: 1,
      operationKey: 'firestore-native-redemption-1',
      token: 'pp_capture_v1_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      runtimeArtifactHash: null,
    }),
  });
  const replay = await replayResponse.json();
  assert.equal(replayResponse.status, 200);
  assert.equal(replayResponse.headers.get('idempotent-replayed'), 'true');
  assert.equal(replay.captureAttestation.captureSessionId, redeemed.captureAttestation.captureSessionId);
  assert.equal(replay.captureAttestation.nonce, redeemed.captureAttestation.nonce);

  const [sessionAtRest, captureAtRest] = await Promise.all([
    firestore.collection('evidenceSessions').doc(evidence.body.data.id).get(),
    firestore.collection('captureSessions').doc(redeemed.captureAttestation.captureSessionId).get(),
  ]);
  assert.equal(sessionAtRest.data().redemptionTokenHash, undefined);
  assert.equal(sessionAtRest.data().appCheckContext.appId, 'participant-http-app');
  assert.equal(captureAtRest.data().uid, 'participant-http-user');
  assert.deepEqual(captureAtRest.data().allowedEvidenceTypes, ['PACKING_VIDEO']);

  const cancelled = await request(`/v1/evidence-sessions/${evidence.body.data.id}/cancel`, tokenA, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ schemaVersion: 1 }),
  });
  assert.equal(cancelled.response.status, 200);
  assert.equal(cancelled.body.data.status, 'CANCELLED');
});

test('Firestore evidence list and review package stay organization-isolated', { skip: !emulatorAvailable }, async () => {
  const created = await request('/v1/transactions', tokenA, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'idempotency-key': 'evidence-review-1' },
    body: JSON.stringify({
      merchantReference: 'emulator-review-1',
      title: 'Emulator review camera',
      amount: { currency: 'USD', minorUnits: 2500 },
      participants: [{ role: 'SELLER', externalReference: 'seller-emulator' }],
      captureRequirements: { requiredArtifactTypes: ['PACKING_VIDEO'] },
    }),
  });
  assert.equal(created.response.status, 201);
  const transactionId = created.body.data.id;
  await firestore.collection('transactions').doc(transactionId).collection('evidence').doc('pack-emulator').set({
    id: 'pack-emulator',
    type: 'PACKING_VIDEO',
    role: 'SELLER',
    contentType: 'video/mp4',
    sizeBytes: 2048,
    sha256: 'f'.repeat(64),
    manifestSha256: '1'.repeat(64),
    evidenceBundleSha256: '2'.repeat(64),
    serverFinalized: true,
    clientHashMatched: true,
    clientSizeMatched: true,
    contentTypeMatched: true,
    createdAt: new Date('2026-08-11T12:00:00.000Z'),
  });
  const isolated = await request(`/v1/transactions/${transactionId}/evidence`, tokenB);
  assert.equal(isolated.response.status, 404);
  const listed = await request(`/v1/transactions/${transactionId}/evidence`, tokenA);
  assert.equal(listed.response.status, 200);
  assert.equal(listed.body.data[0].workflowReady, true);
  const review = await request(`/v1/transactions/${transactionId}/review-package`, tokenA);
  assert.equal(review.response.status, 200);
  assert.equal(review.body.data.limitations.physicalCorrespondence, 'NOT_AVAILABLE');
  assert.equal(review.body.data.protocolCompleteness.sellerPackingVideo, 'PRESENT');
});

test('Firestore idempotency retry retains one stable operation ID after a failed attempt', { skip: !emulatorAvailable }, async () => {
  const store = new FirestoreIdempotencyStore(firestore);
  const context = {
    principalId: 'org-integration-a:client-integration-a',
    operation: 'POST /v1/transactions',
    key: 'failure-retry-key',
    requestFingerprint: sha256('same-request'),
  };
  let failedOperationId;
  await assert.rejects(
    () => store.execute(context, async (operationId) => {
      failedOperationId = operationId;
      throw new Error('simulated dependency failure');
    }),
    /simulated dependency failure/,
  );
  let retriedOperationId;
  const retry = await store.execute(context, async (operationId) => {
    retriedOperationId = operationId;
    return { transactionId: operationId };
  });
  assert.equal(retriedOperationId, failedOperationId);
  assert.equal(retry.replayed, false);
  const replay = await store.execute(context, async () => ({ transactionId: 'should-not-run' }));
  assert.equal(replay.replayed, true);
  assert.equal(replay.value.transactionId, failedOperationId);
  await assert.rejects(
    () => store.execute({ ...context, requestFingerprint: sha256('different-request') }, async () => ({ ok: false })),
    (error) => error.code === 'IDEMPOTENCY_KEY_REUSED',
  );
});

test('Firestore idempotency fencing keeps a live owner and rejects a stale completer', { skip: !emulatorAvailable }, async () => {
  let clock = 1_000;
  const store = new FirestoreIdempotencyStore(firestore, 2, () => clock);
  const context = {
    principalId: 'org-integration-a:client-integration-a',
    operation: 'POST /v1/transactions/{transactionId}/reports',
    key: 'fence-lease-key',
    requestFingerprint: sha256('report-request'),
    leaseSeconds: 2,
  };
  let firstStarted;
  const first = store.execute(context, async (operationId) => {
    firstStarted = operationId;
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { reportId: operationId };
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  await assert.rejects(
    () => store.execute(context, async () => ({ reportId: 'stolen' })),
    (error) => error.code === 'IDEMPOTENCY_REQUEST_IN_PROGRESS',
  );
  const owned = await first;
  assert.equal(owned.replayed, false);
  assert.equal(owned.value.reportId, firstStarted);

  clock = 10_000;
  const reclaimed = await store.execute(context, async () => ({ reportId: 'should-replay' }));
  assert.equal(reclaimed.replayed, true);
  assert.equal(reclaimed.value.reportId, firstStarted);
});

test('Firestore idempotency fence blocks a stale worker side effect after lease reclaim', { skip: !emulatorAvailable }, async () => {
  let clock = 1_000;
  const store = new FirestoreIdempotencyStore(firestore, 2, () => clock);
  const context = {
    principalId: 'org-integration-a:client-integration-a',
    operation: 'POST /v1/transactions/{transactionId}/reports',
    key: 'stale-side-effect-key',
    requestFingerprint: sha256('stale-side-effect'),
    leaseSeconds: 2,
  };
  let releaseFirst;
  let firstEntered = false;
  const sideEffects = [];
  const first = store.execute(context, async (operationId, fence) => {
    firstEntered = true;
    await new Promise((resolve) => { releaseFirst = resolve; });
    await fence.runSideEffect('external-report', async () => {
      sideEffects.push('stale');
      return 'stale';
    });
    return { reportId: operationId };
  });
  while (!firstEntered) await new Promise((resolve) => setTimeout(resolve, 10));
  clock = 10_000;
  const reclaimed = await store.execute(context, async (operationId, fence) => {
    await fence.runSideEffect('external-report', async () => {
      sideEffects.push(operationId);
      return operationId;
    });
    return { reportId: operationId };
  });
  releaseFirst();
  await assert.rejects(first, (error) => error.code === 'IDEMPOTENCY_LEASE_LOST');
  assert.equal(reclaimed.replayed, false);
  assert.deepEqual(sideEffects, [reclaimed.operationId]);
});
