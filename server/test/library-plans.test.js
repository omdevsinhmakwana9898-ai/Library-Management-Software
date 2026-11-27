// Phase 2 §7: searchable library plan assignments. Account status stays separate from subscription.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, call, ctx } from './helpers.js';
import { Library, User } from '../src/models.js';
import { SoftwareInvoice } from '../src/payments/invoices.js';

const SA = () => ctx.tokens.sa;
const day = 864e5;

before(async () => {
  await setup('lms_library_plans_test');
  await call('POST', '/api/admin/plans', { token: SA(), body: { name: 'Standard', planId: 'standard', priceMonthly: 999, public: true } });
  await call('POST', '/api/admin/plans', { token: SA(), body: { name: 'Basic', planId: 'basic', priceMonthly: 499, public: true } });
  for (const [id, name, email] of [['lib-t', 'Trial House', 'admin-t@test.local'], ['lib-e', 'Expiring Hall', 'admin-e@test.local'], ['lib-r', 'Renewal House', 'admin-r@test.local']]) {
    const r = await call('POST', '/api/admin/libraries', { token: SA(), body: { name, libraryId: id, adminEmail: email, adminPassword: 'Password-t-123' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  const now = Date.now();
  await Library.updateOne({ libraryId: 'lib-a' }, { $set: { planId: 'standard', phone: '9000000001', subscription: { planId: 'standard', status: 'active', interval: 'month', price: 999, currentPeriodEnd: new Date(now + 200 * day) } } });
  await Library.updateOne({ libraryId: 'lib-b' }, { $set: { planId: 'basic', phone: '9000000002', status: 'Disabled', subscription: { planId: 'basic', status: 'active', interval: 'month', price: 499, currentPeriodEnd: new Date(now + 80 * day) } } });
  await Library.updateOne({ libraryId: 'lib-t' }, { $set: { planId: 'standard', subscription: { planId: 'standard', status: 'trialing', interval: 'month', trialEndsAt: new Date(now + 40 * day), currentPeriodEnd: new Date(now + 40 * day) } } });
  await Library.updateOne({ libraryId: 'lib-e' }, { $set: { planId: 'basic', subscription: { planId: 'basic', status: 'active', interval: 'month', price: 499, currentPeriodEnd: new Date(now + 3 * day) } } });
  await Library.updateOne({ libraryId: 'lib-r' }, { $set: { planId: 'standard', subscription: { planId: 'standard', status: 'active', interval: 'month', price: 999, currentPeriodEnd: new Date(now + 20 * day) } } });
  await User.updateOne({ email: 'admin-a@test.local' }, { $set: { name: 'Asha Owner', mobile: '9000000001' } });
  await User.updateOne({ email: 'admin-b@test.local' }, { $set: { name: 'Bharat Owner', mobile: '9000000002' } });
  await User.updateOne({ email: 'admin-r@test.local' }, { $set: { name: 'Rekha Owner', mobile: '9000000005' } });
  const past = new Date(now - 2 * day);
  await SoftwareInvoice.create({ invoiceId: 'inv_lp_open', tenantId: 'lib-r', kind: 'subscription', planId: 'standard', amount: 999, totalMinor: 99900, status: 'open', currency: 'INR', dueAt: past });
  await SoftwareInvoice.create({ invoiceId: 'inv_lp_topup', tenantId: 'lib-a', kind: 'topup', amount: 50, totalMinor: 5000, status: 'open', currency: 'INR', dueAt: past });
  await SoftwareInvoice.create({ invoiceId: 'inv_lp_future', tenantId: 'lib-t', kind: 'upgrade', amount: 10, totalMinor: 1000, status: 'open', currency: 'INR', dueAt: new Date(now + 10 * day) });
});
after(teardown);

const ids = (body) => body.items.map(r => r.libraryId);

test('library plans require a super admin and search the library contact fields', async () => {
  assert.equal((await call('GET', '/api/admin/library-plans')).status, 401);
  assert.equal((await call('GET', '/api/admin/library-plans', { token: ctx.tokens.a })).status, 403);
  const all = await call('GET', '/api/admin/library-plans?pageSize=10&sort=name&dir=asc', { token: SA() });
  assert.equal(all.status, 200);
  assert.equal(all.body.total, 5);
  assert.match(all.body.renewalRule, /past_due/);
  assert.match(all.body.renewalRule, /Account Enabled/);
  assert.ok(!JSON.stringify(all.body.items).includes('Secret'));

  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?q=Asha%20Owner', { token: SA() })).body), ['lib-a']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?q=admin-b@test.local', { token: SA() })).body), ['lib-b']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?q=9000000005', { token: SA() })).body), ['lib-r']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?q=lib-t', { token: SA() })).body), ['lib-t']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?q=Trial%20House', { token: SA() })).body), ['lib-t']);
  const page = await call('GET', '/api/admin/library-plans?pageSize=1&page=2&sort=name&dir=asc', { token: SA() });
  assert.equal(page.body.total, 5);
  assert.equal(page.body.items.length, 1);
  assert.equal(page.body.items[0].libraryId, 'lib-a');
});

test('filters keep account status apart from subscription, trial, expiry and renewal', async () => {
  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?plan=standard', { token: SA() })).body).sort(), ['lib-a', 'lib-r', 'lib-t']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?subscription=trial', { token: SA() })).body), ['lib-t']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?subscription=expiring', { token: SA() })).body), ['lib-e']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?subscription=active', { token: SA() })).body).sort(), ['lib-a', 'lib-b', 'lib-r']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?account=disabled', { token: SA() })).body), ['lib-b']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?account=disabled&subscription=active', { token: SA() })).body), ['lib-b']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?account=disabled&subscription=expired', { token: SA() })).body), []);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?renewal=outstanding', { token: SA() })).body), ['lib-r']);
  assert.equal((await call('GET', '/api/admin/library-plans?q=lib-a', { token: SA() })).body.items[0].renewalOutstanding, false);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?expiry=7d', { token: SA() })).body), ['lib-e']);

  const old = new Date('2020-01-15T00:00:00.000Z');
  await Library.updateOne({ libraryId: 'lib-e' }, { $set: { subscription: { planId: 'basic', status: 'expired', interval: 'month', price: 499, currentPeriodEnd: old } } });
  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?subscription=expired', { token: SA() })).body), ['lib-e']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?expiredMonths=6', { token: SA() })).body), ['lib-e']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?expiryFrom=2020-01-01&expiryTo=2020-01-31', { token: SA() })).body), ['lib-e']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-plans?expiryFrom=2021-01-01&expiryTo=2021-02-01', { token: SA() })).body), []);

  const enabled = await call('PATCH', '/api/admin/libraries/lib-b', { token: SA(), body: { status: 'Active', reason: 'Opened again' } });
  assert.equal(enabled.status, 200);
  const row = (await call('GET', '/api/admin/library-plans?q=lib-b', { token: SA() })).body.items[0];
  assert.equal(row.accountStatus, 'Enabled');
  assert.equal(row.subscriptionStatus, 'active');
  const disabled = await call('PATCH', '/api/admin/libraries/lib-b', { token: SA(), body: { status: 'Disabled', reason: 'Closed for review' } });
  assert.equal(disabled.status, 200);
  const again = (await call('GET', '/api/admin/library-plans?q=lib-b', { token: SA() })).body.items[0];
  assert.equal(again.accountStatus, 'Disabled');
  assert.equal(again.subscriptionStatus, 'active');
});

test('assigning a plan does not rewrite the subscription period or invoices', async () => {
  const before = await Library.findOne({ libraryId: 'lib-a' }).lean();
  const assigned = await call('PATCH', '/api/admin/libraries/lib-a', { token: SA(), body: { planId: 'basic' } });
  assert.equal(assigned.status, 200);
  const after = await Library.findOne({ libraryId: 'lib-a' }).lean();
  assert.equal(after.planId, 'basic');
  assert.equal(after.subscription.planId, before.subscription.planId);
  assert.equal(after.subscription.price, before.subscription.price);
  assert.equal(new Date(after.subscription.currentPeriodEnd).toISOString(), new Date(before.subscription.currentPeriodEnd).toISOString());
  const invoice = await SoftwareInvoice.findOne({ invoiceId: 'inv_lp_open' }).lean();
  assert.equal(invoice.amount, 999);
  assert.equal(invoice.status, 'open');
});
