import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { presentProof, type CanonicalProofLike, type ProofPresentation } from '@packproof/ux';
import { getPassport } from '../api';
import { QrPanel } from '../QrPanel';

export function PassportPage() {
  const { id = '' } = useParams();
  const [passport, setPassport] = useState<ProofPresentation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void getPassport(id)
      .then((result) => { if (!cancelled) setPassport(presentProof(result.data as CanonicalProofLike)); })
      .catch((caught: unknown) => { if (!cancelled) setError(caught instanceof Error ? caught.message : 'Proof is not available yet.'); });
    return () => { cancelled = true; };
  }, [id]);

  return (
    <>
      <p className="eyebrow">Proof</p>
      <h1>{passport?.identity.displayId ?? 'Proof'}</h1>
      <p className="lede">This screen renders canonical Proof JSON. It does not assemble a Proof in the browser.</p>
      {error ? <article className="card"><h2>Not available yet</h2><p>{error}</p></article> : null}
      {passport ? (
        <div className="stack">
          <article className="card">
            <h2>{passport.integrity.banner.replaceAll('_', ' ')}</h2>
            <p>{passport.integrity.summary}</p>
            <p className="meta">{passport.integrity.meaning}</p>
          </article>
          <article className="card">
            <h2>Transaction</h2>
            <p>Platform: {passport.transaction.platform.value ?? 'NOT AVAILABLE'}</p>
            <p>Order: {passport.transaction.externalOrderId.value ?? 'NOT AVAILABLE'}</p>
            <p>Date: {passport.transaction.transactionDate.value ?? 'NOT AVAILABLE'}</p>
            <p>Expected item: {passport.items[0]?.expected.title.value ?? 'NOT AVAILABLE'}</p>
          </article>
          <article className="card">
            <h2>Expected ↔ observed</h2>
            <p className="meta">{passport.comparisonFootnote}</p>
            {passport.items[0]?.comparisons.map((item) => (
              <p key={item.attribute}>{item.attribute}: {item.result}</p>
            ))}
          </article>
          <article className="card">
            <h2>Evidence available</h2>
            {passport.evidenceInventory.map((entry) => (
              <span className="chip" key={entry.category}>{entry.category.replaceAll('_', ' ')} · {entry.state.replaceAll('_', ' ')}</span>
            ))}
          </article>
          <article className="card">
            <h2>Fulfillment</h2>
            <p>Packing: {passport.fulfillment.packingArtifactId ?? 'NOT AVAILABLE'}</p>
            <p>Seal: {passport.fulfillment.sealArtifactId ?? 'NOT AVAILABLE'}</p>
            <p>Label: {passport.fulfillment.labelArtifactId ?? 'NOT AVAILABLE'}</p>
            <p>Tracking observed: {passport.fulfillment.trackingObserved.value ?? 'NOT AVAILABLE'}</p>
          </article>
          <article className="card">
            <p className="meta">The QR encodes the verification URL. It does not grant access. Sign-in is still required for PII.</p>
            {passport.identity.verificationUrl ? <QrPanel value={passport.identity.qrPayload || passport.identity.verificationUrl} /> : null}
            <p className="hash">{passport.identity.verificationUrl}</p>
          </article>
          <p className="meta">{passport.pageOneFooter}</p>
          <p className="meta">{passport.limitations.humanReviewDisclaimer}</p>
        </div>
      ) : null}
    </>
  );
}
