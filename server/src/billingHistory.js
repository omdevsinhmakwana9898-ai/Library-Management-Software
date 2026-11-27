/**
 * Super Admin software billing history search (Phase 2 §9).
 *
 * Rows are SoftwareInvoice records only — the same invoices Collection Details
 * and the owner receipt list already use. Wallet top-ups appear here when they
 * were stored as kind `topup` invoices. They are not copied from WalletLedger.
 *
 * Status labels on the page map onto invoice statuses. There is no software
 * refund model, so the Refunded filter matches nothing.
 */
import { Library, User } from './models.js';
import { SoftwareInvoice } from './payments/invoices.js';
import { invoiceView } from './softwarePlan.js';
import {
  COLLECTION_TZ,
  addCalendarDays,
  endExclusiveYmd,
  presetRange,
  startOfZonedDay,
  zonedYmd,
} from './businessCollections.js';

export const BILLING_PRESETS = [
  'today', 'last_2_days', 'last_7_days', 'this_month', 'last_month',
  'last_2_months', 'last_3_months', 'last_6_months', 'last_1_year', 'all_time', 'custom',
];

/** UI label → invoice statuses. Refunded has none. Void is only in the unfiltered list. */
export const BILLING_STATUS_MAP = {
  paid: { label: 'Paid', invoiceStatuses: ['paid'], collected: true },
  open: { label: 'Open', invoiceStatuses: ['open'], collected: false },
  pending: {
    label: 'Pending',
    invoiceStatuses: ['settling'],
    collected: false,
    note: 'Settling invoices are still in progress and are not collected money.',
  },
  failed: {
    label: 'Failed',
    invoiceStatuses: ['requires_recovery'],
    collected: false,
    note: 'There is no invoice status named failed. This filter is requires_recovery.',
  },
  expired: {
    label: 'Expired',
    invoiceStatuses: ['past_due'],
    collected: false,
    note: 'There is no invoice status named expired. This filter is past_due.',
  },
  refunded: {
    label: 'Refunded',
    invoiceStatuses: [],
    collected: false,
    note: 'No software refund model exists. Collection Details reports refunds as 0. This filter returns no rows.',
  },
};

const KINDS = new Set(['subscription', 'upgrade', 'topup']);
const PROVIDERS = new Set(['razorpay', 'paypal', 'wallet', 'none']);
const DELIVERIES = new Set(['not_attempted', 'pending', 'sending', 'sent', 'logged', 'failed', 'skipped']);
const YMD = /^\d{4}-\d{2}-\d{2}$/;

const bad = (message) => Object.assign(new Error(message), { status: 400 });
const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function billingPresetRange(preset, { from, to, now = new Date() } = {}) {
  const name = preset || 'all_time';
  if (!BILLING_PRESETS.includes(name)) throw bad('Unknown date preset');
  if (name === 'all_time') return { from: null, to: null, preset: name };
  if (name === 'today') {
    const today = zonedYmd(now);
    return { from: today, to: today, preset: name };
  }
  if (name === 'last_2_days') {
    const today = zonedYmd(now);
    return { from: addCalendarDays(today, -1), to: today, preset: name };
  }
  if (name === 'custom') {
    if (!YMD.test(String(from || '')) || !YMD.test(String(to || ''))) throw bad('Custom range needs from and to dates (YYYY-MM-DD)');
    if (String(from) > String(to)) throw bad('Custom range starts after it ends');
    return { from: String(from), to: String(to), preset: name };
  }
  const range = presetRange(name, now);
  if (!range) throw bad('Unknown date preset');
  return { ...range, preset: name };
}

export function billingGroup(inv) {
  if (inv?.kind === 'topup' && (inv.status === 'open' || inv.status === 'settling')) return 'open_wallet_topup';
  if (inv?.status === 'paid') return 'paid_receipt';
  return 'not_collected';
}

function collectedCopy(inv) {
  if (inv.status !== 'paid') {
    return { collected: false, collectedNote: 'Open, pending, failed, expired, and void invoices are not collected money.' };
  }
  if (inv.kind === 'topup') {
    return { collected: true, collectedNote: 'Paid wallet top-up receipt. It is a gross receipt, not software collection, and it is not counted again when the wallet is spent.' };
  }
  return { collected: true, collectedNote: 'Paid software invoice. Only status paid is collected money.' };
}

async function directory(tenantIds) {
  const ids = [...new Set(tenantIds.filter(Boolean))];
  if (!ids.length) return { libs: {}, owners: {} };
  const [libs, owners] = await Promise.all([
    Library.find({ libraryId: { $in: ids } }).select('libraryId name contactEmail phone').lean(),
    User.find({ role: 'client_admin', $or: [{ tenantId: { $in: ids } }, { libraryId: { $in: ids } }] })
      .select('tenantId libraryId name email mobile').lean(),
  ]);
  const libBy = Object.fromEntries(libs.map(l => [l.libraryId, l]));
  const ownerBy = {};
  for (const u of owners) {
    const id = u.tenantId || u.libraryId;
    if (id && !ownerBy[id]) ownerBy[id] = u;
  }
  return { libs: libBy, owners: ownerBy };
}

function present(inv, lib, owner) {
  const view = invoiceView(inv, lib, '/api/admin/software-plan');
  const money = collectedCopy(inv);
  return {
    ...view,
    ownerName: owner?.name || null,
    ownerEmail: owner?.email || lib?.contactEmail || null,
    ownerPhone: owner?.mobile || lib?.phone || null,
    group: billingGroup(inv),
    collected: money.collected,
    collectedNote: money.collectedNote,
    resendEligible: inv.status === 'paid',
    walletLedger: {
      superAdminPage: false,
      note: 'Wallet ledger entries are not copied here. The library owner Wallet page is the ledger. Collection Details is the business-collections view of this same invoice.',
    },
  };
}

async function tenantIdsForSearch(q) {
  const rx = new RegExp(esc(q), 'i');
  const [libs, users] = await Promise.all([
    Library.find({ $or: [{ name: rx }, { libraryId: rx }, { contactEmail: rx }, { phone: rx }] }).select('libraryId').lean(),
    User.find({ role: 'client_admin', $or: [{ name: rx }, { email: rx }, { mobile: rx }] }).select('tenantId libraryId').lean(),
  ]);
  return [...new Set([
    ...libs.map(l => l.libraryId),
    ...users.map(u => u.tenantId || u.libraryId),
  ].filter(Boolean))];
}

export async function searchBillingHistory(query = {}) {
  const range = billingPresetRange(query.preset || 'all_time', { from: query.from, to: query.to });
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const limit = Math.min(100, Math.max(1, Math.floor(Number(query.limit) || 25)));
  const and = [];
  if (range.from) and.push({ createdAt: { $gte: startOfZonedDay(range.from), $lt: endExclusiveYmd(range.to) } });

  const statusKey = String(query.status || '').trim();
  if (statusKey) {
    const mapped = BILLING_STATUS_MAP[statusKey];
    if (!mapped) throw bad('Unknown status filter');
    and.push({ status: { $in: mapped.invoiceStatuses } });
  }
  const kind = String(query.kind || '').trim();
  if (kind) {
    if (!KINDS.has(kind)) throw bad('Unknown transaction type');
    and.push({ kind });
  }
  const provider = String(query.provider || '').trim().toLowerCase();
  if (provider) {
    if (!PROVIDERS.has(provider)) throw bad('Unknown payment provider');
    if (provider === 'wallet') {
      and.push({ $or: [
        { provider: 'wallet' },
        { provider: { $in: [null, ''] }, walletMinor: { $gt: 0 }, gatewayMinor: { $lte: 0 } },
      ] });
    } else if (provider === 'none') {
      and.push({ provider: { $in: [null, ''] }, $or: [{ walletMinor: { $in: [null, 0] } }, { gatewayMinor: { $gt: 0 } }] });
    } else {
      and.push({ provider });
    }
  }
  const delivery = String(query.delivery || '').trim();
  if (delivery) {
    if (!DELIVERIES.has(delivery)) throw bad('Unknown receipt delivery status');
    if (delivery === 'not_attempted') {
      and.push({ $or: [
        { receiptDelivery: null },
        { receiptDelivery: { $exists: false } },
        { 'receiptDelivery.status': { $in: [null, ''] } },
      ] });
    } else {
      and.push({ 'receiptDelivery.status': delivery });
    }
  }
  const q = String(query.q || '').trim();
  if (q) {
    const rx = new RegExp(esc(q), 'i');
    const tenants = await tenantIdsForSearch(q);
    const ors = [
      { invoiceId: rx }, { receiptNo: rx }, { providerRef: rx }, { providerOrderRef: rx },
      { providerPaymentRef: rx }, { paymentReceivedRef: rx }, { tenantId: rx },
    ];
    if (tenants.length) ors.push({ tenantId: { $in: tenants } });
    and.push({ $or: ors });
  }
  const filter = and.length ? { $and: and } : {};
  const [total, rows, grouped] = await Promise.all([
    SoftwareInvoice.countDocuments(filter),
    SoftwareInvoice.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    SoftwareInvoice.aggregate([
      { $match: filter },
      { $group: { _id: { status: '$status', kind: '$kind' }, n: { $sum: 1 } } },
    ]),
  ]);
  let openWalletTopups = 0;
  let paidReceipts = 0;
  let notCollected = 0;
  for (const g of grouped) {
    const n = g.n || 0;
    const fake = { status: g._id?.status, kind: g._id?.kind };
    const bucket = billingGroup(fake);
    if (bucket === 'open_wallet_topup') openWalletTopups += n;
    else if (bucket === 'paid_receipt') paidReceipts += n;
    else notCollected += n;
  }
  const { libs, owners } = await directory(rows.map(r => r.tenantId));
  return {
    items: rows.map(inv => present(inv, libs[inv.tenantId], owners[inv.tenantId])),
    page,
    limit,
    total,
    pages: Math.max(1, Math.ceil(total / limit)),
    range: { preset: range.preset, from: range.from, to: range.to, timezone: COLLECTION_TZ },
    statusMap: BILLING_STATUS_MAP,
    totals: { matched: total, openWalletTopups, paidReceipts, notCollected },
    notes: {
      collected: 'Only status paid is collected money. Open and settling (pending) are not.',
      refunds: BILLING_STATUS_MAP.refunded.note,
      wallet: 'Open wallet top-ups stay in their own group. This list does not duplicate the wallet ledger.',
      export: 'CSV export and richer delivery-failure diagnostics are waiting on owner confirmation and are not included.',
    },
  };
}

export async function getBillingRecord(invoiceId) {
  const inv = await SoftwareInvoice.findOne({ invoiceId: String(invoiceId) }).lean();
  if (!inv) return null;
  const { libs, owners } = await directory([inv.tenantId]);
  return present(inv, libs[inv.tenantId], owners[inv.tenantId]);
}
