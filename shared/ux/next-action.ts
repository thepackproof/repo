/**
 * Platform-neutral Next Action Engine.
 * No React, React Native, DOM, Expo, or Firebase imports.
 */
export type TransactionStatus =
  | 'DRAFT'
  | 'AWAITING_BUYER'
  | 'TERMS_REVIEW'
  | 'TERMS_LOCKED'
  | 'PACKED'
  | 'SHIPPED'
  | 'BUYER_REVIEW'
  | 'COMPLETED'
  | 'DISPUTED'
  | 'CANCELLED'
  | 'ARCHIVED';

export type EvidenceType =
  | 'ITEM_PHOTO'
  | 'CONDITION_PHOTO'
  | 'IDENTIFIER_PHOTO'
  | 'COA_PHOTO'
  | 'PACKING_VIDEO'
  | 'SHIPPING_LABEL'
  | 'UNBOXING_VIDEO'
  | 'DELIVERY_PHOTO'
  | 'SUPPORTING_DOCUMENT'
  | 'RETURN_CONDITION_PHOTO'
  | 'RETURN_PACKING_VIDEO'
  | 'RETURN_SHIPPING_LABEL'
  | 'RETURN_UNBOXING_VIDEO'
  | 'PHYSICAL_REFERENCE_FRAME'
  | 'PHYSICAL_VERIFICATION_FRAME';

export type DateLike = { toDate?: () => Date; seconds?: number } | string | null;

export type PackageSealProtocolStatus = {
  hasPackingVideo: boolean;
  hasSealReference: boolean;
  hasArrivalPhoto: boolean;
  hasUnboxingVideo: boolean;
  sellerReferenceComplete: boolean;
  buyerArrivalComplete: boolean;
  outboundComplete: boolean;
};

export type PackProofTransaction = {
  id: string;
  sellerId: string;
  buyerId: string | null;
  participantIds: string[];
  status: TransactionStatus;
  title: string;
  category: string;
  description: string;
  priceMinor: number;
  currency: string;
  identifiers: { label: string; value: string }[];
  conditionNotes: string;
  terms: {
    saleType: 'SHIPPED' | 'LOCAL_HANDOFF';
    shippingResponsibility: 'SELLER' | 'BUYER' | 'NOT_APPLICABLE';
    returns: 'NO_RETURNS' | 'AS_AGREED' | 'PLATFORM_POLICY';
    returnWindowDays: number;
    customTerms: string;
  };
  confirmedBy: string[];
  handoffConfirmedBy?: string[];
  completedBy?: string[];
  createdAt: DateLike;
  updatedAt: DateLike;
  lockedAt: DateLike;
  passportId?: string | null;
  passportDisplayId?: string | null;
  source?: {
    type?: string;
    platform?: string;
    externalOrderId?: string;
  } | null;
};

export type ReturnPassport = {
  id: string;
  status: string;
  initiatedBy: string;
  returningParticipantId: string;
  recipientId: string;
  completedBy?: string[];
  updatedAt: DateLike;
};

export type ParticipantRole = 'SELLER' | 'BUYER';
export type ActionRequiredBy = 'YOU' | 'BUYER' | 'SELLER' | 'PACKPROOF' | 'NONE';
export type InboxBucket = 'NEEDS_ATTENTION' | 'WAITING' | 'IN_PROGRESS' | 'COMPLETED';
export type ProgressStage = 'CREATED' | 'TERMS' | 'PACKING' | 'SHIPPING' | 'DELIVERY' | 'COMPLETE';
export type ProgressStepState = 'done' | 'current' | 'upcoming';
export type WaitingReason =
  | 'NONE'
  | 'BUYER_JOIN'
  | 'BUYER_CONFIRMATION'
  | 'SELLER_CONFIRMATION'
  | 'SELLER_PACKING'
  | 'SELLER_SHIPMENT'
  | 'BUYER_DELIVERY'
  | 'OTHER_COMPLETION'
  | 'EVIDENCE_PROCESSING'
  | 'RETURN_AUTHORIZATION'
  | 'RETURN_PACKING'
  | 'RETURN_IN_TRANSIT';

export type HumanState =
  | 'YOUR_ACTION_REQUIRED'
  | 'WAITING_ON_BUYER'
  | 'WAITING_ON_SELLER'
  | 'READY_TO_PACK'
  | 'EVIDENCE_PROCESSING'
  | 'READY_TO_SHIP'
  | 'IN_TRANSIT'
  | 'DELIVERY_REVIEW'
  | 'COMPLETE'
  | 'CANCELLED'
  | 'CONCERN_OPEN';

export type UxPrimaryActionKind =
  | 'EDIT_TERMS'
  | 'INVITE_BUYER'
  | 'CONFIRM_TERMS'
  | 'START_PACKING'
  | 'RECORD_SEAL'
  | 'ADD_SHIPMENT'
  | 'CONFIRM_HANDOFF'
  | 'RECORD_ARRIVAL'
  | 'RECORD_UNBOXING'
  | 'COMPLETE_TRANSACTION'
  | 'OPEN_PASSPORT' // Proof viewer; kind name is schema v1
  | 'AUTHORIZE_RETURN'
  | 'RECORD_RETURN_PACKING'
  | 'RECORD_RETURN_SEAL'
  | 'ADD_RETURN_SHIPMENT'
  | 'RECORD_RETURN_UNBOXING'
  | 'COMPLETE_RETURN';

export type UxSecondaryActionKind =
  | 'RESEND_INVITE'
  | 'EDIT_TERMS'
  | 'OPEN_PASSPORT'
  | 'MARK_RECEIVED'
  | 'MARK_RETURN_RECEIVED';

export type UxAction<K extends string> = {
  kind: K;
  label: string;
  captureType?: EvidenceType;
};

export type ProgressStep = { id: ProgressStage; label: string; state: ProgressStepState };

export type EvidenceProcessingPhase = 'UPLOADING' | 'SECURING' | 'FAILED_RETRY' | 'FAILED_RECAPTURE';

export type ConsumerState = 'action_required' | 'waiting' | 'complete' | 'blocked';

export type NextRequiredAction = {
  humanState: HumanState;
  humanStateLabel: string;
  headline: string;
  description: string;
  instruction: string;
  nextHappens: string;
  actionRequiredBy: ActionRequiredBy;
  primaryAction: UxAction<UxPrimaryActionKind> | null;
  secondaryAction: UxAction<UxSecondaryActionKind> | null;
  progressStage: ProgressStage;
  progressSteps: ProgressStep[];
  waitingReason: WaitingReason;
  waitingOnName: string | null;
  waitingOnTask: string | null;
  lockedExplanation: string | null;
  prerequisites: { label: string; complete: boolean }[];
  completedContext: readonly string[];
  consumerState: ConsumerState;
  waitingOn: string | null;
  stepCurrent: number;
  stepTotal: number;
  notificationCopy: { title: string; body: string };
  inboxBucket: InboxBucket;
  inboxSentence: string;
  inboxCta: string | null;
  noActionRequired: boolean;
  passportReady: boolean;
  canLeaveWhileProcessing: boolean;
};

export type ProofAvailability = 'NOT_ELIGIBLE' | 'ELIGIBLE_NOT_ISSUED' | 'AVAILABLE';

export type UxFlowInput = {
  transaction: PackProofTransaction;
  viewerId: string;
  protocol: PackageSealProtocolStatus;
  proof?: { availability: ProofAvailability } | null;
  returnPassport?: Pick<
    ReturnPassport,
    'id' | 'status' | 'initiatedBy' | 'returningParticipantId' | 'recipientId' | 'completedBy' | 'updatedAt'
  > | null;
  returnProtocol?: PackageSealProtocolStatus | null;
  otherPartyName?: string | null;
  inviteSentAt?: DateLike;
  evidenceProcessing?: { phase: EvidenceProcessingPhase } | null;
};

export const HUMAN_STATE_LABEL: Record<HumanState, string> = {
  YOUR_ACTION_REQUIRED: 'ACTION NEEDED',
  WAITING_ON_BUYER: 'WAITING',
  WAITING_ON_SELLER: 'WAITING',
  READY_TO_PACK: 'ACTION NEEDED',
  EVIDENCE_PROCESSING: 'SAVING',
  READY_TO_SHIP: 'ACTION NEEDED',
  IN_TRANSIT: 'IN TRANSIT',
  DELIVERY_REVIEW: 'ACTION NEEDED',
  COMPLETE: 'COMPLETE',
  CANCELLED: 'CANCELLED',
  CONCERN_OPEN: 'ACTION NEEDED',
};

export const EVIDENCE_PROCESSING_STAGES = [
  { id: 'UPLOADING', label: 'Uploading evidence' },
  { id: 'SECURING', label: 'Securing evidence record' },
  { id: 'READY', label: 'Evidence ready' },
] as const;

export const CAPTURE_PRIMARY_ACTIONS = new Set<UxPrimaryActionKind>([
  'START_PACKING',
  'RECORD_SEAL',
  'RECORD_ARRIVAL',
  'RECORD_UNBOXING',
  'RECORD_RETURN_PACKING',
  'RECORD_RETURN_SEAL',
  'RECORD_RETURN_UNBOXING',
]);

/** Explicit all-false protocol for fixtures that truly have no evidence. Never use as a missing-data default. */
export const ABSENT_PROTOCOL: PackageSealProtocolStatus = {
  hasPackingVideo: false,
  hasSealReference: false,
  hasArrivalPhoto: false,
  hasUnboxingVideo: false,
  sellerReferenceComplete: false,
  buyerArrivalComplete: false,
  outboundComplete: false,
};

const NO_ACTION = "You don't need to do anything right now.";
const DONE_FOR_NOW = "We'll notify you when anything else needs your attention.";

function roleOf(transaction: PackProofTransaction, viewerId: string): ParticipantRole {
  return transaction.sellerId === viewerId ? 'SELLER' : 'BUYER';
}

function otherLabel(role: ParticipantRole, name?: string | null): string {
  const trimmed = name?.trim();
  if (trimmed) return trimmed;
  return role === 'SELLER' ? 'the buyer' : 'the seller';
}

function waitingState(role: ParticipantRole): HumanState {
  return role === 'SELLER' ? 'WAITING_ON_BUYER' : 'WAITING_ON_SELLER';
}

function waitingBy(role: ParticipantRole): ActionRequiredBy {
  return role === 'SELLER' ? 'BUYER' : 'SELLER';
}

function hasConfirmed(ids: string[] | undefined, uid: string | null | undefined): boolean {
  return Boolean(uid && ids?.includes(uid));
}

export function proofCanBeViewed(availability: ProofAvailability | null | undefined): boolean {
  return availability === 'AVAILABLE';
}

export function integrityBannerLabel(banner: string): string {
  if (banner === 'AUTHENTIC_PACKPROOF') return 'Authentic PackProof record';
  if (banner === 'PACKPROOF_RECORD_WITH_LIMITATIONS') return 'PackProof record with limitations';
  return banner.replaceAll('_', ' ');
}

function proofReady(input: UxFlowInput): boolean {
  return proofCanBeViewed(input.proof?.availability);
}

function progressStageFor(status: TransactionStatus, saleType: 'SHIPPED' | 'LOCAL_HANDOFF'): ProgressStage {
  if (status === 'DRAFT' || status === 'CANCELLED') return 'CREATED';
  if (status === 'AWAITING_BUYER' || status === 'TERMS_REVIEW') return 'TERMS';
  if (status === 'TERMS_LOCKED') return 'PACKING';
  if (status === 'PACKED') return saleType === 'LOCAL_HANDOFF' ? 'PACKING' : 'SHIPPING';
  if (status === 'SHIPPED' || status === 'DISPUTED') return saleType === 'LOCAL_HANDOFF' ? 'COMPLETE' : 'DELIVERY';
  if (status === 'BUYER_REVIEW' || status === 'COMPLETED' || status === 'ARCHIVED') return 'COMPLETE';
  return 'TERMS';
}

export function buildProgressSteps(
  saleType: 'SHIPPED' | 'LOCAL_HANDOFF',
  current: ProgressStage,
  status: TransactionStatus,
): ProgressStep[] {
  const steps: { id: ProgressStage; label: string }[] = saleType === 'LOCAL_HANDOFF'
    ? [
      { id: 'CREATED', label: 'Created' },
      { id: 'TERMS', label: 'Terms' },
      { id: 'PACKING', label: 'Handoff' },
      { id: 'COMPLETE', label: 'Complete' },
    ]
    : [
      { id: 'CREATED', label: 'Created' },
      { id: 'TERMS', label: 'Terms' },
      { id: 'PACKING', label: 'Packing' },
      { id: 'SHIPPING', label: 'Shipping' },
      { id: 'DELIVERY', label: 'Delivery' },
      { id: 'COMPLETE', label: 'Complete' },
    ];
  const currentIndex = Math.max(0, steps.findIndex((step) => step.id === current));
  const finished = status === 'COMPLETED' || status === 'ARCHIVED';
  return steps.map((step, index) => ({
    id: step.id,
    label: step.label,
    state: index < currentIndex || (finished && index <= currentIndex)
      ? 'done'
      : index === currentIndex
        ? 'current'
        : 'upcoming',
  }));
}

function notify(title: string, body: string): { title: string; body: string } {
  return { title, body };
}

type DraftView = Omit<NextRequiredAction, 'humanStateLabel' | 'progressSteps' | 'inboxCta' | 'passportReady' | 'canLeaveWhileProcessing' | 'consumerState' | 'waitingOn' | 'stepCurrent' | 'stepTotal' | 'completedContext'> & {
  completedContext?: readonly string[];
};

function consumerStateOf(draft: DraftView, status: TransactionStatus): ConsumerState {
  if (status === 'DISPUTED' || draft.humanState === 'CONCERN_OPEN') return 'blocked';
  if (status === 'COMPLETED' || status === 'ARCHIVED' || draft.humanState === 'COMPLETE' || draft.humanState === 'CANCELLED') return 'complete';
  if (draft.noActionRequired || !draft.primaryAction) return 'waiting';
  return 'action_required';
}

function stepOf(status: TransactionStatus, kind: UxPrimaryActionKind | undefined, saleType: 'SHIPPED' | 'LOCAL_HANDOFF'): { current: number; total: number } {
  const total = saleType === 'LOCAL_HANDOFF' ? 4 : 5;
  if (status === 'DRAFT' || status === 'AWAITING_BUYER' || status === 'TERMS_REVIEW' || kind === 'INVITE_BUYER' || kind === 'CONFIRM_TERMS' || kind === 'EDIT_TERMS') {
    return { current: 1, total };
  }
  if (kind === 'START_PACKING' || kind === 'CONFIRM_HANDOFF') return { current: 2, total };
  if (kind === 'RECORD_SEAL') return { current: 3, total };
  if (kind === 'ADD_SHIPMENT') return { current: 4, total };
  if (kind === 'RECORD_ARRIVAL' || kind === 'RECORD_UNBOXING') return { current: 5, total };
  if (status === 'PACKED') return { current: 3, total };
  if (status === 'SHIPPED' || status === 'BUYER_REVIEW' || status === 'COMPLETED' || status === 'ARCHIVED') return { current: total, total };
  if (status === 'TERMS_LOCKED') return { current: 2, total };
  return { current: 1, total };
}

function finish(
  input: UxFlowInput,
  _role: ParticipantRole,
  draft: DraftView,
): NextRequiredAction {
  const status = input.transaction.status;
  const saleType = input.transaction.terms.saleType;
  const ready = proofReady(input);
  const completedContext = draft.completedContext
    ?? draft.prerequisites.filter((item) => item.complete).map((item) => item.label);
  const step = stepOf(status, draft.primaryAction?.kind, saleType);
  return {
    ...draft,
    completedContext,
    consumerState: consumerStateOf(draft, status),
    waitingOn: draft.noActionRequired && draft.waitingOnTask
      ? `${draft.waitingOnName ?? 'PackProof'} to ${draft.waitingOnTask}`
      : null,
    stepCurrent: step.current,
    stepTotal: step.total,
    humanStateLabel: HUMAN_STATE_LABEL[draft.humanState],
    progressSteps: buildProgressSteps(saleType, draft.progressStage, status),
    inboxCta: draft.primaryAction?.label ?? null,
    passportReady: ready,
    canLeaveWhileProcessing: draft.humanState === 'EVIDENCE_PROCESSING',
    secondaryAction: draft.secondaryAction ?? (ready && draft.primaryAction?.kind !== 'OPEN_PASSPORT'
        ? { kind: 'OPEN_PASSPORT', label: 'View Proof' }
      : null),
  };
}

function waitingView(
  input: UxFlowInput,
  role: ParticipantRole,
  details: {
    headline: string;
    description: string;
    nextHappens: string;
    waitingReason: WaitingReason;
    waitingOnTask: string;
    progressStage: ProgressStage;
    secondaryAction?: UxAction<UxSecondaryActionKind> | null;
    lockedExplanation?: string | null;
    prerequisites?: { label: string; complete: boolean }[];
    completedContext?: readonly string[];
    notificationCopy: { title: string; body: string };
    inboxSentence: string;
    inboxBucket?: InboxBucket;
  },
): DraftView {
  const name = otherLabel(role, input.otherPartyName);
  return {
    humanState: waitingState(role),
    headline: details.headline,
    description: details.description,
    instruction: DONE_FOR_NOW,
    nextHappens: details.nextHappens,
    actionRequiredBy: waitingBy(role),
    primaryAction: null,
    secondaryAction: details.secondaryAction ?? null,
    progressStage: details.progressStage,
    waitingReason: details.waitingReason,
    waitingOnName: name,
    waitingOnTask: details.waitingOnTask,
    lockedExplanation: details.lockedExplanation ?? null,
    prerequisites: details.prerequisites ?? [],
    completedContext: details.completedContext,
    notificationCopy: details.notificationCopy,
    inboxBucket: details.inboxBucket ?? 'WAITING',
    inboxSentence: details.inboxSentence,
    noActionRequired: true,
  };
}

function actionView(
  details: {
    humanState?: HumanState;
    headline: string;
    description: string;
    instruction: string;
    nextHappens: string;
    primaryAction: UxAction<UxPrimaryActionKind>;
    secondaryAction?: UxAction<UxSecondaryActionKind> | null;
    progressStage: ProgressStage;
    lockedExplanation?: string | null;
    prerequisites?: { label: string; complete: boolean }[];
    completedContext?: readonly string[];
    notificationCopy: { title: string; body: string };
    inboxSentence: string;
    waitingReason?: WaitingReason;
    inboxBucket?: InboxBucket;
  },
): DraftView {
  return {
    humanState: details.humanState ?? 'YOUR_ACTION_REQUIRED',
    headline: details.headline,
    description: details.description,
    instruction: details.instruction,
    nextHappens: details.nextHappens,
    actionRequiredBy: 'YOU',
    primaryAction: details.primaryAction,
    secondaryAction: details.secondaryAction ?? null,
    progressStage: details.progressStage,
    waitingReason: details.waitingReason ?? 'NONE',
    waitingOnName: null,
    waitingOnTask: null,
    lockedExplanation: details.lockedExplanation ?? null,
    prerequisites: details.prerequisites ?? [],
    completedContext: details.completedContext,
    notificationCopy: details.notificationCopy,
    inboxBucket: details.inboxBucket ?? 'NEEDS_ATTENTION',
    inboxSentence: details.inboxSentence,
    noActionRequired: false,
  };
}

function resolveReturn(
  input: UxFlowInput,
  role: ParticipantRole,
): DraftView | null {
  const active = input.returnPassport;
  if (!active || ['COMPLETED', 'CANCELLED'].includes(active.status)) return null;
  const name = otherLabel(role, input.otherPartyName);
  const returning = active.returningParticipantId === input.viewerId;
  const recipient = active.recipientId === input.viewerId;
  const requester = active.initiatedBy === input.viewerId;
  const protocol = input.returnProtocol ?? ABSENT_PROTOCOL;
  const stage = progressStageFor(input.transaction.status, input.transaction.terms.saleType);

  if (active.status === 'REQUESTED') {
    if (!requester) {
      return actionView({
        headline: 'Return needs your approval',
        description: `${name} requested a return passport.`,
        instruction: 'Review the return reason and authorize it before any repacking begins.',
        nextHappens: 'After you authorize, they can record the return being packed.',
        primaryAction: { kind: 'AUTHORIZE_RETURN', label: 'Authorize return' },
        progressStage: stage,
        notificationCopy: notify('Your turn', 'A return was requested. Review and authorize it.'),
        inboxSentence: 'A return is waiting for your authorization.',
      });
    }
    return waitingView(input, role, {
      headline: `Waiting for ${name}`,
      description: `${name} needs to authorize the return.`,
      nextHappens: "We'll notify you when they respond.",
      waitingReason: 'RETURN_AUTHORIZATION',
      waitingOnTask: 'authorize the return',
      progressStage: stage,
      notificationCopy: notify('Waiting on the other participant', 'The return is waiting for authorization.'),
      inboxSentence: `${name} needs to authorize the return.`,
    });
  }

  if (active.status === 'AUTHORIZED') {
    if (returning) {
      return actionView({
        headline: 'Pack the return',
        description: 'The return is authorized.',
        instruction: "We'll record while you pack and seal the returned item.",
        nextHappens: 'Then photograph the sealed return with the label attached.',
        primaryAction: { kind: 'RECORD_RETURN_PACKING', label: 'Start packing', captureType: 'RETURN_PACKING_VIDEO' },
        progressStage: stage,
        notificationCopy: notify('Ready to pack the return', 'Pack the returned item on camera.'),
        inboxSentence: 'Pack the return.',
      });
    }
    return waitingView(input, role, {
      headline: `Waiting for ${name}`,
      description: `${name} is packing the return.`,
      nextHappens: "We'll notify you when the return ships.",
      waitingReason: 'RETURN_PACKING',
      waitingOnTask: 'pack the return',
      progressStage: stage,
      notificationCopy: notify('Return packing in progress', 'The other participant is preparing the return shipment.'),
      inboxSentence: `${name} is packing the return.`,
    });
  }

  if (active.status === 'PACKED') {
    if (returning && !protocol.sellerReferenceComplete) {
      return actionView({
        headline: 'Photograph the sealed return',
        description: 'Your packing video is saved. Attach the return label, then take one clear photo.',
        instruction: 'Show the return label on the sealed package.',
        nextHappens: 'Then add return tracking if it is not already filled in.',
        primaryAction: { kind: 'RECORD_RETURN_SEAL', label: 'Take photo', captureType: 'RETURN_SHIPPING_LABEL' },
        progressStage: stage,
        lockedExplanation: 'Return shipment can be recorded after packing video and seal evidence are ready.',
        prerequisites: [
          { label: 'Return packing recorded', complete: protocol.hasPackingVideo },
          { label: 'Return seal and label captured', complete: protocol.hasSealReference },
        ],
        completedContext: protocol.hasPackingVideo ? ['Packing video'] : [],
        notificationCopy: notify('Photograph the sealed return', 'Your packing video is saved.'),
        inboxSentence: 'Photograph the sealed return.',
      });
    }
    if (returning) {
      return actionView({
        headline: 'Add return tracking',
        description: 'Return packing is complete.',
        instruction: 'Add the carrier and tracking number if they are not already filled in.',
        nextHappens: `${name} will be notified when the return is on the way.`,
        primaryAction: { kind: 'ADD_RETURN_SHIPMENT', label: 'Add tracking' },
        progressStage: stage,
        completedContext: ['Packing video', 'Package photo'],
        notificationCopy: notify('Return packing complete', 'Add tracking if PackProof did not already find it.'),
        inboxSentence: 'Add return tracking.',
      });
    }
    return waitingView(input, role, {
      headline: `Waiting for ${name}`,
      description: `${name} is adding return shipment details.`,
      nextHappens: "We'll notify you when the return is in transit.",
      waitingReason: 'RETURN_PACKING',
      waitingOnTask: 'ship the return',
      progressStage: stage,
      notificationCopy: notify('Return ready to ship', 'The other participant is adding return tracking.'),
      inboxSentence: `${name} is preparing to ship the return.`,
    });
  }

  if (active.status === 'IN_TRANSIT') {
    if (recipient) {
      return actionView({
        headline: 'The return arrived',
        description: 'Photograph the sealed return, then open it on camera.',
        instruction: 'Start with the sealed package. Keep the opening in one take.',
        nextHappens: 'Then you can finish the return.',
        primaryAction: { kind: 'RECORD_RETURN_UNBOXING', label: 'Record unboxing', captureType: 'RETURN_UNBOXING_VIDEO' },
        secondaryAction: { kind: 'MARK_RETURN_RECEIVED', label: 'Skip video' },
        progressStage: stage,
        notificationCopy: notify('The return arrived', 'Record the sealed package before opening it.'),
        inboxSentence: 'Record the returned package.',
      });
    }
    return waitingView(input, role, {
      headline: 'Return in transit',
      description: `${name} will record the returned package on arrival.`,
      nextHappens: "We'll notify you after they record receipt.",
      waitingReason: 'RETURN_IN_TRANSIT',
      waitingOnTask: 'record return delivery',
      progressStage: stage,
      notificationCopy: notify('Return in transit', 'Waiting for the other participant to record arrival.'),
      inboxSentence: `Waiting for ${name} to record the returned package.`,
    });
  }

  if (active.status === 'RECEIVED_REVIEW') {
    const already = hasConfirmed(active.completedBy, input.viewerId);
    if (already) {
      return waitingView(input, role, {
        headline: `Waiting for ${name}`,
        description: `${name} still needs to complete the return.`,
        nextHappens: 'The return passport completes after both participants confirm.',
        waitingReason: 'OTHER_COMPLETION',
        waitingOnTask: 'complete the return',
        progressStage: 'COMPLETE',
        notificationCopy: notify('Return completion confirmed', 'Waiting for the other participant to complete the return.'),
        inboxSentence: `${name} needs to complete the return.`,
      });
    }
    return actionView({
      headline: 'Finish the return',
      description: 'The returned package has been recorded.',
      instruction: 'Confirm that the return looks complete.',
      nextHappens: 'When both of you confirm, the return is finished.',
      primaryAction: { kind: 'COMPLETE_RETURN', label: 'Finish' },
      progressStage: 'COMPLETE',
      notificationCopy: notify('Finish the return', 'Confirm that the return looks complete.'),
      inboxSentence: 'Finish the return.',
    });
  }

  if (active.status === 'DISPUTED') {
    return {
      humanState: 'CONCERN_OPEN',
      headline: 'A concern is open on this return',
      description: 'The return is paused while the concern is reviewed.',
      instruction: NO_ACTION,
      nextHappens: 'PackProof keeps the existing evidence unchanged.',
      actionRequiredBy: 'NONE',
      primaryAction: null,
      secondaryAction: null,
      progressStage: stage,
      waitingReason: 'NONE',
      waitingOnName: null,
      waitingOnTask: null,
      lockedExplanation: null,
      prerequisites: [],
      notificationCopy: notify('Concern open', 'A concern is open. Review the shared record.'),
      inboxBucket: 'NEEDS_ATTENTION',
      inboxSentence: 'A concern is open on the return.',
      noActionRequired: true,
    };
  }

  return null;
}

function resolveStatus(input: UxFlowInput, role: ParticipantRole, protocol: PackageSealProtocolStatus): DraftView {
  const { transaction } = input;
  const { status, terms } = transaction;
  const shipped = terms.saleType === 'SHIPPED';
  const name = otherLabel(role, input.otherPartyName);
  const viewerConfirmed = hasConfirmed(transaction.confirmedBy, input.viewerId);
  const sellerConfirmed = hasConfirmed(transaction.confirmedBy, transaction.sellerId);
  const buyerConfirmed = hasConfirmed(transaction.confirmedBy, transaction.buyerId);
  const viewerHandoff = hasConfirmed(transaction.handoffConfirmedBy, input.viewerId);
  const viewerComplete = hasConfirmed(transaction.completedBy, input.viewerId);
  const stage = progressStageFor(status, terms.saleType);

  if (status === 'CANCELLED') {
    return {
      humanState: 'CANCELLED',
      headline: 'This PackProof was cancelled',
      description: 'The transaction stopped before the terms were locked.',
      instruction: NO_ACTION,
      nextHappens: 'No further packing or shipping steps will happen.',
      actionRequiredBy: 'NONE',
      primaryAction: null,
      secondaryAction: null,
      progressStage: 'CREATED',
      waitingReason: 'NONE',
      waitingOnName: null,
      waitingOnTask: null,
      lockedExplanation: null,
      prerequisites: [],
      notificationCopy: notify('PackProof cancelled', 'This PackProof was cancelled before the terms were locked.'),
      inboxBucket: 'COMPLETED',
      inboxSentence: 'This PackProof was cancelled.',
      noActionRequired: true,
    };
  }

  if (status === 'ARCHIVED' || status === 'COMPLETED') {
    const canView = proofReady(input);
    return {
      humanState: 'COMPLETE',
      headline: 'PackProof complete',
      description: 'This PackProof is finished.',
      instruction: canView ? 'The finished record is ready when you need it.' : 'This PackProof is finished.',
      nextHappens: canView ? 'You can view or share it where permitted.' : 'No further packing or shipping steps are required.',
      actionRequiredBy: 'NONE',
      primaryAction: canView ? { kind: 'OPEN_PASSPORT', label: 'View Proof' } : null,
      secondaryAction: null,
      progressStage: 'COMPLETE',
      waitingReason: 'NONE',
      waitingOnName: null,
      waitingOnTask: null,
      lockedExplanation: null,
      prerequisites: [],
      notificationCopy: canView
        ? notify('PackProof complete', 'Your Proof is ready.')
        : notify('PackProof complete', 'This PackProof is finished.'),
      inboxBucket: 'COMPLETED',
      inboxSentence: canView ? 'Your Proof is ready.' : 'This PackProof is finished.',
      noActionRequired: !canView,
    };
  }

  if (status === 'DISPUTED') {
    return {
      humanState: 'CONCERN_OPEN',
      headline: 'A concern is open',
      description: 'The usual completion flow is paused. The evidence record is unchanged.',
      instruction: 'Review the shared record. PackProof does not decide the dispute.',
      nextHappens: 'Completion stays paused until the concern is resolved.',
      actionRequiredBy: 'YOU',
      primaryAction: null,
      secondaryAction: proofReady(input) ? { kind: 'OPEN_PASSPORT', label: 'View Proof' } : null,
      progressStage: stage,
      waitingReason: 'NONE',
      waitingOnName: null,
      waitingOnTask: null,
      lockedExplanation: null,
      prerequisites: [],
      notificationCopy: notify('Concern open', 'A concern is open. Review the shared record.'),
      inboxBucket: 'NEEDS_ATTENTION',
      inboxSentence: 'A concern is open. Review the shared record.',
      noActionRequired: true,
    };
  }

  if (status === 'DRAFT' || status === 'AWAITING_BUYER') {
    if (role === 'SELLER') {
      if (!transaction.buyerId) {
        return actionView({
          headline: 'Invite the other person',
          description: 'The sale details are saved.',
          instruction: 'Send a private link so they can confirm the item, price, and terms.',
          nextHappens: "We'll notify you when they join.",
          primaryAction: { kind: 'INVITE_BUYER', label: 'Invite' },
          secondaryAction: { kind: 'EDIT_TERMS', label: 'Edit details' },
          progressStage: status === 'DRAFT' ? 'CREATED' : 'TERMS',
          notificationCopy: notify('Invite the buyer', 'Send the invitation so they can confirm the sale details.'),
          inboxSentence: 'Invite the other person to confirm.',
        });
      }
      return waitingView(input, role, {
        headline: `Waiting for ${name}`,
        description: `${name} needs to open the invitation and join.`,
        nextHappens: "We'll notify you when they join.",
        waitingReason: 'BUYER_JOIN',
        waitingOnTask: 'join this PackProof',
        progressStage: 'TERMS',
        secondaryAction: { kind: 'RESEND_INVITE', label: 'Share invite again' },
        notificationCopy: notify('Waiting for buyer', 'The buyer still needs to join this PackProof.'),
        inboxSentence: `${name} needs to join this PackProof.`,
      });
    }
    return actionView({
      headline: 'Confirm the transaction',
      description: 'You were invited to this PackProof.',
      instruction: 'Confirm only if the item, price, and terms are right.',
      nextHappens: "We'll notify you when packing starts.",
      primaryAction: { kind: 'CONFIRM_TERMS', label: 'Confirm' },
      progressStage: 'TERMS',
      notificationCopy: notify('Confirm the transaction', 'Review the details and confirm them.'),
      inboxSentence: 'Confirm the transaction details.',
    });
  }

  if (status === 'TERMS_REVIEW') {
    if (!viewerConfirmed) {
      return actionView({
        headline: 'Confirm the transaction',
        description: role === 'BUYER'
          ? 'Review the item, price, and terms.'
          : 'Review the item, price, and terms.',
        instruction: 'Confirm only if everything is exactly right.',
        nextHappens: buyerConfirmed || sellerConfirmed
          ? 'After you confirm, packing can start.'
          : `${name} still needs to confirm after you.`,
        primaryAction: { kind: 'CONFIRM_TERMS', label: 'Confirm' },
        secondaryAction: role === 'SELLER' ? { kind: 'EDIT_TERMS', label: 'Edit details' } : null,
        progressStage: 'TERMS',
        notificationCopy: notify('Confirm the transaction', 'Review the details and confirm them.'),
        inboxSentence: 'Confirm the transaction details.',
      });
    }
    return waitingView(input, role, {
      headline: `Waiting for ${name}`,
      description: `${name} needs to confirm the transaction details.`,
      nextHappens: `We'll notify you when ${name} responds.`,
      waitingReason: role === 'SELLER' ? 'BUYER_CONFIRMATION' : 'SELLER_CONFIRMATION',
      waitingOnTask: 'confirm the transaction details',
      progressStage: 'TERMS',
      secondaryAction: role === 'SELLER' ? { kind: 'RESEND_INVITE', label: 'Send reminder' } : null,
      lockedExplanation: 'Packing begins after both participants confirm the transaction details.',
      notificationCopy: notify(
        role === 'SELLER' ? 'Waiting for buyer' : 'Waiting for seller',
        `${name} needs to confirm the transaction details.`,
      ),
      inboxSentence: `${name} needs to confirm the transaction details.`,
    });
  }

  if (status === 'TERMS_LOCKED' && !shipped) {
    if (!viewerHandoff) {
      return actionView({
        headline: 'Confirm the handoff',
        description: 'Both of you confirmed the sale details.',
        instruction: 'Confirm when the item actually changes hands.',
        nextHappens: `Then ${name} will confirm as well.`,
        primaryAction: { kind: 'CONFIRM_HANDOFF', label: 'Confirm item changed hands' },
        progressStage: 'PACKING',
        notificationCopy: notify('Your turn', 'Confirm when the item changes hands.'),
        inboxSentence: 'Confirm when the item changes hands.',
      });
    }
    return waitingView(input, role, {
      headline: `Waiting for ${name}`,
      description: `${name} still needs to confirm the handoff.`,
      nextHappens: "We'll notify you when they confirm.",
      waitingReason: 'OTHER_COMPLETION',
      waitingOnTask: 'confirm the handoff',
      progressStage: 'PACKING',
      notificationCopy: notify('Waiting on handoff', `${name} still needs to confirm the item changed hands.`),
      inboxSentence: `${name} needs to confirm the handoff.`,
    });
  }

  if (status === 'TERMS_LOCKED' && shipped) {
    if (role === 'SELLER') {
      return actionView({
        humanState: 'READY_TO_PACK',
        headline: 'Pack your item',
        description: "We'll record while you put the item in the box and seal it.",
        instruction: 'Set your phone somewhere stable. Make sure the item and box stay visible.',
        nextHappens: 'Then photograph the sealed package with the shipping label attached.',
        primaryAction: { kind: 'START_PACKING', label: 'Start packing', captureType: 'PACKING_VIDEO' },
        progressStage: 'PACKING',
        notificationCopy: notify('The buyer confirmed. Ready to pack.', 'Start packing whenever you are ready.'),
        inboxSentence: 'Pack your item.',
        inboxBucket: 'NEEDS_ATTENTION',
      });
    }
    return waitingView(input, role, {
      headline: "You're done for now",
      description: 'Waiting for the seller to prepare your shipment.',
      nextHappens: "We'll notify you when the package is on the way.",
      waitingReason: 'SELLER_PACKING',
      waitingOnTask: 'pack and seal the item',
      progressStage: 'PACKING',
      lockedExplanation: 'Packing begins after both participants confirm the transaction details.',
      notificationCopy: notify('Confirmed', 'The seller is preparing your shipment. You are done for now.'),
      inboxSentence: 'Waiting for the seller to prepare your shipment.',
    });
  }

  if (status === 'PACKED') {
    const prerequisites = [
      { label: 'Packing video recorded', complete: protocol.hasPackingVideo },
      { label: 'Seal and label captured', complete: protocol.hasSealReference },
    ];
    if (role === 'SELLER' && !protocol.sellerReferenceComplete) {
      return actionView({
        humanState: 'READY_TO_PACK',
        headline: 'Photograph the sealed package',
        description: 'Your packing video is saved. Attach your shipping label, then take one clear photo showing the label and sealed package.',
        instruction: 'Attach your shipping label, then take one clear photo showing the label and sealed package.',
        nextHappens: 'PackProof will try to read the tracking number from the label.',
        primaryAction: { kind: 'RECORD_SEAL', label: 'Take photo', captureType: 'SHIPPING_LABEL' },
        progressStage: 'PACKING',
        lockedExplanation: 'Shipping begins after packing video and seal evidence are ready.',
        prerequisites,
        completedContext: protocol.hasPackingVideo ? ['Packing video'] : [],
        notificationCopy: notify('Photograph the sealed package', 'Your packing video is saved. Now photograph the label on the sealed box.'),
        inboxSentence: 'Photograph your sealed package.',
      });
    }
    if (role === 'SELLER') {
      return actionView({
        humanState: 'READY_TO_SHIP',
        headline: 'Add tracking',
        description: 'Packing is complete.',
        instruction: 'Add the carrier and tracking number if they are not already filled in.',
        nextHappens: `${name} will be notified when the package is on the way.`,
        primaryAction: { kind: 'ADD_SHIPMENT', label: 'Add tracking' },
        progressStage: 'SHIPPING',
        prerequisites,
        completedContext: ['Packing video', 'Package photo'],
        notificationCopy: notify('Packing complete', 'Add tracking if PackProof did not already find it.'),
        inboxSentence: 'Add tracking.',
      });
    }
    return waitingView(input, role, {
      headline: "You're done for now",
      description: 'Waiting for the seller to ship your package.',
      nextHappens: "We'll notify you when the package is on the way.",
      waitingReason: 'SELLER_SHIPMENT',
      waitingOnTask: 'ship the package',
      progressStage: 'SHIPPING',
      notificationCopy: notify('Packing complete', 'The seller can now ship the package.'),
      inboxSentence: 'Waiting for the seller to ship your package.',
    });
  }

  if (status === 'SHIPPED') {
    if (role === 'BUYER') {
      if (!protocol.hasArrivalPhoto) {
        return actionView({
          humanState: 'DELIVERY_REVIEW',
          headline: 'Your package arrived',
          description: 'Photograph the sealed package before you open it.',
          instruction: 'Take one photo of the unopened package, including the shipping label.',
          nextHappens: 'Then you can open it on camera.',
          primaryAction: { kind: 'RECORD_ARRIVAL', label: 'Take photo', captureType: 'DELIVERY_PHOTO' },
          secondaryAction: { kind: 'MARK_RECEIVED', label: 'Skip photos' },
          progressStage: 'DELIVERY',
          notificationCopy: notify('Your package arrived', 'Photograph the sealed package before you open it.'),
          inboxSentence: 'Photograph the arrived package.',
        });
      }
      if (!protocol.hasUnboxingVideo) {
        return actionView({
          humanState: 'DELIVERY_REVIEW',
          headline: 'Record the unboxing',
          description: 'Arrival photo is saved. Keep the opening in one take.',
          instruction: 'Start with the sealed package and keep recording until the contents are visible.',
          nextHappens: 'Then you can finish this PackProof.',
          primaryAction: { kind: 'RECORD_UNBOXING', label: 'Record unboxing', captureType: 'UNBOXING_VIDEO' },
          secondaryAction: { kind: 'MARK_RECEIVED', label: 'Skip video' },
          progressStage: 'DELIVERY',
          completedContext: ['Arrival photo'],
          notificationCopy: notify('Record the unboxing', 'Keep the opening in one continuous take.'),
          inboxSentence: 'Record unboxing of the arrived package.',
        });
      }
      return actionView({
        headline: 'Finish',
        description: 'Delivery has been recorded.',
        instruction: 'Confirm that everything looks complete.',
        nextHappens: 'When both of you confirm, this PackProof is finished.',
        primaryAction: { kind: 'COMPLETE_TRANSACTION', label: 'Finish' },
        progressStage: 'COMPLETE',
        notificationCopy: notify('Finish this PackProof', 'Confirm that everything looks complete.'),
        inboxSentence: 'Finish this PackProof.',
      });
    }
    return {
      humanState: 'IN_TRANSIT',
      headline: "You're done for now",
      description: 'Your packing evidence has been saved. We\'re waiting for the shipment to arrive.',
      instruction: DONE_FOR_NOW,
      nextHappens: "We'll notify you after delivery is recorded.",
      actionRequiredBy: 'BUYER',
      primaryAction: null,
      secondaryAction: null,
      progressStage: 'DELIVERY',
      waitingReason: 'BUYER_DELIVERY',
      waitingOnName: name,
      waitingOnTask: 'record delivery',
      lockedExplanation: null,
      prerequisites: [],
      completedContext: ['Packing video', 'Package photo'],
      notificationCopy: notify('On the way', 'We\'ll notify you when anything else needs your attention.'),
      inboxBucket: 'WAITING',
      inboxSentence: "You're done for now. We'll notify you when something needs your attention.",
      noActionRequired: true,
    };
  }

  if (status === 'BUYER_REVIEW') {
    if (viewerComplete) {
      return waitingView(input, role, {
        headline: `Waiting for ${name}`,
        description: `${name} still needs to mark this PackProof complete.`,
        nextHappens: 'When they confirm, your Passport is the finished record.',
        waitingReason: 'OTHER_COMPLETION',
        waitingOnTask: 'mark the PackProof complete',
        progressStage: 'COMPLETE',
        notificationCopy: notify('Completion confirmed', `Waiting for ${name} to complete the PackProof.`),
        inboxSentence: `${name} needs to mark this PackProof complete.`,
      });
    }
    return actionView({
      headline: 'Finish',
      description: shipped ? 'Delivery has been recorded.' : 'Both of you confirmed the handoff.',
      instruction: 'Confirm that everything looks complete.',
      nextHappens: 'When both of you confirm, this PackProof is finished.',
      primaryAction: { kind: 'COMPLETE_TRANSACTION', label: 'Finish' },
      progressStage: 'COMPLETE',
      notificationCopy: notify('Finish this PackProof', 'Confirm that everything looks complete.'),
      inboxSentence: 'Finish this PackProof.',
    });
  }

  return waitingView(input, role, {
    headline: 'Open this PackProof',
    description: 'Check the current step on the transaction page.',
    nextHappens: 'PackProof will show the next required action there.',
    waitingReason: 'NONE',
    waitingOnTask: 'review the shared record',
    progressStage: stage,
    notificationCopy: notify('PackProof update', 'Open the transaction to see what happens next.'),
    inboxSentence: 'Open this PackProof to see what happens next.',
    inboxBucket: 'IN_PROGRESS',
  });
}

function applyProcessing(
  view: DraftView,
  processing: UxFlowInput['evidenceProcessing'],
): DraftView {
  if (!processing) return view;
  if (processing.phase === 'UPLOADING' || processing.phase === 'SECURING') {
    const securing = processing.phase === 'SECURING';
    return {
      ...view,
      humanState: 'EVIDENCE_PROCESSING',
      headline: securing ? 'Finishing your Proof' : 'Your recording is safe',
      description: securing
        ? 'PackProof is finishing the record. You can leave.'
        : 'Uploading when your connection is available. You can leave.',
      instruction: DONE_FOR_NOW,
      nextHappens: 'The next step appears automatically when this finishes.',
      actionRequiredBy: 'PACKPROOF',
      primaryAction: null,
      secondaryAction: null,
      waitingReason: 'EVIDENCE_PROCESSING',
      waitingOnName: 'PackProof',
      waitingOnTask: securing ? 'secure the evidence record' : 'upload the evidence',
      notificationCopy: notify(securing ? 'Finishing your Proof' : 'Your recording is safe', 'You can leave. PackProof will keep going.'),
      inboxBucket: 'IN_PROGRESS',
      inboxSentence: securing ? 'Finishing your Proof.' : 'Your recording is safe.',
      noActionRequired: true,
    };
  }
  if (processing.phase === 'FAILED_RETRY') {
    return {
      ...view,
      headline: 'Your recording is safe',
      description: "We couldn't upload it yet because your connection dropped.",
      instruction: "You can leave PackProof. We'll retry automatically. You do not need to recapture.",
      nextHappens: 'After the upload succeeds, PackProof will continue.',
      lockedExplanation: 'The original capture is still on this device. Do not clear app data or uninstall.',
      notificationCopy: notify('Your recording is safe', 'We will retry the upload. You do not need to recapture.'),
      inboxBucket: 'NEEDS_ATTENTION',
      inboxSentence: 'Your recording is safe. We will retry the upload.',
      noActionRequired: false,
    };
  }
  return {
    ...view,
    headline: 'Evidence needs attention',
    description: 'Your previous work was not saved as finished evidence.',
    instruction: 'Record the step again from the start.',
    nextHappens: 'A new capture replaces the failed one.',
    lockedExplanation: 'Recapture this step. A retry of the old file will not work.',
    notificationCopy: notify('Evidence needs attention', 'That recording could not be used. Try again.'),
    inboxBucket: 'NEEDS_ATTENTION',
    inboxSentence: 'Evidence needs attention.',
    noActionRequired: false,
  };
}

export function resolveNextRequiredAction(input: UxFlowInput): NextRequiredAction {
  const role = roleOf(input.transaction, input.viewerId);
  const protocol = input.protocol;
  const fromReturn = input.transaction.status === 'DISPUTED' ? null : resolveReturn(input, role);
  const draft = applyProcessing(fromReturn ?? resolveStatus(input, role, protocol), input.evidenceProcessing);
  return finish(input, role, draft);
}

export function viewerRole(transaction: PackProofTransaction, viewerId: string): ParticipantRole {
  return roleOf(transaction, viewerId);
}

export function groupByInboxBucket<T>(
  items: T[],
  resolve: (item: T) => NextRequiredAction,
): Record<InboxBucket, T[]> {
  const grouped: Record<InboxBucket, T[]> = {
    NEEDS_ATTENTION: [],
    WAITING: [],
    IN_PROGRESS: [],
    COMPLETED: [],
  };
  for (const item of items) grouped[resolve(item).inboxBucket].push(item);
  return grouped;
}

export function evidenceProcessingFromProgress(progress: number, outcome: 'working' | 'ready' | 'retry' | 'recapture'): EvidenceProcessingPhase | 'READY' {
  if (outcome === 'ready') return 'READY';
  if (outcome === 'retry') return 'FAILED_RETRY';
  if (outcome === 'recapture') return 'FAILED_RECAPTURE';
  return progress >= 0.55 ? 'SECURING' : 'UPLOADING';
}

export function captureTypeForAction(kind: UxPrimaryActionKind | UxSecondaryActionKind | undefined): EvidenceType | null {
  switch (kind) {
    case 'START_PACKING': return 'PACKING_VIDEO';
    case 'RECORD_SEAL': return 'SHIPPING_LABEL';
    case 'RECORD_ARRIVAL': return 'DELIVERY_PHOTO';
    case 'RECORD_UNBOXING': return 'UNBOXING_VIDEO';
    case 'RECORD_RETURN_PACKING': return 'RETURN_PACKING_VIDEO';
    case 'RECORD_RETURN_SEAL': return 'RETURN_SHIPPING_LABEL';
    case 'RECORD_RETURN_UNBOXING': return 'RETURN_UNBOXING_VIDEO';
    default: return null;
  }
}

export function actionOutcomeCopy(kind: UxPrimaryActionKind, next: NextRequiredAction): {
  working: string;
  succeeded: string;
  nextStep: string;
} {
  const nextStep = next.noActionRequired ? next.headline : (next.primaryAction?.label ? `${next.headline}. ${next.instruction}` : next.headline);
  switch (kind) {
    case 'CONFIRM_TERMS':
      return {
        working: 'Confirming…',
        succeeded: 'Confirmed ✓',
        nextStep: next.humanState === 'READY_TO_PACK'
          ? 'The buyer confirmed. You can start packing.'
          : next.noActionRequired
            ? `Waiting for ${next.waitingOnName ?? 'the other participant'}.`
            : nextStep,
      };
    case 'START_PACKING':
      return { working: 'Opening camera…', succeeded: 'Packing video saved ✓', nextStep };
    case 'RECORD_SEAL':
      return { working: 'Opening camera…', succeeded: 'Package captured ✓', nextStep };
    case 'RECORD_ARRIVAL':
      return { working: 'Opening camera…', succeeded: 'Package captured ✓', nextStep };
    case 'RECORD_UNBOXING':
      return { working: 'Opening camera…', succeeded: 'Unboxing saved ✓', nextStep };
    case 'ADD_SHIPMENT':
      return { working: 'Saving tracking…', succeeded: 'Tracking added ✓', nextStep: "You're done for now. We'll take it from here." };
    case 'CONFIRM_HANDOFF':
      return { working: 'Confirming handoff…', succeeded: 'Handoff confirmed ✓', nextStep };
    case 'COMPLETE_TRANSACTION':
      return { working: 'Finishing…', succeeded: 'PackProof complete ✓', nextStep };
    case 'AUTHORIZE_RETURN':
      return { working: 'Authorizing return…', succeeded: 'Return authorized ✓', nextStep };
    case 'ADD_RETURN_SHIPMENT':
      return { working: 'Saving tracking…', succeeded: 'Tracking added ✓', nextStep };
    case 'COMPLETE_RETURN':
      return { working: 'Finishing…', succeeded: 'Return complete ✓', nextStep };
    default:
      return { working: 'Working…', succeeded: 'Done ✓', nextStep };
  }
}

export function orderLabel(transaction: PackProofTransaction): string | null {
  const source = transaction.source;
  if (source && 'externalOrderId' in source && source.externalOrderId) return `Order #${source.externalOrderId}`;
  return null;
}

export const DIRECT_CAPTURE_ACTIONS = new Set<UxPrimaryActionKind>([
  'START_PACKING',
  'RECORD_SEAL',
  'RECORD_ARRIVAL',
  'RECORD_UNBOXING',
]);

export const PACK_SESSION_ACTIONS = new Set<UxPrimaryActionKind>([
  'START_PACKING',
  'RECORD_SEAL',
  'RECORD_RETURN_PACKING',
  'RECORD_RETURN_SEAL',
]);

export const CAMERA_SESSION_ACTIONS = new Set<UxPrimaryActionKind>([
  'RECORD_ARRIVAL',
  'RECORD_UNBOXING',
  'RECORD_RETURN_UNBOXING',
]);

export function displayCarrierName(code?: string | null): string {
  const key = (code ?? '').toLowerCase();
  if (key.includes('ups') && !key.includes('usps')) return 'UPS';
  if (key.includes('usps')) return 'USPS';
  if (key.includes('fedex')) return 'FedEx';
  if (key.includes('dhl')) return 'DHL';
  return code ? code.toUpperCase() : '';
}

export function groupHomeInbox<T>(
  items: T[],
  resolve: (item: T) => NextRequiredAction,
): { needsAttention: T[]; waiting: T[] } {
  const grouped = groupByInboxBucket(items, resolve);
  return {
    needsAttention: grouped.NEEDS_ATTENTION,
    waiting: [...grouped.WAITING, ...grouped.IN_PROGRESS],
  };
}

export function groupLibrary<T>(
  items: T[],
  resolve: (item: T) => NextRequiredAction,
): { active: T[]; completed: T[] } {
  const grouped = groupByInboxBucket(items, resolve);
  return {
    active: [...grouped.NEEDS_ATTENTION, ...grouped.WAITING, ...grouped.IN_PROGRESS],
    completed: grouped.COMPLETED,
  };
}

export { otherLabel, roleOf as roleFromViewer };
