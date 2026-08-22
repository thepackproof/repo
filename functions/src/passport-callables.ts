import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { connectLinkBaseUrl, db } from './config';
import { recordVisibleToActor } from './application/v1/authorization-boundary';
import { assertPassportEligible, boundOrIssuedIdentity, projectPassport } from './application/v1/passport-projection';
import { isPassportDisplayId, isPassportResourceId } from './domain/v1/passport';
import { FirestoreMerchantEvidenceRepository } from './infrastructure/firebase/v1/merchant-evidence-repository';
import { requireUid } from './helpers';

const callOptions = { enforceAppCheck: true, invoker: 'public' as const };

export const getPackProofPassport = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const transactionId = typeof request.data?.transactionId === 'string' ? request.data.transactionId : '';
  const passportId = typeof request.data?.passportId === 'string' ? request.data.passportId : '';
  if (!transactionId && !passportId) throw new HttpsError('invalid-argument', 'A transactionId or passportId is required.');
  const repository = new FirestoreMerchantEvidenceRepository(db);
  const transaction = recordVisibleToActor(
    transactionId
      ? await repository.loadTransaction(transactionId)
      : isPassportResourceId(passportId) || isPassportDisplayId(passportId)
        ? await repository.loadTransactionByPassportIdentity(passportId)
        : await repository.loadTransaction(passportId),
    uid,
  );
  if (!transaction) throw new HttpsError('not-found', 'This Proof was not found.');
  const [records, timeline, returns] = await Promise.all([
    repository.listEvidence(transaction.id),
    repository.listTimeline(transaction.id),
    repository.listReturns(transaction.id),
  ]);
  try {
    assertPassportEligible(transaction, records);
  } catch (error) {
    throw new HttpsError('failed-precondition', error instanceof Error ? error.message : 'This transaction does not yet qualify for a Proof.');
  }
  const issuedAt = new Date();
  const identity = boundOrIssuedIdentity(transaction, issuedAt);
  if (identity.bind) {
    const bound = await repository.bindPassportIdentity(transaction.id, {
      passportId: identity.passportId,
      displayId: identity.displayId,
      issuedAt: identity.issuedAt,
    });
    identity.passportId = bound.passportId;
    identity.displayId = bound.displayId;
    identity.issuedAt = bound.issuedAt;
  }
  const commerce = transaction.commerceContextId ? await repository.findCommerceContext(transaction.commerceContextId) : null;
  return projectPassport({
    transaction,
    artifacts: records,
    shipment: transaction.shipment,
    delivery: transaction.delivery,
    returns,
    timeline,
    commerce,
    identity: {
      passportId: identity.passportId,
      displayId: identity.displayId,
      issuedAt: identity.issuedAt.toISOString(),
    },
    verificationBaseUrl: connectLinkBaseUrl.value(),
    reviewQuery: null,
    now: issuedAt.toISOString(),
  });
});
