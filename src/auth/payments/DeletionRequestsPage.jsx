import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { FiltersMenu } from '../FiltersMenu';

const empty = { q: '', state: '' };
const STATES = [
  ['', 'All history'],
  ['pending', 'Pending'],
  ['acknowledged', 'Acknowledged'],
  ['dismissed', 'Dismissed'],
  ['withdrawn', 'Withdrawn by owner'],
];

export function DeletionRequestsPage({ onOpen, onOpenLibrary }) {
  const [rows, setRows] = useState([]);
  const [query, setQuery] = useState(empty);
  const [draft, setDraft] = useState(empty);
  const load = useCallback(async (next) => {
    const p = new URLSearchParams();
    if (next.q) p.set('q', next.q);
    if (next.state) p.set('state', next.state);
    const s = p.toString();
    try { setRows(await api.adminDeletionRequests(s ? `?${s}` : '')); }
    catch (e) { toast.error(e.message || 'Could not load deletion requests'); }
  }, []);
  useEffect(() => { load(query); }, [load, query]);
  useEffect(() => { setDraft(query); }, [query]);
  const resolve = async (libraryId, action) => {
    try {
      await api.adminResolveDeletionRequest(libraryId, action);
      toast.success(action === 'dismiss' ? 'Request dismissed' : 'Acknowledged');
      load(query);
    } catch (e) { toast.error(e.message); }
  };
  const chips = [];
  if (query.q) chips.push({ key: 'q', label: `Search: ${query.q}`, onDismiss: () => setQuery({ ...query, q: '' }) });
  if (query.state) chips.push({ key: 'state', label: STATES.find(([id]) => id === query.state)?.[1] || query.state, onDismiss: () => setQuery({ ...query, state: '' }) });
  return (
    <div id="sa-deletion-requests" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpen('landing')}><ArrowLeft size={14} /> Payments</button>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 0' }}>Deletion requests</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
          An owner request is not automatic irreversible deletion. Acknowledge and dismiss here. Permanent deletion stays on library details and still requires typing the library name.
        </p>
      </div>
      <FiltersMenu
        buttonId="sa-deletion-requests-filters-button"
        menuId="sa-deletion-requests-filters-menu"
        chips={chips}
        onApply={() => setQuery(draft)}
        onReset={() => { setDraft(empty); setQuery(empty); }}
        onClose={() => setDraft(query)}
      >
        <label className="form-label" style={{ margin: 0 }}>Search
          <input className="form-input" value={draft.q} onChange={e => setDraft(d => ({ ...d, q: e.target.value }))} placeholder="Library, owner, email, reason" />
        </label>
        <div role="group" aria-label="Request state" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {STATES.map(([id, label]) => (
            <button key={id || 'all'} type="button" className={`btn btn-sm ${draft.state === id ? 'btn-primary' : 'btn-secondary'}`} style={{ justifyContent: 'flex-start', width: '100%' }} aria-pressed={draft.state === id} onClick={() => setDraft(d => ({ ...d, state: id }))}>{label}</button>
          ))}
        </div>
      </FiltersMenu>
      {rows.length === 0 && <p style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No deletion requests in this view.</p>}
      {rows.map(r => (
        <div key={r.id || r.libraryId} className="premium-card" style={{ padding: 12, fontSize: 13, minWidth: 0 }}>
          <strong style={{ overflowWrap: 'anywhere' }}>{r.name}</strong> <span style={{ color: 'var(--text-tertiary)' }}>({r.libraryId})</span>
          <div style={{ textTransform: 'capitalize' }}>{r.state || 'pending'}</div>
          <div>{r.by || r.deletionRequest?.by || '—'} · {r.at || r.deletionRequest?.at ? new Date(r.at || r.deletionRequest.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''}</div>
          {(r.reason || r.deletionRequest?.reason) && <div style={{ color: 'var(--text-secondary)', overflowWrap: 'anywhere' }}>{r.reason || r.deletionRequest.reason}</div>}
          {r.deletionRequest?.acknowledgedAt && <div style={{ color: '#059669' }}>Acknowledged by {r.deletionRequest.acknowledgedBy}</div>}
          {r.note && <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4 }}>{r.note}</div>}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {r.canResolve && (
              <>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => resolve(r.libraryId, 'acknowledge')}>Acknowledge</button>
                <button type="button" className="btn btn-ghost btn-sm" onClick={() => resolve(r.libraryId, 'dismiss')}>Dismiss</button>
              </>
            )}
            {onOpenLibrary && r.libraryId && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenLibrary(r.libraryId)}>Open library details</button>}
          </div>
        </div>
      ))}
    </div>
  );
}
