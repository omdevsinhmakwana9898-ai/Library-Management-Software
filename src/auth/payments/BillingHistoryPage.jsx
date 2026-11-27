import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { FiltersMenu } from '../FiltersMenu';

const PRESETS = [
  ['today', 'Today'],
  ['last_2_days', '2 days'],
  ['last_7_days', 'Last 7 days'],
  ['this_month', 'This month'],
  ['last_month', 'Last month'],
  ['last_2_months', 'Last 2 months'],
  ['last_3_months', 'Last 3 months'],
  ['last_6_months', 'Last 6 months'],
  ['last_1_year', '1 year'],
  ['all_time', 'All time'],
  ['custom', 'Custom'],
];
const STATUSES = [
  ['', 'All statuses'],
  ['paid', 'Paid'],
  ['open', 'Open'],
  ['pending', 'Pending'],
  ['failed', 'Failed'],
  ['expired', 'Expired'],
  ['refunded', 'Refunded'],
];
const empty = { preset: 'all_time', from: '', to: '', q: '', status: '', kind: '', provider: '', delivery: '', page: 1 };

const money = (minor, currency = 'INR') => {
  const n = (Number(minor || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return currency === 'INR' ? `₹${n}` : `${n} ${currency}`;
};
const when = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : '—');
const presetLabel = (q) => (q.preset === 'custom' ? `Custom${q.from || q.to ? `: ${q.from || '…'} – ${q.to || '…'}` : ''}` : (PRESETS.find(([id]) => id === q.preset)?.[1] || q.preset));

const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== '' && v != null && !(k === 'page' && Number(v) === 1) && !(k === 'preset' && v === 'all_time')) p.set(k, String(v)); });
  if (o.page && Number(o.page) !== 1) p.set('page', String(o.page));
  const s = p.toString();
  return s ? `?${s}` : '';
};

function Choice({ label, pressed, onClick }) {
  return <button type="button" className={`btn btn-sm ${pressed ? 'btn-primary' : 'btn-secondary'}`} style={{ justifyContent: 'flex-start', width: '100%' }} aria-pressed={pressed} onClick={onClick}>{label}</button>;
}

export function BillingHistoryPage({ onOpen, onOpenCollections, initialQuery }) {
  const [query, setQuery] = useState(initialQuery || empty);
  const [draft, setDraft] = useState(initialQuery || empty);
  const [search, setSearch] = useState(initialQuery?.q || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (next) => {
    setLoading(true);
    try { setData(await api.adminBillingHistory(qs(next))); }
    catch (e) { toast.error(e.message || 'Could not load billing history'); }
    finally { setLoading(false); }
  }, []);
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
  if (query.status) chips.push({ key: 'status', label: STATUSES.find(([id]) => id === query.status)?.[1] || query.status, onDismiss: () => setQuery({ ...query, status: '', page: 1 }) });
  if (query.kind) chips.push({ key: 'kind', label: query.kind, onDismiss: () => setQuery({ ...query, kind: '', page: 1 }) });
  if (query.provider) chips.push({ key: 'provider', label: query.provider, onDismiss: () => setQuery({ ...query, provider: '', page: 1 }) });
  if (query.delivery) chips.push({ key: 'delivery', label: `Receipt: ${query.delivery}`, onDismiss: () => setQuery({ ...query, delivery: '', page: 1 }) });

  const items = data?.items || [];
  const sections = [
    ['open_wallet_topup', 'Open wallet top-ups', 'Not collected. These are separate from paid receipts and from the wallet ledger.'],
    ['paid_receipt', 'Paid receipts', 'Only status paid. Wallet top-up receipts are gross receipts, not a second copy of software collection.'],
    ['not_collected', 'Other invoices', 'Open, pending, failed, expired, and void rows are not collected money.'],
  ];

  return (
    <div id="sa-billing-history" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpen('landing')}><ArrowLeft size={14} /> Payments</button>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 0' }}>Software billing history</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
          Same invoices as Collection Details. Open and pending payments are not collected money. CSV export and delivery-failure diagnostics are waiting on owner confirmation.
        </p>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); setQuery({ ...query, q: search.trim(), page: 1 }); }} style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input id="sa-billing-history-search" className="form-input" style={{ flex: '1 1 220px', minWidth: 0 }} value={search} onChange={e => setSearch(e.target.value)} placeholder="Library, owner, email, phone, payment, invoice, receipt, provider reference" />
        <button className="btn btn-secondary btn-sm" type="submit">Search</button>
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
        <div role="group" aria-label="Date range" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {PRESETS.map(([id, label]) => (
            <Choice key={id} label={label} pressed={draft.preset === id} onClick={() => setDraft(d => ({ ...d, preset: id }))} />
          ))}
        </div>
        {draft.preset === 'custom' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="form-label" style={{ margin: 0 }}>From<input className="form-input" type="date" value={draft.from || ''} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} required /></label>
            <label className="form-label" style={{ margin: 0 }}>To<input className="form-input" type="date" value={draft.to || ''} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} required /></label>
          </div>
        )}
        <label className="form-label" style={{ margin: 0 }}>Status
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
            {STATUSES.map(([id, label]) => <Choice key={id || 'all'} label={label} pressed={(draft.status || '') === id} onClick={() => setDraft(d => ({ ...d, status: id }))} />)}
          </div>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Transaction type
          <select className="form-input" value={draft.kind || ''} onChange={e => setDraft(d => ({ ...d, kind: e.target.value }))}>
            <option value="">All types</option>
            <option value="subscription">Subscription</option>
            <option value="upgrade">Upgrade</option>
            <option value="topup">Wallet top-up</option>
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Payment method / provider
          <select className="form-input" value={draft.provider || ''} onChange={e => setDraft(d => ({ ...d, provider: e.target.value }))}>
            <option value="">All methods</option>
            <option value="razorpay">Razorpay</option>
            <option value="paypal">PayPal</option>
            <option value="wallet">Wallet</option>
            <option value="none">None</option>
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Receipt delivery
          <select className="form-input" value={draft.delivery || ''} onChange={e => setDraft(d => ({ ...d, delivery: e.target.value }))}>
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
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>
        {data?.range?.from ? `${data.range.from} to ${data.range.to}` : 'All time'} · {data?.range?.timezone || 'Asia/Kolkata'} · {data?.total ?? 0} matches.
        Paid → paid. Open → open. Pending → settling. Failed → requires_recovery. Expired → past_due. Refunded matches nothing — there is no software refund model. Void stays in All statuses.
      </p>
      {loading && !data && <p>Loading billing history…</p>}
      {data && sections.map(([group, title, note]) => {
        const rows = items.filter(row => row.group === group);
        if (!rows.length && group === 'not_collected' && items.length) return null;
        return (
          <section key={group} className="premium-card" style={{ padding: 14, minWidth: 0 }}>
            <strong>{title}</strong>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 8px' }}>{note}</p>
            {!rows.length && <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: 0 }}>None on this page.</p>}
            {rows.map(row => (
              <button key={row.invoiceId} type="button" onClick={() => onOpen('record', row.invoiceId)} style={{ display: 'grid', gap: 2, width: '100%', textAlign: 'left', border: 0, borderTop: '1px solid var(--border-light, #e5e7eb)', background: 'transparent', padding: '8px 0', cursor: 'pointer', fontSize: 13 }}>
                <strong style={{ overflowWrap: 'anywhere' }}>{row.libraryName || row.tenantId} · {row.planName || row.planId || (row.kind === 'topup' ? 'Wallet top-up' : 'Invoice')} · {row.status}</strong>
                <span>{when(row.createdAt)} · {row.receiptNo || row.invoiceId}</span>
                <span>{money(row.totalMinor, row.currency)} · wallet {money(row.walletMinor, row.currency)} · gateway {money(row.gatewayMinor, row.currency)}</span>
                <span style={{ color: 'var(--text-secondary)' }}>{row.collected ? 'Collected' : 'Not collected'} · {row.provider || 'Wallet'} · {row.providerPaymentRef || row.providerRef || row.invoiceId}</span>
              </button>
            ))}
          </section>
        );
      })}
      {data && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={query.page <= 1 || loading} onClick={() => setQuery({ ...query, page: query.page - 1 })}>Previous</button>
          <span style={{ fontSize: 13 }}>Page {data.page} of {data.pages}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={query.page >= data.pages || loading} onClick={() => setQuery({ ...query, page: query.page + 1 })}>Next</button>
        </div>
      )}
      {onOpenCollections && (
        <button type="button" className="btn btn-ghost btn-sm" style={{ justifySelf: 'start' }} onClick={() => onOpenCollections(query.q || '')}>Open Collection Details</button>
      )}
    </div>
  );
}

export function BillingRecordPage({ invoiceId, onOpen, onOpenCollections, onOpenLibrary }) {
  const [record, setRecord] = useState(null);
  const [busy, setBusy] = useState(false);
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
  if (!record) return <div id="sa-billing-record" style={{ padding: 16 }}>Loading invoice…</div>;
  const rows = [
    ['Amount', money(record.totalMinor, record.currency)],
    ['Taxes', money(record.taxMinor, record.currency)],
    ['Wallet applied', money(record.walletMinor, record.currency)],
    ['External gateway paid', money(record.gatewayMinor, record.currency)],
    ['Status', record.status],
    ['Collected', record.collected ? 'Yes' : 'No'],
    ['Created', when(record.createdAt)],
    ['Paid', when(record.paidAt)],
    ['Due', when(record.dueAt)],
    ['Receipt', record.receiptNo || '—'],
    ['Invoice', record.invoiceId],
    ['Provider reference', record.providerPaymentRef || record.providerRef || record.providerOrderRef || '—'],
    ['Delivery', record.receiptDelivery?.status || record.delivery?.status || 'not attempted'],
  ];
  return (
    <div id="sa-billing-record" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpen('history')}><ArrowLeft size={14} /> Billing history</button>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 0', overflowWrap: 'anywhere' }}>{record.libraryName || record.tenantId}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>{record.collectedNote}</p>
      </div>
      <div className="premium-card" style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
        {rows.map(([label, value]) => (
          <div key={label}>
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{label}</div>
            <div style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{value}</div>
          </div>
        ))}
      </div>
      <p style={{ fontSize: 13, margin: 0 }}>{record.ownerName || 'Owner'} · {record.ownerEmail || 'no email'} · {record.ownerPhone || 'no phone'}</p>
      {record.receiptDelivery?.reason && <p style={{ color: '#b45309', fontSize: 13 }}>{record.receiptDelivery.reason}</p>}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {record.status === 'paid' && (
          <>
            <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.adminSoftwareReceipt(record.invoiceId, 'pdf').catch(e => toast.error(e.message))}>Download receipt</button>
            <button type="button" id="sa-billing-resend" className="btn btn-secondary btn-sm" disabled={busy} onClick={resend}>Resend receipt</button>
          </>
        )}
        {onOpenCollections && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenCollections(record.invoiceId)}>Collection Details</button>}
        {onOpenLibrary && record.tenantId && <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpenLibrary(record.tenantId)}>Library details</button>}
      </div>
      {record.status !== 'paid' && <p style={{ fontSize: 13, margin: 0 }}>Resend is available only for paid receipts. Open, pending, failed, and expired invoices are not collected money and do not get a paid receipt.</p>}
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>{record.walletLedger?.note}</p>
    </div>
  );
}
