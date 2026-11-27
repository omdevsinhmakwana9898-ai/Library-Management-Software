import React, { useCallback, useEffect, useState } from 'react';
import { Download, Lock, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, downloadFile } from '../utils/api';
import { FiltersMenu } from './FiltersMenu';

const inr = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const Stat = ({ label, value, sub }) => (
  <div className="premium-card" style={{ padding: 14, minWidth: 140, flex: '1 1 140px' }}>
    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
    <div style={{ fontSize: 20, fontWeight: 700, overflowWrap: 'anywhere' }}>{value}</div>
    {sub && <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{sub}</div>}
  </div>
);
const Bars = ({ rows, label, value, fmt = (v) => v }) => {
  const max = Math.max(1, ...rows.map(r => r[value] || 0));
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map(r => (
        <div key={`${r[label]}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(70px, 30%) 1fr auto', gap: 8, alignItems: 'center', fontSize: 12 }}>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r[label]}</span>
          <div style={{ background: 'var(--border-light, #f3f4f6)', borderRadius: 4, height: 10 }}><div style={{ width: `${((r[value] || 0) / max) * 100}%`, background: '#111827', height: 10, borderRadius: 4 }} /></div>
          <span style={{ fontWeight: 600 }}>{fmt(r[value])}</span>
        </div>
      ))}
      {rows.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>No data for these filters.</span>}
    </div>
  );
};

/** Platform Library Insights header: libraries and active students only. */
export function PlatformInsightsOverview() {
  const [data, setData] = useState(null);
  const load = useCallback(async () => {
    try { setData(await api.adminInsightsOverview()); } catch (e) { toast.error(e.message); }
  }, []);
  useEffect(() => { load(); }, [load]);
  const t = data?.totals;
  return (
    <div id="sa-insights-overview" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="premium-card" style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-secondary)' }}>
        <Lock size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>{data?.note || 'Customer fee collections, expenses and seat use are on each library’s analytics. Customer money is separate from software revenue.'}</span>
      </div>
      {t && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <Stat label="Libraries" value={t.libraries} sub={`${t.librariesActive} enabled`} />
          <Stat label="Active students" value={t.studentsActive} sub={`${t.studentsTotal} enrolled`} />
        </div>
      )}
    </div>
  );
}

const blankAnalytics = { from: '', to: '', branchId: '', sectionId: '' };
const stackLabel = { margin: 0, display: 'flex', flexDirection: 'column', gap: 4 };

/** One library’s operational analytics. Customer fees stay in this view. */
export function LibraryAnalytics({ libraryId, libraryName, onBack }) {
  const [applied, setApplied] = useState(blankAnalytics);
  const [draft, setDraft] = useState(blankAnalytics);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const qs = (o) => {
    const p = new URLSearchParams();
    if (libraryId) p.set('libraryId', libraryId);
    Object.entries(o).forEach(([k, v]) => v && p.set(k, v));
    const s = p.toString();
    return s ? `?${s}` : '';
  };
  const load = useCallback(async (filters) => {
    if (!libraryId) return;
    setLoading(true);
    try { setData(await api.adminInsights(qs(filters))); } catch (e) { toast.error(e.message); } finally { setLoading(false); }
  }, [libraryId]);
  const [prevLibraryId, setPrevLibraryId] = useState(libraryId);
  if (libraryId !== prevLibraryId) {
    setPrevLibraryId(libraryId);
    setApplied(blankAnalytics);
    setDraft(blankAnalytics);
  }
  useEffect(() => { load(applied); }, [load, applied]);
  useEffect(() => { setDraft(applied); }, [applied]);
  const set = (k) => (e) => setDraft(x => ({ ...x, [k]: e.target.value, ...(k === 'branchId' ? { sectionId: '' } : {}) }));
  const commit = (next) => { setDraft(next); setApplied(next); };
  const t = data?.totals;
  const row = data?.perLibrary?.[0];
  const name = row?.name || libraryName || libraryId;
  const branches = (data?.catalog?.branches || []).filter(b => b.libraryId === libraryId);
  const sections = (data?.catalog?.sections || []).filter(s => s.libraryId === libraryId && (!draft.branchId || s.branchId === draft.branchId));
  const branchName = branches.find(b => b.branchId === applied.branchId)?.name || applied.branchId;
  const sectionName = (data?.catalog?.sections || []).find(s => s.sectionId === applied.sectionId)?.name || applied.sectionId;
  const chips = [
    (applied.from || applied.to) && { key: 'period', label: `${applied.from || '…'} – ${applied.to || '…'}`, onDismiss: () => commit({ ...applied, from: '', to: '' }) },
    applied.branchId && { key: 'branch', label: branchName, onDismiss: () => commit({ ...applied, branchId: '', sectionId: '' }) },
    applied.sectionId && { key: 'section', label: sectionName, onDismiss: () => commit({ ...applied, sectionId: '' }) },
  ].filter(Boolean);
  const period = `${data?.filters?.from || 'all time'} → ${data?.filters?.to || 'today'}`;
  return (
    <div id="sa-library-analytics" style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
      <div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onBack} style={{ paddingLeft: 0 }}><ArrowLeft size={14} /> Back to library</button>
        <h2 style={{ fontSize: 26, fontWeight: 800, margin: '8px 0 0' }}>{name} analytics</h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
          Library {libraryId} · period {period} · branch {branchName || data?.filters?.branchId || 'all'}{data?.filters?.sectionId ? ` · section ${data.filters.sectionId}` : ''}
        </p>
      </div>
      <div className="premium-card" style={{ padding: 12, display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 12, color: 'var(--text-secondary)' }}>
        <Lock size={16} style={{ flexShrink: 0, marginTop: 1 }} />
        <span>{data?.privacy || 'Aggregated statistics only. Access is logged.'} Customer fee collections on this page are this library’s own money and are kept separate from software revenue.</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start' }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <FiltersMenu
            buttonId="sa-analytics-filters-button"
            menuId="sa-analytics-filters-menu"
            chips={chips}
            onApply={(e) => { e?.preventDefault(); setApplied({ ...draft }); }}
            onReset={() => commit(blankAnalytics)}
            onClose={() => setDraft(applied)}
            applyDisabled={loading}
          >
            <label className="form-label" style={stackLabel}>From<input className="form-input" type="date" value={draft.from} onChange={set('from')} /></label>
            <label className="form-label" style={stackLabel}>To<input className="form-input" type="date" value={draft.to} onChange={set('to')} /></label>
            <label className="form-label" style={stackLabel}>Branch
              <select className="form-input" value={draft.branchId} onChange={set('branchId')}>
                <option value="">All branches</option>
                {branches.map(b => <option key={b.branchId} value={b.branchId}>{b.name}</option>)}
              </select>
            </label>
            <label className="form-label" style={stackLabel}>Section
              <select className="form-input" value={draft.sectionId} onChange={set('sectionId')}>
                <option value="">All sections</option>
                {sections.map(s => <option key={s.sectionId} value={s.sectionId}>{s.name}</option>)}
              </select>
            </label>
          </FiltersMenu>
        </div>
        <button className="btn btn-secondary btn-sm" type="button" onClick={() => downloadFile(`/admin/insights/export.csv${qs(applied)}`, `library-insights-${libraryId}.csv`).catch(e => toast.error(e.message))}><Download size={14} /> <span>CSV</span></button>
      </div>
      {t && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <Stat label="Active students" value={t.studentsActive} sub={`${t.studentsTotal} enrolled`} />
            <Stat label="Enrollment" value={t.studentsTotal} />
            <Stat label="Seat utilization" value={t.seatUtilization == null ? '—' : `${t.seatUtilization}%`} sub={`${t.seatsOccupied} / ${t.seatsTotal} seats`} />
            <Stat label="Customer fee collections" value={inr(t.customerFeeCollections)} sub={`${t.payments} payments`} />
            <Stat label="Customer expenses" value={inr(t.customerExpenses)} />
            <Stat label="Customer net" value={inr(t.customerNet)} />
          </div>
          <div style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
            <div className="premium-card" style={{ padding: 14, minWidth: 0 }}><strong style={{ fontSize: 14 }}>Collections by month</strong><div style={{ marginTop: 8 }}><Bars rows={data.trend} label="month" value="collections" fmt={inr} /></div></div>
            <div className="premium-card" style={{ padding: 14, minWidth: 0 }}><strong style={{ fontSize: 14 }}>Popular membership plans</strong><div style={{ marginTop: 8 }}><Bars rows={data.popularPlans} label="name" value="students" /></div></div>
            <div className="premium-card" style={{ padding: 14, minWidth: 0 }}><strong style={{ fontSize: 14 }}>Branches</strong><div style={{ marginTop: 8 }}><Bars rows={(data.branches || []).map(b => ({ name: b.branchId || 'Unassigned', collections: b.collections }))} label="name" value="collections" fmt={inr} /></div></div>
          </div>
          {row && (
            <div className="premium-card" style={{ padding: 14, fontSize: 14 }}>
              <strong>{row.name}</strong>
              <span> · {row.studentsActive} / {row.studentsTotal} students · {row.seatsOccupied} / {row.seatsTotal} seats · {inr(row.collections)} collected · {inr(row.expenses)} expenses · {inr(row.net)} net</span>
            </div>
          )}
        </>
      )}
    </div>
  );
}
