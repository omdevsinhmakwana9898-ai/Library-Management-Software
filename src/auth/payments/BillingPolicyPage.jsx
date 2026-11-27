import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { SaPage, SaPageHeader } from '../saPage';

export function BillingPolicyPage({ onOpen }) {
  const [billing, setBilling] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.adminBillingConfig().then(setBilling).catch(e => toast.error(e.message || 'Could not load billing policy'));
  }, []);
  const save = async () => {
    if (!billing) return;
    setBusy(true);
    try {
      const next = await api.adminUpdateBillingConfig({
        currency: billing.currency,
        taxMode: billing.taxMode,
        taxRatePct: billing.taxRatePct,
        walletMaxSpendPercent: billing.walletMaxSpendPercent,
        bonusExpiryEnabled: billing.bonusExpiryEnabled,
        bonusExpiryMonths: billing.bonusExpiryMonths,
      });
      setBilling(next);
      toast.success('Billing policy saved');
    } catch (e) { toast.error(e.message || 'Could not save billing policy'); }
    finally { setBusy(false); }
  };
  if (!billing) return <SaPage id="sa-billing-policy"><p style={{ margin: 0 }}>Loading billing policy…</p></SaPage>;
  const absorbed = billing.gatewayFeesAbsorbed !== false;
  return (
    <SaPage id="sa-billing-policy">
      <SaPageHeader
        onBack={() => onOpen('landing')}
        backLabel="Payments"
        title="Billing policy"
        subtitle="Required before new plan activation. There is no default GST rate."
      />
      <div className="premium-card" style={{ padding: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Currency
            <select className="form-input" value={billing.currency || 'INR'} onChange={e => setBilling({ ...billing, currency: e.target.value })}>
              <option value="INR">INR</option><option value="USD">USD</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Tax treatment
            <select className="form-input" value={billing.taxMode || ''} onChange={e => setBilling({ ...billing, taxMode: e.target.value })}>
              <option value="">Choose…</option>
              <option value="included">Included in price</option>
              <option value="excluded">Added to price</option>
              <option value="none">No tax</option>
            </select>
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Tax rate %
            <input className="form-input" inputMode="decimal" value={billing.taxRatePct ?? ''} onChange={e => setBilling({ ...billing, taxRatePct: e.target.value === '' ? null : e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Wallet spend maximum %
            <input className="form-input" inputMode="numeric" value={billing.walletMaxSpendPercent ?? 100} onChange={e => setBilling({ ...billing, walletMaxSpendPercent: e.target.value })} />
          </label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Bonus expiry (months)
            <input className="form-input" inputMode="numeric" value={billing.bonusExpiryMonths ?? 12} onChange={e => setBilling({ ...billing, bonusExpiryMonths: e.target.value })} />
          </label>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginTop: 10 }}>
          <input type="checkbox" checked={billing.bonusExpiryEnabled !== false} onChange={e => setBilling({ ...billing, bonusExpiryEnabled: e.target.checked })} />
          Bonus expires
        </label>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '6px 0 0' }}>Cash never expires.</p>
        <div style={{ marginTop: 12, padding: 10, borderRadius: 8, background: '#f8fafc', fontSize: 13 }}>
          <strong>Provider gateway-fee policy</strong>
          <p style={{ margin: '4px 0 0' }}>
            Stored <code>gatewayFeesAbsorbed</code>: {absorbed ? 'true — the platform absorbs gateway fees' : 'false — stored as not absorbed'}.
            The billing updater forces this field to true whenever a save sends it, so this page does not send it and does not offer a switch that would pass gateway fees to customers.
          </p>
        </div>
        <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} disabled={busy} onClick={save}>Save billing policy</button>
        {!billing.configured && <span style={{ marginLeft: 10, fontSize: 12, color: '#b45309' }}>Not configured — new plan activation is blocked.</span>}
      </div>
    </SaPage>
  );
}
