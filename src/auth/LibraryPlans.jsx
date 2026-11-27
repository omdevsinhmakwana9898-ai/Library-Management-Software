// Super Admin searchable library-plan assignments. Plan records stay on the catalog page.
import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../utils/api';
import { FiltersMenu } from './FiltersMenu';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const empty = { q: '', plan: '', subscription: '', account: '', renewal: '', expiry: '', expiryFrom: '', expiryTo: '', expiredMonths: '', sort: 'name', dir: 'asc', page: 1, pageSize: 25 };
const field = { margin: 0, display: 'flex', flexDirection: 'column', gap: 4 };
const SUB_LABEL = { active: 'Active', trial: 'Trial', expiring: 'Expiring soon', expired: 'Expired', cancelled: 'Cancelled' };
const ACCOUNT_LABEL = { enabled: 'Account enabled', disabled: 'Account disabled' };
const EXPIRY_LABEL = { '7d': 'Expires within 7 days', '30d': 'Expires within 30 days', '90d': 'Expires within 90 days', expired: 'Already expired', none: 'No expiry date', range: 'Expiry range', months: 'Expired for N months' };

const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

function Choice({ label, pressed, onClick }) {
  return (
    <button type="button" className={`btn btn-sm ${pressed ? 'btn-primary' : 'btn-secondary'}`} style={{ justifyContent: 'flex-start', width: '100%' }} aria-pressed={pressed} onClick={onClick}>{label}</button>
  );
}

export function LibraryPlans({ onOpen }) {
  const [query, setQuery] = useState(empty);
  const [draft, setDraft] = useState(empty);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (next) => {
    setLoading(true);
    try { setData(await api.adminLibraryPlans(qs(next))); }
    catch (e) { toast.error(e.message || 'Could not load library plans'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(query); }, [load, query]);
  useEffect(() => { setDraft(query); }, [query]);

  const set = (patch, resetPage = true) => setQuery(q => ({ ...q, ...patch, ...(resetPage ? { page: 1 } : {}) }));
  const expiryMode = draft.expiredMonths ? 'months' : (draft.expiryFrom || draft.expiryTo) ? 'range' : (draft.expiry || '');
  const applyFilters = (e) => {
    e?.preventDefault();
    const mode = draft.expiredMonths ? 'months' : (draft.expiryFrom || draft.expiryTo) ? 'range' : draft.expiry;
    set({
      q: draft.q.trim(),
      plan: draft.plan,
      subscription: draft.subscription,
      account: draft.account,
      renewal: draft.renewal,
      expiry: mode === 'range' || mode === 'months' ? '' : (draft.expiry || ''),
      expiryFrom: mode === 'range' ? draft.expiryFrom : '',
      expiryTo: mode === 'range' ? draft.expiryTo : '',
      expiredMonths: mode === 'months' ? String(draft.expiredMonths || '') : '',
    });
  };
  const resetFilters = () => {
    setDraft(empty);
    setQuery(q => ({ ...empty, sort: q.sort, dir: q.dir, pageSize: q.pageSize }));
  };
  const drop = (keys) => set(Object.fromEntries(keys.map(k => [k, ''])));
  const planName = data?.plans?.find(p => p.planId === query.plan)?.name || query.plan;
  const expiryChip = query.expiredMonths
    ? `Expired for ${query.expiredMonths} months`
    : (query.expiryFrom || query.expiryTo)
      ? `Expiry ${query.expiryFrom || '…'} – ${query.expiryTo || '…'}`
      : (EXPIRY_LABEL[query.expiry] || '');
  const chips = [
    query.q && { key: 'q', label: `Search: ${query.q}`, onDismiss: () => drop(['q']) },
    query.plan && { key: 'plan', label: planName, onDismiss: () => drop(['plan']) },
    query.subscription && { key: 'subscription', label: SUB_LABEL[query.subscription] || query.subscription, onDismiss: () => drop(['subscription']) },
    query.account && { key: 'account', label: ACCOUNT_LABEL[query.account] || query.account, onDismiss: () => drop(['account']) },
    query.renewal && { key: 'renewal', label: 'Renewal outstanding', onDismiss: () => drop(['renewal']) },
    expiryChip && { key: 'expiry', label: expiryChip, onDismiss: () => drop(['expiry', 'expiryFrom', 'expiryTo', 'expiredMonths']) },
  ].filter(Boolean);

  const sortBy = (key) => setQuery(q => ({ ...q, sort: key, dir: q.sort === key && q.dir === 'asc' ? 'desc' : 'asc', page: 1 }));
  const arrow = (key) => (query.sort === key ? (query.dir === 'asc' ? ' ↑' : ' ↓') : '');
  const pickExpiry = (mode) => setDraft(d => ({
    ...d,
    expiry: mode === 'range' || mode === 'months' ? '' : mode,
    expiryFrom: mode === 'range' ? d.expiryFrom : '',
    expiryTo: mode === 'range' ? d.expiryTo : '',
    expiredMonths: mode === 'months' ? (d.expiredMonths || '1') : '',
  }));

  const items = data?.items || [];
  const total = data?.total || 0;
  const from = total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = total ? Math.min(total, data.page * data.pageSize) : 0;

  return (
    <div id="sa-library-plans" className="premium-card sa-table-card" style={{ padding: 0 }}>
      <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 16 }}>Library plans</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-secondary)', maxWidth: 720 }}>Search libraries and open subscription details. Account Enabled/Disabled is separate from the subscription. Renewal outstanding follows open or failed software invoices and past-due subscriptions. Changing a plan does not create a charge.</p>
        </div>
        <FiltersMenu
          buttonId="sa-library-plans-filters-button"
          menuId="sa-library-plans-filters-menu"
          chips={chips}
          onApply={applyFilters}
          onReset={resetFilters}
          onClose={() => setDraft(query)}
          applyDisabled={loading}
        >
          <label className="form-label" style={field}>Search library, owner, email, mobile or ID
            <input id="sa-library-plans-search" className="form-input" value={draft.q} onChange={e => setDraft(d => ({ ...d, q: e.target.value }))} placeholder="Name, email, mobile, ID" />
          </label>
          <label className="form-label" style={field}>Plan
            <select className="form-input" value={draft.plan} onChange={e => setDraft(d => ({ ...d, plan: e.target.value }))}>
              <option value="">All plans</option>
              {(data?.plans || []).map(p => <option key={p.planId} value={p.planId}>{p.name}</option>)}
            </select>
          </label>
          <div role="group" aria-label="Subscription" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="form-label">Subscription</span>
            {[['', 'Any subscription'], ['active', 'Active'], ['trial', 'Trial'], ['expiring', 'Expiring soon'], ['expired', 'Expired'], ['cancelled', 'Cancelled']].map(([id, label]) => (
              <Choice key={id || 'any-sub'} label={label} pressed={draft.subscription === id} onClick={() => setDraft(d => ({ ...d, subscription: id }))} />
            ))}
          </div>
          <div role="group" aria-label="Account" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="form-label">Account</span>
            {[['', 'Enabled and disabled'], ['enabled', 'Enabled'], ['disabled', 'Disabled']].map(([id, label]) => (
              <Choice key={id || 'any-account'} label={label} pressed={draft.account === id} onClick={() => setDraft(d => ({ ...d, account: id }))} />
            ))}
          </div>
          <div role="group" aria-label="Renewal" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="form-label">Renewal</span>
            <Choice label="Any renewal" pressed={!draft.renewal} onClick={() => setDraft(d => ({ ...d, renewal: '' }))} />
            <Choice label="Renewal outstanding" pressed={draft.renewal === 'outstanding'} onClick={() => setDraft(d => ({ ...d, renewal: 'outstanding' }))} />
          </div>
          <div role="group" aria-label="Expiry" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="form-label">Expiry</span>
            {[['', 'Any expiry'], ['7d', 'Expires within 7 days'], ['30d', 'Expires within 30 days'], ['90d', 'Expires within 90 days'], ['expired', 'Already expired'], ['none', 'No expiry date'], ['range', 'Custom range'], ['months', 'Expired for N months']].map(([id, label]) => (
              <Choice key={id || 'any-expiry'} label={label} pressed={expiryMode === id} onClick={() => pickExpiry(id)} />
            ))}
            {expiryMode === 'range' && (
              <>
                <label className="form-label" style={field}>From
                  <input className="form-input" type="date" value={draft.expiryFrom} onChange={e => setDraft(d => ({ ...d, expiryFrom: e.target.value, expiredMonths: '', expiry: '' }))} />
                </label>
                <label className="form-label" style={field}>To
                  <input className="form-input" type="date" value={draft.expiryTo} onChange={e => setDraft(d => ({ ...d, expiryTo: e.target.value, expiredMonths: '', expiry: '' }))} />
                </label>
              </>
            )}
            {expiryMode === 'months' && (
              <label className="form-label" style={field}>Months
                <input className="form-input" type="number" min={1} max={120} value={draft.expiredMonths} onChange={e => setDraft(d => ({ ...d, expiredMonths: e.target.value, expiryFrom: '', expiryTo: '', expiry: '' }))} />
              </label>
            )}
          </div>
        </FiltersMenu>
        {data?.renewalRule && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>{data.renewalRule}</p>}
      </div>
      <div className="table-container">
        <table className="data-grid" style={{ width: '100%', minWidth: 860 }}>
          <thead>
            <tr>
              {[
                ['name', 'Library'],
                ['owner', 'Owner'],
                ['plan', 'Plan'],
                ['expiry', 'Expiry'],
                ['subscription', 'Subscription'],
                ['account', 'Account'],
                ['renewal', 'Renewal'],
              ].map(([key, label]) => (
                <th key={key} aria-sort={query.sort === key ? (query.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0, minHeight: 0, fontWeight: 700 }} onClick={() => sortBy(key)}>{label}{arrow(key)}</button>
                </th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={8}>Loading…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={8}>No libraries match these filters.</td></tr>}
            {items.map(l => (
              <tr key={l.libraryId}>
                <td><strong>{l.name}</strong><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{l.libraryId}</div></td>
                <td style={{ fontSize: 12 }}>{l.owner?.name || '—'}<div style={{ color: 'var(--text-tertiary)' }}>{l.email || l.mobile || ''}</div></td>
                <td>{l.planName || 'No plan'}{l.trial ? ' · Trial' : ''}</td>
                <td>{fmtDate(l.expiry)}</td>
                <td>{l.subscriptionLabel}</td>
                <td><span className={`badge ${l.accountStatus === 'Enabled' ? 'badge-active' : 'badge-expired'}`}>{l.accountStatus}</span></td>
                <td>{l.renewalOutstanding ? 'Outstanding' : '—'}</td>
                <td>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpen(l.libraryId)}>Subscription</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center', padding: 12, flexWrap: 'wrap', fontSize: 13 }}>
        <span>{total ? `Showing ${from}–${to} of ${total}` : '0 libraries'}</span>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <label className="form-label" style={{ margin: 0 }}>Per page
            <select className="form-input" aria-label="Per page" value={query.pageSize} onChange={e => set({ pageSize: Number(e.target.value) })} style={{ marginLeft: 6 }}>
              {[10, 25, 50].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!data || data.page <= 1} onClick={() => setQuery(q => ({ ...q, page: q.page - 1 }))}>Previous</button>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!data || data.page >= data.pages} onClick={() => setQuery(q => ({ ...q, page: q.page + 1 }))}>Next</button>
        </div>
      </div>
    </div>
  );
}
