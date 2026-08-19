import { canonicalizeJson, sha256Hex } from '../../evidence-format';
import {
  aggregatePassport,
  countDisplayedUnattributedCommercialFacts,
  evaluatePassportEligibility,
  issuePassportIdentity,
  issuePassportSnapshotId,
  isPassportDisplayId,
  isPassportResourceId,
  PASSPORT_PDF_RENDERER_VERSION,
  type PackProofPassportExportV1,
  type PackProofPassportSnapshotV1,
  type PackProofPassportV1,
  type PassportAggregatorInput,
  type PassportArtifactInput,
  type PassportReviewQuery,
  type PassportTransactionInput,
} from '../../domain/v1/passport';
import { HUMAN_REVIEW_DISCLAIMER } from '../../package-seal-protocol';
import { ApplicationError } from './errors';
import type {
  AccessibleMerchantTransaction,
  StoredEvidenceRecord,
  StoredPassportSnapshot,
} from './merchant-evidence-ports';
import type { MerchantDeliveryDto, MerchantReturnPassportDto, MerchantShipmentDto, MerchantTimelineEventDto } from './merchant-evidence-types';

export function passportArtifactInput(record: StoredEvidenceRecord): PassportArtifactInput {
  const integrityFailed = record.clientHashMatched === false || record.clientSizeMatched === false || record.contentTypeMatched === false
    || record.assurance?.byteIntegrity.status === 'MISMATCH';
  const finalization = record.serverFinalized || record.serverVerified
    ? integrityFailed ? 'QUARANTINED' as const : 'FINALIZED' as const
    : record.sha256 ? 'UPLOADED' as const : 'RESERVED' as const;
  return {
    id: record.id,
    transactionId: record.transactionId,
    type: record.type,
    finalization,
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    sha256: record.sha256,
    manifestSha256: record.manifestSha256,
    evidenceBundleSha256: record.evidenceBundleSha256,
    captureSessionId: record.captureSessionId ?? null,
    evidenceSessionId: null,
    clientCreatedAt: record.clientCreatedAt ?? null,
    finalizedAt: record.finalizedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    scannedTrackingNumber: record.scannedTrackingNumber,
    shippingTracker: record.shippingTracker,
    carrierTrackingMatchStatus: record.carrierTrackingMatchStatus,
    acquisitionClass: record.acquisitionClass ?? null,
    appDeviceContextStatus: record.assurance?.appDeviceContext.status ?? null,
    returnPassportId: record.returnPassportId,
    clientHashMatched: record.clientHashMatched,
    bundleBindingProfile: record.bundleBindingProfile ?? null,
    manifestAuthentication: record.manifestAuthentication ?? null,
  };
}

export function passportTransactionInput(transaction: AccessibleMerchantTransaction): PassportTransactionInput {
  return {
    id: transaction.id,
    merchantReference: transaction.merchantReference,
    title: transaction.title,
    amount: transaction.amount,
    termsSaleType: transaction.terms?.saleType ?? null,
    commerceContextId: transaction.commerceContextId ?? null,
    sourcePlatform: transaction.sourcePlatform ?? null,
    sourceType: transaction.sourceType ?? null,
    sourceTrustLevel: transaction.sourceTrustLevel ?? (transaction.sourceType === 'PACKPROOF_BUTTON' ? 'PAGE_DECLARED' : null),
    externalOrderId: transaction.externalOrderId ?? null,
    externalSellerId: transaction.externalSellerId ?? null,
    declaredWeightGrams: transaction.declaredWeightGrams ?? null,
    sourceTrackingNumber: transaction.sourceTrackingNumber ?? null,
    createdAt: transaction.createdAt.toISOString(),
    updatedAt: transaction.updatedAt.toISOString(),
  };
}

export function passportNotReady(failures: Array<{ code: string; message: string }>): ApplicationError {
  return new ApplicationError(
    'FAILED_PRECONDITION',
    'PASSPORT_NOT_READY',
    'This transaction does not yet qualify for a PackProof Passport.',
    failures.map((failure) => ({ field: 'eligibility', code: failure.code, message: failure.message })),
  );
}

export function projectPassport(input: {
  transaction: AccessibleMerchantTransaction;
  artifacts: readonly StoredEvidenceRecord[];
  shipment: MerchantShipmentDto | null;
  delivery: MerchantDeliveryDto | null;
  returns: readonly MerchantReturnPassportDto[];
  timeline: readonly MerchantTimelineEventDto[];
  commerce: PassportAggregatorInput['commerce'];
  identity: { passportId: string; displayId: string; issuedAt: string };
  verificationBaseUrl: string;
  reviewQuery: PassportReviewQuery | null;
  now: string;
}): PackProofPassportV1 {
  return aggregatePassport({
    identity: { ...input.identity, verificationBaseUrl: input.verificationBaseUrl },
    transaction: passportTransactionInput(input.transaction),
    commerce: input.commerce,
    artifacts: input.artifacts.map(passportArtifactInput),
    shipment: input.shipment ? {
      carrier: input.shipment.carrier,
      trackingNumber: input.shipment.trackingNumber,
      packingEvidenceId: input.shipment.packingEvidenceId,
      sealEvidenceId: input.shipment.sealEvidenceId,
      shippedAt: input.shipment.shippedAt,
      createdAt: input.shipment.createdAt,
    } : null,
    delivery: input.delivery ? {
      carrier: input.delivery.carrier,
      trackingNumber: input.delivery.trackingNumber,
      arrivalEvidenceId: input.delivery.arrivalEvidenceId,
      receivedAt: input.delivery.receivedAt,
    } : null,
    returns: input.returns.map((item) => ({
      id: item.id,
      status: item.status,
      reason: item.reason,
      packingEvidenceId: item.packingEvidenceId,
      sealEvidenceId: item.sealEvidenceId,
      shippingTrackingNumber: item.shippingTrackingNumber,
      createdAt: item.createdAt,
    })),
    timeline: input.timeline.map((item) => ({
      id: item.id,
      type: item.type,
      summary: item.summary,
      occurredAt: item.occurredAt,
    })),
    reviewQuery: input.reviewQuery,
    humanReviewDisclaimer: HUMAN_REVIEW_DISCLAIMER,
    now: input.now,
  });
}

export function assertPassportEligible(
  transaction: AccessibleMerchantTransaction,
  artifacts: readonly StoredEvidenceRecord[],
  commerce: PassportAggregatorInput['commerce'] = null,
): void {
  const transactionInput = passportTransactionInput(transaction);
  const result = evaluatePassportEligibility({
    transactionExists: true,
    merchantReference: transaction.merchantReference,
    commerceContextId: transaction.commerceContextId,
    commerceTrustLevel: commerce?.trustLevel ?? null,
    sourceTrustLevel: transactionInput.sourceTrustLevel ?? null,
    externalOrderId: transaction.externalOrderId,
    artifacts: artifacts.map(passportArtifactInput),
    displayedUnattributedFacts: countDisplayedUnattributedCommercialFacts(transactionInput, commerce),
  });
  if (!result.ok) throw passportNotReady(result.failures);
}

export function boundOrIssuedIdentity(transaction: AccessibleMerchantTransaction, issuedAt: Date): { passportId: string; displayId: string; issuedAt: Date; bind: boolean } {
  if (transaction.passportId && transaction.passportDisplayId) {
    return {
      passportId: transaction.passportId,
      displayId: transaction.passportDisplayId,
      issuedAt: transaction.passportIssuedAt ?? issuedAt,
      bind: false,
    };
  }
  const issued = issuePassportIdentity(transaction.id);
  return { ...issued, issuedAt, bind: true };
}

export function snapshotDto(record: StoredPassportSnapshot): PackProofPassportSnapshotV1 {
  return {
    object: 'packproof_passport_snapshot',
    schemaVersion: 1,
    snapshotId: record.snapshotId,
    passportId: record.passportId,
    transactionId: record.transactionId,
    snapshotVersion: record.snapshotVersion,
    passport: record.passport,
    canonicalPayloadSha256: record.canonicalPayloadSha256,
    rendererVersion: record.rendererVersion,
    generatedAt: record.generatedAt.toISOString(),
  };
}

export function exportDto(record: StoredPassportSnapshot, urls: { url: string | null; expiresAt: string | null }): PackProofPassportExportV1 {
  if (!record.pdfSha256) throw new ApplicationError('FAILED_PRECONDITION', 'PASSPORT_EXPORT_NOT_READY', 'This snapshot does not have a presentation export yet.');
  return {
    object: 'packproof_passport_export',
    schemaVersion: 1,
    snapshotId: record.snapshotId,
    format: 'PDF',
    presentationOnly: true,
    downloadUrl: urls.url,
    downloadUrlExpiresAt: urls.expiresAt,
    fileSha256: record.pdfSha256,
    rendererVersion: record.rendererVersion,
  };
}

export function canonicalPassportDigest(passport: PackProofPassportV1): string {
  return sha256Hex(canonicalizeJson(passport));
}

export function nextSnapshot(passport: PackProofPassportV1, version: number, generatedAt: Date): StoredPassportSnapshot {
  return {
    snapshotId: issuePassportSnapshotId(passport.identity.passportId, version),
    passportId: passport.identity.passportId,
    transactionId: passport.identity.transactionId,
    snapshotVersion: version,
    passport,
    canonicalPayloadSha256: canonicalPassportDigest(passport),
    rendererVersion: PASSPORT_PDF_RENDERER_VERSION,
    generatedAt,
    pdfStoragePath: null,
    pdfSha256: null,
  };
}

export function looksLikePassportIdentity(value: string): boolean {
  return isPassportResourceId(value) || isPassportDisplayId(value);
}
