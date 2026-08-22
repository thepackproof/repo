import {
  countDisplayedUnattributedCommercialFacts,
  evaluateProofAvailability,
  type PackProofPassportExportV1,
  type PackProofPassportSnapshotV1,
  type PackProofPassportV1,
  type PassportAggregatorInput,
  type PassportReviewQuery,
  type ProofAvailability,
} from '../../domain/v1/passport';
import { ApplicationError } from './errors';
import { withOperationLog } from './operation-log';
import type {
  AccessibleMerchantTransaction,
  PassportIdentityBinding,
  StoredEvidenceRecord,
  StoredPassportSnapshot,
} from './merchant-evidence-ports';
import type { MerchantReturnPassportDto, MerchantShipmentDto, MerchantTimelineEventDto } from './merchant-evidence-types';
import {
  assertPassportEligible,
  boundOrIssuedIdentity,
  exportDto,
  nextSnapshot,
  passportArtifactInput,
  passportNotReady,
  passportTransactionInput,
  projectPassport,
  snapshotDto,
} from './passport-projection';

export type ProofFactBundle = {
  transaction: AccessibleMerchantTransaction;
  artifacts: readonly StoredEvidenceRecord[];
  timeline: readonly MerchantTimelineEventDto[];
  returns: readonly MerchantReturnPassportDto[];
  commerce: PassportAggregatorInput['commerce'];
};

export type ProofIdentityBinder = {
  bindPassportIdentity(transactionId: string, identity: PassportIdentityBinding): Promise<PassportIdentityBinding>;
};

export type ProofAvailabilityResult = {
  availability: ProofAvailability;
  passportId: string | null;
  displayId: string | null;
  eligibility: ReturnType<typeof evaluateProofAvailability>['eligibility'];
};

export function evaluateProofAvailabilityFromFacts(facts: Pick<ProofFactBundle, 'transaction' | 'artifacts' | 'commerce'>): ProofAvailabilityResult {
  const transactionInput = passportTransactionInput(facts.transaction);
  const evaluated = evaluateProofAvailability({
    transactionExists: true,
    merchantReference: facts.transaction.merchantReference,
    commerceContextId: facts.transaction.commerceContextId,
    commerceTrustLevel: facts.commerce?.trustLevel ?? null,
    sourceTrustLevel: transactionInput.sourceTrustLevel ?? null,
    externalOrderId: facts.transaction.externalOrderId,
    artifacts: facts.artifacts.map(passportArtifactInput),
    displayedUnattributedFacts: countDisplayedUnattributedCommercialFacts(transactionInput, facts.commerce),
    passportId: facts.transaction.passportId,
  });
  return {
    availability: evaluated.availability,
    passportId: facts.transaction.passportId,
    displayId: facts.transaction.passportDisplayId,
    eligibility: evaluated.eligibility,
  };
}

export class ProofApplicationService {
  constructor(
    private readonly binder: ProofIdentityBinder,
    private readonly verificationBaseUrl: () => string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  evaluateAvailability(facts: Pick<ProofFactBundle, 'transaction' | 'artifacts' | 'commerce'>): ProofAvailabilityResult {
    return evaluateProofAvailabilityFromFacts(facts);
  }

  async issueProofIdentity(facts: Pick<ProofFactBundle, 'transaction' | 'artifacts' | 'commerce'>): Promise<ProofAvailabilityResult> {
    return withOperationLog('proof.issueIdentity', () => this.issueProofIdentityInner(facts), {
      transactionIdHash: facts.transaction.id.slice(-8),
    });
  }

  async getCurrentProof(facts: ProofFactBundle, reviewQuery: PassportReviewQuery | null = null, options: { bindIdentity?: boolean } = {}): Promise<PackProofPassportV1> {
    return withOperationLog('proof.getCurrent', () => this.getCurrentProofInner(facts, reviewQuery, options), {
      transactionIdHash: facts.transaction.id.slice(-8),
    });
  }

  private async issueProofIdentityInner(facts: Pick<ProofFactBundle, 'transaction' | 'artifacts' | 'commerce'>): Promise<ProofAvailabilityResult> {
    const availability = this.evaluateAvailability(facts);
    if (availability.availability === 'NOT_ELIGIBLE') {
      throw passportNotReady(availability.eligibility.ok ? [] : availability.eligibility.failures);
    }
    assertPassportEligible(facts.transaction, facts.artifacts, facts.commerce);
    const issuedAt = this.now();
    const identity = boundOrIssuedIdentity(facts.transaction, issuedAt);
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

  private async getCurrentProofInner(facts: ProofFactBundle, reviewQuery: PassportReviewQuery | null = null, options: { bindIdentity?: boolean } = {}): Promise<PackProofPassportV1> {
    const bindIdentity = options.bindIdentity === true;
    const availability = this.evaluateAvailability(facts);
    if (availability.availability === 'NOT_ELIGIBLE') {
      throw passportNotReady(availability.eligibility.ok ? [] : availability.eligibility.failures);
    }
    assertPassportEligible(facts.transaction, facts.artifacts, facts.commerce);
    const issuedAt = this.now();
    const identity = boundOrIssuedIdentity(facts.transaction, issuedAt);
    if (identity.bind) {
      if (!bindIdentity) {
        throw new ApplicationError(
          'FAILED_PRECONDITION',
          'PROOF_IDENTITY_NOT_BOUND',
          'This Proof is eligible but its identity has not been bound yet.',
        );
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
    return projectPassport({
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

  snapshotDto(record: StoredPassportSnapshot): PackProofPassportSnapshotV1 {
    return snapshotDto(record);
  }

  exportDto(record: StoredPassportSnapshot, urls: { url: string | null; expiresAt: string | null }): PackProofPassportExportV1 {
    return exportDto(record, urls);
  }

  nextSnapshot(passport: PackProofPassportV1, version: number): StoredPassportSnapshot {
    return nextSnapshot(passport, version, this.now());
  }
}

export function shipmentOf(transaction: AccessibleMerchantTransaction): MerchantShipmentDto | null {
  return transaction.shipment;
}
