import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { after, before, test } from 'node:test';
import { deleteApp, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const require = createRequire(import.meta.url);
const {
  ApplicationError,
  CommerceContextApplicationService,
  ConnectHandoffApplicationService,
  ConsumerTransactionApplicationService,
  MerchantAuthorizationPolicy,
  MerchantConnectApplicationService,
  ParticipantCaptureApplicationService,
  PublicCommerceHandoffApplicationService,
  sha256,
} = require('../lib/application/v1/index.js');
const { FirestoreAuditWriter } = require('../lib/api/v1/controls.js');
const { HmacConnectSessionTokenIssuer } = require('../lib/infrastructure/crypto/connect-session-token-issuer.js');
const { HmacParticipantHandoffTokenIssuer } = require('../lib/infrastructure/crypto/participant-handoff-token-issuer.js');
const { Sha256TokenVerifier } = require('../lib/infrastructure/crypto/sha256-token-verifier.js');
const { HmacPublicHandoffTokenIssuer } = require('../lib/infrastructure/crypto/public-handoff-token-issuer.js');
const { FirestoreCommerceContextRepository } = require('../lib/infrastructure/firebase/v1/commerce-context-repository.js');
const { FirestoreConnectHandoffRepository } = require('../lib/infrastructure/firebase/v1/connect-handoff-repository.js');
const { FirestoreConsumerTransactionRepository } = require('../lib/infrastructure/firebase/v1/consumer-transaction-repository.js');
const { FirestorePublicCommerceHandoffRepository } = require('../lib/infrastructure/firebase/v1/public-commerce-handoff-repository.js');
const { FirestoreParticipantCaptureRepository } = require('../lib/infrastructure/firebase/v1/participant-capture-repository.js');
const { FirestoreMerchantConnectAdapter } = require('../lib/infrastructure/firebase/v1/merchant-evidence-repository.js');

const emulatorAvailable = Boolean(process.env.FIRESTORE_EMULATOR_HOST);
const adminApp = emulatorAvailable ? initializeApp({ projectId: 'packproof-application-test' }, `application-v1-${Date.now()}`) : null;
const firestore = adminApp ? getFirestore(adminApp) : null;
const now = new Date('2026-08-11T12:00:00.000Z');

before(async () => {
  if (!firestore) return;
  const collections = await firestore.listCollections();
  await Promise.all(collections.map(async (collection) => {
    const docs = await collection.listDocuments();
    await Promise.all(docs.map((doc) => doc.delete()));
  }));
});

after(async () => {
  if (adminApp) await deleteApp(adminApp);
});

const consumerInput = {
  title: 'Emulator consumer item', category: 'Collectible', description: 'Complete consumer description',
  priceMinor: 2500, currency: 'USD', identifiers: [{ label: 'SKU', value: 'SKU-EMULATOR' }], conditionNotes: '',
  terms: { saleType: 'SHIPPED', shippingResponsibility: 'SELLER', returns: 'AS_AGREED', returnWindowDays: 14, customTerms: '' },
};

test('consumer application adapter atomically writes the legacy record, timeline event, and outbox event', { skip: !emulatorAvailable }, async () => {
  const service = new ConsumerTransactionApplicationService(new FirestoreConsumerTransactionRepository(firestore), () => now);
  const result = await service.saveDraft({ actorId: 'consumer-seller', plan: 'PRO', input: consumerInput, requestId: 'request-emulator-consumer' });
  const transaction = await firestore.collection('transactions').doc(result.transactionId).get();
  assert.equal(transaction.exists, true);
  assert.equal(transaction.data().sellerId, 'consumer-seller');
  assert.equal(transaction.data().description, consumerInput.description);
  const events = await transaction.ref.collection('events').get();
  assert.equal(events.size, 1);
  assert.equal(events.docs[0].data().type, 'TRANSACTION_CREATED');
  const outbox = await firestore.collection('domainOutbox').where('resourceId', '==', result.transactionId).get();
  assert.equal(outbox.size, 1);
  assert.equal(outbox.docs[0].data().deliveryState, 'PENDING');

  await assert.rejects(
    () => service.saveDraft({ actorId: 'different-user', plan: 'PRO', input: { ...consumerInput, transactionId: result.transactionId }, requestId: 'request-emulator-attack' }),
    (error) => error instanceof ApplicationError && error.code === 'SELLER_REQUIRED',
  );
});

const connectOrder = {
  platform: 'marketplace', orderId: 'order-emulator-1', sellerId: 'external-seller-1', trackingNumber: '1Z999', carrier: 'UPS',
  itemTitle: 'Imported emulator item', itemDescription: 'Description populated from the commerce integration.', declaredWeightGrams: 750,
  priceMinor: 8800, currency: 'USD', callbackUrl: 'https://merchant.example/callback', idempotencyKey: 'connect-emulator-idempotency-1',
};

test('commerce ingestion and Connect redemption retain compatibility while atomically adding canonical context and outbox records', { skip: !emulatorAvailable }, async () => {
  const issuer = new HmacConnectSessionTokenIssuer();
  const commerceService = new CommerceContextApplicationService(new FirestoreCommerceContextRepository(firestore), issuer, () => now);
  const principal = { integrationId: 'legacyIntegration001', platform: 'marketplace', webhookSigningSecret: 'integration-test-signing-secret' };
  const ingested = await commerceService.ingestConnectOrder(principal, connectOrder, 'request-emulator-commerce');
  assert.equal(ingested.replayed, false);

  const context = await firestore.collection('commerceContexts').doc(ingested.commerceContextId).get();
  const session = await firestore.collection('connectSessions').doc(ingested.sessionId).get();
  assert.equal(context.exists, true);
  assert.equal(context.data().status, 'ORDER_BOUND');
  assert.equal(context.data().source.trustLevel, 'MERCHANT_SERVER_ATTESTED');
  assert.equal(context.data().item.description, connectOrder.itemDescription);
  assert.equal(session.data().commerceContextId, ingested.commerceContextId);
  assert.equal(session.data().itemDescriptor.description, connectOrder.itemDescription);
  assert.equal(session.data().tokenHash, issuer.digest(ingested.sessionToken));
  const contextOutbox = await firestore.collection('domainOutbox').where('resourceId', '==', ingested.commerceContextId).get();
  assert.equal(contextOutbox.size, 1);
  assert.equal(contextOutbox.docs[0].data().type, 'COMMERCE_CONTEXT_CREATED');

  const replayed = await commerceService.ingestConnectOrder(principal, connectOrder, 'request-emulator-commerce');
  assert.equal(replayed.replayed, true);
  assert.equal(replayed.sessionToken, ingested.sessionToken);

  const handoffService = new ConnectHandoffApplicationService(
    new FirestoreConnectHandoffRepository(firestore),
    new Sha256TokenVerifier(),
    () => now,
  );
  const redeemed = await handoffService.redeem({
    actorId: 'packproof-seller', sessionId: ingested.sessionId, token: ingested.sessionToken, requestId: 'request-emulator-redeem',
  });
  const transaction = await firestore.collection('transactions').doc(redeemed.transactionId).get();
  const claimedSession = await firestore.collection('connectSessions').doc(ingested.sessionId).get();
  assert.equal(transaction.exists, true);
  assert.equal(transaction.data().description, connectOrder.itemDescription);
  assert.equal(transaction.data().source.commerceContextId, ingested.commerceContextId);
  assert.equal(claimedSession.data().transactionId, redeemed.transactionId);
  assert.equal(claimedSession.data().tokenHash, undefined);
  const transactionEvents = await transaction.ref.collection('events').get();
  assert.equal(transactionEvents.size, 1);
  const transactionOutbox = await firestore.collection('domainOutbox').where('resourceId', '==', redeemed.transactionId).get();
  assert.equal(transactionOutbox.size, 1);
  assert.equal(transactionOutbox.docs[0].data().type, 'TRANSACTION_CREATED');

  const redemptionReplay = await handoffService.redeem({
    actorId: 'packproof-seller', sessionId: ingested.sessionId, token: 'already-consumed', requestId: 'request-emulator-replay',
  });
  assert.deepEqual(redemptionReplay, redeemed);
  await assert.rejects(
    () => handoffService.redeem({ actorId: 'other-user', sessionId: ingested.sessionId, token: 'already-consumed', requestId: 'request-emulator-other' }),
    (error) => error instanceof ApplicationError && error.code === 'CONNECT_SESSION_ALREADY_CLAIMED',
  );
});

test('Connect grant exchange does not consume a valid code when exchange parameters are wrong', { skip: !emulatorAvailable }, async () => {
  const issuer = new HmacConnectSessionTokenIssuer();
  const commerceService = new CommerceContextApplicationService(
    new FirestoreCommerceContextRepository(firestore),
    issuer,
    () => now,
  );
  const principal = { integrationId: 'legacyIntegrationGrant', platform: 'marketplace', webhookSigningSecret: 'grant-secret' };
  const ingested = await commerceService.ingestConnectOrder(principal, {
    ...connectOrder,
    orderId: 'order-grant-1',
    idempotencyKey: 'idempotency-grant-1',
  }, 'request-emulator-grant');
  const handoffService = new ConnectHandoffApplicationService(
    new FirestoreConnectHandoffRepository(firestore),
    new Sha256TokenVerifier(),
    () => now,
  );
  await assert.rejects(
    () => handoffService.redeem({
      actorId: 'packproof-seller',
      sessionId: ingested.sessionId,
      token: ingested.sessionToken,
      clientId: 'wrong-client',
      requestId: 'request-emulator-grant-client',
    }),
    (error) => error instanceof ApplicationError && error.code === 'CONNECT_CLIENT_MISMATCH',
  );
  await assert.rejects(
    () => handoffService.redeem({
      actorId: 'packproof-seller',
      sessionId: ingested.sessionId,
      token: ingested.sessionToken,
      redirectUri: 'https://attacker.example/callback',
      requestId: 'request-emulator-grant-redirect',
    }),
    (error) => error instanceof ApplicationError && error.code === 'CONNECT_REDIRECT_MISMATCH',
  );
  await assert.rejects(
    () => handoffService.redeem({
      actorId: 'packproof-seller',
      sessionId: ingested.sessionId,
      token: 'wrong-token-value-that-is-long-enough',
      requestId: 'request-emulator-grant-token',
    }),
    (error) => error instanceof ApplicationError && error.code === 'INVALID_HANDOFF_TOKEN',
  );
  const stillLive = await firestore.collection('connectSessions').doc(ingested.sessionId).get();
  assert.equal(stillLive.data().status, 'PENDING_REDEMPTION');
  assert.equal(stillLive.data().tokenHash, issuer.digest(ingested.sessionToken));

  const [first, second] = await Promise.all([
    handoffService.redeem({
      actorId: 'packproof-seller',
      sessionId: ingested.sessionId,
      token: ingested.sessionToken,
      clientId: 'legacyIntegrationGrant',
      redirectUri: connectOrder.callbackUrl,
      requestId: 'request-emulator-grant-cas-1',
    }),
    handoffService.redeem({
      actorId: 'packproof-seller',
      sessionId: ingested.sessionId,
      token: ingested.sessionToken,
      clientId: 'legacyIntegrationGrant',
      redirectUri: connectOrder.callbackUrl,
      requestId: 'request-emulator-grant-cas-2',
    }),
  ]);
  assert.equal(first.transactionId, second.transactionId);
  const consumed = await firestore.collection('connectSessions').doc(ingested.sessionId).get();
  assert.equal(consumed.data().status, 'READY_FOR_CAPTURE');
  assert.equal(consumed.data().tokenHash, undefined);
  assert.equal(consumed.data().transactionId, first.transactionId);
  const created = await firestore.collection('transactions').doc(first.transactionId).get();
  assert.equal(created.exists, true);
});

test('merchant Connect adapter lists by external order and cancels an unredeemed session', { skip: !emulatorAvailable }, async () => {
  const issuer = new HmacConnectSessionTokenIssuer();
  await firestore.collection('platformIntegrations').doc('merchantConnectInt001').set({
    status: 'ACTIVE',
    platform: 'custom',
    organizationId: 'org-connect-a',
    webhookSigningSecret: 'whsec_emulator_connect',
    callbackOrigins: ['https://merchant.example'],
  });
  const adapter = new FirestoreMerchantConnectAdapter(firestore);
  const service = new MerchantConnectApplicationService(
    new CommerceContextApplicationService(new FirestoreCommerceContextRepository(firestore), issuer, () => now),
    adapter,
    adapter,
    { validate: async () => undefined },
    new MerchantAuthorizationPolicy(),
    { environment: 'sandbox' },
    () => 'https://packproof.example',
    () => now,
  );
  const principal = {
    type: 'MERCHANT_API_CLIENT', credentialId: 'cred-connect', apiClientId: 'client-connect',
    organizationId: 'org-connect-a', environment: 'sandbox', integrationId: 'merchantConnectInt001',
    scopes: ['transactions:read', 'transactions:write'],
  };
  const created = await service.createSession(principal, {
    platform: 'custom', externalOrderId: 'order-list-1', externalSellerId: 'seller-1', itemTitle: 'Listed camera',
    itemDescription: '', amount: { currency: 'USD', minorUnits: 2500 }, callbackUrl: 'https://merchant.example/hook',
  }, 'idempotency-list-1', 'req-list-1');
  const listed = await service.listSessions(principal, 'order-list-1');
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, created.session.id);
  assert.equal(listed[0].status, 'PENDING_REDEMPTION');
  const isolated = await service.listSessions({ ...principal, organizationId: 'org-connect-b', integrationId: 'other' }, 'order-list-1');
  assert.equal(isolated.length, 0);
  const cancelled = await service.cancelSession(principal, created.session.id, 'req-cancel-1');
  assert.equal(cancelled.session.status, 'CANCELLED');
  const stored = await firestore.collection('connectSessions').doc(created.session.id).get();
  assert.equal(stored.data().status, 'CANCELLED');
  assert.equal(stored.data().tokenHash, undefined);
  const replayed = await service.cancelSession(principal, created.session.id, 'req-cancel-2');
  assert.equal(replayed.replayed, true);
});

test('public button issue and redemption atomically retain page provenance, bind a draft, and consume the bearer token', { skip: !emulatorAvailable }, async () => {
  const publishableKey = `pp_pub_sandbox_${'A'.repeat(24)}`;
  await firestore.collection('platformIntegrations').doc('integrationButton001').set({
    status: 'ACTIVE',
    environment: 'SANDBOX',
    publishableKeyHash: sha256(publishableKey),
    allowedOrigins: ['https://shop.example'],
  });
  const repository = new FirestorePublicCommerceHandoffRepository(firestore);
  const issuer = new HmacPublicHandoffTokenIssuer(() => 'emulator-public-handoff-signing-secret-with-32-characters');
  const service = new PublicCommerceHandoffApplicationService(repository, issuer, new Sha256TokenVerifier(), () => 'sandbox', () => now);
  const input = {
    schemaVersion: 1,
    source: {
      platform: 'STRUCTURED_PAGE_DATA', productUrl: 'https://shop.example/products/camera',
      externalProductId: 'product-42', externalListingId: null, externalVariantId: 'black',
    },
    item: {
      title: 'Emulator page camera', description: 'Full description imported directly from structured storefront data.',
      category: 'Vintage cameras', brand: 'Example Optics', model: 'RF-50', sku: 'RF50-42', gtin: null, upc: null,
      mpn: null, serialNumber: null, selectedOptions: [{ name: 'Finish', value: 'Black' }],
      identifiers: [{ type: 'SKU', value: 'RF50-42' }], quantity: 1,
      amount: { currency: 'USD', minorUnits: 129900 },
      imageReferences: [{ url: 'https://cdn.example/camera.jpg', altText: 'Front image' }],
    },
  };
  const issued = await service.issue({
    publishableKey,
    origin: 'https://shop.example',
    operationKey: 'emulator-button-operation-1',
    input,
    requestId: 'request-emulator-public-issue',
  });
  const replay = await service.issue({
    publishableKey,
    origin: 'https://shop.example',
    operationKey: 'emulator-button-operation-1',
    input,
    requestId: 'request-emulator-public-replay',
  });
  assert.equal(issued.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(replay.handoffId, issued.handoffId);
  assert.equal(replay.token, issued.token);

  const [handoffBefore, contextBefore, draftBefore] = await Promise.all([
    firestore.collection('publicCommerceHandoffs').doc(issued.handoffId).get(),
    firestore.collection('commerceContexts').doc(issued.commerceContextId).get(),
    firestore.collection('passportDrafts').doc(issued.passportDraftId).get(),
  ]);
  assert.equal(handoffBefore.data().status, 'PENDING_CLAIM');
  assert.equal(handoffBefore.data().tokenHash, issuer.digest(issued.token));
  assert.equal(contextBefore.data().status, 'HANDOFF_ISSUED');
  assert.equal(contextBefore.data().source.trustLevel, 'PAGE_DECLARED');
  assert.equal(contextBefore.data().source.externalOrderId, null);
  assert.equal(contextBefore.data().item.description, input.item.description);
  assert.equal(draftBefore.data().status, 'READY_FOR_REVIEW');
  assert.equal(draftBefore.data().transactionId, null);
  const issueOutbox = await firestore.collection('domainOutbox').where('resourceId', '==', issued.commerceContextId).get();
  assert.equal(issueOutbox.size, 2);

  const redeemed = await service.redeem({
    actorId: 'button-seller', plan: 'PRO', handoffId: issued.handoffId, token: issued.token, requestId: 'request-emulator-public-redeem',
  });
  const [handoffAfter, contextAfter, draftAfter, transaction] = await Promise.all([
    firestore.collection('publicCommerceHandoffs').doc(issued.handoffId).get(),
    firestore.collection('commerceContexts').doc(issued.commerceContextId).get(),
    firestore.collection('passportDrafts').doc(issued.passportDraftId).get(),
    firestore.collection('transactions').doc(redeemed.transactionId).get(),
  ]);
  assert.equal(handoffAfter.data().status, 'CLAIMED');
  assert.equal(handoffAfter.data().tokenHash, undefined);
  assert.equal(handoffAfter.data().claimedBy, 'button-seller');
  assert.equal(contextAfter.data().status, 'CLAIMED');
  assert.equal(draftAfter.data().status, 'BOUND');
  assert.equal(draftAfter.data().transactionId, redeemed.transactionId);
  assert.equal(transaction.data().status, 'DRAFT');
  assert.equal(transaction.data().description, input.item.description);
  assert.ok(transaction.data().identifiers.some(({ label, value }) => label === 'Brand' && value === 'Example Optics'));
  assert.ok(transaction.data().identifiers.some(({ label, value }) => label === 'Option: Finish' && value === 'Black'));
  assert.equal(transaction.data().source.type, 'PACKPROOF_BUTTON');
  assert.equal(transaction.data().source.trustLevel, 'PAGE_DECLARED');
  const transactionOutbox = await firestore.collection('domainOutbox').where('resourceId', '==', redeemed.transactionId).get();
  assert.equal(transactionOutbox.size, 1);

  const redemptionReplay = await service.redeem({
    actorId: 'button-seller', plan: 'FREE', handoffId: issued.handoffId, token: 'already-consumed', requestId: 'request-emulator-public-redeem-replay',
  });
  assert.deepEqual(redemptionReplay, redeemed);
  await assert.rejects(
    () => service.redeem({ actorId: 'other-user', plan: 'PRO', handoffId: issued.handoffId, token: 'already-consumed', requestId: 'request-emulator-public-other' }),
    (error) => error instanceof ApplicationError && error.code === 'PUBLIC_HANDOFF_ALREADY_CLAIMED',
  );
});

test('participant claim and evidence-session persistence consume hashed capabilities and preserve actor, organization, and replay boundaries', { skip: !emulatorAvailable }, async () => {
  const transactionId = `txn_${'5'.repeat(32)}`;
  const organizationId = 'org-participant-emulator';
  await firestore.collection('transactions').doc(transactionId).set({
    id: transactionId,
    sourceType: 'MERCHANT_API',
    organizationId,
    apiStatus: 'CREATED',
    apiParticipants: [{ role: 'SELLER', externalReference: 'seller-reference-501' }],
    captureRequirements: { requiredArtifactTypes: ['PACKING_VIDEO'] },
    participantIds: [],
    sellerId: null,
    buyerId: null,
    captureStatus: 'NOT_STARTED',
    createdAt: now,
    updatedAt: now,
  });

  const tokenIssuer = new HmacParticipantHandoffTokenIssuer(
    () => 'participant-emulator-handoff-secret-longer-than-32-characters',
  );
  const service = new ParticipantCaptureApplicationService(
    new FirestoreParticipantCaptureRepository(firestore),
    tokenIssuer,
    new FirestoreAuditWriter(firestore),
    new MerchantAuthorizationPolicy(),
    { environment: 'sandbox' },
    () => now,
  );
  const merchant = {
    type: 'MERCHANT_API_CLIENT',
    credentialId: 'credential-participant-emulator',
    apiClientId: 'client-participant-emulator',
    organizationId,
    environment: 'sandbox',
    scopes: ['participant_claims:write', 'evidence:read', 'evidence:write'],
  };
  const participant = { type: 'PACKPROOF_USER', actorId: 'participant-user-501', appId: 'app-emulator-501' };

  const invitation = await service.createInvitation({
    principal: merchant,
    transactionId,
    input: { role: 'SELLER', externalReference: 'seller-reference-501', expiresInSeconds: 3600 },
    operationKey: 'participant-emulator-invitation-501',
    requestId: 'request-participant-emulator-invitation',
  });
  const invitationReplay = await service.createInvitation({
    principal: merchant,
    transactionId,
    input: { role: 'SELLER', externalReference: 'seller-reference-501', expiresInSeconds: 3600 },
    operationKey: 'participant-emulator-invitation-501',
    requestId: 'request-participant-emulator-invitation-replay',
  });
  assert.equal(invitationReplay.replayed, true);
  assert.equal(invitationReplay.token, invitation.token);
  const claimBefore = await firestore.collection('participantClaims').doc(invitation.claim.id).get();
  assert.equal(claimBefore.data().tokenHash, tokenIssuer.digest(invitation.token));
  assert.equal(claimBefore.data().token, undefined);
  assert.equal(claimBefore.data().externalReference, undefined);

  const claimed = await service.claimParticipant({
    principal: participant,
    claimId: invitation.claim.id,
    token: invitation.token,
    requestId: 'request-participant-emulator-claim',
  });
  assert.equal(claimed.replayed, false);
  const [claimAfter, transactionAfterClaim] = await Promise.all([
    firestore.collection('participantClaims').doc(invitation.claim.id).get(),
    firestore.collection('transactions').doc(transactionId).get(),
  ]);
  assert.equal(claimAfter.data().tokenHash, undefined);
  assert.equal(claimAfter.data().claimedActorId, participant.actorId);
  assert.equal(transactionAfterClaim.data().sellerId, participant.actorId);
  assert.deepEqual(transactionAfterClaim.data().participantIds, [participant.actorId]);
  assert.equal(transactionAfterClaim.data().participantBindings.SELLER.actorId, participant.actorId);
  const claimReplay = await service.claimParticipant({
    principal: participant,
    claimId: invitation.claim.id,
    token: 'already-consumed',
    requestId: 'request-participant-emulator-claim-replay',
  });
  assert.equal(claimReplay.replayed, true);
  await assert.rejects(
    () => service.claimParticipant({
      principal: { ...participant, actorId: 'different-participant' },
      claimId: invitation.claim.id,
      token: 'already-consumed',
      requestId: 'request-participant-emulator-claim-attacker',
    }),
    (error) => error instanceof ApplicationError && error.code === 'PARTICIPANT_CLAIM_ALREADY_USED',
  );

  const issued = await service.createEvidenceSession({
    principal: merchant,
    transactionId,
    input: {
      participantClaimId: invitation.claim.id,
      type: 'OUTBOUND_PACK',
      allowedArtifactTypes: ['PACKING_VIDEO'],
      expiresInSeconds: 3600,
      maximumRedemptions: 1,
      requestedEvidenceCount: 1,
      captureProfileId: null,
      captureGroupId: null,
    },
    operationKey: 'participant-emulator-evidence-session-501',
    requestId: 'request-participant-emulator-session',
  });
  const sessionBefore = await firestore.collection('evidenceSessions').doc(issued.session.id).get();
  assert.equal(sessionBefore.data().redemptionTokenHash, tokenIssuer.digest(issued.token));
  assert.equal(sessionBefore.data().token, undefined);
  assert.equal(sessionBefore.data().actorId, participant.actorId);
  assert.equal(sessionBefore.data().organizationId, organizationId);
  await assert.rejects(
    () => service.getEvidenceSession({ ...merchant, organizationId: 'different-organization' }, issued.session.id),
    (error) => error instanceof ApplicationError && error.code === 'EVIDENCE_SESSION_NOT_FOUND',
  );
  await assert.rejects(
    () => service.redeemEvidenceSession({
      principal: { ...participant, actorId: 'different-participant' },
      evidenceSessionId: issued.session.id,
      input: { operationKey: 'native-participant-operation-501', token: issued.token, runtimeArtifactHash: null },
      requestId: 'request-participant-emulator-redeem-attacker',
    }),
    (error) => error instanceof ApplicationError && error.code === 'EVIDENCE_SESSION_ACTOR_MISMATCH',
  );

  const redeemed = await service.redeemEvidenceSession({
    principal: participant,
    evidenceSessionId: issued.session.id,
    input: { operationKey: 'native-participant-operation-501', token: issued.token, runtimeArtifactHash: 'a'.repeat(64) },
    requestId: 'request-participant-emulator-redeem',
  });
  const [sessionAfter, captureAfter] = await Promise.all([
    firestore.collection('evidenceSessions').doc(issued.session.id).get(),
    firestore.collection('captureSessions').doc(redeemed.captureAttestation.captureSessionId).get(),
  ]);
  assert.equal(sessionAfter.data().redemptionTokenHash, undefined);
  assert.equal(sessionAfter.data().redemptionCount, 1);
  assert.equal(sessionAfter.data().appCheckContext.appId, participant.appId);
  assert.equal(captureAfter.data().evidenceSessionId, issued.session.id);
  assert.equal(captureAfter.data().uid, participant.actorId);
  assert.equal(captureAfter.data().appId, participant.appId);
  assert.deepEqual(captureAfter.data().allowedEvidenceTypes, ['PACKING_VIDEO']);
  assert.equal(captureAfter.data().runtimeArtifactHash, 'a'.repeat(64));

  const redemptionReplay = await service.redeemEvidenceSession({
    principal: participant,
    evidenceSessionId: issued.session.id,
    input: { operationKey: 'native-participant-operation-501', token: 'already-consumed', runtimeArtifactHash: null },
    requestId: 'request-participant-emulator-redeem-replay',
  });
  assert.equal(redemptionReplay.replayed, true);
  assert.equal(redemptionReplay.captureAttestation.captureSessionId, redeemed.captureAttestation.captureSessionId);
  assert.equal(redemptionReplay.captureAttestation.nonce, redeemed.captureAttestation.nonce);
  await assert.rejects(
    () => service.redeemEvidenceSession({
      principal: participant,
      evidenceSessionId: issued.session.id,
      input: { operationKey: 'native-participant-operation-502', token: issued.token, runtimeArtifactHash: null },
      requestId: 'request-participant-emulator-redeem-exhausted',
    }),
    (error) => error instanceof ApplicationError && error.code === 'EVIDENCE_SESSION_REDEMPTIONS_EXHAUSTED',
  );

  const cancelled = await service.cancelEvidenceSession({
    principal: merchant,
    evidenceSessionId: issued.session.id,
    requestId: 'request-participant-emulator-cancel',
  });
  assert.equal(cancelled.session.status, 'CANCELLED');
  const cancelledReplay = await service.cancelEvidenceSession({
    principal: merchant,
    evidenceSessionId: issued.session.id,
    requestId: 'request-participant-emulator-cancel-replay',
  });
  assert.equal(cancelledReplay.replayed, true);

  const outbox = await firestore.collection('domainOutbox').where('resourceId', 'in', [invitation.claim.id, issued.session.id]).get();
  assert.equal(outbox.size, 5);
  assert.equal(outbox.docs.every((doc) => doc.data().deliveryState === 'PENDING'), true);
});
