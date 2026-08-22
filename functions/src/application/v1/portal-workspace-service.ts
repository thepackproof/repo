import { recordVisibleToActor, recordsVisibleToActor } from './authorization-boundary';
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

export type PortalTransactionDto = {
  id: string;
  object: 'portal_transaction';
  schemaVersion: 1;
  sellerId: string | null;
  buyerId: string | null;
  participantIds: string[];
  status: string;
  title: string;
  category: string;
  description: string;
  priceMinor: number | null;
  currency: string | null;
  identifiers: Array<{ label: string; value: string }>;
  conditionNotes: string;
  terms: AccessibleMerchantTransaction['terms'];
  confirmedBy: string[];
  handoffConfirmedBy: string[];
  completedBy: string[];
  passportId: string | null;
  passportDisplayId: string | null;
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

export const PORTAL_MOBILE_HANDOFF_TTL_MS = 15 * 60 * 1000;

export type PortalMobileHandoffDto = {
  object: 'portal_mobile_handoff';
  schemaVersion: 1;
  channel: 'WEB_PORTAL';
  transactionId: string;
  action: NativeCaptureHandoffAction;
  issuedAt: string;
  expiresAt: string;
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
  listTimeline(transactionId: string): Promise<MerchantTimelineEventDto[]>;
  listReturns(transactionId: string): Promise<MerchantReturnPassportDto[]>;
  findCommerceContext(commerceContextId: string): Promise<PassportCommerceInput | null>;
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

const EMPTY_PROTOCOL: PortalProtocolPresence = {
  hasPackingVideo: false,
  hasSealReference: false,
  hasArrivalPhoto: false,
  hasUnboxingVideo: false,
  sellerReferenceComplete: false,
  buyerArrivalComplete: false,
  outboundComplete: false,
};

function notFound(): ApplicationError {
  return new ApplicationError('NOT_FOUND', 'TRANSACTION_NOT_FOUND', 'The requested PackProof was not found.');
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

export function toPortalTransactionDto(
  record: PortalWorkspaceRecord,
  protocol: PortalProtocolPresence = EMPTY_PROTOCOL,
): PortalTransactionDto {
  return {
    id: record.id,
    object: 'portal_transaction',
    schemaVersion: 1,
    sellerId: record.sellerId,
    buyerId: record.buyerId,
    participantIds: record.participantIds,
    status: record.consumerStatus || record.status,
    title: record.title,
    category: record.category ?? '',
    description: record.description,
    priceMinor: record.amount?.minorUnits ?? null,
    currency: record.amount?.currency ?? null,
    identifiers: record.identifiers,
    conditionNotes: record.conditionNotes,
    terms: record.terms,
    confirmedBy: record.confirmedBy,
    handoffConfirmedBy: record.handoffConfirmedBy,
    completedBy: record.completedBy,
    passportId: record.passportId,
    passportDisplayId: record.passportDisplayId,
    source: record.sourceType || record.sourcePlatform || record.externalOrderId
      ? { type: record.sourceType, platform: record.sourcePlatform, externalOrderId: record.externalOrderId }
      : null,
    protocol,
    lockedAt: record.lockedAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function portalOpenLinks(transactionId: string): { universalLink: string; appLink: string } {
  const query = `transaction=${encodeURIComponent(transactionId)}`;
  return {
    universalLink: `/portal/open?${query}`,
    appLink: `packproof://portal/open?${query}`,
  };
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
    return recordsVisibleToActor(records, principal.actorId).map((record) => toPortalTransactionDto(record));
  }

  async getTransaction(principal: PortalPrincipal, transactionId: string): Promise<PortalTransactionDto> {
    const record = await this.requireParticipant(principal, transactionId);
    const evidence = await this.repository.listEvidence(record.id);
    return toPortalTransactionDto(record, protocolFromEvidence(evidence));
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
    const issuedAt = this.now();
    const expiresAt = new Date(issuedAt.getTime() + PORTAL_MOBILE_HANDOFF_TTL_MS);
    const links = portalOpenLinks(record.id);
    const base = this.verificationBaseUrl();
    const handoff: PortalMobileHandoffDto = {
      object: 'portal_mobile_handoff',
      schemaVersion: 1,
      channel: 'WEB_PORTAL',
      transactionId: record.id,
      action,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      captureOnNativeOnly: true,
      universalLink: `${base}${links.universalLink}`,
      appLink: links.appLink,
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

  private async requireParticipant(principal: PortalPrincipal, transactionId: string): Promise<PortalWorkspaceRecord> {
    const record = recordVisibleToActor(
      await this.repository.findForParticipant(transactionId, principal.actorId),
      principal.actorId,
    );
    if (!record) throw notFound();
    return record;
  }
}
