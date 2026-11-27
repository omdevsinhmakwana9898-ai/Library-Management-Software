import React from 'react';
import { SaSummaryCard, SaSummaryGrid } from '../saPage';

export const inrMinor = (minor) => `₹${(Number(minor || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ACTIVITY_TO_API = { paid_online: 'topup', by_admin: 'admin_adjustment', on_invoice: 'wallet_payment' };

export function walletQuery(o) {
  return qs({ ...o, activity: ACTIVITY_TO_API[o.activity] || '' });
}

export const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => {
    if (v !== '' && v != null && !(k === 'preset' && v === 'all_time') && !(k === 'page' && Number(v) === 1)) p.set(k, String(v));
  });
  if (o.page) p.set('page', String(o.page));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export function formatWhen(value) {
  if (value == null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString('en-IN', {
    day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata',
  });
}

export function balanceLine(wallet) {
  if (!wallet) return 'No credit yet';
  const held = Number(wallet.heldCashMinor || 0) + Number(wallet.heldBonusMinor || 0);
  const parts = [
    `Paid credit ${inrMinor(wallet.cashMinor)}`,
    `Promotional credit ${inrMinor(wallet.bonusMinor)}`,
  ];
  if (held > 0) parts.push(`${inrMinor(held)} reserved`);
  return parts.join(' · ');
}

export function signedAmount(entry) {
  const text = inrMinor(entry?.amountMinor);
  if (entry?.direction === 'out') return `−${text}`;
  if (entry?.direction === 'in') return `+${text}`;
  return text;
}

export function SummaryCards({ summary }) {
  return (
    <SaSummaryGrid>
      <SaSummaryCard label="Libraries" value={summary?.libraries ?? '…'} />
      <SaSummaryCard label="Available" value={summary ? inrMinor(summary.availableMinor) : '…'} tone="#ecfdf5" />
      <SaSummaryCard label="Paid credit" value={summary ? inrMinor(summary.cashMinor) : '…'} />
      <SaSummaryCard label="Promotional credit" value={summary ? inrMinor(summary.bonusMinor) : '…'} tone="#fff7ed" />
    </SaSummaryGrid>
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
