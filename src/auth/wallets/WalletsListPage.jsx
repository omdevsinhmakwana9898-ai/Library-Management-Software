import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { DatePeriodSelect, FiltersMenu, datePeriodLabel } from '../FiltersMenu';
import { SaEmpty, SaHelper, SaList, SaListRow, SaPage, SaPageHeader, SaStatusBadge } from '../saPage';
import { Pager, SummaryCards, balanceLine, inrMinor, walletQuery } from './shared';

const empty = { q: '', libraryId: '', status: '', balance: '', activity: '', preset: 'all_time', from: '', to: '', page: 1 };

const ACTIVITY = {
  paid_online: 'Paid online',
  by_admin: 'Added or deducted by Super Admin',
  on_invoice: 'Used on an invoice',
};

export function WalletsListPage({ onOpen }) {
  const [query, setQuery] = useState(empty);
  const [draft, setDraft] = useState(empty);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (next) => {
    setLoading(true);
    try {
      setData(await api.adminWallets(walletQuery({ ...next, limit: 25 })));
    } catch (e) { toast.error(e.message || 'Could not load library wallets'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(query); }, [load, query]);
  useEffect(() => { setDraft(query); }, [query]);

  const apply = (e) => { e?.preventDefault(); setQuery({ ...draft, q: draft.q.trim(), page: 1 }); };
  const reset = () => { setDraft(empty); setQuery(empty); };
  const options = data?.options || [];
  const libraryName = options.find(l => l.libraryId === query.libraryId)?.name || query.libraryId;
  const chips = [
    query.q && { key: 'q', label: `Search: ${query.q}`, onDismiss: () => setQuery({ ...query, q: '', page: 1 }) },
    query.libraryId && { key: 'library', label: libraryName, onDismiss: () => setQuery({ ...query, libraryId: '', page: 1 }) },
    query.preset !== 'all_time' && { key: 'period', label: datePeriodLabel(query.preset, query), onDismiss: () => setQuery({ ...query, preset: 'all_time', from: '', to: '', page: 1 }) },
    query.status && { key: 'status', label: query.status, onDismiss: () => setQuery({ ...query, status: '', page: 1 }) },
    query.balance && { key: 'balance', label: query.balance === 'available' ? 'Has available credit' : 'No available credit', onDismiss: () => setQuery({ ...query, balance: '', page: 1 }) },
    query.activity && { key: 'activity', label: ACTIVITY[query.activity] || query.activity, onDismiss: () => setQuery({ ...query, activity: '', page: 1 }) },
  ].filter(Boolean);

  const items = data?.items || [];
  return (
    <SaPage id="sa-wallets">
      <SaPageHeader
        title="Library wallets"
        subtitle="Search every library wallet. Add or deduct credit from the library page."
      />
      <SummaryCards summary={data?.summary} />
      <SaHelper>The period filter uses the date of a wallet change. Opening a library shows the current balance.</SaHelper>
      <FiltersMenu
        buttonId="sa-wallets-filters-button"
        menuId="sa-wallets-filters-menu"
        chips={chips}
        onApply={apply}
        onReset={reset}
        onClose={() => setDraft(query)}
        applyDisabled={loading || (draft.preset === 'custom' && (!draft.from || !draft.to))}
      >
        <DatePeriodSelect
          id="sa-wallets-filters-period"
          value={draft.preset || 'all_time'}
          onChange={(preset) => setDraft(d => ({ ...d, preset }))}
          from={draft.from}
          to={draft.to}
          onFromChange={(from) => setDraft(d => ({ ...d, from }))}
          onToChange={(to) => setDraft(d => ({ ...d, to }))}
        />
        <label className="form-label" style={{ margin: 0 }}>Library
          <input className="form-input" value={draft.q} onChange={e => setDraft(d => ({ ...d, q: e.target.value }))} placeholder="Name" />
          <select className="form-input" style={{ marginTop: 6 }} value={draft.libraryId} onChange={e => setDraft(d => ({ ...d, libraryId: e.target.value }))}>
            <option value="">Any library</option>
            {options.map(l => <option key={l.libraryId} value={l.libraryId}>{l.name}</option>)}
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Status
          <select className="form-input" value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
            <option value="">Active and disabled</option>
            <option value="Active">Active</option>
            <option value="Disabled">Disabled</option>
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Balance
          <select className="form-input" value={draft.balance} onChange={e => setDraft(d => ({ ...d, balance: e.target.value }))}>
            <option value="">Any balance</option>
            <option value="available">Has available credit</option>
            <option value="none">No available credit</option>
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Activity
          <select className="form-input" value={draft.activity} onChange={e => setDraft(d => ({ ...d, activity: e.target.value }))}>
            <option value="">Any activity</option>
            <option value="paid_online">Paid online</option>
            <option value="by_admin">Added or deducted by Super Admin</option>
            <option value="on_invoice">Used on an invoice</option>
          </select>
        </label>
      </FiltersMenu>
      {loading && items.length === 0 && <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>Loading…</p>}
      {!loading && items.length === 0 && (
        <SaEmpty title="No library wallets match">Clear a filter and try again.</SaEmpty>
      )}
      {items.length > 0 && (
        <SaList>
          {items.map(row => (
            <SaListRow
              key={row.libraryId}
              title={row.name}
              meta={balanceLine(row.wallet)}
              amount={inrMinor(row.wallet?.availableMinor)}
              onClick={() => onOpen('detail', row.libraryId)}
              badge={<SaStatusBadge status={row.status} />}
            />
          ))}
        </SaList>
      )}
      <Pager page={query.page} pages={data?.pages} loading={loading} onPage={(page) => setQuery({ ...query, page })} />
    </SaPage>
  );
}
