/**
 * Phase 2 §12: Super Admin view of library wallets.
 * Adjustments go through creditWallet / debitWallet (source admin_adjustment).
 * Invoices, top-ups, and provider payment rows are not updated here.
 */
import express from 'express';
import { Library } from './models.js';
import { Wallet, WalletLedger, WalletHold } from './commerce.js';
import { audit } from './audit.js';
import { requireRole } from './auth.js';
import { endExclusiveYmd, presetRange, startOfZonedDay } from './businessCollections.js';
import {
  availableMinor, creditWallet, debitWallet, previewWalletDebit, walletSnapshot,
} from './wallet.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const err = (status, message, code) => Object.assign(new Error(message), { status, ...(code ? { code } : {}) });
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export const WALLET_PERIOD_PRESETS = ['all_time', 'last_7_days', 'this_month', 'last_month', 'last_2_months', 'last_3_months', 'last_6_months', 'last_1_year', 'last_3_years', 'custom'];
const ACTIVITIES = new Set(['topup', 'admin_adjustment', 'wallet_payment']);
const BALANCES = new Set(['available', 'none']);
const MAX_MINOR = 1_000_000_000;

export function resolveWalletPeriod(query) {
  const preset = String(query.preset || query.period || 'all_time');
  if (!WALLET_PERIOD_PRESETS.includes(preset)) throw err(400, 'Unknown period');
  if (preset === 'all_time') return { preset, from: null, to: null };
  if (preset === 'custom') {
    const from = String(query.from || '');
    const to = String(query.to || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw err(400, 'Custom period needs from and to dates');
    return { preset, from, to };
  }
  const span = presetRange(preset);
  if (!span?.from) throw err(400, 'Unknown period');
  return { preset, from: span.from, to: span.to };
}

export function ledgerTitle(entry) {
  const source = String(entry?.source || '');
  const kind = String(entry?.kind || '');
  if (source === 'admin_adjustment' && kind === 'credit') return 'Added by Super Admin';
  if (source === 'admin_adjustment' && kind === 'debit') return 'Deducted by Super Admin';
  if (source === 'topup') return 'Paid online';
  if (source === 'wallet_payment') return 'Used on an invoice';
  if (source === 'referral') return 'Referral reward';
  if (source === 'wallet_expiry' || kind === 'expire') return 'Promotional credit expired';
  if (source === 'wallet_hold' || kind === 'hold') return 'Reserved for a payment';
  if (source === 'wallet_release' || kind === 'release') return 'Reservation released';
  if (kind === 'credit') return 'Credit added';
  if (kind === 'debit') return 'Credit used';
  return 'Wallet update';
}

export function bucketLabel(bucket) {
  if (bucket === 'cash') return 'Paid credit';
  if (bucket === 'bonus') return 'Promotional credit';
  return null;
}

export function presentWallet(w) {
  const cashMinor = Number(w?.cashMinor || 0);
  const bonusMinor = Number(w?.bonusMinor || 0);
  const heldCashMinor = Number(w?.heldCashMinor || 0);
  const heldBonusMinor = Number(w?.heldBonusMinor || 0);
  return {
    currency: w?.currency || 'INR',
    cashMinor,
    bonusMinor,
    heldCashMinor,
    heldBonusMinor,
    availableMinor: availableMinor({ cashMinor, bonusMinor, heldCashMinor, heldBonusMinor }),
    createdAt: w?.createdAt || null,
    updatedAt: w?.updatedAt || null,
  };
}

export function presentEntry(entry) {
  const kind = String(entry?.kind || '');
  const direction = kind === 'debit' || kind === 'expire' ? 'out' : kind === 'credit' ? 'in' : 'note';
  const group = kind === 'credit' ? 'added' : (kind === 'debit' || kind === 'expire' ? 'used' : 'other');
  return {
    id: entry.entryId,
    libraryId: entry.tenantId,
    title: ledgerTitle(entry),
    group,
    direction,
    bucket: entry.bucket || null,
    bucketLabel: bucketLabel(entry.bucket),
    amountMinor: Number(entry.amountMinor || 0),
    reason: entry.reason || '',
    createdAt: entry.createdAt || null,
    expiresAt: entry.expiresAt || null,
    expiredAt: entry.expiredAt || null,
    cashAfterMinor: Number(entry.cashAfterMinor || 0),
    bonusAfterMinor: Number(entry.bonusAfterMinor || 0),
    invoiceId: entry.invoiceId || null,
    topupId: entry.topupId || null,
    holdId: entry.holdId || null,
    actorEmail: entry.meta?.actorEmail || null,
  };
}

function parseRupees(value) {
  const raw = String(value ?? '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) throw err(400, 'Enter an amount in rupees, up to 2 decimal places');
  const [whole, frac = ''] = raw.split('.');
  const minor = Number(whole) * 100 + Number((frac + '00').slice(0, 2));
  if (!(minor > 0) || minor > MAX_MINOR) throw err(400, 'Amount must be between ₹0.01 and ₹10,000,000');
  return minor;
}

function readAdjustment(body, { requireConfirm }) {
  const direction = body?.direction === 'debit' ? 'debit' : body?.direction === 'credit' ? 'credit' : null;
  if (!direction) throw err(400, 'Choose add or deduct');
  const amountMinor = parseRupees(body?.amount);
  const reason = String(body?.reason || '').trim();
  if (reason.length < 3 || reason.length > 300) throw err(400, 'A reason is required');
  let bucket = null;
  if (direction === 'credit') {
    if (!['cash', 'bonus'].includes(body?.bucket)) throw err(400, 'Choose paid credit or promotional credit');
    bucket = body.bucket;
  } else if (body?.bucket) {
    throw err(400, 'A deduction follows the wallet spending order and cannot pick paid or promotional credit');
  }
  if (requireConfirm && body?.confirm !== true) throw err(400, 'Confirm the change before it is applied', 'confirm_adjustment');
  return { direction, amountMinor, reason, bucket };
}

function clientKey(req) {
  const key = String(req.get('Idempotency-Key') || '').trim();
  if (!/^[\w.:-]{8,200}$/.test(key)) throw err(400, 'A valid Idempotency-Key header is required', 'idempotency_key');
  return key;
}

function periodMatch(period) {
  if (!period.from) return null;
  return { $gte: startOfZonedDay(period.from), $lt: endExclusiveYmd(period.to) };
}

async function libraryOr404(libraryId) {
  const library = await Library.findOne({ libraryId }).select('libraryId name status createdAt').lean();
  if (!library) throw err(404, 'Library not found');
  return library;
}

function presentLibrary(library) {
  return { libraryId: library.libraryId, name: library.name, status: library.status || 'Active', createdAt: library.createdAt || null };
}

async function creditPreview(libraryId, amountMinor, bucket) {
  const wallet = await Wallet.findOne({ tenantId: libraryId }).lean();
  const before = presentWallet(wallet);
  const cashChangeMinor = bucket === 'cash' ? amountMinor : 0;
  const bonusChangeMinor = bucket === 'bonus' ? amountMinor : 0;
  const after = presentWallet({
    ...before,
    cashMinor: before.cashMinor + cashChangeMinor,
    bonusMinor: before.bonusMinor + bonusChangeMinor,
    createdAt: before.createdAt,
    updatedAt: before.updatedAt,
  });
  return { canApply: true, code: null, cashChangeMinor, bonusChangeMinor, before, after };
}

function rangePayload(period) {
  return { preset: period.preset, from: period.from, to: period.to };
}

export function createWalletAdminRouter() {
  const r = express.Router();
  r.use(requireRole('superadmin'));

  r.get('/wallets', wrap(async (req, res) => {
    const period = resolveWalletPeriod(req.query);
    const q = String(req.query.q || '').trim();
    const libraryId = String(req.query.libraryId || '').trim();
    const status = String(req.query.status || '').trim();
    const balance = String(req.query.balance || '').trim();
    const activity = String(req.query.activity || '').trim();
    if (status && !['Active', 'Disabled'].includes(status)) throw err(400, 'Unknown library status');
    if (balance && !BALANCES.has(balance)) throw err(400, 'Unknown balance filter');
    if (activity && !ACTIVITIES.has(activity)) throw err(400, 'Unknown activity filter');
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 25));

    const libs = await Library.find().select('libraryId name status createdAt').sort({ name: 1 }).lean();
    const options = libs.map(presentLibrary);
    let rows = libs;
    if (q) {
      const re = new RegExp(escapeRe(q), 'i');
      rows = rows.filter(l => re.test(l.name) || re.test(l.libraryId));
    }
    if (libraryId) rows = rows.filter(l => l.libraryId === libraryId);
    if (status) rows = rows.filter(l => (l.status || 'Active') === status);
    const ids = rows.map(l => l.libraryId);
    const wallets = ids.length ? await Wallet.find({ tenantId: { $in: ids } }).lean() : [];
    const byWallet = Object.fromEntries(wallets.map(w => [w.tenantId, w]));
    if (period.from || activity) {
      const match = { tenantId: { $in: ids } };
      const createdAt = periodMatch(period);
      if (createdAt) match.createdAt = createdAt;
      if (activity) match.source = activity;
      const activeIds = new Set(ids.length ? await WalletLedger.distinct('tenantId', match) : []);
      rows = rows.filter(l => activeIds.has(l.libraryId));
    }
    if (balance === 'available') rows = rows.filter(l => availableMinor(byWallet[l.libraryId]) > 0);
    if (balance === 'none') rows = rows.filter(l => availableMinor(byWallet[l.libraryId]) <= 0);

    const summary = rows.reduce((acc, l) => {
      const w = presentWallet(byWallet[l.libraryId]);
      acc.libraries += 1;
      acc.availableMinor += w.availableMinor;
      acc.cashMinor += w.cashMinor;
      acc.bonusMinor += w.bonusMinor;
      return acc;
    }, { libraries: 0, availableMinor: 0, cashMinor: 0, bonusMinor: 0, currency: 'INR' });
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / limit) || 1);
    const items = rows.slice((page - 1) * limit, page * limit).map(l => ({
      ...presentLibrary(l),
      wallet: presentWallet(byWallet[l.libraryId]),
    }));
    res.json({ items, total, page, pages, limit, summary, options, range: rangePayload(period) });
  }));

  r.get('/wallets/:libraryId', wrap(async (req, res) => {
    const library = await libraryOr404(req.params.libraryId);
    const period = resolveWalletPeriod(req.query);
    const activity = String(req.query.activity || '').trim();
    if (activity && !ACTIVITIES.has(activity)) throw err(400, 'Unknown activity filter');
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
    const wallet = presentWallet(await walletSnapshot(library.libraryId));
    const match = { tenantId: library.libraryId };
    const createdAt = periodMatch(period);
    if (createdAt) match.createdAt = createdAt;
    if (activity) match.source = activity;
    const total = await WalletLedger.countDocuments(match);
    const docs = await WalletLedger.find(match).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean();
    const latest = await WalletLedger.findOne({ tenantId: library.libraryId }).sort({ createdAt: -1 }).select('createdAt').lean();
    res.json({
      library: presentLibrary(library),
      wallet,
      latestAt: latest?.createdAt || null,
      entries: docs.map(presentEntry),
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit) || 1),
      range: rangePayload(period),
    });
  }));

  r.get('/wallets/:libraryId/entries/:entryId', wrap(async (req, res) => {
    const library = await libraryOr404(req.params.libraryId);
    const entry = await WalletLedger.findOne({ tenantId: library.libraryId, entryId: req.params.entryId }).lean();
    if (!entry) throw err(404, 'Wallet entry not found');
    res.json({ library: presentLibrary(library), entry: presentEntry(entry), wallet: presentWallet(await Wallet.findOne({ tenantId: library.libraryId }).lean()) });
  }));

  r.post('/wallets/:libraryId/adjustments/preview', wrap(async (req, res) => {
    const library = await libraryOr404(req.params.libraryId);
    const change = readAdjustment(req.body, { requireConfirm: false });
    const planned = change.direction === 'credit'
      ? await creditPreview(library.libraryId, change.amountMinor, change.bucket)
      : await previewWalletDebit({ tenantId: library.libraryId, amountMinor: change.amountMinor }).then(p => ({
        canApply: p.ok,
        code: p.ok ? null : 'insufficient_wallet',
        cashChangeMinor: -(p.cashMinor || 0),
        bonusChangeMinor: -(p.bonusMinor || 0),
        before: presentWallet(p.before),
        after: presentWallet(p.after),
      }));
    res.json({
      applied: false,
      library: presentLibrary(library),
      direction: change.direction,
      bucket: change.bucket,
      bucketLabel: bucketLabel(change.bucket),
      amountMinor: change.amountMinor,
      reason: change.reason,
      canApply: planned.canApply,
      code: planned.code,
      spendOrder: change.direction === 'debit' ? 'Promotional credit is used first, then paid credit.' : null,
      cashChangeMinor: planned.cashChangeMinor,
      bonusChangeMinor: planned.bonusChangeMinor,
      before: planned.before,
      after: planned.after,
    });
  }));

  r.post('/wallets/:libraryId/adjustments', wrap(async (req, res) => {
    const library = await libraryOr404(req.params.libraryId);
    const change = readAdjustment(req.body, { requireConfirm: true });
    const key = clientKey(req);
    const idempotencyKey = `admin-${change.direction}:${library.libraryId}:${key}`;
    let replay = false;
    let entries = [];
    const sameCredit = (row) => row
      && row.tenantId === library.libraryId
      && row.amountMinor === change.amountMinor
      && row.bucket === change.bucket
      && row.kind === 'credit'
      && row.reason === change.reason
      && row.source === 'admin_adjustment';
    if (change.direction === 'credit') {
      const existing = await WalletLedger.findOne({ idempotencyKey }).lean();
      if (existing) {
        if (!sameCredit(existing)) throw err(409, 'This request was already used for a different change', 'idempotency_conflict');
        replay = true;
        entries = [existing];
      } else {
        const created = await creditWallet({
          tenantId: library.libraryId,
          amountMinor: change.amountMinor,
          bucket: change.bucket,
          reason: change.reason,
          source: 'admin_adjustment',
          idempotencyKey,
          meta: { actorEmail: req.user?.email || null, adjustment: 'admin' },
        });
        const row = created?.toObject ? created.toObject() : created;
        if (!sameCredit(row)) throw err(409, 'This request was already used for a different change', 'idempotency_conflict');
        entries = [row];
      }
    } else {
      const prior = await WalletHold.findOne({ idempotencyKey }).lean();
      if (prior && (prior.tenantId !== library.libraryId || prior.amountMinor !== change.amountMinor || prior.purpose !== change.reason)) {
        throw err(409, 'This request was already used for a different change', 'idempotency_conflict');
      }
      const result = await debitWallet({
        tenantId: library.libraryId,
        amountMinor: change.amountMinor,
        reason: change.reason,
        source: 'admin_adjustment',
        idempotencyKey,
      });
      replay = Boolean(result?.already);
      const holdId = result?.hold?.holdId;
      entries = holdId
        ? await WalletLedger.find({ tenantId: library.libraryId, holdId, kind: 'debit' }).sort({ createdAt: 1 }).lean()
        : [];
    }
    const wallet = presentWallet(await walletSnapshot(library.libraryId));
    await audit(req, 'wallet.admin_adjustment', {
      tenantId: library.libraryId,
      target: library.libraryId,
      reason: change.reason,
      detail: {
        direction: change.direction,
        bucket: change.bucket,
        amountMinor: change.amountMinor,
        replay,
        entryIds: entries.map(e => e.entryId),
        availableMinor: wallet.availableMinor,
      },
    });
    res.status(replay ? 200 : 201).json({
      ok: true,
      applied: true,
      replay,
      direction: change.direction,
      bucket: change.bucket,
      amountMinor: change.amountMinor,
      library: presentLibrary(library),
      wallet,
      entries: entries.map(presentEntry),
    });
  }));

  return r;
}
