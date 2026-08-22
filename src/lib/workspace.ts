import type { TransactionWorkspaceProjectionV1 } from '@/lib/ux-flow';

export type WorkspaceProjection = TransactionWorkspaceProjectionV1;

export function workspaceOf(workspace: TransactionWorkspaceProjectionV1 | null | undefined): TransactionWorkspaceProjectionV1 | null {
  return workspace ?? null;
}
