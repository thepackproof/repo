import { createContext, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { startAutomaticEvidenceSync, subscribeQueuedEvidence, syncEvidenceQueue, type QueuedEvidence } from '@/lib/offline-evidence-queue';
import { classifyQueueAttentionReason, type QueueAttentionReason } from '@/lib/queue-attention';
import { useAuth } from '@/providers/auth-provider';
import type { EvidenceResumeObservation } from '@/lib/ux-flow';

type OfflineEvidenceContextValue = {
  queuedCount: number;
  attentionCount: number;
  attentionReason: QueueAttentionReason | null;
  items: EvidenceResumeObservation[];
  syncNow: () => Promise<void>;
  retryAttention: () => Promise<void>;
};

const OfflineEvidenceContext = createContext<OfflineEvidenceContextValue>({
  queuedCount: 0,
  attentionCount: 0,
  attentionReason: null,
  items: [],
  syncNow: async () => undefined,
  retryAttention: async () => undefined,
});

function toObservation(item: QueuedEvidence): EvidenceResumeObservation {
  return {
    transactionId: item.transactionId,
    state: item.state,
    lastErrorClass: item.lastErrorClass,
    lastError: item.lastError,
    uploadId: item.uploadId,
  };
}

export function OfflineEvidenceProvider({ children }: PropsWithChildren) {
  const { user, loading } = useAuth();
  const [queuedCount, setQueuedCount] = useState(0);
  const [attentionCount, setAttentionCount] = useState(0);
  const [attentionReason, setAttentionReason] = useState<QueueAttentionReason | null>(null);
  const [items, setItems] = useState<EvidenceResumeObservation[]>([]);
  useEffect(() => {
    const unsubscribe = subscribeQueuedEvidence(user?.uid ?? null, (queued, unreadableIds) => {
      const terminal = queued.filter((item) => item.state === 'FAILED_TERMINAL');
      setItems(queued.map(toObservation));
      setQueuedCount(queued.filter((item) => item.state !== 'FAILED_TERMINAL').length);
      setAttentionCount(terminal.length + unreadableIds.length);
      setAttentionReason(unreadableIds.length
        ? 'LOCAL_CIPHERTEXT_UNREADABLE'
        : terminal.length ? classifyQueueAttentionReason(terminal[0]!.lastError) : null);
    });
    const stopSync = !loading && user ? startAutomaticEvidenceSync() : () => undefined;
    return () => { unsubscribe(); stopSync(); };
  }, [loading, user]);
  const value = useMemo(() => ({
    queuedCount,
    attentionCount,
    attentionReason,
    items,
    syncNow: async () => { await syncEvidenceQueue(); },
    retryAttention: async () => { await syncEvidenceQueue({ retryTerminal: true }); },
  }), [attentionCount, attentionReason, items, queuedCount]);
  return <OfflineEvidenceContext.Provider value={value}>{children}</OfflineEvidenceContext.Provider>;
}

export const useOfflineEvidence = () => useContext(OfflineEvidenceContext);
