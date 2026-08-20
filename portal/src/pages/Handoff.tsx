import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CAPTURE_PRIMARY_ACTIONS, resolveNextRequiredAction } from '@packproof/ux';
import { createMobileHandoff, getTransaction, toUxFlowInput, type PortalMobileHandoff, type PortalTransaction } from '../api';
import { useAuth } from '../auth';
import { QrPanel } from '../QrPanel';

export function HandoffPage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [item, setItem] = useState<PortalTransaction | null>(null);
  const [handoff, setHandoff] = useState<PortalMobileHandoff | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getTransaction(id)
      .then(async (result) => {
        if (cancelled || !user) return;
        setItem(result.data);
        const next = resolveNextRequiredAction(toUxFlowInput(result.data));
        const action = next.primaryAction?.kind;
        if (!action || !CAPTURE_PRIMARY_ACTIONS.has(action)) {
          setMessage(next.headline || 'Nothing needs phone capture on this PackProof right now.');
          return;
        }
        const minted = await createMobileHandoff(result.data.id, action);
        if (!cancelled) setHandoff(minted.data);
      })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not start phone capture.'); });
    return () => { cancelled = true; };
  }, [id, user]);

  return (
    <>
      <p className="eyebrow">Native capture</p>
      <h1>Continue on your phone</h1>
      <p className="lede">Packing and unboxing evidence is acquired by the PackProof app. A webcam upload is not the same thing.</p>
      {error ? <p className="error">{error}</p> : null}
      {message ? (
        <article className="card">
          <h2>{item?.title ?? 'PackProof'}</h2>
          <p>{message}</p>
          {item ? <Link className="btn secondary" to={`/packproofs/${item.id}`}>Open workspace</Link> : null}
        </article>
      ) : null}
      {handoff ? (
        <article className="card qr">
          <QrPanel value={handoff.universalLink} />
          <div>
            <h2>{item?.title ?? 'PackProof'}</h2>
            <p>Already have PackProof installed?</p>
            <div className="row">
              <a className="btn" href={handoff.appLink}>Open PackProof</a>
              <a className="btn secondary" href={handoff.storeUrl} rel="noreferrer">Get the app</a>
            </div>
            <p className="hash">{handoff.universalLink}</p>
          </div>
        </article>
      ) : null}
      {!handoff && !message && !error ? <p className="meta">Preparing a phone handoff…</p> : null}
    </>
  );
}
