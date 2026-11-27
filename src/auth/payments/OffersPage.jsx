import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { FiltersMenu } from '../FiltersMenu';
import {
  SaEmpty, SaFact, SaHelper, SaList, SaListRow, SaMoreInfo, SaPage, SaPageHeader,
  SaRecordActions, SaRecordHero, SaRecordSection, SaRecordTimeline, SaStatusBadge,
} from '../saPage';

const emptyForm = { name: '', code: '', discountType: 'percentage', discountValue: 10, perTenantLimit: 1, usageLimit: '', planIds: '', startsAt: '', endsAt: '', stackable: false };
const emptyQuery = { q: '', status: '' };
const day = (d) => (d ? String(d).slice(0, 10) : '');

const toBody = (form) => ({
  ...form,
  discountValue: Math.round(Number(form.discountValue) * (form.discountType === 'fixed' ? 100 : 1)),
  code: form.code.toUpperCase(),
  usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
  perTenantLimit: form.perTenantLimit === '' ? null : Number(form.perTenantLimit),
  planIds: String(form.planIds || '').split(',').map(s => s.trim()).filter(Boolean),
  startsAt: form.startsAt || null,
  endsAt: form.endsAt || null,
});

const statusOf = (o) => (o.archived ? 'Archived' : o.active === false ? 'Inactive' : 'Available');

export function OffersPage({ onOpen }) {
  const [offers, setOffers] = useState([]);
  const [query, setQuery] = useState(emptyQuery);
  const [draft, setDraft] = useState(emptyQuery);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [screen, setScreen] = useState('list');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (next) => {
    const p = new URLSearchParams();
    if (next.q) p.set('q', next.q);
    if (next.status) p.set('status', next.status);
    const s = p.toString();
    try { setOffers(await api.adminOffers(s ? `?${s}` : '')); }
    catch (e) { toast.error(e.message || 'Could not load offers'); }
  }, []);
  useEffect(() => { load(query); }, [load, query]);
  useEffect(() => { setDraft(query); }, [query]);

  const chips = [];
  if (query.q) chips.push({ key: 'q', label: `Search: ${query.q}`, onDismiss: () => setQuery({ ...query, q: '' }) });
  if (query.status) chips.push({ key: 'status', label: query.status, onDismiss: () => setQuery({ ...query, status: '' }) });

  const startCreate = () => { setEditing(null); setForm(emptyForm); setScreen('editor'); };
  const openOffer = (o, next = 'detail') => {
    setEditing(o);
    setForm({
      name: o.name || '',
      code: o.code || '',
      discountType: o.discountType || 'percentage',
      discountValue: o.discountType === 'fixed' ? Number(o.discountValue || 0) / 100 : Number(o.discountValue || 0),
      perTenantLimit: o.perTenantLimit ?? 1,
      usageLimit: o.usageLimit ?? '',
      planIds: (o.planIds || []).join(', '),
      startsAt: day(o.startsAt),
      endsAt: day(o.endsAt),
      stackable: !!o.stackable,
    });
    setScreen(next);
  };
  const startEdit = (o) => openOffer(o, 'editor');
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = toBody(form);
      if (editing) await api.adminUpdateOffer(editing.offerId, body);
      else await api.adminCreateOffer(body);
      setScreen('list');
      toast.success(editing ? 'Offer updated' : 'Offer created');
      await load(query);
    } catch (err) { toast.error(err.message || 'Could not save offer'); }
    finally { setBusy(false); }
  };
  const patch = async (o, body) => {
    try {
      const next = await api.adminUpdateOffer(o.offerId, body);
      setEditing({ ...o, ...body, ...(next && typeof next === 'object' ? next : {}) });
      await load(query);
    } catch (e) { toast.error(e.message); }
  };

  const offerBadge = (o) => (o.archived ? 'archived' : o.active === false ? 'inactive' : 'available');
  const discount = (o) => (o.discountType === 'percentage' ? `${o.discountValue}%` : `₹${(Number(o.discountValue || 0) / 100).toFixed(2)}`);

  if (screen === 'editor') {
    return (
      <SaPage id="sa-offers">
        <SaPageHeader
          onBack={() => setScreen(editing ? 'detail' : 'list')}
          backLabel={editing ? 'Offer' : 'Offers'}
          title={editing ? 'Edit offer' : 'New offer'}
          subtitle="Saving does not rewrite discounts already applied to invoices or redemptions."
        />
        <form className="premium-card" style={{ padding: 16, display: 'grid', gap: 10 }} onSubmit={submit}>
          <label className="form-label">Name<input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="form-label">Code<input className="form-input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} required /></label>
          <label className="form-label">Type<select className="form-select" value={form.discountType} onChange={e => setForm({ ...form, discountType: e.target.value })}><option value="percentage">Percent</option><option value="fixed">Fixed rupees</option></select></label>
          <label className="form-label">Value<input className="form-input" value={form.discountValue} onChange={e => setForm({ ...form, discountValue: e.target.value })} required /></label>
          <label className="form-label">Total uses<input className="form-input" inputMode="numeric" value={form.usageLimit} onChange={e => setForm({ ...form, usageLimit: e.target.value })} placeholder="Unlimited" /></label>
          <label className="form-label">Per-library uses<input className="form-input" inputMode="numeric" value={form.perTenantLimit} onChange={e => setForm({ ...form, perTenantLimit: e.target.value })} /></label>
          <label className="form-label">Eligible plans<input className="form-input" value={form.planIds} onChange={e => setForm({ ...form, planIds: e.target.value })} placeholder="All plans" /></label>
          <label className="form-label">Starts<input className="form-input" type="date" value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} /></label>
          <label className="form-label">Ends<input className="form-input" type="date" value={form.endsAt} onChange={e => setForm({ ...form, endsAt: e.target.value })} /></label>
          <label style={{ display: 'flex', gap: 6, fontSize: 13 }}><input type="checkbox" checked={form.stackable} onChange={e => setForm({ ...form, stackable: e.target.checked })} /> Allow stacking where permitted</label>
          {editing && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>This does not change historical redemptions. Usage shown on the list stays the settled count.</p>}
          <div className="sa-action-row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setScreen(editing ? 'detail' : 'list')}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{editing ? 'Save offer' : 'Create offer'}</button>
          </div>
        </form>
      </SaPage>
    );
  }

  if (screen === 'detail' && editing) {
    const o = editing;
    const offerWhen = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' }) : null);
    const offerDates = [
      o.createdAt ? { label: 'Created', at: offerWhen(o.createdAt) } : null,
      o.startsAt ? { label: 'Starts', at: offerWhen(o.startsAt) } : null,
      o.endsAt ? { label: 'Ends', at: offerWhen(o.endsAt) } : null,
    ].filter(Boolean);
    return (
      <SaPage id="sa-offers">
        <SaPageHeader
          onBack={() => setScreen('list')}
          backLabel="Offers"
          title={o.name || o.code || 'Offer'}
        />
        <SaRecordHero
          name={o.name || o.code || 'Offer'}
          amount={discount(o)}
          status={offerBadge(o)}
          badge={<SaStatusBadge status={offerBadge(o)}>{statusOf(o)}</SaStatusBadge>}
        />
        <SaRecordTimeline steps={offerDates} />
        <SaRecordSection title="Offer">
          <SaFact label="Code">{o.code || '—'}</SaFact>
          <SaFact label="Discount">{discount(o)}</SaFact>
          <SaFact label="Used">{o.usedCount || 0}{o.usageLimit ? ` / ${o.usageLimit}` : ''}</SaFact>
          <SaFact label="Per library">{o.perTenantLimit == null || o.perTenantLimit === '' ? 'No limit' : o.perTenantLimit}</SaFact>
          <SaFact label="Stacking">{o.stackable ? 'Allowed' : 'One offer'}</SaFact>
          <SaFact label="Plans">{(o.planIds || []).length ? o.planIds.join(', ') : 'All plans'}</SaFact>
          <SaFact label="Starts">{o.startsAt ? offerWhen(o.startsAt) : 'No start date'}</SaFact>
          <SaFact label="Ends">{o.endsAt ? offerWhen(o.endsAt) : 'No end date'}</SaFact>
        </SaRecordSection>
        <SaMoreInfo>
          <SaFact label="Offer id">{o.offerId || '—'}</SaFact>
        </SaMoreInfo>
        <SaHelper>Editing an offer does not rewrite discounts already applied to invoices or redemptions.</SaHelper>
        <SaRecordActions>
          <button type="button" className="btn btn-primary" onClick={() => startEdit(o)}>Edit</button>
          <button type="button" className="btn btn-secondary" onClick={() => patch(o, { active: o.active === false })}>{o.active === false ? 'Enable' : 'Disable'}</button>
          <button type="button" className="btn btn-secondary" onClick={() => { if (!o.archived && !window.confirm('Archive this offer? Already-applied discounts stay as they are.')) return; patch(o, { archived: !o.archived }); }}>{o.archived ? 'Unarchive' : 'Archive'}</button>
        </SaRecordActions>
      </SaPage>
    );
  }

  return (
    <SaPage id="sa-offers">
      <SaPageHeader
        onBack={() => onOpen('landing')}
        backLabel="Payments"
        title="Offers"
        subtitle="Editing an offer does not rewrite discounts already applied to invoices or redemptions."
        actions={<button type="button" className="btn btn-primary" onClick={startCreate}>New offer</button>}
      />
      <FiltersMenu
        buttonId="sa-offers-filters-button"
        menuId="sa-offers-filters-menu"
        chips={chips}
        onApply={() => setQuery(draft)}
        onReset={() => { setDraft(emptyQuery); setQuery(emptyQuery); }}
        onClose={() => setDraft(query)}
      >
        <label className="form-label" style={{ margin: 0 }}>Search
          <input className="form-input" value={draft.q} onChange={e => setDraft(d => ({ ...d, q: e.target.value }))} placeholder="Name or code" />
        </label>
        <label className="form-label" htmlFor="sa-offers-status" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>Status
          <select id="sa-offers-status" className="form-select" value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
            <option value="">All statuses</option>
            <option value="available">Available</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </label>
      </FiltersMenu>
      {offers.length === 0 && (
        <SaEmpty title="No offers match">
          Clear the filters, or create a new offer.
        </SaEmpty>
      )}
      {offers.length > 0 && (
        <SaList>
          {offers.map(o => (
            <SaListRow
              key={o.offerId}
              title={o.code}
              meta={o.name}
              extra={`${discount(o)} · used ${o.usedCount || 0}${o.usageLimit ? `/${o.usageLimit}` : ''}`}
              status={offerBadge(o)}
              badge={<SaStatusBadge status={offerBadge(o)}>{statusOf(o)}</SaStatusBadge>}
              onClick={() => openOffer(o)}
            />
          ))}
        </SaList>
      )}
    </SaPage>
  );
}
