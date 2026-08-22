import { projectTransactionWorkspace, type PackageSealProtocolStatus, type ProofAvailability, type TransactionWorkspaceProjectionV1 } from '@/lib/ux-flow';
import type { PackProofTransaction, ReturnPassport } from '@/types/models';

export type WorkspaceSlice = {
  transactionId: string;
  protocol: PackageSealProtocolStatus;
  proof: {
    availability: ProofAvailability;
    passportId: string | null;
    displayId: string | null;
  };
};

export function workspaceFromSlice(
  transaction: PackProofTransaction,
  viewerId: string,
  slice: WorkspaceSlice,
  extras: {
    returnPassport?: Pick<ReturnPassport, 'id' | 'status' | 'initiatedBy' | 'returningParticipantId' | 'recipientId' | 'completedBy' | 'updatedAt'> | null;
    returnProtocol?: PackageSealProtocolStatus | null;
    inviteSentAt?: PackProofTransaction['createdAt'];
    generatedAt?: string;
  } = {},
): TransactionWorkspaceProjectionV1 {
  return projectTransactionWorkspace({
    transaction,
    viewerId,
    protocol: slice.protocol,
    proof: slice.proof,
    returnPassport: extras.returnPassport,
    returnProtocol: extras.returnProtocol,
    inviteSentAt: extras.inviteSentAt,
    generatedAt: extras.generatedAt ?? new Date().toISOString(),
  });
}
