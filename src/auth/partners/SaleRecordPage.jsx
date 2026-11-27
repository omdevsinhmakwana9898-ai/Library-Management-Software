import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { SaHelper, SaPage, SaPageHeader } from '../saPage';
import { inr } from './shared';

const empty = { libraryId: '', kind: 'initial', saleRef: '', saleAmount: '' };

/** Full page for recording a software sale. The rate freezes when the sale is saved. */
export function SaleRecordPage({ libraries, onBack, onRecorded }) {
  const [sale, setSale] = useState(empty);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setSale(s => ({ ...s, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.adminRecordSale({ ...sale, saleAmount: Number(sale.saleAmount) });
      r.created ? toast.success(`Commission ${inr(r.record.amount)} recorded`) : toast(`No commission: ${String(r.reason).replace(/_/g, ' ')}`);
      setSale(s => ({ ...s, saleRef: '', saleAmount: '' }));
      onRecorded?.();
      if (r.created) onBack();
    } catch (err) { toast.error(err.message); }
    finally { setBusy(false); }
  };
  return (
    <SaPage id="sa-record-sale">
      <SaPageHeader
        onBack={onBack}
        backLabel="Commission records"
        title="Record a software sale"
      />
      <SaHelper>Until billing is connected, record the sale here. The commission rate is frozen at this moment. Saving a later rule does not rewrite this record.</SaHelper>
      <form className="premium-card" style={{ padding: 16, display: 'grid', gap: 12, maxWidth: 560 }} onSubmit={submit}>
        <label className="form-label" style={{ margin: 0 }}>Library
          <select className="form-select" required value={sale.libraryId} onChange={set('libraryId')}>
            <option value="">Pick a library</option>
            {libraries.map(l => <option key={l.libraryId} value={l.libraryId}>{l.name}</option>)}
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Type
          <select className="form-select" value={sale.kind} onChange={set('kind')}>
            <option value="initial">New sale</option>
            <option value="renewal">Renewal</option>
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Invoice / ref
          <input className="form-input" required value={sale.saleRef} onChange={set('saleRef')} />
        </label>
        <label className="form-label" style={{ margin: 0 }}>Amount (₹)
          <input className="form-input" type="number" min={1} required value={sale.saleAmount} onChange={set('saleAmount')} />
        </label>
        <div className="sa-action-row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn btn-secondary" type="button" onClick={onBack}>Cancel</button>
          <button className="btn btn-primary" type="submit" disabled={busy}>{busy ? 'Recording…' : 'Record sale'}</button>
        </div>
      </form>
    </SaPage>
  );
}
