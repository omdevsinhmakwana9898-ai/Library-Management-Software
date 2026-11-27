// Super Admin payments landing. Provider, billing, history, offers, referrals, and deletion each have their own page.
import React, { useState } from 'react';
import { PaymentProvidersHome, RazorpayProviderPage, PaypalProviderPage } from './payments/ProviderPages';
import { BillingPolicyPage } from './payments/BillingPolicyPage';
import { BillingHistoryPage, BillingRecordPage } from './payments/BillingHistoryPage';
import { OffersPage } from './payments/OffersPage';
import { ReferralsPage } from './payments/ReferralsPage';
import { DeletionRequestsPage } from './payments/DeletionRequestsPage';

const LINKS = [
  ['providers', 'Payment providers', 'Active provider, configured / test / live or sandbox, then Razorpay and PayPal.'],
  ['billing', 'Billing policy', 'Currency, tax treatment and rate, wallet spend maximum, bonus expiry, gateway-fee policy.'],
  ['history', 'Software billing history', 'Search paid, open, pending, failed, expired, and refunded software invoices.'],
  ['offers', 'Offers', 'Discounts, eligible plans, period, usage, and archive.'],
  ['referrals', 'Referral campaigns', 'Conditions and rates. Rewards follow the existing first-paid-subscription rule.'],
  ['deletion', 'Deletion requests', 'Pending, acknowledged, and dismissed history. Deletion still requires the library name.'],
];

export function PaymentsAdmin({ onOpenCollections, onOpenLibrary }) {
  const [page, setPage] = useState('landing');
  const [recordId, setRecordId] = useState(null);
  const open = (next, id) => {
    if (next === 'record') setRecordId(id || null);
    setPage(next);
  };
  if (page === 'providers') return <PaymentProvidersHome onOpen={open} />;
  if (page === 'razorpay') return <RazorpayProviderPage onOpen={open} />;
  if (page === 'paypal') return <PaypalProviderPage onOpen={open} />;
  if (page === 'billing') return <BillingPolicyPage onOpen={open} />;
  if (page === 'history') return <BillingHistoryPage onOpen={open} onOpenCollections={onOpenCollections} />;
  if (page === 'record') return <BillingRecordPage invoiceId={recordId} onOpen={open} onOpenCollections={onOpenCollections} onOpenLibrary={onOpenLibrary} />;
  if (page === 'offers') return <OffersPage onOpen={open} />;
  if (page === 'referrals') return <ReferralsPage onOpen={open} />;
  if (page === 'deletion') return <DeletionRequestsPage onOpen={open} onOpenLibrary={onOpenLibrary} />;
  return (
    <div id="sa-payments-landing" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>Payments</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 0' }}>
          Provider settings, billing policy, software billing history, offers, referral campaigns, and deletion requests each have their own page.
        </p>
      </div>
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
