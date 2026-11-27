import React, { useCallback, useEffect, useState } from 'react';
import { Power } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { BackLink, PERM_LABEL, RuleEditor } from './shared';

export function PartnerDetailPage({ partnerId, onOpen }) {
  const [p, setP] = useState(null);
  const load = useCallback(async () => {
    try { setP(await api.adminPartner(partnerId)); }
    catch (e) { toast.error(e.message || 'Could not load this partner'); }
  }, [partnerId]);
  useEffect(() => { load(); }, [load]);
  const toggle = async () => {
    if (!p) return;
    const status = p.status === 'Active' ? 'Disabled' : 'Active';
    if (status === 'Disabled' && !window.confirm(`Disable ${p.name}? They will be signed out.`)) return;
    try { await api.adminUpdatePartner(p.id, { status }); load(); } catch (e) { toast.error(e.message); }
  };
  const perm = async (k) => {
    try { await api.adminUpdatePartner(p.id, { permissions: { [k]: !p.permissions[k] } }); load(); } catch (e) { toast.error(e.message); }
  };
  if (!p) return <div id="sa-partner-detail">Loading partner…</div>;
  return (
    <div id="sa-partner-detail" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div>
        <BackLink onClick={() => onOpen('directory')}>Directory</BackLink>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 0', overflowWrap: 'anywhere' }}>{p.name}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>{p.kind} · {p.email} · {p.emailVerified ? 'Verified login email' : 'Login email not verified'} · {p.status}</p>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary btn-sm" onClick={toggle}><Power size={14} /> {p.status === 'Active' ? 'Disable' : 'Enable'}</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpen('commissions', { partnerId: p.id })}>Commission records</button>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpen('assignments')}>Assignment / transfer</button>
      </div>
      <div className="premium-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
        <strong>Permissions</strong>
        {Object.keys(PERM_LABEL).map(k => (
          <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 14 }}><input type="checkbox" checked={!!p.permissions?.[k]} onChange={() => perm(k)} />{PERM_LABEL[k]}</label>
        ))}
      </div>
      <div className="premium-card" style={{ padding: 14, display: 'grid', gap: 8 }}>
        <strong>Current commission rules</strong>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>Saving a rule starts a new version. Old commission records keep the rate frozen at sale time.</p>
        <RuleEditor key={`${p.id}-i-${p.rules?.initial?.version}`} p={p} appliesTo="initial" onSaved={load} />
        <RuleEditor key={`${p.id}-r-${p.rules?.renewal?.version}`} p={p} appliesTo="renewal" onSaved={load} />
      </div>
      <div className="premium-card" style={{ padding: 14 }}>
        <strong>Assigned libraries</strong>
        <p style={{ fontSize: 13, margin: '8px 0 0' }}>{p.assignedLibraries?.length ? p.assignedLibraries.map(l => l.name).join(', ') : 'None. This account is not the managing partner of a library.'}</p>
        {!!p.originalSales?.length && <p style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Original seller on: {p.originalSales.map(l => l.name).join(', ')}</p>}
      </div>
    </div>
  );
}
