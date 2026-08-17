import type { ApplicationEvent } from './events';
import type {
  AcquisitionClass,
  EnterpriseArtifactDto,
  EnterpriseArtifactType,
  EnterpriseEvidenceSessionDto,
  EnterpriseObservationType,
  EnterpriseOperatingMode,
  EnterpriseOrganizationDto,
  EdgeAgentDto,
  EnterpriseSiteDto,
  FulfillmentSessionDto,
  HardwareObservationDto,
  PackingStationDto,
  StationDeviceDto,
} from '../../domain/v1/enterprise';

export type EnterpriseStationGraph = {
  organization: EnterpriseOrganizationDto;
  site: EnterpriseSiteDto;
  station: PackingStationDto;
  edgeAgent: EdgeAgentDto;
  devices: StationDeviceDto[];
};

export type EnterpriseUploadGrant = {
  uploadId: string;
  storagePath: string;
  clientEvidenceId: string;
  artifactId: string;
  requestFingerprint: string;
  acquisitionClass: 'ENTERPRISE_EDGE';
  edgeAgentId: string;
  organizationId: string;
  fulfillmentSessionId: string;
  transactionId: string;
  evidenceType: EnterpriseArtifactType;
  contentType: string;
  originalName: string;
  clientSha256: string;
  clientSizeBytes: number;
  expiresAt: string;
};

export type EnterpriseSessionRecord = {
  fulfillment: FulfillmentSessionDto;
  evidenceSession: EnterpriseEvidenceSessionDto | null;
  observations: HardwareObservationDto[];
  artifacts: EnterpriseArtifactDto[];
  events: ApplicationEvent[];
  grants: EnterpriseUploadGrant[];
};

export interface EnterpriseFulfillmentRepository {
  saveStation(graph: EnterpriseStationGraph): Promise<void>;
  getStation(organizationId: string, stationId: string): Promise<EnterpriseStationGraph | null>;
  findStationByCode(organizationId: string, siteCode: string, stationCode: string): Promise<EnterpriseStationGraph | null>;
  saveSession(record: EnterpriseSessionRecord): Promise<void>;
  getSession(fulfillmentSessionId: string): Promise<EnterpriseSessionRecord | null>;
  findSessionByOrder(organizationId: string, stationId: string, externalOrderId: string): Promise<EnterpriseSessionRecord | null>;
  saveIngress(uploadId: string, bytes: Buffer): Promise<void>;
  getIngress(uploadId: string): Promise<Buffer | null>;
  listStations(organizationId: string): Promise<EnterpriseStationGraph[]>;
  listSessions(organizationId: string): Promise<EnterpriseSessionRecord[]>;
  saveWmsMapping(mapping: WmsStationMapping): Promise<void>;
  listWmsMappings(organizationId: string): Promise<WmsStationMapping[]>;
  findWmsMapping(organizationId: string, externalStationCode: string): Promise<WmsStationMapping | null>;
}

export type BootstrapStationCommand = {
  organizationId: string;
  siteCode: string;
  siteName: string;
  stationCode: string;
  edgeInstallationIdentity: string;
  policyId: string;
  operatingMode: EnterpriseOperatingMode;
  requestId: string;
};

export type AssignOrderCommand = {
  organizationId: string;
  siteCode: string;
  stationCode: string;
  externalOrderId: string;
  transactionId: string;
  expectedItems: { sku: string; quantity: number }[];
  expectedTrackingNumber: string | null;
  commandKey: string;
  requestId: string;
};

export type RecordObservationCommand = {
  fulfillmentSessionId: string;
  edgeAgentId: string;
  deviceId: string;
  type: EnterpriseObservationType;
  acquisitionClass: AcquisitionClass;
  normalizedValue: string | null;
  grams: number | null;
  rawValueHash: string;
  monotonicTimestampMs: number;
  requestId: string;
};

export type ReserveArtifactCommand = {
  fulfillmentSessionId: string;
  edgeAgentId: string;
  deviceId: string;
  clientEvidenceId: string;
  type: EnterpriseArtifactType;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  rollingCapture: EnterpriseArtifactDto['rollingCapture'];
  requestId: string;
};

export type ActorRef = { type: 'MERCHANT_API_CLIENT' | 'EDGE_AGENT' | 'SYSTEM' | 'CONSOLE_OPERATOR' | 'WMS_INTEGRATION'; id: string };

export type WmsStationMapping = {
  organizationId: string;
  siteCode: string;
  stationCode: string;
  externalStationCode: string;
  inboundEvents: readonly ['ORDER_ASSIGNED', 'ORDER_UNASSIGNED'];
  outboundEvents: readonly ['PACKPROOF_EVIDENCE_READY'];
};

export type EdgeQueueHealth = {
  stationId: string;
  pending: number;
  uploading: number;
  awaitingFinalization: number;
  finalized: number;
  attention: number;
};

export type WmsEvidenceReadyCallback = {
  type: 'PACKPROOF_EVIDENCE_READY';
  externalOrderId: string;
  stationCode: string;
  transactionId: string;
  fulfillmentSessionId: string;
  operatingMode: EnterpriseOperatingMode;
  statements: string[];
  acquisitionClass: 'ENTERPRISE_EDGE';
};

export type WmsIngestCommand = {
  type: 'ORDER_ASSIGNED' | 'ORDER_UNASSIGNED';
  organizationId: string;
  siteCode?: string;
  stationCode?: string;
  externalStationCode?: string;
  externalOrderId: string;
  transactionId: string | null;
  expectedItems: { sku: string; quantity: number }[];
  expectedTrackingNumber: string | null;
  commandKey: string;
  requestId: string;
};
