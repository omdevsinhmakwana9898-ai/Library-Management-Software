import React, { useCallback, useEffect, useState } from 'react';
import { Building2, Eye, KeyRound, Power, Trash2, UserPlus, BarChart3 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../utils/api';
import {
  SaEmpty,
  SaFact,
  SaHelper,
  SaMoreInfo,
  SaPage,
  SaPageHeader,
  SaRecordActions,
  SaRecordHero,
  SaRecordSection,
  SaRecordTimeline,
  SaStatusBadge,
} from './saPage';

const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—');
const fmtStamp = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never');

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

  if (loading) return <SaPage id="sa-library-details"><p style={{ margin: 0 }}>Loading library…</p></SaPage>;
  if (!library) {
    return (
      <SaPage id="sa-library-details">
        <SaPageHeader onBack={onBack} backLabel="Library directory" title="Library" subtitle="This record could not be opened." />
        <SaEmpty title="This library is not available">
          Go back to the directory and choose another library.
        </SaEmpty>
      </SaPage>
    );
  }

  const disabling = library.status === 'Active';
  const dates = [
    library.createdAt ? { label: 'Created', at: fmtDate(library.createdAt) } : null,
    library.expiry ? { label: 'Plan ends', at: fmtDate(library.expiry) } : null,
    library.lastActiveAt ? { label: 'Last active', at: fmtStamp(library.lastActiveAt) } : null,
  ].filter(Boolean);

  return (
    <SaPage id="sa-library-details">
      <SaPageHeader
        onBack={onBack}
        backLabel="Library directory"
        title={library.name}
      />

      <SaRecordHero
        name={library.name}
        status={library.accountStatus}
        badge={(
          <>
            <SaStatusBadge status={library.accountStatus} />
            {library.trial ? <SaStatusBadge status="trial">Trial</SaStatusBadge> : null}
          </>
        )}
      />
      <SaRecordTimeline steps={dates} />

      <SaRecordSection title="Plan">
        <SaFact label="Software Plan">{library.planName || 'No plan'}</SaFact>
        <SaFact label="Plan Expiry">{fmtDate(library.expiry)}</SaFact>
        <SaFact label="Subscription">{library.subscriptionLabel || '—'}</SaFact>
      </SaRecordSection>

      <SaRecordSection title="Owner">
        <SaFact label="Owner Name">{library.owner?.name || '—'}</SaFact>
        <SaFact label="Mobile">{library.mobile || '—'}</SaFact>
        <SaFact label="Email">{library.email || '—'}</SaFact>
        <SaFact label="Assigned Partner">{library.assignedPartner || '—'}</SaFact>
        <SaFact label="Last Active">{fmtStamp(library.lastActiveAt)}</SaFact>
        <SaFact label="City">
          <form onSubmit={saveCity} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 4 }}>
            <input className="form-input" aria-label="City" value={city} onChange={e => setCity(e.target.value)} style={{ maxWidth: 220, minWidth: 0, flex: '1 1 140px' }} />
            <button className="btn btn-secondary btn-sm" type="submit" disabled={savingCity}>{savingCity ? 'Saving…' : 'Save'}</button>
          </form>
        </SaFact>
      </SaRecordSection>

      <SaMoreInfo>
        <SaFact label="Library id">{library.libraryId || '—'}</SaFact>
        {library.planId ? <SaFact label="Plan id">{library.planId}</SaFact> : null}
        {library.subscriptionRaw ? <SaFact label="Subscription code">{library.subscriptionRaw}</SaFact> : null}
      </SaMoreInfo>

      <SaHelper>View Only opens this library without saving. Access Library can make changes. Disable only blocks sign-in.</SaHelper>

      <div className="premium-card" style={{ padding: 18, border: '1px solid #fecaca', background: '#fff1f2' }}>
        <h3 style={{ margin: '0 0 6px', fontSize: 22, color: '#991b1b' }}>Delete Library</h3>
        <p style={{ margin: '0 0 12px', fontSize: 14, color: '#7f1d1d', maxWidth: 640 }}>Permanently deletes {library.name} and its students, payments, settings and staff accounts. This cannot be undone. Other libraries are not affected. To only block sign-in, use Disable library.</p>
        <button type="button" className="btn btn-danger" onClick={() => onDelete(library)}><Trash2 size={18} /> Delete Library</button>
      </div>

      <SaRecordActions>
        <button type="button" className="btn btn-secondary" onClick={() => onAnalytics(library)}><BarChart3 size={16} /> Library analytics</button>
        <button type="button" className="btn btn-secondary" onClick={() => onOpenLibrary(library, true)}><Eye size={16} /> View Only</button>
        <button type="button" className="btn btn-primary" onClick={() => onOpenLibrary(library, false)}><Building2 size={16} /> Access Library</button>
        <button type="button" className="btn btn-secondary" onClick={() => onInvite(library)}><UserPlus size={16} /> Manage Staff</button>
        <button type="button" className="btn btn-secondary" onClick={() => onReset(library)}><KeyRound size={16} /> Assisted password reset</button>
        <button type="button" className="btn btn-secondary" onClick={() => { setReason(''); setStatusOpen(true); }}><Power size={16} /> {disabling ? 'Disable library' : 'Enable library'}</button>
      </SaRecordActions>

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
    </SaPage>
  );
}
