import type { EvidenceRecord, EvidenceType } from '@/types/models';

export const sellerReferenceTypes = ['PACKING_VIDEO', 'SHIPPING_LABEL'] as const;
export const buyerArrivalTypes = ['DELIVERY_PHOTO', 'UNBOXING_VIDEO'] as const;
export const returnReferenceTypes = ['RETURN_PACKING_VIDEO', 'RETURN_SHIPPING_LABEL'] as const;
export const returnArrivalTypes = ['RETURN_UNBOXING_VIDEO'] as const;

export const HUMAN_REVIEW_DISCLAIMER =
  'These observations are preserved for authorized human review. Visible similarity or difference in the mark, tape, seams, label, or cardboard is contextual only. PackProof does not state that the package is the same or different, identify a cause or actor, or determine authenticity, custody, fraud, fault, liability, or any commercial or legal outcome.';

export type ProtocolEvidence = Pick<
  EvidenceRecord,
  'type' | 'clientHashMatched' | 'clientSizeMatched' | 'contentTypeMatched' | 'assurance' | 'returnPassportId'
>;

export type PackageSealProtocolStatus = {
  hasPackingVideo: boolean;
  hasSealReference: boolean;
  hasArrivalPhoto: boolean;
  hasUnboxingVideo: boolean;
  sellerReferenceComplete: boolean;
  buyerArrivalComplete: boolean;
  outboundComplete: boolean;
};

export function evidenceSupportsWorkflow(record: ProtocolEvidence): boolean {
  return record.clientHashMatched !== false
    && record.clientSizeMatched !== false
    && record.contentTypeMatched !== false
    && record.assurance?.byteIntegrity?.status !== 'MISMATCH';
}

function hasReadyType(evidence: readonly ProtocolEvidence[], type: EvidenceType, returnPassportId?: string): boolean {
  return evidence.some((record) => (
    record.type === type
    && evidenceSupportsWorkflow(record)
    && (returnPassportId ? record.returnPassportId === returnPassportId : !record.returnPassportId)
  ));
}

export function packageSealProtocolStatus(
  evidence: readonly ProtocolEvidence[],
  options: { returnPassportId?: string } = {},
): PackageSealProtocolStatus {
  if (options.returnPassportId) {
    const hasPackingVideo = hasReadyType(evidence, 'RETURN_PACKING_VIDEO', options.returnPassportId);
    const hasSealReference = hasReadyType(evidence, 'RETURN_SHIPPING_LABEL', options.returnPassportId);
    const hasArrivalPhoto = false;
    const hasUnboxingVideo = hasReadyType(evidence, 'RETURN_UNBOXING_VIDEO', options.returnPassportId);
    return {
      hasPackingVideo,
      hasSealReference,
      hasArrivalPhoto,
      hasUnboxingVideo,
      sellerReferenceComplete: hasPackingVideo && hasSealReference,
      buyerArrivalComplete: hasUnboxingVideo,
      outboundComplete: hasPackingVideo && hasSealReference && hasUnboxingVideo,
    };
  }

  const hasPackingVideo = hasReadyType(evidence, 'PACKING_VIDEO');
  const hasSealReference = hasReadyType(evidence, 'SHIPPING_LABEL');
  const hasArrivalPhoto = hasReadyType(evidence, 'DELIVERY_PHOTO');
  const hasUnboxingVideo = hasReadyType(evidence, 'UNBOXING_VIDEO');
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

export function groupHumanReviewObservations<T extends { type: EvidenceType; returnPassportId?: string | null }>(
  evidence: readonly T[],
): { sellerReference: T[]; buyerArrival: T[] } {
  return {
    sellerReference: evidence.filter((record) => (
      (sellerReferenceTypes as readonly string[]).includes(record.type) && !record.returnPassportId
    )),
    buyerArrival: evidence.filter((record) => (
      (buyerArrivalTypes as readonly string[]).includes(record.type) && !record.returnPassportId
    )),
  };
}

export function nextParticipantAction(input: {
  status: string;
  role: 'SELLER' | 'BUYER';
  saleType?: 'SHIPPED' | 'LOCAL_HANDOFF';
  protocol?: PackageSealProtocolStatus | null;
}): string | null {
  const saleType = input.saleType ?? 'SHIPPED';
  if (['COMPLETED', 'CANCELLED', 'ARCHIVED'].includes(input.status)) return null;
  if (input.status === 'DRAFT' || input.status === 'AWAITING_BUYER') {
    return input.role === 'SELLER' ? 'Invite the buyer and confirm terms' : 'Open the invitation and review terms';
  }
  if (input.status === 'TERMS_REVIEW') return 'Confirm the exact terms';
  if (input.status === 'TERMS_LOCKED' && saleType === 'LOCAL_HANDOFF') return 'Confirm the local handoff';
  if (input.status === 'TERMS_LOCKED' && input.role === 'SELLER') {
    return input.protocol?.hasPackingVideo ? 'Record the high-resolution seal reference' : 'Record continuous packing';
  }
  if (input.status === 'PACKED' && input.role === 'SELLER') {
    return input.protocol?.sellerReferenceComplete ? 'Add shipment details' : 'Record the high-resolution seal reference';
  }
  if (input.status === 'SHIPPED' && input.role === 'BUYER') {
    return input.protocol?.hasArrivalPhoto ? 'Record continuous unboxing' : 'Record the arrival package observation';
  }
  if (input.status === 'BUYER_REVIEW') return 'Review the shared record and complete';
  if (input.status === 'DISPUTED') return 'A concern is open; review the shared record';
  return 'Open the shared record';
}
