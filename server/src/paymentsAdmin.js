// Issue #19: Super Admin payment-provider settings + deletion-request resolve.
import express from 'express';
import { requireRole } from './auth.js';
import { audit, AuditLog } from './audit.js';
import { getPaymentConfigPublic, updatePaymentConfig, refreshPaymentProvider, testPaymentConnection } from './paymentConfig.js';
import { Library, User } from './models.js';
import { sendMail } from './mailer.js';
import { paymentProvider } from './billing.js';

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function createPaymentsAdminRouter() {
  const r = express.Router();
  r.use(requireRole('superadmin'));

  r.get('/payments/config', wrap(async (_req, res) => {
    res.json(await getPaymentConfigPublic());
  }));

  r.put('/payments/config', wrap(async (req, res) => {
    const current = await getPaymentConfigPublic();
    const b = req.body || {};
    const nextProvider = b.activeProvider && ['none', 'razorpay', 'paypal'].includes(b.activeProvider)
      ? b.activeProvider
      : current.activeProvider;
    if (nextProvider !== current.activeProvider && b.confirmActiveProvider !== true) {
      return res.status(400).json({
        error: 'Confirm the active provider change before it is saved.',
        code: 'confirm_active_provider',
      });
    }
    const liveRazorpay = b.razorpay?.mode === 'live' && current.razorpay?.mode !== 'live';
    const livePaypal = b.paypal?.mode === 'live' && current.paypal?.mode !== 'live';
    if ((liveRazorpay || livePaypal) && b.confirmLiveMode !== true) {
      return res.status(400).json({
        error: 'Live mode needs a separate confirmation. Nothing was saved.',
        code: 'confirm_live_mode',
      });
    }
    const view = await updatePaymentConfig(b, { updatedBy: req.user.email });
    await audit(req, 'payments.config_updated', {
      detail: {
        activeProvider: view.activeProvider,
        previousActiveProvider: current.activeProvider,
        razorpayEnabled: view.razorpay.enabled,
        paypalEnabled: view.paypal.enabled,
        razorpayMode: view.razorpay.mode,
        paypalMode: view.paypal.mode,
        previousRazorpayMode: current.razorpay.mode,
        previousPaypalMode: current.paypal.mode,
        activeProviderConfirmed: nextProvider !== current.activeProvider,
        liveModeConfirmed: Boolean(liveRazorpay || livePaypal),
      },
    });
    res.json(view);
  }));

  r.post('/payments/config/test', wrap(async (req, res) => {
    const view = await testPaymentConnection();
    await audit(req, 'payments.provider_verified', { detail: { provider: view.verification?.provider, mode: view.verification?.mode } });
    res.json({ ok: true, ...view });
  }));

  /** Current requests plus dismissed/withdrawn audit history. Resolve still only acknowledges or dismisses. */
  r.get('/payments/deletion-requests', wrap(async (req, res) => {
    const q = String(req.query.q || '').trim().toLowerCase();
    const state = String(req.query.state || '').trim();
    if (state && !['pending', 'acknowledged', 'dismissed', 'withdrawn'].includes(state)) {
      return res.status(400).json({ error: 'Unknown deletion request state' });
    }
    const libs = await Library.find({ deletionRequest: { $ne: null } })
      .select('libraryId name contactEmail phone deletionRequest subscription planId status')
      .lean();
    const current = libs.map(l => ({
      id: `current:${l.libraryId}`,
      libraryId: l.libraryId,
      name: l.name,
      contactEmail: l.contactEmail || null,
      phone: l.phone || null,
      planId: l.planId,
      status: l.status,
      subscriptionStatus: l.subscription?.status || null,
      state: l.deletionRequest?.acknowledgedAt ? 'acknowledged' : 'pending',
      deletionRequest: l.deletionRequest,
      at: l.deletionRequest?.acknowledgedAt || l.deletionRequest?.at || null,
      by: l.deletionRequest?.by || null,
      reason: l.deletionRequest?.reason || '',
      canResolve: true,
      source: 'library',
      note: 'An owner request is not automatic deletion. Permanent deletion stays on library details and still requires typing the library name.',
    }));
    const audits = await AuditLog.find({
      action: { $in: ['library.deletion_request_dismissed', 'library.deletion_request_withdrawn'] },
    }).sort({ at: -1 }).limit(500).lean();
    const histIds = [...new Set(audits.map(a => a.tenantId).filter(Boolean))];
    const named = histIds.length
      ? await Library.find({ libraryId: { $in: histIds } }).select('libraryId name contactEmail phone').lean()
      : [];
    const byId = Object.fromEntries(named.map(l => [l.libraryId, l]));
    const history = audits.map(a => {
      const dismissed = a.action === 'library.deletion_request_dismissed';
      return {
        id: String(a._id),
        libraryId: a.tenantId,
        name: byId[a.tenantId]?.name || a.tenantId,
        contactEmail: byId[a.tenantId]?.contactEmail || null,
        phone: byId[a.tenantId]?.phone || null,
        planId: null,
        status: null,
        subscriptionStatus: null,
        state: dismissed ? 'dismissed' : 'withdrawn',
        deletionRequest: null,
        at: a.at,
        by: a.actorEmail || null,
        reason: a.detail?.reason || a.reason || '',
        canResolve: false,
        source: 'audit',
        note: dismissed
          ? 'Dismissed. The library was not deleted.'
          : 'The owner withdrew this request. The library was not deleted.',
      };
    });
    let rows = [...current, ...history];
    if (state) rows = rows.filter(row => row.state === state);
    if (q) {
      rows = rows.filter(row => [row.libraryId, row.name, row.contactEmail, row.phone, row.by, row.reason, row.state]
        .filter(Boolean).join(' ').toLowerCase().includes(q));
    }
    rows.sort((a, b) => new Date(b.at || 0) - new Date(a.at || 0));
    res.json(rows);
  }));

  r.post('/payments/deletion-requests/:libraryId/resolve', wrap(async (req, res) => {
    const { libraryId } = req.params;
    const action = req.body?.action === 'dismiss' ? 'dismiss' : 'acknowledge';
    const lib = await Library.findOne({ libraryId });
    if (!lib) return res.status(404).json({ error: 'Library not found' });
    if (!lib.deletionRequest) return res.status(400).json({ error: 'No deletion request' });
    if (action === 'dismiss') {
      await Library.updateOne({ libraryId }, { $set: { deletionRequest: null } });
      await audit(req, 'library.deletion_request_dismissed', { tenantId: libraryId });
    } else {
      await Library.updateOne({ libraryId }, {
        $set: {
          'deletionRequest.acknowledgedAt': new Date(),
          'deletionRequest.acknowledgedBy': req.user.email,
        },
      });
      await audit(req, 'library.deletion_request_acked', { tenantId: libraryId });
    }
    res.json({ ok: true, action });
  }));

  return r;
}

/** Email every Super Admin when an owner requests deletion. */
export async function notifySuperAdminsOfDeletionRequest(lib, request) {
  const admins = await User.find({ role: 'superadmin' }).select('email').lean();
  const to = admins.map(a => a.email).filter(Boolean);
  if (!to.length) return;
  const text = [
    `Library "${lib.name}" (${lib.libraryId}) requested deletion.`,
    `Requested by: ${request.by}`,
    `Reason: ${request.reason || '(none)'}`,
    '',
    'Open Super Admin → Payments / Business dashboard to review. Deleting still requires typing the library name.',
  ].join('\n');
  await Promise.all(to.map(email => sendMail({
    to: email,
    subject: `[My Library OS] Deletion requested: ${lib.name}`,
    text,
  }).catch(e => console.error('[mail] deletion alert failed:', e.message))));
}
