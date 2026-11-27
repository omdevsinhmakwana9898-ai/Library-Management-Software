import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../utils/api';
import { DatePeriodSelect, FiltersMenu, datePeriodLabel } from './FiltersMenu';
import {
  SaEmpty,
  SaFact,
  SaFactList,
  SaList,
  SaListRow,
  SaPage,
  SaPageHeader,
  SaStatusBadge,
  SaSummaryCard,
  SaSummaryGrid,
  providerLabel,
  statusLabel,
} from './saPage';

export const inrMinor = (minor) => `₹${(Number(minor || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d) => (d ? new Date(d).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : '—');

const Bars = ({ rows }) => {
  const max = Math.max(1, ...rows.map(r => r.collectedMinor || 0));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map(r => (
        <div key={r.month} style={{ display: 'grid', gridTemplateColumns: 'minmax(70px, 28%) 1fr auto', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <span>{r.month}{r.current ? ' (current)' : ''}</span>
          <div style={{ background: 'var(--border-light, #f3f4f6)', borderRadius: 4, height: 10 }}>
            <div style={{ width: `${((r.collectedMinor || 0) / max) * 100}%`, background: r.current ? '#047857' : '#111827', height: 10, borderRadius: 4 }} />
          </div>
          <span style={{ fontWeight: 600 }}>{inrMinor(r.collectedMinor)}</span>
        </div>
      ))}
      {rows.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No verified software collection in this range.</span>}
    </div>
  );
};

const KIND_LABEL = { subscription: 'Subscription', upgrade: 'Upgrade', topup: 'Wallet top-up' };
const STATUS_OPTIONS = [
  ['paid', 'Paid'],
  ['open', 'Open'],
  ['settling', 'Pending'],
  ['void', 'Voided'],
  ['past_due', 'Expired'],
  ['requires_recovery', 'Failed'],
];
const presetLabel = (q) => datePeriodLabel(q.preset, q);
const emptyQuery = { preset: 'this_month', q: '', kind: '', status: '', provider: '', from: '', to: '' };
const bucketLabel = (bucket) => (
  bucket === 'collection' ? 'Collected'
    : bucket === 'wallet_topup' ? 'Wallet top-up'
      : 'Not collected'
);

function CollectionRecordPage({ row, detail, onBack }) {
  const shown = detail || row;
  return (
    <SaPage id="sa-collection-record">
      <SaPageHeader
        onBack={onBack}
        backLabel="Collection details"
        title={shown.libraryName || 'Transaction'}
        subtitle="Receipt, provider, and how this payment was counted."
      />
      {!detail && <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>Loading this record…</p>}
      <SaSummaryGrid>
        <SaSummaryCard label="Counted as software collection" value={inrMinor(shown.collectedMinor)} tone="#ecfdf5" />
        <SaSummaryCard label="Total" value={inrMinor(shown.totalMinor)} sub={shown.projected ? shown.projectedLabel : null} />
        <SaSummaryCard label="Status" value={<SaStatusBadge status={shown.status} />} sub={shown.projected ? 'Scheduled for a later month' : null} />
      </SaSummaryGrid>
      <SaFactList>
        <SaFact label="Invoice">{shown.invoiceId || '—'}</SaFact>
        <SaFact label="Receipt number">{shown.receiptNo || '—'}</SaFact>
        <SaFact label="Receipt">{shown.receiptUrl || 'No receipt yet'}</SaFact>
        <SaFact label="Provider">{providerLabel(shown.provider)}</SaFact>
        <SaFact label="Provider reference">{shown.providerRef || '—'}</SaFact>
        <SaFact label="Provider payment">{shown.providerPaymentRef || '—'}</SaFact>
        <SaFact label="Provider order">{shown.providerOrderRef || '—'}</SaFact>
        <SaFact label="Verification">{statusLabel(shown.verificationState)}</SaFact>
        <SaFact label="Receipt delivery">{statusLabel(shown.receiptDeliveryStatus) === '—' ? 'Not recorded' : statusLabel(shown.receiptDeliveryStatus)}</SaFact>
        <SaFact label="Wallet amount">{inrMinor(shown.walletMinor)}</SaFact>
        <SaFact label="Gateway cash">{inrMinor(shown.gatewayMinor)}</SaFact>
        <SaFact label="Library">{shown.libraryName || '—'}</SaFact>
        <SaFact label="Owner">{[shown.ownerName, shown.ownerEmail].filter(Boolean).join(' · ') || '—'}</SaFact>
        <SaFact label="Paid">{fmtDate(shown.paidAt)}</SaFact>
        <SaFact label="Created">{fmtDate(shown.createdAt)}</SaFact>
        <SaFact label="Due">{fmtDate(shown.dueAt)}</SaFact>
      </SaFactList>
      {shown.receiptPath && (
        <div>
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => api.downloadFile(shown.receiptPath, `receipt-${shown.receiptNo || shown.invoiceId}.pdf`).catch(e => toast.error(e.message))}>Download receipt</button>
        </div>
      )}
    </SaPage>
  );
}

export function CollectionDetails({ query, data, loading, onQuery, onBack }) {
  const [draft, setDraft] = useState(query);
  const [record, setRecord] = useState(null);
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
  if (query.status) chips.push({ key: 'status', label: statusLabel(query.status), onDismiss: () => onQuery({ ...query, status: '' }) });
  if (query.provider) chips.push({ key: 'provider', label: providerLabel(query.provider), onDismiss: () => onQuery({ ...query, provider: '' }) });
  const inspect = async (row) => {
    setRecord(row);
    setDetail(null);
    try { setDetail(await api.adminCollectionRecord(row.recordId)); }
    catch (err) { toast.error(err.message || 'Could not load this record'); }
  };
  if (record) {
    return (
      <CollectionRecordPage
        row={record}
        detail={detail}
        onBack={() => { setRecord(null); setDetail(null); }}
      />
    );
  }
  const t = data?.totals;
  const statuses = data?.facets?.statuses?.length ? data.facets.statuses : STATUS_OPTIONS.map(([id]) => id);
  return (
    <SaPage id="sa-collection-details">
      <SaPageHeader
        onBack={onBack}
        backLabel="Business dashboard"
        title="Collection details"
        subtitle="Verified software cash for the selected period."
      />
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
            {statuses.map(s => <option key={s} value={s}>{statusLabel(s)}</option>)}
          </select>
        </label>
        <label className="form-label" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>Provider
          <select className="form-input" value={draft.provider || ''} onChange={set('provider')}>
            <option value="">All providers</option>
            {(data?.facets?.providers || []).map(p => <option key={p} value={p}>{providerLabel(p)}</option>)}
          </select>
        </label>
      </FiltersMenu>
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>{data?.range?.from ? `${data.range.from} to ${data.range.to}` : 'All time'} · {data?.timezone || 'Asia/Kolkata'}. Totals follow the date range. Search and filters change the list.</p>
      {loading && !data && <p style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Loading collection details…</p>}
      {t && (
        <>
          <SaSummaryGrid>
            <SaSummaryCard label="Verified software collection" value={inrMinor(t.verifiedCollectionsMinor)} sub={`${t.paymentCount} verified cash payments. ${data.labels.verifiedCollections}`} tone="#ecfdf5" />
            <SaSummaryCard label="Net software collection" value={inrMinor(t.netCollectionMinor)} sub={data.labels.netCollection} tone="#f0fdf4" />
            <SaSummaryCard label="Gross receipts" value={inrMinor(t.grossReceiptsMinor)} sub={data.labels.grossReceipts} tone="#eff6ff" />
            <SaSummaryCard label="Pending payments" value={inrMinor(t.pendingMinor)} sub={`${t.pendingCount} open or settling. ${data.labels.pending}`} tone="#fff7ed" />
            <SaSummaryCard label="Wallet top-ups" value={inrMinor(t.walletTopupsMinor)} sub={`${t.walletTopupCount} paid top-ups. ${data.labels.walletTopups}`} tone="#f5f3ff" />
            <SaSummaryCard label="Refunds" value={inrMinor(t.refundsMinor)} sub={t.refundsNote} tone="#fef2f2" />
          </SaSummaryGrid>
          <div className="premium-card sa-summary-card" style={{ background: '#fffbeb', borderColor: 'transparent' }}>
            <div className="sa-summary-label">Projected / scheduled — {data.projected?.month}</div>
            <div className="sa-summary-value">{inrMinor(data.projected?.minor)}</div>
            <p className="sa-summary-sub">{data.projected?.label} {data.labels.projected} {data.projected?.count || 0} open invoice{data.projected?.count === 1 ? '' : 's'} due next month.</p>
          </div>
          <div className="premium-card" style={{ padding: 16 }}>
            <strong style={{ fontSize: 14 }}>Monthly software collection</strong>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 10px' }}>
              Current month {inrMinor(data.comparison?.currentMonthMinor)} compared with prior months in this range {inrMinor(data.comparison?.priorMonthsMinor)}. {data.comparison?.note}
            </p>
            <Bars rows={data.monthly || []} />
          </div>
          {loading && <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: 0 }}>Loading…</p>}
          {!loading && data.transactions.length === 0 && (
            <SaEmpty title="No software transactions in this range">
              Widen the period in Filters, or clear search, to see payments again.
            </SaEmpty>
          )}
          {data.transactions.length > 0 && (
            <SaList>
              {data.transactions.map(row => (
                <SaListRow
                  key={`${row.source}-${row.recordId}`}
                  title={row.libraryName || row.libraryId}
                  meta={`${fmtDate(row.eventAt)} · ${KIND_LABEL[row.kind] || statusLabel(row.kind)} · ${providerLabel(row.provider)}`}
                  extra={`${row.ownerEmail || 'No owner email'} · ${bucketLabel(row.bucket)}${row.projected ? ' · Scheduled' : ''}`}
                  amount={inrMinor(row.collectedMinor)}
                  status={row.status}
                  onClick={() => inspect(row)}
                />
              ))}
            </SaList>
          )}
        </>
      )}
    </SaPage>
  );
}
