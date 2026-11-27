/**
 * Staff invitations (expiring one-time links) and password reset by email OTP
 * (spec §2, AUTH-02/AUTH-03), plus the owner-visible audit log (§1).
 * Tokens and OTPs are stored only as SHA-256 hashes and never logged.
 */
import crypto from 'crypto';
import mongoose from 'mongoose';
import express from 'express';
import bcrypt from 'bcryptjs';
import { User, Library, isPlatformRole, models } from './models.js';
import { sanitizeStaffPermissions } from '../../src/utils/staffPermissions.js';
import { hashPassword, validatePassword } from './services.js';
import { sendMail } from './mailer.js';
import { sendMobileMessage, smsConfigured } from './messaging.js';
import { normalizeMobile, isMobile, maskEmail } from './identity.js';
import { notifyPasswordChanged } from './passwordChangedNotice.js';
import { normalizePhone } from './evolution.js';
import { encryptSecret, decryptSecret } from './cryptoSecrets.js';
import { sendSystemWhatsapp, systemWhatsappConfigured, systemWhatsappReady } from './systemWhatsapp.js';
import { throttleHit } from './throttle.js';
import { audit, AuditLog, pubAudit } from './audit.js';
import { requireRole } from './auth.js';
import { checkStaffLimit } from './plans.js';

const sha = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

/** App the invite email and Team Access copy link must open. */
export const DEFAULT_INVITE_APP_ORIGIN = 'https://app.mylibraryos.in';
const MARKETING_HOSTS = new Set(['mylibraryos.in', 'www.mylibraryos.in']);

/**
 * Origin for a staff invite. A local or real app origin (including
 * http://localhost:5173) is kept. Empty, the marketing site, or an API host
 * falls back to the My Library OS app.
 */
export function inviteAppOrigin(env = process.env) {
  const raw = String(env.FRONTEND_URL || env.APP_URL || '').trim();
  if (!raw) return DEFAULT_INVITE_APP_ORIGIN;
  let url;
  try { url = new URL(raw); } catch { return DEFAULT_INVITE_APP_ORIGIN; }
  const host = url.hostname.toLowerCase();
  const path = url.pathname.replace(/\/+$/, '');
  const apiHost = host.startsWith('api.') || host.endsWith('.onrender.com');
  const sameAsApi = [env.RENDER_EXTERNAL_URL, env.WEBHOOK_BASE_URL].some((value) => {
    if (!value) return false;
    try { return new URL(String(value)).origin === url.origin; } catch { return false; }
  });
  if (MARKETING_HOSTS.has(host) || apiHost || sameAsApi || path === '/api') return DEFAULT_INVITE_APP_ORIGIN;
  const basePath = path && path !== '/' ? path : '';
  return `${url.origin}${basePath}`;
}

export function inviteLink(token, env = process.env) {
  return `${inviteAppOrigin(env)}/invite/${encodeURIComponent(token)}`;
}
const INVITE_HOURS = () => Number(process.env.INVITE_EXPIRY_HOURS || 72);
const OTP_MINUTES = () => Number(process.env.OTP_EXPIRY_MINUTES || 10);

const inviteSchema = new mongoose.Schema({
  tenantId: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  // Second hash for a Copy/Share link added to a pending invite that had no
  // usable cipher. The original tokenHash is never replaced. Absent on new invites.
  extraTokenHash: { type: String, unique: true, sparse: true },
  email: { type: String, lowercase: true, trim: true },
  name: String,
  role: { type: String, enum: ['staff', 'client_admin'], default: 'staff' },
  staffId: String, // links to staffMembers.id (holds the owner-assigned permissions)
  permissions: mongoose.Schema.Types.Mixed,
  expiresAt: { type: Date, required: true },
  usedAt: Date, usedBy: String, revokedAt: Date,
  createdBy: String,
  // Encrypted raw token so an owner can copy a link again. Never returned by
  // the list API. New invites store the original token here. Older pending
  // invites have no cipher; the first Copy/Share stores an additional token
  // (extraTokenHash + this cipher) and leaves tokenHash alone.
  tokenCipher: String,
  whatsappStatus: String,
  whatsappReason: String,
  phone: String,
  branchId: String,
  branchIds: [String],
}, { timestamps: true });
export const Invite = mongoose.models.Invite || mongoose.model('Invite', inviteSchema);

const otpSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  codeHash: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  attempts: { type: Number, default: 0 },
  usedAt: Date,
  ip: String,
  channel: { type: String, enum: ['email', 'mobile', 'google'], default: 'email' },
  mobile: String,
}, { timestamps: true });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });
export const PasswordResetOtp = mongoose.models.PasswordResetOtp || mongoose.model('PasswordResetOtp', otpSchema);

const inviteStatus = (i) => i.usedAt ? 'accepted' : i.revokedAt ? 'revoked' : i.expiresAt < new Date() ? 'expired' : 'pending';
const INVITE_CLOSED = {
  accepted: 'This invite was already accepted. Please sign in.',
  expired: 'This invite link has expired.',
  revoked: 'This invite has been revoked.',
  invalid: 'This invite link is invalid, expired or already used.',
};
const closedInvite = (code) => {
  const key = INVITE_CLOSED[code] ? code : 'invalid';
  return { status: 410, error: INVITE_CLOSED[key], code: key };
};
const pubInvite = (i) => ({
  id: String(i._id), email: i.email, name: i.name, role: i.role, staffId: i.staffId,
  expiresAt: i.expiresAt, status: inviteStatus(i), createdAt: i.createdAt,
  whatsappStatus: i.whatsappStatus || null, whatsappReason: i.whatsappReason || null,
  branchId: i.branchId || null, branchIds: Array.isArray(i.branchIds) ? i.branchIds : [],
});

function safeWhatsappReason(reason) {
  return String(reason || '').replace(/https?:\/\/\S+/gi, '[link]').replace(/\s+/g, ' ').trim().slice(0, 160);
}

/** Plain system-WhatsApp text. The link is the same one-time invite URL as the email. */
export function inviteWhatsappText(libraryName, link) {
  const name = String(libraryName || 'a library').replace(/\s+/g, ' ').trim().slice(0, 120) || 'a library';
  return `You have been invited to join ${name} on My Library OS. Open this link to set your password (one-time, expires):\n${link}`;
}

/**
 * Best-effort system WhatsApp for a new staff invite. Never throws.
 * Skips when there is no usable mobile or the Super Admin sender is not ready.
 * Does not use the library's own WhatsApp instance.
 */
export async function deliverInviteWhatsapp({ to, libraryName, link } = {}, deps = {}) {
  const raw = String(to || '').trim();
  if (!raw) return { status: 'skipped', reason: 'no_number' };
  const digits = normalizeMobile(raw);
  const number = normalizePhone(raw);
  if (!number || !isMobile(digits)) return { status: 'skipped', reason: 'invalid_number' };
  const configured = deps.configured != null ? deps.configured : systemWhatsappConfigured();
  if (!configured) return { status: 'skipped', reason: 'not_configured' };
  let ready = false;
  try {
    ready = await (deps.ready || systemWhatsappReady)();
  } catch {
    ready = false;
  }
  if (!ready) return { status: 'skipped', reason: 'not_ready' };
  try {
    const send = deps.send || sendSystemWhatsapp;
    const result = await send({ to: number, text: inviteWhatsappText(libraryName, link) });
    if (result?.sent) return { status: 'sent', reason: null };
    const reason = result?.reason || 'send_failed';
    if (reason === 'not_configured' || reason === 'invalid_number' || reason === 'empty_text') {
      return { status: 'skipped', reason };
    }
    return { status: 'failed', reason: safeWhatsappReason(reason) || 'send_failed' };
  } catch (e) {
    return { status: 'failed', reason: safeWhatsappReason(e?.message) || 'send_failed' };
  }
}

/* Simple in-memory per-key rate limiter (per instance). */
const hits = new Map();
export function rateLimited(key, max, windowMs) {
  const now = Date.now();
  const arr = (hits.get(key) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(key, arr);
  return arr.length > max;
}
export const resetRateLimits = () => hits.clear();

/** Test helper: move in-memory limiter timestamps back so a cooldown can elapse without waiting. */
export function ageRateLimits(ms) {
  const shift = Number(ms) || 0;
  for (const [key, arr] of hits) hits.set(key, arr.map(t => t - shift));
}

/**
 * After Google has proved a googleSub that is already stored on this user,
 * issue a short-lived token so they can set a My Library OS password.
 * The raw token is returned to the caller and stored only as a hash.
 */
export async function issueLinkedGooglePasswordReset(user, ip) {
  const token = crypto.randomBytes(32).toString('base64url');
  await PasswordResetOtp.updateMany({ userId: String(user._id), channel: 'google', usedAt: null }, { $set: { usedAt: new Date() } });
  await PasswordResetOtp.create({
    userId: String(user._id),
    channel: 'google',
    codeHash: sha(token),
    expiresAt: new Date(Date.now() + OTP_MINUTES() * 60e3),
    ip: ip || '',
  });
  await audit(
    { user: { id: String(user._id), email: user.email, role: user.role }, ip },
    'password.reset_requested',
    { tenantId: user.tenantId || null, target: user.email ? mask(user.email) : 'linked-google', detail: { via: 'google' } },
  );
  return token;
}

const mask = (email) => email.replace(/^(.)(.*)(@.*)$/, (_, a, b, c) => a + '*'.repeat(Math.min(b.length, 6)) + c);

/** Match the emailed token or a later Copy/Share token on the same invite. */
function inviteByToken(token) {
  const hash = sha(token);
  return { $or: [{ tokenHash: hash }, { extraTokenHash: hash }] };
}

function cipherMatchesInvite(invite, token) {
  if (!token) return false;
  const hash = sha(token);
  return hash === invite.tokenHash || (!!invite.extraTokenHash && hash === invite.extraTokenHash);
}

/** Public (unauthenticated) routes. */
/**
 * Issue #13: the one place an invite becomes an account (password or Google).
 * Atomic single use; the account is bound to the invited email, library and role.
 * With `google`, the verified Google email must equal the invited email.
 */
export async function acceptInvite({ token, name, passwordHash, google, mobile, ip }) {
  const now = new Date();
  const i = await Invite.findOneAndUpdate({ ...inviteByToken(token), usedAt: null, revokedAt: null, expiresAt: { $gt: now } }, { $set: { usedAt: now } }, { new: true });
  if (!i) {
    const existing = await Invite.findOne(inviteByToken(token)).lean();
    return closedInvite(existing ? inviteStatus(existing) : 'invalid');
  }
  const release = () => Invite.updateOne({ _id: i._id }, { $set: { usedAt: null } });
  if (google && String(google.email).toLowerCase() !== i.email) {
    await release();
    return { status: 403, error: `This invite is for ${i.email}. Sign in to Google with that email.`, code: 'invite_email_mismatch' };
  }
  const lib = await Library.findOne({ libraryId: i.tenantId }).lean();
  if (!lib || lib.status !== 'Active') { await release(); return { status: 403, error: 'Library is disabled', code: 'library_disabled' }; }
  if (i.role === 'staff') {
    try { await checkStaffLimit(i.tenantId, { Invite }); }
    catch (e) { await release(); return { status: e.status || 409, error: e.message, code: e.code || 'staff_limit' }; }
  }
  if (await User.exists({ email: i.email })) {
    await release();
    return { status: 409, error: 'An account with this email already exists. Sign in instead.', code: 'account_exists' };
  }
  const mobileNorm = mobile ? normalizeMobile(mobile) : '';
  if (mobileNorm && !isMobile(mobileNorm)) {
    await release();
    return { status: 400, error: 'Enter a valid mobile number', code: 'invalid_mobile' };
  }
  if (mobileNorm && await User.exists({ mobile: mobileNorm })) {
    await release();
    return { status: 409, error: 'An account with this mobile number already exists. Sign in instead.', code: 'mobile_exists' };
  }
  let user;
  try {
    user = await User.create({
      email: i.email, name: name || i.name || google?.name || '', role: i.role, tenantId: i.tenantId, libraryId: i.tenantId, staffId: i.staffId,
      ...(mobileNorm ? { mobile: mobileNorm } : {}),
      ...(passwordHash ? { passwordHash } : {}),
      ...(google ? { googleSub: google.sub } : {}),
      authProviders: [google ? 'google' : 'password'],
    });
  } catch (e) {
    await release();
    if (e?.code === 11000 && (e.keyPattern?.mobile || e.keyValue?.mobile)) {
      return { status: 409, error: 'An account with this mobile number already exists. Sign in instead.', code: 'mobile_exists' };
    }
    throw e;
  }
  await Invite.updateOne({ _id: i._id }, { $set: { usedBy: String(user._id) } });
  if (i.staffId && (i.branchId || (Array.isArray(i.branchIds) && i.branchIds.length))) {
    const set = {};
    if (i.branchId) set.branchId = String(i.branchId);
    if (Array.isArray(i.branchIds)) set.branchIds = i.branchIds.map(String);
    await models.staffMembers.updateOne(
      { tenantId: i.tenantId, _key: String(i.staffId) },
      { $set: set },
    );
  }
  await audit({ user: { id: String(user._id), email: user.email, role: user.role }, ip }, 'invite.accepted', { tenantId: i.tenantId, target: i.email, detail: { via: google ? 'google' : 'password' } });
  return { user };
}

export function createPublicAccountRouter({ issueSession }) {
  const r = express.Router();

  r.get('/auth/invite/:token', wrap(async (req, res) => {
    const i = await Invite.findOne(inviteByToken(req.params.token)).lean();
    if (!i || inviteStatus(i) !== 'pending') {
      const closed = closedInvite(i ? inviteStatus(i) : 'invalid');
      return res.status(closed.status).json({ error: closed.error, code: closed.code });
    }
    const lib = await Library.findOne({ libraryId: i.tenantId }).lean();
    res.json({ email: i.email, name: i.name, role: i.role, library: lib?.name, expiresAt: i.expiresAt });
  }));

  r.post('/auth/invite/accept', wrap(async (req, res) => {
    const { token, name, password } = req.body || {};
    if (!token) return res.status(400).json({ error: 'token is required' });
    if (!validatePassword(password)) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    const rawMobile = req.body?.mobile;
    let mobile = '';
    if (rawMobile != null && String(rawMobile).trim() !== '') {
      mobile = normalizeMobile(rawMobile);
      if (!isMobile(mobile)) return res.status(400).json({ error: 'Enter a valid mobile number' });
    }
    const r = await acceptInvite({ token, name, mobile, passwordHash: await hashPassword(password), ip: req.ip });
    if (r.error) return res.status(r.status).json({ error: r.error, ...(r.code ? { code: r.code } : {}) });
    return issueSession(r.user, res);
  }));

  // Always answers the same way so it cannot be used to discover accounts.
  r.post('/auth/forgot-password', wrap(async (req, res) => {
    const email = String(req.body?.email || '').toLowerCase().trim();
    const generic = { ok: true, message: 'If this email is registered, a reset code has been sent.' };
    if (!email) return res.status(400).json({ error: 'email is required' });
    if (rateLimited(`ip:${req.ip}`, 10, 15 * 60e3)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
    if (rateLimited(`fp:${email}`, 1, 30e3)) return res.status(429).json({ error: 'Please wait 30 seconds before requesting another code.' });
    if (await throttleHit(`forgot-email:${email}`, 5, 15 * 60e3)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
    const user = await User.findOne({ email }).lean();
    if (!user || user.status !== 'Active') return res.json(generic); // disabled accounts cannot recover
    if (!isPlatformRole(user.role)) {
      const lib = await Library.findOne({ libraryId: user.tenantId || user.libraryId }).lean();
      if (!lib || lib.status !== 'Active') return res.json(generic);
    }
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    await PasswordResetOtp.updateMany({ userId: String(user._id), usedAt: null }, { $set: { usedAt: new Date() } }); // old codes stop working
    await PasswordResetOtp.create({ userId: String(user._id), codeHash: sha(`${user._id}:${code}`), expiresAt: new Date(Date.now() + OTP_MINUTES() * 60e3), ip: req.ip });
    await sendMail({ to: user.email, subject: 'Your My Library OS password reset code',
      text: `Your password reset code is ${code}. It expires in ${OTP_MINUTES()} minutes. If you did not ask for this, ignore this email.` });
    await audit({ user: { id: String(user._id), email: user.email, role: user.role }, ip: req.ip }, 'password.reset_requested', { tenantId: user.tenantId || null, target: mask(user.email) });
    res.json(generic);
  }));

  // Issue #15: password recovery by verified mobile (no silent email fallback).
  r.post('/auth/forgot-password-mobile', wrap(async (req, res) => {
    const mobile = normalizeMobile(req.body?.mobile);
    const generic = { ok: true, message: 'If this mobile number is registered, a reset code has been sent.' };
    if (!isMobile(mobile)) return res.status(400).json({ error: 'A valid mobile number is required' });
    if (!(smsConfigured() || await systemWhatsappReady())) return res.status(503).json({ error: 'Mobile verification is not configured. Contact support.', code: 'mobile_otp_not_configured' });
    if (rateLimited(`fmp:${req.ip}`, 10, 15 * 60e3)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
    if (rateLimited(`fmp-send:${mobile}`, 1, 30e3)) return res.status(429).json({ error: 'Please wait 30 seconds before requesting another code.' });
    if (await throttleHit(`forgot-mobile:${mobile}`, 5, 15 * 60e3)) return res.status(429).json({ error: 'Too many requests. Try again later.' });
    const user = await User.findOne({ mobile }).lean();
    if (!user || user.status !== 'Active') return res.json(generic);
    if (!isPlatformRole(user.role)) {
      const lib = await Library.findOne({ libraryId: user.tenantId || user.libraryId }).lean();
      if (!lib || lib.status !== 'Active') return res.json(generic);
    }
    const code = String(crypto.randomInt(0, 1e6)).padStart(6, '0');
    await PasswordResetOtp.updateMany({ userId: String(user._id), usedAt: null }, { $set: { usedAt: new Date() } });
    await PasswordResetOtp.create({ userId: String(user._id), mobile, channel: 'mobile', codeHash: sha(`${user._id}:${code}`), expiresAt: new Date(Date.now() + OTP_MINUTES() * 60e3), ip: req.ip });
    await sendMobileMessage({ to: mobile, text: `Your My Library OS password reset code is ${code}. It expires in ${OTP_MINUTES()} minutes. If you did not ask for this, ignore this message.` });
    await audit({ user: { id: String(user._id), email: user.email, role: user.role }, ip: req.ip }, 'password.reset_requested', { tenantId: user.tenantId || null, target: `••••${mobile.slice(-4)}` });
    res.json(generic);
  }));

  r.post('/auth/reset-password-mobile', wrap(async (req, res) => {
    const mobile = normalizeMobile(req.body?.mobile);
    const { otp, newPassword } = req.body || {};
    if (!isMobile(mobile) || !otp) return res.status(400).json({ error: 'mobile and code are required' });
    if (!validatePassword(newPassword)) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    if (rateLimited(`rpm:${req.ip}`, 20, 15 * 60e3)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    const bad = () => res.status(400).json({ error: 'Invalid or expired code' });
    const user = await User.findOne({ mobile }).select('+passwordHash');
    if (!user || user.status !== 'Active') return bad();
    const rec = await PasswordResetOtp.findOne({ userId: String(user._id), channel: 'mobile', usedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
    if (!rec) return bad();
    if (rec.attempts >= 5) { rec.usedAt = new Date(); await rec.save(); return res.status(429).json({ error: 'Too many wrong codes. Request a new one.' }); }
    const ok = rec.codeHash === sha(`${user._id}:${String(otp).trim()}`);
    if (!ok) { rec.attempts += 1; await rec.save(); return bad(); }
    const claimed = await PasswordResetOtp.findOneAndUpdate({ _id: rec._id, usedAt: null }, { $set: { usedAt: new Date() } });
    if (!claimed) return bad();
    user.passwordHash = await hashPassword(newPassword);
    user.authProviders = [...new Set([...(user.authProviders || []), 'password'])];
    user.passwordChangedAt = new Date();
    await user.save();
    await audit({ user: { id: String(user._id), email: user.email, role: user.role }, ip: req.ip }, 'password.reset_completed', { tenantId: user.tenantId || null, via: 'mobile' });
    await notifyPasswordChanged(user, { via: 'mobile', ip: req.ip });
    res.json({ ok: true, channel: 'whatsapp', maskedDestination: `••••${String(user.mobile || mobile).slice(-4)}` });
  }));

  // Linked Google proves the account, then the user sets a My Library OS password only.
  r.post('/auth/reset-password-google', wrap(async (req, res) => {
    const token = String(req.body?.token || '').trim();
    const { newPassword } = req.body || {};
    if (!token) return res.status(400).json({ error: 'A reset token is required' });
    if (!validatePassword(newPassword)) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    if (rateLimited(`rpg:${req.ip}`, 20, 15 * 60e3)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    const bad = () => res.status(400).json({ error: 'Invalid or expired reset link' });
    const rec = await PasswordResetOtp.findOne({ channel: 'google', codeHash: sha(token), usedAt: null, expiresAt: { $gt: new Date() } });
    if (!rec) return bad();
    const user = await User.findById(rec.userId).select('+passwordHash');
    if (!user || user.status !== 'Active' || !user.googleSub) return bad();
    const claimed = await PasswordResetOtp.findOneAndUpdate({ _id: rec._id, usedAt: null }, { $set: { usedAt: new Date() } });
    if (!claimed) return bad();
    user.passwordHash = await hashPassword(newPassword);
    user.authProviders = [...new Set([...(user.authProviders || []), 'password'])];
    user.passwordChangedAt = new Date();
    await user.save();
    await audit({ user: { id: String(user._id), email: user.email, role: user.role }, ip: req.ip }, 'password.reset_completed', { tenantId: user.tenantId || null, via: 'google' });
    await notifyPasswordChanged(user, { via: 'google', ip: req.ip });
    res.json({
      ok: true,
      message: 'Your My Library OS password was updated. Your Google password was not changed.',
      channel: 'email',
      maskedDestination: user.email ? maskEmail(user.email) : null,
    });
  }));

  r.post('/auth/reset-password', wrap(async (req, res) => {
    const email = String(req.body?.email || '').toLowerCase().trim();
    const { otp, newPassword } = req.body || {};
    if (!email || !otp) return res.status(400).json({ error: 'email and code are required' });
    if (!validatePassword(newPassword)) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    if (rateLimited(`rp:${req.ip}`, 20, 15 * 60e3)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    const bad = () => res.status(400).json({ error: 'Invalid or expired code' });
    const user = await User.findOne({ email }).select('+passwordHash');
    if (!user || user.status !== 'Active') return bad();
    const rec = await PasswordResetOtp.findOne({ userId: String(user._id), usedAt: null, expiresAt: { $gt: new Date() } }).sort({ createdAt: -1 });
    if (!rec) return bad();
    if (rec.attempts >= 5) { rec.usedAt = new Date(); await rec.save(); return res.status(429).json({ error: 'Too many wrong codes. Request a new one.' }); }
    const ok = crypto.timingSafeEqual(Buffer.from(rec.codeHash), Buffer.from(sha(`${user._id}:${String(otp).trim()}`)));
    if (!ok) { rec.attempts += 1; await rec.save(); return bad(); }
    const claimed = await PasswordResetOtp.findOneAndUpdate({ _id: rec._id, usedAt: null }, { $set: { usedAt: new Date() } });
    if (!claimed) return bad();
    user.passwordHash = await hashPassword(newPassword);
    user.authProviders = [...new Set([...(user.authProviders || []), 'password'])];
    user.passwordChangedAt = new Date();
    await user.save();
    await audit({ user: { id: String(user._id), email: user.email, role: user.role }, ip: req.ip }, 'password.reset_completed', { tenantId: user.tenantId || null });
    await notifyPasswordChanged(user, { via: 'email', ip: req.ip });
    res.json({ ok: true, channel: 'email', maskedDestination: maskEmail(user.email) });
  }));
  return r;
}

/** Tenant routes (mounted after requireAuth + tenantScope). */
export function createTenantAccountRouter() {
  const r = express.Router();
  const owner = requireRole('client_admin', 'superadmin');

  r.get('/invites', owner, wrap(async (req, res) => {
    res.json((await Invite.find({ tenantId: req.tenantId }).sort({ createdAt: -1 }).lean()).map(pubInvite));
  }));

  r.post('/invites', owner, wrap(async (req, res) => {
    const email = String(req.body?.email || '').toLowerCase().trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'A valid email is required' });
    if (await User.exists({ email })) return res.status(409).json({ error: 'This email already has an account' });
    const role = req.body?.role === 'client_admin' ? 'client_admin' : 'staff';
    const hours = Math.min(Math.max(Number(req.body?.expiresInHours || INVITE_HOURS()), 1), 24 * 14);
    let permissions = req.body?.permissions;
    let staffPhone = '';
    let linked = null;
    if (req.body?.staffId) {
      linked = await models.staffMembers.findOne({ tenantId: req.tenantId, _key: String(req.body.staffId) }).lean();
      if (linked) {
        permissions = sanitizeStaffPermissions(permissions || linked.permissions, linked.role);
        staffPhone = linked.phone || '';
      }
    }
    const phone = String(req.body?.phone || req.body?.mobile || staffPhone || '').trim();
    const phoneNorm = phone ? normalizeMobile(phone) : '';
    if (phoneNorm && isMobile(phoneNorm) && await User.exists({ mobile: phoneNorm })) {
      return res.status(409).json({ error: 'This mobile already has an account' });
    }
    if (role === 'staff') await checkStaffLimit(req.tenantId, { Invite, excludeEmail: email }); // Issue #14
    await Invite.updateMany({ tenantId: req.tenantId, email, usedAt: null, revokedAt: null }, { $set: { revokedAt: new Date() } }); // one live invite per email
    const token = crypto.randomBytes(32).toString('base64url');
    const requestedBranch = req.body?.branchId != null && String(req.body.branchId).trim() !== ''
      ? String(req.body.branchId).trim().slice(0, 80)
      : '';
    const branchId = requestedBranch || (linked?.branchId ? String(linked.branchId).trim().slice(0, 80) : '');
    const requestedIds = Array.isArray(req.body?.branchIds) ? req.body.branchIds : null;
    const branchIds = (requestedIds != null ? requestedIds : (Array.isArray(linked?.branchIds) ? linked.branchIds : []))
      .map((id) => String(id || '').trim().slice(0, 80)).filter(Boolean);
    const inv = await Invite.create({
      tenantId: req.tenantId, tokenHash: sha(token), tokenCipher: encryptSecret(token),
      email, name: req.body?.name, role, staffId: req.body?.staffId, permissions,
      ...(phoneNorm && isMobile(phoneNorm) ? { phone: phoneNorm } : {}),
      ...(branchId ? { branchId } : {}),
      ...(branchIds.length ? { branchIds } : {}),
      expiresAt: new Date(Date.now() + hours * 3600e3), createdBy: req.user.email,
    });
    const link = inviteLink(token);
    const lib = await Library.findOne({ libraryId: req.tenantId }).lean();
    let emailed = false;
    if (req.body?.sendEmail !== false) {
      try { emailed = await sendMail({ to: email, subject: `You're invited to ${lib?.name || 'a library'} on My Library OS`, text: `You have been invited to join ${lib?.name || 'a library'} as ${role === 'staff' ? 'staff' : 'an admin'}.\n\nOpen this link to set your password (valid for ${hours} hours, one-time use):\n${link}` }); }
      catch (e) { console.error('[invite] email failed:', e.message); }
    }
    const whatsapp = await deliverInviteWhatsapp({ to: phone, libraryName: lib?.name, link });
    inv.whatsappStatus = whatsapp.status;
    inv.whatsappReason = whatsapp.reason;
    await inv.save();
    await audit(req, 'invite.created', { target: email, detail: { role, staffId: req.body?.staffId, hours, whatsapp: whatsapp.status, whatsappReason: whatsapp.reason } });
    res.status(201).json({ ...pubInvite(inv), link, emailed, whatsapp });
  }));

  r.post('/invites/:id/share-link', owner, wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const i = await Invite.findOne({ _id: req.params.id, tenantId: req.tenantId });
    if (!i) return res.status(404).json({ error: 'Not found' });
    const status = inviteStatus(i);
    if (status !== 'pending') return res.status(410).json({ error: closedInvite(status).error, code: status });
    let token = '';
    if (i.tokenCipher) {
      try { token = decryptSecret(i.tokenCipher); } catch { token = ''; }
      if (!cipherMatchesInvite(i, token)) token = '';
    }
    let added = false;
    if (!token) {
      // No usable cipher. Keep tokenHash and expiresAt. Add a second token
      // so Copy/Share works and the emailed link stays valid until the same expiry.
      token = crypto.randomBytes(32).toString('base64url');
      i.extraTokenHash = sha(token);
      i.tokenCipher = encryptSecret(token);
      await i.save();
      added = true;
    }
    await audit(req, 'invite.share_link', { target: i.email, detail: { rotated: false, ...(added ? { added: true } : {}) } });
    res.json({ link: inviteLink(token) });
  }));

  r.post('/invites/:id/revoke', owner, wrap(async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.id)) return res.status(404).json({ error: 'Not found' });
    const i = await Invite.findOneAndUpdate({ _id: req.params.id, tenantId: req.tenantId, usedAt: null }, { $set: { revokedAt: new Date() } }, { new: true, lean: true });
    if (!i) return res.status(404).json({ error: 'Not found or already used' });
    await audit(req, 'invite.revoked', { target: i.email });
    res.json(pubInvite(i));
  }));

  // Owner sees who did sensitive things in their library, including Super Admin access.
  r.get('/audit-logs', owner, wrap(async (req, res) => {
    const limit = Math.min(Number(req.query.limit || 100), 500);
    const q = { tenantId: req.tenantId };
    if (req.query.action) q.action = String(req.query.action);
    res.json((await AuditLog.find(q).sort({ at: -1 }).limit(limit).lean()).map(pubAudit));
  }));
  return r;
}

/** Super Admin Access Library is audited: once per session-hour on reads, every write. */
const seen = new Map();
export function auditSuperadminAccess(req, _res, next) {
  if (['superadmin', 'partner', 'agent'].includes(req.user?.role) && req.tenantId) {
    const write = !['GET', 'HEAD', 'OPTIONS'].includes(req.method);
    const key = `${req.user.id}:${req.tenantId}`;
    const last = seen.get(key) || 0;
    if (write || Date.now() - last > 3600e3) {
      if (!write) seen.set(key, Date.now());
      audit(req, `${req.user.role}.${write ? 'library_write' : 'library_access'}`, { target: `${req.method} ${req.baseUrl}${req.path}`, reason: req.get('X-Access-Reason') || undefined, detail: { readOnly: !!req.readOnly } });
    }
  }
  next();
}
export const resetAccessCache = () => seen.clear();
