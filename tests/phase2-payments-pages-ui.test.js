import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dash = readFileSync(new URL('../src/auth/SuperAdminDashboard.jsx', import.meta.url), 'utf8');
const landing = readFileSync(new URL('../src/auth/PaymentsAdmin.jsx', import.meta.url), 'utf8');
const providers = readFileSync(new URL('../src/auth/payments/ProviderPages.jsx', import.meta.url), 'utf8');
const policy = readFileSync(new URL('../src/auth/payments/BillingPolicyPage.jsx', import.meta.url), 'utf8');
const history = readFileSync(new URL('../src/auth/payments/BillingHistoryPage.jsx', import.meta.url), 'utf8');
const offers = readFileSync(new URL('../src/auth/payments/OffersPage.jsx', import.meta.url), 'utf8');
const referrals = readFileSync(new URL('../src/auth/payments/ReferralsPage.jsx', import.meta.url), 'utf8');
const deletion = readFileSync(new URL('../src/auth/payments/DeletionRequestsPage.jsx', import.meta.url), 'utf8');

test('payments landing links to dedicated super admin pages', () => {
  assert.match(dash, /id="sa-tab-payments"/);
  assert.match(dash, /PaymentsAdmin/);
  assert.match(landing, /id="sa-payments-landing"/);
  assert.match(providers, /id="sa-payment-providers"/);
  assert.match(providers, /id="sa-provider-razorpay"/);
  assert.match(providers, /id="sa-provider-paypal"/);
  assert.match(policy, /id="sa-billing-policy"/);
  assert.match(history, /id="sa-billing-history"/);
  assert.match(history, /id="sa-billing-record"/);
  assert.match(offers, /id="sa-offers"/);
  assert.match(referrals, /id="sa-referrals"/);
  assert.match(deletion, /id="sa-deletion-requests"/);
  for (const [file, button, menu] of [
    [history, 'sa-billing-history-filters-button', 'sa-billing-history-filters-menu'],
    [offers, 'sa-offers-filters-button', 'sa-offers-filters-menu'],
    [referrals, 'sa-referrals-filters-button', 'sa-referrals-filters-menu'],
    [deletion, 'sa-deletion-requests-filters-button', 'sa-deletion-requests-filters-menu'],
  ]) {
    assert.match(file, new RegExp(button));
    assert.match(file, new RegExp(menu));
    assert.match(file, /FiltersMenu/);
  }
  assert.match(history, /DatePeriodSelect/);
  assert.match(history, /sa-billing-history-filters-period/);
  assert.match(history, /preset: 'all_time'/);
  assert.doesNotMatch(history, /\['today', 'Today'\]/);
  assert.doesNotMatch(history, /\['last_2_days', '2 days'\]/);
  assert.doesNotMatch(history, /aria-pressed/);
  assert.match(history, /sa-billing-history-status/);
  assert.match(history, /Refunded/);
  assert.match(offers, /sa-offers-status/);
  assert.doesNotMatch(offers, /aria-pressed/);
  assert.match(referrals, /sa-referrals-active/);
  assert.doesNotMatch(referrals, /aria-pressed/);
  assert.match(deletion, /sa-deletion-requests-state/);
  assert.doesNotMatch(deletion, /aria-pressed/);
});

test('provider secrets stay masked and live mode asks before it is saved', () => {
  assert.match(providers, /Leave blank to keep current secret/);
  assert.match(providers, /••••••••/);
  assert.match(providers, /confirmActiveProvider/);
  assert.match(providers, /confirmLiveMode/);
  assert.match(providers, /Credential verification does not confirm webhook delivery or settlement/);
  assert.match(providers, /Test saved active provider/);
  assert.doesNotMatch(providers, /keySecretEnc/);
  assert.doesNotMatch(providers, /clientSecretEnc/);
  assert.match(policy, /gatewayFeesAbsorbed/);
  assert.match(policy, /does not offer a switch that would pass gateway fees to customers/);
});

test('billing history resend is paid-only and deletion does not add a one-click delete', () => {
  assert.match(history, /record\.status === 'paid'/);
  assert.match(history, /Resend is available only for paid receipts/);
  assert.match(history, /Open Collection Details|onOpenCollections/);
  assert.match(history, /wallet ledger/i);
  assert.match(offers, /does not rewrite discounts already applied/);
  assert.match(referrals, /first genuine paid subscription/);
  assert.match(referrals, /does not pay out rewards/);
  assert.match(deletion, /still requires typing the library name/);
  assert.doesNotMatch(deletion, /adminDeleteLibrary/);
  assert.doesNotMatch(landing, /adminDeleteLibrary/);
});
