import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, call, ctx } from './helpers.js';

before(async () => { await setup('settings-branch-scope'); });
after(async () => { await teardown(); });

test('settings GET and PUT work with zero branches and no branch id', async () => {
  const branches = await call('GET', '/api/branches', { token: ctx.tokens.a });
  assert.equal(branches.status, 200);
  assert.deepEqual(branches.body, []);

  const get = await call('GET', '/api/settings', { token: ctx.tokens.a });
  assert.equal(get.status, 200);
  assert.equal(get.body.branchId, undefined);

  const put = await call('PUT', '/api/settings', {
    token: ctx.tokens.a,
    body: { name: 'Library A', logo: '📖', gracePeriodDays: 4 },
  });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal(put.body.name, 'Library A');
  assert.equal(put.body.gracePeriodDays, 4);
  assert.equal(put.body.branchId, undefined);

  const shifts = await call('PUT', '/api/shifts', {
    token: ctx.tokens.a,
    body: [{ id: 'sh-lib', name: 'Morning', startTime: '06:00', endTime: '12:00' }],
  });
  assert.equal(shifts.status, 200, JSON.stringify(shifts.body));
  const savedShifts = await call('GET', '/api/shifts', { token: ctx.tokens.a });
  assert.equal(savedShifts.status, 200);
  assert.equal(savedShifts.body.length, 1);
  assert.equal(savedShifts.body[0].id, 'sh-lib');
  assert.equal(savedShifts.body[0].branchId, undefined);

  const sections = await call('PUT', '/api/sections', {
    token: ctx.tokens.a,
    body: [{ id: 'sec-lib', name: 'Hall' }],
  });
  assert.equal(sections.status, 200, JSON.stringify(sections.body));
  const savedSections = await call('GET', '/api/sections', { token: ctx.tokens.a });
  assert.equal(savedSections.body[0].id, 'sec-lib');
  assert.equal(savedSections.body[0].branchId, undefined);
});

test('settings GET and PUT work for a single branch without requiring a branch id', async () => {
  const created = await call('POST', '/api/branches', {
    token: ctx.tokens.a,
    body: { id: 'b-only', name: 'Only Branch', code: 'ONLY' },
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  const put = await call('PUT', '/api/settings', {
    token: ctx.tokens.a,
    body: { name: 'Library A', logo: '📖', phone: '9999999999' },
  });
  assert.equal(put.status, 200, JSON.stringify(put.body));
  assert.equal(put.body.phone, '9999999999');
  assert.equal(put.body.branchId, undefined);

  const plans = await call('PUT', '/api/plans', {
    token: ctx.tokens.a,
    body: [{ id: 'pl-lib', name: 'Monthly', seatTypeId: 'st-1' }],
  });
  assert.equal(plans.status, 200, JSON.stringify(plans.body));
  const savedPlans = await call('GET', '/api/plans', { token: ctx.tokens.a });
  assert.equal(savedPlans.body[0].id, 'pl-lib');
  assert.equal(savedPlans.body[0].branchId, undefined);

  const again = await call('GET', '/api/settings', { token: ctx.tokens.a });
  assert.equal(again.status, 200);
  assert.equal(again.body.name, 'Library A');
});
