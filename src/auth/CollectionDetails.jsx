import React, { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../utils/api';
import { SaModal } from './SaModal';
import { DatePeriodSelect, FiltersMenu, datePeriodLabel } from './FiltersMenu';

export const inrMinor = (minor) => `₹${(Number(minor || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const Bars = ({ rows }) => {
  const max = Math.max(1, ...rows.map(r => r.collectedMinor || 0));
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map(r => (
        <div key={r.month} style={{ display: 'grid', gridTemplateColumns: 'minmax(70px, 28%) 1fr auto', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <span>{r.month}{r.current ? ' (current)' : ''}</span>
          <div style={{ background: 'var(--border-light, #f3f4f6)', borderRadius: 4, height: 10 }}>
            <div style={{ width: `${((r.collectedMinor || 0) / max) * 100}%`, background: r.current ? '#047857' : '#111827', height: 10, borderRadius: 4 }} />
          </div>
          <span style={{ fontWeight: 600 }}>{inrMinor(r.collectedMinor)}</span>
        </div>
      ))}
      {rows.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No verified software collection in this range.</span>}
    </div>
  );
};

const Money = ({ label, value, sub, tone }) => (
  <div className="premium-card" style={{ padding: 14, minWidth: 160, flex: '1 1 180px', background: tone, borderColor: 'transparent' }}>
    <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{label}</div>
    <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.03em' }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: '#4b5563', marginTop: 4 }}>{sub}</div>}
  </div>
);

const KIND_LABEL = { subscription: 'Subscription', upgrade: 'Upgrade', topup: 'Wallet top-up' };
const presetLabel = (q) => datePeriodLabel(q.preset, q);
const emptyQuery = { preset: 'this_month', q: '', kind: '', status: '', provider: '', from: '', to: '' };

const Field = ({ label, value }) => (
  <div>
    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    <div style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{value ?? '—'}</div>
  </div>
);

export function CollectionDetails({ query, data, loading, onQuery, onBack }) {
  const [draft, setDraft] = useState(query);
  const [open, setOpen] = useState(null);
  const [detail, setDetail] = useState(null);
  useEffect(() => { setDraft(query); }, [query]);
  const set = (k) => (e) => setDraft(d => ({ ...d, [k]: e.target.value }));
  const apply = (e) => {
    e?.preventDefault();
    onQuery({ ...draft, preset: draft.preset || 'this_month' });
  };
  const reset = () => {
    setDraft(emptyQuery);
    onQuery(emptyQuery);
  };
  const chips = [];
  if ((query.preset || 'this_month') !== 'this_month') {
    chips.push({ key: 'preset', label: presetLabel(query), onDismiss: () => onQuery({ ...query, preset: 'this_month', from: '', to: '' }) });
  }
  if (query.q) chips.push({ key: 'q', label: `Search: ${query.q}`, onDismiss: () => onQuery({ ...query, q: '' }) });
  if (query.kind) chips.push({ key: 'kind', label: KIND_LABEL[query.kind] || query.kind, onDismiss: () => onQuery({ ...query, kind: '' }) });
  if (query.status) chips.push({ key: 'status', label: query.status, onDismiss: () => onQuery({ ...query, status: '' }) });
  if (query.provider) chips.push({ key: 'provider', label: query.provider, onDismiss: () => onQuery({ ...query, provider: '' }) });
  const inspect = async (row) => {
    setOpen(row);
    setDetail(null);
    try { setDetail(await api.adminCollectionRecord(row.recordId)); }
    catch (err) { toast.error(err.message || 'Could not load this record'); }
  };
  const t = data?.totals;
  const shown = detail || open;
  return (
    <div id="sa-collection-details" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}><ArrowLeft size={14} /> Business dashboard</button>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 0' }}>Collection details</h2>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0', maxWidth: 720 }}>{data?.definition}</p>
        </div>
      </div>
      <FiltersMenu
        buttonId="sa-collection-filters-button"
        menuId="sa-collection-filters-menu"
        chips={chips}
        onApply={apply}
        onReset={reset}
        onClose={() => setDraft(query)}
        applyDisabled={loading}
      >
        <DatePeriodSelect
          id="sa-collection-filters-period"
          value={draft.preset || 'this_month'}
          onChange={(preset) => setDraft(d => ({ ...d, preset }))}
          from={draft.from}
          to={draft.to}
          onFromChange={(from) => setDraft(d => ({ ...d, from }))}
          onToChange={(to) => setDraft(d => ({ ...d, to }))}
        />
        <label className="form-label" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>Search
          <input className="form-input" value={draft.q || ''} onChange={set('q')} placeholder="Library, owner, transaction, receipt" />
        </label>
        <label className="form-label" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>Payment type
          <select className="form-input" value={draft.kind || ''} onChange={set('kind')}>
            <option value="">All types</option>
            <option value="subscription">Subscription</option>
            <option value="upgrade">Upgrade</option>
            <option value="topup">Wallet top-up</option>
          </select>
        </label>
        <label className="form-label" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>Status
          <select className="form-input" value={draft.status || ''} onChange={set('status')}>
            <option value="">All statuses</option>
            {(data?.facets?.statuses || ['paid', 'open', 'settling', 'void', 'past_due', 'requires_recovery']).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="form-label" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>Provider
          <select className="form-input" value={draft.provider || ''} onChange={set('provider')}>
            <option value="">All providers</option>
            {(data?.facets?.providers || []).map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </FiltersMenu>
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>{data?.range?.from ? `${data.range.from} to ${data.range.to}` : 'All time'} · {data?.timezone || 'Asia/Kolkata'}. Totals follow the date range. Search and filters change the list.</p>
      {loading && !data && <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Loading collection details…</p>}
      {t && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Money label="Verified software collection" value={inrMinor(t.verifiedCollectionsMinor)} sub={`${t.paymentCount} verified cash payments. ${data.labels.verifiedCollections}`} tone="#ecfdf5" />
            <Money label="Net software collection" value={inrMinor(t.netCollectionMinor)} sub={data.labels.netCollection} tone="#f0fdf4" />
            <Money label="Gross receipts" value={inrMinor(t.grossReceiptsMinor)} sub={data.labels.grossReceipts} tone="#eff6ff" />
            <Money label="Pending payments" value={inrMinor(t.pendingMinor)} sub={`${t.pendingCount} open or settling. ${data.labels.pending}`} tone="#fff7ed" />
            <Money label="Wallet top-ups" value={inrMinor(t.walletTopupsMinor)} sub={`${t.walletTopupCount} paid top-ups. ${data.labels.walletTopups}`} tone="#f5f3ff" />
            <Money label="Refunds" value={inrMinor(t.refundsMinor)} sub={t.refundsNote} tone="#fef2f2" />
          </div>
          <div className="premium-card" style={{ padding: 14, background: '#fffbeb' }}>
            <strong style={{ fontSize: 14 }}>Projected / scheduled — {data.projected?.month}</strong>
            <div style={{ fontSize: 22, fontWeight: 800, marginTop: 4 }}>{inrMinor(data.projected?.minor)}</div>
            <p style={{ fontSize: 12, color: '#92400e', margin: '4px 0 0' }}>{data.projected?.label} {data.labels.projected} {data.projected?.count || 0} open invoice{data.projected?.count === 1 ? '' : 's'} due next month.</p>
          </div>
          <div className="premium-card" style={{ padding: 14 }}>
            <strong style={{ fontSize: 14 }}>Monthly software collection</strong>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 8px' }}>
              Current month {inrMinor(data.comparison?.currentMonthMinor)} compared with prior months in this range {inrMinor(data.comparison?.priorMonthsMinor)}. {data.comparison?.note}
            </p>
            <Bars rows={data.monthly || []} />
          </div>
          <div className="premium-card sa-table-card" style={{ padding: 0 }}>
            <div className="table-container">
              <table className="data-grid" style={{ width: '100%' }}>
                <thead>
                  <tr><th>Date</th><th>Library</th><th>Type</th><th>Status</th><th>Provider</th><th>Gateway cash</th><th>Bucket</th></tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={7}>Loading…</td></tr>}
                  {!loading && data.transactions.length === 0 && <tr><td colSpan={7}>No software transactions in this range.</td></tr>}
                  {data.transactions.map(row => (
                    <tr key={`${row.source}-${row.recordId}`} onClick={() => inspect(row)} style={{ cursor: 'pointer' }}>
                      <td>{fmtDate(row.eventAt)}</td>
                      <td><strong>{row.libraryName || row.libraryId}</strong><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{row.ownerEmail || '—'}</div></td>
                      <td>{row.kind}</td>
                      <td>{row.status}{row.projected ? ' · scheduled' : ''}</td>
                      <td>{row.provider || '—'}</td>
                      <td>{inrMinor(row.collectedMinor)}</td>
                      <td>{row.bucket === 'collection' ? 'Collected' : row.bucket === 'wallet_topup' ? 'Wallet top-up' : row.bucket === 'pending' || row.bucket === 'projected' ? 'Not collected' : 'Not collected'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
      <SaModal open={!!open} title="Transaction" onClose={() => { setOpen(null); setDetail(null); }} maxWidth={560}>
        {shown && (
          <div style={{ display: 'grid', gap: 10 }}>
            <Field label="Invoice" value={shown.invoiceId} />
            <Field label="Receipt number" value={shown.receiptNo} />
            <Field label="Receipt" value={shown.receiptUrl || 'No receipt yet'} />
            {shown.receiptPath && (
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.downloadFile(shown.receiptPath, `receipt-${shown.receiptNo || shown.invoiceId}.pdf`).catch(e => toast.error(e.message))}>Download receipt</button>
            )}
            <Field label="Provider" value={shown.provider} />
            <Field label="Provider reference" value={shown.providerRef} />
            <Field label="Provider payment" value={shown.providerPaymentRef} />
            <Field label="Provider order" value={shown.providerOrderRef} />
            <Field label="Verification" value={shown.verificationState} />
            <Field label="Receipt delivery" value={shown.receiptDeliveryStatus || 'Not recorded'} />
            <Field label="Total" value={inrMinor(shown.totalMinor)} />
            <Field label="Wallet amount" value={inrMinor(shown.walletMinor)} />
            <Field label="Gateway cash" value={inrMinor(shown.gatewayMinor)} />
            <Field label="Counted as software collection" value={inrMinor(shown.collectedMinor)} />
            <Field label="Library" value={`${shown.libraryName || '—'} (${shown.libraryId || '—'})`} />
            <Field label="Owner" value={[shown.ownerName, shown.ownerEmail].filter(Boolean).join(' · ') || '—'} />
            <Field label="Paid" value={fmtDate(shown.paidAt)} />
            <Field label="Created" value={fmtDate(shown.createdAt)} />
            <Field label="Due" value={fmtDate(shown.dueAt)} />
            {shown.projected && <p style={{ fontSize: 13, color: '#92400e', margin: 0 }}>{shown.projectedLabel}</p>}
          </div>
        )}
      </SaModal>
    </div>
  );
}
