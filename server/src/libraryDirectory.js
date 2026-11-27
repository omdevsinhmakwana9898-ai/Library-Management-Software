/**
 * Super Admin library directory and one-library details.
 * Read-only aggregation over Library, User, software plans and student counts.
 * Last active is the latest user lastLoginAt — never plan expiry.
 */
import { Library, User, models } from './models.js';
import { SoftwarePlan } from './plans.js';
import { effectiveStatus } from './subscriptionAccess.js';

const ACTIVE = ['Active', 'Expiring Soon'];
const EXPIRING_MS = 14 * 864e5;
const SORTS = new Set(['name', 'city', 'plan', 'expiry', 'lastActive', 'students', 'account']);
const SUBS = new Set(['active', 'trial', 'expiring', 'expired', 'cancelled', 'none']);

const labels = {
  trial: 'Trial',
  active: 'Active',
  expiring: 'Expiring soon',
  expired: 'Expired',
  cancelled: 'Cancelled',
  none: 'No subscription',
};

export function classifySubscription(lib, now = new Date()) {
  const sub = lib?.subscription || null;
  const raw = effectiveStatus(sub, now);
  const expiryDate = !sub ? null : ((sub.status === 'trialing' || raw === 'trialing')
    ? (sub.trialEndsAt || sub.currentPeriodEnd || null)
    : (sub.currentPeriodEnd || null));
  const expiryMs = expiryDate ? new Date(expiryDate).getTime() : null;
  const soon = expiryMs != null && expiryMs >= now.getTime() && expiryMs - now.getTime() <= EXPIRING_MS;
  let bucket = 'none';
  if (raw === 'cancelled') bucket = 'cancelled';
  else if (raw === 'expired' || raw === 'past_due' || raw === 'pending_payment' || raw === 'awaiting_payment') bucket = 'expired';
  else if (raw === 'trialing' || raw === 'active') bucket = soon ? 'expiring' : (raw === 'trialing' ? 'trial' : 'active');
  else if (sub?.status) bucket = 'expired';
  const trial = (bucket === 'trial' || bucket === 'expiring') && (raw === 'trialing' || sub?.status === 'trialing');
  return { bucket, label: labels[bucket] || bucket, expiry: expiryDate || null, trial, raw: raw || null };
}

async function studentCounts(ids) {
  if (!ids.length) return {};
  const rows = await models.students.aggregate([
    { $match: { tenantId: { $in: ids } } },
    { $group: { _id: '$tenantId', total: { $sum: 1 }, active: { $sum: { $cond: [{ $in: ['$status', ACTIVE] }, 1, 0] } } } },
  ]);
  return Object.fromEntries(rows.map(r => [r._id, { total: r.total, active: r.active }]));
}

function ownerOf(users) {
  return users.find(u => u.role === 'client_admin') || null;
}

function toRow(lib, users, counts, planNames, extras, now) {
  const owner = ownerOf(users);
  const sub = classifySubscription(lib, now);
  const planId = lib.planId || lib.subscription?.planId || null;
  const partner = extras?.partner || null;
  return {
    libraryId: lib.libraryId,
    name: lib.name,
    city: lib.city || null,
    phone: lib.phone || null,
    contactEmail: lib.contactEmail || null,
    owner: owner ? { name: owner.name || '', email: owner.email || null, mobile: owner.mobile || null } : null,
    mobile: owner?.mobile || lib.phone || null,
    email: owner?.email || lib.contactEmail || null,
    planId,
    planName: planId ? (planNames[planId] || planId) : null,
    expiry: sub.expiry,
    subscriptionStatus: sub.bucket,
    subscriptionLabel: sub.label,
    subscriptionRaw: sub.raw,
    trial: sub.trial,
    accountStatus: lib.status === 'Active' ? 'Enabled' : 'Disabled',
    status: lib.status,
    studentsActive: counts?.active || 0,
    studentsTotal: counts?.total || 0,
    lastActiveAt: null,
    partner: partner ? { id: partner.id, name: partner.name, kind: partner.kind } : null,
    assignedPartner: partner?.name || null,
    deletionRequested: Boolean(lib.deletionRequest),
    createdAt: lib.createdAt || null,
  };
}

function cmp(a, b, sort, dir) {
  const sign = dir === 'desc' ? -1 : 1;
  const str = (v) => String(v || '').toLowerCase();
  const time = (v) => (v ? new Date(v).getTime() : null);
  let d = 0;
  if (sort === 'city') d = str(a.city).localeCompare(str(b.city));
  else if (sort === 'plan') d = str(a.planName).localeCompare(str(b.planName));
  else if (sort === 'expiry') d = (time(a.expiry) ?? Infinity) - (time(b.expiry) ?? Infinity);
  else if (sort === 'lastActive') d = (time(a.lastActiveAt) ?? -Infinity) - (time(b.lastActiveAt) ?? -Infinity);
  else if (sort === 'students') d = a.studentsActive - b.studentsActive || a.studentsTotal - b.studentsTotal;
  else if (sort === 'account') d = str(a.accountStatus).localeCompare(str(b.accountStatus));
  else d = str(a.name).localeCompare(str(b.name));
  if (d === 0) d = str(a.libraryId).localeCompare(str(b.libraryId));
  return d * sign;
}

function matchesActivity(row, activity, now) {
  if (!activity) return true;
  const ts = row.lastActiveAt ? new Date(row.lastActiveAt).getTime() : null;
  if (activity === 'never') return ts == null;
  if (activity === 'inactive') return ts == null || now - ts > 30 * 864e5;
  const days = activity === '7d' ? 7 : activity === '30d' ? 30 : activity === '90d' ? 90 : null;
  if (!days) return true;
  return ts != null && now - ts <= days * 864e5;
}

function matchesExpiry(row, expiry, now) {
  if (!expiry) return true;
  const ts = row.expiry ? new Date(row.expiry).getTime() : null;
  if (expiry === 'none') return ts == null;
  if (expiry === 'expired') return ts != null && ts < now;
  const days = expiry === '7d' ? 7 : expiry === '30d' ? 30 : expiry === '90d' ? 90 : null;
  if (!days) return true;
  return ts != null && ts >= now && ts - now <= days * 864e5;
}

async function loadContext(loadExtras, now) {
  const libs = await Library.find().sort({ createdAt: 1 }).lean();
  const ids = libs.map(l => l.libraryId);
  const [users, counts, plans, extras] = await Promise.all([
    User.find({ role: { $ne: 'superadmin' }, tenantId: { $in: ids } }).select('tenantId role email name mobile status lastLoginAt').lean(),
    studentCounts(ids),
    SoftwarePlan.find().select('planId name').lean(),
    loadExtras ? loadExtras(ids) : {},
  ]);
  const byTenant = {};
  const lastActive = {};
  for (const u of users) {
    (byTenant[u.tenantId] ||= []).push(u);
    if (u.lastLoginAt && (!lastActive[u.tenantId] || u.lastLoginAt > lastActive[u.tenantId])) lastActive[u.tenantId] = u.lastLoginAt;
  }
  const planNames = Object.fromEntries(plans.map(p => [p.planId, p.name]));
  const rows = libs.map(l => {
    const row = toRow(l, byTenant[l.libraryId] || [], counts[l.libraryId], planNames, extras[l.libraryId], now);
    row.lastActiveAt = lastActive[l.libraryId] || null;
    row._search = [
      l.name, l.libraryId, l.city, l.phone, l.contactEmail,
      ...(byTenant[l.libraryId] || []).flatMap(u => [u.name, u.email, u.mobile]),
    ].filter(Boolean).join(' ').toLowerCase();
    return row;
  });
  return { rows };
}

export async function libraryDirectory(query = {}, { loadExtras, now = new Date() } = {}) {
  const { rows } = await loadContext(loadExtras, now);
  const q = String(query.q || '').trim().toLowerCase();
  const city = String(query.city || '').trim().toLowerCase();
  const plan = String(query.plan || query.planId || '').trim();
  const subscription = SUBS.has(query.subscription) ? query.subscription : '';
  const account = query.account === 'enabled' || query.account === 'disabled' ? query.account : '';
  const activity = ['7d', '30d', '90d', 'never', 'inactive'].includes(query.activity) ? query.activity : '';
  const expiry = ['7d', '30d', '90d', 'expired', 'none'].includes(query.expiry) ? query.expiry : '';
  const sort = SORTS.has(query.sort) ? query.sort : 'name';
  const dir = query.dir === 'desc' ? 'desc' : 'asc';
  const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize, 10) || 25));
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const nowMs = now.getTime();
  const cities = [...new Set(rows.map(r => r.city).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const plans = [];
  const seenPlan = new Set();
  for (const r of rows) {
    if (r.planId && !seenPlan.has(r.planId)) { seenPlan.add(r.planId); plans.push({ planId: r.planId, name: r.planName || r.planId }); }
  }
  plans.sort((a, b) => a.name.localeCompare(b.name));
  let filtered = rows.filter(r => {
    if (q && !r._search.includes(q)) return false;
    if (city && (r.city || '').toLowerCase() !== city) return false;
    if (plan && r.planId !== plan) return false;
    if (subscription && r.subscriptionStatus !== subscription) return false;
    if (account === 'enabled' && r.accountStatus !== 'Enabled') return false;
    if (account === 'disabled' && r.accountStatus !== 'Disabled') return false;
    if (!matchesActivity(r, activity, nowMs)) return false;
    if (!matchesExpiry(r, expiry, nowMs)) return false;
    return true;
  });
  filtered.sort((a, b) => cmp(a, b, sort, dir));
  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const items = filtered.slice(start, start + pageSize).map(({ _search, ...row }) => row);
  return {
    page, pageSize, total, pages: Math.max(1, Math.ceil(total / pageSize)),
    sort, dir,
    filters: { q: query.q || '', city: query.city || '', plan, subscription, account, activity, expiry },
    cities, plans, items,
  };
}

export async function libraryDetails(libraryId, { loadExtras, now = new Date() } = {}) {
  const id = String(libraryId || '');
  const { rows } = await loadContext(loadExtras, now);
  const row = rows.find(r => r.libraryId === id);
  if (!row) return null;
  const { _search, ...library } = row;
  return { library, asOf: now.toISOString() };
}
