import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../utils/api';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtStamp = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

const empty = { q: '', city: '', plan: '', subscription: '', account: '', activity: '', expiry: '', sort: 'name', dir: 'asc', page: 1, pageSize: 25 };

const qs = (o) => {
  const p = new URLSearchParams();
  Object.entries(o).forEach(([k, v]) => { if (v !== '' && v != null) p.set(k, String(v)); });
  const s = p.toString();
  return s ? `?${s}` : '';
};

export function LibraryDirectory({ onOpen }) {
  const [draftQ, setDraftQ] = useState('');
  const [query, setQuery] = useState(empty);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (next) => {
    setLoading(true);
    try { setData(await api.adminLibraryDirectory(qs(next))); }
    catch (e) { toast.error(e.message || 'Could not load the library directory'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(query); }, [load, query]);

  const set = (patch, resetPage = true) => setQuery(q => ({ ...q, ...patch, ...(resetPage ? { page: 1 } : {}) }));
  const sortBy = (key) => setQuery(q => ({ ...q, sort: key, dir: q.sort === key && q.dir === 'asc' ? 'desc' : 'asc', page: 1 }));
  const arrow = (key) => (query.sort === key ? (query.dir === 'asc' ? ' ↑' : ' ↓') : '');

  const items = data?.items || [];
  const total = data?.total || 0;
  const from = total ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = total ? Math.min(total, data.page * data.pageSize) : 0;

  return (
    <div id="sa-library-directory" className="premium-card sa-table-card" style={{ padding: 0 }}>
      <form
        onSubmit={(e) => { e.preventDefault(); set({ q: draftQ.trim() }); }}
        style={{ padding: 12, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', alignItems: 'end' }}
      >
        <label className="form-label" style={{ margin: 0, gridColumn: 'span 2' }}>Search library, owner, email, phone or ID
          <input id="sa-library-search" className="form-input" value={draftQ} onChange={e => setDraftQ(e.target.value)} placeholder="Name, email, phone, ID" />
        </label>
        <label className="form-label" style={{ margin: 0 }}>City
          <select className="form-input" value={query.city} onChange={e => set({ city: e.target.value })}>
            <option value="">All cities</option>
            {(data?.cities || []).map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Software plan
          <select className="form-input" value={query.plan} onChange={e => set({ plan: e.target.value })}>
            <option value="">All plans</option>
            {(data?.plans || []).map(p => <option key={p.planId} value={p.planId}>{p.name}</option>)}
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Subscription
          <select className="form-input" value={query.subscription} onChange={e => set({ subscription: e.target.value })}>
            <option value="">Any</option>
            <option value="active">Active</option>
            <option value="trial">Trial</option>
            <option value="expiring">Expiring soon</option>
            <option value="expired">Expired</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Account
          <select className="form-input" value={query.account} onChange={e => set({ account: e.target.value })}>
            <option value="">Enabled and disabled</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Last activity
          <select className="form-input" value={query.activity} onChange={e => set({ activity: e.target.value })}>
            <option value="">Any time</option>
            <option value="7d">Active in 7 days</option>
            <option value="30d">Active in 30 days</option>
            <option value="90d">Active in 90 days</option>
            <option value="inactive">No activity in 30 days</option>
            <option value="never">Never signed in</option>
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Expiry
          <select className="form-input" value={query.expiry} onChange={e => set({ expiry: e.target.value })}>
            <option value="">Any expiry</option>
            <option value="7d">Expires within 7 days</option>
            <option value="30d">Expires within 30 days</option>
            <option value="90d">Expires within 90 days</option>
            <option value="expired">Already expired</option>
            <option value="none">No expiry date</option>
          </select>
        </label>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary btn-sm" type="submit">Search</button>
          <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setDraftQ(''); setQuery(empty); }}>Clear</button>
        </div>
      </form>
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
