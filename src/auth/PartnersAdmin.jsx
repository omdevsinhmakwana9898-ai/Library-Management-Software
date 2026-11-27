import React, { useEffect, useState } from 'react';
import { api } from '../utils/api';
import { DirectoryPage } from './partners/DirectoryPage';
import { PartnerDetailPage } from './partners/PartnerDetailPage';
import { AssignmentsPage } from './partners/AssignmentsPage';
import { CommissionsPage } from './partners/CommissionsPage';
import { CommissionRecordPage } from './partners/CommissionRecordPage';
import { PayoutNotesPage } from './partners/PayoutNotesPage';
import { SummaryCards } from './partners/shared';

const LINKS = [
  ['directory', 'Partners / agents directory', 'Type, verified login email, status, permissions, assigned libraries, and current commission rules.'],
  ['assignments', 'Assignment / transfer', 'Managing partner, original seller (once), and the transfer reason. Direct signups stay without a new-sale commission.'],
  ['commissions', 'Commission records', 'Date, seller, library, sale type, frozen rate, amount, record status, and tracking status.'],
  ['payouts', 'Outside payout notes', 'Bookkeeping notes only. The app does not pay partners or move money.'],
];

/** Super Admin landing for partners, assignments, and commission records. */
export function PartnersAdmin({ libraries, onChanged }) {
  const [page, setPage] = useState('landing');
  const [partnerId, setPartnerId] = useState(null);
  const [recordId, setRecordId] = useState(null);
  const [commissionSeed, setCommissionSeed] = useState(null);
  const [summary, setSummary] = useState(null);
  useEffect(() => {
    if (page !== 'landing') return undefined;
    let live = true;
    api.adminPartnerSummary().then(s => { if (live) setSummary(s); }).catch(() => { if (live) setSummary(null); });
    return () => { live = false; };
  }, [page]);
  const open = (next, extra) => {
    if (next === 'detail') setPartnerId(extra || null);
    if (next === 'record') setRecordId(extra || null);
    if (next === 'commissions') setCommissionSeed(extra || null);
    setPage(next);
  };
  if (page === 'directory') return <DirectoryPage libraries={libraries} onOpen={open} onChanged={onChanged} />;
  if (page === 'detail' && partnerId) return <PartnerDetailPage partnerId={partnerId} onOpen={open} />;
  if (page === 'assignments') return <AssignmentsPage libraries={libraries} onOpen={open} onChanged={onChanged} />;
  if (page === 'commissions') return <CommissionsPage libraries={libraries} onOpen={open} onChanged={onChanged} seed={commissionSeed} />;
  if (page === 'record' && recordId) return <CommissionRecordPage recordId={recordId} onOpen={open} onChanged={onChanged} />;
  if (page === 'payouts') return <PayoutNotesPage libraries={libraries} onOpen={open} />;
  return (
    <div id="sa-partners-landing" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Partners &amp; Commissions</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
          Directory, assignment, commission records, and outside payout notes each have their own page. Payouts are not handled inside the app. Whether partners need their own login remains an open owner question; the existing limited partner portal is unchanged.
        </p>
      </div>
      <SummaryCards summary={summary} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
        {LINKS.map(([id, title, text]) => (
          <button key={id} type="button" className="premium-card" onClick={() => open(id)} style={{ textAlign: 'left', padding: 16, cursor: 'pointer', minWidth: 0 }}>
            <strong style={{ fontSize: 16 }}>{title}</strong>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6 }}>{text}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
