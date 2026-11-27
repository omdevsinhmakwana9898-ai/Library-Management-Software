import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Power } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { FiltersMenu } from '../FiltersMenu';
import { BackLink, Choice, PERM_LABEL, PERIODS, SummaryCards, qs, ruleText } from './shared';

const empty = { q: '', partnerId: '', libraryId: '', kind: '', status: '', preset: 'all_time', from: '', to: '', page: 1 };

export function DirectoryPage({ libraries, onOpen, onChanged }) {
  const [query, setQuery] = useState(empty);
  const [draft, setDraft] = useState(empty);
  const [data, setData] = useState(null);
  const [options, setOptions] = useState([]);
  const [summary, setSummary] = useState(null);
  const [form, setForm] = useState({ kind: 'partner', name: '', email: '' });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (next) => {
    setLoading(true);
    try {
      const [page, all, sum] = await Promise.all([
        api.adminPartners(qs({ ...next, limit: 25 })),
        api.adminPartners(),
        api.adminPartnerSummary(),
      ]);
      setData(page);
      setOptions(Array.isArray(all) ? all : []);
      setSummary(sum);
    } catch (e) { toast.error(e.message || 'Could not load partners'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(query); }, [load, query]);
  useEffect(() => { setDraft(query); }, [query]);

  const apply = (e) => { e?.preventDefault(); setQuery({ ...draft, q: draft.q.trim(), page: 1 }); };
  const reset = () => { setDraft(empty); setQuery(empty); };
  const partnerName = options.find(p => p.id === query.partnerId)?.name || query.partnerId;
  const libraryName = libraries.find(l => l.libraryId === query.libraryId)?.name || query.libraryId;
  const chips = [
    query.q && { key: 'q', label: `Search: ${query.q}`, onDismiss: () => setQuery({ ...query, q: '', page: 1 }) },
    query.partnerId && { key: 'partner', label: partnerName, onDismiss: () => setQuery({ ...query, partnerId: '', page: 1 }) },
    query.libraryId && { key: 'library', label: libraryName, onDismiss: () => setQuery({ ...query, libraryId: '', page: 1 }) },
    query.preset !== 'all_time' && { key: 'period', label: PERIODS.find(([id]) => id === query.preset)?.[1] || query.preset, onDismiss: () => setQuery({ ...query, preset: 'all_time', from: '', to: '', page: 1 }) },
    query.kind && { key: 'kind', label: query.kind, onDismiss: () => setQuery({ ...query, kind: '', page: 1 }) },
    query.status && { key: 'status', label: query.status, onDismiss: () => setQuery({ ...query, status: '', page: 1 }) },
  ].filter(Boolean);

  const create = async (e) => {
    e.preventDefault();
    try {
      const r = await api.adminCreatePartner(form);
      toast.success(r.generatedPassword ? `Created. Temporary password (shown once): ${r.generatedPassword}` : 'Created', { duration: 15000 });
      setForm({ kind: form.kind, name: '', email: '' });
      load(query);
      onChanged?.();
    } catch (err) { toast.error(err.message); }
  };
  const toggle = async (p) => {
    const status = p.status === 'Active' ? 'Disabled' : 'Active';
    if (status === 'Disabled' && !window.confirm(`Disable ${p.name}? They will be signed out.`)) return;
    try { await api.adminUpdatePartner(p.id, { status }); load(query); } catch (e) { toast.error(e.message); }
  };
  const perm = async (p, k) => {
    try { await api.adminUpdatePartner(p.id, { permissions: { [k]: !p.permissions[k] } }); load(query); } catch (e) { toast.error(e.message); }
  };

  const items = data?.items || [];
  return (
    <div id="sa-partners-directory" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div>
        <BackLink onClick={() => onOpen('landing')}>Partners &amp; Commissions</BackLink>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 0' }}>Partners and agents</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>Type, login email, status, permissions, assigned libraries, and the current commission rules. Open a row for the detail view.</p>
      </div>
      <SummaryCards summary={summary} />
      <form className="premium-card" style={{ padding: 14, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', alignItems: 'end' }} onSubmit={create}>
        <strong style={{ gridColumn: '1 / -1' }}>Add partner or agent</strong>
        <label className="form-label" style={{ margin: 0 }}>Type<select className="form-input" value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}><option value="partner">Partner (manages clients)</option><option value="agent">Agent (sales/referrals)</option></select></label>
        <label className="form-label" style={{ margin: 0 }}>Name<input className="form-input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></label>
        <label className="form-label" style={{ margin: 0 }}>Login email<input className="form-input" type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></label>
        <button className="btn btn-primary btn-sm" type="submit"><Plus size={14} /> <span>Create</span></button>
      </form>
      <FiltersMenu
        buttonId="sa-partners-filters-button"
        menuId="sa-partners-filters-menu"
        chips={chips}
        onApply={apply}
        onReset={reset}
        onClose={() => setDraft(query)}
        applyDisabled={loading || (draft.preset === 'custom' && (!draft.from || !draft.to))}
      >
        <label className="form-label" style={{ margin: 0 }}>Partner
          <input className="form-input" value={draft.q} onChange={e => setDraft(d => ({ ...d, q: e.target.value }))} placeholder="Name or email" />
          <select className="form-input" style={{ marginTop: 6 }} value={draft.partnerId} onChange={e => setDraft(d => ({ ...d, partnerId: e.target.value }))}>
            <option value="">Any partner</option>
            {options.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Library
          <select className="form-input" value={draft.libraryId} onChange={e => setDraft(d => ({ ...d, libraryId: e.target.value }))}>
            <option value="">Any library</option>
            {libraries.map(l => <option key={l.libraryId} value={l.libraryId}>{l.name}</option>)}
          </select>
        </label>
        <div role="group" aria-label="Period" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {PERIODS.map(([id, label]) => <Choice key={id} label={label} pressed={draft.preset === id} onClick={() => setDraft(d => ({ ...d, preset: id }))} />)}
        </div>
        {draft.preset === 'custom' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label className="form-label" style={{ margin: 0 }}>From<input className="form-input" type="date" value={draft.from} onChange={e => setDraft(d => ({ ...d, from: e.target.value }))} required /></label>
            <label className="form-label" style={{ margin: 0 }}>To<input className="form-input" type="date" value={draft.to} onChange={e => setDraft(d => ({ ...d, to: e.target.value }))} required /></label>
          </div>
        )}
        <label className="form-label" style={{ margin: 0 }}>Type
          <select className="form-input" value={draft.kind} onChange={e => setDraft(d => ({ ...d, kind: e.target.value }))}>
            <option value="">Partner and agent</option>
            <option value="partner">Partner</option>
            <option value="agent">Agent</option>
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Status
          <select className="form-input" value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
            <option value="">Active and disabled</option>
            <option value="Active">Active</option>
            <option value="Disabled">Disabled</option>
          </select>
        </label>
      </FiltersMenu>
      <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0 }}>Period filters by the date the partner or agent was created. {data?.total ?? 0} matches.</p>
      <div className="premium-card sa-table-card" style={{ padding: 0 }}>
        <div className="table-container">
          <table className="data-grid" style={{ width: '100%' }}>
            <thead><tr><th>Name</th><th>Type</th><th>Login email</th><th>Status</th><th>Permissions</th><th>Assigned libraries</th><th>Current rules</th><th></th></tr></thead>
            <tbody>
              {items.length === 0 && <tr><td colSpan={8}>{loading ? 'Loading…' : 'No partners or agents match.'}</td></tr>}
              {items.map(p => (
                <tr key={p.id}>
                  <td><button type="button" className="btn btn-ghost btn-sm" style={{ padding: 0, fontWeight: 700 }} onClick={() => onOpen('detail', p.id)}>{p.name}</button></td>
                  <td>{p.kind}</td>
                  <td style={{ fontSize: 12 }}>{p.email}<div style={{ color: 'var(--text-tertiary)' }}>{p.emailVerified ? 'Verified' : 'Not verified'}</div></td>
                  <td><span className={`badge ${p.status === 'Active' ? 'badge-active' : 'badge-expired'}`}>{p.status}</span></td>
                  <td style={{ fontSize: 12 }}>
                    {Object.keys(PERM_LABEL).map(k => (
                      <label key={k} style={{ display: 'flex', gap: 4, alignItems: 'center' }}><input type="checkbox" checked={!!p.permissions?.[k]} onChange={() => perm(p, k)} />{PERM_LABEL[k]}</label>
                    ))}
                  </td>
                  <td style={{ fontSize: 12 }}>{p.assignedLibraries?.length ? p.assignedLibraries.map(l => l.name).join(', ') : '—'}</td>
                  <td style={{ fontSize: 12 }}>New sale {ruleText(p.rules?.initial)}<div>Renewal {ruleText(p.rules?.renewal)}</div></td>
                  <td><button className="btn btn-ghost btn-sm" title={p.status === 'Active' ? 'Disable' : 'Enable'} onClick={() => toggle(p)}><Power size={14} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {data && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary btn-sm" disabled={query.page <= 1 || loading} onClick={() => setQuery({ ...query, page: query.page - 1 })}>Previous</button>
          <span style={{ fontSize: 13 }}>Page {data.page} of {data.pages}</span>
          <button type="button" className="btn btn-secondary btn-sm" disabled={query.page >= data.pages || loading} onClick={() => setQuery({ ...query, page: query.page + 1 })}>Next</button>
        </div>
      )}
    </div>
  );
}
