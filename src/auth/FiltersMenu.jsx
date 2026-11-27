import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SlidersHorizontal, X } from 'lucide-react';
import { useBackClose } from '../utils/useBackClose';
import { DATE_PERIOD_PRESETS } from './datePeriod';

export { DATE_PERIOD_PRESETS, datePeriodLabel, resolveDatePeriod } from './datePeriod';

const fieldLabel = { margin: 0, display: 'flex', flexDirection: 'column', gap: 4 };

/**
 * One Period dropdown. From and To appear only when Custom is selected.
 */
export function DatePeriodSelect({
  id = 'sa-filters-period',
  value,
  onChange,
  from = '',
  to = '',
  onFromChange,
  onToChange,
}) {
  return (
    <>
      <label className="form-label" htmlFor={id} style={fieldLabel}>Period
        <select id={id} className="form-select" value={value || ''} onChange={(e) => onChange?.(e.target.value)}>
          {DATE_PERIOD_PRESETS.map(([presetId, label]) => (
            <option key={presetId} value={presetId}>{label}</option>
          ))}
        </select>
      </label>
      {value === 'custom' && (
        <>
          <label className="form-label" htmlFor={`${id}-from`} style={fieldLabel}>From
            <input id={`${id}-from`} className="form-input" type="date" value={from || ''} onChange={(e) => onFromChange?.(e.target.value)} required />
          </label>
          <label className="form-label" htmlFor={`${id}-to`} style={fieldLabel}>To
            <input id={`${id}-to`} className="form-input" type="date" value={to || ''} onChange={(e) => onToChange?.(e.target.value)} required />
          </label>
        </>
      )}
    </>
  );
}

/**
 * Filters button, dismissible chips, and a vertical scrollable drawer.
 * The drawer is portaled to document.body so parent cards cannot clip it.
 * Pass stable ids, e.g. buttonId="sa-collection-filters-button".
 */
export function FiltersMenu({
  buttonId = 'sa-filters-button',
  menuId = 'sa-filters-menu',
  chips = [],
  onApply,
  onReset,
  onClose,
  applyDisabled = false,
  children,
}) {
  const [open, setOpen] = useState(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const close = () => {
    setOpen(false);
    onCloseRef.current?.();
  };
  const closeRef = useRef(close);
  closeRef.current = close;
  useBackClose(open, close);
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open]);
  const apply = (e) => {
    e?.preventDefault();
    onApply?.(e);
    setOpen(false);
  };
  const reset = () => {
    onReset?.();
    setOpen(false);
  };
  const active = chips.filter(Boolean);
  return (
    <div className="sa-filters">
      <div className="sa-filters-bar">
        <button
          type="button"
          id={buttonId}
          className="btn btn-secondary btn-sm"
          aria-expanded={open}
          aria-controls={menuId}
          onClick={() => (open ? close() : setOpen(true))}
        >
          <SlidersHorizontal size={14} /> Filters{active.length > 0 ? ` (${active.length})` : ''}
        </button>
        {!open && active.map(chip => (
          <span key={chip.key} className="sa-filters-chip">
            <span>{chip.label}</span>
            {chip.onDismiss && (
              <button type="button" className="sa-filters-chip-x" aria-label={`Remove ${chip.label}`} onClick={chip.onDismiss}>
                <X size={12} />
              </button>
            )}
          </span>
        ))}
      </div>
      {open && createPortal(
        <>
          <div className="sa-filters-backdrop" onClick={close} role="presentation" />
          <form id={menuId} className="sa-filters-menu" role="dialog" aria-modal="true" aria-label="Filters" onSubmit={apply}>
            <div className="sa-filters-menu-head">
              <strong>Filters</strong>
              <button type="button" className="btn btn-ghost btn-sm" onClick={close} aria-label="Close filters"><X size={16} /></button>
            </div>
            <div className="sa-filters-menu-body" style={{ overflowY: 'auto' }}>{children}</div>
            <div className="sa-filters-menu-actions">
              <button className="btn btn-primary btn-sm" type="submit" disabled={applyDisabled}>Apply</button>
              <button className="btn btn-secondary btn-sm" type="button" onClick={reset}>Reset</button>
            </div>
          </form>
        </>,
        document.body,
      )}
    </div>
  );
}
