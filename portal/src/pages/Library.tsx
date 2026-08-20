import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { groupLibrary, resolveNextRequiredAction } from '@packproof/ux';
import { listTransactions, toUxTransaction, type PortalTransaction } from '../api';
import { useAuth } from '../auth';

export function LibraryPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<PortalTransaction[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listTransactions()
      .then((result) => { if (!cancelled) setItems(result.data); })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load PackProofs.'); });
    return () => { cancelled = true; };
  }, []);

  const grouped = user ? groupLibrary(items, (item) => resolveNextRequiredAction({
    transaction: toUxTransaction(item),
    viewerId: user.uid,
    protocol: item.protocol,
  })) : { active: [], completed: [] };

  return (
    <>
      <p className="eyebrow">Library</p>
      <h1>PackProofs</h1>
      <p className="lede">Your records. Workflow decisions come from the same Next Action Engine as Android.</p>
      {error ? <p className="error">{error}</p> : null}
      <section className="stack">
        {grouped.active.map((item) => (
          <Link key={item.id} className="card" to={`/packproofs/${item.id}`} style={{ textDecoration: 'none', color: 'inherit' }}>
            <h2>{item.title}</h2>
            <p className="meta">{item.status.replaceAll('_', ' ')}</p>
          </Link>
        ))}
      </section>
      {grouped.completed.length ? (
        <>
          <h1 style={{ marginTop: 36, fontSize: 22 }}>Completed</h1>
          <section className="stack">
            {grouped.completed.map((item) => (
              <Link key={item.id} className="card" to={`/packproofs/${item.id}/passport`} style={{ textDecoration: 'none', color: 'inherit' }}>
                <h2>{item.title}</h2>
                <p className="meta">View Passport</p>
              </Link>
            ))}
          </section>
        </>
      ) : null}
    </>
  );
}
