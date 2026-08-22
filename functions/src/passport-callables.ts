import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { connectLinkBaseUrl, db } from './config';
import { ProofApplicationService } from './application/v1/proof-application-service';
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
  const transaction = transactionId
    ? await repository.loadTransaction(transactionId)
    : isPassportResourceId(passportId) || isPassportDisplayId(passportId)
      ? await repository.loadTransactionByPassportIdentity(passportId)
      : await repository.loadTransaction(passportId);
  if (!transaction) throw new HttpsError('not-found', 'This Proof was not found.');
  if (!transaction.participantIds.includes(uid)) {
    throw new HttpsError('permission-denied', 'You are not a participant in this transaction.');
  }
  const [records, timeline, returns] = await Promise.all([
    repository.listEvidence(transaction.id),
    repository.listTimeline(transaction.id),
    repository.listReturns(transaction.id),
  ]);
  const commerce = transaction.commerceContextId ? await repository.findCommerceContext(transaction.commerceContextId) : null;
  const proofs = new ProofApplicationService(repository, () => connectLinkBaseUrl.value());
  try {
    return await proofs.getCurrentProof({
      transaction,
      artifacts: records,
      timeline,
      returns,
      commerce,
    }, null, { bindIdentity: false });
  } catch (error) {
    throw new HttpsError('failed-precondition', error instanceof Error ? error.message : 'This transaction does not yet qualify for a Proof.');
  }
});

export const issuePackProofIdentity = onCall(callOptions, async (request) => {
  const uid = requireUid(request);
  const transactionId = typeof request.data?.transactionId === 'string' ? request.data.transactionId : '';
  if (!transactionId) throw new HttpsError('invalid-argument', 'A transactionId is required.');
  const repository = new FirestoreMerchantEvidenceRepository(db);
  const transaction = await repository.loadTransaction(transactionId);
  if (!transaction) throw new HttpsError('not-found', 'This Proof was not found.');
  if (!transaction.participantIds.includes(uid)) {
    throw new HttpsError('permission-denied', 'You are not a participant in this transaction.');
  }
  const records = await repository.listEvidence(transaction.id);
  const commerce = transaction.commerceContextId ? await repository.findCommerceContext(transaction.commerceContextId) : null;
  const proofs = new ProofApplicationService(repository, () => connectLinkBaseUrl.value());
  try {
    return await proofs.issueProofIdentity({ transaction, artifacts: records, commerce });
  } catch (error) {
    throw new HttpsError('failed-precondition', error instanceof Error ? error.message : 'This transaction does not yet qualify for a Proof.');
  }
});
