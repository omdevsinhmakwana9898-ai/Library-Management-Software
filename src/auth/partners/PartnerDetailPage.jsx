import React, { useCallback, useEffect, useState } from 'react';
import { Power } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import {
  SaEmpty, SaFact, SaHelper, SaMoreInfo, SaPage, SaPageHeader, SaRecordActions,
  SaRecordHero, SaRecordSection, SaRecordTimeline, SaStatusBadge,
} from '../saPage';
import { PERM_LABEL, RuleEditor, formatRecordDate, kindLabel, plainRate } from './shared';

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
  const dates = [
    p.createdAt ? { label: 'Created', at: formatRecordDate(p.createdAt) } : null,
  ].filter(step => step?.at);
  return (
    <SaPage id="sa-partner-detail">
      <SaPageHeader
        onBack={() => onOpen('directory')}
        backLabel="Directory"
        title={p.name}
      />
      <SaRecordHero
        name={p.name}
        badge={(
          <>
            <SaStatusBadge status={p.kind === 'agent' ? 'open' : 'active'}>{kindLabel(p.kind)}</SaStatusBadge>
            <SaStatusBadge status={p.status} />
          </>
        )}
      />
      <SaRecordTimeline steps={dates} />
      <SaRecordSection title="Contact">
        <SaFact label="Email">{p.email || '—'}</SaFact>
        <SaFact label="Phone">{p.phone || '—'}</SaFact>
        <SaFact label="Login email">{p.emailVerified ? 'Verified' : 'Not verified'}</SaFact>
      </SaRecordSection>
      <SaRecordSection title="Assignment and commission rules">
        <SaFact label="Assigned libraries">{libraries.length ? libraries.map(l => l.name).join(', ') : 'None'}</SaFact>
        <SaFact label="Original seller on">{p.originalSales?.length ? p.originalSales.map(l => l.name).join(', ') : 'None'}</SaFact>
        <SaFact label="New sale">{p.rules?.initial ? plainRate(p.rules.initial) : 'No rule yet'}</SaFact>
        <SaFact label="Renewal">{p.rules?.renewal ? plainRate(p.rules.renewal) : 'No rule yet'}</SaFact>
        <div style={{ gridColumn: '1 / -1', display: 'grid', gap: 10 }}>
          <RuleEditor key={`${p.id}-i-${p.rules?.initial?.version}`} p={p} appliesTo="initial" onSaved={load} />
          <RuleEditor key={`${p.id}-r-${p.rules?.renewal?.version}`} p={p} appliesTo="renewal" onSaved={load} />
        </div>
      </SaRecordSection>
      <SaRecordSection title="Permissions">
        {Object.keys(PERM_LABEL).map(k => (
          <label key={k} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14 }}>
            <input type="checkbox" checked={!!p.permissions?.[k]} onChange={() => perm(k)} />
            {PERM_LABEL[k]}
          </label>
        ))}
      </SaRecordSection>
      <SaMoreInfo>
        <SaFact label="Partner id">{p.id || '—'}</SaFact>
        {libraries.map(l => (
          <SaFact key={l.libraryId} label={`${l.name} id`}>{l.libraryId}</SaFact>
        ))}
      </SaMoreInfo>
      <SaHelper>Saving a commission rule starts a new version. Records already saved keep the rate from that sale.</SaHelper>
      <SaRecordActions>
        <button type="button" className="btn btn-secondary" onClick={() => onOpen('commissions', { partnerId: p.id })}>Commission records</button>
        <button type="button" className="btn btn-secondary" onClick={() => onOpen('assignments')}>Assignment / transfer</button>
        <button type="button" className="btn btn-secondary" onClick={toggle}><Power size={14} /> {p.status === 'Active' ? 'Disable' : 'Enable'}</button>
      </SaRecordActions>
    </SaPage>
  );
}
