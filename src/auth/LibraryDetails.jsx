import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Eye, KeyRound, Power, Trash2, UserPlus, BarChart3, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../utils/api';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtStamp = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never');

const Field = ({ label, children }) => (
  <div style={{ minWidth: 0 }}>
    <div style={{ fontSize: 12, color: 'var(--text-tertiary)', fontWeight: 600 }}>{label}</div>
    <div style={{ fontSize: 15, marginTop: 2, overflowWrap: 'anywhere' }}>{children}</div>
  </div>
);

export function LibraryDetails({ libraryId, onBack, onOpenLibrary, onInvite, onReset, onDelete, onAnalytics, onChanged }) {
  const [library, setLibrary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [city, setCity] = useState('');
  const [savingCity, setSavingCity] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await api.adminLibraryDetails(libraryId);
      setLibrary(r.library);
      setCity(r.library?.city || '');
    } catch (e) {
      setLibrary(null);
      toast.error(e.message || 'Could not load this library');
    } finally { setLoading(false); }
  }, [libraryId]);

  useEffect(() => { load(); }, [load]);

  const saveCity = async (e) => {
    e.preventDefault();
    setSavingCity(true);
    try {
      await api.adminUpdateLibrary(libraryId, { city: city.trim() });
      toast.success('City saved');
      await load();
      onChanged?.();
    } catch (err) { toast.error(err.message); }
    finally { setSavingCity(false); }
  };

  const saveStatus = async (e) => {
    e.preventDefault();
    if (!library) return;
    const next = library.status === 'Active' ? 'Disabled' : 'Active';
    const why = reason.trim();
    if (why.length < 3) return;
    setSavingStatus(true);
    try {
      await api.adminUpdateLibrary(libraryId, { status: next, reason: why });
      toast.success(next === 'Disabled' ? `${library.name} disabled` : `${library.name} enabled`);
      setStatusOpen(false);
      setReason('');
      await load();
      onChanged?.();
    } catch (err) { toast.error(err.message); }
    finally { setSavingStatus(false); }
  };

  if (loading) return <div id="sa-library-details" className="premium-card" style={{ padding: 20 }}>Loading library…</div>;
  if (!library) {
    return (
      <div id="sa-library-details" className="premium-card" style={{ padding: 20 }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}><ArrowLeft size={14} /> Back to directory</button>
        <p style={{ marginTop: 12 }}>This library is not available.</p>
      </div>
    );
  }

  const disabling = library.status === 'Active';

  return (
    <div id="sa-library-details" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={onBack} style={{ paddingLeft: 0 }}><ArrowLeft size={14} /> Back to directory</button>
          <h2 style={{ fontSize: 32, fontWeight: 800, letterSpacing: '-0.03em', margin: '8px 0 4px' }}>{library.name}</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-secondary)' }}>{library.city || 'City not set'}</span>
            <span className={`badge ${library.accountStatus === 'Enabled' ? 'badge-active' : 'badge-expired'}`}>{library.accountStatus}</span>
          </div>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => onAnalytics(library)}><BarChart3 size={16} /> Library analytics</button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
        <div className="premium-card" style={{ padding: '22px 24px', background: '#eff6ff', borderColor: 'transparent' }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#1e3a8a' }}>Software Plan</div>
          <div style={{ fontSize: 32, fontWeight: 800, marginTop: 6, color: '#1d4ed8' }}>{library.planName || 'No plan'}</div>
          {library.trial && <div style={{ marginTop: 8 }}><span className="badge badge-active">Trial</span></div>}
        </div>
        <div className="premium-card" style={{ padding: '22px 24px', background: '#fffbeb', borderColor: 'transparent' }}>
          <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: '#78350f' }}>Plan Expiry</div>
          <div style={{ fontSize: 32, fontWeight: 800, marginTop: 6, color: '#b45309' }}>{fmtDate(library.expiry)}</div>
        </div>
      </div>

      <div className="premium-card" style={{ padding: 18 }}>
        <strong style={{ fontSize: 16 }}>Library information</strong>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginTop: 14 }}>
          <Field label="Owner Name">{library.owner?.name || '—'}</Field>
          <Field label="City">
            <form onSubmit={saveCity} style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
              <input className="form-input" aria-label="City" value={city} onChange={e => setCity(e.target.value)} style={{ maxWidth: 180 }} />
              <button className="btn btn-secondary btn-sm" type="submit" disabled={savingCity}>{savingCity ? 'Saving…' : 'Save'}</button>
            </form>
          </Field>
          <Field label="Mobile">{library.mobile || '—'}</Field>
          <Field label="Email">{library.email || '—'}</Field>
          <Field label="Assigned Partner">{library.assignedPartner || '—'}</Field>
          <Field label="Account Status">{library.accountStatus}</Field>
          <Field label="Subscription Status">{library.planName ? `${library.planName} · ` : ''}{library.subscriptionLabel}</Field>
          <Field label="Plan Expiry">{fmtDate(library.expiry)}</Field>
          <Field label="Last Active">{fmtStamp(library.lastActiveAt)}</Field>
        </div>
      </div>

      <div className="premium-card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <strong style={{ fontSize: 16 }}>Library actions</strong>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>These actions apply only to {library.name}. View Only opens the owner workspace without saving changes. Access Library opens the same workspace with write access.</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-secondary" onClick={() => onOpenLibrary(library, true)}><Eye size={16} /> View Only</button>
          <button type="button" className="btn btn-primary" onClick={() => onOpenLibrary(library, false)}><Building2 size={16} /> Access Library</button>
          <button type="button" className="btn btn-secondary" onClick={() => onInvite(library)}><UserPlus size={16} /> Manage Staff</button>
          <button type="button" className="btn btn-secondary" onClick={() => onReset(library)}><KeyRound size={16} /> Assisted password reset</button>
          <button type="button" className="btn btn-secondary" onClick={() => { setReason(''); setStatusOpen(true); }}><Power size={16} /> {disabling ? 'Disable library' : 'Enable library'}</button>
        </div>
      </div>

      <div className="premium-card" style={{ padding: 18, border: '1px solid #fecaca', background: '#fff1f2' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 22, color: '#991b1b' }}>Delete Library</h3>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: '#7f1d1d', maxWidth: 640 }}>Permanently deletes {library.name} and its students, payments, settings and staff accounts. This cannot be undone. Other libraries are not affected. To only block sign-in, use Disable library.</p>
        <button type="button" className="btn" style={{ background: '#dc2626', color: '#fff', fontWeight: 800, fontSize: 16, padding: '12px 18px' }} onClick={() => onDelete(library)}><Trash2 size={18} /> Delete Library</button>
      </div>

      {statusOpen && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={disabling ? 'Disable library' : 'Enable library'} onClick={() => !savingStatus && setStatusOpen(false)}>
          <form className="modal-content" style={{ maxWidth: 440, padding: 20 }} onClick={e => e.stopPropagation()} onSubmit={saveStatus}>
            <h3 style={{ margin: '0 0 8px' }}>{disabling ? `Disable ${library.name}?` : `Enable ${library.name}?`}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
              {disabling ? 'Its users will be locked out until you enable the library again.' : 'Users will be able to sign in again.'} A reason is stored in the audit log. This does not change the software subscription.
            </p>
            <label className="form-label" htmlFor="sa-library-status-reason">Reason</label>
            <textarea id="sa-library-status-reason" className="form-input" required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)} />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <button type="button" className="btn btn-secondary" disabled={savingStatus} onClick={() => setStatusOpen(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary" disabled={savingStatus || reason.trim().length < 3}>{savingStatus ? 'Saving…' : 'Confirm'}</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
