import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { startAutomaticEvidenceSync, subscribeQueuedEvidenceCount, syncEvidenceQueue } from '@/lib/offline-evidence-queue';
import { useAuth } from '@/providers/auth-provider';

type OfflineEvidenceContextValue = {
  queuedCount: number;
  syncNow: () => Promise<void>;
};

const OfflineEvidenceContext = createContext<OfflineEvidenceContextValue>({ queuedCount: 0, syncNow: async () => undefined });

export function OfflineEvidenceProvider({ children }: PropsWithChildren) {
  const { user, loading } = useAuth();
  const [queuedCount, setQueuedCount] = useState(0);
  useEffect(() => {
    const unsubscribeCount = subscribeQueuedEvidenceCount(user?.uid ?? null, setQueuedCount);
    const stopSync = !loading && user ? startAutomaticEvidenceSync() : () => undefined;
    return () => { unsubscribeCount(); stopSync(); };
  }, [loading, user]);
  const value = useMemo(() => ({ queuedCount, syncNow: async () => { await syncEvidenceQueue(); } }), [queuedCount]);
  return <OfflineEvidenceContext.Provider value={value}>{children}</OfflineEvidenceContext.Provider>;
}

export const useOfflineEvidence = () => useContext(OfflineEvidenceContext);
