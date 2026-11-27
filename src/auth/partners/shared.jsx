import React, { useState } from 'react';
import { Save } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { SaSummaryCard, SaSummaryGrid } from '../saPage';

export const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;

export const PERM_LABEL = {
  accessLibrary: 'Access Library (read-only)',
  viewClients: 'See clients',
  viewCommissions: 'See commissions',
};

export const STATUS_HELP = 'Record status is Earned, Reversed, or Cancelled. Tracking status is Unpaid, Paid, or Void and does not move money. Pending means earned and still unpaid. Paid means a bookkeeping note that an outside payout was recorded.';

export const kindLabel = (kind) => (kind === 'agent' ? 'Agent' : kind === 'partner' ? 'Partner' : kind || '—');
export const saleKindLabel = (kind) => (kind === 'initial' ? 'New sale' : kind === 'renewal' ? 'Renewal' : kind || '—');
export const sourceLabel = (source) => (source === 'seller' ? 'Seller' : source === 'direct' ? 'Direct signup' : source || '—');
export const requirementCopy = (label) => ({
  pending: 'Pending — earned and still unpaid',
  paid: 'Paid note — an outside payout was recorded',
  void: 'Void — tracking closed without a payout note',
  unpaid: 'Unpaid',
}[label] || '—');

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

export function formatRecordDate(value) {
  if (value == null || value === '') return null;
  const raw = String(value);
  const ymd = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const date = ymd
    ? new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Plain-language rate. Version is the frozen or current rule version, not an internal id. */
export function plainRate(basis) {
  if (basis?.value == null) return 'No rate';
  const amount = basis.mode === 'percent' ? `${basis.value}% of the sale` : `${inr(basis.value)} fixed`;
  return basis.version ? `${amount}, version ${basis.version}` : amount;
}

export function SummaryCards({ summary, compact = false }) {
  return (
    <div id="sa-partner-summary" className={compact ? 'sa-partner-summary-compact' : undefined}>
      <SaSummaryGrid>
        <SaSummaryCard label="Active partners" value={summary?.activePartners ?? '…'} sub={compact ? null : 'Partners and agents with status Active'} />
        <SaSummaryCard label="Assigned libraries" value={summary?.assignedLibraries ?? '…'} sub={compact ? null : 'Libraries with a managing partner'} tone="#eff6ff" />
        <SaSummaryCard label="Earned commission" value={summary ? inr(summary.earnedCommission) : '…'} sub={compact ? null : (summary ? `${summary.earnedCount} earned records` : 'Earned records')} tone="#ecfdf5" />
        <SaSummaryCard label="Unpaid commission" value={summary ? inr(summary.unpaidCommission) : '…'} sub={compact ? null : 'Earned records that are still unpaid'} tone="#fff7ed" />
      </SaSummaryGrid>
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
    <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      <span style={{ fontSize: 13, fontWeight: 600, minWidth: 72 }}>{appliesTo === 'initial' ? 'New sale' : 'Renewal'}</span>
      <select className="form-select" style={{ width: 88, padding: '6px 8px' }} value={mode} onChange={e => setMode(e.target.value)} aria-label={`${appliesTo} rate mode`}><option value="percent">%</option><option value="fixed">₹</option></select>
      <input className="form-input" style={{ width: 96, padding: '6px 8px' }} type="number" min={0} placeholder="none" value={value} onChange={e => setValue(e.target.value)} aria-label={`${appliesTo} rate`} />
      <button type="button" className="btn btn-secondary btn-sm" title="Save rule" onClick={save}><Save size={14} /> Save</button>
      {cur && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>v{cur.version}</span>}
    </div>
  );
}

export function Pager({ page, pages, loading, onPage }) {
  if (!pages) return null;
  return (
    <div className="sa-action-row" style={{ alignItems: 'center' }}>
      <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>Previous</button>
      <span style={{ fontSize: 13 }}>Page {page} of {pages}</span>
      <button type="button" className="btn btn-secondary btn-sm" disabled={page >= pages || loading} onClick={() => onPage(page + 1)}>Next</button>
    </div>
  );
}
