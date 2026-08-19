import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const contractPath = new URL('../../docs/openapi/packproof-api-v1.json', import.meta.url);

test('OpenAPI v1 contract is parseable, versioned, and operation-complete', async () => {
  const contract = JSON.parse(await readFile(contractPath, 'utf8'));
  assert.equal(contract.openapi, '3.1.0');
  assert.equal(contract.info.version, '1.0.0');
  assert.deepEqual(Object.keys(contract.paths).sort(), [
    '/v1/connect/sessions',
    '/v1/connect/sessions/{sessionId}',
    '/v1/connect/sessions/{sessionId}/cancel',
    '/v1/evidence-sessions/{evidenceSessionId}',
    '/v1/evidence-sessions/{evidenceSessionId}/cancel',
    '/v1/evidence-sessions/{evidenceSessionId}/redeem',
    '/v1/health',
    '/v1/participant-claims',
    '/v1/passports/{passportId}',
    '/v1/passports/{passportId}/snapshots/{snapshotId}',
    '/v1/passports/{passportId}/snapshots/{snapshotId}/exports',
    '/v1/public/integrations/{publishableKey}/handoffs',
    '/v1/ready',
    '/v1/transactions',
    '/v1/transactions/{transactionId}',
    '/v1/transactions/{transactionId}/delivery',
    '/v1/transactions/{transactionId}/evidence',
    '/v1/transactions/{transactionId}/evidence-sessions',
    '/v1/transactions/{transactionId}/evidence/{artifactId}',
    '/v1/transactions/{transactionId}/participant-invitations',
    '/v1/transactions/{transactionId}/passport',
    '/v1/transactions/{transactionId}/passport/snapshots',
    '/v1/transactions/{transactionId}/reports',
    '/v1/transactions/{transactionId}/reports/{reportId}',
    '/v1/transactions/{transactionId}/returns',
    '/v1/transactions/{transactionId}/returns/{returnPassportId}',
    '/v1/transactions/{transactionId}/returns/{returnPassportId}/shipment',
    '/v1/transactions/{transactionId}/review-package',
    '/v1/transactions/{transactionId}/shipment',
    '/v1/transactions/{transactionId}/timeline',
  ]);
  const operations = [];
  for (const [path, pathItem] of Object.entries(contract.paths)) {
    for (const [method, operation] of Object.entries(pathItem)) {
      assert.ok(['get', 'post'].includes(method), `${path} uses an unexpected method ${method}`);
      assert.ok(operation.operationId, `${method.toUpperCase()} ${path} is missing operationId`);
      assert.ok(operation.responses, `${method.toUpperCase()} ${path} is missing responses`);
      operations.push(operation.operationId);
    }
  }
  assert.equal(new Set(operations).size, operations.length, 'operationId values must be unique');
  assert.deepEqual(operations.sort(), [
    'associateDelivery',
    'associateReturnShipment',
    'associateShipment',
    'cancelConnectSession',
    'cancelEvidenceSession',
    'claimParticipantInvitation',
    'createConnectSession',
    'createEvidenceReport',
    'createEvidenceSession',
    'createParticipantInvitation',
    'createPassportExport',
    'createPassportSnapshot',
    'createPublicCommerceHandoff',
    'createReturnPassport',
    'createTransaction',
    'getConnectSession',
    'getDelivery',
    'getEvidence',
    'getEvidenceReport',
    'getEvidenceSession',
    'getHealth',
    'getPassport',
    'getPassportById',
    'getPassportSnapshot',
    'getReadiness',
    'getReturn',
    'getReviewPackage',
    'getShipment',
    'getTimeline',
    'getTransaction',
    'listConnectSessions',
    'listEvidence',
    'listReturns',
    'listTransactions',
    'redeemEvidenceSession',
  ]);
});

test('OpenAPI mutation and protected operations declare security controls', async () => {
  const contract = JSON.parse(await readFile(contractPath, 'utf8'));
  const create = contract.paths['/v1/transactions'].post;
  assert.deepEqual(create.security, [{ merchantApiKey: [] }]);
  assert.ok(create.parameters.some((entry) => entry.$ref === '#/components/parameters/IdempotencyKey'));
  assert.ok(create.responses['409']);
  assert.ok(create.responses['413']);
  assert.ok(create.responses['415']);
  assert.deepEqual(contract.paths['/v1/transactions'].get.security, [{ merchantApiKey: [] }]);
  assert.deepEqual(contract.paths['/v1/transactions/{transactionId}'].get.security, [{ merchantApiKey: [] }]);
  assert.equal(contract.components.schemas.CreateTransactionRequest.additionalProperties, false);
  assert.equal(contract.components.schemas.Transaction.additionalProperties, false);
  assert.equal(contract.components.schemas.ErrorEnvelope.additionalProperties, false);
  const publicHandoff = contract.paths['/v1/public/integrations/{publishableKey}/handoffs'].post;
  assert.deepEqual(publicHandoff.security, []);
  assert.ok(publicHandoff.parameters.some((entry) => entry.$ref === '#/components/parameters/PublishableKey'));
  assert.ok(publicHandoff.parameters.some((entry) => entry.$ref === '#/components/parameters/Origin'));
  assert.ok(publicHandoff.parameters.some((entry) => entry.$ref === '#/components/parameters/IdempotencyKey'));
  assert.equal(contract.components.schemas.CreatePublicCommerceHandoffRequest.additionalProperties, false);
  assert.equal(contract.components.schemas.PublicCommerceSource.additionalProperties, false);
  assert.equal('externalOrderId' in contract.components.schemas.PublicCommerceSource.properties, false);
  assert.equal(contract.components.schemas.PublicCommerceHandoff.properties.trustLevel.const, 'PAGE_DECLARED');
  assert.equal(contract.components.schemas.PublicCommerceHandoff.properties.status.const, 'PENDING_CLAIM');

  const invitation = contract.paths['/v1/transactions/{transactionId}/participant-invitations'].post;
  const createEvidenceSession = contract.paths['/v1/transactions/{transactionId}/evidence-sessions'].post;
  const getEvidenceSession = contract.paths['/v1/evidence-sessions/{evidenceSessionId}'].get;
  const cancelEvidenceSession = contract.paths['/v1/evidence-sessions/{evidenceSessionId}/cancel'].post;
  for (const operation of [invitation, createEvidenceSession]) {
    assert.deepEqual(operation.security, [{ merchantApiKey: [] }]);
    assert.ok(operation.parameters.some((entry) => entry.$ref === '#/components/parameters/IdempotencyKey'));
  }
  assert.deepEqual(getEvidenceSession.security, [{ merchantApiKey: [] }]);
  assert.deepEqual(cancelEvidenceSession.security, [{ merchantApiKey: [] }]);

  const participantSecurity = [{ firebaseUserBearer: [], firebaseAppCheck: [] }];
  assert.deepEqual(contract.paths['/v1/participant-claims'].post.security, participantSecurity);
  assert.deepEqual(contract.paths['/v1/evidence-sessions/{evidenceSessionId}/redeem'].post.security, participantSecurity);
  assert.equal(contract.components.securitySchemes.firebaseAppCheck.name, 'X-Firebase-AppCheck');
  assert.equal(contract.components.schemas.CreateParticipantInvitationRequest.additionalProperties, false);
  assert.equal(contract.components.schemas.ClaimParticipantRequest.additionalProperties, false);
  assert.equal(contract.components.schemas.CreateEvidenceSessionRequest.additionalProperties, false);
  assert.equal(contract.components.schemas.RedeemEvidenceSessionRequest.additionalProperties, false);
  assert.equal(contract.components.schemas.CancelEvidenceSessionRequest.additionalProperties, false);
  assert.equal(contract.components.schemas.ParticipantClaim.additionalProperties, false);
  assert.equal(contract.components.schemas.EvidenceSession.additionalProperties, false);
  assert.equal('externalReference' in contract.components.schemas.ParticipantClaim.properties, false);
  assert.equal('actorId' in contract.components.schemas.EvidenceSession.properties, false);
  assert.equal(contract.components.schemas.ParticipantClaimInstructions.properties.token.writeOnly, true);
  assert.equal(contract.components.schemas.EvidenceSessionRedemptionInstructions.properties.token.writeOnly, true);

  assert.deepEqual(contract.paths['/v1/connect/sessions'].get.security, [{ merchantApiKey: [] }]);
  assert.deepEqual(contract.paths['/v1/connect/sessions/{sessionId}/cancel'].post.security, [{ merchantApiKey: [] }]);
  assert.deepEqual(contract.components.schemas.ConnectSession.properties.status.$ref, '#/components/schemas/ConnectSessionStatus');
  assert.equal(contract.components.schemas.CreateConnectSessionRequest.additionalProperties, false);
  assert.equal(contract.components.schemas.EvidenceFinalizedCallback.additionalProperties, false);
  assert.equal(contract.components.schemas.EvidenceFinalizedCallback.properties.event.const, 'packproof.evidence.finalized');
  assert.equal(contract.components.schemas.ShippingTrackerObservation.additionalProperties, false);
  assert.equal(contract.components.schemas.ShippingTrackerObservation.properties.interpretation.const, 'OPEN_SOURCE_TRACKING_NUMBER_VALIDATION_NOT_CARRIER_CUSTODY');
  assert.equal(contract.components.schemas.PackProofPassport.additionalProperties, false);
  assert.equal(contract.components.schemas.PackProofPassport.properties.object.const, 'packproof_passport');
  assert.equal(contract.components.schemas.PackProofPassport.properties.limitations.properties.shippingTrackerInterpretation.const, 'OPEN_SOURCE_TRACKING_NUMBER_VALIDATION_NOT_CARRIER_CUSTODY');
  assert.equal(contract.components.schemas.PackProofPassportExport.properties.presentationOnly.const, true);
  assert.equal(contract.components.schemas.PassportComparison.properties.result.enum.includes('MATCH'), false);
  assert.deepEqual(contract.paths['/v1/transactions/{transactionId}/passport'].get.security, [{ merchantApiKey: [] }]);
  assert.equal(contract.components.schemas.EvidenceArtifact.properties.shippingTracker.oneOf[0].$ref, '#/components/schemas/ShippingTrackerObservation');
  assert.equal(contract.components.schemas.EvidenceFinalizedCallback.properties.shippingTracker.oneOf[0].$ref, '#/components/schemas/ShippingTrackerObservation');
  assert.equal(contract.components.schemas.EvidenceArtifact.required.includes('shippingTracker'), false);
  assert.equal(contract.webhooks.packproofEvidenceFinalized.post.operationId, 'receivePackProofEvidenceFinalized');
  assert.equal(contract.components.schemas.ConnectCaptureInstructions.properties.token.writeOnly, true);
});
