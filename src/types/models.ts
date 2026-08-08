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
  | 'RETURN_UNBOXING_VIDEO';

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
  };
  source?: {
    type: 'PACKPROOF_CONNECT';
    platform: string;
    integrationId: string;
    connectSessionId: string;
    externalOrderId: string;
    externalSellerId: string;
    callbackUrl: string;
    trackingNumber?: string | null;
    carrier?: string | null;
    declaredWeightGrams?: number | null;
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
  serverVerified: boolean;
  createdAt: DateLike;
  returnPassportId?: string | null;
  connectSessionId?: string | null;
  manifestPath?: string;
  manifestSha256?: string;
  evidenceBundleSha256?: string;
  manifestSignature?: string;
  attestationStatus?: 'JIT_VERIFIED' | 'JIT_APP_CHECK_ONLY' | 'OFFLINE_UNATTESTED' | 'NOT_PROVIDED';
  clientHashMatched?: boolean | null;
  deviceKeySignatureValid?: boolean | null;
  deviceKeyHardwareBacked?: boolean | null;
  carrierTrackingMatchStatus?: 'MATCHED' | 'MISMATCH' | 'NO_EXPECTED_TRACKING' | 'NOT_SCANNED';
  scannedTrackingNumber?: string | null;
  postSubmissionTrackingMatchStatus?: 'MATCHED' | 'MISMATCH' | 'NOT_SCANNED';
  postSubmissionExpectedTrackingNumber?: string | null;
  postSubmissionComparedAt?: DateLike;
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
