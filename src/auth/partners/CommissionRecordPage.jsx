import React, { useEffect, useState } from 'react';
import { Undo2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { BackLink, STATUS_HELP, inr, rateText } from './shared';

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
  if (!record) return <div id="sa-commission-record">Loading commission…</div>;
  const rows = [
    ['Date', record.saleDate || '—'],
    ['Seller', record.sellerName || record.sellerId],
    ['Library', record.libraryName || record.tenantId],
    ['Sale type', record.kind === 'initial' ? 'New sale' : 'Renewal'],
    ['Frozen rate', `${rateText(record.basis)}${record.basis?.version ? ` (v${record.basis.version})` : ''}`],
    ['Commission amount', inr(record.amount)],
    ['Sale amount', inr(record.saleAmount)],
    ['Invoice / ref', record.saleRef],
    ['Record status', record.status],
    ['Tracking status', record.payoutStatus],
    ['Requirement label', record.requirementLabel],
  ];
  return (
    <div id="sa-commission-record" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div>
        <BackLink onClick={() => onOpen('commissions')}>Commission records</BackLink>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 0' }}>{inr(record.amount)}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>{STATUS_HELP}</p>
      </div>
      <div className="premium-card" style={{ padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 160px), 1fr))', gap: 10 }}>
        {rows.map(([label, value]) => (
          <div key={label}><div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase' }}>{label}</div><div style={{ fontSize: 14, overflowWrap: 'anywhere' }}>{value}{label === 'Record status' && record.statusReason ? ` — ${record.statusReason}` : ''}</div></div>
        ))}
      </div>
      {record.status === 'earned' && (
        <button type="button" className="btn btn-secondary btn-sm" style={{ justifySelf: 'start' }} onClick={reverse}><Undo2 size={14} /> Reverse earned commission</button>
      )}
      <form className="premium-card" style={{ padding: 14, display: 'grid', gap: 8 }} onSubmit={saveNote}>
        <strong>Outside payout note</strong>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          This is a tracking / bookkeeping note that an outside payout was recorded. It is not a bank transfer and not a payment executed in the app. The frozen rate and the commission amount stay as they were at sale time.
        </p>
        {record.payoutNote ? (
          <p style={{ margin: 0, fontSize: 13 }}>Already noted: {record.payoutNote.reference} · {inr(record.payoutNote.amount)} · {record.payoutNote.date}. Tracking status {record.payoutStatus}. No money moved here.</p>
        ) : record.status !== 'earned' ? (
          <p style={{ margin: 0, fontSize: 13 }}>A note can be saved only while the record is earned.</p>
        ) : (
          <>
            <label className="form-label" style={{ margin: 0 }}>Reference<input className="form-input" required value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} /></label>
            <label className="form-label" style={{ margin: 0 }}>Outside amount (₹)<input className="form-input" type="number" min="0.01" step="0.01" required value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></label>
            <label className="form-label" style={{ margin: 0 }}>Date<input className="form-input" type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></label>
            <label className="form-label" style={{ margin: 0 }}>Note<input className="form-input" value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} /></label>
            <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}><input type="checkbox" checked={form.confirm} onChange={e => setForm(f => ({ ...f, confirm: e.target.checked }))} />I confirm this only records that a payout happened outside My Library OS. It does not pay the partner.</label>
            <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !form.confirm} style={{ justifySelf: 'start' }}>Save tracking note</button>
          </>
        )}
      </form>
    </div>
  );
}
