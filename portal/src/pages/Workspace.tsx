import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useOutletContext, useParams } from 'react-router-dom';
import { CAPTURE_PRIMARY_ACTIONS } from '@packproof/ux';
import { getTimeline, getTransaction, listEvidence, type PortalTransaction } from '../api';
import { useAuth } from '../auth';
import { workspaceFromPortal } from '../workspace';

export function WorkspacePage() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const [item, setItem] = useState<PortalTransaction | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getTransaction(id)
      .then((result) => { if (!cancelled) setItem(result.data); })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Could not load this PackProof.'); });
    return () => { cancelled = true; };
  }, [id]);

  if (error) return <p className="error">{error}</p>;
  if (!item || !user) return <p className="meta">Loading…</p>;

  const workspace = workspaceFromPortal(item, user.uid);
  const next = workspace.nextAction;
  const captureOnPhone = Boolean(next.primaryAction && CAPTURE_PRIMARY_ACTIONS.has(next.primaryAction.kind));

  return (
    <>
      <p className="eyebrow">{next.humanStateLabel}</p>
      <h1>{item.title}</h1>
      <p className="lede">{next.headline} {next.instruction}</p>
      <div className="row">
        {captureOnPhone ? <Link className="btn" to={`/packproofs/${item.id}/handoff`}>Continue on phone</Link> : null}
        {workspace.proof.availability === 'AVAILABLE' ? <Link className="btn secondary" to={`/packproofs/${item.id}/proof`}>View Proof</Link> : null}
      </div>
      <nav className="tabs" aria-label="Workspace">
        <NavLink to={`/packproofs/${item.id}`} end>Overview</NavLink>
        <NavLink to={`/packproofs/${item.id}/activity`}>Activity</NavLink>
        <NavLink to={`/packproofs/${item.id}/evidence`}>Evidence</NavLink>
        <NavLink to={`/packproofs/${item.id}/proof`}>Proof</NavLink>
      </nav>
      <Outlet context={{ item, viewerId: user.uid }} />
    </>
  );
}

export function WorkspaceOverview() {
  const { item, viewerId } = useOutletContext<{ item: PortalTransaction; viewerId: string }>();
  const next = workspaceFromPortal(item, viewerId).nextAction;
  return (
    <div className="stack">
      <article className="card">
        <h2>Status</h2>
        <p>{next.description}</p>
        <p className="meta">{item.source?.platform} {item.source?.externalOrderId ? `• Order ${item.source.externalOrderId}` : ''}</p>
      </article>
    </div>
  );
}

export function WorkspaceActivity() {
  const { id = '' } = useParams();
  const [events, setEvents] = useState<Array<{ id: string; type: string; summary: string; occurredAt: string }>>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void getTimeline(id)
      .then((result) => setEvents(result.data))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load activity.'));
  }, [id]);
  return (
    <div className="stack">
      {error ? <p className="error">{error}</p> : null}
      {events.map((event) => (
        <article className="card" key={event.id}>
          <h2>{event.summary || event.type}</h2>
          <p className="meta">{event.occurredAt}</p>
        </article>
      ))}
      {!events.length && !error ? <p className="meta">No activity yet.</p> : null}
    </div>
  );
}

export function WorkspaceEvidence() {
  const { id = '' } = useParams();
  const [artifacts, setArtifacts] = useState<Array<{
    id: string;
    type: string;
    status: string;
    sha256: string | null;
    workflowReady: boolean;
    finalizedAt: string | null;
  }>>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    void listEvidence(id)
      .then((result) => setArtifacts(result.data))
      .catch((caught: unknown) => setError(caught instanceof Error ? caught.message : 'Could not load evidence metadata.'));
  }, [id]);
  return (
    <div className="stack">
      {error ? <p className="error">{error}</p> : null}
      <article className="card">
        <h2>Evidence inventory</h2>
        <p>This list is server metadata. Native Storage locations are never shown. Authorized media streaming is a later slice.</p>
      </article>
      {artifacts.map((item) => (
        <article className="card" key={item.id}>
          <h2>{item.type.replaceAll('_', ' ')}</h2>
          <p className="meta">{item.status.replaceAll('_', ' ')} · {item.workflowReady ? 'workflow ready' : 'not workflow ready'}</p>
          {item.finalizedAt ? <p className="meta">Finalized {item.finalizedAt}</p> : null}
          <p className="hash">{item.sha256 ?? 'Hash not available'}</p>
        </article>
      ))}
      {!artifacts.length && !error ? <p className="meta">No evidence artifacts yet.</p> : null}
    </div>
  );
}
