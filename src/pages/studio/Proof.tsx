import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useAppState } from '../../app/AppState.tsx';
import { getReceipt, listReceipts } from '../../cherry/proof/proof-service.ts';
import { verifyReceipt, type ReceiptVerification } from '../../cherry/proof/proof-verifier.ts';
import type { ProofReceipt } from '../../cherry/proof/proof-model.ts';
import { listArtifactFiles, listArtifactSets } from '../../cherry/artifacts/artifact-service.ts';

export default function Proof() {
  const { receiptId } = useParams<{ receiptId?: string }>();
  const { activeWorkspace } = useAppState();
  const [receipts, setReceipts] = useState<ProofReceipt[]>([]);
  const [selected, setSelected] = useState<ProofReceipt | null>(null);
  const [verification, setVerification] = useState<ReceiptVerification | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!activeWorkspace) return;
    const loaded = await listReceipts(activeWorkspace.id);
    setReceipts(loaded);
    if (receiptId) {
      setSelected((await getReceipt(receiptId)) ?? null);
    } else {
      setSelected(loaded[0] ?? null);
    }
  }, [activeWorkspace, receiptId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!activeWorkspace) {
    return <div className="empty-state"><p className="subhead">Create a workspace first.</p></div>;
  }

  async function handleRecompute() {
    if (!selected) return;
    setError(null);
    // Pull current artifact contents so file hashes can be re-checked too.
    const artifactContents = new Map<string, string>();
    for (const set of await listArtifactSets(selected.workspaceId)) {
      for (const file of await listArtifactFiles(set.id)) {
        artifactContents.set(file.path, file.content);
      }
    }
    const result = await verifyReceipt(selected, artifactContents);
    if (!result.ok) {
      setError(result.error.message);
      return;
    }
    setVerification(result.value);
  }

  function handleDownload() {
    if (!selected) return;
    const blob = new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${selected.receiptId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="stack" style={{ gap: 'var(--sp-6)' }}>
      <h1 className="display-sm">Proof</h1>
      <p className="subhead">
        Receipts are generated from the append-only event ledger and are tamper-evident through SHA-256 over
        RFC 8785 canonical JSON. They are not cryptographic signatures, and Cherry never claims they are.
      </p>
      {error ? <p className="field-error" role="alert">{error}</p> : null}

      {receipts.length === 0 ? (
        <p className="card">No receipts yet. Generate one from a mission after verification.</p>
      ) : (
        <div className="row" role="tablist" aria-label="Receipts">
          {receipts.map((receipt) => (
            <button
              key={receipt.receiptId}
              type="button"
              className="btn btn-sm"
              style={{ background: selected?.receiptId === receipt.receiptId ? 'var(--color-carbon)' : undefined, color: selected?.receiptId === receipt.receiptId ? '#fff' : undefined }}
              onClick={() => {
                setSelected(receipt);
                setVerification(null);
              }}
            >
              {receipt.createdAt.slice(0, 16).replace('T', ' ')} · {receipt.status}
            </button>
          ))}
        </div>
      )}

      {selected ? (
        <div className="stack" style={{ gap: 'var(--sp-4)' }}>
          <div key={selected.receiptId} className="card card-wash-cherry stack receipt-in">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <h2 className="subhead">{selected.receiptId}</h2>
              <span className={selected.status === 'verified' ? 'sticker sticker-pass' : 'sticker sticker-fail'} data-testid="receipt-status">
                {selected.status}
              </span>
            </div>
            <div className="row">
              <span className="sticker mono">hash {selected.receiptHash.slice(0, 16)}…</span>
              <span className="sticker">skill v{selected.skillGraphVersion} r{selected.skillGraphRevision}</span>
              <span className="sticker">{selected.events.length} events</span>
              <span className="sticker">{selected.approvals.length} approvals</span>
              <span className="sticker">{selected.artifacts.length} artifacts</span>
              <span className="sticker">{selected.assertions.length} assertions</span>
              <span className="sticker">{selected.failuresAndRepairs.length} repairs</span>
            </div>
            <div className="row">
              <button type="button" className="btn btn-primary" onClick={() => void handleRecompute()} data-testid="recompute-receipt">
                Recompute hashes
              </button>
              <button type="button" className="btn" onClick={handleDownload}>Download receipt JSON</button>
            </div>
            {verification ? (
              <div className={verification.verdict === 'valid' ? 'card card-wash-mint stack' : 'field-error stack'} role="status" data-testid="recompute-result">
                <strong>{verification.verdict === 'valid' ? 'Receipt verifies' : 'Receipt DOES NOT verify'}</strong>
                <ul>
                  {verification.notes.map((note, index) => <li key={index}>{note}</li>)}
                </ul>
                <span className="mono">recomputed {verification.recomputedHash.slice(0, 20)}… vs stored {verification.storedHash.slice(0, 20)}…</span>
                {verification.artifactChecks.length > 0 ? (
                  <ul>
                    {verification.artifactChecks.map((check) => (
                      <li key={check.path} className="mono">
                        {check.path}: {check.matches ? 'hash ok' : 'HASH MISMATCH'}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </div>

          <details className="card" open>
            <summary className="subhead" style={{ cursor: 'pointer' }}>Assertions</summary>
            <div className="table-scroll" style={{ marginTop: 'var(--sp-3)' }}>
              <table className="data-table">
                <thead>
                  <tr><th scope="col">Assertion</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Evidence</th></tr>
                </thead>
                <tbody>
                  {selected.assertions.map((assertion) => (
                    <tr key={assertion.id}>
                      <td>{assertion.name}</td>
                      <td>{assertion.type} · {assertion.severity}</td>
                      <td><span className={assertion.status === 'passed' ? 'sticker sticker-pass' : assertion.status === 'failed' ? 'sticker sticker-fail' : 'sticker sticker-wait'}>{assertion.status}</span></td>
                      <td style={{ fontSize: 13 }}>{assertion.evidence.slice(0, 2).join(' · ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <details className="card">
            <summary className="subhead" style={{ cursor: 'pointer' }}>Event ledger ({selected.events.length})</summary>
            <div className="event-strip" style={{ marginTop: 'var(--sp-3)', maxHeight: 400, overflowY: 'auto' }}>
              {selected.events.map((event) => (
                <div key={event.id} className="event-row">
                  <span className="mono">#{event.sequence}</span>
                  <span className="mono">{event.occurredAt.slice(0, 19)}</span>
                  <span className="sticker" style={{ padding: '2px 8px' }}>{event.actorType}</span>
                  <span>{event.summary}</span>
                </div>
              ))}
            </div>
          </details>

          {selected.failuresAndRepairs.length > 0 ? (
            <details className="card" open>
              <summary className="subhead" style={{ cursor: 'pointer' }}>Failures and repairs</summary>
              <ul className="stack" style={{ marginTop: 'var(--sp-3)' }}>
                {selected.failuresAndRepairs.map((entry, index) => (
                  <li key={index}>
                    <span className="sticker sticker-fail">failed {entry.failedAt.slice(0, 19)}</span>{' '}
                    {entry.repairSummary}{' '}
                    <span className="sticker sticker-pass">re-verified</span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
