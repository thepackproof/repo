"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProofApplicationService = void 0;
exports.evaluateProofAvailabilityFromFacts = evaluateProofAvailabilityFromFacts;
exports.shipmentOf = shipmentOf;
const passport_1 = require("../../domain/v1/passport");
const errors_1 = require("./errors");
const operation_log_1 = require("./operation-log");
const passport_projection_1 = require("./passport-projection");
function evaluateProofAvailabilityFromFacts(facts) {
    const transactionInput = (0, passport_projection_1.passportTransactionInput)(facts.transaction);
    const evaluated = (0, passport_1.evaluateProofAvailability)({
        transactionExists: true,
        merchantReference: facts.transaction.merchantReference,
        commerceContextId: facts.transaction.commerceContextId,
        commerceTrustLevel: facts.commerce?.trustLevel ?? null,
        sourceTrustLevel: transactionInput.sourceTrustLevel ?? null,
        externalOrderId: facts.transaction.externalOrderId,
        artifacts: facts.artifacts.map(passport_projection_1.passportArtifactInput),
        displayedUnattributedFacts: (0, passport_1.countDisplayedUnattributedCommercialFacts)(transactionInput, facts.commerce),
        passportId: facts.transaction.passportId,
    });
    return {
        availability: evaluated.availability,
        passportId: facts.transaction.passportId,
        displayId: facts.transaction.passportDisplayId,
        eligibility: evaluated.eligibility,
    };
}
class ProofApplicationService {
    binder;
    verificationBaseUrl;
    now;
    constructor(binder, verificationBaseUrl, now = () => new Date()) {
        this.binder = binder;
        this.verificationBaseUrl = verificationBaseUrl;
        this.now = now;
    }
    evaluateAvailability(facts) {
        return evaluateProofAvailabilityFromFacts(facts);
    }
    async issueProofIdentity(facts) {
        return (0, operation_log_1.withOperationLog)('proof.issueIdentity', () => this.issueProofIdentityInner(facts), {
            transactionIdHash: facts.transaction.id.slice(-8),
        });
    }
    async getCurrentProof(facts, reviewQuery = null, options = {}) {
        return (0, operation_log_1.withOperationLog)('proof.getCurrent', () => this.getCurrentProofInner(facts, reviewQuery, options), {
            transactionIdHash: facts.transaction.id.slice(-8),
        });
    }
    async issueProofIdentityInner(facts) {
        const availability = this.evaluateAvailability(facts);
        if (availability.availability === 'NOT_ELIGIBLE') {
            throw (0, passport_projection_1.passportNotReady)(availability.eligibility.ok ? [] : availability.eligibility.failures);
        }
        (0, passport_projection_1.assertPassportEligible)(facts.transaction, facts.artifacts, facts.commerce);
        const issuedAt = this.now();
        const identity = (0, passport_projection_1.boundOrIssuedIdentity)(facts.transaction, issuedAt);
        if (identity.bind) {
            const bound = await this.binder.bindPassportIdentity(facts.transaction.id, {
                passportId: identity.passportId,
                displayId: identity.displayId,
                issuedAt: identity.issuedAt,
            });
            identity.passportId = bound.passportId;
            identity.displayId = bound.displayId;
            identity.issuedAt = bound.issuedAt;
        }
        return {
            availability: 'AVAILABLE',
            passportId: identity.passportId,
            displayId: identity.displayId,
            eligibility: availability.eligibility,
        };
    }
    async getCurrentProofInner(facts, reviewQuery = null, options = {}) {
        const bindIdentity = options.bindIdentity === true;
        const availability = this.evaluateAvailability(facts);
        if (availability.availability === 'NOT_ELIGIBLE') {
            throw (0, passport_projection_1.passportNotReady)(availability.eligibility.ok ? [] : availability.eligibility.failures);
        }
        (0, passport_projection_1.assertPassportEligible)(facts.transaction, facts.artifacts, facts.commerce);
        const issuedAt = this.now();
        const identity = (0, passport_projection_1.boundOrIssuedIdentity)(facts.transaction, issuedAt);
        if (identity.bind) {
            if (!bindIdentity) {
                throw new errors_1.ApplicationError('FAILED_PRECONDITION', 'PROOF_IDENTITY_NOT_BOUND', 'This Proof is eligible but its identity has not been bound yet.');
            }
            const bound = await this.binder.bindPassportIdentity(facts.transaction.id, {
                passportId: identity.passportId,
                displayId: identity.displayId,
                issuedAt: identity.issuedAt,
            });
            identity.passportId = bound.passportId;
            identity.displayId = bound.displayId;
            identity.issuedAt = bound.issuedAt;
        }
        return (0, passport_projection_1.projectPassport)({
            transaction: facts.transaction,
            artifacts: facts.artifacts,
            shipment: facts.transaction.shipment,
            delivery: facts.transaction.delivery,
            returns: facts.returns,
            timeline: facts.timeline,
            commerce: facts.commerce,
            identity: {
                passportId: identity.passportId,
                displayId: identity.displayId,
                issuedAt: identity.issuedAt.toISOString(),
            },
            verificationBaseUrl: this.verificationBaseUrl(),
            reviewQuery,
            now: issuedAt.toISOString(),
        });
    }
    snapshotDto(record) {
        return (0, passport_projection_1.snapshotDto)(record);
    }
    exportDto(record, urls) {
        return (0, passport_projection_1.exportDto)(record, urls);
    }
    nextSnapshot(passport, version) {
        return (0, passport_projection_1.nextSnapshot)(passport, version, this.now());
    }
}
exports.ProofApplicationService = ProofApplicationService;
function shipmentOf(transaction) {
    return transaction.shipment;
}
//# sourceMappingURL=proof-application-service.js.map