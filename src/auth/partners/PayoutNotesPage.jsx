import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { DatePeriodSelect, FiltersMenu, datePeriodLabel } from '../FiltersMenu';
import { SaEmpty, SaList, SaListRow, SaPage, SaPageHeader, SaStatusBadge, SaSummaryCard, SaSummaryGrid } from '../saPage';
import { Pager, inr, qs } from './shared';

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
    <SaPage id="sa-payout-records">
      <SaPageHeader
        onBack={() => onOpen('landing')}
        backLabel="Partners & Commissions"
        title="Outside payout notes"
        subtitle="Each row is a tracking / bookkeeping note that an outside payout was recorded. Nothing here is a bank transfer or a payment executed in the app. Commission amounts and frozen rates are unchanged."
      />
      <SaSummaryGrid>
        <SaSummaryCard label="Notes" value={data?.total ?? '…'} sub="Matching this filter" />
        <SaSummaryCard label="On this page" value={items.length} sub={data?.page ? `Page ${data.page}` : '—'} tone="#eff6ff" />
        <SaSummaryCard label="Payment in the app" value="No" sub="Bookkeeping only" tone="#fff7ed" />
      </SaSummaryGrid>
      <FiltersMenu
        buttonId="sa-payout-records-filters-button"
        menuId="sa-payout-records-filters-menu"
        chips={[
          query.partnerId && { key: 'partner', label: seller(query.partnerId), onDismiss: () => setQuery({ ...query, partnerId: '', page: 1 }) },
          query.libraryId && { key: 'library', label: libName(query.libraryId), onDismiss: () => setQuery({ ...query, libraryId: '', page: 1 }) },
          query.preset !== 'all_time' && { key: 'period', label: datePeriodLabel(query.preset, query), onDismiss: () => setQuery({ ...query, preset: 'all_time', from: '', to: '', page: 1 }) },
        ].filter(Boolean)}
        onApply={apply}
        onReset={reset}
        onClose={() => setDraft(query)}
        applyDisabled={loading || (draft.preset === 'custom' && (!draft.from || !draft.to))}
      >
        <DatePeriodSelect
          id="sa-payout-records-filters-period"
          value={draft.preset || 'all_time'}
          onChange={(preset) => setDraft(d => ({ ...d, preset }))}
          from={draft.from}
          to={draft.to}
          onFromChange={(from) => setDraft(d => ({ ...d, from }))}
          onToChange={(to) => setDraft(d => ({ ...d, to }))}
        />
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
      </FiltersMenu>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>{data?.note} {data?.paymentExecuted === false ? 'No payment was executed.' : ''}</p>
      {loading && items.length === 0 && <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>Loading…</p>}
      {!loading && items.length === 0 && (
        <SaEmpty title="No outside payout notes yet">
          Open a commission record to save a tracking note. That note does not move money.
        </SaEmpty>
      )}
      {items.length > 0 && (
        <SaList>
          {items.map(r => (
            <SaListRow
              key={r.id}
              title={r.payoutNote?.reference || 'Outside note'}
              meta={`${r.payoutNote?.date || '—'} · ${seller(r.sellerId)} · ${libName(r.tenantId)}`}
              extra={`Commission ${inr(r.amount)} · ${rateTextSafe(r)}`}
              amount={inr(r.payoutNote?.amount)}
              onClick={() => onOpen('record', r.id)}
              badge={<SaStatusBadge status="paid">Paid note</SaStatusBadge>}
            />
          ))}
        </SaList>
      )}
      <Pager page={query.page} pages={data?.pages} loading={loading} onPage={(page) => setQuery({ ...query, page })} />
    </SaPage>
  );
}

function rateTextSafe(r) {
  if (r.basis?.mode === 'percent') return `${r.basis.value}% frozen`;
  if (r.basis?.value != null) return 'Fixed rate frozen';
  return 'Frozen rate unchanged';
}
