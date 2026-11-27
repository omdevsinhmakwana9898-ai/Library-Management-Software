import React, { useCallback, useEffect, useState } from 'react';
import { Power } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { SaEmpty, SaFact, SaFactList, SaPage, SaPageHeader, SaStatusBadge, SaSummaryCard, SaSummaryGrid } from '../saPage';
import { PERM_LABEL, RuleEditor, kindLabel, ruleText } from './shared';

export function PartnerDetailPage({ partnerId, onOpen }) {
  const [p, setP] = useState(null);
  const [missing, setMissing] = useState(false);
  const load = useCallback(async () => {
    try {
      setP(await api.adminPartner(partnerId));
      setMissing(false);
    } catch (e) {
      setMissing(true);
      toast.error(e.message || 'Could not load this partner');
    }
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
  if (!p) {
    return (
      <SaPage id="sa-partner-detail">
        <SaPageHeader onBack={() => onOpen('directory')} backLabel="Directory" title="Partner" subtitle={missing ? 'This record could not be opened.' : 'Loading this partner.'} />
        {missing ? <SaEmpty title="This partner is not available">Go back and choose another person.</SaEmpty> : <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>Loading partner…</p>}
      </SaPage>
    );
  }
  const libraries = p.assignedLibraries || [];
  return (
    <SaPage id="sa-partner-detail">
      <SaPageHeader
        onBack={() => onOpen('directory')}
        backLabel="Directory"
        title={p.name}
        subtitle={`${kindLabel(p.kind)} · ${p.email}`}
        actions={<button type="button" className="btn btn-secondary" onClick={toggle}><Power size={14} /> {p.status === 'Active' ? 'Disable' : 'Enable'}</button>}
      />
      <div className="sa-action-row">
        <SaStatusBadge status={p.status} />
        <SaStatusBadge status={p.kind === 'agent' ? 'open' : 'active'}>{kindLabel(p.kind)}</SaStatusBadge>
        <SaStatusBadge status={p.emailVerified ? 'active' : 'pending'}>{p.emailVerified ? 'Verified email' : 'Email not verified'}</SaStatusBadge>
      </div>
      <SaSummaryGrid>
        <SaSummaryCard label="Assigned libraries" value={libraries.length} sub={libraries.length === 1 ? 'Managing partner' : 'Libraries they manage'} tone="#eff6ff" />
        <SaSummaryCard label="New sale rule" value={ruleText(p.rules?.initial)} sub="Frozen on each new sale" tone="#ecfdf5" />
        <SaSummaryCard label="Renewal rule" value={ruleText(p.rules?.renewal)} sub="Frozen on each renewal" />
      </SaSummaryGrid>
      <div className="sa-action-row">
        <button type="button" className="btn btn-secondary" onClick={() => onOpen('commissions', { partnerId: p.id })}>Commission records</button>
        <button type="button" className="btn btn-secondary" onClick={() => onOpen('assignments')}>Assignment / transfer</button>
      </div>
      <div className="premium-card" style={{ padding: 16, display: 'grid', gap: 10 }}>
        <strong style={{ fontSize: 16 }}>Permissions</strong>
        {Object.keys(PERM_LABEL).map(k => (
          <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <input type="checkbox" checked={!!p.permissions?.[k]} onChange={() => perm(k)} />
            {PERM_LABEL[k]}
          </label>
        ))}
      </div>
      <div className="premium-card" style={{ padding: 16, display: 'grid', gap: 10 }}>
        <strong style={{ fontSize: 16 }}>Current commission rules</strong>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>Saving a rule starts a new version. Old commission records keep the rate frozen at sale time.</p>
        <RuleEditor key={`${p.id}-i-${p.rules?.initial?.version}`} p={p} appliesTo="initial" onSaved={load} />
        <RuleEditor key={`${p.id}-r-${p.rules?.renewal?.version}`} p={p} appliesTo="renewal" onSaved={load} />
      </div>
      {libraries.length === 0 ? (
        <SaEmpty title="No assigned libraries">This account is not the managing partner of a library.</SaEmpty>
      ) : (
        <SaFactList>
          <SaFact label="Assigned libraries">{libraries.map(l => l.name).join(', ')}</SaFact>
        </SaFactList>
      )}
      {!!p.originalSales?.length && (
        <SaFactList>
          <SaFact label="Original seller on">{p.originalSales.map(l => l.name).join(', ')}</SaFact>
        </SaFactList>
      )}
    </SaPage>
  );
}
