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

export type EnterpriseSessionRecord = {
  fulfillment: FulfillmentSessionDto;
  evidenceSession: EnterpriseEvidenceSessionDto | null;
  observations: HardwareObservationDto[];
  artifacts: EnterpriseArtifactDto[];
  events: ApplicationEvent[];
};

export interface EnterpriseFulfillmentRepository {
  saveStation(graph: EnterpriseStationGraph): Promise<void>;
  getStation(organizationId: string, stationId: string): Promise<EnterpriseStationGraph | null>;
  findStationByCode(organizationId: string, siteCode: string, stationCode: string): Promise<EnterpriseStationGraph | null>;
  saveSession(record: EnterpriseSessionRecord): Promise<void>;
  getSession(fulfillmentSessionId: string): Promise<EnterpriseSessionRecord | null>;
  findSessionByOrder(organizationId: string, stationId: string, externalOrderId: string): Promise<EnterpriseSessionRecord | null>;
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

export type ActorRef = { type: 'MERCHANT_API_CLIENT' | 'EDGE_AGENT' | 'SYSTEM'; id: string };
