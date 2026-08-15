export type TransactionStatus =
  | 'DRAFT'
  | 'AWAITING_BUYER'
  | 'TERMS_REVIEW'
  | 'TERMS_LOCKED'
  | 'PACKED'
  | 'SHIPPED'
  | 'BUYER_REVIEW'
  | 'COMPLETED'
  | 'DISPUTED'
  | 'CANCELLED'
  | 'ARCHIVED';

export type EvidenceType =
  | 'ITEM_PHOTO'
  | 'CONDITION_PHOTO'
  | 'IDENTIFIER_PHOTO'
  | 'COA_PHOTO'
  | 'PACKING_VIDEO'
  | 'SHIPPING_LABEL'
  | 'UNBOXING_VIDEO'
  | 'DELIVERY_PHOTO'
  | 'SUPPORTING_DOCUMENT'
  | 'RETURN_CONDITION_PHOTO'
  | 'RETURN_PACKING_VIDEO'
  | 'RETURN_SHIPPING_LABEL'
  | 'RETURN_UNBOXING_VIDEO'
  | 'PHYSICAL_REFERENCE_FRAME'
  | 'PHYSICAL_VERIFICATION_FRAME';

export type ReturnPassportStatus =
  | 'REQUESTED'
  | 'AUTHORIZED'
  | 'PACKED'
  | 'IN_TRANSIT'
  | 'RECEIVED_REVIEW'
  | 'COMPLETED'
  | 'CANCELLED'
  | 'DISPUTED';

export type DateLike = { toDate?: () => Date; seconds?: number } | string | null;

export type PackProofTransaction = {
  id: string;
  sellerId: string;
  buyerId: string | null;
  participantIds: string[];
  status: TransactionStatus;
  title: string;
  category: string;
  description: string;
  priceMinor: number;
  currency: string;
  identifiers: { label: string; value: string }[];
  conditionNotes: string;
  terms: {
    saleType: 'SHIPPED' | 'LOCAL_HANDOFF';
    shippingResponsibility: 'SELLER' | 'BUYER' | 'NOT_APPLICABLE';
    returns: 'NO_RETURNS' | 'AS_AGREED' | 'PLATFORM_POLICY';
    returnWindowDays: number;
    customTerms: string;
  };
  confirmedBy: string[];
  handoffConfirmedBy?: string[];
  completedBy?: string[];
  createdAt: DateLike;
  updatedAt: DateLike;
  lockedAt: DateLike;
  shipping?: {
    carrier: string;
    trackingNumber: string;
    shippedAt: DateLike;
    labelEvidenceMatchStatus?: 'MATCHED' | 'MISMATCH' | 'NOT_SCANNED';
    scannedTrackingNumber?: string | null;
    packingEvidenceId?: string;
    sealEvidenceId?: string;
  };
  source?:
    | {
      type: 'PACKPROOF_CONNECT';
      platform: string;
      integrationId: string;
      connectSessionId: string;
      commerceContextId?: string | null;
      externalOrderId: string;
      externalSellerId: string;
      callbackUrl: string;
      trackingNumber?: string | null;
      carrier?: string | null;
      declaredWeightGrams?: number | null;
    }
    | {
      type: 'PACKPROOF_BUTTON';
      integrationId: string;
      commerceContextId: string;
      passportDraftId: string;
      publicHandoffId: string;
      trustLevel: 'PAGE_DECLARED';
      origin: string;
      productUrl: string;
    };
};

export type EvidenceRecord = {
  id: string;
  transactionId: string;
  uploaderId: string;
  role: 'SELLER' | 'BUYER';
  type: EvidenceType;
  storagePath: string;
  contentType: string;
  originalName: string;
  sizeBytes: number;
  sha256: string;
  serverFinalized?: boolean;
  /** Legacy field retained only when reading pre-v2 evidence records. */
  serverVerified?: boolean;
  createdAt: DateLike;
  returnPassportId?: string | null;
  connectSessionId?: string | null;
  manifestPath?: string;
  manifestSha256?: string;
  evidenceBundleSha256?: string;
  manifestSchemaVersion?: number;
  canonicalizationProfile?: string;
  bundleBindingProfile?: string;
  manifestAuthentication?: {
    type: 'SERVICE_MAC';
    algorithm: 'HMAC-SHA256';
    keyId: string;
    macBase64url: string;
    verificationScope: 'PACKPROOF_SERVICE_ONLY';
  };
  /** Legacy ambiguous name; new records use manifestAuthentication. */
  manifestSignature?: string;
  attestationStatus?: 'ONLINE_APP_CHECK_AND_KEY_POSSESSION' | 'ONLINE_APP_CHECK_ONLY' | 'OFFLINE_UNATTESTED' | 'NOT_PROVIDED' | 'JIT_VERIFIED' | 'JIT_APP_CHECK_ONLY';
  clientHashMatched?: boolean | null;
  clientSizeMatched?: boolean | null;
  detectedContentType?: string | null;
  contentTypeMatched?: boolean | null;
  deviceKeySignatureValid?: boolean | null;
  deviceKeyHardwareBackedSignal?: boolean | null;
  /** Legacy client-reported field name. */
  deviceKeyHardwareBacked?: boolean | null;
  assurance?: {
    acquisitionQuality: AssuranceDimension;
    appDeviceContext: AssuranceDimension;
    byteIntegrity: AssuranceDimension;
    physicalCorrespondence: AssuranceDimension;
    carrierContext: AssuranceDimension;
    businessLegalRelevance: AssuranceDimension;
  };
  carrierTrackingMatchStatus?: 'MATCHED' | 'MISMATCH' | 'NO_EXPECTED_TRACKING' | 'NOT_SCANNED';
  scannedTrackingNumber?: string | null;
  postSubmissionTrackingMatchStatus?: 'MATCHED' | 'MISMATCH' | 'NOT_SCANNED';
  postSubmissionExpectedTrackingNumber?: string | null;
  postSubmissionComparedAt?: DateLike;
  captureGroupId?: string | null;
  physicalRegionId?: string | null;
  captureProfileId?: string | null;
  physicalCaptureIntent?: 'REFERENCE' | 'VERIFICATION' | null;
  physicalFrameIndex?: number | null;
};

export type AssuranceDimension = {
  status: string;
  reasonCodes: string[];
};

export type ReturnPassport = {
  id: string;
  transactionId: string;
  initiatedBy: string;
  returningParticipantId: string;
  recipientId: string;
  authorizedBy: string | null;
  participantIds: string[];
  status: ReturnPassportStatus;
  reason: string;
  originalEvidenceHashes: string[];
  createdAt: DateLike;
  updatedAt: DateLike;
  authorizedAt?: DateLike;
  shipping?: {
    carrier: string;
    trackingNumber: string;
    shippedAt: DateLike;
    labelEvidenceMatchStatus?: 'MATCHED' | 'MISMATCH' | 'NOT_SCANNED';
    scannedTrackingNumber?: string | null;
    packingEvidenceId?: string;
    sealEvidenceId?: string;
  };
  completedBy: string[];
};

export type TimelineEvent = {
  id: string;
  actorId: string;
  type: string;
  summary: string;
  createdAt: DateLike;
};

export type UserProfile = {
  uid: string;
  displayName: string;
  email: string | null;
  photoURL: string | null;
  providers: string[];
  plan: 'FREE' | 'PRO';
  deletionScheduledAt?: DateLike;
};
