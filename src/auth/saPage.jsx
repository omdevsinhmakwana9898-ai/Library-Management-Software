import React from 'react';
import { ArrowLeft } from 'lucide-react';

const humanize = (value) => String(value || '')
  .replace(/[_-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .replace(/\b\w/g, (c) => c.toUpperCase());

/** Friendly status copy. Raw invoice enums stay out of the Super Admin UI. */
export const STATUS_PRESENTATION = {
  verified_paid: { label: 'Verified', badge: 'badge-paid' },
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

/** Name, amount when the record has one, and a status badge. */
export function SaRecordHero({ name, amount, status, badge }) {
  return (
    <div className="premium-card sa-record-hero">
      <div className="sa-record-hero-main">
        <h3 className="sa-record-hero-name">{name || '—'}</h3>
        {amount != null && amount !== '' ? <div className="sa-record-hero-amount">{amount}</div> : null}
      </div>
      {(badge || (status != null && status !== '')) ? (
        <div className="sa-record-hero-status">
          {badge || <SaStatusBadge status={status} />}
        </div>
      ) : null}
    </div>
  );
}

/** Dates that apply to this record. Pass at=null to show an em dash. Omit a step that does not apply. */
export function SaRecordTimeline({ steps }) {
  const rows = (steps || []).filter(step => step && step.label);
  if (!rows.length) return null;
  return (
    <ol className="premium-card sa-record-timeline" aria-label="Dates">
      {rows.map((step) => {
        const missing = step.at == null || step.at === '' || step.at === '—';
        return (
          <li key={step.label} className="sa-record-step">
            <span className="sa-record-step-label">{step.label}</span>
            <span className="sa-record-step-value">{missing ? '—' : step.at}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function SaRecordSection({ title, children }) {
  return (
    <section className="premium-card sa-record-section">
      <h3 className="sa-record-section-title">{title}</h3>
      <div className="sa-record-facts">{children}</div>
    </section>
  );
}

export function SaMoreInfo({ children, summary = 'More info' }) {
  const items = React.Children.toArray(children).filter(Boolean);
  if (!items.length) return null;
  return (
    <details className="premium-card sa-more-info">
      <summary>{summary}</summary>
      <div className="sa-record-facts">{items}</div>
    </details>
  );
}

export function SaHelper({ children }) {
  if (children == null || children === false || children === '') return null;
  return <p className="sa-record-helper">{children}</p>;
}

export function SaRecordActions({ children }) {
  const items = React.Children.toArray(children).filter(Boolean);
  if (!items.length) return null;
  return <div className="sa-record-actions">{items}</div>;
}
