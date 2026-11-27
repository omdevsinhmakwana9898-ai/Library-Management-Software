/**
 * Super Admin software-business collections (Phase 2 §1–§2).
 *
 * Collected cash is gateway money on verified paid software invoices only:
 * SoftwareInvoice status `paid`, kind `subscription` or `upgrade`, amount =
 * invoiceFinancials().gatewayMinor (new cash). Wallet top-ups (`kind: 'topup'`
 * and WalletTopup) are gross receipts, never software collection, and the
 * wallet portion of a later subscription is not collected again.
 *
 * Student fee payments are not read. Open, settling, void, past_due and
 * requires_recovery invoices are not collected. There is no software-refund
 * model; the refunds bucket is reported as 0.
 *
 * Calendar bounds use APP_TIMEZONE, default Asia/Kolkata.
 */
import express from 'express';
import { Library, User } from './models.js';
import { SoftwareInvoice } from './payments/invoices.js';
import { invoiceFinancials } from './payments/settlement.js';
import { SoftwarePlan } from './plans.js';
import { WalletTopup } from './commerce.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export const COLLECTION_TZ = process.env.APP_TIMEZONE || 'Asia/Kolkata';
export const COLLECTION_PRESETS = [
  'last_7_days', 'this_month', 'last_month', 'last_2_months', 'last_3_months',
  'last_6_months', 'last_1_year', 'last_3_years', 'all_time', 'custom',
];

const COLLECTED_KINDS = new Set(['subscription', 'upgrade']);
const PENDING_STATUSES = new Set(['open', 'settling']);
const INR = 'INR';

const pad = (n) => String(n).padStart(2, '0');
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));

export function zonedYmd(date = new Date(), tz = COLLECTION_TZ) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

export function zonedMonth(date = new Date(), tz = COLLECTION_TZ) {
  return zonedYmd(date, tz).slice(0, 7);
}

export function addCalendarDays(ymd, delta) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addCalendarMonths(ym, delta) {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}`;
}

export function monthEndYmd(ym) {
  const [y, m] = ym.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m, 0));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function startOfZonedDay(ymd, tz = COLLECTION_TZ) {
  const [y, m, d] = ymd.split('-').map(Number);
  const utcGuess = new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  const parts = Object.fromEntries(fmt.formatToParts(utcGuess).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
  const hour = parts.hour === '24' ? 0 : Number(parts.hour);
  const asIfUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute), Number(parts.second));
  return new Date(utcGuess.getTime() - (asIfUtc - utcGuess.getTime()));
}

export function endExclusiveYmd(ymd, tz = COLLECTION_TZ) {
  return startOfZonedDay(addCalendarDays(ymd, 1), tz);
}

export function inZonedRange(date, from, to, tz = COLLECTION_TZ) {
  if (!date) return false;
  const ymd = zonedYmd(new Date(date), tz);
  if (from && ymd < from) return false;
  if (to && ymd > to) return false;
  return true;
}

export function presetRange(preset, now = new Date(), tz = COLLECTION_TZ) {
  const today = zonedYmd(now, tz);
  const month = today.slice(0, 7);
  switch (preset) {
    case 'last_7_days': return { from: addCalendarDays(today, -6), to: today };
    case 'this_month': return { from: `${month}-01`, to: monthEndYmd(month) };
    case 'last_month': {
      const prev = addCalendarMonths(month, -1);
      return { from: `${prev}-01`, to: monthEndYmd(prev) };
    }
    case 'last_2_months': return { from: `${addCalendarMonths(month, -1)}-01`, to: monthEndYmd(month) };
    case 'last_3_months': return { from: `${addCalendarMonths(month, -2)}-01`, to: monthEndYmd(month) };
    case 'last_6_months': return { from: `${addCalendarMonths(month, -5)}-01`, to: monthEndYmd(month) };
    case 'last_1_year': return { from: `${addCalendarMonths(month, -11)}-01`, to: monthEndYmd(month) };
    case 'last_3_years': return { from: `${addCalendarMonths(month, -35)}-01`, to: monthEndYmd(month) };
    case 'all_time': return { from: null, to: null };
    case 'custom': return { from: null, to: null };
    default: return null;
  }
}

function monthsCovering(from, to) {
  if (!from || !to) return null;
  const out = [];
  let m = from.slice(0, 7);
  const end = to.slice(0, 7);
  while (m <= end && out.length < 600) {
    out.push(m);
    m = addCalendarMonths(m, 1);
  }
  return out;
}

function bad(message) {
  const e = new Error(message);
  e.status = 400;
  return e;
}

/** Gateway cash that counts as software collection. Zero when the invoice is not verified paid software cash. */
export function collectedGatewayMinor(inv) {
  if (!inv || inv.status !== 'paid') return 0;
  const kind = inv.kind || 'subscription';
  if (!COLLECTED_KINDS.has(kind)) return 0;
  if ((inv.currency || INR) !== INR) return 0;
  const cash = invoiceFinancials(inv).gatewayMinor;
  return cash > 0 ? cash : 0;
}

function eventAt(doc) {
  if (doc.status === 'paid' && doc.paidAt) return new Date(doc.paidAt);
  if (doc.status === 'paid') return new Date(doc.updatedAt || doc.createdAt);
  return new Date(doc.createdAt || doc.updatedAt);
}

function rupees(minor) {
  return Math.round(Number(minor) || 0) / 100;
}

export function softwareRefundSupport() {
  return {
    recorded: false,
    model: null,
    minor: 0,
    count: 0,
    note: 'No software refund records exist. Refunds are shown as 0 and are not treated as collected cash. Student fee refunds are not included.',
  };
}

function topupMatchesInvoice(topup, inv) {
  if (!topup || !inv) return false;
  if (topup.invoiceId && topup.invoiceId === inv.invoiceId) return true;
  if (inv.topupId && inv.topupId === topup.topupId) return true;
  return false;
}

async function directoryFor(tenantIds) {
  const ids = [...new Set(tenantIds.filter(Boolean))];
  const [libs, owners] = await Promise.all([
    Library.find(ids.length ? { libraryId: { $in: ids } } : { libraryId: { $in: [] } }).select('libraryId name city planId status').lean(),
    User.find({ role: 'client_admin', ...(ids.length ? { tenantId: { $in: ids } } : { tenantId: { $in: [] } }) }).select('tenantId name email').lean(),
  ]);
  const libBy = Object.fromEntries(libs.map(l => [l.libraryId, l]));
  const ownerBy = {};
  for (const u of owners) if (!ownerBy[u.tenantId]) ownerBy[u.tenantId] = u;
  return { libBy, ownerBy };
}

function invoiceRow(inv, { libBy, ownerBy }, { topupMinor = 0, projected = false } = {}) {
  const fin = invoiceFinancials(inv);
  const lib = libBy[inv.tenantId];
  const owner = ownerBy[inv.tenantId];
  const kind = inv.kind || 'subscription';
  const cash = collectedGatewayMinor(inv);
  const paid = inv.status === 'paid';
  const pending = kind !== 'topup' && PENDING_STATUSES.has(inv.status);
  let bucket = 'excluded';
  if (kind === 'topup' && paid) bucket = 'wallet_topup';
  else if (cash > 0) bucket = 'collection';
  else if (pending) bucket = projected ? 'projected' : 'pending';
  const receiptPath = paid ? `/admin/software-plan/invoices/${encodeURIComponent(inv.invoiceId)}/receipt` : null;
  const receiptUrl = receiptPath ? `/api${receiptPath}` : null;
  return {
    recordId: inv.invoiceId,
    source: 'invoice',
    invoiceId: inv.invoiceId,
    topupId: inv.topupId || null,
    kind,
    status: inv.status,
    bucket,
    projected: Boolean(projected),
    projectedLabel: projected ? 'Projected / scheduled only. Not collected cash.' : null,
    provider: inv.provider || (fin.gatewayMinor === 0 && fin.walletMinor > 0 ? 'wallet' : null),
    providerRef: inv.providerRef || null,
    providerPaymentRef: inv.providerPaymentRef || null,
    providerOrderRef: inv.providerOrderRef || null,
    receiptNo: inv.receiptNo || null,
    receiptPath,
    receiptUrl,
    receiptDeliveryStatus: inv.receiptDelivery?.status || null,
    verificationState: paid ? 'verified_paid' : inv.status,
    currency: inv.currency || INR,
    totalMinor: fin.totalMinor,
    walletMinor: fin.walletMinor,
    gatewayMinor: fin.gatewayMinor,
    collectedMinor: cash,
    topupMinor: kind === 'topup' && paid ? (topupMinor || fin.gatewayMinor || fin.totalMinor) : 0,
    pendingMinor: pending ? fin.gatewayMinor : 0,
    libraryId: inv.tenantId,
    libraryName: lib?.name || null,
    ownerName: owner?.name || null,
    ownerEmail: owner?.email || null,
    paidAt: inv.paidAt || null,
    createdAt: inv.createdAt || null,
    dueAt: inv.dueAt || null,
    eventAt: eventAt(inv),
  };
}

function topupRow(topup, { libBy, ownerBy }) {
  const lib = libBy[topup.tenantId];
  const owner = ownerBy[topup.tenantId];
  const paid = topup.status === 'paid';
  const amount = Math.round(Number(topup.amountMinor) || 0);
  return {
    recordId: topup.topupId,
    source: 'wallet_topup',
    invoiceId: topup.invoiceId || null,
    topupId: topup.topupId,
    kind: 'topup',
    status: topup.status,
    bucket: paid ? 'wallet_topup' : 'excluded',
    projected: false,
    projectedLabel: null,
    provider: topup.provider || null,
    providerRef: topup.providerRef || null,
    providerPaymentRef: null,
    providerOrderRef: null,
    receiptNo: null,
    receiptUrl: null,
    receiptDeliveryStatus: null,
    verificationState: paid ? 'verified_paid' : topup.status,
    currency: topup.currency || INR,
    totalMinor: amount,
    walletMinor: 0,
    gatewayMinor: amount,
    collectedMinor: 0,
    topupMinor: paid ? amount : 0,
    pendingMinor: 0,
    libraryId: topup.tenantId,
    libraryName: lib?.name || null,
    ownerEmail: owner?.email || null,
    ownerName: owner?.name || null,
    paidAt: topup.paidAt || null,
    createdAt: topup.createdAt || null,
    dueAt: null,
    eventAt: eventAt(topup),
  };
}

function searchBlob(row) {
  return [row.libraryName, row.ownerName, row.ownerEmail, row.invoiceId, row.topupId, row.recordId, row.receiptNo, row.providerRef, row.providerPaymentRef, row.providerOrderRef]
    .filter(Boolean).join(' ').toLowerCase();
}

function applyListFilters(rows, { q, kind, status, provider }) {
  const query = String(q || '').trim().toLowerCase();
  return rows.filter(row => {
    if (kind && row.kind !== kind) return false;
    if (status && row.status !== status) return false;
    if (provider && String(row.provider || '').toLowerCase() !== String(provider).toLowerCase()) return false;
    if (query && !searchBlob(row).includes(query)) return false;
    return true;
  });
}

async function paidSoftwareInRange(from, to, tz) {
  const allTime = !from && !to;
  let query = { status: 'paid', kind: { $ne: 'topup' } };
  if (!allTime) {
    const start = startOfZonedDay(from, tz);
    const end = endExclusiveYmd(to, tz);
    const padStart = new Date(start.getTime() - 2 * 864e5);
    const padEnd = new Date(end.getTime() + 2 * 864e5);
    query = {
      ...query,
      $or: [
        { paidAt: { $gte: padStart, $lt: padEnd } },
        { paidAt: null, updatedAt: { $gte: padStart, $lt: padEnd } },
      ],
    };
  }
  const rows = await SoftwareInvoice.find(query).lean();
  return rows.filter(inv => inZonedRange(eventAt(inv), from, to, tz));
}

export async function currentMonthSoftwareCollection(now = new Date(), tz = COLLECTION_TZ) {
  const month = zonedMonth(now, tz);
  const from = `${month}-01`;
  const to = monthEndYmd(month);
  const rows = await paidSoftwareInRange(from, to, tz);
  let collectedMinor = 0;
  let paymentCount = 0;
  let walletOnlyPaymentCount = 0;
  for (const inv of rows) {
    const cash = collectedGatewayMinor(inv);
    if (cash > 0) { collectedMinor += cash; paymentCount += 1; }
    else if (inv.status === 'paid' && COLLECTED_KINDS.has(inv.kind || 'subscription')) walletOnlyPaymentCount += 1;
  }
  return {
    label: 'This Month Software Collection',
    month, from, to, timezone: tz, currency: INR,
    collectedMinor, collected: rupees(collectedMinor), paymentCount, walletOnlyPaymentCount,
  };
}

async function monthlyBuckets(from, to, now, tz) {
  const monthNow = zonedMonth(now, tz);
  const rows = await paidSoftwareInRange(from, to, tz);
  const by = new Map();
  for (const inv of rows) {
    const cash = collectedGatewayMinor(inv);
    if (!(cash > 0)) continue;
    const m = zonedMonth(eventAt(inv), tz);
    const cur = by.get(m) || { month: m, collectedMinor: 0, paymentCount: 0 };
    cur.collectedMinor += cash;
    cur.paymentCount += 1;
    by.set(m, cur);
  }
  const span = monthsCovering(from, to);
  const keys = span || [...new Set([...by.keys(), monthNow])].sort();
  return keys.map(month => {
    const row = by.get(month) || { month, collectedMinor: 0, paymentCount: 0 };
    return { ...row, collected: rupees(row.collectedMinor), current: month === monthNow };
  });
}

export async function businessDashboard(now = new Date()) {
  const tz = COLLECTION_TZ;
  const month = zonedMonth(now, tz);
  const from12 = `${addCalendarMonths(month, -11)}-01`;
  const to = monthEndYmd(month);
  const [thisMonth, libs, plans, monthlyCollections] = await Promise.all([
    currentMonthSoftwareCollection(now, tz),
    Library.find().select('libraryId city status planId').lean(),
    SoftwarePlan.find().select('planId name active').sort({ sortOrder: 1, name: 1 }).lean(),
    monthlyBuckets(from12, to, now, tz),
  ]);
  const planCounts = new Map(plans.map(p => [p.planId, { planId: p.planId, name: p.name, libraries: 0 }]));
  const unknown = new Map();
  let noPlan = 0;
  for (const lib of libs) {
    if (!lib.planId) { noPlan += 1; continue; }
    if (planCounts.has(lib.planId)) planCounts.get(lib.planId).libraries += 1;
    else unknown.set(lib.planId, (unknown.get(lib.planId) || 0) + 1);
  }
  const popularPlans = [...planCounts.values(), ...[...unknown.entries()].map(([planId, libraries]) => ({ planId, name: `Unknown plan (${planId})`, libraries }))]
    .sort((a, b) => b.libraries - a.libraries || a.name.localeCompare(b.name));
  if (noPlan > 0) popularPlans.push({ planId: null, name: 'No plan', libraries: noPlan });
  const cityMap = new Map();
  for (const lib of libs) {
    if (lib.status !== 'Active') continue;
    const city = String(lib.city || '').trim() || 'Unknown';
    cityMap.set(city, (cityMap.get(city) || 0) + 1);
  }
  const cities = [...cityMap.entries()].map(([city, libraries]) => ({ city, libraries }))
    .sort((a, b) => b.libraries - a.libraries || a.city.localeCompare(b.city));
  return {
    timezone: tz,
    currency: INR,
    definition: 'Verified paid My Library OS software subscription and upgrade invoices. The amount is new gateway cash (gatewayMinor). Wallet top-ups, wallet spend on a later invoice, unpaid or unverified invoices, and student fee payments are excluded.',
    thisMonth,
    charts: { popularPlans, cities, monthlyCollections },
  };
}

function resolveRange(query, now, tz) {
  const preset = String(query.preset || 'this_month');
  if (!COLLECTION_PRESETS.includes(preset)) throw bad('Unknown date preset');
  if (preset === 'custom') {
    const from = String(query.from || '');
    const to = String(query.to || '');
    if (!isYmd(from) || !isYmd(to) || from > to) throw bad('Custom range needs from and to as YYYY-MM-DD, with from on or before to');
    return { preset, from, to };
  }
  const span = presetRange(preset, now, tz);
  return { preset, from: span.from, to: span.to };
}

export async function collectionDetails(query = {}, now = new Date()) {
  const tz = COLLECTION_TZ;
  const { preset, from, to } = resolveRange(query, now, tz);
  const allTime = !from && !to;
  let invoiceQuery = {};
  let topupQuery = {};
  if (!allTime) {
    const start = startOfZonedDay(from, tz);
    const end = endExclusiveYmd(to, tz);
    const padStart = new Date(start.getTime() - 2 * 864e5);
    const padEnd = new Date(end.getTime() + 2 * 864e5);
    const window = { $gte: padStart, $lt: padEnd };
    invoiceQuery = { $or: [{ paidAt: window }, { createdAt: window }, { dueAt: window }] };
    topupQuery = { $or: [{ paidAt: window }, { createdAt: window }] };
  }
  const nextMonth = addCalendarMonths(zonedMonth(now, tz), 1);
  const projectedStart = startOfZonedDay(`${nextMonth}-01`, tz);
  const projectedEnd = endExclusiveYmd(monthEndYmd(nextMonth), tz);
  const [invoices, topups, projectedInvoices] = await Promise.all([
    SoftwareInvoice.find(invoiceQuery).lean(),
    WalletTopup.find(topupQuery).lean(),
    SoftwareInvoice.find({
      status: { $in: ['open', 'settling'] },
      kind: { $ne: 'topup' },
      dueAt: { $gte: projectedStart, $lt: projectedEnd },
    }).lean(),
  ]);
  const inRangeInv = invoices.filter(inv => inZonedRange(eventAt(inv), from, to, tz));
  const inRangeTop = topups.filter(t => inZonedRange(eventAt(t), from, to, tz));
  const projectedIds = new Set(projectedInvoices.map(inv => inv.invoiceId));
  const tenantIds = [
    ...inRangeInv.map(i => i.tenantId),
    ...inRangeTop.map(t => t.tenantId),
    ...projectedInvoices.map(i => i.tenantId),
  ];
  const dir = await directoryFor(tenantIds);
  const linkedTopups = new Set();
  const rows = [];
  let collectedMinor = 0;
  let paymentCount = 0;
  let pendingMinor = 0;
  let pendingCount = 0;
  let walletTopupsMinor = 0;
  let walletTopupCount = 0;
  const monthNow = zonedMonth(now, tz);
  const monthTotals = new Map();

  for (const inv of inRangeInv) {
    const linked = inRangeTop.find(t => topupMatchesInvoice(t, inv));
    if (linked) linkedTopups.add(linked.topupId);
    const projected = projectedIds.has(inv.invoiceId);
    const row = invoiceRow(inv, dir, {
      topupMinor: linked ? Math.round(Number(linked.amountMinor) || 0) : 0,
      projected,
    });
    rows.push(row);
    if (row.collectedMinor > 0) {
      collectedMinor += row.collectedMinor;
      paymentCount += 1;
      const m = zonedMonth(row.eventAt, tz);
      const cur = monthTotals.get(m) || { month: m, collectedMinor: 0, paymentCount: 0 };
      cur.collectedMinor += row.collectedMinor;
      cur.paymentCount += 1;
      monthTotals.set(m, cur);
    } else if (PENDING_STATUSES.has(inv.status) && (inv.kind || 'subscription') !== 'topup') {
      pendingCount += 1;
      pendingMinor += invoiceFinancials(inv).gatewayMinor;
    }
    if (inv.kind === 'topup' && inv.status === 'paid') {
      const fromTopup = linked && linked.status === 'paid' ? Math.round(Number(linked.amountMinor) || 0) : 0;
      const fin = invoiceFinancials(inv);
      const amount = fromTopup || fin.gatewayMinor || fin.totalMinor;
      if (amount > 0) { walletTopupsMinor += amount; walletTopupCount += 1; }
    }
  }
  for (const topup of inRangeTop) {
    if (linkedTopups.has(topup.topupId)) continue;
    if (inRangeInv.some(inv => topupMatchesInvoice(topup, inv))) continue;
    const row = topupRow(topup, dir);
    rows.push(row);
    if (topup.status === 'paid') {
      walletTopupsMinor += row.topupMinor;
      walletTopupCount += 1;
    }
  }

  let projectedMinor = 0;
  const scheduled = [];
  for (const inv of projectedInvoices) {
    if ((inv.currency || INR) !== INR) continue;
    const fin = invoiceFinancials(inv);
    projectedMinor += fin.gatewayMinor;
    if (!rows.some(r => r.invoiceId === inv.invoiceId)) scheduled.push(invoiceRow(inv, dir, { projected: true }));
  }
  const refunds = softwareRefundSupport();
  const span = monthsCovering(from, to);
  const monthKeys = span || [...new Set([...monthTotals.keys(), monthNow])].sort();
  const monthly = monthKeys.map(m => {
    const row = monthTotals.get(m) || { month: m, collectedMinor: 0, paymentCount: 0 };
    return { ...row, collected: rupees(row.collectedMinor), current: m === monthNow };
  });
  const priorMinor = monthly.filter(m => !m.current).reduce((s, m) => s + m.collectedMinor, 0);
  const currentMinor = monthly.filter(m => m.current).reduce((s, m) => s + m.collectedMinor, 0);
  const providers = [...new Set(rows.map(r => r.provider).filter(Boolean))].sort();
  const list = applyListFilters(rows, query)
    .sort((a, b) => new Date(b.eventAt) - new Date(a.eventAt))
    .slice(0, 500);
  return {
    timezone: tz,
    currency: INR,
    preset,
    range: { from, to },
    definition: 'Verified software collection is gateway cash on paid subscription and upgrade invoices. It is not student fee collection, not a wallet top-up, and not wallet credit spent later.',
    labels: {
      verifiedCollections: 'Verified software collection: gateway cash on paid subscription and upgrade invoices.',
      paymentCount: 'Count of those verified cash collections.',
      pending: 'Open or settling software invoices. Not collected cash.',
      walletTopups: 'Paid wallet top-ups are gross receipts. They are not software collection and are not counted again when the wallet is spent.',
      refunds: refunds.note,
      grossReceipts: 'Gross receipts = verified software collection + paid wallet top-ups.',
      netCollection: 'Net software collection = verified software collection − recorded software refunds.',
      projected: 'Next-month open invoices are projected/scheduled only and are never collected cash.',
    },
    totals: {
      verifiedCollectionsMinor: collectedMinor,
      verifiedCollections: rupees(collectedMinor),
      paymentCount,
      pendingMinor,
      pending: rupees(pendingMinor),
      pendingCount,
      walletTopupsMinor,
      walletTopups: rupees(walletTopupsMinor),
      walletTopupCount,
      refundsMinor: refunds.minor,
      refunds: rupees(refunds.minor),
      refundCount: refunds.count,
      refundsRecorded: refunds.recorded,
      refundsNote: refunds.note,
      grossReceiptsMinor: collectedMinor + walletTopupsMinor,
      grossReceipts: rupees(collectedMinor + walletTopupsMinor),
      netCollectionMinor: collectedMinor - refunds.minor,
      netCollection: rupees(collectedMinor - refunds.minor),
      currency: INR,
    },
    projected: {
      month: nextMonth,
      minor: projectedMinor,
      amount: rupees(projectedMinor),
      count: projectedInvoices.length,
      label: 'Projected / scheduled only. Not collected cash.',
      items: scheduled.sort((a, b) => new Date(a.dueAt || 0) - new Date(b.dueAt || 0)).slice(0, 100),
    },
    comparison: {
      currentMonth: monthNow,
      currentMonthMinor: currentMinor,
      priorMonthsMinor: priorMinor,
      note: 'Current month is compared with earlier months inside the selected range. Neither figure includes pending, wallet top-ups, or projected amounts.',
    },
    monthly,
    totalsScope: 'date-range',
    listScope: 'date-range plus search, type, status, and provider filters',
    facets: {
      kinds: ['subscription', 'upgrade', 'topup'],
      statuses: ['open', 'settling', 'paid', 'void', 'past_due', 'requires_recovery', 'pending', 'failed', 'cancelled'],
      providers,
    },
    transactions: list,
    truncated: applyListFilters(rows, query).length > list.length,
  };
}

export async function collectionRecord(recordId) {
  const id = String(recordId || '');
  const inv = await SoftwareInvoice.findOne({ invoiceId: id }).lean();
  if (inv) {
    const dir = await directoryFor([inv.tenantId]);
    const topup = await WalletTopup.findOne({ $or: [{ invoiceId: inv.invoiceId }, { topupId: inv.topupId || '__none__' }] }).lean();
    const nextMonth = addCalendarMonths(zonedMonth(new Date()), 1);
    const projected = (inv.kind || 'subscription') !== 'topup'
      && PENDING_STATUSES.has(inv.status)
      && inv.dueAt
      && zonedMonth(inv.dueAt) === nextMonth;
    return invoiceRow(inv, dir, { topupMinor: topup && topup.status === 'paid' ? Math.round(Number(topup.amountMinor) || 0) : 0, projected });
  }
  const topup = await WalletTopup.findOne({ topupId: id }).lean();
  if (!topup) return null;
  const dir = await directoryFor([topup.tenantId]);
  return topupRow(topup, dir);
}

export function createBusinessDashboardRouter() {
  const r = express.Router();
  r.get('/business-dashboard', wrap(async (_req, res) => res.json(await businessDashboard())));
  r.get('/collections', wrap(async (req, res) => res.json(await collectionDetails(req.query))));
  r.get('/collections/:recordId', wrap(async (req, res) => {
    const row = await collectionRecord(req.params.recordId);
    if (!row) return res.status(404).json({ error: 'Record not found' });
    res.json(row);
  }));
  return r;
}
