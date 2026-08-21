import { FieldValue, Timestamp, type DocumentData, type Firestore } from 'firebase-admin/firestore';
import type { ApplicationEvent } from '../../../application/v1/events';
import { ApplicationError } from '../../../application/v1/errors';
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
  PassportIdentityBinding,
  StoredConnectSession,
  StoredEvidenceRecord,
  StoredPassportSnapshot,
  StoredReportRecord,
} from '../../../application/v1/merchant-evidence-ports';
import type { PassportCommerceInput } from '../../../domain/v1/passport';
import {
  assertionSourceForIntakeSource,
  commerceIntakeSourceTypes,
  parseCommerceTrustLevel,
  type CommerceIntakeSourceType,
} from '../../../domain/v1/commerce';
import type { MerchantDeliveryDto, MerchantReturnPassportDto, MerchantShipmentDto, MerchantTimelineEventDto } from '../../../application/v1/merchant-evidence-types';
import type { MerchantPrincipal } from '../../../application/v1/merchant-types';
import type { PortalWorkspaceRecord, PortalWorkspaceRepository } from '../../../application/v1/portal-workspace-service';
import { sha256 } from '../../../application/v1/merchant-transaction-service';
import { projectProofReady } from '../../../application/v1/passport-projection';
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

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0) : [];
}

function identifiers(value: unknown): Array<{ label: string; value: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return [];
    const record = entry as { label?: unknown; value?: unknown };
    if (typeof record.label !== 'string' || typeof record.value !== 'string') return [];
    return [{ label: record.label, value: record.value }];
  });
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
  const declaredWeight = source?.declaredWeightGrams;
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
    confirmedBy: stringArray(data.confirmedBy),
    handoffConfirmedBy: stringArray(data.handoffConfirmedBy),
    completedBy: stringArray(data.completedBy),
    identifiers: identifiers(data.identifiers),
    conditionNotes: typeof data.conditionNotes === 'string' ? data.conditionNotes : '',
    lockedAt: data.lockedAt ? dateValue(data.lockedAt, createdAt) : null,
    shipment: toShipment(id, data.shipping as DocumentData | undefined, createdAt, updatedAt),
    delivery: toDelivery(id, data.delivery as DocumentData | undefined, createdAt, updatedAt),
    commerceContextId: optionalString(source?.commerceContextId) ?? optionalString(data.commerceContextId),
    sourceType: optionalString(source?.type),
    sourcePlatform: optionalString(source?.platform),
    externalOrderId: optionalString(source?.externalOrderId),
    externalSellerId: optionalString(source?.externalSellerId),
    declaredWeightGrams: Number.isFinite(declaredWeight) ? Number(declaredWeight) : null,
    sourceTrackingNumber: optionalString(source?.trackingNumber),
    sourceTrustLevel: parseCommerceTrustLevel(source?.trustLevel)
      ?? (optionalString(source?.type) === 'PACKPROOF_BUTTON' ? 'PAGE_DECLARED' : null),
    passportId: optionalString(data.passportId),
    passportDisplayId: optionalString(data.passportDisplayId),
    passportIssuedAt: data.passportIssuedAt ? dateValue(data.passportIssuedAt, createdAt) : null,
    createdAt,
    updatedAt,
  };
}

function toPassportSnapshot(id: string, data: DocumentData): StoredPassportSnapshot | null {
  const passport = data.passport && typeof data.passport === 'object' ? data.passport as StoredPassportSnapshot['passport'] : null;
  const digest = optionalString(data.canonicalPayloadSha256);
  if (!passport || !digest) return null;
  return {
    snapshotId: optionalString(data.snapshotId) ?? id,
    passportId: optionalString(data.passportId) ?? '',
    transactionId: optionalString(data.transactionId) ?? '',
    snapshotVersion: optionalInteger(data.snapshotVersion) ?? 1,
    passport,
    canonicalPayloadSha256: digest,
    rendererVersion: optionalString(data.rendererVersion) ?? 'packproof-passport-pdf@1.0.0',
    generatedAt: dateValue(data.generatedAt, new Date(0)),
    pdfStoragePath: optionalString(data.pdfStoragePath),
    pdfSha256: optionalString(data.pdfSha256),
  };
}

function toCommerce(id: string, data: DocumentData): PassportCommerceInput {
  const source = data.source && typeof data.source === 'object' ? data.source as Record<string, unknown> : null;
  const item = data.item && typeof data.item === 'object' ? data.item as Record<string, unknown> : null;
  const amount = item?.amount && typeof item.amount === 'object' ? item.amount as { currency?: unknown; minorUnits?: unknown } : null;
  const options = Array.isArray(item?.selectedOptions)
    ? item.selectedOptions.filter((entry): entry is { name?: unknown; value?: unknown } => Boolean(entry && typeof entry === 'object'))
    : [];
  const variant = options
    .map((entry) => `${typeof entry.name === 'string' ? entry.name : ''}: ${typeof entry.value === 'string' ? entry.value : ''}`.trim())
    .filter(Boolean)
    .join('; ') || null;
  const trust = parseCommerceTrustLevel(source?.trustLevel);
  const intakeSourceType = typeof source?.intakeSourceType === 'string' && (commerceIntakeSourceTypes as readonly string[]).includes(source.intakeSourceType)
    ? source.intakeSourceType as CommerceIntakeSourceType
    : null;
  return {
    id,
    platform: optionalString(source?.platformIdentifier) ?? optionalString(source?.platform),
    trustLevel: trust,
    assertingSource: trust === 'USER_PROVIDED_COMMERCE_ARTIFACT'
      ? (intakeSourceType ? assertionSourceForIntakeSource(intakeSourceType) : 'EXTERNAL_ADAPTER')
      : trust === 'PAGE_DECLARED' ? 'PAGE_DECLARED' : trust === 'PLATFORM_API_ATTESTED' ? 'PLATFORM_API' : 'MERCHANT_API',
    externalOrderId: optionalString(source?.externalOrderId),
    externalSellerId: optionalString(data.externalSellerId),
    capturedAt: source?.capturedAt ? dateValue(source.capturedAt, new Date(0)).toISOString() : null,
    canonicalPayloadSha256: optionalString(data.canonicalPayloadSha256),
    title: optionalString(item?.title),
    sku: optionalString(item?.sku),
    gtin: optionalString(item?.gtin),
    upc: optionalString(item?.upc),
    serialNumber: optionalString(item?.serialNumber),
    quantity: item && Number.isSafeInteger(item.quantity) ? item.quantity as number : null,
    amount: amount && typeof amount.currency === 'string' && Number.isSafeInteger(amount.minorUnits)
      ? { currency: amount.currency, minorUnits: amount.minorUnits as number }
      : null,
    variant,
    listingReference: optionalString(source?.externalListingId) ?? optionalString(source?.productUrl),
    merchantItemId: optionalString(source?.externalProductId) ?? optionalString(source?.externalLineItemId),
    declaredCondition: null,
    declaredWeightGrams: Number.isFinite(data.declaredWeightGrams) ? Number(data.declaredWeightGrams) : null,
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
    captureSessionId: optionalString(data.captureSessionId),
    clientCreatedAt: optionalString(data.clientCreatedAt),
    acquisitionClass: optionalString(data.acquisitionClass),
    bundleBindingProfile: optionalString(data.bundleBindingProfile),
    manifestAuthentication: authentication ? {
      type: optionalString(authentication.type),
      algorithm: optionalString(authentication.algorithm),
      keyId: optionalString(authentication.keyId),
      verificationScope: optionalString(authentication.verificationScope),
    } : null,
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

  async loadTransaction(transactionId: string): Promise<AccessibleMerchantTransaction | null> {
    const snap = await this.firestore.collection('transactions').doc(transactionId).get();
    if (!snap.exists) return null;
    return toAccessible(snap.id, snap.data()!);
  }

  async refreshProofReady(transactionId: string): Promise<boolean> {
    const transaction = await this.loadTransaction(transactionId);
    if (!transaction) return false;
    const artifacts = await this.listEvidence(transactionId);
    const commerce = transaction.commerceContextId
      ? await this.findCommerceContext(transaction.commerceContextId)
      : null;
    const proofReady = projectProofReady(transaction, artifacts, commerce);
    await this.firestore.collection('transactions').doc(transactionId).update({ proofReady });
    return proofReady;
  }

  async listTransactionsForParticipant(actorId: string, limit: number): Promise<AccessibleMerchantTransaction[]> {
    const snap = await this.firestore.collection('transactions')
      .where('participantIds', 'array-contains', actorId)
      .orderBy('updatedAt', 'desc')
      .limit(limit)
      .get();
    return snap.docs.map((doc) => toAccessible(doc.id, doc.data()));
  }

  async findTransactionForParticipant(transactionId: string, actorId: string): Promise<AccessibleMerchantTransaction | null> {
    const transaction = await this.loadTransaction(transactionId);
    if (!transaction || !transaction.participantIds.includes(actorId)) return null;
    return transaction;
  }

  async loadTransactionByPassportIdentity(passportIdentity: string): Promise<AccessibleMerchantTransaction | null> {
    const field = passportIdentity.startsWith('ppt_') ? 'passportId' : 'passportDisplayId';
    const value = field === 'passportDisplayId' ? passportIdentity.toUpperCase() : passportIdentity;
    const snap = await this.firestore.collection('transactions').where(field, '==', value).limit(1).get();
    if (snap.empty) return null;
    return toAccessible(snap.docs[0].id, snap.docs[0].data());
  }

  async findAccessibleTransactionByPassportIdentity(passportIdentity: string, principal: MerchantPrincipal): Promise<AccessibleMerchantTransaction | null> {
    const field = passportIdentity.startsWith('ppt_') ? 'passportId' : 'passportDisplayId';
    const value = field === 'passportDisplayId' ? passportIdentity.toUpperCase() : passportIdentity;
    const snap = await this.firestore.collection('transactions').where(field, '==', value).limit(1).get();
    if (snap.empty) return null;
    const transaction = toAccessible(snap.docs[0].id, snap.docs[0].data());
    return principalCanAccess(transaction, principal) ? transaction : null;
  }

  async bindPassportIdentity(transactionId: string, identity: PassportIdentityBinding): Promise<PassportIdentityBinding> {
    const ref = this.firestore.collection('transactions').doc(transactionId);
    return this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('Transaction disappeared during Passport issuance.');
      const data = snap.data()!;
      const existingId = optionalString(data.passportId);
      const existingDisplay = optionalString(data.passportDisplayId);
      if (existingId && existingDisplay) {
        tx.update(ref, { proofReady: true });
        return {
          passportId: existingId,
          displayId: existingDisplay,
          issuedAt: data.passportIssuedAt ? dateValue(data.passportIssuedAt, identity.issuedAt) : identity.issuedAt,
        };
      }
      tx.update(ref, {
        passportId: identity.passportId,
        passportDisplayId: identity.displayId,
        passportIssuedAt: Timestamp.fromDate(identity.issuedAt),
        proofReady: true,
      });
      return identity;
    });
  }

  async findCommerceContext(commerceContextId: string): Promise<PassportCommerceInput | null> {
    const snap = await this.firestore.collection('commerceContexts').doc(commerceContextId).get();
    if (!snap.exists) return null;
    return toCommerce(snap.id, snap.data()!);
  }

  async listPassportSnapshots(transactionId: string): Promise<StoredPassportSnapshot[]> {
    const snap = await this.firestore.collection('transactions').doc(transactionId).collection('passportSnapshots').orderBy('snapshotVersion', 'asc').get();
    return snap.docs.map((doc) => toPassportSnapshot(doc.id, doc.data())).filter((item): item is StoredPassportSnapshot => item !== null);
  }

  async findPassportSnapshot(transactionId: string, snapshotId: string): Promise<StoredPassportSnapshot | null> {
    const snap = await this.firestore.collection('transactions').doc(transactionId).collection('passportSnapshots').doc(snapshotId).get();
    if (!snap.exists) return null;
    return toPassportSnapshot(snap.id, snap.data()!);
  }

  async createPassportSnapshot(
    transactionId: string,
    build: (version: number) => StoredPassportSnapshot,
  ): Promise<StoredPassportSnapshot> {
    const txnRef = this.firestore.collection('transactions').doc(transactionId);
    const snapshots = txnRef.collection('passportSnapshots');
    return this.firestore.runTransaction(async (tx) => {
      const snap = await tx.get(txnRef);
      if (!snap.exists) {
        throw new ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'The requested transaction was not found.');
      }
      const latest = await tx.get(snapshots.orderBy('snapshotVersion', 'desc').limit(1));
      const lastVersion = latest.empty ? 0 : (optionalInteger(latest.docs[0].data().snapshotVersion) ?? 0);
      const counter = optionalInteger(snap.data()!.passportSnapshotVersion) ?? 0;
      const version = Math.max(lastVersion, counter) + 1;
      const record = build(version);
      tx.update(txnRef, { passportSnapshotVersion: version });
      tx.create(snapshots.doc(record.snapshotId), {
        id: record.snapshotId,
        object: 'packproof_passport_snapshot',
        schemaVersion: 1,
        snapshotId: record.snapshotId,
        passportId: record.passportId,
        transactionId: record.transactionId,
        snapshotVersion: record.snapshotVersion,
        passport: record.passport,
        canonicalPayloadSha256: record.canonicalPayloadSha256,
        rendererVersion: record.rendererVersion,
        generatedAt: Timestamp.fromDate(record.generatedAt),
        pdfStoragePath: record.pdfStoragePath,
        pdfSha256: record.pdfSha256,
        createdAt: Timestamp.fromDate(record.generatedAt),
      });
      return record;
    });
  }

  async savePassportExport(transactionId: string, snapshotId: string, record: { storagePath: string; sha256: string }): Promise<void> {
    await this.firestore.collection('transactions').doc(transactionId).collection('passportSnapshots').doc(snapshotId).update({
      pdfStoragePath: record.storagePath,
      pdfSha256: record.sha256,
    });
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

export class FirestorePortalWorkspaceRepository implements PortalWorkspaceRepository {
  constructor(private readonly evidence: FirestoreMerchantEvidenceRepository) {}

  listForParticipant(actorId: string, limit: number): Promise<PortalWorkspaceRecord[]> {
    return this.evidence.listTransactionsForParticipant(actorId, limit);
  }

  findForParticipant(transactionId: string, actorId: string): Promise<PortalWorkspaceRecord | null> {
    return this.evidence.findTransactionForParticipant(transactionId, actorId);
  }

  listEvidence(transactionId: string) {
    return this.evidence.listEvidence(transactionId);
  }

  listTimeline(transactionId: string) {
    return this.evidence.listTimeline(transactionId);
  }

  listReturns(transactionId: string) {
    return this.evidence.listReturns(transactionId);
  }

  findCommerceContext(commerceContextId: string) {
    return this.evidence.findCommerceContext(commerceContextId);
  }

  bindPassportIdentity(transactionId: string, identity: PassportIdentityBinding) {
    return this.evidence.bindPassportIdentity(transactionId, identity);
  }
}
