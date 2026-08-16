import { HUMAN_REVIEW_DISCLAIMER, evidenceReadyForWorkflow, shipmentEvidenceDecision, SHIPMENT_PRECONDITION_MESSAGES } from '../../package-seal-protocol';
import type { AssuranceAssessment } from '../../domain/v1/evidence';
import { ApplicationError } from './errors';
import type { ApplicationEvent } from './events';
import type { ApiRuntimeConfig, IdempotencyStore, MerchantAuditWriter } from './merchant-ports';
import type {
  AccessibleMerchantTransaction,
  AssociateShipmentRecord,
  EvidenceReportGenerator,
  EvidenceReportUrlSigner,
  MerchantEvidenceRepository,
  StoredEvidenceRecord,
  StoredReportRecord,
} from './merchant-evidence-ports';
import type {
  AssociateMerchantShipmentInput,
  MerchantEvidenceArtifactDto,
  MerchantEvidenceReportDto,
  MerchantEvidenceStatus,
  MerchantReturnPassportDto,
  MerchantReviewPackageDto,
  MerchantShipmentDto,
  MerchantTimelineEventDto,
  ProtocolPresenceState,
  ReviewDocumentationEntry,
  ReviewLimitations,
} from './merchant-evidence-types';
import { canonicalize, MerchantAuthorizationPolicy, sha256 } from './merchant-transaction-service';
import type { MerchantPrincipal } from './merchant-types';

const REPORT_URL_TTL_MS = 15 * 60 * 1000;

const LIMITATIONS: ReviewLimitations = {
  physicalCorrespondence: 'NOT_AVAILABLE',
  businessLegalRelevance: 'REVIEW_REQUIRED',
  doesNotAuthenticateItem: true,
  doesNotProveCustody: true,
  doesNotDecideFraudOrFault: true,
  doesNotGuaranteeDisputeOutcome: true,
  dossierIsPresentationOnly: true,
  manifestAuthenticationScope: 'PACKPROOF_SERVICE_ONLY',
  humanReviewDisclaimer: HUMAN_REVIEW_DISCLAIMER,
};

function notFound(code: string, message: string): ApplicationError {
  return new ApplicationError('NOT_FOUND', code, message);
}

function publicAssurance(record: StoredEvidenceRecord): AssuranceAssessment {
  const stored = record.assurance;
  const byteMismatch = record.clientHashMatched === false || record.clientSizeMatched === false || record.contentTypeMatched === false
    || stored?.byteIntegrity.status === 'MISMATCH';
  return {
    acquisitionQuality: stored?.acquisitionQuality ?? { status: 'NOT_EVALUATED', reasonCodes: ['NO_CALIBRATED_QUALITY_GATE'] },
    appDeviceContext: stored?.appDeviceContext ?? { status: 'NOT_RECORDED', reasonCodes: [] },
    byteIntegrity: stored?.byteIntegrity ?? {
      status: byteMismatch ? 'MISMATCH' : record.clientHashMatched === true && record.clientSizeMatched === true ? 'MATCHED' : 'SERVER_HASH_ONLY',
      reasonCodes: byteMismatch ? ['INTEGRITY_OR_MEDIA_TYPE_MISMATCH'] : [],
    },
    physicalCorrespondence: { status: 'NOT_AVAILABLE', reasonCodes: ['NO_VALIDATED_PHYSICAL_MATCHER_ENABLED'] },
    carrierContext: stored?.carrierContext ?? {
      status: record.carrierTrackingMatchStatus ?? 'NOT_EVALUATED',
      reasonCodes: record.carrierTrackingMatchStatus === 'MISMATCH' ? ['OBSERVED_TRACKING_DOES_NOT_MATCH_EXPECTED_CONTEXT'] : [],
    },
    businessLegalRelevance: { status: 'REVIEW_REQUIRED', reasonCodes: ['EXTERNAL_POLICY_AND_HUMAN_INTERPRETATION_REQUIRED'] },
  };
}

function evidenceStatus(record: StoredEvidenceRecord): MerchantEvidenceStatus {
  const integrityFailed = record.clientHashMatched === false || record.clientSizeMatched === false || record.contentTypeMatched === false
    || record.assurance?.byteIntegrity.status === 'MISMATCH';
  if (record.serverFinalized || record.serverVerified) return integrityFailed ? 'QUARANTINED' : 'FINALIZED';
  if (record.sha256) return 'UPLOADED';
  return 'RESERVED';
}

function roleOf(value: string | null): MerchantEvidenceArtifactDto['role'] {
  if (value === 'SELLER' || value === 'BUYER' || value === 'RECEIVER' || value === 'RETURN_SENDER' || value === 'RETURN_RECIPIENT' || value === 'WITNESS') {
    return value;
  }
  return null;
}

export function toMerchantEvidenceArtifactDto(record: StoredEvidenceRecord): MerchantEvidenceArtifactDto {
  const status = evidenceStatus(record);
  const finalized = status === 'FINALIZED' || status === 'QUARANTINED';
  return {
    id: record.id,
    object: 'evidence_artifact',
    schemaVersion: 1,
    transactionId: record.transactionId,
    type: record.type,
    status,
    role: roleOf(record.role),
    contentType: record.contentType,
    sizeBytes: record.sizeBytes,
    sha256: record.sha256,
    manifestSha256: record.manifestSha256,
    evidenceBundleSha256: record.evidenceBundleSha256,
    manifestAuthenticationScope: record.manifestAuthenticationScope === 'PACKPROOF_SERVICE_ONLY' ? 'PACKPROOF_SERVICE_ONLY' : finalized ? 'PACKPROOF_SERVICE_ONLY' : null,
    workflowReady: evidenceReadyForWorkflow({
      serverFinalized: record.serverFinalized,
      serverVerified: record.serverVerified,
      clientHashMatched: record.clientHashMatched,
      clientSizeMatched: record.clientSizeMatched,
      contentTypeMatched: record.contentTypeMatched,
      assurance: record.assurance ?? undefined,
    }),
    assurance: finalized ? publicAssurance(record) : record.assurance ? publicAssurance(record) : null,
    carrierTrackingMatchStatus: record.carrierTrackingMatchStatus,
    finalizedAt: record.finalizedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function presence(artifacts: readonly MerchantEvidenceArtifactDto[], types: readonly string[]): ProtocolPresenceState {
  const matches = artifacts.filter((item) => types.includes(item.type));
  if (!matches.length) return 'ABSENT';
  return matches.some((item) => item.workflowReady) ? 'PRESENT' : 'PRESENT_WITH_LIMITATIONS';
}

function documentation(artifacts: readonly MerchantEvidenceArtifactDto[], transaction: AccessibleMerchantTransaction, returns: readonly MerchantReturnPassportDto[], timeline: readonly MerchantTimelineEventDto[]): ReviewDocumentationEntry[] {
  const packing = artifacts.filter((item) => ['PACKING_VIDEO', 'SHIPPING_LABEL', 'RETURN_PACKING_VIDEO', 'RETURN_SHIPPING_LABEL'].includes(item.type));
  const arrival = artifacts.filter((item) => ['DELIVERY_PHOTO', 'UNBOXING_VIDEO', 'RETURN_UNBOXING_VIDEO'].includes(item.type));
  const returning = artifacts.filter((item) => item.type.startsWith('RETURN_') || Boolean(returns.length));
  return [
    { category: 'TERMS_AND_CONDITIONS', present: transaction.terms !== null, artifactIds: [] },
    { category: 'ITEM_AND_ORDER_DESCRIPTION', present: Boolean(transaction.title), artifactIds: [] },
    { category: 'PACKING_AND_SEAL_REFERENCE', present: packing.length > 0, artifactIds: packing.map((item) => item.id) },
    { category: 'ARRIVAL_OR_DELIVERY_OBSERVATION', present: arrival.length > 0, artifactIds: arrival.map((item) => item.id) },
    { category: 'RETURN_DOCUMENTATION', present: returning.length > 0 || returns.length > 0, artifactIds: artifacts.filter((item) => item.type.startsWith('RETURN_')).map((item) => item.id) },
    { category: 'HASHED_EVIDENCE_INVENTORY', present: artifacts.length > 0, artifactIds: artifacts.map((item) => item.id) },
    { category: 'AUDIT_TIMELINE', present: timeline.length > 0, artifactIds: [] },
  ];
}

function reportSummary(record: StoredReportRecord): NonNullable<MerchantReviewPackageDto['latestReport']> {
  return {
    id: record.id,
    object: 'evidence_report',
    schemaVersion: 1,
    transactionId: record.transactionId,
    status: 'AVAILABLE',
    reportSha256: record.sha256,
    evidenceCount: record.evidenceCount,
    presentationOnly: true,
    generatedAt: record.createdAt.toISOString(),
  };
}

function reportDto(record: StoredReportRecord, download: { url: string; expiresAt: Date } | null): MerchantEvidenceReportDto {
  return {
    id: record.id,
    object: 'evidence_report',
    schemaVersion: 1,
    transactionId: record.transactionId,
    status: 'AVAILABLE',
    reportSha256: record.sha256,
    evidenceCount: record.evidenceCount,
    presentationOnly: true,
    generatedAt: record.createdAt.toISOString(),
    downloadUrl: download?.url ?? null,
    downloadUrlExpiresAt: download?.expiresAt.toISOString() ?? null,
  };
}

function normalizeTracking(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export class MerchantEvidenceApplicationService {
  constructor(
    private readonly repository: MerchantEvidenceRepository,
    private readonly idempotency: IdempotencyStore,
    private readonly audit: MerchantAuditWriter,
    private readonly authorization: MerchantAuthorizationPolicy,
    private readonly reports: EvidenceReportGenerator,
    private readonly urls: EvidenceReportUrlSigner,
    private readonly config: ApiRuntimeConfig,
    private readonly now: () => Date = () => new Date(),
  ) {}

  private async requireAccessible(principal: MerchantPrincipal, transactionId: string): Promise<AccessibleMerchantTransaction> {
    this.authorization.requireEnvironment(principal, this.config.environment);
    const transaction = await this.repository.findAccessibleTransaction(transactionId, principal);
    if (!transaction) throw notFound('TRANSACTION_NOT_FOUND', 'The requested transaction was not found.');
    return transaction;
  }

  async listEvidence(principal: MerchantPrincipal, transactionId: string): Promise<MerchantEvidenceArtifactDto[]> {
    this.authorization.requireScope(principal, 'evidence:read');
    await this.requireAccessible(principal, transactionId);
    const records = await this.repository.listEvidence(transactionId);
    return records.map(toMerchantEvidenceArtifactDto);
  }

  async getEvidence(principal: MerchantPrincipal, transactionId: string, artifactId: string): Promise<MerchantEvidenceArtifactDto> {
    this.authorization.requireScope(principal, 'evidence:read');
    await this.requireAccessible(principal, transactionId);
    const record = await this.repository.findEvidence(transactionId, artifactId);
    if (!record) throw notFound('EVIDENCE_NOT_FOUND', 'The requested evidence artifact was not found.');
    return toMerchantEvidenceArtifactDto(record);
  }

  async getTimeline(principal: MerchantPrincipal, transactionId: string): Promise<MerchantTimelineEventDto[]> {
    this.authorization.requireScope(principal, 'transactions:read');
    await this.requireAccessible(principal, transactionId);
    return this.repository.listTimeline(transactionId);
  }

  async listReturns(principal: MerchantPrincipal, transactionId: string): Promise<MerchantReturnPassportDto[]> {
    this.authorization.requireScope(principal, 'transactions:read');
    await this.requireAccessible(principal, transactionId);
    return this.repository.listReturns(transactionId);
  }

  async getReturn(principal: MerchantPrincipal, transactionId: string, returnPassportId: string): Promise<MerchantReturnPassportDto> {
    this.authorization.requireScope(principal, 'transactions:read');
    await this.requireAccessible(principal, transactionId);
    const record = await this.repository.findReturn(transactionId, returnPassportId);
    if (!record) throw notFound('RETURN_PASSPORT_NOT_FOUND', 'The requested return passport was not found.');
    return record;
  }

  async getShipment(principal: MerchantPrincipal, transactionId: string): Promise<MerchantShipmentDto> {
    this.authorization.requireScope(principal, 'shipments:read');
    const transaction = await this.requireAccessible(principal, transactionId);
    if (!transaction.shipment) throw notFound('SHIPMENT_NOT_FOUND', 'No shipment is associated with this transaction.');
    return transaction.shipment;
  }

  async getReviewPackage(principal: MerchantPrincipal, transactionId: string): Promise<MerchantReviewPackageDto> {
    this.authorization.requireScope(principal, 'evidence:read');
    const transaction = await this.requireAccessible(principal, transactionId);
    const [records, timeline, returns, reports] = await Promise.all([
      this.repository.listEvidence(transactionId),
      this.repository.listTimeline(transactionId),
      this.repository.listReturns(transactionId),
      this.repository.listReports(transactionId),
    ]);
    const evidence = records.map(toMerchantEvidenceArtifactDto);
    const latest = reports.at(-1) ?? null;
    return {
      id: `review_${sha256(transactionId).slice(0, 40)}`,
      object: 'review_package',
      schemaVersion: 1,
      transactionId,
      title: transaction.title,
      merchantReference: transaction.merchantReference,
      status: transaction.status,
      amount: transaction.amount,
      terms: transaction.terms,
      protocolCompleteness: {
        sellerPackingVideo: presence(evidence.filter((item) => !item.type.startsWith('RETURN_')), ['PACKING_VIDEO']),
        sellerSealReference: presence(evidence.filter((item) => !item.type.startsWith('RETURN_')), ['SHIPPING_LABEL']),
        buyerArrivalObservation: presence(evidence, ['DELIVERY_PHOTO']),
        buyerUnboxing: presence(evidence, ['UNBOXING_VIDEO']),
        returnPackingVideo: presence(evidence, ['RETURN_PACKING_VIDEO']),
        returnSealReference: presence(evidence, ['RETURN_SHIPPING_LABEL']),
      },
      documentationCategories: documentation(evidence, transaction, returns, timeline),
      evidence,
      shipment: transaction.shipment,
      returns,
      latestReport: latest ? reportSummary(latest) : null,
      timeline,
      limitations: LIMITATIONS,
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
    };
  }

  async createReport(principal: MerchantPrincipal, transactionId: string, idempotencyKey: string, requestId: string): Promise<{ report: MerchantEvidenceReportDto; replayed: boolean }> {
    this.authorization.requireScope(principal, 'evidence:read');
    await this.requireAccessible(principal, transactionId);
    const execution = await this.idempotency.execute(
      {
        principalId: `${principal.organizationId}:${principal.apiClientId}`,
        operation: 'POST /v1/transactions/{transactionId}/reports',
        key: idempotencyKey,
        requestFingerprint: sha256(canonicalize({ transactionId })),
        leaseSeconds: 900,
      },
      async (operationId) => {
        const generated = await this.reports.generate(transactionId, `merchant:${principal.apiClientId}`, { reportId: operationId });
        const createdAt = this.now();
        const stored: StoredReportRecord = {
          id: generated.reportId,
          transactionId,
          sha256: generated.sha256,
          storagePath: generated.storagePath,
          evidenceCount: generated.evidenceCount,
          createdAt,
        };
        const expiresAt = new Date(createdAt.getTime() + REPORT_URL_TTL_MS);
        const downloadUrl = await this.urls.sign(generated.storagePath, expiresAt);
        await this.audit.append({
          eventId: `report_created_${generated.reportId}`,
          organizationId: principal.organizationId,
          type: 'EVIDENCE_REPORT_AVAILABLE',
          actor: principal,
          resourceType: 'EVIDENCE_REPORT',
          resourceId: generated.reportId,
          requestId,
          metadata: { apiVersion: 'v1', transactionId, reportSha256: generated.sha256, presentationOnly: true },
        });
        return { report: reportDto(stored, { url: downloadUrl, expiresAt }), storagePath: generated.storagePath };
      },
    );
    if (execution.replayed) {
      const expiresAt = new Date(this.now().getTime() + REPORT_URL_TTL_MS);
      const downloadUrl = await this.urls.sign(execution.value.storagePath, expiresAt);
      return { report: { ...execution.value.report, downloadUrl, downloadUrlExpiresAt: expiresAt.toISOString() }, replayed: true };
    }
    return { report: execution.value.report, replayed: false };
  }

  async getReport(principal: MerchantPrincipal, transactionId: string, reportId: string): Promise<MerchantEvidenceReportDto> {
    this.authorization.requireScope(principal, 'evidence:read');
    await this.requireAccessible(principal, transactionId);
    const record = await this.repository.findReport(transactionId, reportId);
    if (!record) throw notFound('EVIDENCE_REPORT_NOT_FOUND', 'The requested evidence report was not found.');
    const expiresAt = new Date(this.now().getTime() + REPORT_URL_TTL_MS);
    const downloadUrl = await this.urls.sign(record.storagePath, expiresAt);
    return reportDto(record, { url: downloadUrl, expiresAt });
  }

  async associateShipment(
    principal: MerchantPrincipal,
    transactionId: string,
    input: AssociateMerchantShipmentInput,
    idempotencyKey: string,
    requestId: string,
  ): Promise<{ shipment: MerchantShipmentDto; replayed: boolean }> {
    this.authorization.requireScope(principal, 'shipments:write');
    const transaction = await this.requireAccessible(principal, transactionId);
    const execution = await this.idempotency.execute(
      {
        principalId: `${principal.organizationId}:${principal.apiClientId}`,
        operation: 'POST /v1/transactions/{transactionId}/shipment',
        key: idempotencyKey,
        requestFingerprint: sha256(canonicalize(input)),
      },
      async () => {
        const records = await this.repository.listEvidence(transactionId);
        const artifacts = records.map(toMerchantEvidenceArtifactDto);
        const packing = artifacts.find((item) => item.type === 'PACKING_VIDEO' && item.workflowReady);
        const seal = artifacts.find((item) => item.type === 'SHIPPING_LABEL' && item.workflowReady);
        const decision = shipmentEvidenceDecision({ packingReady: Boolean(packing), sealReady: Boolean(seal) });
        if (!decision.ok || !packing || !seal) {
          throw new ApplicationError(
            'FAILED_PRECONDITION',
            decision.ok ? 'SEAL_REFERENCE_REQUIRED' : `${decision.missing}_REQUIRED`,
            SHIPMENT_PRECONDITION_MESSAGES[decision.ok ? 'SEAL_REFERENCE' : decision.missing],
          );
        }
        const packingRecord = records.find((item) => item.id === packing.id)!;
        const submitted = normalizeTracking(input.trackingNumber);
        const scanned = packingRecord.scannedTrackingNumber
          ? normalizeTracking(packingRecord.scannedTrackingNumber)
          : records.find((item) => item.id === seal.id)?.scannedTrackingNumber
            ? normalizeTracking(records.find((item) => item.id === seal.id)!.scannedTrackingNumber!)
            : '';
        const labelEvidenceMatchStatus: AssociateShipmentRecord['labelEvidenceMatchStatus'] = !scanned
          ? 'NOT_SCANNED'
          : scanned === submitted
            ? 'MATCHED'
            : 'MISMATCH';
        const occurredAt = this.now();
        const event: ApplicationEvent = {
          id: `evt_${sha256(`shipment-associated\n${transactionId}\n${idempotencyKey}`).slice(0, 40)}`,
          schemaVersion: 1,
          type: 'SHIPMENT_ASSOCIATED',
          organizationId: principal.organizationId,
          actor: { type: 'MERCHANT_API_CLIENT', id: principal.apiClientId },
          resourceType: 'shipment',
          resourceId: transactionId,
          requestId,
          occurredAt,
          data: {
            origin: 'MERCHANT_API',
            carrier: input.carrier,
            packingEvidenceId: packing.id,
            sealEvidenceId: seal.id,
            labelEvidenceMatchStatus,
          },
        };
        const shipment = await this.repository.associateShipment(transactionId, {
          carrier: input.carrier,
          trackingNumber: input.trackingNumber,
          packingEvidenceId: packing.id,
          sealEvidenceId: seal.id,
          scannedTrackingNumber: scanned || null,
          labelEvidenceMatchStatus,
          markConsumerShipped: ['TERMS_LOCKED', 'PACKED'].includes(transaction.consumerStatus),
          occurredAt,
        }, event);
        await this.audit.append({
          eventId: `shipment_associated_${transactionId}_${sha256(idempotencyKey).slice(0, 16)}`,
          organizationId: principal.organizationId,
          type: 'SHIPMENT_ASSOCIATED',
          actor: principal,
          resourceType: 'SHIPMENT',
          resourceId: shipment.id,
          requestId,
          metadata: { apiVersion: 'v1', transactionId, labelEvidenceMatchStatus },
        });
        return { shipment };
      },
    );
    return { shipment: execution.value.shipment, replayed: execution.replayed };
  }
}
