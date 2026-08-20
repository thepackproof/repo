import { useEffect, useState } from 'react';
import { getHome, type PortalTransaction } from '../api';
import { HomeQueue } from '../TaskCard';

export function HomePage() {
  const [items, setItems] = useState<PortalTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getHome()
      .then((result) => {
        if (cancelled) return;
        setItems(result.data.transactions);
      })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load Home.'); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <p className="eyebrow">Home</p>
      <h1>What needs you?</h1>
      <p className="lede">Home is a task queue, not an analytics dashboard. Capture is an operation on your phone.</p>
      {error ? <p className="error">{error}</p> : null}
      <HomeQueue items={items} />
    </>
  );
}
