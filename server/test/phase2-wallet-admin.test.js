// Phase 2 §12: Super Admin library wallets. Adjustments use the existing ledger.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, call, ctx } from './helpers.js';
import { Wallet, WalletLedger, WalletTopup } from '../src/commerce.js';
import { SoftwareInvoice } from '../src/payments/invoices.js';
import { AuditLog } from '../src/audit.js';
import { presetRange } from '../src/businessCollections.js';
import { WALLET_PERIOD_PRESETS, ledgerTitle } from '../src/walletAdmin.js';

const headers = (key) => ({ headers: { 'Idempotency-Key': key } });

before(async () => { await setup('phase2wallets'); });
after(teardown);

test('library wallet admin is super admin only', async () => {
  const paths = [
    ['GET', '/api/admin/wallets'],
    ['GET', '/api/admin/wallets/lib-a'],
    ['GET', '/api/admin/wallets/lib-a/entries/missing'],
  ];
  for (const [method, path] of paths) {
    assert.equal((await call(method, path)).status, 401, path);
    assert.equal((await call(method, path, { token: ctx.tokens.a })).status, 403, path);
  }
  const preview = await call('POST', '/api/admin/wallets/lib-a/adjustments/preview', { token: ctx.tokens.a, body: { direction: 'credit', amount: '10', bucket: 'cash', reason: 'owner attempt' } });
  assert.equal(preview.status, 403);
  const write = await call('POST', '/api/admin/wallets/lib-a/adjustments', { token: ctx.tokens.a, body: { confirm: true, direction: 'credit', amount: '10', bucket: 'cash', reason: 'owner attempt' }, ...headers('owner-key-1') });
  assert.equal(write.status, 403);
  assert.equal(await WalletLedger.countDocuments({ tenantId: 'lib-a', source: 'admin_adjustment' }), 0);
});

test('search lists every library wallet without creating a balance', async () => {
  const invoices = await SoftwareInvoice.countDocuments();
  const topups = await WalletTopup.countDocuments();
  const beforeWallets = await Wallet.countDocuments({ tenantId: 'lib-a' });
  const page = await call('GET', '/api/admin/wallets?page=1&limit=1', { token: ctx.tokens.sa });
  assert.equal(page.status, 200, JSON.stringify(page.body));
  assert.equal(page.body.items.length, 1);
  assert.equal(page.body.total, 2);
  assert.equal(page.body.pages, 2);
  assert.equal(page.body.items[0].name, 'Library A');
  assert.equal(page.body.items[0].wallet.availableMinor, 0);
  assert.equal(page.body.summary.libraries, 2);
  const next = await call('GET', '/api/admin/wallets?page=2&limit=1', { token: ctx.tokens.sa });
  assert.equal(next.body.items[0].name, 'Library B');
  const byName = await call('GET', '/api/admin/wallets?q=Library%20B', { token: ctx.tokens.sa });
  assert.deepEqual(byName.body.items.map(row => row.libraryId), ['lib-b']);
  const none = await call('GET', '/api/admin/wallets?balance=available', { token: ctx.tokens.sa });
  assert.equal(none.body.total, 0);
  const disabled = await call('GET', '/api/admin/wallets?status=Disabled', { token: ctx.tokens.sa });
  assert.equal(disabled.body.total, 0);
  assert.equal((await call('GET', '/api/admin/wallets?preset=nope', { token: ctx.tokens.sa })).status, 400);
  assert.ok(WALLET_PERIOD_PRESETS.includes('last_3_years'));
  const years = await call('GET', '/api/admin/wallets?preset=last_3_years', { token: ctx.tokens.sa });
  assert.equal(years.body.range.from, presetRange('last_3_years').from);
  assert.equal(await Wallet.countDocuments({ tenantId: 'lib-a' }), beforeWallets);
  assert.equal(await SoftwareInvoice.countDocuments(), invoices);
  assert.equal(await WalletTopup.countDocuments(), topups);
});

test('preview does not apply, and confirm credits through the ledger', async () => {
  const invoices = await SoftwareInvoice.countDocuments();
  const topups = await WalletTopup.countDocuments();
  const missing = await call('POST', '/api/admin/wallets/lib-a/adjustments/preview', {
    token: ctx.tokens.sa, body: { direction: 'credit', amount: '25.50', bucket: 'cash' },
  });
  assert.equal(missing.status, 400);
  const preview = await call('POST', '/api/admin/wallets/lib-a/adjustments/preview', {
    token: ctx.tokens.sa, body: { direction: 'credit', amount: '25.50', bucket: 'cash', reason: 'Goodwill credit' },
  });
  assert.equal(preview.status, 200, JSON.stringify(preview.body));
  assert.equal(preview.body.applied, false);
  assert.equal(preview.body.canApply, true);
  assert.equal(preview.body.amountMinor, 2550);
  assert.equal(preview.body.after.availableMinor, 2550);
  assert.equal(preview.body.after.cashMinor, 2550);
  assert.equal(await WalletLedger.countDocuments({ tenantId: 'lib-a' }), 0);

  const unconfirmed = await call('POST', '/api/admin/wallets/lib-a/adjustments', {
    token: ctx.tokens.sa, body: { direction: 'credit', amount: '25.50', bucket: 'cash', reason: 'Goodwill credit' }, ...headers('credit-key-1'),
  });
  assert.equal(unconfirmed.status, 400);
  assert.equal(unconfirmed.body.code, 'confirm_adjustment');
  const noKey = await call('POST', '/api/admin/wallets/lib-a/adjustments', {
    token: ctx.tokens.sa, body: { confirm: true, direction: 'credit', amount: '25.50', bucket: 'cash', reason: 'Goodwill credit' },
  });
  assert.equal(noKey.status, 400);
  assert.equal(noKey.body.code, 'idempotency_key');

  const applied = await call('POST', '/api/admin/wallets/lib-a/adjustments', {
    token: ctx.tokens.sa,
    body: { confirm: true, direction: 'credit', amount: '25.50', bucket: 'cash', reason: 'Goodwill credit' },
    ...headers('credit-key-1'),
  });
  assert.equal(applied.status, 201, JSON.stringify(applied.body));
  assert.equal(applied.body.replay, false);
  assert.equal(applied.body.wallet.availableMinor, 2550);
  assert.equal(applied.body.wallet.cashMinor, 2550);
  assert.equal(applied.body.entries.length, 1);
  assert.equal(applied.body.entries[0].title, 'Added by Super Admin');
  assert.equal(ledgerTitle({ source: 'admin_adjustment', kind: 'credit' }), 'Added by Super Admin');
  const row = await WalletLedger.findOne({ tenantId: 'lib-a', source: 'admin_adjustment' }).lean();
  assert.equal(row.kind, 'credit');
  assert.equal(row.bucket, 'cash');
  assert.equal(row.amountMinor, 2550);
  assert.equal(row.reason, 'Goodwill credit');
  assert.equal(row.invoiceId || null, null);
  assert.equal(row.topupId || null, null);

  const replay = await call('POST', '/api/admin/wallets/lib-a/adjustments', {
    token: ctx.tokens.sa,
    body: { confirm: true, direction: 'credit', amount: '25.50', bucket: 'cash', reason: 'Goodwill credit' },
    ...headers('credit-key-1'),
  });
  assert.equal(replay.status, 200, JSON.stringify(replay.body));
  assert.equal(replay.body.replay, true);
  assert.equal(replay.body.wallet.availableMinor, 2550);
  assert.equal(await WalletLedger.countDocuments({ idempotencyKey: 'admin-credit:lib-a:credit-key-1' }), 1);

  const clash = await call('POST', '/api/admin/wallets/lib-a/adjustments', {
    token: ctx.tokens.sa,
    body: { confirm: true, direction: 'credit', amount: '10.00', bucket: 'cash', reason: 'Goodwill credit' },
    ...headers('credit-key-1'),
  });
  assert.equal(clash.status, 409);
  assert.equal(clash.body.code, 'idempotency_conflict');
  assert.equal((await call('GET', '/api/admin/wallets/lib-a', { token: ctx.tokens.sa })).body.wallet.availableMinor, 2550);
  assert.equal(await AuditLog.countDocuments({ action: 'wallet.admin_adjustment', tenantId: 'lib-a' }), 2);
  assert.equal(await SoftwareInvoice.countDocuments(), invoices);
  assert.equal(await WalletTopup.countDocuments(), topups);
});

test('bonus credit can expire and a deduct spends promotional credit first', async () => {
  const bonus = await call('POST', '/api/admin/wallets/lib-b/adjustments', {
    token: ctx.tokens.sa,
    body: { confirm: true, direction: 'credit', amount: '100.00', bucket: 'bonus', reason: 'Launch promotional credit' },
    ...headers('bonus-key-1'),
  });
  assert.equal(bonus.status, 201, JSON.stringify(bonus.body));
  assert.equal(bonus.body.wallet.bonusMinor, 10000);
  assert.ok(bonus.body.entries[0].expiresAt);
  const cash = await call('POST', '/api/admin/wallets/lib-b/adjustments', {
    token: ctx.tokens.sa,
    body: { confirm: true, direction: 'credit', amount: '200.00', bucket: 'cash', reason: 'Opening paid credit' },
    ...headers('cash-key-1'),
  });
  assert.equal(cash.status, 201, JSON.stringify(cash.body));
  assert.equal(cash.body.wallet.cashMinor, 20000);
  assert.equal(cash.body.wallet.availableMinor, 30000);

  const picked = await call('POST', '/api/admin/wallets/lib-b/adjustments/preview', {
    token: ctx.tokens.sa, body: { direction: 'debit', amount: '150.00', bucket: 'bonus', reason: 'Should not pick a bucket' },
  });
  assert.equal(picked.status, 400);

  const tooMuch = await call('POST', '/api/admin/wallets/lib-b/adjustments/preview', {
    token: ctx.tokens.sa, body: { direction: 'debit', amount: '500.00', reason: 'Too much to deduct' },
  });
  assert.equal(tooMuch.status, 200, JSON.stringify(tooMuch.body));
  assert.equal(tooMuch.body.applied, false);
  assert.equal(tooMuch.body.canApply, false);
  assert.equal(tooMuch.body.code, 'insufficient_wallet');
  const rejected = await call('POST', '/api/admin/wallets/lib-b/adjustments', {
    token: ctx.tokens.sa,
    body: { confirm: true, direction: 'debit', amount: '500.00', reason: 'Too much to deduct' },
    ...headers('debit-too-much'),
  });
  assert.equal(rejected.status, 409);
  assert.equal(rejected.body.code, 'insufficient_wallet');
  assert.equal((await call('GET', '/api/admin/wallets/lib-b', { token: ctx.tokens.sa })).body.wallet.availableMinor, 30000);

  const preview = await call('POST', '/api/admin/wallets/lib-b/adjustments/preview', {
    token: ctx.tokens.sa, body: { direction: 'debit', amount: '150.00', reason: 'Correct a duplicate credit' },
  });
  assert.equal(preview.body.canApply, true);
  assert.equal(preview.body.after.bonusMinor, 0);
  assert.equal(preview.body.after.cashMinor, 15000);
  assert.equal(preview.body.after.availableMinor, 15000);
  assert.match(preview.body.spendOrder, /Promotional credit is used first/);
  assert.equal(await WalletLedger.countDocuments({ tenantId: 'lib-b', kind: 'debit' }), 0);

  const debited = await call('POST', '/api/admin/wallets/lib-b/adjustments', {
    token: ctx.tokens.sa,
    body: { confirm: true, direction: 'debit', amount: '150.00', reason: 'Correct a duplicate credit' },
    ...headers('debit-key-1'),
  });
  assert.equal(debited.status, 201, JSON.stringify(debited.body));
  assert.equal(debited.body.wallet.bonusMinor, 0);
  assert.equal(debited.body.wallet.cashMinor, 15000);
  assert.equal(debited.body.wallet.availableMinor, 15000);
  assert.ok(debited.body.wallet.availableMinor >= 0);
  assert.equal(debited.body.entries.length, 2);
  assert.ok(debited.body.entries.every(entry => entry.title === 'Deducted by Super Admin'));
  const parts = await WalletLedger.find({ tenantId: 'lib-b', source: 'admin_adjustment', kind: 'debit' }).lean();
  assert.equal(parts.find(row => row.bucket === 'bonus').amountMinor, 10000);
  assert.equal(parts.find(row => row.bucket === 'cash').amountMinor, 5000);

  const again = await call('POST', '/api/admin/wallets/lib-b/adjustments', {
    token: ctx.tokens.sa,
    body: { confirm: true, direction: 'debit', amount: '150.00', reason: 'Correct a duplicate credit' },
    ...headers('debit-key-1'),
  });
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(again.body.replay, true);
  assert.equal(again.body.wallet.availableMinor, 15000);

  const detail = await call('GET', '/api/admin/wallets/lib-b', { token: ctx.tokens.sa });
  assert.equal(detail.status, 200);
  assert.ok(detail.body.entries.some(entry => entry.title === 'Added by Super Admin'));
  assert.ok(detail.body.entries.some(entry => entry.title === 'Deducted by Super Admin'));
  const entryId = detail.body.entries.find(entry => entry.title === 'Deducted by Super Admin').id;
  const entry = await call('GET', `/api/admin/wallets/lib-b/entries/${entryId}`, { token: ctx.tokens.sa });
  assert.equal(entry.status, 200, JSON.stringify(entry.body));
  assert.equal(entry.body.entry.title, 'Deducted by Super Admin');
  assert.equal(entry.body.library.name, 'Library B');

  const old = await call('GET', '/api/admin/wallets?preset=custom&from=2019-01-01&to=2019-01-31', { token: ctx.tokens.sa });
  assert.equal(old.body.total, 0);
  const recent = await call('GET', '/api/admin/wallets?preset=this_month&activity=admin_adjustment&balance=available', { token: ctx.tokens.sa });
  assert.ok(recent.body.items.some(row => row.libraryId === 'lib-b'));
  assert.equal(recent.body.items.find(row => row.libraryId === 'lib-b').wallet.availableMinor, 15000);
  const other = await call('GET', '/api/admin/wallets/lib-a/entries/not-on-this-library', { token: ctx.tokens.sa });
  assert.equal(other.status, 404);
  assert.equal(await SoftwareInvoice.countDocuments({ tenantId: 'lib-b' }), 0);
  assert.equal(await WalletTopup.countDocuments({ tenantId: 'lib-b' }), 0);
});
