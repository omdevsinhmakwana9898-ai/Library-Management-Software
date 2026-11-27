/**
 * Outgoing email via SMTP (nodemailer).
 *
 * Sender order:
 * 1. Super Admin Gmail settings in `platform_messaging_config` (when address and app password are saved).
 * 2. Otherwise the current env sender: SMTP_HOST, SMTP_PORT, SMTP_SECURE ("true" for 465), SMTP_USER, SMTP_PASS, SMTP_FROM.
 *
 * In tests, or when neither sender is configured, messages are captured in memory and never sent.
 * A changed Gmail/env sender drops the previous nodemailer transport.
 */
import nodemailer from 'nodemailer';
import { getGmailCredentials } from './platformMessaging.js';

export const outbox = []; // test/dev capture only
let transport = null;
let transportKey = '';

const defaultTransportFactory = (opts) => nodemailer.createTransport(opts);
let transportFactory = defaultTransportFactory;

/** Test hook. Pass null/undefined to restore nodemailer. Never used for a live send in tests. */
export function setMailTransportFactory(fn) {
  transportFactory = typeof fn === 'function' ? fn : defaultTransportFactory;
  resetMailTransport();
}

export function resetMailTransport() {
  try { transport?.close?.(); } catch { /* ignore */ }
  transport = null;
  transportKey = '';
}

/** True when env SMTP would be used. Gmail settings are checked asynchronously in sendMail. */
export const mailEnabled = () => Boolean(process.env.SMTP_HOST) && process.env.NODE_ENV !== 'test';

/** True when a real sender exists, or when tests capture mail instead of sending. */
export async function emailDeliveryConfigured() {
  if (process.env.NODE_ENV === 'test') return true;
  if (await getGmailCredentials()) return true;
  return Boolean(process.env.SMTP_HOST);
}

function formatFrom(name, address) {
  const clean = String(name || '').replace(/[\r\n"]/g, '').trim();
  if (!clean) return address;
  return `"${clean}" <${address}>`;
}

/** Resolve the sender. Gmail wins when complete; otherwise env; otherwise null. */
export async function resolveMailRoute() {
  const gmail = await getGmailCredentials();
  if (gmail?.address && gmail?.appPassword) {
    return {
      mode: 'gmail',
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      user: gmail.address,
      pass: gmail.appPassword,
      from: formatFrom(gmail.senderName, gmail.address),
    };
  }
  if (process.env.SMTP_HOST) {
    return {
      mode: 'env',
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true',
      user: process.env.SMTP_USER || '',
      pass: process.env.SMTP_PASS || '',
      from: process.env.SMTP_FROM || process.env.SMTP_USER || '',
    };
  }
  return null;
}

function routeKey(route) {
  return [route.mode, route.host, route.port, route.secure ? '1' : '0', route.user, route.pass, route.from].join('\n');
}

function getTransport(route) {
  const key = routeKey(route);
  if (transport && transportKey === key) return transport;
  resetMailTransport();
  transportKey = key;
  transport = transportFactory({
    host: route.host,
    port: route.port,
    secure: route.secure,
    auth: route.user ? { user: route.user, pass: route.pass } : undefined,
    connectionTimeout: 10000,
    greetingTimeout: 10000,
  });
  return transport;
}

const cleanAttachments = (list) => (Array.isArray(list) ? list : [])
  .filter(a => a && a.filename && a.content != null)
  .map(a => ({ filename: String(a.filename), content: a.content, contentType: a.contentType || undefined }));

/** Returns true when handed to SMTP; false when captured (not configured / test). Throws on transport failure. */
export async function sendMail({ to, subject, text, html, attachments }) {
  const files = cleanAttachments(attachments);
  const route = await resolveMailRoute();
  const capture = process.env.NODE_ENV === 'test' || !route;
  if (capture) {
    // Capture metadata only; attachment bytes and credentials are never stored.
    outbox.push({
      to,
      subject,
      text,
      from: route?.from || null,
      via: route?.mode || 'unconfigured',
      at: new Date(),
      attachments: files.map(f => ({ filename: f.filename, contentType: f.contentType, size: f.content?.length || 0 })),
    });
    if (outbox.length > 200) outbox.shift();
    return false;
  }
  await getTransport(route).sendMail({
    from: route.from,
    to,
    subject,
    text,
    html,
    ...(files.length ? { attachments: files } : {}),
  });
  return true;
}
