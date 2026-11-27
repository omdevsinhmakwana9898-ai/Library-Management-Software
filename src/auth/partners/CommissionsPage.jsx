import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { DatePeriodSelect, FiltersMenu, datePeriodLabel } from '../FiltersMenu';
import { SaEmpty, SaList, SaListRow, SaPage, SaPageHeader, SaStatusBadge } from '../saPage';
import { SaleRecordPage } from './SaleRecordPage';
import { Pager, STATUS_HELP, SummaryCards, inr, qs, rateText, saleKindLabel } from './shared';

const empty = { q: '', partnerId: '', libraryId: '', kind: '', status: '', preset: 'all_time', from: '', to: '', page: 1 };
const STATUSES = [
  ['', 'All'],
  ['pending', 'Pending (earned and unpaid)'],
  ['unpaid', 'Unpaid'],
  ['paid', 'Paid note'],
  ['earned', 'Earned'],
  ['reversed', 'Reversed'],
  ['cancelled', 'Cancelled'],
  ['void', 'Void'],
];

export function CommissionsPage({ libraries, onOpen, onChanged, seed }) {
  const [screen, setScreen] = useState('list');
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
    query.kind && { key: 'kind', label: saleKindLabel(query.kind), onDismiss: () => setQuery({ ...query, kind: '', page: 1 }) },
    query.status && { key: 'status', label: STATUSES.find(([id]) => id === query.status)?.[1] || query.status, onDismiss: () => setQuery({ ...query, status: '', page: 1 }) },
  ].filter(Boolean);
  const seller = (id) => partners.find(p => p.id === id)?.name || id;
  const libName = (id) => libraries.find(l => l.libraryId === id)?.name || id;
  const items = data?.items || [];
  if (screen === 'sale') {
    return (
      <SaleRecordPage
        libraries={libraries}
        onBack={() => setScreen('list')}
        onRecorded={() => { load(query); onChanged?.(); }}
      />
    );
  }
  return (
    <SaPage id="sa-commissions">
      <SaPageHeader
        onBack={() => onOpen('landing')}
        backLabel="Partners & Commissions"
        title="Commission records"
        subtitle={`${STATUS_HELP} The rate stays frozen at the time of sale. Open a row to reverse it or add an outside payout note.`}
        actions={<button type="button" className="btn btn-primary" onClick={() => setScreen('sale')}>Record a software sale</button>}
      />
      <SummaryCards summary={summary} />
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
      {loading && items.length === 0 && <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>Loading…</p>}
      {!loading && items.length === 0 && (
        <SaEmpty title="No commissions match">
          Clear a filter, or record a software sale.
        </SaEmpty>
      )}
      {items.length > 0 && (
        <SaList>
          {items.map(r => (
            <SaListRow
              key={r.id}
              title={`${seller(r.sellerId)} · ${libName(r.tenantId)}`}
              meta={`${r.saleDate || '—'} · ${saleKindLabel(r.kind)} · Frozen rate ${rateText(r.basis)}${r.basis?.version ? ` v${r.basis.version}` : ''}`}
              extra={[r.saleRef, r.statusReason].filter(Boolean).join(' · ')}
              amount={inr(r.amount)}
              onClick={() => onOpen('record', r.id)}
              badge={(
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <SaStatusBadge status={r.status} />
                  <SaStatusBadge status={r.payoutStatus} />
                </span>
              )}
            />
          ))}
        </SaList>
      )}
      <Pager page={query.page} pages={data?.pages} loading={loading} onPage={(page) => setQuery({ ...query, page })} />
    </SaPage>
  );
}
