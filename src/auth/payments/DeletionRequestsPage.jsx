import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { FiltersMenu } from '../FiltersMenu';
import { SaEmpty, SaList, SaListRow, SaPage, SaPageHeader, SaStatusBadge } from '../saPage';

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
    <SaPage id="sa-deletion-requests">
      <SaPageHeader
        onBack={() => onOpen('landing')}
        backLabel="Payments"
        title="Deletion requests"
        subtitle="An owner request is not automatic irreversible deletion. Acknowledge and dismiss here. Permanent deletion stays on library details and still requires typing the library name."
      />
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
        <label className="form-label" htmlFor="sa-deletion-requests-state" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>Request state
          <select id="sa-deletion-requests-state" className="form-select" value={draft.state} onChange={e => setDraft(d => ({ ...d, state: e.target.value }))}>
            {STATES.map(([id, label]) => <option key={id || 'all'} value={id}>{label}</option>)}
          </select>
        </label>
      </FiltersMenu>
      {rows.length === 0 && (
        <SaEmpty title="No deletion requests in this view">
          Clear the filter to see the full history.
        </SaEmpty>
      )}
      {rows.length > 0 && (
        <SaList>
          {rows.map(r => (
            <SaListRow
              key={r.id || r.libraryId}
              title={r.name}
              meta={`${r.by || r.deletionRequest?.by || 'Owner'} · ${r.at || r.deletionRequest?.at ? new Date(r.at || r.deletionRequest.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'Date not recorded'}`}
              extra={(
                <>
                  <div>{[r.reason || r.deletionRequest?.reason, r.note, r.deletionRequest?.acknowledgedAt ? `Acknowledged by ${r.deletionRequest.acknowledgedBy}` : ''].filter(Boolean).join(' · ')}</div>
                  <div className="sa-action-row" style={{ marginTop: 8 }}>
                    {r.canResolve && (
                      <>
                        <button type="button" className="btn btn-secondary btn-sm" onClick={() => resolve(r.libraryId, 'acknowledge')}>Acknowledge</button>
                        <button type="button" className="btn btn-ghost btn-sm" onClick={() => resolve(r.libraryId, 'dismiss')}>Dismiss</button>
                      </>
                    )}
                    {onOpenLibrary && r.libraryId && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenLibrary(r.libraryId)}>Open library details</button>}
                  </div>
                </>
              )}
              badge={<SaStatusBadge status={r.state || 'pending'} />}
            />
          ))}
        </SaList>
      )}
    </SaPage>
  );
}
