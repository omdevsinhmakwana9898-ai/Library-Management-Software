// Phase 2 §1–§2: software collection is gateway cash on verified paid subscription/upgrade invoices.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, call, ctx } from './helpers.js';
import { SoftwareInvoice } from '../src/payments/invoices.js';
import { WalletTopup } from '../src/commerce.js';
import { models } from '../src/models.js';
import { startOfZonedDay, zonedMonth, addCalendarMonths, monthEndYmd } from '../src/businessCollections.js';

const SA = () => ctx.tokens.sa;

before(async () => {
  await setup('lms_business_collections');
  const month = zonedMonth(new Date());
  const monthStart = startOfZonedDay(`${month}-01`);
  const prev = addCalendarMonths(month, -1);
  const next = addCalendarMonths(month, 1);
  const inMonth = new Date(monthStart.getTime() + 3 * 864e5);
  const prevMonth = new Date(startOfZonedDay(`${prev}-15`).getTime() + 6 * 3600e3);
  const justBefore = new Date(monthStart.getTime() - 1000);
  const daysAgo3 = new Date(Date.now() - 3 * 864e5);
  const daysAgo40 = new Date(Date.now() - 40 * 864e5);

  await call('POST', '/api/admin/plans', { token: SA(), body: { name: 'Growth', planId: 'growth', priceMonthly: 999 } });
  await call('POST', '/api/admin/libraries', { token: SA(), body: { name: 'No City Library', libraryId: 'lib-c', adminEmail: 'admin-c@test.local', adminPassword: 'Password-c-123' } });
  assert.equal((await call('PATCH', '/api/admin/libraries/lib-a', { token: SA(), body: { planId: 'growth', city: 'Surat', status: 'Active' } })).status, 200);
  assert.equal((await call('PATCH', '/api/admin/libraries/lib-b', { token: SA(), body: { city: 'Rajkot', status: 'Disabled' } })).status, 200);
  await models.payments.create({ tenantId: 'lib-a', _key: 'STU-1', receiptNo: 'STU-1', studentId: 'S1', amount: 5000, netTotal: 5000, date: `${month}-10`, method: 'Cash' });

  const base = { tenantId: 'lib-a', currency: 'INR', provider: 'razorpay' };
  await SoftwareInvoice.create([
    { ...base, invoiceId: 'inv_sub_cash', kind: 'subscription', status: 'paid', amount: 100, totalMinor: 10000, walletMinor: 0, gatewayMinor: 10000, providerRef: 'pay_sub_cash', providerPaymentRef: 'pay_sub_cash', receiptNo: 'RCPT-SUB-1', paidAt: inMonth, receiptDelivery: { status: 'sent' } },
    { ...base, invoiceId: 'inv_split', kind: 'subscription', status: 'paid', amount: 100, totalMinor: 10000, walletMinor: 4000, gatewayMinor: 6000, providerRef: 'pay_split', receiptNo: 'RCPT-SPLIT', paidAt: inMonth },
    { ...base, invoiceId: 'inv_wallet_only', kind: 'upgrade', status: 'paid', amount: 50, totalMinor: 5000, walletMinor: 5000, gatewayMinor: 0, provider: 'wallet', providerRef: 'wallet_only', receiptNo: 'RCPT-WALLET-ONLY', paidAt: inMonth },
    { ...base, invoiceId: 'inv_top_invoice', kind: 'topup', status: 'paid', amount: 250, totalMinor: 25000, walletMinor: 0, gatewayMinor: 25000, providerRef: 'pay_top_1', topupId: 'top_1', paidAt: inMonth },
    { ...base, invoiceId: 'inv_open', kind: 'subscription', status: 'open', amount: 80, totalMinor: 8000, gatewayMinor: 8000, providerRef: 'order_open', paidAt: null, createdAt: inMonth },
    { ...base, invoiceId: 'inv_settling', kind: 'subscription', status: 'settling', amount: 10, totalMinor: 1000, gatewayMinor: 1000, createdAt: inMonth },
    { ...base, invoiceId: 'inv_void', kind: 'subscription', status: 'void', amount: 70, totalMinor: 7000, gatewayMinor: 7000, providerRef: 'pay_void', createdAt: inMonth },
    { ...base, invoiceId: 'inv_past_due', kind: 'subscription', status: 'past_due', amount: 70, totalMinor: 7000, gatewayMinor: 7000, providerRef: 'pay_failed', createdAt: inMonth },
    { ...base, invoiceId: 'inv_recovery', kind: 'upgrade', status: 'requires_recovery', amount: 70, totalMinor: 7000, gatewayMinor: 7000, createdAt: inMonth },
    { ...base, invoiceId: 'inv_prev', kind: 'subscription', status: 'paid', amount: 40, totalMinor: 4000, gatewayMinor: 4000, providerRef: 'pay_prev', receiptNo: 'RCPT-PREV', paidAt: prevMonth },
    { ...base, invoiceId: 'inv_boundary_out', kind: 'subscription', status: 'paid', amount: 15, totalMinor: 1500, gatewayMinor: 1500, providerRef: 'pay_before', paidAt: justBefore },
    { ...base, tenantId: 'lib-b', invoiceId: 'inv_recent', kind: 'upgrade', status: 'paid', amount: 20, totalMinor: 2000, gatewayMinor: 2000, provider: 'paypal', providerRef: 'pay_recent', receiptNo: 'RCPT-RECENT', paidAt: daysAgo3 },
    { ...base, invoiceId: 'inv_old', kind: 'subscription', status: 'paid', amount: 30, totalMinor: 3000, gatewayMinor: 3000, providerRef: 'pay_old', paidAt: daysAgo40 },
    { ...base, invoiceId: 'inv_scheduled', kind: 'subscription', status: 'open', amount: 90, totalMinor: 9000, gatewayMinor: 9000, providerRef: 'order_sched', createdAt: inMonth, dueAt: new Date(startOfZonedDay(`${next}-10`).getTime() + 3600e3) },
  ]);
  await WalletTopup.create([
    { topupId: 'top_1', tenantId: 'lib-a', amountMinor: 25000, currency: 'INR', status: 'paid', provider: 'razorpay', providerRef: 'pay_top_1', invoiceId: 'inv_top_invoice', paidAt: inMonth },
    { topupId: 'top_failed', tenantId: 'lib-a', amountMinor: 11100, currency: 'INR', status: 'failed', provider: 'razorpay', providerRef: 'pay_top_failed', paidAt: null, createdAt: inMonth },
  ]);
});
after(teardown);

test('unauthenticated and non-superadmin callers cannot read business collections', async () => {
  for (const path of ['/api/admin/business-dashboard', '/api/admin/collections', '/api/admin/collections/inv_sub_cash']) {
    assert.equal((await call('GET', path)).status, 401, path);
    assert.equal((await call('GET', path, { token: ctx.tokens.a })).status, 403, path);
  }
});

test('this month card counts gateway cash only', async () => {
  const dash = await call('GET', '/api/admin/business-dashboard', { token: SA() });
  assert.equal(dash.status, 200);
  assert.equal(dash.body.timezone, 'Asia/Kolkata');
  const summary = await call('GET', '/api/admin/saas-summary', { token: SA() });
  // in-month cash: 10000 + 6000. daysAgo3 may also fall in this month (2000). daysAgo40 and prev month must not.
  const month = dash.body.thisMonth.month;
  const recentInMonth = zonedMonth(new Date(Date.now() - 3 * 864e5)) === month ? 2000 : 0;
  const oldInMonth = zonedMonth(new Date(Date.now() - 40 * 864e5)) === month ? 3000 : 0;
  const expected = 10000 + 6000 + recentInMonth + oldInMonth;
  assert.equal(dash.body.thisMonth.collectedMinor, expected);
  assert.equal(summary.body.softwareRevenue.collectedMinor, expected);
  assert.equal(dash.body.thisMonth.paymentCount, 2 + (recentInMonth ? 1 : 0) + (oldInMonth ? 1 : 0));
  assert.equal(dash.body.thisMonth.walletOnlyPaymentCount, 1);
  assert.ok(!JSON.stringify(dash.body).includes('5000') || dash.body.thisMonth.collectedMinor !== 16000 + 5000);
  assert.ok(dash.body.thisMonth.collectedMinor < 16000 + 25000);
  const growth = dash.body.charts.popularPlans.find(p => p.planId === 'growth');
  const none = dash.body.charts.popularPlans.find(p => p.name === 'No plan');
  assert.equal(growth.libraries, 1);
  assert.ok(none.libraries >= 2);
  const cities = Object.fromEntries(dash.body.charts.cities.map(c => [c.city, c.libraries]));
  assert.equal(cities.Surat, 1);
  assert.equal(cities.Rajkot, undefined);
  assert.equal(cities.Unknown, 1);
  assert.ok(dash.body.charts.monthlyCollections.some(m => m.month === month && m.current && m.collectedMinor === expected));
  assert.equal(dash.body.charts.monthlyCollections.length, 12);
});

test('student fees, top-ups, wallet spend, and unverified invoices stay out of collection', async () => {
  const r = await call('GET', '/api/admin/collections?preset=this_month', { token: SA() });
  assert.equal(r.status, 200);
  assert.equal(r.body.preset, 'this_month');
  const ids = new Set(r.body.transactions.map(t => t.recordId));
  assert.ok(ids.has('inv_sub_cash'));
  assert.ok(ids.has('inv_split'));
  assert.ok(!ids.has('STU-1'));
  const split = r.body.transactions.find(t => t.recordId === 'inv_split');
  assert.equal(split.collectedMinor, 6000);
  assert.equal(split.walletMinor, 4000);
  assert.equal(split.gatewayMinor, 6000);
  const top = r.body.transactions.find(t => t.recordId === 'inv_top_invoice');
  assert.equal(top.bucket, 'wallet_topup');
  assert.equal(top.collectedMinor, 0);
  assert.equal(top.topupMinor, 25000);
  assert.equal(r.body.totals.walletTopupsMinor, 25000);
  assert.equal(r.body.totals.walletTopupCount, 1);
  assert.equal(r.body.totals.refundsMinor, 0);
  assert.equal(r.body.totals.refundsRecorded, false);
  assert.match(r.body.totals.refundsNote, /No software refund/);
  assert.equal(r.body.totals.grossReceiptsMinor, r.body.totals.verifiedCollectionsMinor + 25000);
  assert.equal(r.body.totals.netCollectionMinor, r.body.totals.verifiedCollectionsMinor);
  assert.ok(r.body.totals.pendingCount >= 3);
  assert.ok(r.body.totals.pendingMinor >= 8000 + 1000 + 9000);
  for (const id of ['inv_void', 'inv_past_due', 'inv_recovery', 'inv_open', 'inv_settling']) {
    const row = r.body.transactions.find(t => t.recordId === id);
    assert.ok(row, id);
    assert.equal(row.collectedMinor, 0, id);
  }
  assert.equal(r.body.projected.label.includes('Not collected'), true);
  assert.ok(r.body.projected.minor >= 9000);
  assert.ok(r.body.projected.items.every(item => item.collectedMinor === 0 && item.projected === true));
  assert.equal(r.body.totals.verifiedCollectionsMinor, (await call('GET', '/api/admin/business-dashboard', { token: SA() })).body.thisMonth.collectedMinor);
});

test('date presets, search, and filters', async () => {
  const month = zonedMonth(new Date());
  const prev = addCalendarMonths(month, -1);
  const lastMonth = await call('GET', '/api/admin/collections?preset=last_month', { token: SA() });
  assert.equal(lastMonth.status, 200);
  assert.equal(lastMonth.body.range.from, `${prev}-01`);
  assert.equal(lastMonth.body.range.to, monthEndYmd(prev));
  const prevIds = lastMonth.body.transactions.map(t => t.recordId);
  assert.ok(prevIds.includes('inv_prev'));
  assert.ok(prevIds.includes('inv_boundary_out'));
  assert.ok(!prevIds.includes('inv_sub_cash'));

  const week = await call('GET', '/api/admin/collections?preset=last_7_days', { token: SA() });
  const weekIds = week.body.transactions.map(t => t.recordId);
  assert.ok(weekIds.includes('inv_recent'));
  assert.ok(!weekIds.includes('inv_old'));

  const byReceipt = await call('GET', '/api/admin/collections?preset=all_time&q=RCPT-SPLIT', { token: SA() });
  assert.deepEqual(byReceipt.body.transactions.map(t => t.recordId), ['inv_split']);
  const byOwner = await call('GET', '/api/admin/collections?preset=all_time&q=admin-b@test.local', { token: SA() });
  assert.ok(byOwner.body.transactions.every(t => t.ownerEmail === 'admin-b@test.local'));
  assert.ok(byOwner.body.transactions.some(t => t.recordId === 'inv_recent'));
  const byProviderRef = await call('GET', '/api/admin/collections?preset=all_time&q=pay_sub_cash', { token: SA() });
  assert.equal(byProviderRef.body.transactions[0].recordId, 'inv_sub_cash');
  const upgrades = await call('GET', '/api/admin/collections?preset=all_time&kind=upgrade', { token: SA() });
  assert.ok(upgrades.body.transactions.every(t => t.kind === 'upgrade'));
  const paypal = await call('GET', '/api/admin/collections?preset=all_time&provider=paypal', { token: SA() });
  assert.ok(paypal.body.transactions.every(t => t.provider === 'paypal'));
  const openOnly = await call('GET', '/api/admin/collections?preset=this_month&status=open', { token: SA() });
  assert.ok(openOnly.body.transactions.every(t => t.status === 'open'));
  assert.ok(openOnly.body.transactions.some(t => t.recordId === 'inv_open'));
  assert.equal(openOnly.body.totals.verifiedCollectionsMinor, (await call('GET', '/api/admin/collections?preset=this_month', { token: SA() })).body.totals.verifiedCollectionsMinor);

  const custom = await call('GET', `/api/admin/collections?preset=custom&from=${month}-01&to=${monthEndYmd(month)}`, { token: SA() });
  assert.equal(custom.status, 200);
  assert.equal((await call('GET', '/api/admin/collections?preset=custom&from=2020-02-01&to=2020-01-01', { token: SA() })).status, 400);
  assert.equal((await call('GET', '/api/admin/collections?preset=nope', { token: SA() })).status, 400);

  const detail = await call('GET', '/api/admin/collections/inv_sub_cash', { token: SA() });
  assert.equal(detail.status, 200);
  assert.equal(detail.body.receiptNo, 'RCPT-SUB-1');
  assert.equal(detail.body.providerPaymentRef, 'pay_sub_cash');
  assert.equal(detail.body.verificationState, 'verified_paid');
  assert.equal(detail.body.receiptDeliveryStatus, 'sent');
  assert.equal(detail.body.libraryName, 'Library A');
  assert.match(detail.body.receiptUrl, /\/api\/admin\/software-plan\/invoices\/inv_sub_cash\/receipt/);
  assert.equal((await call('GET', '/api/admin/collections/missing', { token: SA() })).status, 404);
});
