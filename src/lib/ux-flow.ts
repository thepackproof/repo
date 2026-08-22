import type { EvidenceType } from '@/types/models';
import {
  CAMERA_SESSION_ACTIONS,
  captureTypeForAction,
  type UxPrimaryActionKind,
} from '../../shared/ux/next-action.ts';

export {
  CAMERA_SESSION_ACTIONS,
  CAPTURE_PRIMARY_ACTIONS,
  DIRECT_CAPTURE_ACTIONS,
  EVIDENCE_PROCESSING_STAGES,
  HUMAN_STATE_LABEL,
  PACK_SESSION_ACTIONS,
  actionOutcomeCopy,
  buildProgressSteps,
  captureTypeForAction,
  displayCarrierName,
  evidenceProcessingFromProgress,
  groupByInboxBucket,
  groupHomeInbox,
  groupLibrary,
  orderLabel,
  otherLabel,
  resolveNextRequiredAction,
  roleFromViewer,
  viewerRole,
} from '../../shared/ux/next-action.ts';

export {
  evidenceProcessingForTransaction,
  evidenceProcessingFromQueue,
  evidenceProcessingFromQueueItems,
  recoverInFlightQueueState,
} from '../../shared/ux/evidence-resume.ts';

export type {
  EvidenceResumeObservation,
} from '../../shared/ux/evidence-resume.ts';

export type {
  ActionRequiredBy,
  ConsumerState,
  EvidenceProcessingPhase,
  HumanState,
  InboxBucket,
  NextRequiredAction,
  ParticipantRole,
  ProgressStage,
  ProgressStep,
  ProgressStepState,
  UxAction,
  UxFlowInput,
  UxPrimaryActionKind,
  UxSecondaryActionKind,
  WaitingReason,
} from '../../shared/ux/next-action.ts';

export type PrimaryActionHref =
  | { pathname: '/task/[id]'; params: { id: string; fromShare?: string } }
  | { pathname: '/pack/[id]'; params: { id: string; beat?: string; tracking?: string; carrier?: string } }
  | { pathname: '/capture/[id]'; params: { id: string; type: EvidenceType; session?: string } }
  | { pathname: '/transaction/[id]'; params: { id: string } }
  | { pathname: '/transaction/invite/[id]'; params: { id: string } }
  | { pathname: '/transaction/new'; params: { transactionId: string } }
  | { pathname: '/passport/[id]'; params: { id: string } };

export function hrefForPrimaryAction(
  kind: UxPrimaryActionKind | undefined,
  transactionId: string,
): PrimaryActionHref {
  const captureType = kind ? captureTypeForAction(kind) : null;
  if (kind === 'START_PACKING' || kind === 'RECORD_RETURN_PACKING') {
    return { pathname: '/pack/[id]', params: { id: transactionId } };
  }
  if (kind === 'RECORD_SEAL' || kind === 'RECORD_RETURN_SEAL') {
    return { pathname: '/pack/[id]', params: { id: transactionId, beat: 'label' } };
  }
  if (kind && CAMERA_SESSION_ACTIONS.has(kind) && captureType) {
    return { pathname: '/capture/[id]', params: { id: transactionId, type: captureType, session: 'task' } };
  }
  if (kind === 'EDIT_TERMS') {
    return { pathname: '/transaction/new', params: { transactionId } };
  }
  if (kind === 'OPEN_PASSPORT') {
    return { pathname: '/passport/[id]', params: { id: transactionId } };
  }
  return { pathname: '/task/[id]', params: { id: transactionId } };
}

export function toHref(href: PrimaryActionHref): import('expo-router').Href {
  return href as unknown as import('expo-router').Href;
}

export function hrefAfterCapture(input: {
  transactionId: string;
  type: EvidenceType;
  session?: string | null;
  trackingNumber?: string | null;
  courierCode?: string | null;
}): PrimaryActionHref {
  const { transactionId: id, type, session, trackingNumber, courierCode } = input;
  if (session === 'pack') {
    if (type === 'PACKING_VIDEO' || type === 'RETURN_PACKING_VIDEO') {
      return { pathname: '/pack/[id]', params: { id, beat: 'label' } };
    }
    if (type === 'SHIPPING_LABEL' || type === 'RETURN_SHIPPING_LABEL') {
      return {
        pathname: '/pack/[id]',
        params: {
          id,
          beat: 'tracking',
          ...(trackingNumber ? { tracking: trackingNumber } : {}),
          ...(courierCode ? { carrier: courierCode } : {}),
        },
      };
    }
  }
  return { pathname: '/task/[id]', params: { id } };
}
