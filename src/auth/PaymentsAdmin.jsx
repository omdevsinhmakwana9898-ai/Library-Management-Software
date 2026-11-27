// Super Admin payments landing. Provider, billing, history, offers, referrals, and deletion each have their own page.
import React, { useState } from 'react';
import { PaymentProvidersHome, RazorpayProviderPage, PaypalProviderPage } from './payments/ProviderPages';
import { BillingPolicyPage } from './payments/BillingPolicyPage';
import { BillingHistoryPage, BillingHistoryList, BillingRecordPage } from './payments/BillingHistoryPage';
import { SaPage, SaPageHeader } from './saPage';
import { OffersPage } from './payments/OffersPage';
import { ReferralsPage } from './payments/ReferralsPage';
import { DeletionRequestsPage } from './payments/DeletionRequestsPage';

const LINKS = [
  ['providers', 'Payment providers', 'Razorpay, PayPal, and which one is active.'],
  ['billing', 'Billing policy', 'Currency, tax, and wallet rules.'],
  ['history', 'Billing history', 'Wallet top-ups, paid receipts, and other invoices.'],
  ['offers', 'Offers', 'Discount codes and who can use them.'],
  ['referrals', 'Referral campaigns', 'Reward rules for a first paid subscription.'],
  ['deletion', 'Deletion requests', 'Review a request. Deleting still asks for the library name.'],
];
const HISTORY_LISTS = new Set(['wallet_topups', 'paid_receipts', 'other_invoices']);

export function PaymentsAdmin({ onOpenCollections, onOpenLibrary }) {
  const [page, setPage] = useState('landing');
  const [recordId, setRecordId] = useState(null);
  const [historyBucket, setHistoryBucket] = useState('wallet_topups');
  const open = (next, id) => {
    if (next === 'record') setRecordId(id || null);
    if (HISTORY_LISTS.has(next)) setHistoryBucket(next);
    setPage(next);
  };
  if (page === 'providers') return <PaymentProvidersHome onOpen={open} />;
  if (page === 'razorpay') return <RazorpayProviderPage onOpen={open} />;
  if (page === 'paypal') return <PaypalProviderPage onOpen={open} />;
  if (page === 'billing') return <BillingPolicyPage onOpen={open} />;
  if (page === 'history') return <BillingHistoryPage onOpen={open} />;
  if (HISTORY_LISTS.has(page)) return <BillingHistoryList bucket={page} onOpen={open} onOpenCollections={onOpenCollections} />;
  if (page === 'record') return <BillingRecordPage invoiceId={recordId} bucket={historyBucket} onOpen={open} onOpenCollections={onOpenCollections} onOpenLibrary={onOpenLibrary} />;
  if (page === 'offers') return <OffersPage onOpen={open} />;
  if (page === 'referrals') return <ReferralsPage onOpen={open} />;
  if (page === 'deletion') return <DeletionRequestsPage onOpen={open} onOpenLibrary={onOpenLibrary} />;
  return (
    <SaPage id="sa-payments-landing">
      <SaPageHeader title="Payments" subtitle="Providers, billing, offers, referrals, and deletion requests." />
      <div className="sa-nav-grid">
        {LINKS.map(([id, title, text]) => (
          <button key={id} type="button" className="premium-card sa-nav-card" onClick={() => open(id)}>
            <strong>{title}</strong>
            <span>{text}</span>
          </button>
        ))}
      </div>
    </SaPage>
  );
}
