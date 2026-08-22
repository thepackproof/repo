import { useEffect, useMemo, useState } from 'react';
import { callFunction } from '@/lib/api';
import type { TransactionWorkspaceProjectionV1 } from '@/lib/ux-flow';
import type { PackProofTransaction } from '@/types/models';

type WorkspaceListResponse = {
  object: 'transaction_workspace_list';
  schemaVersion: 1;
  workspaces: TransactionWorkspaceProjectionV1[];
};

type WorkspaceResponse = {
  object: 'transaction_workspace';
} & TransactionWorkspaceProjectionV1;

export function useWorkspaces(uid: string | undefined, items: readonly PackProofTransaction[]) {
  const [workspaces, setWorkspaces] = useState<Record<string, TransactionWorkspaceProjectionV1>>({});
  const revision = items.map((item) => `${item.id}:${String(item.updatedAt)}`).join('|');
  const ids = useMemo(() => items.map((item) => item.id), [revision]);

  useEffect(() => {
    if (!uid || !ids.length) return;
    let cancelled = false;
    void callFunction<{ transactionIds: string[] }, WorkspaceListResponse>('getMyTransactionWorkspaces', { transactionIds: ids })
      .then((result) => {
        if (cancelled) return;
        const next: Record<string, TransactionWorkspaceProjectionV1> = {};
        for (const workspace of result.workspaces) next[workspace.transactionId] = workspace;
        setWorkspaces(next);
      })
      .catch(() => {
        if (!cancelled) setWorkspaces({});
      });
    return () => { cancelled = true; };
  }, [uid, revision, ids]);

  return workspaces;
}

export function useWorkspace(transactionId?: string, revision?: string) {
  const [workspace, setWorkspace] = useState<TransactionWorkspaceProjectionV1 | null>(null);
  useEffect(() => {
    if (!transactionId) return;
    let cancelled = false;
    void callFunction<{ transactionId: string }, WorkspaceResponse>('getMyTransactionWorkspace', { transactionId })
      .then((result) => {
        if (cancelled) return;
        setWorkspace(result);
      })
      .catch(() => {
        if (!cancelled) setWorkspace(null);
      });
    return () => { cancelled = true; };
  }, [transactionId, revision]);
  return workspace;
}

/** @deprecated Use useWorkspaces. */
export const useWorkspaceSlices = useWorkspaces;
/** @deprecated Use useWorkspace. */
export const useWorkspaceSlice = useWorkspace;
