export const HUMAN_REVIEW_DISCLAIMER =
  'These observations are preserved for authorized human review. Visible similarity or difference in the mark, tape, seams, label, or cardboard is contextual only. PackProof does not state that the package is the same or different, identify a cause or actor, or determine authenticity, custody, fraud, fault, liability, or any commercial or legal outcome.';

export const SHIPMENT_PRECONDITION_MESSAGES = {
  PACKING_VIDEO: 'A server-finalized packing video with no recorded byte-integrity mismatch is required before shipment can be recorded.',
  SEAL_REFERENCE: 'A server-finalized high-resolution seal reference photograph with no recorded byte-integrity mismatch is required before shipment can be recorded.',
  RETURN_PACKING_VIDEO: 'A server-finalized return repacking video with no recorded byte-integrity mismatch is required first.',
  RETURN_SEAL_REFERENCE: 'A server-finalized high-resolution return seal reference photograph with no recorded byte-integrity mismatch is required first.',
} as const;

export type WorkflowEvidenceRecord = {
  serverFinalized?: boolean;
  serverVerified?: boolean;
  clientHashMatched?: boolean | null;
  clientSizeMatched?: boolean | null;
  contentTypeMatched?: boolean | null;
  assurance?: { byteIntegrity?: { status?: string } };
};

export function evidenceReadyForWorkflow(value: WorkflowEvidenceRecord | undefined): boolean {
  if (!value) return false;
  if (value.serverFinalized === true) {
    return value.clientHashMatched !== false
      && value.clientSizeMatched !== false
      && value.contentTypeMatched !== false
      && value.assurance?.byteIntegrity?.status !== 'MISMATCH';
  }
  return value.serverVerified === true && value.clientHashMatched !== false;
}

export function shipmentEvidenceDecision(input: { packingReady: boolean; sealReady: boolean; kind?: 'outbound' | 'return' }):
  | { ok: true }
  | { ok: false; missing: 'PACKING_VIDEO' | 'SEAL_REFERENCE' | 'RETURN_PACKING_VIDEO' | 'RETURN_SEAL_REFERENCE' } {
  const kind = input.kind ?? 'outbound';
  if (!input.packingReady) return { ok: false, missing: kind === 'return' ? 'RETURN_PACKING_VIDEO' : 'PACKING_VIDEO' };
  if (!input.sealReady) return { ok: false, missing: kind === 'return' ? 'RETURN_SEAL_REFERENCE' : 'SEAL_REFERENCE' };
  return { ok: true };
}

export function groupPackageSealObservations<T extends { type?: string; returnPassportId?: string | null }>(
  evidence: readonly T[],
): { sellerReference: T[]; buyerArrival: T[]; returnReference: T[]; returnArrival: T[] } {
  return {
    sellerReference: evidence.filter((item) => (
      (item.type === 'PACKING_VIDEO' || item.type === 'SHIPPING_LABEL') && !item.returnPassportId
    )),
    buyerArrival: evidence.filter((item) => (
      (item.type === 'DELIVERY_PHOTO' || item.type === 'UNBOXING_VIDEO') && !item.returnPassportId
    )),
    returnReference: evidence.filter((item) => (
      item.type === 'RETURN_PACKING_VIDEO' || item.type === 'RETURN_SHIPPING_LABEL'
    )),
    returnArrival: evidence.filter((item) => item.type === 'RETURN_UNBOXING_VIDEO'),
  };
}
