/**
 * One Proof presentation model for Android and portal.
 * Screens must not pick identity, hashes, or disclaimers from a second path.
 */
export const PROOF_COMPARISON_FOOTNOTE =
  'Comparisons report relationships between recorded data. They do not establish product authenticity, legal ownership, custody or liability.';
export const PROOF_PAGE_ONE_FOOTER =
  'Review the evidence and provenance on the following pages. PackProof does not determine fraud, fault, or liability.';

export type CanonicalProofLike = {
  identity: {
    passportId: string;
    displayId: string;
    transactionId: string;
    issuedAt: string;
    verificationUrl: string;
    qrPayload: string;
    merchantPlatform?: string | null;
    externalOrderId?: string | null;
  };
  integrity: {
    banner: string;
    summary: string;
    meaning: string;
    criteria?: Record<string, string>;
  };
  transaction: {
    platform: { value: string | null };
    externalOrderId: { value: string | null };
    transactionDate: { value: string | null };
    sellerReference?: { value?: string | null };
  };
  items: Array<{
    expected: { title: { value: string | null } };
    comparisons: Array<{ attribute: string; result: string }>;
  }>;
  evidenceInventory: Array<{ category: string; state: string; artifactIds?: string[] }>;
  artifacts?: Array<{
    artifactId: string;
    type?: string;
    sha256?: string | null;
    manifestSha256?: string | null;
    finalizedAt?: string | null;
  }>;
  fulfillment: {
    packingArtifactId: string | null;
    sealArtifactId: string | null;
    labelArtifactId: string | null;
    trackingObserved: { value: string | null };
  };
  provenance?: Array<{ field: string; provenanceClass?: string; value?: unknown }>;
  limitations: {
    doesNotAuthenticateItem: boolean;
    doesNotProveCustody: boolean;
    doesNotDecideFraudOrFault: boolean;
    doesNotGuaranteeDisputeOutcome: boolean;
    humanReviewDisclaimer: string;
  };
  createdAt?: string;
  updatedAt?: string;
};

export type ProofPresentation = {
  identity: {
    passportId: string;
    displayId: string;
    transactionId: string;
    issuedAt: string;
    verificationUrl: string;
    qrPayload: string;
    merchantPlatform: string | null;
    externalOrderId: string | null;
  };
  integrity: {
    banner: string;
    summary: string;
    meaning: string;
  };
  transaction: {
    platform: { value: string | null };
    externalOrderId: { value: string | null };
    transactionDate: { value: string | null };
  };
  items: Array<{
    expected: { title: { value: string | null } };
    comparisons: Array<{ attribute: string; result: string }>;
  }>;
  evidenceInventory: Array<{ category: string; state: string }>;
  fulfillment: {
    packingArtifactId: string | null;
    sealArtifactId: string | null;
    labelArtifactId: string | null;
    trackingObserved: { value: string | null };
  };
  limitations: {
    doesNotAuthenticateItem: boolean;
    doesNotProveCustody: boolean;
    doesNotDecideFraudOrFault: boolean;
    doesNotGuaranteeDisputeOutcome: boolean;
    humanReviewDisclaimer: string;
  };
  comparisonFootnote: string;
  pageOneFooter: string;
};

export type ProofParitySnapshot = {
  passportId: string;
  displayId: string;
  transactionId: string;
  issuedAt: string;
  verificationUrl: string;
  qrPayload: string;
  platform: string | null;
  externalOrderId: string | null;
  transactionDate: string | null;
  sellerReference: string | null;
  expectedTitle: string | null;
  integrityBanner: string;
  integrityCriteria: Record<string, string>;
  artifactIds: string[];
  artifactDigests: Array<{ artifactId: string; sha256: string | null; manifestSha256: string | null; finalizedAt: string | null }>;
  packingArtifactId: string | null;
  sealArtifactId: string | null;
  provenanceFields: string[];
  disclaimer: string;
  comparisonFootnote: string;
  pageOneFooter: string;
  doesNotDecideFraudOrFault: boolean;
};

export function presentProof(passport: CanonicalProofLike): ProofPresentation {
  return {
    identity: {
      passportId: passport.identity.passportId,
      displayId: passport.identity.displayId,
      transactionId: passport.identity.transactionId,
      issuedAt: passport.identity.issuedAt,
      verificationUrl: passport.identity.verificationUrl,
      qrPayload: passport.identity.qrPayload,
      merchantPlatform: passport.identity.merchantPlatform ?? null,
      externalOrderId: passport.identity.externalOrderId ?? null,
    },
    integrity: {
      banner: passport.integrity.banner,
      summary: passport.integrity.summary,
      meaning: passport.integrity.meaning,
    },
    transaction: {
      platform: { value: passport.transaction.platform.value ?? null },
      externalOrderId: { value: passport.transaction.externalOrderId.value ?? null },
      transactionDate: { value: passport.transaction.transactionDate.value ?? null },
    },
    items: (passport.items ?? []).map((item) => ({
      expected: { title: { value: item.expected.title.value ?? null } },
      comparisons: (item.comparisons ?? []).map((comparison) => ({
        attribute: comparison.attribute,
        result: comparison.result,
      })),
    })),
    evidenceInventory: (passport.evidenceInventory ?? []).map((entry) => ({
      category: entry.category,
      state: entry.state,
    })),
    fulfillment: {
      packingArtifactId: passport.fulfillment.packingArtifactId ?? null,
      sealArtifactId: passport.fulfillment.sealArtifactId ?? null,
      labelArtifactId: passport.fulfillment.labelArtifactId ?? null,
      trackingObserved: { value: passport.fulfillment.trackingObserved.value ?? null },
    },
    limitations: {
      doesNotAuthenticateItem: passport.limitations.doesNotAuthenticateItem,
      doesNotProveCustody: passport.limitations.doesNotProveCustody,
      doesNotDecideFraudOrFault: passport.limitations.doesNotDecideFraudOrFault,
      doesNotGuaranteeDisputeOutcome: passport.limitations.doesNotGuaranteeDisputeOutcome,
      humanReviewDisclaimer: passport.limitations.humanReviewDisclaimer,
    },
    comparisonFootnote: PROOF_COMPARISON_FOOTNOTE,
    pageOneFooter: PROOF_PAGE_ONE_FOOTER,
  };
}

export function proofParitySnapshot(passport: CanonicalProofLike): ProofParitySnapshot {
  const presented = presentProof(passport);
  return {
    passportId: presented.identity.passportId,
    displayId: presented.identity.displayId,
    transactionId: presented.identity.transactionId,
    issuedAt: presented.identity.issuedAt,
    verificationUrl: presented.identity.verificationUrl,
    qrPayload: presented.identity.qrPayload,
    platform: presented.transaction.platform.value,
    externalOrderId: presented.transaction.externalOrderId.value,
    transactionDate: presented.transaction.transactionDate.value,
    sellerReference: passport.transaction.sellerReference?.value ?? null,
    expectedTitle: presented.items[0]?.expected.title.value ?? null,
    integrityBanner: presented.integrity.banner,
    integrityCriteria: { ...(passport.integrity.criteria ?? {}) },
    artifactIds: (passport.artifacts ?? []).map((item) => item.artifactId),
    artifactDigests: (passport.artifacts ?? []).map((item) => ({
      artifactId: item.artifactId,
      sha256: item.sha256 ?? null,
      manifestSha256: item.manifestSha256 ?? null,
      finalizedAt: item.finalizedAt ?? null,
    })),
    packingArtifactId: presented.fulfillment.packingArtifactId,
    sealArtifactId: presented.fulfillment.sealArtifactId,
    provenanceFields: (passport.provenance ?? []).map((item) => item.field).sort(),
    disclaimer: presented.limitations.humanReviewDisclaimer,
    comparisonFootnote: presented.comparisonFootnote,
    pageOneFooter: presented.pageOneFooter,
    doesNotDecideFraudOrFault: presented.limitations.doesNotDecideFraudOrFault,
  };
}
