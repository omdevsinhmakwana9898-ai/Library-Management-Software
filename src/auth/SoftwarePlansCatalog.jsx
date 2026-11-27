// Super Admin software-plan catalog. Assignment lives on the Library plans page.
import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../utils/api';
import { FiltersMenu } from './FiltersMenu';
import { DURATION_ROWS, durationPayload, durationsFromPlan, emptyDurations, setMonthlyKeepingDiscounts } from '../utils/softwarePlanForm';
import { SaEmpty, SaFact, SaFactList, SaPage, SaPageHeader, SaStatusBadge, SaSummaryCard, SaSummaryGrid } from './saPage';

const EMPTY = {
  name: '', description: '', icon: '', priceMonthly: '', studentLimit: '', staffLimit: '', branchLimit: '', deskLimit: '',
  trialDays: '', features: '', public: true, active: true, recommended: false, whatsappEntitlement: null, durationPricing: emptyDurations(),
};
const fmtLimit = (n) => (n ? Number(n).toLocaleString('en-IN') : 'Unlimited');
const inr = (n) => (n == null || n === '' ? '—' : `₹${Number(n).toLocaleString('en-IN')}`);

function yearlyAmount(plan) {
  if (plan.priceYearly != null && plan.priceYearly !== '') return Number(plan.priceYearly);
  const year = (plan.intervals || []).find(row => row.interval === 'year' && row.available && row.finalMinor != null);
  return year ? year.finalMinor / 100 : null;
}

function visibilityLabel(plan) {
  if (!plan.active) return 'Archived';
  return plan.public ? 'Public' : 'Hidden';
}

const emptyFilters = { status: 'all', visibility: 'all' };

export function SoftwarePlansCatalog({ onChanged }) {
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState(EMPTY);
  const [editing, setEditing] = useState(null);
  const [screen, setScreen] = useState('catalog');
  const [detail, setDetail] = useState(null);
  const [filters, setFilters] = useState(emptyFilters);
  const [draft, setDraft] = useState(emptyFilters);

  const load = useCallback(async () => {
    try { setPlans(await api.adminPlans()); }
    catch (e) { toast.error(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const startEdit = (p) => {
    setEditing(p ? p.planId : null);
    setForm(p ? {
      ...EMPTY,
      ...p,
      icon: p.icon || '',
      studentLimit: p.studentLimit ?? '',
      staffLimit: p.staffLimit ?? '',
      branchLimit: p.branchLimit ?? '',
      deskLimit: p.deskLimit ?? '',
      trialDays: p.trialDays || '',
      features: (p.features || []).join('\n'),
      recommended: !!p.recommended,
      whatsappEntitlement: p.whatsappEntitlement === true ? true : p.whatsappEntitlement === false ? false : null,
      durationPricing: durationsFromPlan(p),
    } : EMPTY);
    setScreen('editor');
  };

  const openDetails = (p) => {
    setDetail(p);
    setScreen('details');
  };

  const backToCatalog = () => {
    setScreen('catalog');
    setDetail(null);
  };

  const save = async (e) => {
    e.preventDefault();
    const body = {
      ...form,
      priceMonthly: Number(form.priceMonthly) || 0,
      trialDays: Number(form.trialDays) || 0,
      recommended: !!form.recommended,
      icon: form.icon || '',
      whatsappEntitlement: form.whatsappEntitlement,
      durationPricing: durationPayload(form.durationPricing),
    };
    delete body.priceYearly;
    delete body.intervals;
    delete body.highlights;
    delete body.libraries;
    delete body.whatsappIncluded;
    try {
      if (editing) await api.adminUpdatePlan(editing, body);
      else await api.adminCreatePlan(body);
      toast.success(`Plan ${editing ? 'updated' : 'created'}`);
      backToCatalog();
      load();
      onChanged?.();
    } catch (err) { toast.error(err.message); }
  };

  const remove = async (p) => {
    if (p.libraries > 0) return;
    if (!window.confirm(`Delete ${p.name}? This cannot be undone. Archive a plan that libraries still use.`)) return;
    try {
      await api.adminDeletePlan(p.planId);
      toast.success('Plan deleted');
      backToCatalog();
      load();
    } catch (e) { toast.error(e.message); }
  };

  const toggleArchive = async (p) => {
    try {
      if (p.active && p.libraries > 0) {
        const ok = window.confirm(`${p.libraries} ${p.libraries === 1 ? 'library uses' : 'libraries use'} ${p.name}. Archive it anyway? Existing subscriptions stay on this plan.`);
        if (!ok) return;
      }
      await api.adminUpdatePlan(p.planId, { active: !p.active, ...(p.active && p.libraries > 0 ? { confirmArchive: true } : {}) });
      toast.success(p.active ? 'Plan archived' : 'Plan restored');
      if (screen === 'details') backToCatalog();
      load();
      onChanged?.();
    } catch (e) { toast.error(e.message); }
  };

  const field = (k, label, type = 'number', extra = {}) => (
    <div className="form-group" style={{ marginBottom: 0 }}>
      <label className="form-label" htmlFor={`plan-${k}`}>{label}</label>
      <input id={`plan-${k}`} className="form-input" type={type} min={type === 'number' ? 0 : undefined} value={form[k]} onChange={e => setForm(f => ({ ...f, [k]: e.target.value }))} {...extra} />
    </div>
  );

  const shown = plans.filter(p => {
    if (filters.status === 'active' && !p.active) return false;
    if (filters.status === 'archived' && p.active) return false;
    if (filters.visibility === 'public' && (!p.public || !p.active)) return false;
    if (filters.visibility === 'hidden' && (p.public || !p.active)) return false;
    return true;
  });
  const chips = [
    filters.status !== 'all' && { key: 'status', label: filters.status === 'active' ? 'Active plans' : 'Archived plans', onDismiss: () => setFilters(f => ({ ...f, status: 'all' })) },
    filters.visibility !== 'all' && { key: 'visibility', label: filters.visibility === 'public' ? 'Public' : 'Hidden', onDismiss: () => setFilters(f => ({ ...f, visibility: 'all' })) },
  ].filter(Boolean);

  if (screen === 'details' && detail) {
    return (
      <SaPage id="sa-plan-details">
        <SaPageHeader
          onBack={backToCatalog}
          backLabel="Software plans"
          title={detail.name}
          subtitle={detail.description || 'Plan details for future quotes and signups.'}
          actions={(
            <>
              <button type="button" className="btn btn-secondary" onClick={() => startEdit(detail)}>Edit</button>
              <button type="button" className="btn btn-secondary" onClick={() => toggleArchive(detail)}>{detail.active ? 'Archive' : 'Restore'}</button>
            </>
          )}
        />
        <SaSummaryGrid>
          <SaSummaryCard label="Monthly" value={inr(detail.priceMonthly)} sub={detail.recommended ? 'Recommended' : 'Catalog price'} tone="#eff6ff" />
          <SaSummaryCard label="Yearly" value={inr(yearlyAmount(detail))} />
          <SaSummaryCard label="Libraries" value={detail.libraries} sub={detail.libraries === 1 ? 'library assigned' : 'libraries assigned'} />
        </SaSummaryGrid>
        <div className="sa-action-row">
          <SaStatusBadge status={detail.active ? 'active' : 'archived'}>{detail.active ? 'Active' : 'Archived'}</SaStatusBadge>
          <SaStatusBadge status={detail.public && detail.active ? 'public' : 'hidden'}>{visibilityLabel(detail)}</SaStatusBadge>
          {detail.recommended ? <SaStatusBadge status="active">Recommended</SaStatusBadge> : null}
        </div>
        <SaFactList>
          <SaFact label="Seat capacity">{fmtLimit(detail.deskLimit)}</SaFact>
          <SaFact label="Branches">{fmtLimit(detail.branchLimit)}</SaFact>
          <SaFact label="Staff logins">{fmtLimit(detail.staffLimit)}</SaFact>
          <SaFact label="Students">{fmtLimit(detail.studentLimit)}</SaFact>
          <SaFact label="Trial">{detail.trialDays ? `${detail.trialDays}-day trial` : 'No trial'}</SaFact>
          <SaFact label="WhatsApp">{detail.whatsappIncluded ? 'WhatsApp included' : 'WhatsApp not included'}</SaFact>
        </SaFactList>
        <div className="premium-card" style={{ padding: 16 }}>
          <strong>Enabled features</strong>
          {(detail.features || []).length === 0 && <p style={{ margin: '8px 0 0', color: 'var(--text-secondary)' }}>None listed. Add features from Edit.</p>}
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>{(detail.features || []).map(f => <li key={f}>{f}</li>)}</ul>
          {(detail.highlights || []).length > 0 && (
            <>
              <strong style={{ display: 'block', marginTop: 12 }}>Shown to owners</strong>
              <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>{detail.highlights.map(f => <li key={f}>{f}</li>)}</ul>
            </>
          )}
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Catalog prices apply to future public pages, signups, and upgrade quotes. They do not change paid invoices, open invoice amounts, or a library’s current subscription period or price.</p>
      </SaPage>
    );
  }

  if (screen === 'editor') {
    return (
      <SaPage id="sa-plan-editor">
        <SaPageHeader
          onBack={backToCatalog}
          backLabel="Software plans"
          title={editing ? `Edit ${form.name || 'plan'}` : 'New plan'}
          subtitle="Saving updates future quotes. It does not change paid invoices or a library’s current price."
        />
        <form className="premium-card" style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={save} aria-label="Plan form">
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)' }}>Saving updates this catalog record for future public pages, signups, and upgrade quotes. It does not change paid invoices, open invoice amounts, or a library’s current subscription period or price.</p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 150px), 1fr))', gap: 12 }}>
            {field('name', 'Name *', 'text', { required: true })}
            {field('icon', 'Icon', 'text', { maxLength: 16, placeholder: '★' })}
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label" htmlFor="plan-priceMonthly">Monthly price (₹)</label>
              <input id="plan-priceMonthly" className="form-input" type="number" min={0} value={form.priceMonthly} onChange={e => setForm(f => setMonthlyKeepingDiscounts(f, e.target.value))} />
            </div>
            {field('studentLimit', 'Student limit (blank = unlimited)')}
            {field('deskLimit', 'Seat capacity / desks (blank = unlimited)')}
            {field('staffLimit', 'Staff logins (blank = unlimited)')}
            {field('branchLimit', 'Branch limit (blank = unlimited)')}
            {field('trialDays', 'Free trial days')}
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="plan-description">Description</label>
            <input id="plan-description" className="form-input" type="text" maxLength={500} value={form.description || ''} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="plan-features">Features (one per line)</label>
            <textarea id="plan-features" className="form-input" rows={3} value={form.features} onChange={e => setForm(f => ({ ...f, features: e.target.value }))} />
          </div>
          <div className="form-group" style={{ marginBottom: 0 }}>
            <label className="form-label" htmlFor="plan-whatsapp">WhatsApp entitlement</label>
            <select id="plan-whatsapp" className="form-select" value={form.whatsappEntitlement === true ? 'yes' : form.whatsappEntitlement === false ? 'no' : 'auto'} onChange={e => setForm(f => ({ ...f, whatsappEntitlement: e.target.value === 'yes' ? true : e.target.value === 'no' ? false : null }))}>
              <option value="auto">Follow feature lines</option>
              <option value="yes">Included</option>
              <option value="no">Not included</option>
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {DURATION_ROWS.map(([key, label]) => {
              const row = form.durationPricing[key];
              return (
                <div key={key} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 8, alignItems: 'end' }}>
                  <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center', minHeight: 38 }}>
                    {key === 'month' ? <strong>{label}</strong> : <><input type="checkbox" checked={!!row.offered} onChange={e => setForm(f => ({ ...f, durationPricing: { ...f.durationPricing, [key]: { ...row, offered: e.target.checked } } }))} /> {label}</>}
                  </label>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor={`plan-discount-type-${key}`}>Discount</label>
                    <select id={`plan-discount-type-${key}`} className="form-select" value={row.discountType} onChange={e => setForm(f => ({ ...f, durationPricing: { ...f.durationPricing, [key]: { ...f.durationPricing[key], discountType: e.target.value } } }))}>
                      <option value="none">None</option>
                      <option value="percent">Percentage</option>
                      <option value="fixed">Fixed rupees</option>
                    </select>
                  </div>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" htmlFor={`plan-discount-value-${key}`}>Value</label>
                    <input id={`plan-discount-value-${key}`} className="form-input" type="number" min={0} value={row.discountValue} disabled={row.discountType === 'none'} onChange={e => setForm(f => ({ ...f, durationPricing: { ...f.durationPricing, [key]: { ...f.durationPricing[key], discountValue: e.target.value } } }))} />
                  </div>
                </div>
              );
            })}
          </div>
          <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!form.recommended} onChange={e => setForm(f => ({ ...f, recommended: e.target.checked }))} /> Recommended</label>
          <label style={{ fontSize: 13, display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={!!form.public} onChange={e => setForm(f => ({ ...f, public: e.target.checked }))} /> Offer on owner signup</label>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>Lowering a student, seat, staff, or branch limit is rejected when an assigned library already exceeds the new cap. Those libraries are left unchanged. Fixed usage is checked; nonfixed allocation is not part of this catalog.</p>
          <div className="sa-action-row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={backToCatalog}>Cancel</button>
            <button type="submit" className="btn btn-primary">Save plan</button>
          </div>
        </form>
      </SaPage>
    );
  }

  return (
    <SaPage id="sa-software-plans-catalog">
      <SaPageHeader
        title="Software plans"
        subtitle="Plans offered to libraries. Assign a plan from Library plans."
        actions={<button type="button" className="btn btn-primary" onClick={() => startEdit(null)}>+ New plan</button>}
      />
      <div className="premium-card" style={{ padding: 16 }}>
        <FiltersMenu
          buttonId="sa-software-plans-filters-button"
          menuId="sa-software-plans-filters-menu"
          chips={chips}
          onApply={() => setFilters(draft)}
          onReset={() => { setDraft(emptyFilters); setFilters(emptyFilters); }}
          onClose={() => setDraft(filters)}
        >
          <label className="form-label" htmlFor="sa-software-plans-status" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>Status
            <select id="sa-software-plans-status" className="form-select" value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
              <option value="all">All plans</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
          </label>
          <label className="form-label" htmlFor="sa-software-plans-visibility" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>Visibility
            <select id="sa-software-plans-visibility" className="form-select" value={draft.visibility} onChange={e => setDraft(d => ({ ...d, visibility: e.target.value }))}>
              <option value="all">Any visibility</option>
              <option value="public">Public on signup</option>
              <option value="hidden">Hidden from signup</option>
            </select>
          </label>
        </FiltersMenu>
        {shown.length === 0 && (
          <div style={{ marginTop: 12 }}>
            <SaEmpty title="No plans match these filters">
              Clear the filters, or create a new plan.
            </SaEmpty>
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(100%, 260px), 1fr))', gap: 12, marginTop: 12 }}>
          {shown.map(p => {
            const features = p.features || [];
            return (
              <div key={p.planId} data-plan={p.planId} role="button" tabIndex={0} className="premium-card" onClick={() => openDetails(p)} onKeyDown={e => { if (e.key === 'Enter') openDetails(p); }} style={{ padding: 16, opacity: p.active ? 1 : 0.75, cursor: 'pointer', textAlign: 'left', minWidth: 0 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start', flexWrap: 'wrap' }}>
                  <strong style={{ display: 'flex', gap: 8, alignItems: 'center', minWidth: 0 }}><span aria-hidden="true" style={{ fontSize: 18 }}>{p.icon || '◆'}</span><span style={{ overflowWrap: 'anywhere' }}>{p.name}</span></strong>
                  <SaStatusBadge status={p.active ? (p.public ? 'public' : 'hidden') : 'archived'}>{visibilityLabel(p)}</SaStatusBadge>
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, margin: '8px 0', letterSpacing: '-0.03em' }}>{inr(p.priceMonthly)}<span style={{ fontSize: 12, fontWeight: 500 }}>/month</span></div>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{inr(yearlyAmount(p))}<span style={{ fontSize: 12 }}>/year</span>{p.recommended ? <span style={{ fontSize: 11, marginLeft: 6 }}>Recommended</span> : null}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 6 }}>Seats: {fmtLimit(p.deskLimit)} · Branches: {fmtLimit(p.branchLimit)} · Staff logins: {fmtLimit(p.staffLimit)} · Students: {fmtLimit(p.studentLimit)}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>{p.trialDays ? `${p.trialDays}-day trial` : 'No trial'} · {p.whatsappIncluded ? 'WhatsApp included' : 'WhatsApp not included'}</div>
                {features.length > 0 && <ul style={{ fontSize: 12, margin: '6px 0 0', paddingLeft: 18 }}>{features.slice(0, 4).map(f => <li key={f}>{f}</li>)}{features.length > 4 && <li>+{features.length - 4} more</li>}</ul>}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, gap: 8, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{p.libraries} assigned {p.libraries === 1 ? 'library' : 'libraries'}</span>
                  <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); startEdit(p); }}>Edit</button>
                    <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); toggleArchive(p); }}>{p.active ? 'Archive' : 'Restore'}</button>
                    {p.libraries === 0
                      ? <button type="button" className="btn btn-ghost btn-sm" onClick={(e) => { e.stopPropagation(); remove(p); }}>Delete</button>
                      : <span style={{ fontSize: 11, color: 'var(--text-tertiary)', alignSelf: 'center' }}>In use — Archive instead</span>}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SaPage>
  );
}
