import type { ApplicationEvent } from './events';
import type {
  MerchantConnectSessionStatus,
  MerchantEvidenceArtifactDto,
  MerchantReturnPassportDto,
  MerchantShipmentDto,
  MerchantTimelineEventDto,
} from './merchant-evidence-types';
import type { MerchantPrincipal } from './merchant-types';

export type AccessibleMerchantTransaction = {
  id: string;
  organizationId: string | null;
  integrationId: string | null;
  merchantReference: string | null;
  title: string;
  description: string;
  category: string | null;
  status: string;
  consumerStatus: string;
  amount: { currency: string; minorUnits: number } | null;
  terms: {
    saleType: string;
    shippingResponsibility: string;
    returns: string;
    returnWindowDays: number;
    customTerms: string;
  } | null;
  shipment: MerchantShipmentDto | null;
  createdAt: Date;
  updatedAt: Date;
};

export type StoredEvidenceRecord = {
  id: string;
  transactionId: string;
  type: string;
  role: string | null;
  contentType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  manifestSha256: string | null;
  evidenceBundleSha256: string | null;
  manifestAuthenticationScope: string | null;
  returnPassportId: string | null;
  serverFinalized: boolean;
  serverVerified: boolean;
  clientHashMatched: boolean | null;
  clientSizeMatched: boolean | null;
  contentTypeMatched: boolean | null;
  assurance: MerchantEvidenceArtifactDto['assurance'];
  carrierTrackingMatchStatus: string | null;
  scannedTrackingNumber: string | null;
  createdAt: Date;
  updatedAt: Date;
  finalizedAt: Date | null;
};

export type StoredReportRecord = {
  id: string;
  transactionId: string;
  sha256: string;
  storagePath: string;
  evidenceCount: number;
  createdAt: Date;
};

export type AssociateShipmentRecord = {
  carrier: string;
  trackingNumber: string;
  packingEvidenceId: string;
  sealEvidenceId: string;
  scannedTrackingNumber: string | null;
  labelEvidenceMatchStatus: 'MATCHED' | 'MISMATCH' | 'NOT_SCANNED';
  markConsumerShipped: boolean;
  occurredAt: Date;
};

export interface MerchantEvidenceRepository {
  findAccessibleTransaction(transactionId: string, principal: MerchantPrincipal): Promise<AccessibleMerchantTransaction | null>;
  listEvidence(transactionId: string): Promise<StoredEvidenceRecord[]>;
  findEvidence(transactionId: string, artifactId: string): Promise<StoredEvidenceRecord | null>;
  listTimeline(transactionId: string): Promise<MerchantTimelineEventDto[]>;
  listReturns(transactionId: string): Promise<MerchantReturnPassportDto[]>;
  findReturn(transactionId: string, returnPassportId: string): Promise<MerchantReturnPassportDto | null>;
  listReports(transactionId: string): Promise<StoredReportRecord[]>;
  findReport(transactionId: string, reportId: string): Promise<StoredReportRecord | null>;
  associateShipment(
    transactionId: string,
    record: AssociateShipmentRecord,
    event: ApplicationEvent,
  ): Promise<MerchantShipmentDto>;
}

export interface EvidenceReportGenerator {
  generate(transactionId: string, generatedBy: string, options?: { reportId?: string }): Promise<{
    reportId: string;
    storagePath: string;
    sha256: string;
    evidenceCount: number;
  }>;
}

export interface EvidenceReportUrlSigner {
  sign(storagePath: string, expiresAt: Date): Promise<string>;
}

export type BoundConnectIntegration = {
  id: string;
  platform: string;
  webhookSigningSecret: string;
  callbackOrigins: string[];
};

export type StoredConnectSession = {
  id: string;
  organizationId: string | null;
  integrationId: string;
  platform: string;
  externalOrderId: string;
  status: string;
  transactionId: string | null;
  commerceContextId: string | null;
  itemTitle: string;
  currency: string;
  priceMinor: number;
  trackingNumber: string | null;
  carrier: string | null;
  expiresAt: Date;
  createdAt: Date;
};

export type ConnectSessionCancelDecision =
  | { type: 'REPLAY'; session: StoredConnectSession }
  | { type: 'CANCEL'; session: StoredConnectSession; event: ApplicationEvent };

export function publicConnectSessionStatus(
  status: string,
  expiresAt: Date,
  now: Date,
): MerchantConnectSessionStatus {
  if (status === 'CANCELLED') return 'CANCELLED';
  if (status === 'READY_FOR_CAPTURE') return 'READY_FOR_CAPTURE';
  if (status === 'EXPIRED' || (status === 'PENDING_REDEMPTION' && expiresAt.getTime() < now.getTime())) {
    return 'EXPIRED';
  }
  return 'PENDING_REDEMPTION';
}

export interface MerchantConnectIntegrationLookup {
  findBoundIntegration(principal: MerchantPrincipal): Promise<BoundConnectIntegration | null>;
}

export interface MerchantConnectSessionReader {
  findAccessibleSession(sessionId: string, principal: MerchantPrincipal): Promise<StoredConnectSession | null>;
  listAccessibleSessions(principal: MerchantPrincipal, externalOrderId: string): Promise<StoredConnectSession[]>;
  cancelAccessibleSession(
    sessionId: string,
    principal: MerchantPrincipal,
    decide: (session: StoredConnectSession | null) => ConnectSessionCancelDecision,
  ): Promise<StoredConnectSession>;
}

export interface PublicCallbackUrlValidator {
  validate(callbackUrl: string, allowedOrigins: readonly string[]): Promise<void>;
}
