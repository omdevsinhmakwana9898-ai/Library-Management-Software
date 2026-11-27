import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { DatePeriodSelect, FiltersMenu, datePeriodLabel } from '../FiltersMenu';
import {
  SaEmpty, SaFact, SaHelper, SaList, SaListRow, SaMoreInfo, SaPage, SaPageHeader,
  SaRecordActions, SaRecordHero, SaRecordSection, SaRecordTimeline, SaStatusBadge,
} from '../saPage';
import { Pager, balanceLine, formatWhen, inrMinor, signedAmount, walletQuery } from './shared';

const empty = { preset: 'all_time', from: '', to: '', activity: '', page: 1 };

export function WalletDetailPage({ libraryId, onOpen }) {
  const [query, setQuery] = useState(empty);
  const [draft, setDraft] = useState(empty);
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (next) => {
    setLoading(true);
    try {
      setData(await api.adminWallet(libraryId, walletQuery(next)));
      setMissing(false);
    } catch (e) {
      setMissing(true);
      setData(null);
      toast.error(e.message || 'Could not load this wallet');
    } finally { setLoading(false); }
  }, [libraryId]);
  useEffect(() => { load(query); }, [load, query]);
  useEffect(() => { setDraft(query); }, [query]);

  const apply = (e) => { e?.preventDefault(); setQuery({ ...draft, page: 1 }); };
  const reset = () => { setDraft(empty); setQuery(empty); };
  if (!data) {
    return (
      <SaPage id="sa-wallet-detail">
        <SaPageHeader onBack={() => onOpen('list')} backLabel="Library wallets" title="Library wallet" subtitle={missing ? 'This wallet could not be opened.' : 'Loading this wallet.'} />
        {missing ? <SaEmpty title="This library wallet is not available">Go back and choose another library.</SaEmpty> : <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>Loading wallet…</p>}
      </SaPage>
    );
  }
  const { library, wallet, entries } = data;
  const chips = [
    query.preset !== 'all_time' && { key: 'period', label: datePeriodLabel(query.preset, query), onDismiss: () => setQuery({ ...query, preset: 'all_time', from: '', to: '', page: 1 }) },
    query.activity === 'paid_online' && { key: 'activity', label: 'Paid online', onDismiss: () => setQuery({ ...query, activity: '', page: 1 }) },
    query.activity === 'by_admin' && { key: 'activity', label: 'Added or deducted by Super Admin', onDismiss: () => setQuery({ ...query, activity: '', page: 1 }) },
    query.activity === 'on_invoice' && { key: 'activity', label: 'Used on an invoice', onDismiss: () => setQuery({ ...query, activity: '', page: 1 }) },
  ].filter(Boolean);
  const groups = [
    ['added', 'Added'],
    ['used', 'Used'],
    ['other', 'Reservations'],
  ];
  const steps = [
    wallet.createdAt ? { label: 'Wallet opened', at: formatWhen(wallet.createdAt) } : null,
    data.latestAt ? { label: 'Latest change', at: formatWhen(data.latestAt) } : null,
  ].filter(step => step?.at);
  return (
    <SaPage id="sa-wallet-detail">
      <SaPageHeader onBack={() => onOpen('list')} backLabel="Library wallets" title={library.name} />
      <SaRecordHero
        name={library.name}
        amount={inrMinor(wallet.availableMinor)}
        badge={<SaStatusBadge status={library.status} />}
      />
      <SaRecordTimeline steps={steps} />
      <SaRecordSection title="Balance">
        <SaFact label="Available">{inrMinor(wallet.availableMinor)}</SaFact>
        <SaFact label="Paid credit">{inrMinor(wallet.cashMinor)}</SaFact>
        <SaFact label="Promotional credit">{inrMinor(wallet.bonusMinor)}</SaFact>
        <SaFact label="Reserved">{inrMinor((wallet.heldCashMinor || 0) + (wallet.heldBonusMinor || 0))}</SaFact>
      </SaRecordSection>
      <FiltersMenu
        buttonId="sa-wallet-detail-filters-button"
        menuId="sa-wallet-detail-filters-menu"
        chips={chips}
        onApply={apply}
        onReset={reset}
        onClose={() => setDraft(query)}
        applyDisabled={loading || (draft.preset === 'custom' && (!draft.from || !draft.to))}
      >
        <DatePeriodSelect
          id="sa-wallet-detail-filters-period"
          value={draft.preset || 'all_time'}
          onChange={(preset) => setDraft(d => ({ ...d, preset }))}
          from={draft.from}
          to={draft.to}
          onFromChange={(from) => setDraft(d => ({ ...d, from }))}
          onToChange={(to) => setDraft(d => ({ ...d, to }))}
        />
        <label className="form-label" style={{ margin: 0 }}>Activity
          <select id="sa-wallet-detail-filters-activity" className="form-input" value={draft.activity} onChange={e => setDraft(d => ({ ...d, activity: e.target.value }))}>
            <option value="">Any activity</option>
            <option value="paid_online">Paid online</option>
            <option value="by_admin">Added or deducted by Super Admin</option>
            <option value="on_invoice">Used on an invoice</option>
          </select>
        </label>
      </FiltersMenu>
      {loading && entries.length === 0 && <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>Loading activity…</p>}
      {!loading && entries.length === 0 && <SaEmpty title="No wallet activity in this period">Clear the filter to see every change.</SaEmpty>}
      {groups.map(([key, title]) => {
        const rows = entries.filter(entry => entry.group === key);
        if (!rows.length) return null;
        return (
          <section key={key}>
            <h3 className="sa-record-section-title" style={{ margin: '4px 0' }}>{title}</h3>
            <SaList>
              {rows.map(entry => (
                <SaListRow
                  key={entry.id}
                  title={entry.title}
                  meta={[formatWhen(entry.createdAt), entry.bucketLabel].filter(Boolean).join(' · ')}
                  amount={signedAmount(entry)}
                  onClick={() => onOpen('entry', entry.id)}
                />
              ))}
            </SaList>
          </section>
        );
      })}
      <Pager page={query.page} pages={data.pages} loading={loading} onPage={(page) => setQuery({ ...query, page })} />
      <SaMoreInfo>
        <SaFact label="Library id">{library.libraryId}</SaFact>
      </SaMoreInfo>
      <SaHelper>{balanceLine(wallet)}. A deduction uses promotional credit first, then paid credit.</SaHelper>
      <SaRecordActions>
        <button type="button" className="btn btn-primary" onClick={() => onOpen('add', library.libraryId)}>Add credit</button>
        <button type="button" className="btn btn-secondary" onClick={() => onOpen('deduct', library.libraryId)}>Deduct credit</button>
      </SaRecordActions>
    </SaPage>
  );
}
