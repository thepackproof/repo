import { integerValue, isoDateTime, literalValue, schema, sha256Value, strictObject, stringValue } from './runtime';
import { parseEnterpriseResourceId, type EnterpriseResourceId } from './enterprise';
import { parseResourceId, type ResourceId } from './common';

export const hardwareEventTypes = [
  'BARCODE_OBSERVED',
  'WEIGHT_STABLE',
  'VIDEO_STREAM_AVAILABLE',
  'CAPTURE_STARTED',
  'CAPTURE_SEGMENT_FINALIZED',
  'STILL_CAPTURED',
  'STREAM_INTERRUPTED',
] as const;
export type HardwareEventType = (typeof hardwareEventTypes)[number];

export const wmsEventTypes = ['ORDER_ASSIGNED', 'ORDER_UNASSIGNED'] as const;
export type WmsEventType = (typeof wmsEventTypes)[number];

export const edgeQueueFolders = ['pending', 'uploading', 'awaiting-finalization', 'finalized', 'attention'] as const;
export type EdgeQueueFolder = (typeof edgeQueueFolders)[number];

export const edgeAcquisitionAssurances = ['ONLINE_ASSURED', 'OFFLINE_CAPTURED'] as const;
export type EdgeAcquisitionAssurance = (typeof edgeAcquisitionAssurances)[number];

export const edgeTransportStates = ['PENDING', 'UPLOADING', 'AWAITING_FINALIZATION', 'SERVER_FINALIZED', 'ATTENTION'] as const;
export type EdgeTransportState = (typeof edgeTransportStates)[number];

export type EdgeRequestBinding = {
  organizationId: ResourceId<'organization'>;
  siteId: EnterpriseResourceId<'enterprise_site'>;
  edgeAgentId: EnterpriseResourceId<'edge_agent'>;
  stationId: EnterpriseResourceId<'packing_station'>;
  sessionId: EnterpriseResourceId<'fulfillment_session'> | null;
  requestId: string;
  timestamp: string;
  nonce: string;
};

export type BarcodeObservedEvent = {
  type: 'BARCODE_OBSERVED';
  format: string;
  normalizedValue: string;
  rawValueHash: string;
  deviceId: string;
  stationId: string;
  monotonicTimestamp: number;
};

export type WeightStableEvent = {
  type: 'WEIGHT_STABLE';
  grams: number;
  deviceId: string;
  measurementSequence: number;
  monotonicTimestamp: number;
};

export type CameraEvent =
  | { type: 'VIDEO_STREAM_AVAILABLE'; deviceId: string; sourceStreamId: string; monotonicTimestamp: number }
  | { type: 'CAPTURE_STARTED'; deviceId: string; sourceStreamId: string; fulfillmentSessionId: string | null; monotonicTimestamp: number }
  | {
    type: 'CAPTURE_SEGMENT_FINALIZED';
    deviceId: string;
    sourceStreamId: string;
    segmentSha256: string;
    durationMs: number;
    monotonicTimestamp: number;
  }
  | { type: 'STILL_CAPTURED'; deviceId: string; sha256: string; monotonicTimestamp: number }
  | { type: 'STREAM_INTERRUPTED'; deviceId: string; sourceStreamId: string; reason: string; monotonicTimestamp: number };

export type NormalizedHardwareEvent = BarcodeObservedEvent | WeightStableEvent | CameraEvent;

export type WmsOrderAssignedEvent = {
  type: 'ORDER_ASSIGNED';
  externalOrderId: string;
  stationCode: string;
  expectedItems: { sku: string; quantity: number }[];
  expectedTrackingNumber: string | null;
  transactionId: string | null;
};

export type EdgeQueueObject = {
  clientEvidenceId: string;
  fulfillmentSessionId: string;
  artifactType: string;
  folder: EdgeQueueFolder;
  acquisitionAssurance: EdgeAcquisitionAssurance;
  transportState: EdgeTransportState;
  plaintextSha256: string;
  sizeBytes: number;
};

export const edgeQueueFolderForTransport: Readonly<Record<EdgeTransportState, EdgeQueueFolder>> = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  AWAITING_FINALIZATION: 'awaiting-finalization',
  SERVER_FINALIZED: 'finalized',
  ATTENTION: 'attention',
};

export function syncLabelForQueueObject(object: Pick<EdgeQueueObject, 'acquisitionAssurance' | 'transportState'>):
  | 'ONLINE_ASSURED'
  | 'OFFLINE_CAPTURED'
  | 'OFFLINE_PENDING_SYNC'
  | 'SYNCED'
  | 'SERVER_FINALIZED' {
  if (object.transportState === 'SERVER_FINALIZED') return 'SERVER_FINALIZED';
  if (object.transportState === 'AWAITING_FINALIZATION') return 'SYNCED';
  if (object.acquisitionAssurance === 'OFFLINE_CAPTURED' && (object.transportState === 'PENDING' || object.transportState === 'UPLOADING')) {
    return 'OFFLINE_PENDING_SYNC';
  }
  return object.acquisitionAssurance;
}

export function uploadSuccessIsServerFinalization(): false {
  return false;
}

export const edgeRequestBindingSchema = schema<EdgeRequestBinding>((value) => {
  const input = strictObject(value, 'edgeRequest', [
    'organizationId', 'siteId', 'edgeAgentId', 'stationId', 'sessionId', 'requestId', 'timestamp', 'nonce',
  ]);
  return {
    organizationId: parseResourceId('organization', input.organizationId, 'edgeRequest.organizationId'),
    siteId: parseEnterpriseResourceId('enterprise_site', input.siteId, 'edgeRequest.siteId'),
    edgeAgentId: parseEnterpriseResourceId('edge_agent', input.edgeAgentId, 'edgeRequest.edgeAgentId'),
    stationId: parseEnterpriseResourceId('packing_station', input.stationId, 'edgeRequest.stationId'),
    sessionId: input.sessionId === undefined || input.sessionId === null
      ? null
      : parseEnterpriseResourceId('fulfillment_session', input.sessionId, 'edgeRequest.sessionId'),
    requestId: stringValue(input.requestId, 'edgeRequest.requestId', { min: 8, max: 160, pattern: /^[A-Za-z0-9._:-]+$/ }),
    timestamp: isoDateTime(input.timestamp, 'edgeRequest.timestamp'),
    nonce: stringValue(input.nonce, 'edgeRequest.nonce', { min: 16, max: 128, pattern: /^[A-Za-z0-9_-]+$/ }),
  };
});

export const barcodeObservedEventSchema = schema<BarcodeObservedEvent>((value) => {
  const input = strictObject(value, 'barcodeObserved', [
    'type', 'format', 'normalizedValue', 'rawValueHash', 'deviceId', 'stationId', 'monotonicTimestamp',
  ]);
  literalValue(input.type, 'barcodeObserved.type', 'BARCODE_OBSERVED');
  return {
    type: 'BARCODE_OBSERVED',
    format: stringValue(input.format, 'barcodeObserved.format', { min: 2, max: 40, pattern: /^[A-Za-z0-9_-]+$/ }),
    normalizedValue: stringValue(input.normalizedValue, 'barcodeObserved.normalizedValue', { min: 1, max: 160 }),
    rawValueHash: sha256Value(input.rawValueHash, 'barcodeObserved.rawValueHash'),
    deviceId: stringValue(input.deviceId, 'barcodeObserved.deviceId', { min: 2, max: 160 }),
    stationId: stringValue(input.stationId, 'barcodeObserved.stationId', { min: 2, max: 160 }),
    monotonicTimestamp: integerValue(input.monotonicTimestamp, 'barcodeObserved.monotonicTimestamp', 0, Number.MAX_SAFE_INTEGER),
  };
});

export const weightStableEventSchema = schema<WeightStableEvent>((value) => {
  const input = strictObject(value, 'weightStable', ['type', 'grams', 'deviceId', 'measurementSequence', 'monotonicTimestamp']);
  literalValue(input.type, 'weightStable.type', 'WEIGHT_STABLE');
  return {
    type: 'WEIGHT_STABLE',
    grams: integerValue(input.grams, 'weightStable.grams', 0, 1_000_000_000),
    deviceId: stringValue(input.deviceId, 'weightStable.deviceId', { min: 2, max: 160 }),
    measurementSequence: integerValue(input.measurementSequence, 'weightStable.measurementSequence', 1, 1_000_000_000),
    monotonicTimestamp: integerValue(input.monotonicTimestamp, 'weightStable.monotonicTimestamp', 0, Number.MAX_SAFE_INTEGER),
  };
});

export function classifyBarcode(normalizedValue: string, expectedSkus: readonly string[], expectedTrackingNumber: string | null):
  | 'ITEM_OBSERVED'
  | 'TRACKING_OBSERVED'
  | 'UNRECOGNIZED' {
  if (expectedTrackingNumber && normalizedValue === expectedTrackingNumber) return 'TRACKING_OBSERVED';
  if (expectedSkus.includes(normalizedValue)) return 'ITEM_OBSERVED';
  return 'UNRECOGNIZED';
}

export type EdgeCapabilityScope = {
  organizationId: string;
  siteId: string;
  stationId: string;
  edgeAgentId: string;
  transactionId: string;
  allowedDeviceIds: string[];
  allowedArtifactTypes: string[];
  maxArtifacts: number;
  captureWindowEndsAt: string;
  policyId: string;
};

export function edgeCapabilityAllows(scope: EdgeCapabilityScope, input: {
  organizationId: string;
  siteId: string;
  stationId: string;
  edgeAgentId: string;
  transactionId: string;
  deviceId: string;
  artifactType: string;
  artifactCount: number;
  now: string;
}): boolean {
  return scope.organizationId === input.organizationId
    && scope.siteId === input.siteId
    && scope.stationId === input.stationId
    && scope.edgeAgentId === input.edgeAgentId
    && scope.transactionId === input.transactionId
    && scope.allowedDeviceIds.includes(input.deviceId)
    && scope.allowedArtifactTypes.includes(input.artifactType)
    && input.artifactCount < scope.maxArtifacts
    && Date.parse(input.now) <= Date.parse(scope.captureWindowEndsAt);
}

export function assertOpenEndedEdgeCapabilityRejected(scope: Partial<EdgeCapabilityScope>): void {
  const unbounded = !scope.transactionId
    || !scope.stationId
    || !scope.allowedArtifactTypes?.length
    || !scope.allowedDeviceIds?.length
    || !scope.maxArtifacts
    || !scope.captureWindowEndsAt
    || !scope.policyId;
  if (unbounded) {
    throw new Error('Enterprise evidence sessions must be bound to organization, site, station, Edge agent, transaction, devices, artifact types, max artifacts, capture window, and policy.');
  }
}
