import { useEffect, useState } from 'react';
import { subscribePendingIntakes, type PendingIntakeRecord } from '@/lib/api';

export function usePendingIntakes(uid?: string) {
  const [state, setState] = useState<{ uid?: string; items: PendingIntakeRecord[]; loading: boolean; error: Error | null }>({ items: [], loading: true, error: null });
  useEffect(() => {
    if (!uid) return;
    return subscribePendingIntakes(
      uid,
      (items) => setState({ uid, items, loading: false, error: null }),
      (error) => setState({ uid, items: [], loading: false, error }),
    );
  }, [uid]);
  if (!uid) return { items: [], loading: false, error: null };
  if (state.uid !== uid) return { items: [], loading: true, error: null };
  return { items: state.items, loading: state.loading, error: state.error };
}
