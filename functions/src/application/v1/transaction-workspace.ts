import { evidenceReadyForWorkflow, isOutboundPackingEvidenceType, isOutboundSealEvidenceType } from '../../package-seal-protocol';
import type { ProofAvailability } from '../../domain/v1/passport';
import type { AccessibleMerchantTransaction, StoredEvidenceRecord } from './merchant-evidence-ports';
import type { MerchantReturnPassportDto } from './merchant-evidence-types';
import type { PortalProtocolPresence, PortalWorkspaceRecord } from './portal-workspace-service';
import { evaluateProofAvailabilityFromFacts } from './proof-application-service';
import type { PackProofTransaction, TransactionStatus } from '../../ux/next-action';

export function protocolFromEvidence(
  records: readonly StoredEvidenceRecord[],
  options: { returnPassportId?: string | null } = {},
): PortalProtocolPresence {
  const scoped = options.returnPassportId
    ? records.filter((record) => record.returnPassportId === options.returnPassportId)
    : records.filter((record) => !record.returnPassportId);
  const ready = (predicate: (record: StoredEvidenceRecord) => boolean): boolean => scoped.some((record) => predicate(record) && evidenceReadyForWorkflow({
    ...record,
    assurance: record.assurance ?? undefined,
  }));
  const hasPackingVideo = ready((record) => (
    options.returnPassportId ? record.type === 'RETURN_PACKING_VIDEO' : isOutboundPackingEvidenceType(record.type)
  ));
  const hasSealReference = ready((record) => (
    options.returnPassportId ? record.type === 'RETURN_SHIPPING_LABEL' : isOutboundSealEvidenceType(record.type)
  ));
  const hasArrivalPhoto = options.returnPassportId ? false : ready((record) => record.type === 'DELIVERY_PHOTO');
  const hasUnboxingVideo = ready((record) => (
    options.returnPassportId ? record.type === 'RETURN_UNBOXING_VIDEO' : record.type === 'UNBOXING_VIDEO'
  ));
  return {
    hasPackingVideo,
    hasSealReference,
    hasArrivalPhoto,
    hasUnboxingVideo,
    sellerReferenceComplete: hasPackingVideo && hasSealReference,
    buyerArrivalComplete: options.returnPassportId ? hasUnboxingVideo : hasArrivalPhoto && hasUnboxingVideo,
    outboundComplete: options.returnPassportId
      ? hasPackingVideo && hasSealReference && hasUnboxingVideo
      : hasPackingVideo && hasSealReference && hasArrivalPhoto && hasUnboxingVideo,
  };
}

export function evidenceProcessingFromRecords(records: readonly StoredEvidenceRecord[]): {
  phase: 'SECURING' | null;
  pendingCount: number;
} {
  const pending = records.filter((record) => !record.serverFinalized && !record.serverVerified);
  return pending.length ? { phase: 'SECURING', pendingCount: pending.length } : { phase: null, pendingCount: 0 };
}

export function inviteSentAtFromTimeline(events: readonly { type: string; occurredAt: string }[]): string | null {
  return events.find((event) => event.type === 'INVITE_CREATED')?.occurredAt ?? null;
}

export type WorkspaceProofSlice = {
  availability: ProofAvailability;
  passportId: string | null;
  displayId: string | null;
};

export type WorkspaceReturnSlice = {
  id: string;
  status: string;
  initiatedBy: string;
  returningParticipantId: string;
  recipientId: string;
  completedBy: string[];
  updatedAt: string;
} | null;

export function toWorkspaceTransaction(record: PortalWorkspaceRecord | AccessibleMerchantTransaction): PackProofTransaction {
  return {
    id: record.id,
    sellerId: record.sellerId ?? '',
    buyerId: record.buyerId,
    participantIds: record.participantIds,
    status: (record.consumerStatus || record.status) as TransactionStatus,
    title: record.title,
    category: record.category ?? '',
    description: record.description,
    priceMinor: record.amount?.minorUnits ?? 0,
    currency: record.amount?.currency ?? 'USD',
    identifiers: record.identifiers,
    conditionNotes: record.conditionNotes,
    terms: {
      saleType: (record.terms?.saleType === 'LOCAL_HANDOFF' ? 'LOCAL_HANDOFF' : 'SHIPPED') as 'SHIPPED' | 'LOCAL_HANDOFF',
      shippingResponsibility: (record.terms?.shippingResponsibility ?? 'SELLER') as 'SELLER' | 'BUYER' | 'NOT_APPLICABLE',
      returns: (record.terms?.returns ?? 'AS_AGREED') as 'NO_RETURNS' | 'AS_AGREED' | 'PLATFORM_POLICY',
      returnWindowDays: record.terms?.returnWindowDays ?? 0,
      customTerms: record.terms?.customTerms ?? '',
    },
    confirmedBy: record.confirmedBy,
    handoffConfirmedBy: record.handoffConfirmedBy,
    completedBy: record.completedBy,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    lockedAt: record.lockedAt?.toISOString() ?? null,
    passportId: record.passportId,
    passportDisplayId: record.passportDisplayId,
    source: record.sourceType || record.sourcePlatform || record.externalOrderId
      ? { type: record.sourceType ?? undefined, platform: record.sourcePlatform ?? undefined, externalOrderId: record.externalOrderId ?? undefined }
      : null,
  };
}

export function workspaceProofFromFacts(
  transaction: AccessibleMerchantTransaction,
  artifacts: readonly StoredEvidenceRecord[],
  commerce: Parameters<typeof evaluateProofAvailabilityFromFacts>[0]['commerce'],
): WorkspaceProofSlice {
  const result = evaluateProofAvailabilityFromFacts({ transaction, artifacts, commerce });
  return {
    availability: result.availability,
    passportId: result.passportId,
    displayId: result.displayId,
  };
}

function returnWorkspaceActors(item: MerchantReturnPassportDto) {
  const extra = item as MerchantReturnPassportDto & {
    initiatedBy?: string;
    returningParticipantId?: string;
    recipientId?: string;
    completedBy?: string[];
  };
  return {
    initiatedBy: extra.initiatedBy ?? '',
    returningParticipantId: extra.returningParticipantId ?? '',
    recipientId: extra.recipientId ?? '',
    completedBy: extra.completedBy ?? [],
  };
}

export function workspaceReturnFromRecords(returns: readonly MerchantReturnPassportDto[]): WorkspaceReturnSlice {
  const active = returns.find((item) => !['COMPLETED', 'CANCELLED'].includes(item.status)) ?? null;
  if (!active) return null;
  return {
    id: active.id,
    status: active.status,
    ...returnWorkspaceActors(active),
    updatedAt: active.updatedAt,
  };
}

export function hydrateWorkspaceSlices(
  record: PortalWorkspaceRecord,
  artifacts: readonly StoredEvidenceRecord[],
  returns: readonly MerchantReturnPassportDto[],
  commerce: Parameters<typeof evaluateProofAvailabilityFromFacts>[0]['commerce'],
): {
  protocol: PortalProtocolPresence;
  proof: WorkspaceProofSlice;
  returnWorkflow: WorkspaceReturnSlice;
} {
  return {
    protocol: protocolFromEvidence(artifacts),
    proof: workspaceProofFromFacts(record, artifacts, commerce),
    returnWorkflow: workspaceReturnFromRecords(returns),
  };
}
