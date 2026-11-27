// Phase 2 §11: partner directory search, commission filters, tracking-only payout notes.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, call, ctx } from './helpers.js';
import { presetRange } from '../src/businessCollections.js';
import { PARTNER_PERIOD_PRESETS } from '../src/partners.js';

let partner, agent;
before(async () => {
  await setup('phase2partners');
  const mk = async (kind, name, email) => (await call('POST', '/api/admin/partners', { token: ctx.tokens.sa, body: { kind, name, email, password: 'Partner-Pass-1' } })).body.partner;
  partner = await mk('partner', 'Surat Partner', 'surat-pages@test.local');
  agent = await mk('agent', 'Surat Agent', 'agent-pages@test.local');
  await call('PUT', `/api/admin/partners/${agent.id}/rules/initial`, { token: ctx.tokens.sa, body: { mode: 'percent', value: 10 } });
  await call('PUT', `/api/admin/partners/${partner.id}/rules/renewal`, { token: ctx.tokens.sa, body: { mode: 'fixed', value: 100 } });
  await call('POST', '/api/admin/libraries/lib-a/assign', { token: ctx.tokens.sa, body: { partnerId: partner.id, originalSellerId: agent.id, reason: 'first sale' } });
  const initial = await call('POST', '/api/admin/sales', { token: ctx.tokens.sa, body: { libraryId: 'lib-a', kind: 'initial', saleRef: 'PAGE-1', saleAmount: 2000, saleDate: '2020-01-15' } });
  assert.equal(initial.status, 201, JSON.stringify(initial.body));
  const renewal = await call('POST', '/api/admin/sales', { token: ctx.tokens.sa, body: { libraryId: 'lib-a', kind: 'renewal', saleRef: 'PAGE-2', saleAmount: 2000 } });
  assert.equal(renewal.status, 201, JSON.stringify(renewal.body));
  await call('POST', '/api/admin/libraries/lib-b/assign', { token: ctx.tokens.sa, body: { partnerId: partner.id, reason: 'later renewal only' } });
});
after(teardown);

test('partner pages are super admin only', async () => {
  const paths = [
    ['GET', '/api/admin/partner-summary'],
    ['GET', '/api/admin/partners?page=1'],
    ['GET', `/api/admin/partners/${partner.id}`],
    ['GET', '/api/admin/commissions?page=1'],
    ['GET', '/api/admin/commission-payout-notes'],
  ];
  for (const [method, path] of paths) {
    assert.equal((await call(method, path)).status, 401, path);
    assert.equal((await call(method, path, { token: ctx.tokens.a })).status, 403, path);
  }
  const denied = await call('POST', '/api/admin/commissions/000000000000000000000000/payout-note', { token: ctx.tokens.a, body: { confirm: true } });
  assert.equal(denied.status, 403);
});

test('directory search, filters, and pagination stay additive', async () => {
  const plain = await call('GET', '/api/admin/partners', { token: ctx.tokens.sa });
  assert.equal(Array.isArray(plain.body), true);
  assert.equal(plain.body.find(p => p.id === agent.id).rules.initial.value, 10);
  assert.equal(plain.body.find(p => p.id === partner.id).emailVerified, true);
  assert.ok(plain.body.find(p => p.id === partner.id).assignedLibraries.some(l => l.libraryId === 'lib-a'));

  const page = await call('GET', '/api/admin/partners?page=1&limit=1&kind=agent', { token: ctx.tokens.sa });
  assert.equal(page.status, 200, JSON.stringify(page.body));
  assert.equal(page.body.items.length, 1);
  assert.equal(page.body.total, 1);
  assert.equal(page.body.pages, 1);
  assert.equal(page.body.items[0].id, agent.id);

  const byName = await call('GET', '/api/admin/partners?page=1&q=Surat%20Partner', { token: ctx.tokens.sa });
  assert.deepEqual(byName.body.items.map(p => p.id), [partner.id]);
  const byLibrary = await call('GET', '/api/admin/partners?page=1&libraryId=lib-a&kind=partner', { token: ctx.tokens.sa });
  assert.equal(byLibrary.body.items[0].id, partner.id);
  const disabled = await call('GET', '/api/admin/partners?page=1&status=Disabled', { token: ctx.tokens.sa });
  assert.equal(disabled.body.total, 0);
  const old = await call('GET', '/api/admin/partners?page=1&preset=custom&from=2019-01-01&to=2019-01-31', { token: ctx.tokens.sa });
  assert.equal(old.body.total, 0);
  const month = await call('GET', '/api/admin/partners?page=1&preset=this_month', { token: ctx.tokens.sa });
  assert.ok(month.body.total >= 2);
  const older = ['all_time', 'last_7_days', 'this_month', 'last_month', 'last_2_months', 'last_3_months', 'last_6_months', 'last_1_year', 'custom'];
  for (const preset of older) assert.ok(PARTNER_PERIOD_PRESETS.includes(preset), preset);
  assert.ok(PARTNER_PERIOD_PRESETS.includes('last_3_years'));
  const years = await call('GET', '/api/admin/partners?page=1&preset=last_3_years', { token: ctx.tokens.sa });
  assert.equal(years.status, 200, JSON.stringify(years.body));
  const span = presetRange('last_3_years');
  assert.equal(years.body.range.from, span.from);
  assert.equal(years.body.range.to, span.to);
  assert.ok(years.body.total >= 2);
  assert.equal((await call('GET', '/api/admin/partners?page=1&preset=nope', { token: ctx.tokens.sa })).status, 400);

  const summary = await call('GET', '/api/admin/partner-summary', { token: ctx.tokens.sa });
  assert.ok(summary.body.activePartners >= 2);
  assert.ok(summary.body.assignedLibraries >= 2);
  assert.equal(summary.body.earnedCommission, 300);
  assert.equal(summary.body.unpaidCommission, 300);
  assert.match(summary.body.statusMap.pending.note, /earned/);
  assert.match(summary.body.statusMap.paid.note, /outside payout/);
  assert.match(summary.body.payouts, /not executed/);
});

test('commission search, filters, and pagination do not rewrite frozen rows', async () => {
  const plain = await call('GET', `/api/admin/commissions?sellerId=${agent.id}`, { token: ctx.tokens.sa });
  assert.equal(Array.isArray(plain.body), true);
  assert.equal(plain.body[0].amount, 200);
  assert.equal(plain.body[0].basis.value, 10);
  assert.equal(plain.body[0].requirementLabel, 'pending');
  assert.equal(plain.body[0].paymentExecuted, false);

  const pending = await call('GET', '/api/admin/commissions?page=1&status=pending&q=PAGE-', { token: ctx.tokens.sa });
  assert.equal(pending.body.total, 2);
  assert.ok(pending.body.items.every(r => r.status === 'earned' && r.payoutStatus === 'unpaid'));
  const renewal = await call('GET', `/api/admin/commissions?page=1&partnerId=${partner.id}&libraryId=lib-a&kind=renewal&status=earned`, { token: ctx.tokens.sa });
  assert.equal(renewal.body.items.length, 1);
  assert.equal(renewal.body.items[0].saleRef, 'PAGE-2');
  assert.equal(renewal.body.items[0].amount, 100);
  const old = await call('GET', '/api/admin/commissions?page=1&preset=custom&from=2020-01-01&to=2020-01-31', { token: ctx.tokens.sa });
  assert.deepEqual(old.body.items.map(r => r.saleRef), ['PAGE-1']);
  const today = await call('GET', '/api/admin/commissions?page=1&preset=this_month&q=PAGE-', { token: ctx.tokens.sa });
  assert.equal(today.body.items.some(r => r.saleRef === 'PAGE-1'), false);
  assert.equal(today.body.items.some(r => r.saleRef === 'PAGE-2'), true);
  const years = await call('GET', '/api/admin/commissions?page=1&preset=last_3_years&q=PAGE-', { token: ctx.tokens.sa });
  assert.equal(years.status, 200, JSON.stringify(years.body));
  const span = presetRange('last_3_years');
  assert.equal(years.body.range.from, span.from);
  assert.equal(years.body.range.to, span.to);
  assert.equal(years.body.items.some(r => r.saleRef === 'PAGE-1'), false);
  assert.equal(years.body.items.some(r => r.saleRef === 'PAGE-2'), true);
  assert.equal((await call('GET', '/api/admin/commissions?page=1&preset=nope', { token: ctx.tokens.sa })).status, 400);

  const p1 = await call('GET', '/api/admin/commissions?page=1&limit=1&q=PAGE-', { token: ctx.tokens.sa });
  const p2 = await call('GET', '/api/admin/commissions?page=2&limit=1&q=PAGE-', { token: ctx.tokens.sa });
  assert.equal(p1.body.total, 2);
  assert.equal(p1.body.items.length, 1);
  assert.equal(p2.body.items.length, 1);
  assert.notEqual(p1.body.items[0].id, p2.body.items[0].id);
  assert.match(p1.body.statusMap.unpaid.note, /payoutStatus unpaid/);
});

test('payout note is bookkeeping only and leaves the frozen commission alone', async () => {
  const rec = (await call('GET', `/api/admin/commissions?sellerId=${agent.id}`, { token: ctx.tokens.sa })).body[0];
  const missing = await call('POST', `/api/admin/commissions/${rec.id}/payout-note`, {
    token: ctx.tokens.sa, body: { reference: 'NEFT-1', amount: 50, date: '2026-11-01' },
  });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.code, 'confirm_payout_note');
  assert.equal((await call('GET', `/api/admin/commissions/${rec.id}`, { token: ctx.tokens.sa })).body.payoutStatus, 'unpaid');

  const noted = await call('POST', `/api/admin/commissions/${rec.id}/payout-note`, {
    token: ctx.tokens.sa,
    body: { confirm: true, reference: 'NEFT-1', amount: 50, date: '2026-11-01', note: 'paid from the company bank, not this app' },
  });
  assert.equal(noted.status, 200, JSON.stringify(noted.body));
  assert.equal(noted.body.paymentExecuted, false);
  assert.equal(noted.body.moneyMoved, false);
  assert.equal(noted.body.trackingOnly, true);
  assert.equal(noted.body.commissionAmountUnchanged, true);
  assert.equal(noted.body.frozenRateUnchanged, true);
  assert.equal(noted.body.record.amount, 200);
  assert.equal(noted.body.record.basis.value, 10);
  assert.equal(noted.body.record.basis.mode, 'percent');
  assert.equal(noted.body.record.saleAmount, 2000);
  assert.equal(noted.body.record.payoutStatus, 'paid');
  assert.equal(noted.body.record.payoutNote.amount, 50);
  assert.equal(noted.body.record.payoutNote.reference, 'NEFT-1');
  assert.equal(noted.body.record.requirementLabel, 'paid');

  await call('PUT', `/api/admin/partners/${agent.id}/rules/initial`, { token: ctx.tokens.sa, body: { mode: 'percent', value: 40 } });
  const again = await call('GET', `/api/admin/commissions/${rec.id}`, { token: ctx.tokens.sa });
  assert.equal(again.body.amount, 200);
  assert.equal(again.body.basis.value, 10);
  assert.equal(again.body.paymentExecuted, false);

  const dup = await call('POST', `/api/admin/commissions/${rec.id}/payout-note`, {
    token: ctx.tokens.sa, body: { confirm: true, reference: 'NEFT-2', amount: 200, date: '2026-11-02' },
  });
  assert.equal(dup.status, 409);

  const notes = await call('GET', '/api/admin/commission-payout-notes?page=1', { token: ctx.tokens.sa });
  assert.equal(notes.body.paymentExecuted, false);
  assert.match(notes.body.note, /No payment was executed/);
  assert.equal(notes.body.items.length, 1);
  assert.equal(notes.body.items[0].amount, 200);

  const renewal = (await call('GET', `/api/admin/commissions?sellerId=${partner.id}&status=earned`, { token: ctx.tokens.sa })).body.find(r => r.saleRef === 'PAGE-2');
  const reversed = await call('POST', `/api/admin/commissions/${renewal.id}/reverse`, { token: ctx.tokens.sa, body: { reason: 'refund' } });
  assert.equal(reversed.body.amount, 100);
  assert.equal(reversed.body.basis.value, 100);
  const blocked = await call('POST', `/api/admin/commissions/${renewal.id}/payout-note`, {
    token: ctx.tokens.sa, body: { confirm: true, reference: 'NEFT-3', amount: 100, date: '2026-11-03' },
  });
  assert.equal(blocked.status, 409);
  const summary = await call('GET', '/api/admin/partner-summary', { token: ctx.tokens.sa });
  assert.equal(summary.body.earnedCommission, 200);
  assert.equal(summary.body.unpaidCommission, 0);
});
