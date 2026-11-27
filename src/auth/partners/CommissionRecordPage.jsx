import React, { useEffect, useState } from 'react';
import { Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import {
  SaFact, SaHelper, SaMoreInfo, SaPage, SaPageHeader, SaRecordActions, SaRecordHero,
  SaRecordSection, SaRecordTimeline, SaStatusBadge, statusLabel,
} from '../saPage';
import { formatRecordDate, inr, plainRate, requirementCopy, saleKindLabel } from './shared';

function trackingLabel(status) {
  if (status === 'paid') return 'Marked paid';
  if (status === 'void') return 'Void';
  if (status === 'unpaid') return 'Unpaid';
  return statusLabel(status);
}

function commissionDates(record) {
  const steps = [];
  const created = formatRecordDate(record.createdAt);
  if (created) steps.push({ label: 'Created', at: created });
  const earned = formatRecordDate(record.saleDate);
  if (earned) steps.push({ label: 'Earned', at: earned });
  if (record.payoutStatus === 'paid') {
    const marked = formatRecordDate(record.payoutNote?.date || record.payoutNote?.recordedAt);
    if (marked) steps.push({ label: 'Marked paid', at: marked });
  }
  return steps;
}

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
  const who = record.libraryName || record.sellerName || 'Commission';
  const canNote = record.status === 'earned' && !record.payoutNote;
  return (
    <SaPage id="sa-commission-record">
      <SaPageHeader
        onBack={() => onOpen('commissions')}
        backLabel="Commission records"
        title={who}
      />
      <SaRecordHero
        name={who}
        amount={inr(record.amount)}
        badge={(
          <>
            <SaStatusBadge status={record.status} />
            <SaStatusBadge status={record.payoutStatus}>{trackingLabel(record.payoutStatus)}</SaStatusBadge>
          </>
        )}
      />
      <SaRecordTimeline steps={commissionDates(record)} />
      <SaRecordSection title="Payment">
        <SaFact label="Commission">{inr(record.amount)}</SaFact>
        <SaFact label="Sale amount">{inr(record.saleAmount)}</SaFact>
        <SaFact label="Sale type">{saleKindLabel(record.kind)}</SaFact>
        <SaFact label="Rate">{plainRate(record.basis)}</SaFact>
        <SaFact label="Record">{statusLabel(record.status)}</SaFact>
        <SaFact label="Tracking">{trackingLabel(record.payoutStatus)}</SaFact>
        <SaFact label="What this means">{requirementCopy(record.requirementLabel)}</SaFact>
        {record.statusReason ? <SaFact label="Reason">{record.statusReason}</SaFact> : null}
        <SaFact label="Invoice">{record.saleRef || '—'}</SaFact>
        {record.payoutNote ? <SaFact label="Outside reference">{record.payoutNote.reference}</SaFact> : null}
        {record.payoutNote ? <SaFact label="Noted amount">{inr(record.payoutNote.amount)}</SaFact> : null}
      </SaRecordSection>
      <SaRecordSection title="People">
        <SaFact label="Person">{record.sellerName || '—'}</SaFact>
        <SaFact label="Email">{record.sellerEmail || '—'}</SaFact>
        <SaFact label="Library">{record.libraryName || '—'}</SaFact>
      </SaRecordSection>
      <SaMoreInfo>
        <SaFact label="Commission id">{record.id || '—'}</SaFact>
        <SaFact label="Seller id">{record.sellerId || '—'}</SaFact>
        <SaFact label="Library id">{record.tenantId || '—'}</SaFact>
        {record.basis?.ruleId ? <SaFact label="Rule id">{String(record.basis.ruleId)}</SaFact> : null}
      </SaMoreInfo>
      <SaHelper>Marked paid is a tracking note, not a bank transfer and not a payment executed in the app.</SaHelper>
      <SaRecordActions>
        {record.status === 'earned' && (
          <button type="button" className="btn btn-secondary" onClick={reverse}><Undo2 size={14} /> Reverse earned commission</button>
        )}
      </SaRecordActions>
      {canNote && (
        <form className="premium-card" style={{ padding: 16, display: 'grid', gap: 12, maxWidth: 560 }} onSubmit={saveNote}>
          <strong style={{ fontSize: 16 }}>Outside payout note</strong>
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
            I confirm this only records that a payout happened outside My Library OS.
          </label>
          <div className="sa-action-row" style={{ justifyContent: 'flex-end' }}>
            <button className="btn btn-primary" type="submit" disabled={busy || !form.confirm}>{busy ? 'Saving…' : 'Save tracking note'}</button>
          </div>
        </form>
      )}
    </SaPage>
  );
}
