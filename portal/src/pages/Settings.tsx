import { useEffect, useState } from 'react';
import { getSession } from '../api';
import { useAuth } from '../auth';

export function SettingsPage() {
  const { user } = useAuth();
  const [actorId, setActorId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getSession()
      .then((result) => { if (!cancelled) setActorId(result.data.actorId); })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load the portal session.'); });
    return () => { cancelled = true; };
  }, []);

  return (
    <>
      <p className="eyebrow">Account</p>
      <h1>Settings</h1>
      <article className="card">
        <h2>Signed in</h2>
        <p>{user?.email ?? 'PackProof user'}</p>
        <p className="hash">{actorId ?? 'Resolving portal actor…'}</p>
        {error ? <p className="error">{error}</p> : null}
      </article>
      <article className="card">
        <h2>This browser is not a capture device</h2>
        <p>The portal reviews PackProofs, Passports, and activity. Evidence acquisition stays on the native PackProof client in this release.</p>
      </article>
    </>
  );
}
