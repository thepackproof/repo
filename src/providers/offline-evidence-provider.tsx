import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { startAutomaticEvidenceSync, subscribeQueuedEvidenceStatus, syncEvidenceQueue } from '@/lib/offline-evidence-queue';
import type { QueueAttentionReason } from '@/lib/queue-attention';
import { useAuth } from '@/providers/auth-provider';

type OfflineEvidenceContextValue = {
  queuedCount: number;
  attentionCount: number;
  attentionReason: QueueAttentionReason | null;
  syncNow: () => Promise<void>;
  retryAttention: () => Promise<void>;
};

const OfflineEvidenceContext = createContext<OfflineEvidenceContextValue>({ queuedCount: 0, attentionCount: 0, attentionReason: null, syncNow: async () => undefined, retryAttention: async () => undefined });

export function OfflineEvidenceProvider({ children }: PropsWithChildren) {
  const { user, loading } = useAuth();
  const [queuedCount, setQueuedCount] = useState(0);
  const [attentionCount, setAttentionCount] = useState(0);
  const [attentionReason, setAttentionReason] = useState<QueueAttentionReason | null>(null);
  useEffect(() => {
    const unsubscribeCount = subscribeQueuedEvidenceStatus(user?.uid ?? null, (status) => {
      setQueuedCount(status.queuedCount);
      setAttentionCount(status.attentionCount);
      setAttentionReason(status.attentionReason);
    });
    const stopSync = !loading && user ? startAutomaticEvidenceSync() : () => undefined;
    return () => { unsubscribeCount(); stopSync(); };
  }, [loading, user]);
  const value = useMemo(() => ({
    queuedCount,
    attentionCount,
    attentionReason,
    syncNow: async () => { await syncEvidenceQueue(); },
    retryAttention: async () => { await syncEvidenceQueue({ retryTerminal: true }); },
  }), [attentionCount, attentionReason, queuedCount]);
  return <OfflineEvidenceContext.Provider value={value}>{children}</OfflineEvidenceContext.Provider>;
}

export const useOfflineEvidence = () => useContext(OfflineEvidenceContext);
