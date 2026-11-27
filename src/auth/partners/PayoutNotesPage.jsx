import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { FiltersMenu } from '../FiltersMenu';
import { BackLink, Choice, PERIODS, inr, qs } from './shared';

const empty = { q: '', partnerId: '', libraryId: '', preset: 'all_time', from: '', to: '', page: 1 };

export function PayoutNotesPage({ libraries, onOpen }) {
  const [query, setQuery] = useState(empty);
  const [draft, setDraft] = useState(empty);
  const [data, setData] = useState(null);
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (next) => {
    setLoading(true);
    try {
      const [page, people] = await Promise.all([api.adminPayoutNotes(qs({ ...next, limit: 25 })), api.adminPartners()]);
      setData(page);
      setPartners(Array.isArray(people) ? people : []);
    } catch (e) { toast.error(e.message || 'Could not load payout notes'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(query); }, [load, query]);
  useEffect(() => { setDraft(query); }, [query]);
  const apply = (e) => { e?.preventDefault(); setQuery({ ...draft, q: draft.q.trim(), page: 1 }); };
  const reset = () => { setDraft(empty); setQuery(empty); };
  const items = data?.items || [];
  const seller = (id) => partners.find(p => p.id === id)?.name || id;
  const libName = (id) => libraries.find(l => l.libraryId === id)?.name || id;
  return (
    <div id="sa-payout-records" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div>
        <BackLink onClick={() => onOpen('landing')}>Partners &amp; Commissions</BackLink>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 0' }}>Outside payout notes</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
          Each row is a tracking / bookkeeping note that an outside payout was recorded. Nothing here is a bank transfer or a payment executed in the app. Commission amounts and frozen rates are unchanged.
        </p>
      </div>
      <FiltersMenu
        buttonId="sa-payout-records-filters-button"
        menuId="sa-payout-records-filters-menu"
        chips={[
          query.partnerId && { key: 'partner', label: seller(query.partnerId), onDismiss: () => setQuery({ ...query, partnerId: '', page: 1 }) },
          query.libraryId && { key: 'library', label: libName(query.libraryId), onDismiss: () => setQuery({ ...query, libraryId: '', page: 1 }) },
          query.preset !== 'all_time' && { key: 'period', label: query.preset, onDismiss: () => setQuery({ ...query, preset: 'all_time', from: '', to: '', page: 1 }) },
        ].filter(Boolean)}
        onApply={apply}
        onReset={reset}
        onClose={() => setDraft(query)}
        applyDisabled={loading || (draft.preset === 'custom' && (!draft.from || !draft.to))}
      >
        <label className="form-label" style={{ margin: 0 }}>Partner
          <select className="form-input" value={draft.partnerId} onChange={e => setDraft(d => ({ ...d, partnerId: e.target.value }))}>
            <option value="">Any seller</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Library
          <select className="form-input" value={draft.libraryId} onChange={e => setDraft(d => ({ ...d, libraryId: e.target.value }))}>
            <option value="">Any library</option>
            {libraries.map(l => <option key={l.libraryId} value={l.libraryId}>{l.name}</option>)}
          </select>
        </label>
        <div role="group" aria-label="Period" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {PERIODS.map(([id, label]) => <Choice key={id} label={label} pressed={draft.preset === id} onClick={() => setDraft(d => ({ ...d, preset: id }))} />)}
        </div>
        {draft.preset === 'custom' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="form-label" style={{ margin: 0 }}>From<input className="form-input" type="date" value={draft.from} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} required /></label>
            <label className="form-label" style={{ margin: 0 }}>To<input className="form-input" type="date" value={draft.to} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} required /></label>
          </div>
        )}
      </FiltersMenu>
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>{data?.note} {data?.paymentExecuted === false ? 'paymentExecuted is false.' : ''}</p>
      <div className="premium-card sa-table-card" style={{ padding: 0 }}>
        <div className="table-container">
          <table className="data-grid" style={{ width: '100%' }}>
            <thead><tr><th>Note date</th><th>Reference</th><th>Noted amount</th><th>Commission</th><th>Seller</th><th>Library</th></tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={6}>{loading ? 'Loading…' : 'No outside payout notes yet.'}</td></tr>}
              {items.map(r => (
                <tr key={r.id}>
                  <td>{r.payoutNote?.date}</td>
                  <td><button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0 }} onClick={() => onOpen('record', r.id)}>{r.payoutNote?.reference}</button></td>
                  <td>{inr(r.payoutNote?.amount)}</td>
                  <td>{inr(r.amount)}<div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{rateTextSafe(r)}</div></td>
                  <td>{seller(r.sellerId)}</td>
                  <td>{libName(r.tenantId)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function rateTextSafe(r) {
  if (r.basis?.mode === 'percent') return `${r.basis.value}% frozen`;
  return 'Frozen rate unchanged';
}
