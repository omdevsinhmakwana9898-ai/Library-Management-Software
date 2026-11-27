// Platform Gmail sender, test sends, and password-changed notices. No live SMTP or WhatsApp.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, call, login, ctx, SA } from './helpers.js';
import { outbox, sendMail, setMailTransportFactory } from '../src/mailer.js';
import { PlatformMessagingConfig, updateGmailSender } from '../src/platformMessaging.js';
import { setSmsProvider } from '../src/messaging.js';
import { setSystemEvolutionClient, clearSystemWhatsappCache } from '../src/systemWhatsapp.js';
import { resetRateLimits } from '../src/accounts.js';
import { User } from '../src/models.js';
import { createUser } from '../src/services.js';
import { PASSWORD_CHANGED_TEXT } from '../src/passwordChangedNotice.js';
import { AuditLog as Audit } from '../src/audit.js';

const APP_PASSWORD = 'gmail-app-password-1';
const sentWa = [];

function openClient() {
  setSystemEvolutionClient({
    findInstance: async () => ({ connectionStatus: 'open' }),
    connectionState: async () => ({ instance: { state: 'open' } }),
    sendText: async (instance, number, text) => {
      sentWa.push({ instance, number, text });
      return { ok: true };
    },
  });
  clearSystemWhatsappCache();
}

before(() => setup('messaging'));
after(async () => {
  setSmsProvider(null);
  setSystemEvolutionClient(null);
  setMailTransportFactory(null);
  process.env.NODE_ENV = 'test';
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_FROM;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  await teardown();
});

test('messaging routes are superadmin only and never return the app password', async () => {
  for (const path of ['/api/admin/messaging/config', '/api/admin/messaging/test-email', '/api/admin/messaging/test-whatsapp']) {
    const method = path.endsWith('config') ? 'GET' : 'POST';
    const denied = await call(method, path, { token: ctx.tokens.a, body: method === 'POST' ? {} : undefined });
    assert.equal(denied.status, 403, path);
  }
  const empty = await call('GET', '/api/admin/messaging/config', { token: ctx.tokens.sa });
  assert.equal(empty.status, 200, JSON.stringify(empty.body));
  assert.equal(empty.body.gmail.configured, false);
  assert.equal(empty.body.gmail.appPasswordSet, false);

  const saved = await call('PUT', '/api/admin/messaging/config', {
    token: ctx.tokens.sa,
    body: { gmail: { senderName: 'Library OS', address: 'sender@gmail.com', appPassword: APP_PASSWORD } },
  });
  assert.equal(saved.status, 200, JSON.stringify(saved.body));
  assert.equal(saved.body.gmail.configured, true);
  assert.equal(saved.body.gmail.appPasswordMask, '••••••••');
  assert.equal(saved.body.gmail.address, 'sender@gmail.com');
  assert.equal(JSON.stringify(saved.body).includes(APP_PASSWORD), false);
  assert.equal(saved.body.gmail.appPassword, undefined);
  assert.equal(saved.body.gmail.appPasswordEnc, undefined);

  const again = await call('GET', '/api/admin/messaging/config', { token: ctx.tokens.sa });
  assert.equal(JSON.stringify(again.body).includes(APP_PASSWORD), false);
  const doc = await PlatformMessagingConfig.findById('default').lean();
  assert.ok(doc.gmail.appPasswordEnc);
  assert.equal(doc.gmail.appPasswordEnc.includes(APP_PASSWORD), false);
  assert.notEqual(doc.gmail.appPasswordEnc, APP_PASSWORD);
});

test('mailer uses saved Gmail settings and falls back to env SMTP when they are absent', async () => {
  outbox.length = 0;
  await sendMail({ to: 'reader@test.local', subject: 'Via Gmail', text: 'Hello from gmail' });
  assert.equal(outbox.at(-1).via, 'gmail');
  assert.equal(outbox.at(-1).from, '"Library OS" <sender@gmail.com>');
  assert.equal(JSON.stringify(outbox.at(-1)).includes(APP_PASSWORD), false);

  process.env.SMTP_HOST = 'smtp.example.test';
  process.env.SMTP_FROM = 'Env Sender <env@test.local>';
  process.env.SMTP_USER = 'env-user';
  process.env.SMTP_PASS = 'env-pass';
  await sendMail({ to: 'reader@test.local', subject: 'Gmail wins', text: 'still gmail' });
  assert.equal(outbox.at(-1).via, 'gmail');

  await updateGmailSender({ gmail: { clear: true } });
  await sendMail({ to: 'reader@test.local', subject: 'Via env', text: 'env path' });
  assert.equal(outbox.at(-1).via, 'env');
  assert.equal(outbox.at(-1).from, 'Env Sender <env@test.local>');

  delete process.env.SMTP_HOST;
  await sendMail({ to: 'reader@test.local', subject: 'None', text: 'captured' });
  assert.equal(outbox.at(-1).via, 'unconfigured');
  assert.equal(outbox.at(-1).from, null);

  await updateGmailSender({ gmail: { senderName: 'Only name', address: 'only@gmail.com' } });
  process.env.SMTP_HOST = 'smtp.example.test';
  await sendMail({ to: 'reader@test.local', subject: 'Incomplete', text: 'no password yet' });
  assert.equal(outbox.at(-1).via, 'env', 'address without an app password keeps the env sender');
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_FROM;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
});

test('a changed Gmail password replaces the cached transport', async () => {
  await updateGmailSender({ gmail: { senderName: 'Library OS', address: 'sender@gmail.com', appPassword: 'first-app-pass' } });
  const created = [];
  setMailTransportFactory((opts) => {
    created.push(opts.auth.pass);
    return { sendMail: async () => ({ messageId: '1' }), close() {} };
  });
  process.env.NODE_ENV = 'production';
  try {
    assert.equal(await sendMail({ to: SA.email, subject: 'Live', text: 'one' }), true);
    assert.equal(await sendMail({ to: SA.email, subject: 'Live', text: 'two' }), true);
    assert.deepEqual(created, ['first-app-pass']);
    await updateGmailSender({ gmail: { appPassword: 'second-app-pass' } });
    assert.equal(await sendMail({ to: SA.email, subject: 'Live', text: 'three' }), true);
    assert.deepEqual(created, ['first-app-pass', 'second-app-pass']);
  } finally {
    process.env.NODE_ENV = 'test';
    setMailTransportFactory(null);
  }
});

test('test email goes only to the signed-in super admin and test WhatsApp uses their mobile', async () => {
  await updateGmailSender({ gmail: { senderName: 'Library OS', address: 'sender@gmail.com', appPassword: APP_PASSWORD } });
  const before = outbox.length;
  const emailed = await call('POST', '/api/admin/messaging/test-email', {
    token: ctx.tokens.sa,
    body: { to: 'victim@example.test' },
  });
  assert.equal(emailed.status, 200, JSON.stringify(emailed.body));
  assert.equal(emailed.body.captured, true);
  assert.equal(emailed.body.sent, false);
  assert.match(emailed.body.to, /@/);
  assert.notEqual(emailed.body.to, SA.email);
  assert.equal(outbox.length, before + 1);
  assert.equal(outbox.at(-1).to, SA.email);
  assert.equal(outbox.some(m => m.to === 'victim@example.test'), false);
  assert.equal(JSON.stringify(emailed.body).includes(APP_PASSWORD), false);

  openClient();
  await User.updateOne({ email: SA.email }, { $set: { mobile: '9000011111' } });
  const own = await call('POST', '/api/admin/messaging/test-whatsapp', {
    token: ctx.tokens.sa,
    body: { mobile: '9000022222' },
  });
  assert.equal(own.status, 200, JSON.stringify(own.body));
  assert.equal(own.body.to, '••••1111');
  assert.equal(sentWa.at(-1).number, '919000011111');
  assert.equal(sentWa.at(-1).instance, 'libos-system');
  assert.match(sentWa.at(-1).text, /test message/i);

  await User.updateOne({ email: SA.email }, { $unset: { mobile: '' } });
  const typed = await call('POST', '/api/admin/messaging/test-whatsapp', {
    token: ctx.tokens.sa,
    body: { mobile: '9000033333' },
  });
  assert.equal(typed.status, 200, JSON.stringify(typed.body));
  assert.equal(sentWa.at(-1).number, '919000033333');
  assert.equal(typed.body.to, '••••3333');

  setSystemEvolutionClient(null);
  clearSystemWhatsappCache();
  const down = await call('POST', '/api/admin/messaging/test-whatsapp', {
    token: ctx.tokens.sa,
    body: { mobile: '9000033333' },
  });
  assert.equal(down.status, 503);
});

test('forgot-password-mobile works from system WhatsApp when no custom SMS provider is set', async () => {
  resetRateLimits();
  setSmsProvider(null);
  sentWa.length = 0;
  openClient();
  const mobile = '9876512340';
  await User.updateOne({ email: 'admin-a@test.local' }, { $set: { mobile } });
  const closed = await call('POST', '/api/auth/forgot-password-mobile', { body: { mobile: '9000099999' } });
  assert.equal(closed.status, 200, 'unknown numbers stay generic');
  assert.equal(closed.body.maskedDestination, undefined);

  setSystemEvolutionClient({
    findInstance: async () => ({ connectionStatus: 'close' }),
    connectionState: async () => ({ instance: { state: 'close' } }),
    sendText: async () => { throw new Error('should not send'); },
  });
  clearSystemWhatsappCache();
  const blocked = await call('POST', '/api/auth/forgot-password-mobile', { body: { mobile } });
  assert.equal(blocked.status, 503);

  openClient();
  const sent = await call('POST', '/api/auth/forgot-password-mobile', { body: { mobile } });
  assert.equal(sent.status, 200, JSON.stringify(sent.body));
  assert.equal(sent.body.maskedDestination, undefined);
  const code = sentWa.at(-1).text.match(/code is (\d{6})/)[1];
  const reset = await call('POST', '/api/auth/reset-password-mobile', { body: { mobile, otp: code, newPassword: 'MobileNotice-1' } });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.equal(reset.body.maskedDestination, '••••2340');
  const notice = sentWa.at(-1).text;
  assert.equal(notice, PASSWORD_CHANGED_TEXT);
  assert.equal(notice.includes('MobileNotice-1'), false);
  ctx.tokens.a = await login('admin-a@test.local', 'MobileNotice-1');
  assert.ok(ctx.tokens.a);
});

test('email reset and logged-in change write a password-changed notice without the new password', async () => {
  resetRateLimits();
  outbox.length = 0;
  const forgot = await call('POST', '/api/auth/forgot-password', { body: { email: 'admin-b@test.local' } });
  assert.equal(forgot.status, 200);
  assert.equal(forgot.body.maskedDestination, undefined);
  const code = outbox.filter(m => m.to === 'admin-b@test.local' && /code is/.test(m.text || '')).at(-1).text.match(/code is (\d{6})/)[1];
  const reset = await call('POST', '/api/auth/reset-password', { body: { email: 'admin-b@test.local', otp: code, newPassword: 'EmailNotice-1' } });
  assert.equal(reset.status, 200, JSON.stringify(reset.body));
  assert.match(reset.body.maskedDestination, /^a\*+@test\.local$/);
  const notice = outbox.filter(m => m.to === 'admin-b@test.local' && m.text === PASSWORD_CHANGED_TEXT).at(-1);
  assert.ok(notice);
  assert.equal(notice.text.includes('EmailNotice-1'), false);
  ctx.tokens.b = await login('admin-b@test.local', 'EmailNotice-1');

  const changed = await call('POST', '/api/auth/change-password', {
    token: ctx.tokens.b,
    body: { currentPassword: 'EmailNotice-1', newPassword: 'EmailNotice-2' },
  });
  assert.equal(changed.status, 200);
  assert.ok(outbox.filter(m => m.to === 'admin-b@test.local' && m.text === PASSWORD_CHANGED_TEXT).length >= 2);
  assert.equal(outbox.some(m => String(m.text || '').includes('EmailNotice-2')), false);
});

test('a failed password-changed notice still leaves the password changed', async () => {
  const created = await createUser({
    mobile: '9000088888', name: 'Mobile Staff', role: 'staff', tenantId: 'lib-a', libraryId: 'lib-a',
    password: 'StaffPass-1', mobileVerified: true, authProviders: ['password'],
  });
  assert.ok(created.user);
  const token = await login('9000088888', 'StaffPass-1');
  assert.ok(token);
  setSmsProvider(null);
  setSystemEvolutionClient({
    findInstance: async () => ({ connectionStatus: 'open' }),
    connectionState: async () => ({ instance: { state: 'open' } }),
    sendText: async () => { throw new Error('gateway down'); },
  });
  clearSystemWhatsappCache();
  const changed = await call('POST', '/api/auth/change-password', {
    token,
    body: { currentPassword: 'StaffPass-1', newPassword: 'StaffPass-2' },
  });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.ok(await login('9000088888', 'StaffPass-2'));
  const fail = await Audit.findOne({ action: 'password.changed_notify_failed', actorId: String(created.user._id) }).lean();
  assert.ok(fail);
  assert.equal(JSON.stringify(fail).includes('StaffPass-2'), false);

  await updateGmailSender({ gmail: { clear: true } });
  delete process.env.SMTP_HOST;
  process.env.NODE_ENV = 'production';
  process.env.SMTP_HOST = '127.0.0.1';
  process.env.SMTP_PORT = '1';
  try {
    const emailFail = await call('POST', '/api/auth/change-password', {
      token: ctx.tokens.b,
      body: { currentPassword: 'EmailNotice-2', newPassword: 'EmailNotice-3' },
    });
    assert.equal(emailFail.status, 200, JSON.stringify(emailFail.body));
  } finally {
    process.env.NODE_ENV = 'test';
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
  }
  assert.ok(await login('admin-b@test.local', 'EmailNotice-3'));
  const emailAudit = await Audit.findOne({ action: 'password.changed_notify_failed', actorEmail: 'admin-b@test.local' }).lean();
  assert.ok(emailAudit);
  assert.equal(JSON.stringify(emailAudit).includes('EmailNotice-3'), false);
});

test('google reset notice is emailed to the account and does not include the new password', async () => {
  const { issueLinkedGooglePasswordReset } = await import('../src/accounts.js');
  resetRateLimits();
  const owner = await User.findOne({ email: 'admin-a@test.local' });
  owner.googleSub = 'google-sub-msg';
  await owner.save();
  const token = await issueLinkedGooglePasswordReset(owner, '127.0.0.1');
  const before = outbox.filter(m => m.to === 'admin-a@test.local' && m.text === PASSWORD_CHANGED_TEXT).length;
  const ok = await call('POST', '/api/auth/reset-password-google', { body: { token, newPassword: 'GoogleNotice-1' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.match(ok.body.message, /Google password was not changed/);
  assert.match(ok.body.maskedDestination, /@test\.local/);
  assert.notEqual(ok.body.maskedDestination, 'admin-a@test.local');
  const notices = outbox.filter(m => m.to === 'admin-a@test.local' && m.text === PASSWORD_CHANGED_TEXT);
  assert.equal(notices.length, before + 1);
  assert.equal(notices.at(-1).text.includes('GoogleNotice-1'), false);
  ctx.tokens.a = await login('admin-a@test.local', 'GoogleNotice-1');
});
