import { useEffect, useState } from 'react';
import { getHome, type PortalTransaction } from '../api';
import { useAuth } from '../auth';
import { HomeQueue } from '../TaskCard';

export function HomePage() {
  const { user } = useAuth();
  const [items, setItems] = useState<PortalTransaction[]>([]);
  const [viewerId, setViewerId] = useState(user?.uid ?? '');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getHome()
      .then((result) => {
        if (cancelled) return;
        setItems(result.data.transactions);
        setViewerId(result.data.viewerId);
      })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load Home.'); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <p className="eyebrow">Home</p>
      <h1>What needs you?</h1>
      <p className="lede">Home is a task queue. One next action per PackProof. Capture happens on your phone; the browser stays the workspace.</p>
      {error ? <p className="error">{error}</p> : null}
      <HomeQueue items={items} viewerId={viewerId} />
    </>
  );
}
