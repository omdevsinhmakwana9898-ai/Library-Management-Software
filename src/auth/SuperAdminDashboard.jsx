import { confirmNameMatches } from '../utils/confirmName';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { LogOut, Plus, RefreshCw, Shield, UserPlus } from 'lucide-react';
import { AssistedPasswordReset } from './AssistedPasswordReset';
import toast, { Toaster } from 'react-hot-toast';
import { api } from '../utils/api';
import { verifiedAdminRefresh } from '../utils/refreshFeedback';
import { SUPERADMIN_REFRESH } from '../utils/refreshCopy';
import { useAuth } from './AuthContext';
import { PlatformInsightsOverview, LibraryAnalytics } from './LibraryInsights';
import { LibraryDirectory } from './LibraryDirectory';
import { LibraryDetails } from './LibraryDetails';
import { CollectionDetails, inrMinor } from './CollectionDetails';
import { PartnersAdmin } from './PartnersAdmin';
import { SupportDesk } from './SupportDesk';
import { SoftwarePlansCatalog } from './SoftwarePlansCatalog';
import { LibraryPlans } from './LibraryPlans';
import { PaymentsAdmin } from './PaymentsAdmin';
import { WalletsAdmin } from './WalletsAdmin';
import { MessagingAdmin } from './MessagingAdmin';
import { DemoRequestsAdmin } from './DemoRequestsAdmin';
import { SaModal } from './SaModal';

const KPI_TONES = {
  blue: { background: '#eff6ff', color: '#1e3a8a', accent: '#2563eb' },
  green: { background: '#f0fdf4', color: '#14532d', accent: '#16a34a' },
  violet: { background: '#f5f3ff', color: '#4c1d95', accent: '#7c3aed' },
  amber: { background: '#fffbeb', color: '#78350f', accent: '#d97706' },
  rose: { background: '#fff1f2', color: '#881337', accent: '#e11d48' },
  slate: { background: '#f8fafc', color: '#0f172a', accent: '#334155' },
};

const Stat = ({ label, value, sub, tone = 'slate' }) => {
  const c = KPI_TONES[tone] || KPI_TONES.slate;
  return (
    <div className="premium-card" style={{ padding: '16px 18px', minWidth: 0, background: c.background, borderColor: 'transparent' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: c.color, lineHeight: 1.3 }}>{label}</div>
      <div style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: c.accent, marginTop: 6 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: c.color, marginTop: 4, lineHeight: 1.4 }}>{sub}</div>}
    </div>
  );
};

const Bars = ({ rows, label, value, color = '#111827', fmt = (v) => v }) => {
  const max = Math.max(1, ...rows.map(r => Number(r[value]) || 0));
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {rows.map(r => (
        <div key={`${r[label]}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(88px, 34%) 1fr auto', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[label]}{r.current ? ' · now' : ''}</span>
          <div style={{ background: '#e5e7eb', borderRadius: 99, height: 10 }}><div style={{ width: `${(Number(r[value]) || 0) / max * 100}%`, background: r.current ? '#047857' : color, height: 10, borderRadius: 99 }} /></div>
          <span style={{ fontWeight: 700 }}>{fmt(r[value])}</span>
        </div>
      ))}
      {rows.length === 0 && <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No records yet.</span>}
    </div>
  );
};

export function SuperAdminDashboard({ onOpenLibrary }) {
  const { user, logout } = useAuth();
  const [libraries, setLibraries] = useState([]);
  const [summary, setSummary] = useState(null);
  const [business, setBusiness] = useState(null);
  const [collections, setCollections] = useState(null);
  const [view, setView] = useState('business');
  const viewRef = useRef('business');
  const [collectionQuery, setCollectionQuery] = useState({ preset: 'this_month', q: '', kind: '', status: '', provider: '', from: '', to: '' });
  const collectionQueryRef = useRef(collectionQuery);
  const [insightNav, setInsightNav] = useState(null);
  const [planDetailId, setPlanDetailId] = useState(null);
  const [paymentsKey, setPaymentsKey] = useState(0);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: '', adminEmail: '', adminName: '' });
  const [createOpen, setCreateOpen] = useState(false);
  const [inviteFor, setInviteFor] = useState(null);
  const [inviteEmail, setInviteEmail] = useState('');
  // Issue #16: permanent delete with the library name typed back.
  const [deleteFor, setDeleteFor] = useState(null);
  const [deleteName, setDeleteName] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [resetFor, setResetFor] = useState(null);
  const nameOk = !!deleteFor && confirmNameMatches(deleteName, deleteFor.name);
  const confirmDelete = async (e) => {
    e.preventDefault();
    if (!deleteFor) return;
    if (!confirmNameMatches(deleteName, deleteFor.name)) { setDeleteError(`Type "${deleteFor.name}" to confirm.`); return; }
    setDeleting(true); setDeleteError('');
    try {
      await api.adminDeleteLibrary(deleteFor.libraryId, deleteName);
      toast.success(`${deleteFor.name} deleted`);
      if (insightNav?.libraryId === deleteFor.libraryId) setInsightNav(null);
      if (planDetailId === deleteFor.libraryId) setPlanDetailId(null);
      setDeleteFor(null); setDeleteName(''); load();
    } catch (err) {
      // Shown inside the dialog: a toast can sit behind the full-screen dialog on phones.
      setDeleteError(err?.message || 'Delete failed. Nothing was deleted. Please try again.');
    } finally { setDeleting(false); }
  };

  const collectionQs = (q) => {
    const p = new URLSearchParams();
    p.set('preset', q.preset || 'this_month');
    if (q.preset === 'custom') {
      if (q.from) p.set('from', q.from);
      if (q.to) p.set('to', q.to);
    }
    if (q.q) p.set('q', q.q);
    if (q.kind) p.set('kind', q.kind);
    if (q.status) p.set('status', q.status);
    if (q.provider) p.set('provider', q.provider);
    return `?${p.toString()}`;
  };

  const load = useCallback(async ({ silent = false } = {}) => {
    setLoading(true);
    try {
      const jobs = [api.adminLibraries(), api.adminSaasSummary(), api.adminBusinessDashboard()];
      const wantCollections = viewRef.current === 'collections';
      if (wantCollections) jobs.push(api.adminCollections(collectionQs(collectionQueryRef.current)));
      const [libs, sum, dash, col] = await Promise.all(jobs);
      verifiedAdminRefresh(libs, sum);
      if (!dash?.thisMonth || !Array.isArray(dash?.charts?.monthlyCollections) || !Array.isArray(dash?.charts?.popularPlans) || !Array.isArray(dash?.charts?.cities)) {
        throw new Error('Software collection did not return');
      }
      if (wantCollections && !col?.totals) throw new Error('Collection details did not return');
      const extra = Object.fromEntries(sum.list.map(x => [x.libraryId, x]));
      setLibraries(libs.map(l => ({ ...l, ...extra[l.libraryId] })));
      setSummary(sum);
      setBusiness(dash);
      if (wantCollections) setCollections(col);
      return { ok: true };
    } catch (e) {
      if (!silent) toast.error(e.message || 'Could not load libraries');
      return { ok: false, error: e };
    } finally { setLoading(false); }
  }, []);

  const openThisMonthCollections = async () => {
    const next = { preset: 'this_month', q: '', kind: '', status: '', provider: '', from: '', to: '' };
    collectionQueryRef.current = next;
    setCollectionQuery(next);
    viewRef.current = 'collections';
    setView('collections');
    const result = await load({ silent: true });
    if (!result.ok) toast.error(result.error?.message || 'Could not load collection details');
  };

  const applyCollectionQuery = async (next) => {
    collectionQueryRef.current = next;
    setCollectionQuery(next);
    viewRef.current = 'collections';
    const result = await load({ silent: true });
    if (!result.ok) toast.error(result.error?.message || 'Could not load collection details');
  };

  useEffect(() => { load(); }, [load]);

  const refreshInFlight = useRef(false);
  const refreshLibraries = async () => {
    if (refreshInFlight.current || loading) return;
    refreshInFlight.current = true;
    const toastId = toast.loading(SUPERADMIN_REFRESH.refreshing);
    try {
      const result = await load({ silent: true });
      if (result.ok) toast.success(SUPERADMIN_REFRESH.refreshed, { id: toastId });
      else toast.error(result.error?.message || SUPERADMIN_REFRESH.failed, { id: toastId });
    } finally {
      refreshInFlight.current = false;
    }
  };

  const createLibrary = async (e) => {
    e.preventDefault();
    try {
      const r = await api.adminCreateLibrary({ name: form.name, adminEmail: form.adminEmail || undefined, adminName: form.adminName || undefined });
      toast.success(`Created ${r.library.name}${r.admin ? ` — ${r.admin.email} can now sign in with Google` : ''}`);
      setForm({ name: '', adminEmail: '', adminName: '' });
      setCreateOpen(false);
      load();
    } catch (err) { toast.error(err.message); }
  };

  const addAdmin = async (e) => {
    e.preventDefault();
    try {
      await api.adminAddLibraryUser(inviteFor.libraryId, { email: inviteEmail, role: 'client_admin' });
      toast.success(`${inviteEmail} added as client admin`);
      setInviteFor(null); setInviteEmail(''); load();
    } catch (err) { toast.error(err.message); }
  };

  return (
    <div style={{ minHeight: '100vh', overflowY: 'auto' }}>
      <header className="glass-panel sa-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 24px', position: 'sticky', top: 0, zIndex: 10 }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <Shield size={22} />
          <div>
            <h1 style={{ fontSize: 18, fontWeight: 700 }}>Super Admin — My Library OS</h1>
            <p style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{user?.email}</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button type="button" className="btn btn-secondary btn-sm" onClick={refreshLibraries} disabled={loading} aria-busy={loading}><RefreshCw size={14} /> <span>{loading ? SUPERADMIN_REFRESH.refreshing : 'Refresh'}</span></button>
          <button className="btn btn-ghost btn-sm" onClick={logout}><LogOut size={14} /> <span>Sign out</span></button>
        </div>
      </header>

      <main className="sa-main" style={{ padding: 24, maxWidth: 1200, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
        <div role="tablist" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button role="tab" aria-selected={view === 'business'} className={`btn btn-sm ${view === 'business' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { viewRef.current = 'business'; setView('business'); }}>Business dashboard</button>
          <button role="tab" aria-selected={view === 'insights'} className={`btn btn-sm ${view === 'insights' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { viewRef.current = 'insights'; setView('insights'); setInsightNav(null); }}>Library Insights &amp; Analytics</button>
          <button role="tab" id="sa-tab-partners" aria-selected={view === 'partners'} className={`btn btn-sm ${view === 'partners' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { viewRef.current = 'partners'; setView('partners'); }}>Partners &amp; Commissions</button>
          <button role="tab" id="sa-tab-software-plans" aria-selected={view === 'plans'} className={`btn btn-sm ${view === 'plans' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { viewRef.current = 'plans'; setView('plans'); setPlanDetailId(null); }}>Software plans</button>
          <button role="tab" id="sa-tab-library-plans" aria-selected={view === 'library-plans'} className={`btn btn-sm ${view === 'library-plans' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { viewRef.current = 'library-plans'; setView('library-plans'); }}>Library plans</button>
          <button role="tab" id="sa-tab-payments" aria-selected={view === 'payments'} className={`btn btn-sm ${view === 'payments' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { viewRef.current = 'payments'; setView('payments'); setPaymentsKey(k => k + 1); }}>Payments</button>
          <button role="tab" id="sa-tab-wallets" aria-selected={view === 'wallets'} className={`btn btn-sm ${view === 'wallets' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { viewRef.current = 'wallets'; setView('wallets'); }}>Library wallets</button>
          <button role="tab" id="sa-tab-messaging" aria-selected={view === 'messaging'} className={`btn btn-sm ${view === 'messaging' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { viewRef.current = 'messaging'; setView('messaging'); }}>Messaging</button>
          <button role="tab" aria-selected={view === 'support'} className={`btn btn-sm ${view === 'support' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { viewRef.current = 'support'; setView('support'); }}>Support tickets{summary?.kpis?.support?.value ? ` (${summary.kpis.support.value})` : ''}</button>
          <button role="tab" aria-selected={view === 'demos'} className={`btn btn-sm ${view === 'demos' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { viewRef.current = 'demos'; setView('demos'); }}>Demo requests</button>
        </div>

        {view === 'collections' && (
          <CollectionDetails
            query={collectionQuery}
            data={collections}
            loading={loading}
            onQuery={applyCollectionQuery}
            onBack={() => { viewRef.current = 'business'; setView('business'); }}
          />
        )}
        {view === 'plans' && <SoftwarePlansCatalog onChanged={load} />}
        {view === 'library-plans' && !planDetailId && <LibraryPlans onOpen={setPlanDetailId} />}
        {view === 'library-plans' && planDetailId && (
          <LibraryDetails
            libraryId={planDetailId}
            backLabel="Back to library plans"
            onBack={() => setPlanDetailId(null)}
            onOpenLibrary={onOpenLibrary}
            onInvite={(lib) => { setInviteEmail(''); setInviteFor(lib); }}
            onReset={setResetFor}
            onDelete={(lib) => { setDeleteFor(lib); setDeleteName(''); setDeleteError(''); }}
            onAnalytics={(lib) => { setInsightNav({ page: 'analytics', libraryId: lib.libraryId, name: lib.name }); viewRef.current = 'insights'; setView('insights'); }}
            onChanged={load}
          />
        )}
        {view === 'wallets' && <WalletsAdmin />}
        {view === 'payments' && (
          <PaymentsAdmin
            key={paymentsKey}
            onOpenCollections={(hint) => {
              const next = { preset: 'all_time', q: hint || '', kind: '', status: '', provider: '', from: '', to: '' };
              collectionQueryRef.current = next;
              setCollectionQuery(next);
              viewRef.current = 'collections';
              setView('collections');
              load({ silent: true }).then(result => {
                if (!result.ok) toast.error(result.error?.message || 'Could not load collection details');
              });
            }}
            onOpenLibrary={(libraryId) => {
              setInsightNav({ page: 'details', libraryId });
              viewRef.current = 'insights';
              setView('insights');
            }}
          />
        )}
        {view === 'messaging' && <MessagingAdmin accountMobile={user?.mobile || ''} />}
        {view === 'partners' && <PartnersAdmin libraries={libraries} onChanged={load} />}
        {view === 'support' && <SupportDesk libraries={libraries} onAccessLibrary={(id) => { const l = libraries.find(x => x.libraryId === id); if (l) onOpenLibrary(l, true); }} />}
        {view === 'demos' && <DemoRequestsAdmin />}

        {view === 'business' && summary && (
          <div id="sa-business-dashboard" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div id="sa-totals" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              <Stat tone="blue" label="Customer libraries" value={summary.libraries.total} sub={`${summary.libraries.active} active • ${summary.libraries.disabled} disabled`} />
              <Stat tone="green" label="New this month" value={summary.libraries.newThisMonth} />
              <Stat tone="violet" label="Active in last 7 days" value={summary.libraries.activeLast7Days} sub="libraries with a login" />
              <Stat tone="amber" label="Owner / staff logins" value={`${summary.accounts.owners} / ${summary.accounts.staff}`} />
              {Object.entries(summary.kpis || {}).map(([k, v]) => v && !v.error && <Stat key={k} tone={k === 'support' ? 'rose' : 'slate'} label={v.label || k} value={v.value} sub={v.sub} />)}
            </div>
            <button type="button" id="sa-collection-card" className="premium-card" onClick={openThisMonthCollections} style={{ textAlign: 'left', cursor: 'pointer', background: 'linear-gradient(135deg, #064e3b, #047857)', color: '#fff', border: 0, padding: '22px 24px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>This Month Software Collection</div>
              <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-0.04em', marginTop: 4 }}>{business ? inrMinor(business.thisMonth.collectedMinor) : '…'}</div>
              <div style={{ fontSize: 14, opacity: 0.92, marginTop: 4 }}>{business ? `${business.thisMonth.paymentCount} verified cash payments · ${business.thisMonth.month} · ${business.timezone}` : 'Loading verified software cash'}</div>
              <div style={{ fontSize: 13, opacity: 0.88, marginTop: 8, maxWidth: 680 }}>{business?.definition}</div>
            </button>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
              Customer students, seats and fee collections stay in Library Insights. Trials, WhatsApp add-on revenue and overdue invoices are not shown here.
            </p>
            {business && (
              <div id="sa-business-charts" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
                <div className="premium-card" style={{ padding: 16, minWidth: 0 }}>
                  <strong style={{ fontSize: 15 }}>Popular Software Plans</strong>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 10px' }}>Libraries currently on each software plan.</p>
                  <Bars rows={business.charts.popularPlans} label="name" value="libraries" color="#2563eb" />
                </div>
                <div className="premium-card" style={{ padding: 16, minWidth: 0 }}>
                  <strong style={{ fontSize: 15 }}>Cities — Active Libraries</strong>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 10px' }}>Active libraries by registered city. Empty cities are Unknown.</p>
                  <Bars rows={business.charts.cities} label="city" value="libraries" color="#7c3aed" />
                </div>
                <div className="premium-card" style={{ padding: 16, minWidth: 0 }}>
                  <strong style={{ fontSize: 15 }}>Monthly Software Collections</strong>
                  <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 10px' }}>Verified gateway cash by month. The current month is marked.</p>
                  <Bars rows={business.charts.monthlyCollections} label="month" value="collectedMinor" color="#0f766e" fmt={inrMinor} />
                </div>
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> New library</button>
            </div>
          </div>
        )}

        {view === 'insights' && !insightNav && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
            <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>Library directory</h2>
            <button type="button" className="btn btn-primary" onClick={() => setCreateOpen(true)}><Plus size={14} /> New library</button>
          </div>
        )}
        {view === 'insights' && !insightNav && <PlatformInsightsOverview />}
        {view === 'insights' && !insightNav && <LibraryDirectory onOpen={(libraryId) => setInsightNav({ page: 'details', libraryId })} />}
        {view === 'insights' && insightNav?.page === 'details' && (
          <LibraryDetails
            libraryId={insightNav.libraryId}
            onBack={() => setInsightNav(null)}
            onOpenLibrary={onOpenLibrary}
            onInvite={(lib) => { setInviteEmail(''); setInviteFor(lib); }}
            onReset={setResetFor}
            onDelete={(lib) => { setDeleteFor(lib); setDeleteName(''); setDeleteError(''); }}
            onAnalytics={(lib) => setInsightNav({ page: 'analytics', libraryId: lib.libraryId, name: lib.name })}
            onChanged={load}
          />
        )}
        {view === 'insights' && insightNav?.page === 'analytics' && (
          <LibraryAnalytics key={insightNav.libraryId} libraryId={insightNav.libraryId} libraryName={insightNav.name} onBack={() => setInsightNav({ page: 'details', libraryId: insightNav.libraryId })} />
        )}

        {deleteFor && (
          <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Delete library" onClick={() => !deleting && setDeleteFor(null)}>
            <form className="modal-content" style={{ maxWidth: 440, padding: 20 }} onClick={e => e.stopPropagation()} onSubmit={confirmDelete}>
              <h3 style={{ margin: '0 0 8px', color: '#b91c1c' }}>Delete {deleteFor.name}?</h3>
              <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
                This permanently deletes this library (ID <strong>{deleteFor.libraryId}</strong>): its students, payments, settings, staff accounts and other data. It cannot be undone. Other libraries are not touched. To only block access, use Disable instead.
              </p>
              <label className="form-label" htmlFor="delete-lib-name">Type <strong>{deleteFor.name}</strong> to confirm</label>
              <input id="delete-lib-name" className="form-input" autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} enterKeyHint="done" value={deleteName} onChange={e => { setDeleteName(e.target.value); setDeleteError(''); }} aria-describedby="delete-lib-hint" />
              <div id="delete-lib-hint" role={deleteError ? 'alert' : undefined} style={{ fontSize: 12, marginTop: 6, minHeight: 16, color: deleteError ? '#b91c1c' : nameOk ? '#15803d' : 'var(--text-tertiary)' }}>
                {deleteError || (nameOk ? 'Name matches.' : deleteName ? 'Name does not match yet (spelling, capitals and spacing must match exactly).' : '')}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-secondary" disabled={deleting} onClick={() => setDeleteFor(null)}>Cancel</button>
                <button type="submit" className="btn btn-danger" style={{ background: '#dc2626', color: '#fff' }} disabled={deleting || !nameOk}>{deleting ? 'Deleting…' : 'Delete permanently'}</button>
              </div>
            </form>
          </div>
        )}
        {resetFor && <AssistedPasswordReset library={resetFor} onClose={() => setResetFor(null)} />}
        {inviteFor && (
          <form className="premium-card" style={{ padding: 16, display: 'flex', gap: 8, alignItems: 'flex-end', flexWrap: 'wrap' }} onSubmit={addAdmin}>
            <div className="form-group" style={{ flex: 1, minWidth: 240, marginBottom: 0 }}>
              <label className="form-label">Add client admin to {inviteFor.name} (Google account email)</label>
              <input className="form-input" type="email" required value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} />
            </div>
            <button className="btn btn-primary" type="submit"><UserPlus size={14} /> <span>Add</span></button>
            <button className="btn btn-ghost" type="button" onClick={() => setInviteFor(null)}>Cancel</button>
          </form>
        )}

        <SaModal open={createOpen} title="New library" onClose={() => setCreateOpen(false)} maxWidth={520}>
          <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={createLibrary}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">New library name</label>
              <input className="form-input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Client admin email (Google)</label>
              <input className="form-input" type="email" value={form.adminEmail} onChange={e => setForm(f => ({ ...f, adminEmail: e.target.value }))} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Admin name</label>
              <input className="form-input" value={form.adminName} onChange={e => setForm(f => ({ ...f, adminName: e.target.value }))} />
            </div>
            <div className="modal-footer" style={{ margin: '0 -24px -24px', padding: 16 }}>
              <button className="btn btn-secondary" type="button" onClick={() => setCreateOpen(false)}>Cancel</button>
              <button className="btn btn-primary" type="submit"><Plus size={14} /> <span>Create library</span></button>
            </div>
          </form>
        </SaModal>
      </main>
      <Toaster position="bottom-right" />
    </div>
  );
}
