// GENERATED FROM shared/ux. Do not edit. Run `node scripts/sync-ux-to-functions.mjs`.
/**
 * Canonical Transaction Workspace Projection.
 * Presentation layers consume this object. They do not assemble workflow truth.
 */
import {
  ABSENT_PROTOCOL,
  proofCanBeViewed,
  resolveNextRequiredAction,
  viewerRole,
  type ConsumerState,
  type EvidenceProcessingPhase,
  type HumanState,
  type NextRequiredAction,
  type PackageSealProtocolStatus,
  type PackProofTransaction,
  type ParticipantRole,
  type ProofAvailability,
  type ReturnPassport,
  type TransactionStatus,
} from './next-action';

export const WORKSPACE_PROJECTION_VERSION = '1.0.0';

export type WorkspaceEvidenceProcessingState =
  | 'IDLE'
  | 'LOCAL_PENDING'
  | 'UPLOADING'
  | 'FINALIZING'
  | 'ATTENTION_REQUIRED';

export type TransactionWorkspaceDisplay = {
  title: string;
  priceMinor: number;
  currency: string;
};

export type TransactionWorkspaceProjectionV1 = {
  schemaVersion: 1;
  projectionVersion: typeof WORKSPACE_PROJECTION_VERSION;
  transactionId: string;
  sourceTransactionRevision: string;
  viewer: {
    actorId: string;
    role: ParticipantRole;
  };
  lifecycle: {
    transactionStatus: TransactionStatus;
    humanState: HumanState;
    consumerState: ConsumerState;
  };
  protocol: PackageSealProtocolStatus;
  evidenceProcessing: {
    state: WorkspaceEvidenceProcessingState;
    pendingCount: number;
  };
  nextAction: NextRequiredAction;
  proof: {
    availability: ProofAvailability;
    passportId: string | null;
    displayId: string | null;
  };
  returnWorkflow: {
    returnPassportId: string;
    status: string;
  } | null;
  display: TransactionWorkspaceDisplay;
  generatedAt: string;
};

export type WorkspaceProjectionInput = {
  transaction: PackProofTransaction;
  viewerId: string;
  protocol: PackageSealProtocolStatus;
  proof: {
    availability: ProofAvailability;
    passportId: string | null;
    displayId: string | null;
  };
  returnPassport?: Pick<
    ReturnPassport,
    'id' | 'status' | 'initiatedBy' | 'returningParticipantId' | 'recipientId' | 'completedBy' | 'updatedAt'
  > | null;
  returnProtocol?: PackageSealProtocolStatus | null;
  otherPartyName?: string | null;
  inviteSentAt?: PackProofTransaction['createdAt'];
  evidenceProcessing?: { phase: EvidenceProcessingPhase } | null;
  pendingCount?: number;
  generatedAt: string;
};

export function sourceTransactionRevisionOf(value: PackProofTransaction['updatedAt']): string {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.toDate === 'function') {
    return value.toDate().toISOString();
  }
  if (value && typeof value === 'object' && typeof value.seconds === 'number') {
    return new Date(value.seconds * 1000).toISOString();
  }
  return '';
}

export function evidenceProcessingStateFromPhase(
  phase: EvidenceProcessingPhase | null | undefined,
): WorkspaceEvidenceProcessingState {
  if (phase === 'UPLOADING') return 'UPLOADING';
  if (phase === 'SECURING') return 'FINALIZING';
  if (phase === 'FAILED_RETRY') return 'LOCAL_PENDING';
  if (phase === 'FAILED_RECAPTURE') return 'ATTENTION_REQUIRED';
  return 'IDLE';
}

export function projectTransactionWorkspace(input: WorkspaceProjectionInput): TransactionWorkspaceProjectionV1 {
  const nextAction = resolveNextRequiredAction({
    transaction: input.transaction,
    viewerId: input.viewerId,
    protocol: input.protocol,
    proof: { availability: input.proof.availability },
    returnPassport: input.returnPassport,
    returnProtocol: input.returnPassport ? (input.returnProtocol ?? ABSENT_PROTOCOL) : null,
    otherPartyName: input.otherPartyName,
    inviteSentAt: input.inviteSentAt,
    evidenceProcessing: input.evidenceProcessing,
  });
  return {
    schemaVersion: 1,
    projectionVersion: WORKSPACE_PROJECTION_VERSION,
    transactionId: input.transaction.id,
    sourceTransactionRevision: sourceTransactionRevisionOf(input.transaction.updatedAt),
    viewer: {
      actorId: input.viewerId,
      role: viewerRole(input.transaction, input.viewerId),
    },
    lifecycle: {
      transactionStatus: input.transaction.status,
      humanState: nextAction.humanState,
      consumerState: nextAction.consumerState,
    },
    protocol: input.protocol,
    evidenceProcessing: {
      state: evidenceProcessingStateFromPhase(input.evidenceProcessing?.phase),
      pendingCount: input.pendingCount ?? 0,
    },
    nextAction: {
      ...nextAction,
      passportReady: proofCanBeViewed(input.proof.availability),
    },
    proof: {
      availability: input.proof.availability,
      passportId: input.proof.passportId,
      displayId: input.proof.displayId,
    },
    returnWorkflow: input.returnPassport && !['COMPLETED', 'CANCELLED'].includes(input.returnPassport.status)
      ? { returnPassportId: input.returnPassport.id, status: input.returnPassport.status }
      : null,
    display: {
      title: input.transaction.title,
      priceMinor: input.transaction.priceMinor,
      currency: input.transaction.currency,
    },
    generatedAt: input.generatedAt,
  };
}
