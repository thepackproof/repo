import { useEffect, useMemo, useState } from 'react';
import { callFunction } from '@/lib/api';
import type { WorkspaceSlice } from '@/lib/workspace';
import type { PackProofTransaction } from '@/types/models';

type WorkspaceListResponse = {
  object: 'transaction_workspace_list';
  schemaVersion: 1;
  workspaces: WorkspaceSlice[];
};

type WorkspaceSliceResponse = {
  object: 'transaction_workspace_slice';
  schemaVersion: 1;
} & WorkspaceSlice;

export function useWorkspaceSlices(uid: string | undefined, items: readonly PackProofTransaction[]) {
  const [slices, setSlices] = useState<Record<string, WorkspaceSlice>>({});
  const revision = items.map((item) => `${item.id}:${String(item.updatedAt)}`).join('|');
  const ids = useMemo(() => items.map((item) => item.id), [revision]);

  useEffect(() => {
    if (!uid || !ids.length) return;
    let cancelled = false;
    void callFunction<{ transactionIds: string[] }, WorkspaceListResponse>('getMyTransactionWorkspaces', { transactionIds: ids })
      .then((result) => {
        if (cancelled) return;
        const next: Record<string, WorkspaceSlice> = {};
        for (const workspace of result.workspaces) next[workspace.transactionId] = workspace;
        setSlices(next);
      })
      .catch(() => {
        if (!cancelled) setSlices({});
      });
    return () => { cancelled = true; };
  }, [uid, revision, ids]);

  return slices;
}

export function useWorkspaceSlice(transactionId?: string, revision?: string) {
  const [slice, setSlice] = useState<WorkspaceSlice | null>(null);
  useEffect(() => {
    if (!transactionId) return;
    let cancelled = false;
    void callFunction<{ transactionId: string }, WorkspaceSliceResponse>('getMyTransactionWorkspace', { transactionId })
      .then((result) => {
        if (!cancelled) {
          setSlice({
            transactionId: result.transactionId,
            protocol: result.protocol,
            proof: result.proof,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setSlice(null);
      });
    return () => { cancelled = true; };
  }, [transactionId, revision]);
  return slice;
}
