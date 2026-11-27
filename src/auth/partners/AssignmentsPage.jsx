import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { BackLink } from './shared';

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
  return (
    <div id="sa-partner-assignments" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div>
        <BackLink onClick={() => onOpen('landing')}>Partners &amp; Commissions</BackLink>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 0' }}>Assignment / transfer</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
          Direct website signups have no original seller, so they never earn a new-sale commission. A partner assigned later can earn renewal commissions.
        </p>
      </div>
      <form className="premium-card" style={{ padding: 14, display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', alignItems: 'end' }} onSubmit={save}>
        <strong style={{ gridColumn: '1 / -1' }}>Assign or transfer a library</strong>
        <label className="form-label" style={{ margin: 0 }}>Library<select className="form-input" required value={assign.libraryId} onChange={set('libraryId')}><option value="">Pick…</option>{libraries.map(l => <option key={l.libraryId} value={l.libraryId}>{l.name}</option>)}</select></label>
        <label className="form-label" style={{ margin: 0 }}>Managing partner<select className="form-input" value={assign.partnerId} onChange={set('partnerId')}><option value="">None</option>{activePartners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="form-label" style={{ margin: 0 }}>Original seller (once)<select className="form-input" value={assign.originalSellerId} onChange={set('originalSellerId')}><option value="">Leave as is</option>{partners.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
        <label className="form-label" style={{ margin: 0 }}>Transfer reason<input className="form-input" value={assign.reason} onChange={set('reason')} /></label>
        <button className="btn btn-primary btn-sm" type="submit">Save</button>
        <p style={{ gridColumn: '1 / -1', margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
          The original seller cannot be changed once set. If an initial sale is already recorded, attribution stays locked. Only an Active partner can be the managing partner.
        </p>
      </form>
      <div className="premium-card sa-table-card" style={{ padding: 0 }}>
        <div className="table-container">
          <table className="data-grid" style={{ width: '100%' }}>
            <thead><tr><th>Library</th><th>Managing partner</th><th>Original seller</th><th>Source</th><th>Last reason</th></tr></thead>
            <tbody>
              {rows.length === 0 && <tr><td colSpan={5}>No assignments yet.</td></tr>}
              {rows.map(a => (
                <tr key={a.tenantId}>
                  <td>{a.libraryName || a.tenantId}</td>
                  <td>{name(a.partnerId)}</td>
                  <td>{a.originalSellerId ? name(a.originalSellerId) : 'None (direct signup)'}</td>
                  <td>{a.source}</td>
                  <td style={{ fontSize: 12 }}>{a.history?.length ? (a.history[a.history.length - 1].reason || '—') : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
