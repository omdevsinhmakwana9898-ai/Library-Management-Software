import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { SaPage, SaPageHeader } from '../saPage';

/** Full page for a new partner or agent. The temporary password is toasted once and is not kept on the page. */
export function PartnerCreatePage({ onOpen, onChanged }) {
  const [form, setForm] = useState({ kind: 'partner', name: '', email: '' });
  const [busy, setBusy] = useState(false);
  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.adminCreatePartner(form);
      toast.success(r.generatedPassword ? `Created. Temporary password (shown once): ${r.generatedPassword}` : 'Created', { duration: 15000 });
      onChanged?.();
      onOpen('directory');
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };
  return (
    <SaPage id="sa-partner-create">
      <SaPageHeader
        onBack={() => onOpen('directory')}
        backLabel="Partners and agents"
        title="Add partner or agent"
      />
      <form className="premium-card" style={{ padding: 16, display: 'grid', gap: 12, maxWidth: 560 }} onSubmit={create}>
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
          <input className="form-input" type="email" required autoComplete="off" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
        </label>
        <div className="sa-action-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" type="button" onClick={() => onOpen('directory')}>Cancel</button>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Creating…' : 'Create'}</button>
        </div>
      </form>
    </SaPage>
  );
}
