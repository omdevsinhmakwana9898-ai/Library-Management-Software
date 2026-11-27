import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { SaFact, SaHelper, SaPage, SaPageHeader, SaRecordSection } from '../saPage';
import { inrMinor } from './shared';

const freshKey = () => globalThis.crypto?.randomUUID?.() || `idem-${Date.now()}-${Math.random().toString(36).slice(2)}`;

export function WalletAdjustPage({ libraryId, mode, onOpen }) {
  const adding = mode !== 'deduct';
  const [libraryName, setLibraryName] = useState('');
  const [form, setForm] = useState({ amount: '', bucket: 'cash', reason: '' });
  const [preview, setPreview] = useState(null);
  const [idem, setIdem] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.adminWallet(libraryId).then(data => { if (live) setLibraryName(data.library?.name || ''); }).catch(() => { if (live) setLibraryName(''); });
    return () => { live = false; };
  }, [libraryId]);

  const edited = () => { setPreview(null); setConfirmed(false); setIdem(''); };
  const requestPreview = async (e) => {
    e.preventDefault();
    setBusy(true);
    setConfirmed(false);
    try {
      const body = {
        direction: adding ? 'credit' : 'debit',
        amount: form.amount.trim(),
        reason: form.reason.trim(),
        ...(adding ? { bucket: form.bucket } : {}),
      };
      const result = await api.adminWalletPreview(libraryId, body);
      setPreview(result);
      setIdem(freshKey());
    } catch (err) {
      setPreview(null);
      toast.error(err.message || 'Could not preview this change');
    } finally { setBusy(false); }
  };
  const apply = async () => {
    if (!preview?.canApply || !confirmed || !idem) return;
    setBusy(true);
    try {
      const body = {
        confirm: true,
        direction: adding ? 'credit' : 'debit',
        amount: form.amount.trim(),
        reason: form.reason.trim(),
        ...(adding ? { bucket: form.bucket } : {}),
      };
      await api.adminWalletAdjust(libraryId, body, idem);
      toast.success(adding ? 'Credit added' : 'Credit deducted');
      onOpen('detail', libraryId);
    } catch (err) { toast.error(err.message || 'The wallet was not changed'); }
    finally { setBusy(false); }
  };

  return (
    <SaPage id="sa-wallet-adjust">
      <SaPageHeader
        onBack={() => onOpen('detail', libraryId)}
        backLabel={libraryName || 'Library wallet'}
        title={adding ? 'Add credit' : 'Deduct credit'}
        subtitle={libraryName || 'Library wallet'}
      />
      <form className="premium-card" style={{ padding: 16, display: 'grid', gap: 12, maxWidth: 560 }} onSubmit={requestPreview}>
        <label className="form-label" style={{ margin: 0 }} htmlFor="sa-wallet-adjust-amount">Amount (₹)
          <input id="sa-wallet-adjust-amount" className="form-input" inputMode="decimal" required value={form.amount} onChange={e => { setForm(f => ({ ...f, amount: e.target.value })); edited(); }} />
        </label>
        {adding && (
          <label className="form-label" style={{ margin: 0 }} htmlFor="sa-wallet-adjust-bucket">Credit type
            <select id="sa-wallet-adjust-bucket" className="form-select" value={form.bucket} onChange={e => { setForm(f => ({ ...f, bucket: e.target.value })); edited(); }}>
              <option value="cash">Paid credit (does not expire)</option>
              <option value="bonus">Promotional credit (can expire)</option>
            </select>
          </label>
        )}
        <label className="form-label" style={{ margin: 0 }} htmlFor="sa-wallet-adjust-reason">Reason
          <textarea id="sa-wallet-adjust-reason" className="form-input" required minLength={3} maxLength={300} rows={3} value={form.reason} onChange={e => { setForm(f => ({ ...f, reason: e.target.value })); edited(); }} />
        </label>
        <div className="sa-action-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" type="button" onClick={() => onOpen('detail', libraryId)}>Cancel</button>
          <button id="sa-wallet-adjust-preview" className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Working…' : 'Preview'}</button>
        </div>
      </form>
      {preview && (
        <SaRecordSection title="Preview">
          <SaFact label="Amount">{inrMinor(preview.amountMinor)}</SaFact>
          <SaFact label="Available now">{inrMinor(preview.before?.availableMinor)}</SaFact>
          <SaFact label="Available after">{inrMinor(preview.after?.availableMinor)}</SaFact>
          <SaFact label="Paid credit after">{inrMinor(preview.after?.cashMinor)}</SaFact>
          <SaFact label="Promotional credit after">{inrMinor(preview.after?.bonusMinor)}</SaFact>
          {preview.spendOrder ? <SaFact label="Spending order">{preview.spendOrder}</SaFact> : null}
          {!preview.canApply && <SaFact label="Result">Not enough available credit. Nothing was changed.</SaFact>}
        </SaRecordSection>
      )}
      {preview?.canApply && (
        <div className="premium-card" style={{ padding: 16, display: 'grid', gap: 12, maxWidth: 560 }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'flex-start', fontSize: 13 }}>
            <input id="sa-wallet-adjust-confirm" type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} />
            I confirm this {adding ? 'adds' : 'deducts'} {inrMinor(preview.amountMinor)} {adding ? 'to' : 'from'} {libraryName || 'this library'}.
          </label>
          <div className="sa-action-row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-primary" disabled={busy || !confirmed} onClick={apply}>{busy ? 'Working…' : 'Confirm'}</button>
          </div>
        </div>
      )}
      <SaHelper>
        {adding
          ? 'Nothing changes until you confirm. Paid credit does not expire. Promotional credit can expire. This does not take an online payment.'
          : 'Nothing changes until you confirm. Promotional credit is used first, then paid credit. The balance cannot go below zero.'}
      </SaHelper>
    </SaPage>
  );
}
