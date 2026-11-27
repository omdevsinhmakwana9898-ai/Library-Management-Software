// Super Admin platform sender settings. Additive singleton; absent doc means "keep using env SMTP".
import mongoose from 'mongoose';
import express from 'express';
import { encryptSecret, decryptSecret } from './cryptoSecrets.js';
import { requireRole } from './auth.js';
import { audit } from './audit.js';
import { User } from './models.js';
import { EMAIL_RE, maskEmail, normalizeMobile, isMobile } from './identity.js';
import { sendSystemWhatsapp, systemWhatsappConfigured } from './systemWhatsapp.js';
import { throttleHit } from './throttle.js';

const schema = new mongoose.Schema({
  _id: { type: String, default: 'default' },
  gmail: {
    senderName: { type: String, default: '' },
    address: { type: String, default: '' },
    appPasswordEnc: { type: String, default: '' },
  },
  updatedBy: String,
  updatedAt: Date,
}, { collection: 'platform_messaging_config' });

export const PlatformMessagingConfig = mongoose.models.PlatformMessagingConfig
  || mongoose.model('PlatformMessagingConfig', schema);

function publicView(doc) {
  const d = doc?.toObject ? doc.toObject() : (doc || {});
  const g = d.gmail || {};
  const address = g.address || '';
  const passwordSet = Boolean(g.appPasswordEnc);
  return {
    gmail: {
      senderName: g.senderName || '',
      address,
      appPasswordSet: passwordSet,
      appPasswordMask: passwordSet ? '••••••••' : '',
      configured: Boolean(address && passwordSet),
    },
    updatedBy: d.updatedBy || null,
    updatedAt: d.updatedAt || null,
  };
}

export async function getPlatformMessagingConfig() {
  let doc = await PlatformMessagingConfig.findById('default');
  if (!doc) doc = await PlatformMessagingConfig.create({ _id: 'default' });
  return doc;
}

/** Decrypted Gmail sender for the mailer only. Null when unset or incomplete. Never log the password. */
export async function getGmailCredentials() {
  try {
    if (mongoose.connection.readyState !== 1) return null;
    const doc = await PlatformMessagingConfig.findById('default').lean();
    const g = doc?.gmail;
    if (!g?.address || !g?.appPasswordEnc) return null;
    const appPassword = decryptSecret(g.appPasswordEnc);
    if (!appPassword) return null;
    return { senderName: g.senderName || '', address: g.address, appPassword };
  } catch (e) {
    console.error('[mail] saved Gmail sender could not be read:', e?.message || 'decrypt_failed');
    return null;
  }
}

export async function updateGmailSender(body, { updatedBy } = {}) {
  const doc = await getPlatformMessagingConfig();
  if (!doc.gmail) doc.gmail = { senderName: '', address: '', appPasswordEnc: '' };
  const g = (body && body.gmail) || {};
  if (g.clear === true) {
    doc.gmail = { senderName: '', address: '', appPasswordEnc: '' };
  } else {
    if (typeof g.senderName === 'string') {
      doc.gmail.senderName = g.senderName.replace(/[\r\n]/g, ' ').trim().slice(0, 80);
    }
    if (typeof g.address === 'string') {
      const address = g.address.trim().toLowerCase();
      if (address && !EMAIL_RE.test(address)) {
        throw Object.assign(new Error('Enter a valid Gmail address'), { status: 400, code: 'invalid_gmail_address' });
      }
      doc.gmail.address = address;
    }
    if (typeof g.appPassword === 'string') {
      const raw = g.appPassword.replace(/\s/g, '');
      if (raw && !raw.includes('•') && !raw.includes('*')) {
        if (raw.length < 8) {
          throw Object.assign(new Error('Gmail app password looks too short'), { status: 400, code: 'invalid_app_password' });
        }
        doc.gmail.appPasswordEnc = encryptSecret(raw);
      }
    }
  }
  doc.updatedBy = updatedBy || null;
  doc.updatedAt = new Date();
  doc.markModified('gmail');
  await doc.save();
  return publicView(doc);
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const maskedMobile = (m) => (m ? `••••${String(m).replace(/\D/g, '').slice(-4)}` : '');

/** Super-admin only. Mounted under /api/admin. */
export function createPlatformMessagingRouter() {
  const r = express.Router();
  r.use(requireRole('superadmin'));

  r.get('/messaging/config', wrap(async (_req, res) => {
    res.json(publicView(await getPlatformMessagingConfig()));
  }));

  r.put('/messaging/config', wrap(async (req, res) => {
    const view = await updateGmailSender(req.body, { updatedBy: req.user.email });
    const { resetMailTransport } = await import('./mailer.js');
    resetMailTransport();
    await audit(req, 'messaging.gmail_updated', {
      detail: {
        address: view.gmail.address ? maskEmail(view.gmail.address) : '',
        configured: view.gmail.configured,
        cleared: Boolean(req.body?.gmail?.clear),
      },
    });
    res.json(view);
  }));

  r.post('/messaging/test-email', wrap(async (req, res) => {
    if (await throttleHit(`msg-test-email:${req.user.id}`, 8, 15 * 60e3)) {
      return res.status(429).json({ error: 'Too many test emails. Try again later.' });
    }
    const user = await User.findById(req.user.id).lean();
    const to = String(user?.email || '').trim().toLowerCase();
    if (!to) return res.status(400).json({ error: 'Your Super Admin account has no email address' });
    const { sendMail } = await import('./mailer.js');
    let delivered = false;
    try {
      delivered = await sendMail({
        to,
        subject: 'My Library OS test email',
        text: 'This is a test email from My Library OS messaging settings. If you did not request it, you can ignore this message.',
      });
    } catch (e) {
      console.error('[messaging] test email failed:', e?.message || 'send_failed');
      await audit(req, 'messaging.test_email_failed', { target: maskEmail(to) });
      return res.status(502).json({ error: 'Test email could not be sent' });
    }
    await audit(req, 'messaging.test_email', { target: maskEmail(to), detail: { delivered: Boolean(delivered) } });
    res.json({ ok: true, to: maskEmail(to), sent: Boolean(delivered), captured: !delivered });
  }));

  r.post('/messaging/test-whatsapp', wrap(async (req, res) => {
    if (await throttleHit(`msg-test-wa:${req.user.id}`, 8, 15 * 60e3)) {
      return res.status(429).json({ error: 'Too many test messages. Try again later.' });
    }
    if (!systemWhatsappConfigured()) {
      return res.status(503).json({ error: 'WhatsApp integration is not configured on the server', code: 'whatsapp_not_configured' });
    }
    const user = await User.findById(req.user.id).lean();
    let to = user?.mobile ? normalizeMobile(user.mobile) : '';
    if (!to) {
      to = normalizeMobile(req.body?.mobile);
      if (!isMobile(to)) return res.status(400).json({ error: 'Enter a mobile number to receive the test message' });
    }
    const result = await sendSystemWhatsapp({
      to,
      text: 'This is a test message from My Library OS. If you did not request it, you can ignore this message.',
    });
    if (!result.sent) {
      await audit(req, 'messaging.test_whatsapp_failed', { target: maskedMobile(to), detail: { reason: 'not_sent' } });
      return res.status(502).json({ error: 'WhatsApp test was not sent', code: 'not_sent' });
    }
    await audit(req, 'messaging.test_whatsapp', { target: maskedMobile(to) });
    res.json({ ok: true, to: maskedMobile(to), sent: true });
  }));

  return r;
}

export { publicView };
