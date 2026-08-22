// GENERATED FROM shared/ux. Do not edit. Run `node scripts/sync-ux-to-functions.mjs`.
export {
  ABSENT_PROTOCOL,
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
  integrityBannerLabel,
  orderLabel,
  otherLabel,
  proofCanBeViewed,
  resolveNextRequiredAction,
  roleFromViewer,
  viewerRole,
} from './next-action';

export {
  WORKSPACE_PROJECTION_VERSION,
  evidenceProcessingStateFromPhase,
  projectTransactionWorkspace,
  sourceTransactionRevisionOf,
} from './workspace-projection';

export type {
  ActionRequiredBy,
  ConsumerState,
  DateLike,
  EvidenceProcessingPhase,
  EvidenceType,
  HumanState,
  InboxBucket,
  NextRequiredAction,
  PackageSealProtocolStatus,
  PackProofTransaction,
  ParticipantRole,
  ProgressStage,
  ProgressStep,
  ProgressStepState,
  ProofAvailability,
  ReturnPassport,
  TransactionStatus,
  UxAction,
  UxFlowInput,
  UxPrimaryActionKind,
  UxSecondaryActionKind,
  WaitingReason,
} from './next-action';

export type {
  TransactionWorkspaceDisplay,
  TransactionWorkspaceProjectionV1,
  WorkspaceEvidenceProcessingState,
  WorkspaceProjectionInput,
} from './workspace-projection';
