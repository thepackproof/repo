import { ApplicationError } from './errors';
import type { ApplicationEvent } from './events';
import type {
  AccessibleMerchantTransaction,
  PassportIdentityBinding,
  StoredEvidenceRecord,
} from './merchant-evidence-ports';
import type { MerchantReturnPassportDto, MerchantTimelineEventDto } from './merchant-evidence-types';
import { toMerchantEvidenceArtifactDto } from './merchant-evidence-service';
import { sha256 } from './merchant-transaction-service';
import {
  assertPassportEligible,
  boundOrIssuedIdentity,
  isPassportEligible,
  projectPassport,
} from './passport-projection';
import type { PackProofPassportV1, PassportCommerceInput } from '../../domain/v1/passport';
import { evidenceReadyForWorkflow, isOutboundPackingEvidenceType, isOutboundSealEvidenceType } from '../../package-seal-protocol';

export type PortalPrincipal = {
  type: 'PORTAL_USER';
  actorId: string;
  appId: string;
  channel: 'WEB_PORTAL';
};

export type PortalProtocolPresence = {
  hasPackingVideo: boolean;
  hasSealReference: boolean;
  hasArrivalPhoto: boolean;
  hasUnboxingVideo: boolean;
  sellerReferenceComplete: boolean;
  buyerArrivalComplete: boolean;
  outboundComplete: boolean;
};

export type PortalViewerRole = 'SELLER' | 'BUYER';

export type PortalTransactionDto = {
  id: string;
  object: 'portal_transaction';
  schemaVersion: 1;
  viewerRole: PortalViewerRole;
  hasBuyer: boolean;
  viewerConfirmed: boolean;
  viewerHandoffConfirmed: boolean;
  viewerCompleted: boolean;
  counterpartyConfirmed: boolean;
  counterpartyHandoffConfirmed: boolean;
  counterpartyCompleted: boolean;
  status: string;
  title: string;
  category: string;
  description: string;
  priceMinor: number | null;
  currency: string | null;
  identifiers: Array<{ label: string; value: string }>;
  conditionNotes: string;
  terms: AccessibleMerchantTransaction['terms'];
  passportId: string | null;
  passportDisplayId: string | null;
  proofReady: boolean;
  source: { type: string | null; platform: string | null; externalOrderId: string | null } | null;
  protocol: PortalProtocolPresence;
  lockedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export const nativeCaptureHandoffActions = [
  'START_PACKING',
  'RECORD_SEAL',
  'RECORD_ARRIVAL',
  'RECORD_UNBOXING',
  'RECORD_RETURN_PACKING',
  'RECORD_RETURN_SEAL',
  'RECORD_RETURN_UNBOXING',
] as const;

export type NativeCaptureHandoffAction = (typeof nativeCaptureHandoffActions)[number];

export type PortalMobileHandoffDto = {
  object: 'portal_mobile_handoff';
  schemaVersion: 1;
  channel: 'WEB_PORTAL';
  transactionId: string;
  action: NativeCaptureHandoffAction;
  captureOnNativeOnly: true;
  universalLink: string;
  appLink: string;
  storeUrl: string;
};

export type PortalWorkspaceRecord = AccessibleMerchantTransaction & {
  confirmedBy: string[];
  handoffConfirmedBy: string[];
  completedBy: string[];
  identifiers: Array<{ label: string; value: string }>;
  conditionNotes: string;
  lockedAt: Date | null;
};

export interface PortalWorkspaceRepository {
  listForParticipant(actorId: string, limit: number): Promise<PortalWorkspaceRecord[]>;
  findForParticipant(transactionId: string, actorId: string): Promise<PortalWorkspaceRecord | null>;
  listEvidence(transactionId: string): Promise<StoredEvidenceRecord[]>;
  listEvidenceForTransactions(transactionIds: readonly string[]): Promise<Map<string, StoredEvidenceRecord[]>>;
  listTimeline(transactionId: string): Promise<MerchantTimelineEventDto[]>;
  listReturns(transactionId: string): Promise<MerchantReturnPassportDto[]>;
  findCommerceContext(commerceContextId: string): Promise<PassportCommerceInput | null>;
  findCommerceContexts(commerceContextIds: readonly string[]): Promise<Map<string, PassportCommerceInput>>;
  bindPassportIdentity(transactionId: string, identity: PassportIdentityBinding): Promise<PassportIdentityBinding>;
}

export interface PortalAuditWriter {
  append(event: {
    eventId: string;
    organizationId: string | null;
    type: string;
    actor: PortalPrincipal;
    resourceType: string;
    resourceId: string;
    requestId: string;
    metadata: Record<string, string | number | boolean | null>;
  }): Promise<void>;
}

function notFound(): ApplicationError {
  return new ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'The requested PackProof was not found.');
}

function forbidden(): ApplicationError {
  return new ApplicationError('FORBIDDEN', 'PORTAL_ACCESS_DENIED', 'You are not authorized to access this PackProof.');
}

export function protocolFromEvidence(records: readonly StoredEvidenceRecord[]): PortalProtocolPresence {
  const outbound = records.filter((record) => !record.returnPassportId);
  const ready = (predicate: (record: StoredEvidenceRecord) => boolean): boolean => outbound.some((record) => predicate(record) && evidenceReadyForWorkflow({
    ...record,
    assurance: record.assurance ?? undefined,
  }));
  const hasPackingVideo = ready((record) => isOutboundPackingEvidenceType(record.type));
  const hasSealReference = ready((record) => isOutboundSealEvidenceType(record.type));
  const hasArrivalPhoto = ready((record) => record.type === 'DELIVERY_PHOTO');
  const hasUnboxingVideo = ready((record) => record.type === 'UNBOXING_VIDEO');
  return {
    hasPackingVideo,
    hasSealReference,
    hasArrivalPhoto,
    hasUnboxingVideo,
    sellerReferenceComplete: hasPackingVideo && hasSealReference,
    buyerArrivalComplete: hasArrivalPhoto && hasUnboxingVideo,
    outboundComplete: hasPackingVideo && hasSealReference && hasArrivalPhoto && hasUnboxingVideo,
  };
}

function includesActor(ids: readonly string[] | undefined, actorId: string): boolean {
  return Boolean(actorId && ids?.includes(actorId));
}

function viewerRoleOf(record: PortalWorkspaceRecord, actorId: string): PortalViewerRole {
  return record.sellerId === actorId ? 'SELLER' : 'BUYER';
}

export function toPortalTransactionDto(
  record: PortalWorkspaceRecord,
  viewerId: string,
  protocol: PortalProtocolPresence,
  proofReady: boolean,
): PortalTransactionDto {
  return {
    id: record.id,
    object: 'portal_transaction',
    schemaVersion: 1,
    viewerRole: viewerRoleOf(record, viewerId),
    hasBuyer: Boolean(record.buyerId),
    viewerConfirmed: includesActor(record.confirmedBy, viewerId),
    viewerHandoffConfirmed: includesActor(record.handoffConfirmedBy, viewerId),
    viewerCompleted: includesActor(record.completedBy, viewerId),
    counterpartyConfirmed: record.confirmedBy.some((id) => id !== viewerId),
    counterpartyHandoffConfirmed: record.handoffConfirmedBy.some((id) => id !== viewerId),
    counterpartyCompleted: record.completedBy.some((id) => id !== viewerId),
    status: record.consumerStatus || record.status,
    title: record.title,
    category: record.category ?? '',
    description: record.description,
    priceMinor: record.amount?.minorUnits ?? null,
    currency: record.amount?.currency ?? null,
    identifiers: record.identifiers,
    conditionNotes: record.conditionNotes,
    terms: record.terms,
    passportId: record.passportId,
    passportDisplayId: record.passportDisplayId,
    proofReady,
    source: record.sourceType || record.sourcePlatform || record.externalOrderId
      ? { type: record.sourceType, platform: record.sourcePlatform, externalOrderId: record.externalOrderId }
      : null,
    protocol,
    lockedAt: record.lockedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function nativePathForAction(action: NativeCaptureHandoffAction, transactionId: string): { appPath: string; queryAction: string } {
  if (action === 'START_PACKING' || action === 'RECORD_RETURN_PACKING') {
    return { appPath: `/pack/${encodeURIComponent(transactionId)}`, queryAction: 'pack' };
  }
  if (action === 'RECORD_SEAL' || action === 'RECORD_RETURN_SEAL') {
    return { appPath: `/pack/${encodeURIComponent(transactionId)}?beat=label`, queryAction: 'seal' };
  }
  if (action === 'RECORD_ARRIVAL') {
    return { appPath: `/capture/${encodeURIComponent(transactionId)}?type=DELIVERY_PHOTO&session=task`, queryAction: 'arrival' };
  }
  if (action === 'RECORD_UNBOXING') {
    return { appPath: `/capture/${encodeURIComponent(transactionId)}?type=UNBOXING_VIDEO&session=task`, queryAction: 'unbox' };
  }
  if (action === 'RECORD_RETURN_UNBOXING') {
    return { appPath: `/capture/${encodeURIComponent(transactionId)}?type=RETURN_UNBOXING_VIDEO&session=task`, queryAction: 'return-unbox' };
  }
  return { appPath: `/task/${encodeURIComponent(transactionId)}`, queryAction: 'task' };
}

export class PortalWorkspaceApplicationService {
  constructor(
    private readonly repository: PortalWorkspaceRepository,
    private readonly audit: PortalAuditWriter,
    private readonly linkBaseUrl: () => string,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async session(principal: PortalPrincipal): Promise<{ actorId: string; channel: 'WEB_PORTAL' }> {
    return { actorId: principal.actorId, channel: 'WEB_PORTAL' };
  }

  async listTransactions(principal: PortalPrincipal, limit = 50): Promise<PortalTransactionDto[]> {
    const records = await this.repository.listForParticipant(principal.actorId, Math.min(Math.max(limit, 1), 50));
    const [evidenceByTransaction, commerceById] = await Promise.all([
      this.repository.listEvidenceForTransactions(records.map((record) => record.id)),
      this.repository.findCommerceContexts(records.flatMap((record) => record.commerceContextId ? [record.commerceContextId] : [])),
    ]);
    return records.map((record) => this.toAuthorizedDto(principal.actorId, record, evidenceByTransaction.get(record.id) ?? [], record.commerceContextId
      ? commerceById.get(record.commerceContextId) ?? null
      : null));
  }

  async getTransaction(principal: PortalPrincipal, transactionId: string): Promise<PortalTransactionDto> {
    const record = await this.requireParticipant(principal, transactionId);
    const [evidence, commerce] = await Promise.all([
      this.repository.listEvidence(record.id),
      record.commerceContextId ? this.repository.findCommerceContext(record.commerceContextId) : Promise.resolve(null),
    ]);
    return this.toAuthorizedDto(principal.actorId, record, evidence, commerce);
  }

  async getTimeline(principal: PortalPrincipal, transactionId: string): Promise<MerchantTimelineEventDto[]> {
    const record = await this.requireParticipant(principal, transactionId);
    return this.repository.listTimeline(record.id);
  }

  async listEvidence(principal: PortalPrincipal, transactionId: string) {
    const record = await this.requireParticipant(principal, transactionId);
    const records = await this.repository.listEvidence(record.id);
    return records.map((item) => toMerchantEvidenceArtifactDto(item));
  }

  async getPassport(principal: PortalPrincipal, transactionId: string): Promise<PackProofPassportV1> {
    const transaction = await this.requireParticipant(principal, transactionId);
    const [records, timeline, returns] = await Promise.all([
      this.repository.listEvidence(transaction.id),
      this.repository.listTimeline(transaction.id),
      this.repository.listReturns(transaction.id),
    ]);
    assertPassportEligible(transaction, records);
    const issuedAt = this.now();
    const identity = boundOrIssuedIdentity(transaction, issuedAt);
    if (identity.bind) {
      const bound = await this.repository.bindPassportIdentity(transaction.id, {
        passportId: identity.passportId,
        displayId: identity.displayId,
        issuedAt: identity.issuedAt,
      });
      identity.passportId = bound.passportId;
      identity.displayId = bound.displayId;
      identity.issuedAt = bound.issuedAt;
    }
    const commerce = transaction.commerceContextId
      ? await this.repository.findCommerceContext(transaction.commerceContextId)
      : null;
    return projectPassport({
      transaction,
      artifacts: records,
      shipment: transaction.shipment,
      delivery: transaction.delivery,
      returns,
      timeline,
      commerce,
      identity: {
        passportId: identity.passportId,
        displayId: identity.displayId,
        issuedAt: identity.issuedAt.toISOString(),
      },
      verificationBaseUrl: this.verificationBaseUrl(),
      reviewQuery: null,
      now: issuedAt.toISOString(),
    });
  }

  async createMobileHandoff(
    principal: PortalPrincipal,
    transactionId: string,
    action: NativeCaptureHandoffAction,
    requestId: string,
  ): Promise<PortalMobileHandoffDto> {
    if (!(nativeCaptureHandoffActions as readonly string[]).includes(action)) {
      throw new ApplicationError('INVALID_ARGUMENT', 'UNSUPPORTED_PORTAL_HANDOFF', 'Browser capture is not available. Continue this step on your phone.');
    }
    const record = await this.requireParticipant(principal, transactionId);
    const links = nativePathForAction(action, record.id);
    const base = this.verificationBaseUrl();
    const universalLink = `${base}/portal/open?transaction=${encodeURIComponent(record.id)}&action=${encodeURIComponent(links.queryAction)}`;
    const handoff: PortalMobileHandoffDto = {
      object: 'portal_mobile_handoff',
      schemaVersion: 1,
      channel: 'WEB_PORTAL',
      transactionId: record.id,
      action,
      captureOnNativeOnly: true,
      universalLink,
      appLink: `packproof:/${links.appPath}`,
      storeUrl: 'https://play.google.com/store/apps/details?id=com.packproof.app',
    };
    const event: ApplicationEvent = {
      id: `evt_${sha256(`PORTAL_MOBILE_HANDOFF\n${record.id}\n${action}\n${requestId}`).slice(0, 40)}`,
      schemaVersion: 1,
      type: 'PORTAL_MOBILE_HANDOFF_ISSUED',
      organizationId: record.organizationId,
      actor: { type: 'USER', id: principal.actorId },
      resourceType: 'transaction',
      resourceId: record.id,
      requestId,
      occurredAt: this.now(),
      data: { channel: 'WEB_PORTAL', action },
    };
    await this.audit.append({
      eventId: event.id,
      organizationId: record.organizationId,
      type: event.type,
      actor: principal,
      resourceType: 'transaction',
      resourceId: record.id,
      requestId,
      metadata: { apiVersion: 'v1', channel: 'WEB_PORTAL', action },
    }).catch(() => undefined);
    return handoff;
  }

  private verificationBaseUrl(): string {
    return this.linkBaseUrl().replace(/\/$/, '') || 'https://packproof.link';
  }

  private toAuthorizedDto(
    viewerId: string,
    record: PortalWorkspaceRecord,
    evidence: readonly StoredEvidenceRecord[],
    commerce: PassportCommerceInput | null,
  ): PortalTransactionDto {
    return toPortalTransactionDto(
      record,
      viewerId,
      protocolFromEvidence(evidence),
      isPassportEligible(record, evidence, commerce),
    );
  }

  private async requireParticipant(principal: PortalPrincipal, transactionId: string): Promise<PortalWorkspaceRecord> {
    const record = await this.repository.findForParticipant(transactionId, principal.actorId);
    if (!record) {
      // Distinguish missing vs unauthorized only after a participant-scoped read.
      throw notFound();
    }
    if (!record.participantIds.includes(principal.actorId)) throw forbidden();
    return record;
  }
}
