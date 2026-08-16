import type { AssuranceAssessment } from '../../domain/v1/evidence';

export const merchantEvidenceStatuses = ['RESERVED', 'UPLOADED', 'FINALIZED', 'QUARANTINED', 'FAILED'] as const;
export type MerchantEvidenceStatus = (typeof merchantEvidenceStatuses)[number];

export const protocolPresenceStates = ['ABSENT', 'PRESENT', 'PRESENT_WITH_LIMITATIONS'] as const;
export type ProtocolPresenceState = (typeof protocolPresenceStates)[number];

export const reviewDocumentationCategories = [
  'TERMS_AND_CONDITIONS',
  'ITEM_AND_ORDER_DESCRIPTION',
  'PACKING_AND_SEAL_REFERENCE',
  'ARRIVAL_OR_DELIVERY_OBSERVATION',
  'RETURN_DOCUMENTATION',
  'HASHED_EVIDENCE_INVENTORY',
  'AUDIT_TIMELINE',
] as const;
export type ReviewDocumentationCategory = (typeof reviewDocumentationCategories)[number];

export type MerchantEvidenceArtifactDto = {
  id: string;
  object: 'evidence_artifact';
  schemaVersion: 1;
  transactionId: string;
  type: string;
  status: MerchantEvidenceStatus;
  role: 'SELLER' | 'BUYER' | 'RECEIVER' | 'RETURN_SENDER' | 'RETURN_RECIPIENT' | 'WITNESS' | null;
  contentType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  manifestSha256: string | null;
  evidenceBundleSha256: string | null;
  manifestAuthenticationScope: 'PACKPROOF_SERVICE_ONLY' | null;
  workflowReady: boolean;
  assurance: AssuranceAssessment | null;
  carrierTrackingMatchStatus: string | null;
  finalizedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MerchantTimelineEventDto = {
  id: string;
  object: 'timeline_event';
  schemaVersion: 1;
  transactionId: string;
  type: string;
  summary: string;
  occurredAt: string;
};

export type MerchantShipmentDto = {
  id: string;
  object: 'shipment';
  schemaVersion: 1;
  transactionId: string;
  carrier: string;
  trackingNumber: string;
  assertionSource: 'MERCHANT';
  status: 'ASSOCIATED' | 'IN_TRANSIT';
  packingEvidenceId: string | null;
  sealEvidenceId: string | null;
  labelEvidenceMatchStatus: 'MATCHED' | 'MISMATCH' | 'NOT_SCANNED' | null;
  shippedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MerchantReturnPassportDto = {
  id: string;
  object: 'return_passport';
  schemaVersion: 1;
  transactionId: string;
  reason: string;
  status: string;
  originalEvidenceHashes: string[];
  shippingCarrier: string | null;
  shippingTrackingNumber: string | null;
  createdAt: string;
  updatedAt: string;
};

export type MerchantEvidenceReportDto = {
  id: string;
  object: 'evidence_report';
  schemaVersion: 1;
  transactionId: string;
  status: 'AVAILABLE';
  reportSha256: string;
  evidenceCount: number;
  presentationOnly: true;
  generatedAt: string;
  downloadUrl: string | null;
  downloadUrlExpiresAt: string | null;
};

export type ReviewProtocolCompleteness = {
  sellerPackingVideo: ProtocolPresenceState;
  sellerSealReference: ProtocolPresenceState;
  buyerArrivalObservation: ProtocolPresenceState;
  buyerUnboxing: ProtocolPresenceState;
  returnPackingVideo: ProtocolPresenceState;
  returnSealReference: ProtocolPresenceState;
};

export type ReviewDocumentationEntry = {
  category: ReviewDocumentationCategory;
  present: boolean;
  artifactIds: string[];
};

export type ReviewLimitations = {
  physicalCorrespondence: 'NOT_AVAILABLE';
  businessLegalRelevance: 'REVIEW_REQUIRED';
  doesNotAuthenticateItem: true;
  doesNotProveCustody: true;
  doesNotDecideFraudOrFault: true;
  doesNotGuaranteeDisputeOutcome: true;
  dossierIsPresentationOnly: true;
  manifestAuthenticationScope: 'PACKPROOF_SERVICE_ONLY';
  humanReviewDisclaimer: string;
};

export type MerchantReviewPackageDto = {
  id: string;
  object: 'review_package';
  schemaVersion: 1;
  transactionId: string;
  title: string;
  merchantReference: string | null;
  status: string;
  amount: { currency: string; minorUnits: number } | null;
  terms: {
    saleType: string;
    shippingResponsibility: string;
    returns: string;
    returnWindowDays: number;
    customTerms: string;
  } | null;
  protocolCompleteness: ReviewProtocolCompleteness;
  documentationCategories: ReviewDocumentationEntry[];
  evidence: MerchantEvidenceArtifactDto[];
  shipment: MerchantShipmentDto | null;
  returns: MerchantReturnPassportDto[];
  latestReport: Omit<MerchantEvidenceReportDto, 'downloadUrl' | 'downloadUrlExpiresAt'> | null;
  timeline: MerchantTimelineEventDto[];
  limitations: ReviewLimitations;
  createdAt: string;
  updatedAt: string;
};

export type AssociateMerchantShipmentInput = {
  carrier: string;
  trackingNumber: string;
};

export const merchantConnectSessionStatuses = [
  'PENDING_REDEMPTION',
  'READY_FOR_CAPTURE',
  'CANCELLED',
  'EXPIRED',
] as const;
export type MerchantConnectSessionStatus = (typeof merchantConnectSessionStatuses)[number];

export type MerchantConnectSessionDto = {
  id: string;
  object: 'connect_session';
  schemaVersion: 1;
  platform: string;
  externalOrderId: string;
  status: MerchantConnectSessionStatus;
  transactionId: string | null;
  commerceContextId: string | null;
  itemTitle: string;
  amount: { currency: string; minorUnits: number };
  trackingNumber: string | null;
  carrier: string | null;
  expiresAt: string;
  createdAt: string;
};

export type CreateMerchantConnectSessionInput = {
  platform: string;
  externalOrderId: string;
  externalSellerId: string;
  itemTitle: string;
  itemDescription: string;
  amount: { currency: string; minorUnits: number };
  trackingNumber?: string;
  carrier?: string;
  declaredWeightGrams?: number;
  callbackUrl: string;
};
