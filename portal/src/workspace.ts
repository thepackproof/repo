import { projectTransactionWorkspace, type TransactionWorkspaceProjectionV1 } from '@packproof/ux';
import { toUxTransaction, type PortalTransaction } from './api';

export function workspaceFromPortal(item: PortalTransaction, viewerId: string): TransactionWorkspaceProjectionV1 {
  return projectTransactionWorkspace({
    transaction: toUxTransaction(item),
    viewerId,
    protocol: item.protocol,
    proof: item.proof,
    generatedAt: item.updatedAt,
  });
}
