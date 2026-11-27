import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { SaEmpty, SaList, SaListRow, SaPage, SaPageHeader, SaStatusBadge, SaSummaryCard, SaSummaryGrid } from '../saPage';
import { sourceLabel } from './shared';

export function AssignmentsPage({ libraries, onChanged, onOpen }) {
  const [partners, setPartners] = useState([]);
  const [rows, setRows] = useState([]);
  const [assign, setAssign] = useState({ libraryId: '', partnerId: '', originalSellerId: '', reason: '' });
  const load = useCallback(async () => {
    try {
      const [p, a] = await Promise.all([api.adminPartners(), api.adminAssignments()]);
      setPartners(Array.isArray(p) ? p : []);
      setRows(Array.isArray(a) ? a : []);
    } catch (e) { toast.error(e.message || 'Could not load assignments'); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const name = (id) => partners.find(p => p.id === id)?.name || '—';
  const set = (k) => (e) => setAssign(x => ({ ...x, [k]: e.target.value }));
  const save = async (e) => {
    e.preventDefault();
    try {
      await api.adminAssignLibrary(assign.libraryId, {
        partnerId: assign.partnerId || null,
        ...(assign.originalSellerId ? { originalSellerId: assign.originalSellerId } : {}),
        reason: assign.reason,
      });
      toast.success('Assignment saved');
      setAssign({ libraryId: '', partnerId: '', originalSellerId: '', reason: '' });
      load();
      onChanged?.();
    } catch (err) { toast.error(err.message); }
  };
  const activePartners = partners.filter(p => p.kind === 'partner' && p.status === 'Active');
  const withPartner = rows.filter(a => a.partnerId).length;
  const direct = rows.filter(a => !a.originalSellerId).length;
  return (
    <SaPage id="sa-partner-assignments">
      <SaPageHeader
        onBack={() => onOpen('landing')}
        backLabel="Partners & Commissions"
        title="Assignment / transfer"
        subtitle="Direct website signups have no original seller, so they never earn a new-sale commission. A partner assigned later can earn renewal commissions."
      />
      <SaSummaryGrid>
        <SaSummaryCard label="Libraries" value={rows.length} sub="Assignment rows" />
        <SaSummaryCard label="Managing partner set" value={withPartner} sub="Libraries with a partner" tone="#eff6ff" />
        <SaSummaryCard label="Direct signups" value={direct} sub="No original seller" tone="#fff7ed" />
      </SaSummaryGrid>
      <form className="premium-card" style={{ padding: 16, display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', alignItems: 'end' }} onSubmit={save}>
        <strong style={{ gridColumn: '1 / -1', fontSize: 16 }}>Assign or transfer a library</strong>
        <label className="form-label" style={{ margin: 0 }}>Library
          <select className="form-select" required value={assign.libraryId} onChange={set('libraryId')}>
            <option value="">Pick a library</option>
            {libraries.map(l => <option key={l.libraryId} value={l.libraryId}>{l.name}</option>)}
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Managing partner
          <select className="form-select" value={assign.partnerId} onChange={set('partnerId')}>
            <option value="">None</option>
            {activePartners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Original seller (once)
          <select className="form-select" value={assign.originalSellerId} onChange={set('originalSellerId')}>
            <option value="">Leave as is</option>
            {partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Transfer reason
          <input className="form-input" value={assign.reason} onChange={set('reason')} />
        </label>
        <button className="btn btn-primary" type="submit">Save assignment</button>
        <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          The original seller cannot be changed once set. If an initial sale is already recorded, attribution stays locked. Only an Active partner can be the managing partner.
        </p>
      </form>
      {rows.length === 0 && (
        <SaEmpty title="No assignments yet">
          Assign a library when a partner should manage it.
        </SaEmpty>
      )}
      {rows.length > 0 && (
        <SaList>
          {rows.map(a => (
            <SaListRow
              key={a.tenantId}
              title={a.libraryName || a.tenantId}
              meta={`Managing partner: ${name(a.partnerId)}`}
              extra={`Original seller: ${a.originalSellerId ? name(a.originalSellerId) : 'None (direct signup)'} · ${a.history?.length ? (a.history[a.history.length - 1].reason || 'No reason recorded') : 'No transfer yet'}`}
              badge={<SaStatusBadge status={a.source === 'seller' ? 'active' : 'open'}>{sourceLabel(a.source)}</SaStatusBadge>}
            />
          ))}
        </SaList>
      )}
    </SaPage>
  );
}
