import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { DatePeriodSelect, FiltersMenu, datePeriodLabel } from '../FiltersMenu';
import { SaEmpty, SaHelper, SaList, SaListRow, SaPage, SaPageHeader, SaStatusBadge } from '../saPage';
import { Pager, SummaryCards, kindLabel, qs } from './shared';

const empty = { q: '', partnerId: '', libraryId: '', kind: '', status: '', preset: 'all_time', from: '', to: '', page: 1 };

export function DirectoryPage({ libraries, onOpen }) {
  const [query, setQuery] = useState(empty);
  const [draft, setDraft] = useState(empty);
  const [data, setData] = useState(null);
  const [options, setOptions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (next) => {
    setLoading(true);
    try {
      const [page, all, sum] = await Promise.all([
        api.adminPartners(qs({ ...next, limit: 25 })),
        api.adminPartners(),
        api.adminPartnerSummary(),
      ]);
      setData(page);
      setOptions(Array.isArray(all) ? all : []);
      setSummary(sum);
    } catch (e) { toast.error(e.message || 'Could not load partners'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(query); }, [load, query]);
  useEffect(() => { setDraft(query); }, [query]);

  const apply = (e) => { e?.preventDefault(); setQuery({ ...draft, q: draft.q.trim(), page: 1 }); };
  const reset = () => { setDraft(empty); setQuery(empty); };
  const partnerName = options.find(p => p.id === query.partnerId)?.name || query.partnerId;
  const libraryName = libraries.find(l => l.libraryId === query.libraryId)?.name || query.libraryId;
  const chips = [
    query.q && { key: 'q', label: `Search: ${query.q}`, onDismiss: () => setQuery({ ...query, q: '', page: 1 }) },
    query.partnerId && { key: 'partner', label: partnerName, onDismiss: () => setQuery({ ...query, partnerId: '', page: 1 }) },
    query.libraryId && { key: 'library', label: libraryName, onDismiss: () => setQuery({ ...query, libraryId: '', page: 1 }) },
    query.preset !== 'all_time' && { key: 'period', label: datePeriodLabel(query.preset, query), onDismiss: () => setQuery({ ...query, preset: 'all_time', from: '', to: '', page: 1 }) },
    query.kind && { key: 'kind', label: kindLabel(query.kind), onDismiss: () => setQuery({ ...query, kind: '', page: 1 }) },
    query.status && { key: 'status', label: query.status, onDismiss: () => setQuery({ ...query, status: '', page: 1 }) },
  ].filter(Boolean);

  const items = data?.items || [];
  return (
    <SaPage id="sa-partners-directory">
      <SaPageHeader
        onBack={() => onOpen('landing')}
        backLabel="Partners & Commissions"
        title="Partners and agents"
        actions={<button type="button" className="btn btn-primary" onClick={() => onOpen('create')}>Add partner or agent</button>}
      />
      <SummaryCards summary={summary} compact />
      <SaHelper>The period filter uses the date the account was created. Open a person to change permissions.</SaHelper>
      <FiltersMenu
        buttonId="sa-partners-filters-button"
        menuId="sa-partners-filters-menu"
        chips={chips}
        onApply={apply}
        onReset={reset}
        onClose={() => setDraft(query)}
        applyDisabled={loading || (draft.preset === 'custom' && (!draft.from || !draft.to))}
      >
        <DatePeriodSelect
          id="sa-partners-filters-period"
          value={draft.preset || 'all_time'}
          onChange={(preset) => setDraft(d => ({ ...d, preset }))}
          from={draft.from}
          to={draft.to}
          onFromChange={(from) => setDraft(d => ({ ...d, from }))}
          onToChange={(to) => setDraft(d => ({ ...d, to }))}
        />
        <label className="form-label" style={{ margin: 0 }}>Partner
          <input className="form-input" value={draft.q} onChange={e => setDraft(d => ({ ...d, q: e.target.value }))} placeholder="Name or email" />
          <select className="form-input" style={{ marginTop: 6 }} value={draft.partnerId} onChange={e => setDraft(d => ({ ...d, partnerId: e.target.value }))}>
            <option value="">Any partner</option>
            {options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
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
            <option value="">Partner and agent</option>
            <option value="partner">Partner</option>
            <option value="agent">Agent</option>
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Status
          <select className="form-input" value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
            <option value="">Active and disabled</option>
            <option value="Active">Active</option>
            <option value="Disabled">Disabled</option>
          </select>
        </label>
      </FiltersMenu>
      {loading && items.length === 0 && <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>Loading…</p>}
      {!loading && items.length === 0 && (
        <SaEmpty title="No partners or agents match">
          Clear a filter, or add a partner or agent.
        </SaEmpty>
      )}
      {items.length > 0 && (
        <SaList>
          {items.map(p => (
            <SaListRow
              key={p.id}
              title={p.name}
              meta={p.email}
              onClick={() => onOpen('detail', p.id)}
              badge={(
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <SaStatusBadge status={p.kind === 'agent' ? 'open' : 'active'}>{kindLabel(p.kind)}</SaStatusBadge>
                  <SaStatusBadge status={p.status} />
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
