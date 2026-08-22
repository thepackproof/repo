"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.issuePackProofIdentity = exports.getPackProofPassport = void 0;
const https_1 = require("firebase-functions/v2/https");
const config_1 = require("./config");
const proof_application_service_1 = require("./application/v1/proof-application-service");
const passport_1 = require("./domain/v1/passport");
const merchant_evidence_repository_1 = require("./infrastructure/firebase/v1/merchant-evidence-repository");
const helpers_1 = require("./helpers");
const callOptions = { enforceAppCheck: true, invoker: 'public' };
exports.getPackProofPassport = (0, https_1.onCall)(callOptions, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    const transactionId = typeof request.data?.transactionId === 'string' ? request.data.transactionId : '';
    const passportId = typeof request.data?.passportId === 'string' ? request.data.passportId : '';
    if (!transactionId && !passportId)
        throw new https_1.HttpsError('invalid-argument', 'A transactionId or passportId is required.');
    const repository = new merchant_evidence_repository_1.FirestoreMerchantEvidenceRepository(config_1.db);
    const transaction = transactionId
        ? await repository.loadTransaction(transactionId)
        : (0, passport_1.isPassportResourceId)(passportId) || (0, passport_1.isPassportDisplayId)(passportId)
            ? await repository.loadTransactionByPassportIdentity(passportId)
            : await repository.loadTransaction(passportId);
    if (!transaction)
        throw new https_1.HttpsError('not-found', 'This Proof was not found.');
    if (!transaction.participantIds.includes(uid)) {
        throw new https_1.HttpsError('permission-denied', 'You are not a participant in this transaction.');
    }
    const [records, timeline, returns] = await Promise.all([
        repository.listEvidence(transaction.id),
        repository.listTimeline(transaction.id),
        repository.listReturns(transaction.id),
    ]);
    const commerce = transaction.commerceContextId ? await repository.findCommerceContext(transaction.commerceContextId) : null;
    const proofs = new proof_application_service_1.ProofApplicationService(repository, () => config_1.connectLinkBaseUrl.value());
    try {
        return await proofs.getCurrentProof({
            transaction,
            artifacts: records,
            timeline,
            returns,
            commerce,
        }, null, { bindIdentity: false });
    }
    catch (error) {
        throw new https_1.HttpsError('failed-precondition', error instanceof Error ? error.message : 'This transaction does not yet qualify for a Proof.');
    }
});
exports.issuePackProofIdentity = (0, https_1.onCall)(callOptions, async (request) => {
    const uid = (0, helpers_1.requireUid)(request);
    const transactionId = typeof request.data?.transactionId === 'string' ? request.data.transactionId : '';
    if (!transactionId)
        throw new https_1.HttpsError('invalid-argument', 'A transactionId is required.');
    const repository = new merchant_evidence_repository_1.FirestoreMerchantEvidenceRepository(config_1.db);
    const transaction = await repository.loadTransaction(transactionId);
    if (!transaction)
        throw new https_1.HttpsError('not-found', 'This Proof was not found.');
    if (!transaction.participantIds.includes(uid)) {
        throw new https_1.HttpsError('permission-denied', 'You are not a participant in this transaction.');
    }
    const records = await repository.listEvidence(transaction.id);
    const commerce = transaction.commerceContextId ? await repository.findCommerceContext(transaction.commerceContextId) : null;
    const proofs = new proof_application_service_1.ProofApplicationService(repository, () => config_1.connectLinkBaseUrl.value());
    try {
        return await proofs.issueProofIdentity({ transaction, artifacts: records, commerce });
    }
    catch (error) {
        throw new https_1.HttpsError('failed-precondition', error instanceof Error ? error.message : 'This transaction does not yet qualify for a Proof.');
    }
});
//# sourceMappingURL=passport-callables.js.map