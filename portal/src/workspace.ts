import type { TransactionWorkspaceProjectionV1 } from '@packproof/ux';
import type { PortalTransaction } from './api';

export function workspaceOf(item: PortalTransaction): TransactionWorkspaceProjectionV1 {
  return item.workspace;
}
