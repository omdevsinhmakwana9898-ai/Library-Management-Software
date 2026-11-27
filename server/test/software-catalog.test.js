// Phase 2 §6: software plan catalog sync, archive, and seat-cap protection.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, call, ctx } from './helpers.js';
import { Library, User, models } from '../src/models.js';
import { SoftwareInvoice } from '../src/payments/invoices.js';
import { whatsappIncluded } from '../src/plans.js';

const SA = () => ctx.tokens.sa;

before(() => setup('lms_software_catalog_test'));
after(teardown);

test('whatsapp follows a feature line until an explicit entitlement is set', () => {
  assert.equal(whatsappIncluded({ features: ['WhatsApp reminders'] }), true);
  assert.equal(whatsappIncluded({ features: ['Reports'] }), false);
  assert.equal(whatsappIncluded({ features: ['WhatsApp reminders'], whatsappEntitlement: false }), false);
  assert.equal(whatsappIncluded({ features: [], whatsappEntitlement: true }), true);
  assert.equal(whatsappIncluded({ whatsappEntitlement: null, features: ['Daily WhatsApp'] }), true);
});

test('catalog create, edit, hide and archive stay in sync with public and owner plan lists', async () => {
  assert.equal((await call('GET', '/api/admin/plans')).status, 401);
  assert.equal((await call('POST', '/api/admin/plans', { token: ctx.tokens.a, body: { name: 'Nope' } })).status, 403);

  const created = await call('POST', '/api/admin/plans', {
    token: SA(),
    body: { name: 'Growth', planId: 'growth', icon: '★', priceMonthly: 100, priceYearly: 1000, deskLimit: 10, branchLimit: 2, staffLimit: 3, studentLimit: 20, trialDays: 7, public: true, features: ['Reports'], whatsappEntitlement: true },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.icon, '★');
  assert.equal(created.body.whatsappIncluded, true);
  assert.equal(created.body.deskLimit, 10);

  const pub = await call('GET', '/api/public/software-plans');
  const listed = pub.body.plans.find(p => p.planId === 'growth');
  assert.ok(listed);
  assert.equal(listed.priceMonthly, 100);
  assert.equal(listed.name, 'Growth');
  assert.equal(listed.whatsappIncluded, true);
  assert.equal(listed.icon, '★');

  const edited = await call('PATCH', '/api/admin/plans/growth', { token: SA(), body: { name: 'Growth Plus', priceMonthly: 150, features: ['Reports', 'Exports'] } });
  assert.equal(edited.status, 200, JSON.stringify(edited.body));
  const pub2 = (await call('GET', '/api/public/software-plans')).body.plans.find(p => p.planId === 'growth');
  assert.equal(pub2.name, 'Growth Plus');
  assert.equal(pub2.priceMonthly, 150);
  assert.deepEqual(pub2.features, ['Reports', 'Exports']);

  const end = new Date('2030-06-01T00:00:00.000Z');
  await Library.updateOne({ libraryId: 'lib-a' }, { $set: { planId: 'growth', subscription: { planId: 'growth', status: 'active', interval: 'month', price: 100, currentPeriodEnd: end } } });
  await SoftwareInvoice.create({
    invoiceId: 'inv_catalog_paid', tenantId: 'lib-a', kind: 'subscription', planId: 'growth', interval: 'month',
    amount: 100, totalMinor: 10000, baseMinor: 10000, gatewayMinor: 10000, status: 'paid', currency: 'INR',
  });
  await SoftwareInvoice.create({
    invoiceId: 'inv_catalog_open', tenantId: 'lib-a', kind: 'subscription', planId: 'growth', interval: 'month',
    amount: 100, totalMinor: 10000, status: 'open', currency: 'INR', dueAt: end,
  });

  const hidden = await call('PATCH', '/api/admin/plans/growth', { token: SA(), body: { public: false } });
  assert.equal(hidden.body.public, false);
  assert.equal((await call('GET', '/api/public/software-plans')).body.plans.some(p => p.planId === 'growth'), false);
  await call('PATCH', '/api/admin/plans/growth', { token: SA(), body: { public: true } });

  const archived = await call('PATCH', '/api/admin/plans/growth', { token: SA(), body: { active: false, confirmArchive: true } });
  assert.equal(archived.status, 200, JSON.stringify(archived.body));
  assert.equal(archived.body.active, false);
  assert.equal((await call('GET', '/api/public/software-plans')).body.plans.some(p => p.planId === 'growth'), false);

  const owner = await call('GET', '/api/subscription', { token: ctx.tokens.a });
  assert.equal(owner.status, 200, JSON.stringify(owner.body));
  assert.equal(owner.body.plan.planId, 'growth');
  assert.equal(owner.body.plan.active, false);
  assert.equal(owner.body.plans.some(p => p.planId === 'growth'), false);
  assert.equal(owner.body.subscription.price, 100);
  assert.equal(new Date(owner.body.subscription.currentPeriodEnd).toISOString(), end.toISOString());

  const paid = await SoftwareInvoice.findOne({ invoiceId: 'inv_catalog_paid' }).lean();
  const open = await SoftwareInvoice.findOne({ invoiceId: 'inv_catalog_open' }).lean();
  assert.equal(paid.amount, 100);
  assert.equal(paid.totalMinor, 10000);
  assert.equal(open.amount, 100);
  assert.equal(open.totalMinor, 10000);
  const lib = await Library.findOne({ libraryId: 'lib-a' }).lean();
  assert.equal(lib.planId, 'growth');
  assert.equal(lib.subscription.price, 100);
});

test('lowering a cap is rejected when an assigned library already exceeds it', async () => {
  const created = await call('POST', '/api/admin/plans', {
    token: SA(),
    body: { name: 'Cap', planId: 'cap', priceMonthly: 10, studentLimit: 5, staffLimit: 5, branchLimit: 5, deskLimit: 5, public: false },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  await call('PATCH', '/api/admin/libraries/lib-a', { token: SA(), body: { planId: 'cap' } });
  const beforeSub = (await Library.findOne({ libraryId: 'lib-a' }).lean()).subscription;

  const stu = (n) => Array.from({ length: n }, (_, i) => ({ id: `C${i}`, name: `C${i}`, status: 'Active', expiryDate: '2099-01-01' }));
  assert.equal((await call('PUT', '/api/students', { token: ctx.tokens.a, body: stu(2) })).status, 200);
  assert.equal((await call('PUT', '/api/branches', { token: ctx.tokens.a, body: [{ id: 'b1', name: 'One' }, { id: 'b2', name: 'Two' }] })).status, 200);
  await User.create({ email: 'cap.staff1@test.local', name: 'One', role: 'staff', tenantId: 'lib-a', libraryId: 'lib-a', passwordHash: 'x' });
  await User.create({ email: 'cap.staff2@test.local', name: 'Two', role: 'staff', tenantId: 'lib-a', libraryId: 'lib-a', passwordHash: 'x' });
  await models.seats.create({ tenantId: 'lib-a', id: 'd1', name: 'Desk 1', _key: 'd1' });
  await models.seats.create({ tenantId: 'lib-a', id: 'd2', name: 'Desk 2', _key: 'd2' });

  const blocked = await call('PATCH', '/api/admin/plans/cap', { token: SA(), body: { studentLimit: 1, staffLimit: 1, branchLimit: 1, deskLimit: 1 } });
  assert.equal(blocked.status, 409, JSON.stringify(blocked.body));
  assert.equal(blocked.body.code, 'plan_cap_exceeded');
  assert.ok(blocked.body.conflicts.length >= 4);
  const still = (await call('GET', '/api/admin/plans', { token: SA() })).body.find(p => p.planId === 'cap');
  assert.equal(still.studentLimit, 5);
  assert.equal(still.deskLimit, 5);
  const after = await Library.findOne({ libraryId: 'lib-a' }).lean();
  assert.equal(after.planId, 'cap');
  assert.deepEqual(after.subscription, beforeSub);
  assert.equal(await models.students.countDocuments({ tenantId: 'lib-a' }), 2);

  const ok = await call('PATCH', '/api/admin/plans/cap', { token: SA(), body: { studentLimit: 2 } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal(ok.body.studentLimit, 2);
  assert.equal(ok.body.deskLimit, 5);
});
