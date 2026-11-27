// Best-effort "password changed" notice from the platform sender. Never includes the new password.
import { sendMail } from './mailer.js';
import { sendMobileMessage } from './messaging.js';
import { audit } from './audit.js';

export const PASSWORD_CHANGED_SUBJECT = 'Your My Library OS password was changed';
export const PASSWORD_CHANGED_TEXT = 'Your My Library OS password was changed. Please sign in with your new password. If you did not do this, contact support.';

function actorOf(user, ip) {
  return {
    user: { id: String(user?._id || user?.id || ''), email: user?.email || '', role: user?.role || '' },
    ip,
  };
}

async function noteFailure(user, ip, via, reason) {
  const safe = String(reason || 'notify_failed').replace(/pass(word)?[=:]\S+/gi, 'pass=[redacted]').slice(0, 180);
  await audit(actorOf(user, ip), 'password.changed_notify_failed', {
    tenantId: user?.tenantId || user?.libraryId || null,
    detail: { via, reason: safe },
  });
}

async function sendEmail(user, ip, via) {
  if (!user?.email) return { channel: 'none', sent: false };
  try {
    const handed = await sendMail({ to: user.email, subject: PASSWORD_CHANGED_SUBJECT, text: PASSWORD_CHANGED_TEXT });
    if (!handed && process.env.NODE_ENV !== 'test') await noteFailure(user, ip, via, 'email_not_delivered');
    return { channel: 'email', sent: Boolean(handed) || process.env.NODE_ENV === 'test' };
  } catch (e) {
    await noteFailure(user, ip, via, e?.message || 'email_failed');
    return { channel: 'email', sent: false };
  }
}

async function sendWhatsapp(user, ip, via) {
  if (!user?.mobile) return { channel: 'none', sent: false };
  try {
    const result = await sendMobileMessage({ to: user.mobile, text: PASSWORD_CHANGED_TEXT });
    if (!result?.sent) await noteFailure(user, ip, via, result?.reason || 'whatsapp_not_sent');
    return { channel: 'whatsapp', sent: Boolean(result?.sent) };
  } catch (e) {
    await noteFailure(user, ip, via, e?.message || 'whatsapp_failed');
    return { channel: 'whatsapp', sent: false };
  }
}

/**
 * via: 'email' | 'mobile' | 'google' | 'change'
 * Email reset and Google reset notify by email. Mobile reset notifies by WhatsApp.
 * A logged-in change notifies by email when the account has one, otherwise WhatsApp.
 * Failures are audited and never thrown.
 */
export async function notifyPasswordChanged(user, { via = 'change', ip } = {}) {
  try {
    if (via === 'mobile') return await sendWhatsapp(user, ip, via);
    if (via === 'email' || via === 'google') return await sendEmail(user, ip, via);
    if (user?.email) return await sendEmail(user, ip, via);
    if (user?.mobile) return await sendWhatsapp(user, ip, via);
    return { channel: 'none', sent: false };
  } catch (e) {
    await noteFailure(user, ip, via, e?.message || 'notify_failed');
    return { channel: 'none', sent: false };
  }
}
