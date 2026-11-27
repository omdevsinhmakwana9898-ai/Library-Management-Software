import React, { useCallback, useEffect, useState } from 'react';
import { Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { DatePeriodSelect, FiltersMenu, datePeriodLabel } from '../FiltersMenu';
import { BackLink, SaleRecorder, STATUS_HELP, SummaryCards, inr, qs, rateText } from './shared';

const empty = { q: '', partnerId: '', libraryId: '', kind: '', status: '', preset: 'all_time', from: '', to: '', page: 1 };
const STATUSES = [
  ['', 'All'],
  ['pending', 'Pending (earned, unpaid)'],
  ['unpaid', 'Unpaid tracking'],
  ['paid', 'Paid tracking note'],
  ['earned', 'Record: earned'],
  ['reversed', 'Record: reversed'],
  ['cancelled', 'Record: cancelled'],
  ['void', 'Tracking: void'],
];

export function CommissionsPage({ libraries, onOpen, onChanged, seed }) {
  const [query, setQuery] = useState({ ...empty, ...(seed || {}) });
  const [draft, setDraft] = useState({ ...empty, ...(seed || {}) });
  const [data, setData] = useState(null);
  const [partners, setPartners] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async (next) => {
    setLoading(true);
    try {
      const [page, people, sum] = await Promise.all([
        api.adminCommissions(qs({ ...next, limit: 25 })),
        api.adminPartners(),
        api.adminPartnerSummary(),
      ]);
      setData(page);
      setPartners(Array.isArray(people) ? people : []);
      setSummary(sum);
    } catch (e) { toast.error(e.message || 'Could not load commissions'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(query); }, [load, query]);
  useEffect(() => { setDraft(query); }, [query]);
  const apply = (e) => { e?.preventDefault(); setQuery({ ...draft, q: draft.q.trim(), page: 1 }); };
  const reset = () => { setDraft(empty); setQuery(empty); };
  const partnerName = partners.find(p => p.id === query.partnerId)?.name || query.partnerId;
  const libraryName = libraries.find(l => l.libraryId === query.libraryId)?.name || query.libraryId;
  const chips = [
    query.q && { key: 'q', label: `Search: ${query.q}`, onDismiss: () => setQuery({ ...query, q: '', page: 1 }) },
    query.partnerId && { key: 'partner', label: partnerName, onDismiss: () => setQuery({ ...query, partnerId: '', page: 1 }) },
    query.libraryId && { key: 'library', label: libraryName, onDismiss: () => setQuery({ ...query, libraryId: '', page: 1 }) },
    query.preset !== 'all_time' && { key: 'period', label: datePeriodLabel(query.preset, query), onDismiss: () => setQuery({ ...query, preset: 'all_time', from: '', to: '', page: 1 }) },
    query.kind && { key: 'kind', label: query.kind === 'initial' ? 'New sale' : 'Renewal', onDismiss: () => setQuery({ ...query, kind: '', page: 1 }) },
    query.status && { key: 'status', label: STATUSES.find(([id]) => id === query.status)?.[1] || query.status, onDismiss: () => setQuery({ ...query, status: '', page: 1 }) },
  ].filter(Boolean);
  const seller = (id) => partners.find(p => p.id === id)?.name || id;
  const libName = (id) => libraries.find(l => l.libraryId === id)?.name || id;
  const reverse = async (row) => {
    const reason = window.prompt('Reason (refund, cancellation…)');
    if (!reason) return;
    try { await api.adminReverseCommission(row.id, { reason }); toast.success('Commission reversed'); load(query); onChanged?.(); }
    catch (e) { toast.error(e.message); }
  };
  const items = data?.items || [];
  return (
    <div id="sa-commissions" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div>
        <BackLink onClick={() => onOpen('landing')}>Partners &amp; Commissions</BackLink>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 0' }}>Commission records</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>{STATUS_HELP} The rate stays frozen at the time of sale.</p>
      </div>
      <SummaryCards summary={summary} />
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <SaleRecorder libraries={libraries} onRecorded={() => { load(query); onChanged?.(); }} />
      </div>
      <FiltersMenu
        buttonId="sa-commissions-filters-button"
        menuId="sa-commissions-filters-menu"
        chips={chips}
        onApply={apply}
        onReset={reset}
        onClose={() => setDraft(query)}
        applyDisabled={loading || (draft.preset === 'custom' && (!draft.from || !draft.to))}
      >
        <DatePeriodSelect
          id="sa-commissions-filters-period"
          value={draft.preset || 'all_time'}
          onChange={(preset) => setDraft(d => ({ ...d, preset }))}
          from={draft.from}
          to={draft.to}
          onFromChange={(from) => setDraft(d => ({ ...d, from }))}
          onToChange={(to) => setDraft(d => ({ ...d, to }))}
        />
        <label className="form-label" style={{ margin: 0 }}>Partner
          <input className="form-input" value={draft.q} onChange={e => setDraft(d => ({ ...d, q: e.target.value }))} placeholder="Name, email, or invoice ref" />
          <select className="form-input" style={{ marginTop: 6 }} value={draft.partnerId} onChange={e => setDraft(d => ({ ...d, partnerId: e.target.value }))}>
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
        <label className="form-label" style={{ margin: 0 }}>Type
          <select className="form-input" value={draft.kind} onChange={e => setDraft(d => ({ ...d, kind: e.target.value }))}>
            <option value="">New sale and renewal</option>
            <option value="initial">New sale</option>
            <option value="renewal">Renewal</option>
          </select>
        </label>
        <label className="form-label" htmlFor="sa-commissions-filters-status" style={{ margin: 0 }}>Status
          <select id="sa-commissions-filters-status" className="form-input" value={draft.status || ''} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
            {STATUSES.map(([id, label]) => <option key={id || 'all'} value={id}>{label}</option>)}
          </select>
        </label>
      </FiltersMenu>
      <div className="premium-card sa-table-card" style={{ padding: 0 }}>
        <div className="table-container">
          <table className="data-grid" style={{ width: '100%' }}>
            <thead><tr><th>Date</th><th>Seller</th><th>Library</th><th>Sale type</th><th>Frozen rate</th><th>Amount</th><th>Record status</th><th>Tracking</th><th></th></tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={9}>{loading ? 'Loading…' : 'No commissions match.'}</td></tr>}
              {items.map(r => (
                <tr key={r.id}>
                  <td>{r.saleDate}</td>
                  <td>{seller(r.sellerId)}</td>
                  <td>{libName(r.tenantId)}</td>
                  <td>{r.kind === 'initial' ? 'New sale' : 'Renewal'}</td>
                  <td>{rateText(r.basis)}{r.basis?.version ? <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>v{r.basis.version}</div> : null}</td>
                  <td><button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0, fontWeight: 700 }} onClick={() => onOpen('record', r.id)}>{inr(r.amount)}</button><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{r.saleRef}</div></td>
                  <td><span className={`badge ${r.status === 'earned' ? 'badge-active' : 'badge-expired'}`}>{r.status}</span>{r.statusReason && <div style={{ fontSize: 11 }}>{r.statusReason}</div>}</td>
                  <td style={{ fontSize: 12 }}>{r.payoutStatus}<div style={{ color: 'var(--text-tertiary)' }}>{r.requirementLabel === 'pending' ? 'Pending / unpaid' : r.requirementLabel === 'paid' ? 'Paid note' : r.requirementLabel}</div></td>
                  <td>{r.status === 'earned' && <button className="btn btn-ghost btn-sm" title="Reverse (refund/cancel)" onClick={() => reverse(r)}><Undo2 size={14} /></button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {data && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={query.page <= 1 || loading} onClick={() => setQuery({ ...query, page: query.page - 1 })}>Previous</button>
          <span style={{ fontSize: 13 }}>Page {data.page} of {data.pages}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={query.page >= data.pages || loading} onClick={() => setQuery({ ...query, page: query.page + 1 })}>Next</button>
        </div>
      )}
    </div>
  );
}
