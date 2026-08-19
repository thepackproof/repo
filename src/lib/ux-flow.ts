import type { PackageSealProtocolStatus } from '@/lib/package-seal-protocol';
import type {
  DateLike,
  EvidenceType,
  PackProofTransaction,
  ReturnPassport,
  TransactionStatus,
} from '@/types/models';

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
  | 'OPEN_PASSPORT'
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
  notificationCopy: { title: string; body: string };
  inboxBucket: InboxBucket;
  inboxSentence: string;
  inboxCta: string | null;
  noActionRequired: boolean;
  passportReady: boolean;
  canLeaveWhileProcessing: boolean;
};

export type UxFlowInput = {
  transaction: PackProofTransaction;
  viewerId: string;
  protocol?: PackageSealProtocolStatus | null;
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
  YOUR_ACTION_REQUIRED: 'YOUR TURN',
  WAITING_ON_BUYER: 'WAITING ON BUYER',
  WAITING_ON_SELLER: 'WAITING ON SELLER',
  READY_TO_PACK: 'READY TO PACK',
  EVIDENCE_PROCESSING: 'SECURING EVIDENCE',
  READY_TO_SHIP: 'READY TO SHIP',
  IN_TRANSIT: 'IN TRANSIT',
  DELIVERY_REVIEW: 'DELIVERY REVIEW',
  COMPLETE: 'COMPLETE',
  CANCELLED: 'CANCELLED',
  CONCERN_OPEN: 'CONCERN OPEN',
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

const EMPTY_PROTOCOL: PackageSealProtocolStatus = {
  hasPackingVideo: false,
  hasSealReference: false,
  hasArrivalPhoto: false,
  hasUnboxingVideo: false,
  sellerReferenceComplete: false,
  buyerArrivalComplete: false,
  outboundComplete: false,
};

const NO_ACTION = "You don't need to do anything right now.";

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

function passportReady(status: TransactionStatus, passportId?: string | null): boolean {
  return Boolean(passportId) || ['PACKED', 'SHIPPED', 'BUYER_REVIEW', 'COMPLETED'].includes(status);
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

type DraftView = Omit<NextRequiredAction, 'humanStateLabel' | 'progressSteps' | 'inboxCta' | 'passportReady' | 'canLeaveWhileProcessing'>;

function finish(
  input: UxFlowInput,
  role: ParticipantRole,
  draft: DraftView,
): NextRequiredAction {
  const status = input.transaction.status;
  const saleType = input.transaction.terms.saleType;
  const ready = passportReady(status, input.transaction.passportId);
  return {
    ...draft,
    humanStateLabel: HUMAN_STATE_LABEL[draft.humanState],
    progressSteps: buildProgressSteps(saleType, draft.progressStage, status),
    inboxCta: draft.primaryAction?.label ?? null,
    passportReady: ready,
    canLeaveWhileProcessing: draft.humanState === 'EVIDENCE_PROCESSING',
    secondaryAction: draft.secondaryAction ?? (ready && draft.primaryAction?.kind !== 'OPEN_PASSPORT'
      ? { kind: 'OPEN_PASSPORT', label: 'View Passport' }
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
    instruction: NO_ACTION,
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
  const protocol = input.returnProtocol ?? EMPTY_PROTOCOL;
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
        headline: 'Ready to pack the return',
        description: 'The return is authorized.',
        instruction: 'Record the item being repacked, sealed, and associated with its return label.',
        nextHappens: 'After the evidence is ready, you can add return tracking.',
        primaryAction: { kind: 'RECORD_RETURN_PACKING', label: 'Start return packing', captureType: 'RETURN_PACKING_VIDEO' },
        progressStage: stage,
        notificationCopy: notify('Ready to pack the return', 'Record the returned item being packed and sealed.'),
        inboxSentence: 'Ready to record return packing evidence.',
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
        headline: 'Finish return packing evidence',
        description: 'Return packing was recorded. Capture the return seal and label next.',
        instruction: 'Record a clear photo of the sealed return label.',
        nextHappens: 'Then you can add return tracking.',
        primaryAction: { kind: 'RECORD_RETURN_SEAL', label: 'Record return seal', captureType: 'RETURN_SHIPPING_LABEL' },
        progressStage: stage,
        lockedExplanation: 'Return shipment can be recorded after packing video and seal evidence are ready.',
        prerequisites: [
          { label: 'Return packing recorded', complete: protocol.hasPackingVideo },
          { label: 'Return seal and label captured', complete: protocol.hasSealReference },
        ],
        notificationCopy: notify('Finish return packing', 'Capture the return seal and label.'),
        inboxSentence: 'Return packing still needs a seal photo.',
      });
    }
    if (returning) {
      return actionView({
        headline: 'Ready to ship the return',
        description: 'Return packing evidence is ready.',
        instruction: 'Add the return carrier and tracking number.',
        nextHappens: `${name} will record the returned package when it arrives.`,
        primaryAction: { kind: 'ADD_RETURN_SHIPMENT', label: 'Add return tracking' },
        progressStage: stage,
        notificationCopy: notify('You can ship the return', 'Add return tracking to finish this step.'),
        inboxSentence: 'Add return tracking to ship the package.',
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
        headline: 'Return arrived',
        description: 'Record the returned package being opened.',
        instruction: 'Start with the sealed return package, then record a continuous unboxing.',
        nextHappens: 'After that, both of you can complete the return passport.',
        primaryAction: { kind: 'RECORD_RETURN_UNBOXING', label: 'Record return unboxing', captureType: 'RETURN_UNBOXING_VIDEO' },
        secondaryAction: { kind: 'MARK_RETURN_RECEIVED', label: 'Mark received without video' },
        progressStage: stage,
        notificationCopy: notify('Return in transit', 'Record the returned package when it arrives.'),
        inboxSentence: 'Record the returned package when it arrives.',
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
      headline: 'Complete the return',
      description: 'The returned package has been recorded.',
      instruction: 'Confirm that the return passport is complete.',
      nextHappens: 'When both of you confirm, the return is finished.',
      primaryAction: { kind: 'COMPLETE_RETURN', label: 'Complete return' },
      progressStage: 'COMPLETE',
      notificationCopy: notify('Your turn', 'Complete the return passport.'),
      inboxSentence: 'Confirm that the return is complete.',
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
    return {
      humanState: 'COMPLETE',
      headline: 'Complete',
      description: 'This PackProof is finished.',
      instruction: 'Your PackProof Passport is ready.',
      nextHappens: 'You can view or share the Passport where permitted.',
      actionRequiredBy: 'NONE',
      primaryAction: { kind: 'OPEN_PASSPORT', label: 'View Passport' },
      secondaryAction: null,
      progressStage: 'COMPLETE',
      waitingReason: 'NONE',
      waitingOnName: null,
      waitingOnTask: null,
      lockedExplanation: null,
      prerequisites: [],
      notificationCopy: notify('PackProof complete', 'Your PackProof Passport is ready.'),
      inboxBucket: 'COMPLETED',
      inboxSentence: 'Your PackProof Passport is ready.',
      noActionRequired: false,
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
      secondaryAction: passportReady(status, transaction.passportId) ? { kind: 'OPEN_PASSPORT', label: 'View Passport' } : null,
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
          headline: 'Invite the buyer',
          description: 'The sale details are saved. The buyer still needs a private invitation.',
          instruction: 'Send the invite so they can review and confirm the transaction details.',
          nextHappens: "We'll notify you when they join.",
          primaryAction: { kind: 'INVITE_BUYER', label: 'Invite buyer' },
          secondaryAction: { kind: 'EDIT_TERMS', label: 'Edit details' },
          progressStage: status === 'DRAFT' ? 'CREATED' : 'TERMS',
          notificationCopy: notify('Invite the buyer', 'Send the invitation so the buyer can confirm the sale details.'),
          inboxSentence: 'Invite the buyer to confirm the transaction details.',
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
      headline: 'Review the sale details',
      description: 'You were invited to this PackProof.',
      instruction: 'Open the invitation, review the details, and confirm them.',
      nextHappens: 'Packing can start after both of you confirm.',
      primaryAction: { kind: 'CONFIRM_TERMS', label: 'Review and confirm terms' },
      progressStage: 'TERMS',
      notificationCopy: notify('Your turn', 'Review the sale details and confirm them.'),
      inboxSentence: 'Review the sale details and confirm them.',
    });
  }

  if (status === 'TERMS_REVIEW') {
    if (!viewerConfirmed) {
      return actionView({
        headline: 'Your turn',
        description: role === 'BUYER'
          ? 'Review the sale details and confirm them.'
          : 'Review and confirm the transaction details.',
        instruction: 'Confirm only if the item, price, and terms are exactly right.',
        nextHappens: buyerConfirmed || sellerConfirmed
          ? 'After you confirm, both of you can move on.'
          : `${name} still needs to confirm after you.`,
        primaryAction: { kind: 'CONFIRM_TERMS', label: 'Review and confirm terms' },
        secondaryAction: role === 'SELLER' ? { kind: 'EDIT_TERMS', label: 'Edit details' } : null,
        progressStage: 'TERMS',
        notificationCopy: notify('Your turn', 'Review the sale details and confirm them.'),
        inboxSentence: role === 'BUYER'
          ? 'Review the sale details and confirm them.'
          : 'Review and confirm the transaction details.',
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
        headline: 'Ready to pack',
        description: 'Both participants confirmed the transaction.',
        instruction: 'Next, record the item being packed, sealed, and associated with its shipping label.',
        nextHappens: 'PackProof will secure the evidence, then you can ship.',
        primaryAction: { kind: 'START_PACKING', label: 'Start packing evidence', captureType: 'PACKING_VIDEO' },
        progressStage: 'PACKING',
        notificationCopy: notify('Both parties confirmed — ready for packing', 'Next, record the item being packed, sealed, and associated with its shipping label.'),
        inboxSentence: 'Ready for packing evidence.',
        inboxBucket: 'NEEDS_ATTENTION',
      });
    }
    return waitingView(input, role, {
      headline: 'Seller is preparing the shipment',
      description: `${name} will pack and seal the item.`,
      nextHappens: "We'll notify you when the package is on the way.",
      waitingReason: 'SELLER_PACKING',
      waitingOnTask: 'pack and seal the item',
      progressStage: 'PACKING',
      lockedExplanation: 'Packing begins after both participants confirm the transaction details.',
      notificationCopy: notify('Both parties confirmed', 'The seller is preparing the shipment. You don\'t need to do anything right now.'),
      inboxSentence: `${name} is preparing the shipment.`,
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
        headline: 'Finish packing evidence',
        description: 'The packing recording is in. Capture the sealed label next.',
        instruction: 'Record a clear photo of the shipping label and seal.',
        nextHappens: 'Then you can add tracking and ship.',
        primaryAction: { kind: 'RECORD_SEAL', label: 'Capture shipping label', captureType: 'SHIPPING_LABEL' },
        progressStage: 'PACKING',
        lockedExplanation: 'Shipping begins after packing video and seal evidence are ready.',
        prerequisites,
        notificationCopy: notify('Finish packing evidence', 'Capture the shipping label and seal, then you can ship.'),
        inboxSentence: 'Packing still needs a shipping-label photo.',
      });
    }
    if (role === 'SELLER') {
      return actionView({
        humanState: 'READY_TO_SHIP',
        headline: 'You can ship the package',
        description: 'Packing evidence is ready.',
        instruction: 'Add the carrier and tracking number.',
        nextHappens: `${name} will record the package when it arrives.`,
        primaryAction: { kind: 'ADD_SHIPMENT', label: 'Add tracking' },
        progressStage: 'SHIPPING',
        prerequisites,
        notificationCopy: notify('Evidence ready', 'You can ship the package. Add tracking to finish this step.'),
        inboxSentence: 'Add tracking to ship the package.',
      });
    }
    return waitingView(input, role, {
      headline: 'Seller is preparing the shipment',
      description: `${name} finished packing evidence and can ship next.`,
      nextHappens: "We'll notify you when the package is on the way.",
      waitingReason: 'SELLER_SHIPMENT',
      waitingOnTask: 'ship the package',
      progressStage: 'SHIPPING',
      notificationCopy: notify('Evidence ready', 'The seller can now ship the package.'),
      inboxSentence: `${name} is getting the package ready to ship.`,
    });
  }

  if (status === 'SHIPPED') {
    if (role === 'BUYER') {
      if (!protocol.hasArrivalPhoto) {
        return actionView({
          humanState: 'DELIVERY_REVIEW',
          headline: 'Delivery review',
          description: 'The package is on the way — record it when it arrives.',
          instruction: 'Photograph the sealed package before opening it.',
          nextHappens: 'Then record a continuous unboxing.',
          primaryAction: { kind: 'RECORD_ARRIVAL', label: 'Record arrival', captureType: 'DELIVERY_PHOTO' },
          secondaryAction: { kind: 'MARK_RECEIVED', label: 'Mark received without video' },
          progressStage: 'DELIVERY',
          notificationCopy: notify('In transit', 'Record the sealed package when it arrives.'),
          inboxSentence: 'Record the sealed package when it arrives.',
        });
      }
      return actionView({
        humanState: 'DELIVERY_REVIEW',
        headline: 'Record unboxing',
        description: 'Arrival photo is in. Next, record opening the package.',
        instruction: 'Keep the opening continuous from sealed package to contents.',
        nextHappens: 'Then you can mark the PackProof complete.',
        primaryAction: { kind: 'RECORD_UNBOXING', label: 'Record unboxing', captureType: 'UNBOXING_VIDEO' },
        secondaryAction: { kind: 'MARK_RECEIVED', label: 'Mark received without video' },
        progressStage: 'DELIVERY',
        notificationCopy: notify('Delivery review', 'Record a continuous unboxing of the arrived package.'),
        inboxSentence: 'Record unboxing of the arrived package.',
      });
    }
    return {
      humanState: 'IN_TRANSIT',
      headline: 'In transit',
      description: `${name} will record the package when it arrives.`,
      instruction: NO_ACTION,
      nextHappens: "We'll notify you after they record delivery.",
      actionRequiredBy: 'BUYER',
      primaryAction: null,
      secondaryAction: null,
      progressStage: 'DELIVERY',
      waitingReason: 'BUYER_DELIVERY',
      waitingOnName: name,
      waitingOnTask: 'record delivery',
      lockedExplanation: null,
      prerequisites: [],
      notificationCopy: notify('In transit', 'The buyer will record the package on arrival.'),
      inboxBucket: 'WAITING',
      inboxSentence: `Waiting for ${name} to record delivery.`,
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
      headline: 'Complete this PackProof',
      description: shipped ? 'Delivery has been recorded.' : 'Both of you confirmed the handoff.',
      instruction: 'Confirm that everything is complete.',
      nextHappens: 'When both of you confirm, your PackProof Passport is ready.',
      primaryAction: { kind: 'COMPLETE_TRANSACTION', label: 'Mark complete' },
      progressStage: 'COMPLETE',
      notificationCopy: notify('Your turn', 'Mark this PackProof complete.'),
      inboxSentence: 'Mark this PackProof complete.',
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
      headline: securing ? 'Securing your evidence' : 'Uploading evidence',
      description: securing
        ? 'PackProof is finishing the evidence record.'
        : 'Your capture is on its way to PackProof.',
      instruction: 'You can leave this screen. PackProof will update when it finishes.',
      nextHappens: 'When processing completes, the next step appears automatically.',
      actionRequiredBy: 'PACKPROOF',
      primaryAction: null,
      secondaryAction: null,
      waitingReason: 'EVIDENCE_PROCESSING',
      waitingOnName: 'PackProof',
      waitingOnTask: securing ? 'secure the evidence record' : 'upload the evidence',
      notificationCopy: notify(securing ? 'Securing evidence' : 'Uploading evidence', 'You can leave the screen. PackProof will update when it finishes.'),
      inboxBucket: 'IN_PROGRESS',
      inboxSentence: securing ? 'PackProof is securing your evidence.' : 'Uploading packing evidence.',
      noActionRequired: true,
    };
  }
  if (processing.phase === 'FAILED_RETRY') {
    return {
      ...view,
      headline: 'Upload paused',
      description: 'The capture is still saved on this device.',
      instruction: 'Retry the upload. You do not need to recapture.',
      nextHappens: 'After the retry succeeds, PackProof will secure the evidence record.',
      lockedExplanation: 'The original capture is still on this device. Do not clear app data or uninstall.',
      notificationCopy: notify('Retry the upload', 'Your capture is saved. Retry the upload — you do not need to recapture.'),
      inboxBucket: 'NEEDS_ATTENTION',
      inboxSentence: 'Retry the evidence upload. You do not need to recapture.',
      noActionRequired: false,
    };
  }
  return {
    ...view,
    headline: 'Capture didn’t go through',
    description: 'PackProof could not use that recording.',
    instruction: 'Record the step again from the start.',
    nextHappens: 'A new capture replaces the failed one.',
    lockedExplanation: 'Recapture this step. A retry of the old file will not work.',
    notificationCopy: notify('Please recapture', 'That evidence could not be used. Record the step again.'),
    inboxBucket: 'NEEDS_ATTENTION',
    inboxSentence: 'Please recapture this step.',
    noActionRequired: false,
  };
}

export function resolveNextRequiredAction(input: UxFlowInput): NextRequiredAction {
  const role = roleOf(input.transaction, input.viewerId);
  const protocol = input.protocol ?? EMPTY_PROTOCOL;
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
        working: 'Confirming terms…',
        succeeded: 'Terms confirmed',
        nextStep: next.humanState === 'READY_TO_PACK'
          ? 'Both parties confirmed — you can now pack the order.'
          : next.noActionRequired
            ? `Waiting for ${next.waitingOnName ?? 'the other participant'}.`
            : nextStep,
      };
    case 'START_PACKING':
    case 'RECORD_SEAL':
    case 'RECORD_ARRIVAL':
    case 'RECORD_UNBOXING':
      return { working: 'Opening capture…', succeeded: 'Ready to capture', nextStep };
    case 'ADD_SHIPMENT':
      return { working: 'Saving shipment…', succeeded: 'Shipment recorded', nextStep: 'The package is in transit.' };
    case 'CONFIRM_HANDOFF':
      return { working: 'Confirming handoff…', succeeded: 'Handoff confirmed', nextStep };
    case 'COMPLETE_TRANSACTION':
      return { working: 'Completing PackProof…', succeeded: 'Completion confirmed', nextStep };
    case 'AUTHORIZE_RETURN':
      return { working: 'Authorizing return…', succeeded: 'Return authorized', nextStep };
    case 'ADD_RETURN_SHIPMENT':
      return { working: 'Saving return shipment…', succeeded: 'Return shipment recorded', nextStep };
    case 'COMPLETE_RETURN':
      return { working: 'Completing return…', succeeded: 'Return completion confirmed', nextStep };
    default:
      return { working: 'Working…', succeeded: 'Done', nextStep };
  }
}

export function orderLabel(transaction: PackProofTransaction): string | null {
  const source = transaction.source;
  if (source && 'externalOrderId' in source && source.externalOrderId) return `Order #${source.externalOrderId}`;
  return null;
}

export { otherLabel, roleOf as roleFromViewer };
