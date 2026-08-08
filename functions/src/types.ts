export const transactionStatuses = [
  'DRAFT',
  'AWAITING_BUYER',
  'TERMS_REVIEW',
  'TERMS_LOCKED',
  'PACKED',
  'SHIPPED',
  'BUYER_REVIEW',
  'COMPLETED',
  'DISPUTED',
  'CANCELLED',
  'ARCHIVED',
] as const;

export type TransactionStatus = (typeof transactionStatuses)[number];

export const evidenceTypes = [
  'ITEM_PHOTO',
  'CONDITION_PHOTO',
  'IDENTIFIER_PHOTO',
  'COA_PHOTO',
  'PACKING_VIDEO',
  'SHIPPING_LABEL',
  'UNBOXING_VIDEO',
  'DELIVERY_PHOTO',
  'SUPPORTING_DOCUMENT',
  'RETURN_CONDITION_PHOTO',
  'RETURN_PACKING_VIDEO',
  'RETURN_SHIPPING_LABEL',
  'RETURN_UNBOXING_VIDEO',
] as const;

export type EvidenceType = (typeof evidenceTypes)[number];

export const returnPassportStatuses = [
  'REQUESTED',
  'AUTHORIZED',
  'PACKED',
  'IN_TRANSIT',
  'RECEIVED_REVIEW',
  'COMPLETED',
  'CANCELLED',
  'DISPUTED',
] as const;

export type ReturnPassportStatus = (typeof returnPassportStatuses)[number];

export type TransactionRecord = {
  sellerId: string;
  buyerId: string | null;
  participantIds: string[];
  status: TransactionStatus;
  title: string;
  category: string;
  description: string;
  priceMinor: number;
  currency: string;
  identifiers: Array<{ label: string; value: string }>;
  conditionNotes: string;
  terms: {
    saleType: 'SHIPPED' | 'LOCAL_HANDOFF';
    shippingResponsibility: 'SELLER' | 'BUYER' | 'NOT_APPLICABLE';
    returns: 'NO_RETURNS' | 'AS_AGREED' | 'PLATFORM_POLICY';
    returnWindowDays: number;
    customTerms: string;
  };
  confirmedBy: string[];
  handoffConfirmedBy: string[];
  completedBy: string[];
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  lockedAt: FirebaseFirestore.Timestamp | null;
  activeInviteHash?: string;
  shipping?: {
    carrier: string;
    trackingNumber: string;
    shippedAt: FirebaseFirestore.Timestamp;
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

export type ReturnPassportRecord = {
  transactionId: string;
  initiatedBy: string;
  returningParticipantId: string;
  recipientId: string;
  authorizedBy: string | null;
  participantIds: string[];
  status: ReturnPassportStatus;
  reason: string;
  originalEvidenceHashes: string[];
  completedBy: string[];
  createdAt: FirebaseFirestore.Timestamp;
  updatedAt: FirebaseFirestore.Timestamp;
  authorizedAt?: FirebaseFirestore.Timestamp;
  shipping?: {
    carrier: string;
    trackingNumber: string;
    shippedAt: FirebaseFirestore.Timestamp;
    labelEvidenceMatchStatus?: 'MATCHED' | 'MISMATCH' | 'NOT_SCANNED';
    scannedTrackingNumber?: string | null;
    packingEvidenceId?: string;
  };
};
