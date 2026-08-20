import { Link } from 'react-router-dom';
import { CAPTURE_PRIMARY_ACTIONS, groupHomeInbox, resolveNextRequiredAction } from '@packproof/ux';
import type { PortalTransaction } from './api';
import { toUxFlowInput } from './api';

export function TaskCard({ item }: { item: PortalTransaction }) {
  const next = resolveNextRequiredAction(toUxFlowInput(item));
  const captureOnPhone = Boolean(next.primaryAction && CAPTURE_PRIMARY_ACTIONS.has(next.primaryAction.kind));
  return (
    <article className="card">
      <p className="eyebrow">{next.humanStateLabel}</p>
      <h2>{item.title}</h2>
      <p className="meta">{[item.source?.platform, item.source?.externalOrderId ? `Order ${item.source.externalOrderId}` : null].filter(Boolean).join(' • ') || next.inboxSentence}</p>
      <p>{next.headline}</p>
      <div className="row" style={{ marginTop: 12 }}>
        {captureOnPhone ? <Link className="btn" to={`/packproofs/${item.id}/handoff`}>Continue on phone</Link> : null}
        {next.proofReady ? <Link className="btn secondary" to={`/packproofs/${item.id}/proof`}>View Proof</Link> : null}
        <Link className="btn ghost" to={`/packproofs/${item.id}`}>Open</Link>
      </div>
    </article>
  );
}

export function HomeQueue({ items }: { items: PortalTransaction[] }) {
  const grouped = groupHomeInbox(items, (item) => resolveNextRequiredAction(toUxFlowInput(item)));
  if (!grouped.needsAttention.length && !grouped.waiting.length) {
    return (
      <div className="card">
        <h2>Nothing needs you</h2>
        <p className="lede">When a PackProof needs packing, review, or a decision, it will show up here.</p>
      </div>
    );
  }
  return (
    <div className="stack">
      {grouped.needsAttention.map((item) => <TaskCard key={item.id} item={item} />)}
      {grouped.waiting.map((item) => <TaskCard key={item.id} item={item} />)}
    </div>
  );
}
