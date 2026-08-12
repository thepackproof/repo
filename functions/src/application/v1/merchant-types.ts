export const apiScopes = [
  'transactions:read',
  'transactions:write',
  'participant_claims:write',
  'evidence:read',
  'evidence:write',
  'verification:read',
  'shipments:read',
  'shipments:write',
  'webhooks:read',
  'webhooks:write',
  'support:read',
  'support:write',
  'admin:organization',
] as const;

export type ApiScope = (typeof apiScopes)[number];
export type ApiEnvironment = 'sandbox' | 'live';

export type MerchantPrincipal = {
  type: 'MERCHANT_API_CLIENT';
  credentialId: string;
  apiClientId: string;
  organizationId: string;
  environment: ApiEnvironment;
  scopes: readonly ApiScope[];
};

export const merchantTransactionStatuses = [
  'CREATED',
  'CAPTURE_PENDING',
  'CAPTURE_IN_PROGRESS',
  'EVIDENCE_RECEIVED',
  'VERIFICATION_PENDING',
  'COMPLETED',
  'CANCELLED',
] as const;

export type MerchantTransactionStatus = (typeof merchantTransactionStatuses)[number];

export const captureArtifactTypes = [
  'ITEM_PHOTO',
  'CONDITION_PHOTO',
  'IDENTIFIER_PHOTO',
  'PACKING_VIDEO',
  'SHIPPING_LABEL',
  'UNBOXING_VIDEO',
  'DELIVERY_PHOTO',
  'SUPPORTING_DOCUMENT',
] as const;

export type CaptureArtifactType = (typeof captureArtifactTypes)[number];
export type MerchantParticipantRole = 'SELLER' | 'BUYER' | 'RECEIVER';

export type MerchantParticipantReference = {
  role: MerchantParticipantRole;
  externalReference: string;
};

export type CreateMerchantTransactionInput = {
  merchantReference: string;
  title: string;
  description: string;
  category: string | null;
  amount: { currency: string; minorUnits: number } | null;
  participants: MerchantParticipantReference[];
  captureRequirements: {
    requiredArtifactTypes: CaptureArtifactType[];
  };
};

export type MerchantTransaction = {
  id: string;
  organizationId: string;
  merchantReference: string;
  title: string;
  description: string;
  category: string | null;
  amount: { currency: string; minorUnits: number } | null;
  participants: MerchantParticipantReference[];
  captureRequirements: { requiredArtifactTypes: CaptureArtifactType[] };
  status: MerchantTransactionStatus;
  captureStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
  shipmentStatus: 'NOT_ASSOCIATED' | 'ASSOCIATED';
  receiverStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
  returnStatus: 'NOT_STARTED' | 'IN_PROGRESS' | 'COMPLETE';
  verificationStatus: 'PENDING_EVIDENCE' | 'PENDING' | 'PROCESSING' | 'COMPLETE';
  createdByApiClientId: string;
  createdAt: Date;
  updatedAt: Date;
};

export type MerchantTransactionDto = {
  id: string;
  object: 'transaction';
  merchantReference: string;
  title: string;
  description: string;
  category: string | null;
  amount: { currency: string; minorUnits: number } | null;
  participants: MerchantParticipantReference[];
  captureRequirements: { requiredArtifactTypes: CaptureArtifactType[] };
  status: MerchantTransactionStatus;
  captureStatus: MerchantTransaction['captureStatus'];
  shipmentStatus: MerchantTransaction['shipmentStatus'];
  receiverStatus: MerchantTransaction['receiverStatus'];
  returnStatus: MerchantTransaction['returnStatus'];
  verificationStatus: MerchantTransaction['verificationStatus'];
  createdAt: string;
  updatedAt: string;
};

export type ListMerchantTransactionsInput = {
  status?: MerchantTransactionStatus;
  merchantReference?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  cursor?: string;
  limit: number;
};

export type MerchantTransactionPage = {
  transactions: MerchantTransaction[];
  nextCursor: string | null;
};
