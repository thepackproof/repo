import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { resolveNextRequiredAction } from '@packproof/ux';
import { listTransactions, toUxFlowInput, type PortalTransaction } from '../api';

export function ActivityPage() {
  const [items, setItems] = useState<PortalTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listTransactions()
      .then((result) => { if (!cancelled) setItems(result.data); })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load activity.'); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <p className="eyebrow">Activity</p>
      <h1>Activity</h1>
      <p className="lede">This is the same PackProof timeline source as the mobile app, not a second event log.</p>
      {error ? <p className="error">{error}</p> : null}
      <section className="stack">
        {items.map((item) => {
          const next = resolveNextRequiredAction(toUxFlowInput(item));
          return (
            <Link key={item.id} className="card" to={`/packproofs/${item.id}/activity`} style={{ textDecoration: 'none', color: 'inherit' }}>
              <h2>{item.title}</h2>
              <p className="meta">{next.headline}</p>
              <p className="meta">Updated {item.updatedAt}</p>
            </Link>
          );
        })}
      </section>
      {!items.length && !error ? <p className="meta">No PackProof activity yet.</p> : null}
    </>
  );
}
