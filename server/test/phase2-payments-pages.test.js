// Phase 2 §8–§10: billing history search, provider confirmation, offers, referrals, deletion safeguards.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, call, ctx } from './helpers.js';
import { Library } from '../src/models.js';
import { SoftwareInvoice } from '../src/payments/invoices.js';
import { OfferRedemption, Referral } from '../src/commerce.js';
import { getPaymentConfigPublic } from '../src/paymentConfig.js';

before(async () => { await setup('phase2paypages'); });
after(async () => { await teardown(); });

const secret = 'phase2-test-secret-value';

test('payment pages are super admin only and do not return raw secrets', async () => {
  const paths = [
    ['GET', '/api/admin/software-plan/billing-history'],
    ['GET', '/api/admin/payments/config'],
    ['GET', '/api/admin/billing/config'],
    ['GET', '/api/admin/offers'],
    ['GET', '/api/admin/referral-campaigns'],
    ['GET', '/api/admin/referrals'],
    ['GET', '/api/admin/payments/deletion-requests'],
  ];
  for (const [method, path] of paths) {
    assert.equal((await call(method, path)).status, 401, path);
    assert.equal((await call(method, path, { token: ctx.tokens.a })).status, 403, path);
  }
  const denied = await call('PUT', '/api/admin/payments/config', {
    token: ctx.tokens.a,
    body: { activeProvider: 'razorpay', confirmActiveProvider: true },
  });
  assert.equal(denied.status, 403);

  const missing = await call('PUT', '/api/admin/payments/config', {
    token: ctx.tokens.sa,
    body: { activeProvider: 'razorpay', razorpay: { enabled: true, keyId: 'rzp_test_example', keySecret: secret, mode: 'test' } },
  });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.code, 'confirm_active_provider');
  assert.equal((await getPaymentConfigPublic()).activeProvider, 'none');
  assert.equal(JSON.stringify(missing.body).includes(secret), false);

  const saved = await call('PUT', '/api/admin/payments/config', {
    token: ctx.tokens.sa,
    body: {
      activeProvider: 'razorpay',
      confirmActiveProvider: true,
      razorpay: { enabled: true, keyId: 'rzp_test_example', keySecret: secret, webhookSecret: secret, mode: 'test' },
    },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.razorpay.mode, 'test');
  assert.equal(saved.body.razorpay.keySecretSet, true);
  assert.equal(saved.body.razorpay.keySecretMask, '••••••••');
  assert.equal(saved.body.razorpay.keySecret, undefined);
  assert.equal(saved.body.razorpay.keySecretEnc, undefined);
  assert.equal(JSON.stringify(saved.body).includes(secret), false);

  const live = await call('PUT', '/api/admin/payments/config', {
    token: ctx.tokens.sa,
    body: { razorpay: { mode: 'live' } },
  });
  assert.equal(live.status, 400);
  assert.equal(live.body.code, 'confirm_live_mode');
  assert.equal((await getPaymentConfigPublic()).razorpay.mode, 'test');
});

test('billing history searches, filters, paginates, and does not treat open invoices as collected', async () => {
  const old = new Date(Date.now() - 40 * 864e5);
  await SoftwareInvoice.create([
    {
      invoiceId: 'inv_page_paid', tenantId: 'lib-a', kind: 'subscription', amount: 10, totalMinor: 1000, taxMinor: 180,
      walletMinor: 200, gatewayMinor: 800, currency: 'INR', status: 'paid', provider: 'razorpay',
      providerRef: 'order_ref_page', providerPaymentRef: 'pay_ref_page', receiptNo: 'RCPT-PAGE-1',
      paidAt: new Date(), receiptDelivery: { status: 'sent' },
    },
    {
      invoiceId: 'inv_page_open_topup', tenantId: 'lib-a', kind: 'topup', amount: 5, totalMinor: 500, gatewayMinor: 500,
      currency: 'INR', status: 'open', provider: 'razorpay', providerRef: 'order_topup_open',
    },
    {
      invoiceId: 'inv_page_old', tenantId: 'lib-b', kind: 'subscription', amount: 3, totalMinor: 300, gatewayMinor: 300,
      currency: 'INR', status: 'paid', provider: 'paypal', receiptNo: 'RCPT-OLD', createdAt: old, paidAt: old,
    },
  ]);
  await Library.updateOne({ libraryId: 'lib-a' }, { $set: { phone: '9990001112' } });

  const all = await call('GET', '/api/admin/software-plan/billing-history?limit=2&page=1', { token: ctx.tokens.sa });
  assert.equal(all.status, 200, JSON.stringify(all.body));
  assert.equal(all.body.items.length, 2);
  assert.ok(all.body.total >= 3);
  assert.equal(all.body.pages >= 2, true);
  const page2 = await call('GET', '/api/admin/software-plan/billing-history?limit=2&page=2', { token: ctx.tokens.sa });
  assert.equal(page2.status, 200);
  assert.ok(page2.body.items.length >= 1);

  const byReceipt = await call('GET', '/api/admin/software-plan/billing-history?q=RCPT-PAGE-1', { token: ctx.tokens.sa });
  assert.ok(byReceipt.body.items.some(row => row.invoiceId === 'inv_page_paid'));
  const byPay = await call('GET', '/api/admin/software-plan/billing-history?q=pay_ref_page', { token: ctx.tokens.sa });
  assert.equal(byPay.body.items.length, 1);
  const byEmail = await call('GET', '/api/admin/software-plan/billing-history?q=admin-a@test.local', { token: ctx.tokens.sa });
  assert.ok(byEmail.body.items.some(row => row.tenantId === 'lib-a'));
  const byPhone = await call('GET', '/api/admin/software-plan/billing-history?q=9990001112', { token: ctx.tokens.sa });
  assert.ok(byPhone.body.items.every(row => row.tenantId === 'lib-a'));

  const paid = await call('GET', '/api/admin/software-plan/billing-history?status=paid&q=inv_page_', { token: ctx.tokens.sa });
  assert.ok(paid.body.items.every(row => row.status === 'paid' && row.collected === true && row.resendEligible === true));
  assert.equal(paid.body.items.some(row => row.invoiceId === 'inv_page_open_topup'), false);
  const open = await call('GET', '/api/admin/software-plan/billing-history?status=open&kind=topup', { token: ctx.tokens.sa });
  assert.ok(open.body.items.some(row => row.invoiceId === 'inv_page_open_topup' && row.group === 'open_wallet_topup' && row.collected === false && row.resendEligible === false));
  const refunded = await call('GET', '/api/admin/software-plan/billing-history?status=refunded', { token: ctx.tokens.sa });
  assert.equal(refunded.body.total, 0);
  assert.match(refunded.body.statusMap.refunded.note, /No software refund/);
  const today = await call('GET', '/api/admin/software-plan/billing-history?preset=today&q=inv_page_', { token: ctx.tokens.sa });
  assert.equal(today.body.items.some(row => row.invoiceId === 'inv_page_old'), false);
  assert.ok(today.body.items.some(row => row.invoiceId === 'inv_page_paid'));

  const detail = await call('GET', '/api/admin/software-plan/billing-history/inv_page_paid', { token: ctx.tokens.sa });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.taxMinor, 180);
  assert.equal(detail.body.walletMinor, 200);
  assert.equal(detail.body.gatewayMinor, 800);
  assert.equal(detail.body.resendEligible, true);
  const openDetail = await call('GET', '/api/admin/software-plan/billing-history/inv_page_open_topup', { token: ctx.tokens.sa });
  assert.equal(openDetail.body.collected, false);
  assert.equal(openDetail.body.resendEligible, false);
  assert.equal((await call('POST', '/api/admin/software-plan/invoices/inv_page_open_topup/receipt/deliver', { token: ctx.tokens.sa, body: { confirm: true } })).status, 404);
  const resent = await call('POST', '/api/admin/software-plan/invoices/inv_page_paid/receipt/deliver', { token: ctx.tokens.sa, body: { confirm: true } });
  assert.equal(resent.status, 200, JSON.stringify(resent.body));
  assert.equal((await call('POST', '/api/admin/software-plan/invoices/inv_page_paid/receipt/deliver', { token: ctx.tokens.a, body: { confirm: true } })).status, 403);
});

test('offer edits do not rewrite historical redemptions', async () => {
  const created = await call('POST', '/api/admin/offers', {
    token: ctx.tokens.sa,
    body: { name: 'Spring', code: 'SPRING10', discountType: 'percentage', discountValue: 10, planIds: ['basic'] },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  await OfferRedemption.create({
    redemptionId: 'ore_hist_page', offerId: created.body.offerId, tenantId: 'lib-a', invoiceId: 'inv_hist_page',
    discountMinor: 2500, status: 'applied', slot: 0,
  });
  const edited = await call('PUT', `/api/admin/offers/${created.body.offerId}`, {
    token: ctx.tokens.sa,
    body: { name: 'Spring changed', discountValue: 40, usedCount: 99, discountMinor: 1 },
  });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  assert.equal(edited.body.discountValue, 40);
  assert.equal(edited.body.usedCount || 0, 0);
  const still = await OfferRedemption.findOne({ redemptionId: 'ore_hist_page' }).lean();
  assert.equal(still.discountMinor, 2500);
  assert.equal(still.status, 'applied');
  const found = await call('GET', '/api/admin/offers?q=SPRING&status=available', { token: ctx.tokens.sa });
  assert.ok(found.body.some(o => o.code === 'SPRING10'));
  assert.equal((await call('GET', '/api/admin/offers', { token: ctx.tokens.a })).status, 403);
});

test('referral campaign edits keep the paid-subscription rule and stored rewards', async () => {
  const created = await call('POST', '/api/admin/referral-campaigns', {
    token: ctx.tokens.sa,
    body: { name: 'Friends', rewardMinor: 5000, rewardBucket: 'bonus' },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.qualifyingEvent, 'first_paid_subscription');
  assert.equal(created.body.allowTrials, false);
  assert.equal(created.body.allow100PercentPromo, false);
  await Referral.create({
    referralId: 'ref_hist_page', code: 'LIB-A', referrerTenantId: 'lib-a', referredTenantId: 'lib-b',
    campaignId: created.body.campaignId, status: 'credited', rewardMinor: 5000,
  });
  const blocked = await call('PUT', `/api/admin/referral-campaigns/${created.body.campaignId}`, {
    token: ctx.tokens.sa,
    body: { qualifyingEvent: 'signup', rewardMinor: 9000 },
  });
  assert.equal(blocked.status, 400);
  const edited = await call('PUT', `/api/admin/referral-campaigns/${created.body.campaignId}`, {
    token: ctx.tokens.sa,
    body: { rewardMinor: 9000, name: 'Friends revised' },
  });
  assert.equal(edited.status, 200);
  const row = await Referral.findOne({ referralId: 'ref_hist_page' }).lean();
  assert.equal(row.rewardMinor, 5000);
  assert.equal(row.status, 'credited');
  const list = await call('GET', '/api/admin/referrals?q=LIB-A&status=credited', { token: ctx.tokens.sa });
  assert.equal(list.status, 200);
  assert.ok(list.body.items.some(r => r.referralId === 'ref_hist_page'));
  assert.match(list.body.policy, /first genuine paid subscription/);
});

test('deletion requests can be acknowledged or dismissed and still need the typed library name to delete', async () => {
  const lib = await Library.findOne({ libraryId: 'lib-a' }).lean();
  const asked = await call('POST', '/api/subscription/deletion-request', {
    token: ctx.tokens.a,
    body: { confirmName: lib.name, reason: 'Moving' },
  });
  assert.equal(asked.status, 200, JSON.stringify(asked.body));
  const pending = await call('GET', '/api/admin/payments/deletion-requests?state=pending&q=Library', { token: ctx.tokens.sa });
  assert.ok(pending.body.some(row => row.libraryId === 'lib-a' && row.canResolve === true));
  assert.equal((await call('POST', '/api/admin/payments/deletion-requests/lib-a/resolve', { token: ctx.tokens.sa, body: { action: 'acknowledge' } })).status, 200);
  assert.equal((await call('POST', '/api/admin/payments/deletion-requests/lib-a/resolve', { token: ctx.tokens.sa, body: { action: 'dismiss' } })).status, 200);
  const dismissed = await call('GET', '/api/admin/payments/deletion-requests?state=dismissed&q=lib-a', { token: ctx.tokens.sa });
  assert.ok(dismissed.body.some(row => row.libraryId === 'lib-a' && row.canResolve === false));
  const removed = await call('DELETE', '/api/admin/libraries/lib-a', { token: ctx.tokens.sa, body: { confirmName: 'not-the-name' } });
  assert.equal(removed.status, 400);
  assert.ok(await Library.exists({ libraryId: 'lib-a' }));
  const bogus = await call('POST', '/api/admin/payments/deletion-requests/lib-a/delete', { token: ctx.tokens.sa, body: {} });
  assert.notEqual(bogus.status, 200);
  assert.notEqual(bogus.body?.ok, true);
  assert.ok(await Library.exists({ libraryId: 'lib-a' }));
});
