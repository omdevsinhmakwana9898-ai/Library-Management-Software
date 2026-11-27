import React from 'react';
import { ArrowLeft } from 'lucide-react';

const humanize = (value) => String(value || '')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, (c) => c.toUpperCase());

/** Friendly status copy. Raw invoice enums stay out of the Super Admin UI. */
export const STATUS_PRESENTATION = {
  paid: { label: 'Paid', badge: 'badge-paid' },
  open: { label: 'Open', badge: 'badge-open' },
  pending: { label: 'Pending', badge: 'badge-pending' },
  settling: { label: 'Pending', badge: 'badge-pending' },
  failed: { label: 'Failed', badge: 'badge-failed' },
  requires_recovery: { label: 'Failed', badge: 'badge-failed' },
  expired: { label: 'Expired', badge: 'badge-expired' },
  past_due: { label: 'Expired', badge: 'badge-expired' },
  refunded: { label: 'Refunded', badge: 'badge-refunded' },
  void: { label: 'Voided', badge: 'badge-failed' },
  active: { label: 'Active', badge: 'badge-active' },
  enabled: { label: 'Active', badge: 'badge-active' },
  Enabled: { label: 'Active', badge: 'badge-active' },
  disabled: { label: 'Disabled', badge: 'badge-disabled' },
  Disabled: { label: 'Disabled', badge: 'badge-disabled' },
  inactive: { label: 'Disabled', badge: 'badge-disabled' },
  trial: { label: 'Trial', badge: 'badge-active' },
  expiring: { label: 'Expiring', badge: 'badge-expiring' },
  cancelled: { label: 'Cancelled', badge: 'badge-expired' },
  canceled: { label: 'Cancelled', badge: 'badge-expired' },
};

export function statusLabel(status) {
  if (status == null || status === '') return '—';
  const key = String(status);
  return STATUS_PRESENTATION[key]?.label || STATUS_PRESENTATION[key.toLowerCase()]?.label || humanize(key);
}

export function providerLabel(provider) {
  const key = String(provider || '').toLowerCase();
  if (!key) return 'No provider';
  if (key === 'razorpay') return 'Razorpay';
  if (key === 'paypal') return 'PayPal';
  if (key === 'wallet') return 'Wallet';
  if (key === 'none') return 'None';
  return humanize(key);
}

export function SaPage({ id, children }) {
  return <div id={id} className="sa-page">{children}</div>;
}

export function SaPageHeader({ onBack, backLabel = 'Back', title, subtitle, actions }) {
  return (
    <header className="sa-page-header">
      <div className="sa-page-header-main">
        {onBack && (
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack}>
            <ArrowLeft size={14} /> {backLabel}
          </button>
        )}
        <h2 className="sa-page-title">{title}</h2>
        {subtitle ? <p className="sa-page-subtitle">{subtitle}</p> : null}
      </div>
      {actions ? <div className="sa-page-header-actions">{actions}</div> : null}
    </header>
  );
}

export function SaSummaryGrid({ children }) {
  return <div className="sa-summary-grid">{children}</div>;
}

export function SaSummaryCard({ label, value, sub, tone }) {
  return (
    <div className="premium-card sa-summary-card" style={tone ? { background: tone, borderColor: 'transparent' } : undefined}>
      <div className="sa-summary-label">{label}</div>
      <div className="sa-summary-value">{value}</div>
      {sub ? <div className="sa-summary-sub">{sub}</div> : null}
    </div>
  );
}

export function SaStatusBadge({ status, children }) {
  const key = String(status ?? '');
  const known = STATUS_PRESENTATION[key] || STATUS_PRESENTATION[key.toLowerCase()];
  const label = children || known?.label || statusLabel(key);
  const cls = known?.badge || 'badge-pending';
  return <span className={`badge ${cls}`}>{label}</span>;
}

export function SaEmpty({ title = 'Nothing here yet', children }) {
  return (
    <div className="premium-card sa-empty">
      <strong>{title}</strong>
      {children ? <p>{children}</p> : null}
    </div>
  );
}

export function SaList({ children }) {
  return <div className="sa-list" role="list">{children}</div>;
}

export function SaListRow({ title, meta, extra, amount, status, badge, onClick }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`premium-card sa-list-row${onClick ? ' sa-list-row-button' : ''}`}
      onClick={onClick}
      role="listitem"
    >
      <div className="sa-list-row-main">
        <div className="sa-list-row-title">{title}</div>
        {meta ? <div className="sa-list-row-meta">{meta}</div> : null}
        {extra ? <div className="sa-list-row-extra">{extra}</div> : null}
      </div>
      <div className="sa-list-row-side">
        {amount != null && amount !== '' ? <div className="sa-list-row-amount">{amount}</div> : null}
        {badge || (status != null && status !== '' ? <SaStatusBadge status={status} /> : null)}
      </div>
    </Tag>
  );
}

export function SaFactList({ children }) {
  return <div className="premium-card sa-fact-grid">{children}</div>;
}

export function SaFact({ label, children }) {
  return (
    <div className="sa-fact">
      <div className="sa-fact-label">{label}</div>
      <div className="sa-fact-value">{children ?? '—'}</div>
    </div>
  );
}
