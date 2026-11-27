import React, { useState } from 'react';
import { ArrowLeft, Plus, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { SaModal } from '../SaModal';

export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const PERIODS = [
  ['all_time', 'All time'],
  ['last_7_days', 'Last 7 days'],
  ['this_month', 'This month'],
  ['last_month', 'Last month'],
  ['last_2_months', 'Last 2 months'],
  ['last_3_months', 'Last 3 months'],
  ['last_6_months', 'Last 6 months'],
  ['last_1_year', '1 year'],
  ['custom', 'Custom'],
];

export const PERM_LABEL = {
  accessLibrary: 'Access Library (read-only)',
  viewClients: 'See clients',
  viewCommissions: 'See commissions',
};

export const STATUS_HELP = 'Record status is earned, reversed, or cancelled. Tracking status is unpaid, paid, or void and does not move money. Pending means earned and unpaid. Paid means a bookkeeping note that an outside payout was recorded.';

export const rateText = (basis) => (basis?.mode === 'percent' ? `${basis.value}%` : basis?.value != null ? inr(basis.value) : '—');
export const ruleText = (rule) => (rule ? `${rule.mode === 'percent' ? `${rule.value}%` : inr(rule.value)} v${rule.version}` : 'None');

export const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => {
    if (v !== '' && v != null && !(k === 'preset' && v === 'all_time') && !(k === 'page' && Number(v) === 1)) p.set(k, String(v));
  });
  if (o.page) p.set('page', String(o.page));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export function Choice({ label, pressed, onClick }) {
  return <button type="button" className={`btn btn-sm ${pressed ? 'btn-primary' : 'btn-secondary'}`} style={{ justifyContent: 'flex-start', width: '100%' }} aria-pressed={pressed} onClick={onClick}>{label}</button>;
}

export function BackLink({ onClick, children }) {
  return <button type="button" className="btn btn-ghost btn-sm" onClick={onClick}><ArrowLeft size={14} /> {children}</button>;
}

export function SummaryCards({ summary }) {
  const cards = [
    ['Active partners', summary?.activePartners ?? '…', 'Partners and agents with status Active'],
    ['Assigned libraries', summary?.assignedLibraries ?? '…', 'Libraries with a managing partner'],
    ['Earned commission', summary ? inr(summary.earnedCommission) : '…', summary ? `${summary.earnedCount} earned records` : 'Record status earned'],
    ['Unpaid commission', summary ? inr(summary.unpaidCommission) : '…', 'Earned records still payoutStatus unpaid'],
  ];
  return (
    <div id="sa-partner-summary" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 10 }}>
      {cards.map(([label, value, sub]) => (
        <div key={label} className="premium-card" style={{ padding: 14, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
          <div style={{ fontSize: 22, fontWeight: 800, overflowWrap: 'anywhere' }}>{value}</div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{sub}</div>
        </div>
      ))}
    </div>
  );
}

export function RuleEditor({ p, appliesTo, onSaved }) {
  const cur = p.rules?.[appliesTo];
  const [mode, setMode] = useState(cur?.mode || 'percent');
  const [value, setValue] = useState(cur?.value ?? '');
  const save = async () => {
    try {
      await api.adminSetCommissionRule(p.id, appliesTo, value === '' ? { disabled: true } : { mode, value: Number(value) });
      toast.success('Rule saved (old commissions unchanged)');
      onSaved();
    } catch (e) { toast.error(e.message); }
  };
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 12, width: 64 }}>{appliesTo === 'initial' ? 'New sale' : 'Renewal'}</span>
      <select className="form-input" style={{ width: 70, padding: '4px 6px' }} value={mode} onChange={e => setMode(e.target.value)} aria-label={`${appliesTo} rate mode`}><option value="percent">%</option><option value="fixed">₹</option></select>
      <input className="form-input" style={{ width: 80, padding: '4px 6px' }} type="number" min={0} placeholder="none" value={value} onChange={e => setValue(e.target.value)} aria-label={`${appliesTo} rate`} />
      <button type="button" className="btn btn-ghost btn-sm" title="Save rule" onClick={save}><Save size={14} /></button>
      {cur && <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>v{cur.version}</span>}
    </div>
  );
}

export function SaleRecorder({ libraries, onRecorded }) {
  const [open, setOpen] = useState(false);
  const [sale, setSale] = useState({ libraryId: '', kind: 'initial', saleRef: '', saleAmount: '' });
  const set = (k) => (e) => setSale(s => ({ ...s, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    try {
      const r = await api.adminRecordSale({ ...sale, saleAmount: Number(sale.saleAmount) });
      r.created ? toast.success(`Commission ${inr(r.record.amount)} recorded`) : toast(`No commission: ${String(r.reason).replace(/_/g, ' ')}`);
      setSale(s => ({ ...s, saleRef: '', saleAmount: '' }));
      setOpen(false);
      onRecorded?.();
    } catch (err) { toast.error(err.message); }
  };
  return (
    <>
      <button type="button" className="btn btn-primary btn-sm" onClick={() => setOpen(true)}><Plus size={14} /> Record payment</button>
      <SaModal open={open} title="Record a software sale" onClose={() => setOpen(false)}>
        <form style={{ display: 'grid', gap: 10 }} onSubmit={submit}>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Until billing is connected, record the sale here. The commission rate is frozen at this moment. Saving a later rule does not rewrite this record.</p>
          <label className="form-label" style={{ margin: 0 }}>Library<select className="form-input" required value={sale.libraryId} onChange={set('libraryId')}><option value="">Pick…</option>{libraries.map(l => <option key={l.libraryId} value={l.libraryId}>{l.name}</option>)}</select></label>
          <label className="form-label" style={{ margin: 0 }}>Type<select className="form-input" value={sale.kind} onChange={set('kind')}><option value="initial">New sale</option><option value="renewal">Renewal</option></select></label>
          <label className="form-label" style={{ margin: 0 }}>Invoice / ref<input className="form-input" required value={sale.saleRef} onChange={set('saleRef')} /></label>
          <label className="form-label" style={{ margin: 0 }}>Amount (₹)<input className="form-input" type="number" min={1} required value={sale.saleAmount} onChange={set('saleAmount')} /></label>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary btn-sm" type="button" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" type="submit">Record</button>
          </div>
        </form>
      </SaModal>
    </>
  );
}

export function Pager({ page, pages, loading, onPage }) {
  if (!pages) return null;
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>Previous</button>
      <span style={{ fontSize: 13 }}>Page {page} of {pages}</span>
      <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages || loading} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}
