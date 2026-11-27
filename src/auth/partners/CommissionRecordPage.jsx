import React, { useEffect, useState } from 'react';
import { Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { SaFact, SaFactList, SaPage, SaPageHeader, SaStatusBadge, SaSummaryCard, SaSummaryGrid } from '../saPage';
import { STATUS_HELP, inr, rateText, requirementCopy, saleKindLabel } from './shared';

export function CommissionRecordPage({ recordId, onOpen, onChanged }) {
  const [record, setRecord] = useState(null);
  const [form, setForm] = useState({ reference: '', amount: '', date: '', note: '', confirm: false });
  const [busy, setBusy] = useState(false);
  const load = () => api.adminCommission(recordId).then(setRecord).catch(e => toast.error(e.message || 'Could not load this commission'));
  useEffect(() => { setRecord(null); load(); }, [recordId]);
  const reverse = async () => {
    const reason = window.prompt('Reason (refund, cancellation…)');
    if (!reason) return;
    try { await api.adminReverseCommission(record.id, { reason }); toast.success('Commission reversed'); onChanged?.(); load(); }
    catch (e) { toast.error(e.message); }
  };
  const saveNote = async (e) => {
    e.preventDefault();
    if (!form.confirm) { toast.error('Confirm that this is a bookkeeping note, not a payment'); return; }
    if (!window.confirm('Save a tracking note that an outside payout was recorded? This does not send money and does not change the commission amount.')) return;
    setBusy(true);
    try {
      const r = await api.adminPayoutNote(record.id, { confirm: true, reference: form.reference.trim(), amount: Number(form.amount), date: form.date, note: form.note });
      if (r.paymentExecuted || r.moneyMoved || !r.commissionAmountUnchanged || !r.frozenRateUnchanged) {
        toast.error('The note response was not a tracking-only result');
      } else toast.success('Outside payout noted. No payment was made in the app.');
      setForm({ reference: '', amount: '', date: '', note: '', confirm: false });
      load();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };
  if (!record) {
    return (
      <SaPage id="sa-commission-record">
        <SaPageHeader onBack={() => onOpen('commissions')} backLabel="Commission records" title="Commission" subtitle="Loading this record." />
        <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>Loading commission…</p>
      </SaPage>
    );
  }
  return (
    <SaPage id="sa-commission-record">
      <SaPageHeader
        onBack={() => onOpen('commissions')}
        backLabel="Commission records"
        title={inr(record.amount)}
        subtitle={`${saleKindLabel(record.kind)} · ${record.sellerName || 'Seller'} · ${record.libraryName || 'Library'}. ${STATUS_HELP}`}
      />
      <SaSummaryGrid>
        <SaSummaryCard label="Commission" value={inr(record.amount)} sub={`Sale ${inr(record.saleAmount)}`} tone="#ecfdf5" />
        <SaSummaryCard label="Record status" value={<SaStatusBadge status={record.status} />} sub={record.statusReason || 'Set when the sale was recorded'} />
        <SaSummaryCard label="Tracking" value={<SaStatusBadge status={record.payoutStatus} />} sub="Does not move money" tone="#fff7ed" />
      </SaSummaryGrid>
      <SaFactList>
        <SaFact label="Date">{record.saleDate || '—'}</SaFact>
        <SaFact label="Seller">{record.sellerName || record.sellerId}</SaFact>
        <SaFact label="Library">{record.libraryName || record.tenantId}</SaFact>
        <SaFact label="Sale type">{saleKindLabel(record.kind)}</SaFact>
        <SaFact label="Frozen rate">{`${rateText(record.basis)}${record.basis?.version ? ` (v${record.basis.version})` : ''}`}</SaFact>
        <SaFact label="Commission amount">{inr(record.amount)}</SaFact>
        <SaFact label="Sale amount">{inr(record.saleAmount)}</SaFact>
        <SaFact label="Invoice / ref">{record.saleRef}</SaFact>
        <SaFact label="Record status"><SaStatusBadge status={record.status} /></SaFact>
        <SaFact label="Tracking status"><SaStatusBadge status={record.payoutStatus} /></SaFact>
        <SaFact label="Requirement">{requirementCopy(record.requirementLabel)}</SaFact>
      </SaFactList>
      {record.status === 'earned' && (
        <div className="sa-action-row">
          <button type="button" className="btn btn-secondary" onClick={reverse}><Undo2 size={14} /> Reverse earned commission</button>
        </div>
      )}
      <form className="premium-card" style={{ padding: 16, display: 'grid', gap: 10, maxWidth: 640 }} onSubmit={saveNote}>
        <strong style={{ fontSize: 16 }}>Outside payout note</strong>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          This is a tracking / bookkeeping note that an outside payout was recorded. It is not a bank transfer and not a payment executed in the app. The frozen rate and the commission amount stay as they were at sale time.
        </p>
        {record.payoutNote ? (
          <p style={{ margin: 0, fontSize: 14 }}>Already noted: {record.payoutNote.reference} · {inr(record.payoutNote.amount)} · {record.payoutNote.date}. Tracking stays a note. No money moved here.</p>
        ) : record.status !== 'earned' ? (
          <p style={{ margin: 0, fontSize: 14 }}>A note can be saved only while the record is earned.</p>
        ) : (
          <>
            <label className="form-label" style={{ margin: 0 }}>Reference
              <input className="form-input" required value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} />
            </label>
            <label className="form-label" style={{ margin: 0 }}>Outside amount (₹)
              <input className="form-input" type="number" min="0.01" step="0.01" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />
            </label>
            <label className="form-label" style={{ margin: 0 }}>Date
              <input className="form-input" type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} />
            </label>
            <label className="form-label" style={{ margin: 0 }}>Note
              <input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
            </label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
              <input type="checkbox" checked={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.checked }))} />
              I confirm this only records that a payout happened outside My Library OS. It does not pay the partner.
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy || !form.confirm} style={{ justifySelf: 'start' }}>Save tracking note</button>
          </>
        )}
      </form>
    </SaPage>
  );
}
