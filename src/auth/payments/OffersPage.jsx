import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { SaModal } from '../SaModal';
import { FiltersMenu } from '../FiltersMenu';

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
  const [open, setOpen] = useState(false);
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

  const startCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const startEdit = (o) => {
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
    setOpen(true);
  };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = toBody(form);
      if (editing) await api.adminUpdateOffer(editing.offerId, body);
      else await api.adminCreateOffer(body);
      setOpen(false);
      toast.success(editing ? 'Offer updated' : 'Offer created');
      await load(query);
    } catch (err) { toast.error(err.message || 'Could not save offer'); }
    finally { setBusy(false); }
  };
  const patch = async (o, body) => {
    try { await api.adminUpdateOffer(o.offerId, body); await load(query); }
    catch (e) { toast.error(e.message); }
  };

  return (
    <div id="sa-offers" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpen('landing')}><ArrowLeft size={14} /> Payments</button>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 0' }}>Offers</h2>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>+ New offer</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Editing an offer does not rewrite discounts already applied to invoices or redemptions.</p>
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
      <SaModal open={open} title={editing ? 'Edit offer' : 'New offer'} onClose={() => setOpen(false)}>
        <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Name<input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Code<input className="form-input" value={form.code} onChange={e => setForm({ ...form, code: e.target.value.toUpperCase() })} required /></label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Type<select className="form-input" value={form.discountType} onChange={e => setForm({ ...form, discountType: e.target.value })}><option value="percentage">%</option><option value="fixed">₹ fixed</option></select></label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Value<input className="form-input" value={form.discountValue} onChange={e => setForm({ ...form, discountValue: e.target.value })} required /></label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Total uses<input className="form-input" inputMode="numeric" value={form.usageLimit} onChange={e => setForm({ ...form, usageLimit: e.target.value })} placeholder="Unlimited" /></label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Per-library uses<input className="form-input" inputMode="numeric" value={form.perTenantLimit} onChange={e => setForm({ ...form, perTenantLimit: e.target.value })} /></label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Eligible plans (IDs, comma separated)<input className="form-input" value={form.planIds} onChange={e => setForm({ ...form, planIds: e.target.value })} placeholder="All plans" /></label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Starts<input className="form-input" type="date" value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} /></label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Ends<input className="form-input" type="date" value={form.endsAt} onChange={e => setForm({ ...form, endsAt: e.target.value })} /></label>
          <label style={{ display: 'flex', gap: 6, fontSize: 13 }}><input type="checkbox" checked={form.stackable} onChange={e => setForm({ ...form, stackable: e.target.checked })} /> Allow stacking where permitted</label>
          {editing && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>This does not change historical redemptions. Usage shown on the list stays the settled count.</p>}
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{editing ? 'Save offer' : 'Create offer'}</button>
          </div>
        </form>
      </SaModal>
      {(offers || []).map(o => (
        <div key={o.offerId} className="premium-card" style={{ padding: 12, fontSize: 13, minWidth: 0 }}>
          <div style={{ overflowWrap: 'anywhere' }}><strong>{o.code}</strong> · {o.name} · {o.discountType === 'percentage' ? `${o.discountValue}%` : `₹${(Number(o.discountValue || 0) / 100).toFixed(2)}`} · used {o.usedCount || 0}{o.usageLimit ? `/${o.usageLimit}` : ''}</div>
          <div>{statusOf(o)} · {o.stackable ? 'stackable' : 'single offer'}{(o.planIds || []).length ? ` · plans: ${o.planIds.join(', ')}` : ' · all plans'}</div>
          <div>{o.startsAt ? `Starts ${new Date(o.startsAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })} · ` : ''}{o.endsAt ? `Ends ${new Date(o.endsAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}` : 'No end date'}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(o)}>Edit</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => patch(o, { active: o.active === false })}>{o.active === false ? 'Enable' : 'Disable'}</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => { if (!o.archived && !window.confirm('Archive this offer? Already-applied discounts stay as they are.')) return; patch(o, { archived: !o.archived }); }}>{o.archived ? 'Unarchive' : 'Archive'}</button>
          </div>
        </div>
      ))}
      {offers.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No offers match.</div>}
    </div>
  );
}
