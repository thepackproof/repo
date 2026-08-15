export const HUMAN_REVIEW_DISCLAIMER =
  'These observations are preserved for authorized human review. Visible similarity or difference in the mark, tape, seams, label, or cardboard is contextual only. PackProof does not state that the package is the same or different, identify a cause or actor, or determine authenticity, custody, fraud, fault, liability, or any commercial or legal outcome.';

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
