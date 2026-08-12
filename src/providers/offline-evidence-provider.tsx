import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { startAutomaticEvidenceSync, subscribeQueuedEvidenceStatus, syncEvidenceQueue } from '@/lib/offline-evidence-queue';
import { useAuth } from '@/providers/auth-provider';

type OfflineEvidenceContextValue = {
  queuedCount: number;
  attentionCount: number;
  syncNow: () => Promise<void>;
};

const OfflineEvidenceContext = createContext<OfflineEvidenceContextValue>({ queuedCount: 0, attentionCount: 0, syncNow: async () => undefined });

export function OfflineEvidenceProvider({ children }: PropsWithChildren) {
  const { user, loading } = useAuth();
  const [queuedCount, setQueuedCount] = useState(0);
  const [attentionCount, setAttentionCount] = useState(0);
  useEffect(() => {
    const unsubscribeCount = subscribeQueuedEvidenceStatus(user?.uid ?? null, (status) => {
      setQueuedCount(status.queuedCount);
      setAttentionCount(status.attentionCount);
    });
    const stopSync = !loading && user ? startAutomaticEvidenceSync() : () => undefined;
    return () => { unsubscribeCount(); stopSync(); };
  }, [loading, user]);
  const value = useMemo(() => ({ queuedCount, attentionCount, syncNow: async () => { await syncEvidenceQueue(); } }), [attentionCount, queuedCount]);
  return <OfflineEvidenceContext.Provider value={value}>{children}</OfflineEvidenceContext.Provider>;
}

export const useOfflineEvidence = () => useContext(OfflineEvidenceContext);
