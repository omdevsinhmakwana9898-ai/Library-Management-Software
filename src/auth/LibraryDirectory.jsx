import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../utils/api';
import { FiltersMenu } from './FiltersMenu';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtStamp = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const empty = { q: '', city: '', plan: '', subscription: '', account: '', activity: '', expiry: '', sort: 'name', dir: 'asc', page: 1, pageSize: 25 };
const SUB_LABEL = { active: 'Active', trial: 'Trial', expiring: 'Expiring soon', expired: 'Expired', cancelled: 'Cancelled' };
const ACCOUNT_LABEL = { enabled: 'Enabled', disabled: 'Disabled' };
const ACTIVITY_LABEL = { '7d': 'Active in 7 days', '30d': 'Active in 30 days', '90d': 'Active in 90 days', inactive: 'No activity in 30 days', never: 'Never signed in' };
const EXPIRY_LABEL = { '7d': 'Expires within 7 days', '30d': 'Expires within 30 days', '90d': 'Expires within 90 days', expired: 'Already expired', none: 'No expiry date' };
const field = { margin: 0, display: 'flex', flexDirection: 'column', gap: 4 };

const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

export function LibraryDirectory({ onOpen }) {
  const [query, setQuery] = useState(empty);
  const [draft, setDraft] = useState(empty);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (next) => {
    setLoading(true);
    try { setData(await api.adminLibraryDirectory(qs(next))); }
    catch (e) { toast.error(e.message || 'Could not load the library directory'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(query); }, [load, query]);
  useEffect(() => { setDraft(query); }, [query]);

  const set = (patch, resetPage = true) => setQuery(q => ({ ...q, ...patch, ...(resetPage ? { page: 1 } : {}) }));
  const applyFilters = (e) => {
    e?.preventDefault();
    set({ q: draft.q.trim(), city: draft.city, plan: draft.plan, subscription: draft.subscription, account: draft.account, activity: draft.activity, expiry: draft.expiry });
  };
  const resetFilters = () => {
    setDraft(empty);
    setQuery(q => ({ ...empty, sort: q.sort, dir: q.dir, pageSize: q.pageSize }));
  };
  const drop = (key) => set({ [key]: '' });
  const planName = data?.plans?.find(p => p.planId === query.plan)?.name || query.plan;
  const chips = [
    query.q && { key: 'q', label: `Search: ${query.q}`, onDismiss: () => drop('q') },
    query.city && { key: 'city', label: query.city, onDismiss: () => drop('city') },
    query.plan && { key: 'plan', label: planName, onDismiss: () => drop('plan') },
    query.subscription && { key: 'subscription', label: SUB_LABEL[query.subscription] || query.subscription, onDismiss: () => drop('subscription') },
    query.account && { key: 'account', label: ACCOUNT_LABEL[query.account] || query.account, onDismiss: () => drop('account') },
    query.activity && { key: 'activity', label: ACTIVITY_LABEL[query.activity] || query.activity, onDismiss: () => drop('activity') },
    query.expiry && { key: 'expiry', label: EXPIRY_LABEL[query.expiry] || query.expiry, onDismiss: () => drop('expiry') },
  ].filter(Boolean);
  const sortBy = (key) => setQuery(q => ({ ...q, sort: key, dir: q.sort === key && q.dir === 'asc' ? 'desc' : 'asc', page: 1 }));
  const arrow = (key) => (query.sort === key ? (query.dir === 'asc' ? ' ↑' : ' ↓') : '');

  const items = data?.items || [];
  const total = data?.total || 0;
  const from = total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = total ? Math.min(total, data.page * data.pageSize) : 0;

  return (
    <div id="sa-library-directory" className="premium-card sa-table-card" style={{ padding: 0 }}>
      <div style={{ padding: 12 }}>
        <FiltersMenu
          buttonId="sa-library-filters-button"
          menuId="sa-library-filters-menu"
          chips={chips}
          onApply={applyFilters}
          onReset={resetFilters}
          onClose={() => setDraft(query)}
          applyDisabled={loading}
        >
          <label className="form-label" style={field}>Search library, owner, email, phone or ID
            <input id="sa-library-search" className="form-input" value={draft.q} onChange={e => setDraft(d => ({ ...d, q: e.target.value }))} placeholder="Name, email, phone, ID" />
          </label>
          <label className="form-label" style={field}>City
            <select className="form-input" value={draft.city} onChange={e => setDraft(d => ({ ...d, city: e.target.value }))}>
              <option value="">All cities</option>
              {(data?.cities || []).map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label className="form-label" style={field}>Software plan
            <select className="form-input" value={draft.plan} onChange={e => setDraft(d => ({ ...d, plan: e.target.value }))}>
              <option value="">All plans</option>
              {(data?.plans || []).map(p => <option key={p.planId} value={p.planId}>{p.name}</option>)}
            </select>
          </label>
          <label className="form-label" style={field}>Subscription
            <select className="form-input" value={draft.subscription} onChange={e => setDraft(d => ({ ...d, subscription: e.target.value }))}>
              <option value="">Any</option>
              <option value="active">Active</option>
              <option value="trial">Trial</option>
              <option value="expiring">Expiring soon</option>
              <option value="expired">Expired</option>
              <option value="cancelled">Cancelled</option>
            </select>
          </label>
          <label className="form-label" style={field}>Account
            <select className="form-input" value={draft.account} onChange={e => setDraft(d => ({ ...d, account: e.target.value }))}>
              <option value="">Enabled and disabled</option>
              <option value="enabled">Enabled</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
          <label className="form-label" style={field}>Last activity
            <select className="form-input" value={draft.activity} onChange={e => setDraft(d => ({ ...d, activity: e.target.value }))}>
              <option value="">Any time</option>
              <option value="7d">Active in 7 days</option>
              <option value="30d">Active in 30 days</option>
              <option value="90d">Active in 90 days</option>
              <option value="inactive">No activity in 30 days</option>
              <option value="never">Never signed in</option>
            </select>
          </label>
          <label className="form-label" style={field}>Expiry
            <select className="form-input" value={draft.expiry} onChange={e => setDraft(d => ({ ...d, expiry: e.target.value }))}>
              <option value="">Any expiry</option>
              <option value="7d">Expires within 7 days</option>
              <option value="30d">Expires within 30 days</option>
              <option value="90d">Expires within 90 days</option>
              <option value="expired">Already expired</option>
              <option value="none">No expiry date</option>
            </select>
          </label>
        </FiltersMenu>
      </div>
      <div className="table-container">
        <table className="data-grid" style={{ width: '100%', minWidth: 980 }}>
          <thead>
            <tr>
              {[
                ['name', 'Library Name'],
                ['city', 'City'],
                ['owner', 'Owner'],
                ['plan', 'Current Software Plan'],
                ['expiry', 'Expiry'],
                ['subscription', 'Subscription Status'],
                ['account', 'Account Status'],
                ['students', 'Active/Total Students'],
                ['lastActive', 'Last Activity'],
              ].map(([key, label]) => (
                <th key={key} aria-sort={query.sort === key ? (query.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                  <button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0, minHeight: 0, fontWeight: 700 }} onClick={() => sortBy(key)}>{label}{arrow(key)}</button>
                </th>
              ))}
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={10}>Loading…</td></tr>}
            {!loading && items.length === 0 && <tr><td colSpan={10}>No libraries match these filters.</td></tr>}
            {items.map(l => (
              <tr key={l.libraryId} onClick={() => onOpen(l.libraryId)} style={{ cursor: 'pointer' }}>
                <td><strong>{l.name}</strong><div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{l.libraryId}</div></td>
                <td>{l.city || '—'}</td>
                <td style={{ fontSize: 12 }}>{l.owner ? <><strong>{l.owner.name || l.owner.email}</strong><div style={{ color: 'var(--text-tertiary)' }}>{l.owner.email}</div></> : '—'}</td>
                <td>{l.planName || '—'}{l.trial ? ' · Trial' : ''}</td>
                <td>{fmtDate(l.expiry)}</td>
                <td>{l.subscriptionLabel}</td>
                <td><span className={`badge ${l.accountStatus === 'Enabled' ? 'badge-active' : 'badge-expired'}`}>{l.accountStatus}</span>{l.deletionRequested && <div style={{ fontSize: 11, color: '#dc2626', marginTop: 2 }}>Deletion requested</div>}</td>
                <td>{l.studentsActive} / {l.studentsTotal}</td>
                <td style={{ fontSize: 12 }}>{fmtStamp(l.lastActiveAt)}</td>
                <td>
                  <button type="button" className="btn btn-secondary btn-sm" onClick={(e) => { e.stopPropagation(); onOpen(l.libraryId); }}>Details</button>
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
            <select className="form-input" style={{ marginLeft: 6, width: 'auto', display: 'inline-block' }} value={query.pageSize} onChange={e => set({ pageSize: Number(e.target.value) })}>
              {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!data || data.page <= 1} onClick={() => set({ page: query.page - 1 }, false)}>Previous</button>
          <span>Page {data?.page || 1} of {data?.pages || 1}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={!data || data.page >= data.pages} onClick={() => set({ page: query.page + 1 }, false)}>Next</button>
        </div>
      </div>
    </div>
  );
}
