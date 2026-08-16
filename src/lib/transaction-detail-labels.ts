import type { EvidenceRecord, EvidenceType } from '@/types/models';
import { formatRuntimeEnum } from './runtime-display';

export const evidenceLabels: Record<EvidenceType, string> = {
  ITEM_PHOTO: 'Item photo',
  CONDITION_PHOTO: 'Condition photo',
  IDENTIFIER_PHOTO: 'Identifier photo',
  COA_PHOTO: 'COA photo',
  PACKING_VIDEO: 'Continuous packing video',
  SHIPPING_LABEL: 'High-resolution seal reference',
  UNBOXING_VIDEO: 'Continuous unboxing video',
  DELIVERY_PHOTO: 'Arrival package observation',
  SUPPORTING_DOCUMENT: 'Supporting document',
  RETURN_CONDITION_PHOTO: 'Return condition photo',
  RETURN_PACKING_VIDEO: 'Continuous return repacking video',
  RETURN_SHIPPING_LABEL: 'High-resolution return seal reference',
  RETURN_UNBOXING_VIDEO: 'Continuous returned-item unboxing video',
  PHYSICAL_REFERENCE_FRAME: 'Physical reference frame',
  PHYSICAL_VERIFICATION_FRAME: 'Physical verification frame',
};

export function attestationLabel(record: EvidenceRecord): string {
  switch (record.attestationStatus) {
    case 'ONLINE_APP_CHECK_AND_KEY_POSSESSION':
    case 'JIT_VERIFIED': return 'ONLINE APP CHECK + KEY POSSESSION';
    case 'ONLINE_APP_CHECK_ONLY':
    case 'JIT_APP_CHECK_ONLY': return 'ONLINE APP CHECK ONLY';
    case 'OFFLINE_UNATTESTED': return 'OFFLINE / UNATTESTED';
    default: return 'NO APP/DEVICE CONTEXT';
  }
}

export function byteIntegrityLabel(record: EvidenceRecord): string {
  return record.assurance?.byteIntegrity.status
    ?? (record.clientHashMatched === false || record.clientSizeMatched === false || record.contentTypeMatched === false
      ? 'MISMATCH'
      : record.clientHashMatched === true ? 'MATCHED' : 'SERVER HASH ONLY');
}

export function trackingStatus(record: EvidenceRecord): EvidenceRecord['carrierTrackingMatchStatus'] | EvidenceRecord['postSubmissionTrackingMatchStatus'] {
  return record.postSubmissionTrackingMatchStatus ?? record.carrierTrackingMatchStatus;
}

export function trackingLabel(record: EvidenceRecord): string | null {
  const status = trackingStatus(record);
  if (!status || status === 'NOT_SCANNED') return null;
  return `${record.postSubmissionTrackingMatchStatus ? 'SUBMITTED TRACKING' : 'TRACKING'} ${formatRuntimeEnum(status)}`;
}
