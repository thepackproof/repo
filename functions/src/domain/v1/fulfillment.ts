import type { PublicResource, ResourceId, VersionedResource } from './common';
import { parseResourceId } from './common';
import { arrayValue, enumValue, isoDateTime, literalValue, optionalIsoDateTime, optionalString, schema, strictObject, stringValue } from './runtime';

export const shipmentStatuses = ['PENDING', 'PACKED', 'IN_TRANSIT', 'DELIVERED', 'RECEIVER_REVIEW', 'COMPLETED', 'DISPUTED', 'CANCELLED'] as const;
export type ShipmentStatus = (typeof shipmentStatuses)[number];

export const shipmentTransitions: Readonly<Record<ShipmentStatus, readonly ShipmentStatus[]>> = {
  PENDING: ['PACKED', 'IN_TRANSIT', 'CANCELLED'],
  PACKED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['DELIVERED', 'DISPUTED'],
  DELIVERED: ['RECEIVER_REVIEW', 'COMPLETED', 'DISPUTED'],
  RECEIVER_REVIEW: ['COMPLETED', 'DISPUTED'],
  COMPLETED: ['DISPUTED'],
  DISPUTED: ['COMPLETED', 'CANCELLED'],
  CANCELLED: [],
};

export const carrierAssertionSources = ['PARTICIPANT', 'MERCHANT', 'PLATFORM_ADAPTER', 'CARRIER_ADAPTER', 'PACKPROOF_BARCODE_OBSERVATION'] as const;
export type CarrierAssertionSource = (typeof carrierAssertionSources)[number];

export type Shipment = VersionedResource<'shipment'> & {
  transactionId: ResourceId<'transaction'>;
  carrier: string;
  trackingNumber: string;
  assertionSource: CarrierAssertionSource;
  status: ShipmentStatus;
  packingEvidenceSessionId: ResourceId<'evidence_session'> | null;
  receiverEvidenceSessionId: ResourceId<'evidence_session'> | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
};

export type ShipmentDto = PublicResource<'shipment', 'shipment'> & {
  transactionId: ResourceId<'transaction'>;
  carrier: string;
  trackingNumber: string;
  assertionSource: CarrierAssertionSource;
  status: ShipmentStatus;
  packingEvidenceSessionId: ResourceId<'evidence_session'> | null;
  receiverEvidenceSessionId: ResourceId<'evidence_session'> | null;
  shippedAt: string | null;
  deliveredAt: string | null;
};

export const shipmentDtoSchema = schema<ShipmentDto>((value) => {
  const input = strictObject(value, 'shipment', [
    'id', 'object', 'schemaVersion', 'transactionId', 'carrier', 'trackingNumber', 'assertionSource', 'status',
    'packingEvidenceSessionId', 'receiverEvidenceSessionId', 'shippedAt', 'deliveredAt', 'createdAt', 'updatedAt',
  ]);
  literalValue(input.object, 'shipment.object', 'shipment');
  literalValue(input.schemaVersion, 'shipment.schemaVersion', 1);
  return {
    id: parseResourceId('shipment', input.id, 'shipment.id'),
    object: 'shipment',
    schemaVersion: 1,
    transactionId: parseResourceId('transaction', input.transactionId, 'shipment.transactionId', { allowLegacy: true }),
    carrier: stringValue(input.carrier, 'shipment.carrier', { min: 1, max: 120 }),
    trackingNumber: stringValue(input.trackingNumber, 'shipment.trackingNumber', { min: 3, max: 160 }),
    assertionSource: enumValue(input.assertionSource, 'shipment.assertionSource', carrierAssertionSources),
    status: enumValue(input.status, 'shipment.status', shipmentStatuses),
    packingEvidenceSessionId: input.packingEvidenceSessionId === undefined || input.packingEvidenceSessionId === null ? null : parseResourceId('evidence_session', input.packingEvidenceSessionId, 'shipment.packingEvidenceSessionId'),
    receiverEvidenceSessionId: input.receiverEvidenceSessionId === undefined || input.receiverEvidenceSessionId === null ? null : parseResourceId('evidence_session', input.receiverEvidenceSessionId, 'shipment.receiverEvidenceSessionId'),
    shippedAt: optionalIsoDateTime(input.shippedAt, 'shipment.shippedAt'),
    deliveredAt: optionalIsoDateTime(input.deliveredAt, 'shipment.deliveredAt'),
    createdAt: isoDateTime(input.createdAt, 'shipment.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'shipment.updatedAt'),
  };
});

export const returnPassportStatuses = ['REQUESTED', 'AUTHORIZED', 'PACKED', 'IN_TRANSIT', 'RECEIVED_REVIEW', 'COMPLETED', 'CANCELLED', 'DISPUTED'] as const;
export type ReturnPassportStatus = (typeof returnPassportStatuses)[number];

export const returnPassportTransitions: Readonly<Record<ReturnPassportStatus, readonly ReturnPassportStatus[]>> = {
  REQUESTED: ['AUTHORIZED', 'CANCELLED', 'DISPUTED'],
  AUTHORIZED: ['PACKED', 'CANCELLED', 'DISPUTED'],
  PACKED: ['IN_TRANSIT', 'CANCELLED', 'DISPUTED'],
  IN_TRANSIT: ['RECEIVED_REVIEW', 'DISPUTED'],
  RECEIVED_REVIEW: ['COMPLETED', 'DISPUTED'],
  COMPLETED: ['DISPUTED'],
  CANCELLED: [],
  DISPUTED: ['COMPLETED', 'CANCELLED'],
};

export type ReturnPassport = VersionedResource<'return_passport'> & {
  transactionId: ResourceId<'transaction'>;
  requestedByActorId: string;
  returningActorId: string;
  recipientActorId: string;
  reason: string;
  status: ReturnPassportStatus;
  originalEvidenceHashes: string[];
  shipmentId: ResourceId<'shipment'> | null;
  authorizedAt: Date | null;
  completedAt: Date | null;
};

export type ReturnPassportDto = PublicResource<'return_passport', 'return_passport'> & {
  transactionId: ResourceId<'transaction'>;
  reason: string;
  status: ReturnPassportStatus;
  originalEvidenceHashes: string[];
  shipmentId: ResourceId<'shipment'> | null;
  authorizedAt: string | null;
  completedAt: string | null;
};

export const returnPassportDtoSchema = schema<ReturnPassportDto>((value) => {
  const input = strictObject(value, 'returnPassport', [
    'id', 'object', 'schemaVersion', 'transactionId', 'reason', 'status', 'originalEvidenceHashes', 'shipmentId',
    'authorizedAt', 'completedAt', 'createdAt', 'updatedAt',
  ]);
  literalValue(input.object, 'returnPassport.object', 'return_passport');
  literalValue(input.schemaVersion, 'returnPassport.schemaVersion', 1);
  return {
    id: parseResourceId('return_passport', input.id, 'returnPassport.id', { allowLegacy: true }),
    object: 'return_passport',
    schemaVersion: 1,
    transactionId: parseResourceId('transaction', input.transactionId, 'returnPassport.transactionId', { allowLegacy: true }),
    reason: stringValue(input.reason, 'returnPassport.reason', { min: 1, max: 5000, trim: false }),
    status: enumValue(input.status, 'returnPassport.status', returnPassportStatuses),
    originalEvidenceHashes: arrayValue(input.originalEvidenceHashes, 'returnPassport.originalEvidenceHashes', { max: 1000, parse: (hash, path) => stringValue(hash, path, { min: 64, max: 64, pattern: /^[a-f0-9]{64}$/ }), uniqueBy: (hash) => hash }),
    shipmentId: input.shipmentId === undefined || input.shipmentId === null ? null : parseResourceId('shipment', input.shipmentId, 'returnPassport.shipmentId'),
    authorizedAt: optionalIsoDateTime(input.authorizedAt, 'returnPassport.authorizedAt'),
    completedAt: optionalIsoDateTime(input.completedAt, 'returnPassport.completedAt'),
    createdAt: isoDateTime(input.createdAt, 'returnPassport.createdAt'),
    updatedAt: isoDateTime(input.updatedAt, 'returnPassport.updatedAt'),
  };
});

export function returnSnapshotDocumentsDigitalHistoryOnly(returnPassport: ReturnPassportDto): boolean {
  return returnPassport.originalEvidenceHashes.length > 0;
}

export function shipmentHasExternalCustodyProof(_shipment: ShipmentDto): false {
  return false;
}

export function normalizeCarrierLabel(value: unknown): string | null {
  return optionalString(value, 'carrier', { min: 1, max: 120 });
}
