import React, { useCallback, useEffect, useState } from 'react';
import { Download, Lock } from 'lucide-react';
import toast from 'react-hot-toast';
import { api, downloadFile } from '../utils/api';
import { DatePeriodSelect, FiltersMenu, datePeriodLabel, resolveDatePeriod } from './FiltersMenu';
import { SaEmpty, SaPage, SaPageHeader, SaSummaryCard, SaSummaryGrid } from './saPage';

const inr = (n) => `₹${Math.round(Number(n || 0)).toLocaleString('en-IN')}`;
const Bars = ({ rows, label, value, fmt = (v) => v }) => {
  const max = Math.max(1, ...rows.map(r => r[value] || 0));
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      {rows.map(r => (
        <div key={`${r[label]}`} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 34%) minmax(0, 1fr) auto', gap: 8, alignItems: 'center', fontSize: 13, minWidth: 0 }}>
          <span style={{ overflowWrap: 'anywhere' }}>{r[label]}</span>
          <div style={{ background: 'var(--border-light, #f3f4f6)', borderRadius: 4, height: 10 }}><div style={{ width: `${((r[value] || 0) / max) * 100}%`, background: '#111827', height: 10, borderRadius: 4 }} /></div>
          <span style={{ fontWeight: 600 }}>{fmt(r[value])}</span>
        </div>
      ))}
      {rows.length === 0 && <SaEmpty title="No data for these filters">Widen the period or choose all branches and sections.</SaEmpty>}
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
    <SaPage id="sa-insights-overview">
      <SaPageHeader title="Library insights" subtitle="Libraries and active students. Each library’s own fees stay on its analytics page." />
      <div className="premium-card sa-note">
        <Lock size={16} />
        <span>{data?.note || 'Customer fee collections, expenses and seat use are on each library’s analytics. Customer money is separate from software revenue.'}</span>
      </div>
      {t && (
        <SaSummaryGrid>
          <SaSummaryCard label="Libraries" value={t.libraries} sub={`${t.librariesActive} enabled`} />
          <SaSummaryCard label="Active students" value={t.studentsActive} sub={`${t.studentsTotal} enrolled`} />
        </SaSummaryGrid>
      )}
    </SaPage>
  );
}

const blankAnalytics = { period: 'all_time', from: '', to: '', branchId: '', sectionId: '' };
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
    for (const k of ['from', 'to', 'branchId', 'sectionId']) if (o[k]) p.set(k, o[k]);
    const s = p.toString();
    return s ? `?${s}` : '';
  };
  const withBounds = (next) => {
    const period = next.period || 'all_time';
    if (period === 'custom') return { ...next, period, from: next.from || '', to: next.to || '' };
    if (period === 'all_time') return { ...next, period, from: '', to: '' };
    const range = resolveDatePeriod(period);
    return { ...next, period, from: range?.from || '', to: range?.to || '' };
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
    applied.period && applied.period !== 'all_time' && { key: 'period', label: datePeriodLabel(applied.period, applied), onDismiss: () => commit({ ...applied, period: 'all_time', from: '', to: '' }) },
    applied.branchId && { key: 'branch', label: branchName, onDismiss: () => commit({ ...applied, branchId: '', sectionId: '' }) },
    applied.sectionId && { key: 'section', label: sectionName, onDismiss: () => commit({ ...applied, sectionId: '' }) },
  ].filter(Boolean);
  const period = `${data?.filters?.from || 'all time'} → ${data?.filters?.to || 'today'}`;
  return (
    <SaPage id="sa-library-analytics">
      <SaPageHeader
        onBack={onBack}
        backLabel="Library details"
        title={`${name} analytics`}
        subtitle="Students, seats, and this library’s own fees for the selected period."
        actions={<button className="btn btn-secondary btn-sm" type="button" onClick={() => downloadFile(`/admin/insights/export.csv${qs(applied)}`, `library-insights-${libraryId}.csv`).catch(e => toast.error(e.message))}><Download size={14} /> <span>CSV</span></button>}
      />
      <div className="premium-card sa-note">
        <Lock size={16} />
        <span>{data?.privacy || 'Aggregated statistics only. Access is logged.'} Customer fee collections on this page are this library’s own money and are kept separate from software revenue. Period {period}. Branch {branchName || data?.filters?.branchId || 'all'}{data?.filters?.sectionId ? `. Section ${sectionName || data.filters.sectionId}` : ''}.</span>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'flex-start', minWidth: 0 }}>
        <div style={{ flex: '1 1 240px', minWidth: 0 }}>
          <FiltersMenu
            buttonId="sa-analytics-filters-button"
            menuId="sa-analytics-filters-menu"
            chips={chips}
            onApply={(e) => { e?.preventDefault(); setApplied(withBounds(draft)); }}
            onReset={() => commit(blankAnalytics)}
            onClose={() => setDraft(applied)}
            applyDisabled={loading}
          >
            <DatePeriodSelect
              id="sa-analytics-filters-period"
              value={draft.period || 'all_time'}
              onChange={(period) => setDraft(x => ({ ...x, period }))}
              from={draft.from}
              to={draft.to}
              onFromChange={(from) => setDraft(x => ({ ...x, from }))}
              onToChange={(to) => setDraft(x => ({ ...x, to }))}
            />
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
      </div>
      {loading && !t && <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>Loading analytics…</p>}
      {!loading && !t && <SaEmpty title="Analytics are not available yet">Open this page again, or pick another period in Filters.</SaEmpty>}
      {t && (
        <>
          <SaSummaryGrid>
            <SaSummaryCard label="Active students" value={t.studentsActive} sub={`${t.studentsTotal} enrolled`} />
            <SaSummaryCard label="Enrollment" value={t.studentsTotal} />
            <SaSummaryCard label="Seat utilization" value={t.seatUtilization == null ? '—' : `${t.seatUtilization}%`} sub={`${t.seatsOccupied} / ${t.seatsTotal} seats`} />
            <SaSummaryCard label="Customer fee collections" value={inr(t.customerFeeCollections)} sub={`${t.payments} payments`} />
            <SaSummaryCard label="Customer expenses" value={inr(t.customerExpenses)} />
            <SaSummaryCard label="Customer net" value={inr(t.customerNet)} />
          </SaSummaryGrid>
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
    </SaPage>
  );
}
