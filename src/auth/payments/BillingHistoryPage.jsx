import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { DatePeriodSelect, FiltersMenu, datePeriodLabel } from '../FiltersMenu';
import {
  SaEmpty,
  SaFact,
  SaHelper,
  SaList,
  SaListRow,
  SaMoreInfo,
  SaPage,
  SaPageHeader,
  SaRecordActions,
  SaRecordHero,
  SaRecordSection,
  SaRecordTimeline,
  SaSummaryCard,
  SaSummaryGrid,
  providerLabel,
  statusLabel,
} from '../saPage';

const LEGACY_PRESETS = { today: 'Today', last_2_days: '2 days' };
const STATUSES = [
  ['', 'All statuses'],
  ['paid', 'Paid'],
  ['open', 'Open'],
  ['pending', 'Pending'],
  ['failed', 'Failed'],
  ['expired', 'Expired'],
  ['refunded', 'Refunded'],
];
const BUCKETS = {
  wallet_topups: {
    id: 'sa-billing-wallet-topups',
    title: 'Wallet top-ups',
    subtitle: 'Money added to a library wallet.',
  },
  paid_receipts: {
    id: 'sa-billing-paid-receipts',
    title: 'Paid receipts',
    subtitle: 'Paid software invoices, not wallet top-ups.',
  },
  other_invoices: {
    id: 'sa-billing-other-invoices',
    title: 'Other invoices',
    subtitle: 'Open, pending, failed, and expired invoices.',
  },
};
const empty = { preset: 'all_time', from: '', to: '', q: '', status: '', kind: '', provider: '', delivery: '', page: 1 };

const money = (minor, currency = 'INR') => {
  const n = (Number(minor || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'INR' ? `₹${n}` : `${n} ${currency}`;
};
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const presetLabel = (q) => LEGACY_PRESETS[q.preset] || datePeriodLabel(q.preset, q);
const field = { margin: 0, display: 'flex', flexDirection: 'column', gap: 4 };

const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== '' && v != null && !(k === 'page' && Number(v) === 1) && !(k === 'preset' && v === 'all_time')) p.set(k, String(v)); });
  if (o.page && Number(o.page) !== 1) p.set('page', String(o.page));
  const s = p.toString();
  return s ? `?${s}` : '';
};

const refOf = (row) => row.receiptNo || row.providerPaymentRef || row.providerRef || row.invoiceId || '—';

export function BillingHistoryPage({ onOpen }) {
  const [counts, setCounts] = useState(null);
  useEffect(() => {
    let live = true;
    api.adminBillingHistory('?limit=1').then(data => { if (live) setCounts(data?.buckets || null); }).catch(() => {});
    return () => { live = false; };
  }, []);
  const cards = [
    ['wallet_topups', 'Wallet top-ups', 'Top-ups in every status.'],
    ['paid_receipts', 'Paid receipts', 'Paid software invoices.'],
    ['other_invoices', 'Other invoices', 'Invoices that are not paid receipts or top-ups.'],
  ];
  return (
    <SaPage id="sa-billing-history">
      <SaPageHeader
        onBack={() => onOpen('landing')}
        backLabel="Payments"
        title="Billing history"
        subtitle="Choose a list. Each one opens on its own page."
      />
      <div className="sa-nav-grid">
        {cards.map(([id, title, text]) => (
          <button key={id} type="button" id={BUCKETS[id].id} className="premium-card sa-nav-card" onClick={() => onOpen(id)}>
            <strong>{title}</strong>
            <span>{text}</span>
            {counts ? <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{counts[id] ?? 0}</span> : null}
          </button>
        ))}
      </div>
    </SaPage>
  );
}

export function BillingHistoryList({ bucket, onOpen, onOpenCollections }) {
  const meta = BUCKETS[bucket] || BUCKETS.other_invoices;
  const [query, setQuery] = useState(empty);
  const [draft, setDraft] = useState(empty);
  const [search, setSearch] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (next) => {
    setLoading(true);
    try { setData(await api.adminBillingHistory(qs({ ...next, bucket }))); }
    catch (e) { toast.error(e.message || 'Could not load billing history'); }
    finally { setLoading(false); }
  }, [bucket]);
  useEffect(() => { load(query); }, [load, query]);
  useEffect(() => { setDraft(query); setSearch(query.q || ''); }, [query]);

  const apply = (e) => {
    e?.preventDefault();
    setQuery({ ...draft, q: search, page: 1 });
  };
  const reset = () => {
    setDraft(empty);
    setSearch('');
    setQuery(empty);
  };
  const chips = [];
  if ((query.preset || 'all_time') !== 'all_time') chips.push({ key: 'preset', label: presetLabel(query), onDismiss: () => setQuery({ ...query, preset: 'all_time', from: '', to: '', page: 1 }) });
  if (query.q) chips.push({ key: 'q', label: `Search: ${query.q}`, onDismiss: () => setQuery({ ...query, q: '', page: 1 }) });
  if (query.status) chips.push({ key: 'status', label: STATUSES.find(([id]) => id === query.status)?.[1] || statusLabel(query.status), onDismiss: () => setQuery({ ...query, status: '', page: 1 }) });
  if (query.kind) chips.push({ key: 'kind', label: query.kind === 'topup' ? 'Wallet top-up' : statusLabel(query.kind), onDismiss: () => setQuery({ ...query, kind: '', page: 1 }) });
  if (query.provider) chips.push({ key: 'provider', label: providerLabel(query.provider), onDismiss: () => setQuery({ ...query, provider: '', page: 1 }) });
  if (query.delivery) chips.push({ key: 'delivery', label: `Receipt: ${statusLabel(query.delivery)}`, onDismiss: () => setQuery({ ...query, delivery: '', page: 1 }) });

  const items = data?.items || [];
  return (
    <SaPage id={meta.id}>
      <SaPageHeader onBack={() => onOpen('history')} backLabel="Billing history" title={meta.title} subtitle={meta.subtitle} />
      {data?.buckets && (
        <SaSummaryGrid>
          <SaSummaryCard label="In this list" value={data.total ?? 0} sub={data.range?.from ? `${data.range.from} to ${data.range.to}` : 'All time'} />
          <SaSummaryCard label="Wallet top-ups" value={data.buckets.wallet_topups ?? 0} />
          <SaSummaryCard label="Paid receipts" value={data.buckets.paid_receipts ?? 0} />
          <SaSummaryCard label="Other invoices" value={data.buckets.other_invoices ?? 0} />
        </SaSummaryGrid>
      )}
      <form onSubmit={(e) => { e.preventDefault(); setQuery({ ...query, q: search.trim(), page: 1 }); }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input id="sa-billing-history-search" className="form-input" style={{ flex: '1 1 220px', minWidth: 0 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Library, owner, receipt, or reference" />
        <button className="btn btn-secondary" type="submit">Search</button>
      </form>
      <FiltersMenu
        buttonId="sa-billing-history-filters-button"
        menuId="sa-billing-history-filters-menu"
        chips={chips}
        onApply={apply}
        onReset={reset}
        onClose={() => setDraft(query)}
        applyDisabled={loading || (draft.preset === 'custom' && (!draft.from || !draft.to))}
      >
        <DatePeriodSelect
          id="sa-billing-history-filters-period"
          value={draft.preset || 'all_time'}
          onChange={(preset) => setDraft(d => ({ ...d, preset }))}
          from={draft.from}
          to={draft.to}
          onFromChange={(from) => setDraft(d => ({ ...d, from }))}
          onToChange={(to) => setDraft(d => ({ ...d, to }))}
        />
        <label className="form-label" htmlFor="sa-billing-history-status" style={field}>Status
          <select id="sa-billing-history-status" className="form-select" value={draft.status || ''} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
            {STATUSES.map(([id, label]) => <option key={id || 'all'} value={id}>{label}</option>)}
          </select>
        </label>
        <label className="form-label" style={field}>Transaction type
          <select className="form-select" value={draft.kind || ''} onChange={e => setDraft(d => ({ ...d, kind: e.target.value }))}>
            <option value="">All types</option>
            <option value="subscription">Subscription</option>
            <option value="upgrade">Upgrade</option>
            <option value="topup">Wallet top-up</option>
          </select>
        </label>
        <label className="form-label" style={field}>Payment method
          <select className="form-select" value={draft.provider || ''} onChange={e => setDraft(d => ({ ...d, provider: e.target.value }))}>
            <option value="">All methods</option>
            <option value="razorpay">Razorpay</option>
            <option value="paypal">PayPal</option>
            <option value="wallet">Wallet</option>
            <option value="none">None</option>
          </select>
        </label>
        <label className="form-label" style={field}>Receipt delivery
          <select className="form-select" value={draft.delivery || ''} onChange={e => setDraft(d => ({ ...d, delivery: e.target.value }))}>
            <option value="">Any</option>
            <option value="not_attempted">Not attempted</option>
            <option value="pending">Pending</option>
            <option value="sending">Sending</option>
            <option value="sent">Sent</option>
            <option value="logged">Logged</option>
            <option value="failed">Failed</option>
            <option value="skipped">Skipped</option>
          </select>
        </label>
      </FiltersMenu>
      <div id="sa-billing-history-list" data-bucket={bucket}>
        {loading && !data && <p style={{ margin: 0, color: 'var(--text-secondary)' }}>Loading…</p>}
        {!loading && items.length === 0 && (
          <SaEmpty title="Nothing in this list">
            Try another period, or clear search and filters.
          </SaEmpty>
        )}
        {items.length > 0 && (
          <SaList>
            {items.map(row => (
              <SaListRow
                key={row.invoiceId}
                title={row.libraryName || 'Library'}
                meta={when(row.createdAt)}
                extra={refOf(row)}
                amount={money(row.totalMinor, row.currency)}
                status={row.status}
                onClick={() => onOpen('record', row.invoiceId)}
              />
            ))}
          </SaList>
        )}
      </div>
      {data && (
        <div className="sa-action-row" style={{ alignItems: 'center' }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={query.page <= 1 || loading} onClick={() => setQuery({ ...query, page: query.page - 1 })}>Previous</button>
          <span style={{ fontSize: 13 }}>Page {data.page} of {data.pages}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={query.page >= data.pages || loading} onClick={() => setQuery({ ...query, page: query.page + 1 })}>Next</button>
        </div>
      )}
      {onOpenCollections && (
        <button type="button" className="btn btn-ghost" style={{ justifySelf: 'start' }} onClick={() => onOpenCollections(query.q || '')}>Open Collection Details</button>
      )}
    </SaPage>
  );
}

export function BillingRecordPage({ invoiceId, bucket, onOpen, onOpenCollections, onOpenLibrary }) {
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState(false);
  const back = BUCKETS[bucket] ? bucket : 'history';
  const backLabel = BUCKETS[bucket]?.title || 'Billing history';
  useEffect(() => {
    let live = true;
    setRecord(null);
    api.adminBillingRecord(invoiceId).then(row => { if (live) setRecord(row); }).catch(e => toast.error(e.message || 'Could not load this invoice'));
    return () => { live = false; };
  }, [invoiceId]);
  const resend = async () => {
    if (!record || record.status !== 'paid') return;
    if (!window.confirm('Resend this receipt to the verified delivery channel for this library?')) return;
    setBusy(true);
    try {
      const r = await api.post(`/admin/software-plan/invoices/${encodeURIComponent(record.invoiceId)}/receipt/deliver`, { confirm: true });
      toast.success(r.delivery?.status === 'sent' ? 'Receipt sent' : 'Resend attempted; check delivery history');
      setRecord(await api.adminBillingRecord(record.invoiceId));
    } catch (e) { toast.error(e.message || 'Could not resend'); }
    finally { setBusy(false); }
  };
  if (!record) return <SaPage id="sa-billing-record"><p style={{ margin: 0 }}>Loading invoice…</p></SaPage>;
  const providerRef = record.providerPaymentRef || record.providerRef || record.providerOrderRef || '';
  return (
    <SaPage id="sa-billing-record">
      <SaPageHeader
        onBack={() => onOpen(back)}
        backLabel={backLabel}
        title={record.libraryName || 'Invoice'}
      />
      <SaRecordHero
        name={record.libraryName || 'Invoice'}
        amount={money(record.totalMinor, record.currency)}
        status={record.status}
      />
      <SaRecordTimeline steps={[
        { label: 'Created', at: record.createdAt ? when(record.createdAt) : null },
        { label: 'Due', at: record.dueAt ? when(record.dueAt) : null },
        { label: 'Paid', at: record.paidAt ? when(record.paidAt) : null },
      ]} />
      <SaRecordSection title="Payment">
        <SaFact label="Receipt">{record.receiptNo || 'No receipt yet'}</SaFact>
        <SaFact label="Taxes">{money(record.taxMinor, record.currency)}</SaFact>
        <SaFact label="From wallet">{money(record.walletMinor, record.currency)}</SaFact>
        <SaFact label="Paid online">{money(record.gatewayMinor, record.currency)}</SaFact>
        <SaFact label="Counted as software collection">{record.collected ? 'Yes' : 'No'}</SaFact>
        <SaFact label="Payment method">{providerLabel(record.provider)}</SaFact>
        <SaFact label="Receipt sent">{statusLabel(record.receiptDelivery?.status || record.delivery?.status || 'not attempted')}</SaFact>
        {record.receiptDelivery?.reason ? <SaFact label="Delivery note">{record.receiptDelivery.reason}</SaFact> : null}
      </SaRecordSection>
      <SaRecordSection title="Owner">
        <SaFact label="Name">{record.ownerName || '—'}</SaFact>
        <SaFact label="Email">{record.ownerEmail || '—'}</SaFact>
        <SaFact label="Phone">{record.ownerPhone || '—'}</SaFact>
      </SaRecordSection>
      <SaMoreInfo>
        <SaFact label="Invoice">{record.invoiceId || '—'}</SaFact>
        {record.tenantId ? <SaFact label="Library id">{record.tenantId}</SaFact> : null}
        <SaFact label="Provider reference">{providerRef || '—'}</SaFact>
      </SaMoreInfo>
      <SaHelper>
        {record.status === 'paid'
          ? `${record.collectedNote || 'This paid invoice is collected money.'} Wallet ledger entries are not copied here.`
          : 'Resend is available only for paid receipts. Open, pending, failed, and expired invoices are not collected money and do not get a paid receipt.'}
      </SaHelper>
      <SaRecordActions>
        {record.status === 'paid' && (
          <>
            <button type="button" className="btn btn-secondary" onClick={() => api.adminSoftwareReceipt(record.invoiceId, 'pdf').catch(e => toast.error(e.message))}>Download receipt</button>
            <button type="button" id="sa-billing-resend" className="btn btn-secondary" disabled={busy} onClick={resend}>Resend receipt</button>
          </>
        )}
        {onOpenCollections && <button type="button" className="btn btn-secondary" onClick={() => onOpenCollections(record.invoiceId)}>Open Collection Details</button>}
        {onOpenLibrary && record.tenantId && <button type="button" className="btn btn-secondary" onClick={() => onOpenLibrary(record.tenantId)}>Library details</button>}
      </SaRecordActions>
    </SaPage>
  );
}
