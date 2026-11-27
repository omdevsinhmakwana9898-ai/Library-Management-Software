// Phase 2 §3–§5: library directory, one-library details, per-library analytics.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, call, ctx } from './helpers.js';
import { Library, User } from '../src/models.js';

const SA = () => ctx.tokens.sa;
const day = 864e5;

before(async () => {
  await setup('lms_library_directory_test');
  await call('POST', '/api/admin/plans', { token: SA(), body: { name: 'Standard', planId: 'standard', priceMonthly: 999 } });
  await call('POST', '/api/admin/plans', { token: SA(), body: { name: 'Basic', planId: 'basic', priceMonthly: 499 } });
  for (const [id, name, email] of [['lib-t', 'Trial House', 'admin-t@test.local'], ['lib-e', 'Expiring Hall', 'admin-e@test.local']]) {
    const r = await call('POST', '/api/admin/libraries', { token: SA(), body: { name, libraryId: id, adminEmail: email, adminPassword: 'Password-t-123' } });
    assert.equal(r.status, 201, JSON.stringify(r.body));
  }
  const now = Date.now();
  await Library.updateOne({ libraryId: 'lib-a' }, { $set: { city: 'Pune', planId: 'standard', phone: '9000000001', subscription: { planId: 'standard', status: 'active', interval: 'month', currentPeriodEnd: new Date(now + 200 * day) } } });
  await Library.updateOne({ libraryId: 'lib-b' }, { $set: { city: 'Delhi', planId: 'basic', phone: '9000000002', subscription: { planId: 'basic', status: 'active', interval: 'month', currentPeriodEnd: new Date(now + 60 * day) } } });
  await Library.updateOne({ libraryId: 'lib-t' }, { $set: { city: 'Surat', planId: 'standard', subscription: { planId: 'standard', status: 'trialing', interval: 'month', trialEndsAt: new Date(now + 40 * day), currentPeriodEnd: new Date(now + 40 * day) } } });
  await Library.updateOne({ libraryId: 'lib-e' }, { $set: { city: 'Ahmedabad', planId: 'basic', subscription: { planId: 'basic', status: 'active', interval: 'month', currentPeriodEnd: new Date(now + 3 * day) } } });
  await User.updateOne({ email: 'admin-a@test.local' }, { $set: { mobile: '9000000001', lastLoginAt: new Date(now - day) } });
  await User.updateOne({ email: 'admin-b@test.local' }, { $set: { mobile: '9000000002', lastLoginAt: new Date('2024-03-01T08:30:00.000Z') } });
  await User.updateOne({ email: 'admin-t@test.local' }, { $set: { lastLoginAt: null } });
  await User.updateOne({ email: 'admin-e@test.local' }, { $set: { lastLoginAt: new Date(now - 2 * day) } });
  await call('PUT', '/api/plans', { token: ctx.tokens.a, body: [{ id: 'P1', name: 'Monthly' }] });
  await call('PUT', '/api/branches', { token: ctx.tokens.a, body: [{ id: 'b1', name: 'Main' }, { id: 'b2', name: 'Annex' }] });
  await call('PUT', '/api/sections', { token: ctx.tokens.a, body: [{ id: 's1', name: 'Hall', branchId: 'b1' }] });
  await call('PUT', '/api/students', { token: ctx.tokens.a, body: [
    { id: 'S1', name: 'Secret Name', phone: '9999999999', status: 'Active', planId: 'P1', branchId: 'b1', sectionId: 's1' },
    { id: 'S2', name: 'Other', status: 'Expired', planId: 'P1', branchId: 'b1' },
  ] });
  await call('PUT', '/api/students', { token: ctx.tokens.b, body: [{ id: 'X1', name: 'B Student', status: 'Active' }] });
  await call('PUT', '/api/payments', { token: ctx.tokens.a, body: [
    { receiptNo: 'R1', studentId: 'S1', amount: 1000, netTotal: 1000, date: '2026-10-05', method: 'Cash', branchId: 'b1' },
    { receiptNo: 'R2', studentId: 'S2', amount: 400, netTotal: 400, date: '2026-10-06', method: 'Cash', branchId: 'b2' },
  ] });
  await call('PUT', '/api/expenses', { token: ctx.tokens.a, body: [{ id: 'E1', category: 'Rent', amount: 200, date: '2026-10-10', branchId: 'b1' }] });
  await call('PUT', '/api/payments', { token: ctx.tokens.b, body: [{ receiptNo: 'RB', studentId: 'X1', amount: 8000, netTotal: 8000, date: '2026-10-05', method: 'Cash' }] });
  await Library.updateOne({ libraryId: 'lib-b' }, { $set: { status: 'Disabled', subscription: { planId: 'basic', status: 'expired', interval: 'month', currentPeriodEnd: new Date('2020-01-15T00:00:00.000Z') } } });
});
after(teardown);

const ids = (body) => body.items.map(r => r.libraryId);

test('directory search, filters, sort and pagination stay on this library list', async () => {
  const all = await call('GET', '/api/admin/library-directory?pageSize=10&sort=name&dir=asc', { token: SA() });
  assert.equal(all.status, 200);
  assert.equal(all.body.total, 4);
  assert.deepEqual(ids(all.body), ['lib-e', 'lib-a', 'lib-b', 'lib-t']);
  const a = all.body.items.find(r => r.libraryId === 'lib-a');
  assert.equal(a.planName, 'Standard');
  assert.equal(a.subscriptionStatus, 'active');
  assert.equal(a.accountStatus, 'Enabled');
  assert.equal(a.studentsActive, 1);
  assert.equal(a.studentsTotal, 2);
  assert.equal(a.city, 'Pune');
  assert.ok(!JSON.stringify(all.body).includes('Secret Name'));
  assert.ok(!JSON.stringify(all.body).includes('9999999999'));

  assert.deepEqual(ids((await call('GET', '/api/admin/library-directory?q=9000000001', { token: SA() })).body), ['lib-a']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-directory?q=admin-b@test.local', { token: SA() })).body), ['lib-b']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-directory?q=lib-t', { token: SA() })).body), ['lib-t']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-directory?q=Trial%20House', { token: SA() })).body), ['lib-t']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-directory?city=Delhi', { token: SA() })).body), ['lib-b']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-directory?plan=standard', { token: SA() })).body).sort(), ['lib-a', 'lib-t']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-directory?subscription=active', { token: SA() })).body), ['lib-a']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-directory?subscription=trial', { token: SA() })).body), ['lib-t']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-directory?subscription=expiring', { token: SA() })).body), ['lib-e']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-directory?subscription=expired', { token: SA() })).body), ['lib-b']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-directory?account=disabled', { token: SA() })).body), ['lib-b']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-directory?activity=never', { token: SA() })).body), ['lib-t']);
  const recent = ids((await call('GET', '/api/admin/library-directory?activity=7d', { token: SA() })).body).sort();
  assert.deepEqual(recent, ['lib-a', 'lib-e']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-directory?expiry=expired', { token: SA() })).body), ['lib-b']);
  assert.deepEqual(ids((await call('GET', '/api/admin/library-directory?expiry=7d', { token: SA() })).body), ['lib-e']);
  const page = await call('GET', '/api/admin/library-directory?pageSize=1&page=2&sort=name&dir=asc', { token: SA() });
  assert.equal(page.body.total, 4);
  assert.equal(page.body.items.length, 1);
  assert.equal(page.body.items[0].libraryId, 'lib-a');
});

test('last active is the login timestamp and details do not leak another library', async () => {
  const b = await call('GET', '/api/admin/library-directory/lib-b', { token: SA() });
  assert.equal(b.status, 200);
  assert.equal(b.body.library.libraryId, 'lib-b');
  assert.equal(new Date(b.body.library.lastActiveAt).toISOString(), '2024-03-01T08:30:00.000Z');
  assert.equal(new Date(b.body.library.expiry).toISOString().slice(0, 10), '2020-01-15');
  assert.notEqual(new Date(b.body.library.lastActiveAt).toISOString().slice(0, 10), new Date(b.body.library.expiry).toISOString().slice(0, 10));
  assert.equal(b.body.library.accountStatus, 'Disabled');
  assert.equal(b.body.library.subscriptionStatus, 'expired');
  const flat = JSON.stringify(b.body);
  for (const secret of ['lib-a', 'lib-t', 'lib-e', 'Trial House', 'Secret Name', '9000000001', 'Pune']) assert.ok(!flat.includes(secret), secret);
  assert.equal((await call('GET', '/api/admin/library-directory/missing', { token: SA() })).status, 404);
});

test('per-library analytics are scoped and the platform overview has no customer money', async () => {
  const one = await call('GET', '/api/admin/insights?libraryId=lib-a', { token: SA() });
  assert.equal(one.status, 200);
  assert.equal(one.body.totals.libraries, 1);
  assert.equal(one.body.perLibrary.length, 1);
  assert.equal(one.body.perLibrary[0].libraryId, 'lib-a');
  assert.equal(one.body.totals.customerFeeCollections, 1400);
  assert.equal(one.body.totals.customerExpenses, 200);
  assert.equal(one.body.totals.customerNet, 1200);
  assert.equal(one.body.totals.studentsActive, 1);
  assert.ok(!JSON.stringify(one.body.perLibrary).includes('lib-b'));
  const branch = await call('GET', '/api/admin/insights?libraryId=lib-a&branchId=b1', { token: SA() });
  assert.equal(branch.body.totals.customerFeeCollections, 1000);
  assert.equal(branch.body.totals.customerExpenses, 200);
  assert.ok(branch.body.catalog.branches.some(b => b.branchId === 'b1' && b.name === 'Main'));
  const other = await call('GET', '/api/admin/insights?libraryId=lib-b', { token: SA() });
  assert.equal(other.body.totals.customerFeeCollections, 8000);
  assert.equal(other.body.totals.studentsTotal, 1);

  const overview = await call('GET', '/api/admin/insights/overview', { token: SA() });
  assert.equal(overview.status, 200);
  assert.equal(overview.body.totals.libraries, 4);
  assert.equal(overview.body.totals.studentsActive, 2);
  assert.equal(overview.body.totals.studentsTotal, 3);
  for (const k of ['customerFeeCollections', 'customerExpenses', 'customerNet', 'seatUtilization', 'seatsTotal']) {
    assert.equal(overview.body.totals[k], undefined, k);
    assert.equal(overview.body[k], undefined, k);
  }
  assert.match(overview.body.note, /separate from software revenue/i);
});

test('directory and overview are superadmin only and unauthenticated calls are rejected', async () => {
  for (const p of ['/api/admin/library-directory', '/api/admin/library-directory/lib-a', '/api/admin/insights/overview']) {
    assert.equal((await call('GET', p)).status, 401, p);
    assert.equal((await call('GET', p, { token: ctx.tokens.a })).status, 403, p);
  }
});

test('disabling a library records the reason and does not change another library', async () => {
  const r = await call('PATCH', '/api/admin/libraries/lib-a', { token: SA(), body: { status: 'Disabled', reason: 'Owner asked for a pause' } });
  assert.equal(r.status, 200);
  const logs = (await call('GET', '/api/admin/audit-logs', { token: SA() })).body;
  const list = Array.isArray(logs) ? logs : logs.items;
  const hit = list.find(l => l.action === 'library.update' && l.tenantId === 'lib-a' && l.reason === 'Owner asked for a pause');
  assert.ok(hit);
  const a = (await call('GET', '/api/admin/library-directory/lib-a', { token: SA() })).body.library;
  const b = (await call('GET', '/api/admin/library-directory/lib-b', { token: SA() })).body.library;
  assert.equal(a.accountStatus, 'Disabled');
  assert.equal(b.accountStatus, 'Disabled');
  assert.equal(b.libraryId, 'lib-b');
  await call('PATCH', '/api/admin/libraries/lib-a', { token: SA(), body: { status: 'Active', reason: 'Pause ended' } });
});
