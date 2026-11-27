import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { DatePeriodSelect, FiltersMenu, datePeriodLabel } from '../FiltersMenu';
import { SaEmpty, SaList, SaListRow, SaPage, SaPageHeader, SaStatusBadge } from '../saPage';
import { Pager, PERM_LABEL, SummaryCards, kindLabel, permText, qs, ruleText } from './shared';

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
    query.preset !== 'all_time' && { key: 'period', label: datePeriodLabel(query.preset, query), onDismiss: () => setQuery({ ...query, preset: 'all_time', from: '', to: '', page: 1 }) },
    query.kind && { key: 'kind', label: kindLabel(query.kind), onDismiss: () => setQuery({ ...query, kind: '', page: 1 }) },
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

  const items = data?.items || [];
  return (
    <SaPage id="sa-partners-directory">
      <SaPageHeader
        onBack={() => onOpen('landing')}
        backLabel="Partners & Commissions"
        title="Partners and agents"
        subtitle="Type, login email, status, permissions, assigned libraries, and the current commission rules. Open a person for the detail page."
      />
      <SummaryCards summary={summary} />
      <form className="premium-card" style={{ padding: 16, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', alignItems: 'end' }} onSubmit={create}>
        <strong style={{ gridColumn: '1 / -1', fontSize: 16 }}>Add partner or agent</strong>
        <label className="form-label" style={{ margin: 0 }}>Type
          <select className="form-select" value={form.kind} onChange={e => setForm(f => ({ ...f, kind: e.target.value }))}>
            <option value="partner">Partner (manages clients)</option>
            <option value="agent">Agent (sales/referrals)</option>
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Name
          <input className="form-input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
        </label>
        <label className="form-label" style={{ margin: 0 }}>Login email
          <input className="form-input" type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </label>
        <button className="btn btn-primary" type="submit">Create</button>
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
        <DatePeriodSelect
          id="sa-partners-filters-period"
          value={draft.preset || 'all_time'}
          onChange={(preset) => setDraft(d => ({ ...d, preset }))}
          from={draft.from}
          to={draft.to}
          onFromChange={(from) => setDraft(d => ({ ...d, from }))}
          onToChange={(to) => setDraft(d => ({ ...d, to }))}
        />
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
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Period filters by the date the partner or agent was created. {data?.total ?? 0} matches.</p>
      {loading && items.length === 0 && <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>Loading…</p>}
      {!loading && items.length === 0 && (
        <SaEmpty title="No partners or agents match">
          Clear a filter, or add a partner or agent above.
        </SaEmpty>
      )}
      {items.length > 0 && (
        <SaList>
          {items.map(p => (
            <SaListRow
              key={p.id}
              title={p.name}
              meta={`${kindLabel(p.kind)} · ${p.email}`}
              extra={`${p.emailVerified ? 'Verified login email' : 'Login email not verified'} · ${permText(p)} · ${p.assignedLibraries?.length ? p.assignedLibraries.map(l => l.name).join(', ') : 'No assigned libraries'} · New sale ${ruleText(p.rules?.initial)} · Renewal ${ruleText(p.rules?.renewal)}`}
              onClick={() => onOpen('detail', p.id)}
              badge={(
                <span style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  <SaStatusBadge status={p.kind === 'agent' ? 'open' : 'active'}>{kindLabel(p.kind)}</SaStatusBadge>
                  <SaStatusBadge status={p.emailVerified ? 'active' : 'pending'}>{p.emailVerified ? 'Verified' : 'Not verified'}</SaStatusBadge>
                  <SaStatusBadge status={p.status} />
                </span>
              )}
            />
          ))}
        </SaList>
      )}
      <Pager page={query.page} pages={data?.pages} loading={loading} onPage={(page) => setQuery({ ...query, page })} />
      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>Permissions you can grant: {Object.values(PERM_LABEL).join(', ')}. Change them on the person’s page.</p>
    </SaPage>
  );
}
