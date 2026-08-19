import { FieldValue, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import type { ApplicationEvent } from '../../../application/v1/events';
import type {
  AccessibleMerchantTransaction,
  AssociateDeliveryRecord,
  AssociateReturnShipmentRecord,
  AssociateShipmentRecord,
  BoundConnectIntegration,
  ConnectSessionCancelDecision,
  CreateReturnRecord,
  MerchantConnectIntegrationLookup,
  MerchantConnectSessionReader,
  MerchantEvidenceRepository,
  StoredConnectSession,
  StoredEvidenceRecord,
  StoredReportRecord,
} from '../../../application/v1/merchant-evidence-ports';
import type { MerchantDeliveryDto, MerchantReturnPassportDto, MerchantShipmentDto, MerchantTimelineEventDto } from '../../../application/v1/merchant-evidence-types';
import type { MerchantPrincipal } from '../../../application/v1/merchant-types';
import { sha256 } from '../../../application/v1/merchant-transaction-service';
import { asShippingTrackerObservation } from '../../../shipping-tracker';
import { storedOutboxEvent } from './outbox';

function dateValue(value: unknown, fallback: Date): Date {
  if (value instanceof Timestamp) return value.toDate();
  if (typeof value === 'string' && Number.isFinite(Date.parse(value))) return new Date(value);
  return fallback;
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value ? value : null;
}

function optionalInteger(value: unknown): number | null {
  return Number.isSafeInteger(value) ? value as number : null;
}

function shipmentIdFor(transactionId: string): string {
  return `shipment_${sha256(transactionId).slice(0, 40)}`;
}

function deliveryIdFor(transactionId: string): string {
  return `delivery_${sha256(transactionId).slice(0, 40)}`;
}

function matchStatus(value: unknown): 'MATCHED' | 'MISMATCH' | 'NOT_SCANNED' | null {
  return value === 'MATCHED' || value === 'MISMATCH' || value === 'NOT_SCANNED' ? value : null;
}

function trackingComparisonPatch(
  match: 'MATCHED' | 'MISMATCH' | 'NOT_SCANNED' | null,
  trackingNumber: string | null,
  occurredAt: Date,
  existing: DocumentData | undefined,
): Record<string, unknown> {
  const expected = trackingNumber ? trackingNumber.toUpperCase().replace(/[^A-Z0-9]/g, '') : '';
  return {
    ...(match ? { postSubmissionTrackingMatchStatus: match } : {}),
    ...(expected ? { postSubmissionExpectedTrackingNumber: expected } : {}),
    postSubmissionComparedAt: Timestamp.fromDate(occurredAt),
    ...(match === 'MISMATCH' && existing?.moderationStatus === 'UNREVIEWED'
      ? { moderationStatus: 'TRACKING_MISMATCH_REVIEW' }
      : {}),
  };
}

function toShipment(transactionId: string, shipping: DocumentData | undefined, createdAt: Date, updatedAt: Date): MerchantShipmentDto | null {
  if (!shipping || typeof shipping !== 'object') return null;
  const carrier = optionalString(shipping.carrier);
  const trackingNumber = optionalString(shipping.trackingNumber);
  if (!carrier || !trackingNumber) return null;
  return {
    id: shipmentIdFor(transactionId),
    object: 'shipment',
    schemaVersion: 1,
    transactionId,
    carrier,
    trackingNumber,
    assertionSource: 'MERCHANT',
    status: 'ASSOCIATED',
    packingEvidenceId: optionalString(shipping.packingEvidenceId),
    sealEvidenceId: optionalString(shipping.sealEvidenceId),
    labelEvidenceMatchStatus: matchStatus(shipping.labelEvidenceMatchStatus),
    shippedAt: shipping.shippedAt ? dateValue(shipping.shippedAt, updatedAt).toISOString() : null,
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

function toDelivery(transactionId: string, delivery: DocumentData | undefined, createdAt: Date, updatedAt: Date): MerchantDeliveryDto | null {
  if (!delivery || typeof delivery !== 'object') return null;
  const arrivalEvidenceId = optionalString(delivery.arrivalEvidenceId);
  if (!arrivalEvidenceId) return null;
  return {
    id: deliveryIdFor(transactionId),
    object: 'delivery',
    schemaVersion: 1,
    transactionId,
    assertionSource: 'MERCHANT',
    status: 'ASSOCIATED',
    arrivalEvidenceId,
    carrier: optionalString(delivery.carrier),
    trackingNumber: optionalString(delivery.trackingNumber),
    labelEvidenceMatchStatus: matchStatus(delivery.labelEvidenceMatchStatus),
    receivedAt: delivery.receivedAt ? dateValue(delivery.receivedAt, updatedAt).toISOString() : updatedAt.toISOString(),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

function toAccessible(id: string, data: DocumentData): AccessibleMerchantTransaction {
  const createdAt = dateValue(data.createdAt, new Date(0));
  const updatedAt = dateValue(data.updatedAt, createdAt);
  const amount = data.amount && typeof data.amount === 'object' && !Array.isArray(data.amount)
    ? data.amount as { currency?: unknown; minorUnits?: unknown }
    : null;
  const terms = data.terms && typeof data.terms === 'object' && !Array.isArray(data.terms)
    ? data.terms as Record<string, unknown>
    : null;
  const source = data.source && typeof data.source === 'object' && !Array.isArray(data.source)
    ? data.source as Record<string, unknown>
    : null;
  return {
    id,
    organizationId: optionalString(data.organizationId),
    integrationId: optionalString(source?.integrationId) ?? optionalString(data.integrationId),
    merchantReference: optionalString(data.merchantReference),
    title: optionalString(data.title) ?? 'Untitled transaction',
    description: typeof data.description === 'string' ? data.description : '',
    category: optionalString(data.category),
    status: optionalString(data.apiStatus) ?? optionalString(data.status) ?? 'UNKNOWN',
    consumerStatus: optionalString(data.status) ?? 'UNKNOWN',
    amount: amount && typeof amount.currency === 'string' && Number.isSafeInteger(amount.minorUnits)
      ? { currency: amount.currency, minorUnits: amount.minorUnits as number }
      : Number.isSafeInteger(data.priceMinor) && typeof data.currency === 'string'
        ? { currency: data.currency, minorUnits: data.priceMinor as number }
        : null,
    terms: terms ? {
      saleType: optionalString(terms.saleType) ?? 'SHIPPED',
      shippingResponsibility: optionalString(terms.shippingResponsibility) ?? 'SELLER',
      returns: optionalString(terms.returns) ?? 'PLATFORM_POLICY',
      returnWindowDays: Number.isSafeInteger(terms.returnWindowDays) ? terms.returnWindowDays as number : 0,
      customTerms: typeof terms.customTerms === 'string' ? terms.customTerms : '',
    } : null,
    sellerId: optionalString(data.sellerId),
    buyerId: optionalString(data.buyerId),
    participantIds: Array.isArray(data.participantIds)
      ? data.participantIds.filter((value: unknown): value is string => typeof value === 'string')
      : [],
    shipment: toShipment(id, data.shipping as DocumentData | undefined, createdAt, updatedAt),
    delivery: toDelivery(id, data.delivery as DocumentData | undefined, createdAt, updatedAt),
    createdAt,
    updatedAt,
  };
}

function principalCanAccess(transaction: AccessibleMerchantTransaction, principal: MerchantPrincipal): boolean {
  if (transaction.organizationId && transaction.organizationId === principal.organizationId) return true;
  if (transaction.integrationId && principal.integrationId && transaction.integrationId === principal.integrationId) return true;
  return false;
}

function toEvidence(transactionId: string, id: string, data: DocumentData): StoredEvidenceRecord {
  const createdAt = dateValue(data.createdAt, new Date(0));
  const updatedAt = dateValue(data.updatedAt ?? data.serverReceivedAt, createdAt);
  const finalizedAt = data.serverFinalized === true || data.serverVerified === true
    ? dateValue(data.serverReceivedAt ?? data.createdAt, createdAt)
    : null;
  const authentication = data.manifestAuthentication && typeof data.manifestAuthentication === 'object'
    ? data.manifestAuthentication as Record<string, unknown>
    : null;
  return {
    id,
    transactionId,
    type: optionalString(data.type) ?? 'SUPPORTING_DOCUMENT',
    role: optionalString(data.role),
    contentType: optionalString(data.contentType) ?? optionalString(data.detectedContentType),
    sizeBytes: optionalInteger(data.sizeBytes),
    sha256: optionalString(data.sha256),
    manifestSha256: optionalString(data.manifestSha256),
    evidenceBundleSha256: optionalString(data.evidenceBundleSha256),
    manifestAuthenticationScope: optionalString(authentication?.verificationScope),
    returnPassportId: optionalString(data.returnPassportId),
    serverFinalized: data.serverFinalized === true,
    serverVerified: data.serverVerified === true,
    clientHashMatched: typeof data.clientHashMatched === 'boolean' ? data.clientHashMatched : null,
    clientSizeMatched: typeof data.clientSizeMatched === 'boolean' ? data.clientSizeMatched : null,
    contentTypeMatched: typeof data.contentTypeMatched === 'boolean' ? data.contentTypeMatched : null,
    assurance: data.assurance && typeof data.assurance === 'object' ? data.assurance as StoredEvidenceRecord['assurance'] : null,
    carrierTrackingMatchStatus: optionalString(data.carrierTrackingMatchStatus),
    scannedTrackingNumber: optionalString(data.scannedTrackingNumber),
    shippingTracker: asShippingTrackerObservation(data.shippingTracker),
    createdAt,
    updatedAt,
    finalizedAt,
  };
}

function toReturn(transactionId: string, id: string, data: DocumentData): MerchantReturnPassportDto {
  const createdAt = dateValue(data.createdAt, new Date(0));
  const updatedAt = dateValue(data.updatedAt, createdAt);
  const shipping = data.shipping && typeof data.shipping === 'object' ? data.shipping as Record<string, unknown> : null;
  const hashes = Array.isArray(data.originalEvidenceHashes)
    ? data.originalEvidenceHashes.filter((value): value is string => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value))
    : [];
  return {
    id,
    object: 'return_passport',
    schemaVersion: 1,
    transactionId,
    reason: typeof data.reason === 'string' ? data.reason : '',
    status: optionalString(data.status) ?? 'REQUESTED',
    originalEvidenceHashes: hashes,
    shippingCarrier: optionalString(shipping?.carrier),
    shippingTrackingNumber: optionalString(shipping?.trackingNumber),
    packingEvidenceId: optionalString(shipping?.packingEvidenceId),
    sealEvidenceId: optionalString(shipping?.sealEvidenceId),
    labelEvidenceMatchStatus: matchStatus(shipping?.labelEvidenceMatchStatus),
    createdAt: createdAt.toISOString(),
    updatedAt: updatedAt.toISOString(),
  };
}

function toTimeline(transactionId: string, id: string, data: DocumentData): MerchantTimelineEventDto {
  return {
    id,
    object: 'timeline_event',
    schemaVersion: 1,
    transactionId,
    type: optionalString(data.type) ?? 'UNKNOWN',
    summary: typeof data.summary === 'string' ? data.summary : '',
    occurredAt: dateValue(data.createdAt, new Date(0)).toISOString(),
  };
}

function toReport(transactionId: string, id: string, data: DocumentData): StoredReportRecord | null {
  const sha256Value = optionalString(data.sha256);
  const storagePath = optionalString(data.storagePath);
  if (!sha256Value || !storagePath) return null;
  return {
    id,
    transactionId,
    sha256: sha256Value,
    storagePath,
    evidenceCount: optionalInteger(data.evidenceCount) ?? 0,
    createdAt: dateValue(data.createdAt, new Date(0)),
  };
}

export class FirestoreMerchantEvidenceRepository implements MerchantEvidenceRepository {
  constructor(private readonly firestore: Firestore) {}

  async findAccessibleTransaction(transactionId: string, principal: MerchantPrincipal): Promise<AccessibleMerchantTransaction | null> {
    const snap = await this.firestore.collection('transactions').doc(transactionId).get();
    if (!snap.exists) return null;
    const transaction = toAccessible(snap.id, snap.data()!);
    return principalCanAccess(transaction, principal) ? transaction : null;
  }

  async listEvidence(transactionId: string): Promise<StoredEvidenceRecord[]> {
    const snap = await this.firestore.collection('transactions').doc(transactionId).collection('evidence').orderBy('createdAt', 'asc').get();
    return snap.docs.map((doc) => toEvidence(transactionId, doc.id, doc.data()));
  }

  async findEvidence(transactionId: string, artifactId: string): Promise<StoredEvidenceRecord | null> {
    const snap = await this.firestore.collection('transactions').doc(transactionId).collection('evidence').doc(artifactId).get();
    if (!snap.exists) return null;
    return toEvidence(transactionId, snap.id, snap.data()!);
  }

  async listTimeline(transactionId: string): Promise<MerchantTimelineEventDto[]> {
    const snap = await this.firestore.collection('transactions').doc(transactionId).collection('events').orderBy('createdAt', 'asc').get();
    return snap.docs.map((doc) => toTimeline(transactionId, doc.id, doc.data()));
  }

  async listReturns(transactionId: string): Promise<MerchantReturnPassportDto[]> {
    const snap = await this.firestore.collection('transactions').doc(transactionId).collection('returns').orderBy('createdAt', 'asc').get();
    return snap.docs.map((doc) => toReturn(transactionId, doc.id, doc.data()));
  }

  async findReturn(transactionId: string, returnPassportId: string): Promise<MerchantReturnPassportDto | null> {
    const snap = await this.firestore.collection('transactions').doc(transactionId).collection('returns').doc(returnPassportId).get();
    if (!snap.exists) return null;
    return toReturn(transactionId, snap.id, snap.data()!);
  }

  async listReports(transactionId: string): Promise<StoredReportRecord[]> {
    const snap = await this.firestore.collection('transactions').doc(transactionId).collection('packets').orderBy('createdAt', 'asc').get();
    return snap.docs.map((doc) => toReport(transactionId, doc.id, doc.data())).filter((item): item is StoredReportRecord => item !== null);
  }

  async findReport(transactionId: string, reportId: string): Promise<StoredReportRecord | null> {
    const snap = await this.firestore.collection('transactions').doc(transactionId).collection('packets').doc(reportId).get();
    if (!snap.exists) return null;
    return toReport(transactionId, snap.id, snap.data()!);
  }

  async associateShipment(
    transactionId: string,
    record: AssociateShipmentRecord,
    event: ApplicationEvent,
  ): Promise<MerchantShipmentDto> {
    const ref = this.firestore.collection('transactions').doc(transactionId);
    const packingRef = ref.collection('evidence').doc(record.packingEvidenceId);
    const sealRef = ref.collection('evidence').doc(record.sealEvidenceId);
    const eventRef = ref.collection('events').doc(event.id);
    const outboxRef = this.firestore.collection('domainOutbox').doc(event.id);
    return this.firestore.runTransaction(async (tx) => {
      const [snap, packingSnap, sealSnap, existingEvent, existingOutbox] = await Promise.all([
        tx.get(ref), tx.get(packingRef), tx.get(sealRef), tx.get(eventRef), tx.get(outboxRef),
      ]);
      if (!snap.exists) throw new Error('Transaction disappeared before shipment association.');
      if (!packingSnap.exists || !sealSnap.exists) throw new Error('Shipment evidence disappeared before association.');
      const data = snap.data()!;
      const createdAt = dateValue(data.createdAt, record.occurredAt);
      tx.update(ref, {
        shipmentStatus: 'ASSOCIATED',
        ...(record.markConsumerShipped ? { status: 'SHIPPED' } : {}),
        shipping: {
          carrier: record.carrier,
          trackingNumber: record.trackingNumber,
          shippedAt: Timestamp.fromDate(record.occurredAt),
          labelEvidenceMatchStatus: record.labelEvidenceMatchStatus,
          scannedTrackingNumber: record.scannedTrackingNumber,
          packingEvidenceId: record.packingEvidenceId,
          sealEvidenceId: record.sealEvidenceId,
        },
        updatedAt: Timestamp.fromDate(record.occurredAt),
      });
      tx.update(packingRef, trackingComparisonPatch(record.labelEvidenceMatchStatus, record.trackingNumber, record.occurredAt, packingSnap.data()));
      tx.update(sealRef, trackingComparisonPatch(record.labelEvidenceMatchStatus, record.trackingNumber, record.occurredAt, sealSnap.data()));
      if (!existingEvent.exists) {
        tx.create(eventRef, {
          actorId: event.actor.id,
          type: event.type,
          summary: `Merchant recorded shipment with ${record.carrier}.`,
          metadata: { applicationEventId: event.id, schemaVersion: 1, labelEvidenceMatchStatus: record.labelEvidenceMatchStatus },
          createdAt: Timestamp.fromDate(record.occurredAt),
        });
      }
      if (!existingOutbox.exists) tx.create(outboxRef, storedOutboxEvent(event));
      return toShipment(transactionId, {
        carrier: record.carrier,
        trackingNumber: record.trackingNumber,
        packingEvidenceId: record.packingEvidenceId,
        sealEvidenceId: record.sealEvidenceId,
        labelEvidenceMatchStatus: record.labelEvidenceMatchStatus,
        shippedAt: Timestamp.fromDate(record.occurredAt),
      }, createdAt, record.occurredAt)!;
    });
  }

  async createReturn(
    transactionId: string,
    record: CreateReturnRecord,
    event: ApplicationEvent,
  ): Promise<MerchantReturnPassportDto> {
    const ref = this.firestore.collection('transactions').doc(transactionId);
    const returnRef = ref.collection('returns').doc(record.id);
    const eventRef = ref.collection('events').doc(event.id);
    const outboxRef = this.firestore.collection('domainOutbox').doc(event.id);
    return this.firestore.runTransaction(async (tx) => {
      const [snap, existingReturn, existingEvent, existingOutbox] = await Promise.all([
        tx.get(ref), tx.get(returnRef), tx.get(eventRef), tx.get(outboxRef),
      ]);
      if (!snap.exists) throw new Error('Transaction disappeared before return creation.');
      if (existingReturn.exists) return toReturn(transactionId, existingReturn.id, existingReturn.data()!);
      tx.create(returnRef, {
        id: record.id,
        transactionId,
        initiatedBy: record.initiatedBy,
        returningParticipantId: record.returningParticipantId,
        recipientId: record.recipientId,
        authorizedBy: null,
        participantIds: record.participantIds,
        status: 'REQUESTED',
        reason: record.reason,
        originalEvidenceHashes: record.originalEvidenceHashes,
        completedBy: [],
        createdAt: Timestamp.fromDate(record.occurredAt),
        updatedAt: Timestamp.fromDate(record.occurredAt),
      });
      tx.update(ref, {
        returnStatus: 'IN_PROGRESS',
        updatedAt: Timestamp.fromDate(record.occurredAt),
      });
      if (!existingEvent.exists) {
        tx.create(eventRef, {
          actorId: event.actor.id,
          type: event.type,
          summary: 'A merchant requested a return passport.',
          metadata: { applicationEventId: event.id, schemaVersion: 1, returnPassportId: record.id },
          createdAt: Timestamp.fromDate(record.occurredAt),
        });
      }
      if (!existingOutbox.exists) tx.create(outboxRef, storedOutboxEvent(event));
      return toReturn(transactionId, record.id, {
        reason: record.reason,
        status: 'REQUESTED',
        originalEvidenceHashes: record.originalEvidenceHashes,
        createdAt: Timestamp.fromDate(record.occurredAt),
        updatedAt: Timestamp.fromDate(record.occurredAt),
      });
    });
  }

  async associateReturnShipment(
    transactionId: string,
    returnPassportId: string,
    record: AssociateReturnShipmentRecord,
    event: ApplicationEvent,
  ): Promise<MerchantReturnPassportDto> {
    const ref = this.firestore.collection('transactions').doc(transactionId);
    const returnRef = ref.collection('returns').doc(returnPassportId);
    const packingRef = ref.collection('evidence').doc(record.packingEvidenceId);
    const sealRef = ref.collection('evidence').doc(record.sealEvidenceId);
    const eventRef = ref.collection('events').doc(event.id);
    const outboxRef = this.firestore.collection('domainOutbox').doc(event.id);
    return this.firestore.runTransaction(async (tx) => {
      const [returnSnap, packingSnap, sealSnap, existingEvent, existingOutbox] = await Promise.all([
        tx.get(returnRef), tx.get(packingRef), tx.get(sealRef), tx.get(eventRef), tx.get(outboxRef),
      ]);
      if (!returnSnap.exists) throw new Error('Return passport disappeared before shipping association.');
      if (!packingSnap.exists || !sealSnap.exists) throw new Error('Return evidence disappeared before shipping association.');
      const shipping = {
        carrier: record.carrier,
        trackingNumber: record.trackingNumber,
        shippedAt: Timestamp.fromDate(record.occurredAt),
        labelEvidenceMatchStatus: record.labelEvidenceMatchStatus,
        scannedTrackingNumber: record.scannedTrackingNumber,
        packingEvidenceId: record.packingEvidenceId,
        sealEvidenceId: record.sealEvidenceId,
      };
      tx.update(returnRef, {
        status: 'IN_TRANSIT',
        shipping,
        updatedAt: Timestamp.fromDate(record.occurredAt),
      });
      tx.update(packingRef, trackingComparisonPatch(record.labelEvidenceMatchStatus, record.trackingNumber, record.occurredAt, packingSnap.data()));
      tx.update(sealRef, trackingComparisonPatch(record.labelEvidenceMatchStatus, record.trackingNumber, record.occurredAt, sealSnap.data()));
      tx.update(ref, {
        returnStatus: 'IN_PROGRESS',
        updatedAt: Timestamp.fromDate(record.occurredAt),
      });
      if (!existingEvent.exists) {
        tx.create(eventRef, {
          actorId: event.actor.id,
          type: event.type,
          summary: `Merchant recorded return shipment with ${record.carrier}.`,
          metadata: { applicationEventId: event.id, schemaVersion: 1, returnPassportId, labelEvidenceMatchStatus: record.labelEvidenceMatchStatus },
          createdAt: Timestamp.fromDate(record.occurredAt),
        });
      }
      if (!existingOutbox.exists) tx.create(outboxRef, storedOutboxEvent(event));
      return toReturn(transactionId, returnPassportId, {
        ...returnSnap.data(),
        status: 'IN_TRANSIT',
        shipping,
        updatedAt: Timestamp.fromDate(record.occurredAt),
      });
    });
  }

  async associateDelivery(
    transactionId: string,
    record: AssociateDeliveryRecord,
    event: ApplicationEvent,
  ): Promise<MerchantDeliveryDto> {
    const ref = this.firestore.collection('transactions').doc(transactionId);
    const arrivalRef = ref.collection('evidence').doc(record.arrivalEvidenceId);
    const eventRef = ref.collection('events').doc(event.id);
    const outboxRef = this.firestore.collection('domainOutbox').doc(event.id);
    return this.firestore.runTransaction(async (tx) => {
      const [snap, arrivalSnap, existingEvent, existingOutbox] = await Promise.all([
        tx.get(ref), tx.get(arrivalRef), tx.get(eventRef), tx.get(outboxRef),
      ]);
      if (!snap.exists) throw new Error('Transaction disappeared before delivery association.');
      if (!arrivalSnap.exists) throw new Error('Arrival evidence disappeared before delivery association.');
      const data = snap.data()!;
      const createdAt = dateValue(data.createdAt, record.occurredAt);
      const delivery = {
        arrivalEvidenceId: record.arrivalEvidenceId,
        carrier: record.carrier,
        trackingNumber: record.trackingNumber,
        scannedTrackingNumber: record.scannedTrackingNumber,
        labelEvidenceMatchStatus: record.labelEvidenceMatchStatus,
        receivedAt: Timestamp.fromDate(record.occurredAt),
      };
      tx.update(ref, {
        receiverStatus: 'IN_PROGRESS',
        delivery,
        updatedAt: Timestamp.fromDate(record.occurredAt),
      });
      tx.update(arrivalRef, trackingComparisonPatch(record.labelEvidenceMatchStatus, record.trackingNumber, record.occurredAt, arrivalSnap.data()));
      if (!existingEvent.exists) {
        tx.create(eventRef, {
          actorId: event.actor.id,
          type: event.type,
          summary: 'Merchant associated receiver arrival observation.',
          metadata: { applicationEventId: event.id, schemaVersion: 1, arrivalEvidenceId: record.arrivalEvidenceId },
          createdAt: Timestamp.fromDate(record.occurredAt),
        });
      }
      if (!existingOutbox.exists) tx.create(outboxRef, storedOutboxEvent(event));
      return toDelivery(transactionId, delivery, createdAt, record.occurredAt)!;
    });
  }
}

function connectSessionIsAccessible(session: StoredConnectSession, principal: MerchantPrincipal): boolean {
  return (session.organizationId !== null && session.organizationId === principal.organizationId)
    || (Boolean(session.integrationId) && Boolean(principal.integrationId) && session.integrationId === principal.integrationId);
}

function toStoredConnectSession(id: string, data: DocumentData): StoredConnectSession | null {
  if (!(data.expiresAt instanceof Timestamp)) return null;
  return {
    id,
    organizationId: optionalString(data.organizationId),
    integrationId: optionalString(data.integrationId) ?? '',
    platform: optionalString(data.platform) ?? 'custom',
    externalOrderId: optionalString(data.externalOrderId) ?? '',
    status: optionalString(data.status) ?? 'PENDING_REDEMPTION',
    transactionId: optionalString(data.transactionId),
    commerceContextId: optionalString(data.commerceContextId),
    itemTitle: optionalString(data.itemTitle) ?? '',
    currency: optionalString(data.currency) ?? 'USD',
    priceMinor: optionalInteger(data.priceMinor) ?? 0,
    trackingNumber: optionalString(data.trackingNumber),
    carrier: optionalString(data.carrier),
    expiresAt: data.expiresAt.toDate(),
    createdAt: dateValue(data.createdAt, data.expiresAt.toDate()),
  };
}

export class FirestoreMerchantConnectAdapter implements MerchantConnectIntegrationLookup, MerchantConnectSessionReader {
  constructor(private readonly firestore: Firestore) {}

  async findBoundIntegration(principal: MerchantPrincipal): Promise<BoundConnectIntegration | null> {
    if (!principal.integrationId) return null;
    const snap = await this.firestore.collection('platformIntegrations').doc(principal.integrationId).get();
    if (!snap.exists) return null;
    const data = snap.data()!;
    if (data.status !== 'ACTIVE') return null;
    const organizationId = optionalString(data.organizationId);
    if (organizationId && organizationId !== principal.organizationId) return null;
    const secret = optionalString(data.webhookSigningSecret);
    const platform = optionalString(data.platform);
    if (!secret || !platform) return null;
    const origins = Array.isArray(data.callbackOrigins)
      ? data.callbackOrigins.filter((value): value is string => typeof value === 'string')
      : [];
    return { id: snap.id, platform, webhookSigningSecret: secret, callbackOrigins: origins };
  }

  async findAccessibleSession(sessionId: string, principal: MerchantPrincipal): Promise<StoredConnectSession | null> {
    const snap = await this.firestore.collection('connectSessions').doc(sessionId).get();
    if (!snap.exists) return null;
    const session = toStoredConnectSession(snap.id, snap.data()!);
    if (!session || !connectSessionIsAccessible(session, principal)) return null;
    return session;
  }

  async listAccessibleSessions(principal: MerchantPrincipal, externalOrderId: string): Promise<StoredConnectSession[]> {
    let query = this.firestore.collection('connectSessions').where('externalOrderId', '==', externalOrderId);
    query = principal.integrationId
      ? query.where('integrationId', '==', principal.integrationId)
      : query.where('organizationId', '==', principal.organizationId);
    const snap = await query.limit(25).get();
    return snap.docs
      .map((doc) => toStoredConnectSession(doc.id, doc.data()))
      .filter((session): session is StoredConnectSession => session !== null && connectSessionIsAccessible(session, principal));
  }

  async cancelAccessibleSession(
    sessionId: string,
    principal: MerchantPrincipal,
    decide: (session: StoredConnectSession | null) => ConnectSessionCancelDecision,
  ): Promise<StoredConnectSession> {
    const sessionRef = this.firestore.collection('connectSessions').doc(sessionId);
    return this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(sessionRef);
      const loaded = snap.exists ? toStoredConnectSession(snap.id, snap.data()!) : null;
      const accessible = loaded && connectSessionIsAccessible(loaded, principal) ? loaded : null;
      const decision = decide(accessible);
      if (decision.type === 'REPLAY') return decision.session;
      const outboxRef = this.firestore.collection('domainOutbox').doc(decision.event.id);
      const existingOutbox = await tx.get(outboxRef);
      tx.update(sessionRef, {
        status: 'CANCELLED',
        tokenHash: FieldValue.delete(),
        codeChallenge: FieldValue.delete(),
        cancelledAt: Timestamp.fromDate(decision.event.occurredAt),
        updatedAt: Timestamp.fromDate(decision.event.occurredAt),
      });
      if (!existingOutbox.exists) tx.create(outboxRef, storedOutboxEvent(decision.event));
      return decision.session;
    });
  }
}
