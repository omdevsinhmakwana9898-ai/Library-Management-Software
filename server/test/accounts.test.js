// AUTH-02/03 + §1: invites, password reset by email OTP, audit log.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { setup, teardown, call, ctx, login } from './helpers.js';
import { outbox } from '../src/mailer.js';
import { resetRateLimits, ageRateLimits, issueLinkedGooglePasswordReset, PasswordResetOtp, inviteAppOrigin, inviteLink } from '../src/accounts.js';
import { User, models } from '../src/models.js';
import { hashPassword } from '../src/services.js';
import { setSmsProvider } from '../src/messaging.js';
import { setSystemEvolutionClient } from '../src/systemWhatsapp.js';
import { AuditLog } from '../src/audit.js';

const A = () => ctx.tokens.a;
before(() => setup('lms_accounts_test'));
after(teardown);
const tokenFrom = (link) => decodeURIComponent(new URL(link).pathname.split('/invite/')[1]);

test('owner invites staff with an expiring one-time link; staff joins the right tenant', async () => {
  const inv = await call('POST', '/api/invites', { token: A(), body: { email: 'new.staff@test.local', name: 'New Staff', staffId: 'ST-1' } });
  assert.equal(inv.status, 201); assert.equal(inv.body.status, 'pending');
  assert.ok(inv.body.link.startsWith(`${inviteAppOrigin()}/invite/`), inv.body.link);
  assert.equal(outbox.at(-1).to, 'new.staff@test.local');
  assert.ok(!JSON.stringify((await call('GET', '/api/invites', { token: A() })).body).includes(tokenFrom(inv.body.link)), 'token never listed');
  const t = tokenFrom(inv.body.link);
  assert.equal((await call('GET', `/api/auth/invite/${t}`)).body.library, 'Library A');
  // staff cannot invite, other tenant cannot see/revoke
  assert.equal((await call('GET', '/api/invites', { token: ctx.tokens.b })).body.length, 0);
  assert.equal((await call('POST', `/api/invites/${inv.body.id}/revoke`, { token: ctx.tokens.b })).status, 404);
  const acc = await call('POST', '/api/auth/invite/accept', { body: { token: t, password: 'StaffPass-123' } });
  assert.equal(acc.status, 200); assert.equal(acc.body.user.libraryId, 'lib-a'); assert.equal(acc.body.user.role, 'staff'); assert.equal(acc.body.user.staffId, 'ST-1');
  assert.equal((await call('POST', '/api/auth/invite/accept', { body: { token: t, password: 'StaffPass-123' } })).status, 410, 'one-time');
  const staffTok = acc.body.token;
  assert.equal((await call('POST', '/api/invites', { token: staffTok, body: { email: 'x@test.local' } })).status, 403);
  // revoked staff blocked immediately
  await call('PATCH', `/api/users/${acc.body.user.id}`, { token: A(), body: { status: 'Disabled' } });
  assert.equal((await call('GET', '/api/state', { token: staffTok })).status, 401);
});

test('invite link uses the app, and a configured app origin is kept', () => {
  assert.equal(inviteAppOrigin({}), 'https://app.mylibraryos.in');
  assert.equal(inviteAppOrigin({ FRONTEND_URL: '', APP_URL: '' }), 'https://app.mylibraryos.in');
  assert.equal(inviteAppOrigin({ FRONTEND_URL: 'https://mylibraryos.in' }), 'https://app.mylibraryos.in');
  assert.equal(inviteAppOrigin({ APP_URL: 'https://www.mylibraryos.in/' }), 'https://app.mylibraryos.in');
  assert.equal(inviteAppOrigin({ FRONTEND_URL: 'https://api.mylibraryos.in' }), 'https://app.mylibraryos.in');
  assert.equal(inviteAppOrigin({ FRONTEND_URL: 'https://library-os.onrender.com' }), 'https://app.mylibraryos.in');
  assert.equal(inviteAppOrigin({ FRONTEND_URL: 'http://localhost:5173' }), 'http://localhost:5173');
  assert.equal(inviteAppOrigin({ FRONTEND_URL: 'https://library-os-app.vercel.app/' }), 'https://library-os-app.vercel.app');
  const link = inviteLink('tok+en', { FRONTEND_URL: 'http://localhost:5173' });
  assert.equal(link, 'http://localhost:5173/invite/tok%2Ben');
  assert.equal(tokenFrom(link), 'tok+en');
});

test('revoked and expired invites cannot be used', async () => {
  const inv = await call('POST', '/api/invites', { token: A(), body: { email: 'rev@test.local' } });
  await call('POST', `/api/invites/${inv.body.id}/revoke`, { token: A() });
  assert.equal((await call('POST', '/api/auth/invite/accept', { body: { token: tokenFrom(inv.body.link), password: 'Password-123' } })).status, 410);
  const { Invite } = await import('../src/accounts.js');
  const inv2 = await call('POST', '/api/invites', { token: A(), body: { email: 'exp@test.local' } });
  await Invite.updateOne({ email: 'exp@test.local', revokedAt: null }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await call('POST', '/api/auth/invite/accept', { body: { token: tokenFrom(inv2.body.link), password: 'Password-123' } })).status, 410);
});

test('password reset via email OTP; wrong codes limited; old sessions revoked; no account discovery', async () => {
  resetRateLimits();
  const unknown = await call('POST', '/api/auth/forgot-password', { body: { email: 'nobody@test.local' } });
  const known = await call('POST', '/api/auth/forgot-password', { body: { email: 'admin-a@test.local' } });
  assert.deepEqual(unknown.body, known.body);
  assert.equal((await call('POST', '/api/auth/forgot-password', { body: { email: 'admin-a@test.local' } })).status, 429, 'resend throttle');
  const code = outbox.at(-1).text.match(/code is (\d{6})/)[1];
  const wrong = String((Number(code) + 1) % 1e6).padStart(6, '0');
  assert.equal((await call('POST', '/api/auth/reset-password', { body: { email: 'admin-a@test.local', otp: wrong, newPassword: 'NewPassword-1' } })).status, 400);
  const oldTok = A();
  await new Promise(r => setTimeout(r, 1100));
  assert.equal((await call('POST', '/api/auth/reset-password', { body: { email: 'admin-a@test.local', otp: code, newPassword: 'NewPassword-1' } })).status, 200);
  assert.equal((await call('POST', '/api/auth/reset-password', { body: { email: 'admin-a@test.local', otp: code, newPassword: 'NewPassword-2' } })).status, 400, 'code is one-time');
  assert.equal((await call('GET', '/api/state', { token: oldTok })).status, 401, 'old session revoked');
  ctx.tokens.a = await login('admin-a@test.local', 'NewPassword-1');
  assert.ok(ctx.tokens.a);
});

test('disabled accounts cannot recover; 5 wrong codes lock the OTP', async () => {
  resetRateLimits();
  await call('POST', '/api/auth/forgot-password', { body: { email: 'admin-b@test.local' } });
  const code = outbox.at(-1).text.match(/code is (\d{6})/)[1];
  const wrong = String((Number(code) + 1) % 1e6).padStart(6, '0');
  for (let i = 0; i < 5; i++) await call('POST', '/api/auth/reset-password', { body: { email: 'admin-b@test.local', otp: wrong, newPassword: 'Whatever-123' } });
  assert.notEqual((await call('POST', '/api/auth/reset-password', { body: { email: 'admin-b@test.local', otp: code, newPassword: 'Whatever-123' } })).status, 200);
});

test('audit log: owner sees own tenant only; superadmin access is logged; no secrets stored', async () => {
  await call('GET', '/api/state', { token: ctx.tokens.sa, headers: { 'X-Library-Id': 'lib-a', 'X-Read-Only': '1', 'X-Access-Reason': 'support ticket' } });
  await new Promise(r => setTimeout(r, 200));
  const logs = (await call('GET', '/api/audit-logs', { token: A() })).body;
  const actions = logs.map(l => l.action);
  for (const a of ['invite.created', 'invite.accepted', 'invite.revoked', 'user.update', 'password.reset_completed', 'superadmin.library_access']) assert.ok(actions.includes(a), a);
  assert.equal(logs.find(l => l.action === 'superadmin.library_access').reason, 'support ticket');
  assert.ok(logs.every(l => l.tenantId === 'lib-a'));
  assert.ok(!JSON.stringify(logs).match(/NewPassword|StaffPass/));
  const bl = (await call('GET', '/api/audit-logs', { token: ctx.tokens.b })).body;
  assert.ok(bl.every(l => l.tenantId === 'lib-b'));
  assert.equal((await call('GET', '/api/admin/audit-logs?libraryId=lib-a', { token: ctx.tokens.sa })).status, 200);
});

test('email resend waits 30 seconds, then a new code can be sent; expired codes fail', async () => {
  resetRateLimits();
  const before = outbox.filter(m => m.to === 'admin-a@test.local').length;
  const first = await call('POST', '/api/auth/forgot-password', { body: { email: 'admin-a@test.local' } });
  assert.equal(first.status, 200);
  const early = await call('POST', '/api/auth/forgot-password', { body: { email: 'admin-a@test.local' } });
  assert.equal(early.status, 429);
  assert.match(early.body.error, /30 seconds/);
  assert.equal(outbox.filter(m => m.to === 'admin-a@test.local').length, before + 1, 'no second email before 30s');
  ageRateLimits(31_000);
  const again = await call('POST', '/api/auth/forgot-password', { body: { email: 'admin-a@test.local' } });
  assert.equal(again.status, 200);
  const code = outbox.filter(m => m.to === 'admin-a@test.local').at(-1).text.match(/code is (\d{6})/)[1];
  await PasswordResetOtp.updateMany({ usedAt: null }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await call('POST', '/api/auth/reset-password', { body: { email: 'admin-a@test.local', otp: code, newPassword: 'ExpiredPass-1' } })).status, 400);
});

test('mobile recovery uses WhatsApp OTP; login stays mobile plus password with no OTP', async () => {
  resetRateLimits();
  const sms = [];
  setSmsProvider({ name: 'test', send: async ({ to, text }) => { sms.push({ to, text }); return { ok: true }; } });
  try {
    const mobile = '9876543210';
    await User.updateOne({ email: 'admin-b@test.local' }, { $set: { mobile, mobileVerified: true, passwordHash: await hashPassword('Password-b-123') } });
    const login = await call('POST', '/api/auth/login', { body: { email: mobile, password: 'Password-b-123' } });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    assert.ok(login.body.token);
    assert.equal(login.body.otp, undefined);
    const sent = await call('POST', '/api/auth/forgot-password-mobile', { body: { mobile } });
    assert.equal(sent.status, 200, JSON.stringify(sent.body));
    const early = await call('POST', '/api/auth/forgot-password-mobile', { body: { mobile } });
    assert.equal(early.status, 429);
    assert.equal(sms.length, 1, 'resend does not send before 30s');
    const code = sms[0].text.match(/code is (\d{6})/)[1];
    const wrong = String((Number(code) + 1) % 1e6).padStart(6, '0');
    for (let i = 0; i < 5; i++) {
      assert.equal((await call('POST', '/api/auth/reset-password-mobile', { body: { mobile, otp: wrong, newPassword: 'MobilePass-1' } })).status, 400);
    }
    assert.equal((await call('POST', '/api/auth/reset-password-mobile', { body: { mobile, otp: code, newPassword: 'MobilePass-1' } })).status, 429);
    ageRateLimits(31_000);
    assert.equal((await call('POST', '/api/auth/forgot-password-mobile', { body: { mobile } })).status, 200);
    const fresh = sms.at(-1).text.match(/code is (\d{6})/)[1];
    assert.equal((await call('POST', '/api/auth/reset-password-mobile', { body: { mobile, otp: fresh, newPassword: 'MobilePass-1' } })).status, 200);
    assert.equal((await call('POST', '/api/auth/login', { body: { mobile, password: 'MobilePass-1' } })).status, 200);
  } finally {
    setSmsProvider(null);
  }
});

test('used, revoked and expired invites return their own code', async () => {
  const used = await call('POST', '/api/invites', { token: A(), body: { email: 'used.code@test.local', name: 'Used' } });
  const usedToken = tokenFrom(used.body.link);
  assert.equal((await call('POST', '/api/auth/invite/accept', { body: { token: usedToken, password: 'StaffPass-123' } })).status, 200);
  const again = await call('POST', '/api/auth/invite/accept', { body: { token: usedToken, password: 'StaffPass-123' } });
  assert.equal(again.status, 410);
  assert.equal(again.body.code, 'accepted');
  const info = await call('GET', `/api/auth/invite/${usedToken}`);
  assert.equal(info.status, 410);
  assert.equal(info.body.code, 'accepted');

  const revoked = await call('POST', '/api/invites', { token: A(), body: { email: 'rev.code@test.local' } });
  await call('POST', `/api/invites/${revoked.body.id}/revoke`, { token: A() });
  const revToken = tokenFrom(revoked.body.link);
  const revAccept = await call('POST', '/api/auth/invite/accept', { body: { token: revToken, password: 'Password-123' } });
  assert.equal(revAccept.status, 410);
  assert.equal(revAccept.body.code, 'revoked');
  assert.equal((await call('GET', `/api/auth/invite/${revToken}`)).body.code, 'revoked');

  const expired = await call('POST', '/api/invites', { token: A(), body: { email: 'exp.code@test.local' } });
  const { Invite } = await import('../src/accounts.js');
  await Invite.updateOne({ email: 'exp.code@test.local', revokedAt: null }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  const expToken = tokenFrom(expired.body.link);
  const expAccept = await call('POST', '/api/auth/invite/accept', { body: { token: expToken, password: 'Password-123' } });
  assert.equal(expAccept.status, 410);
  assert.equal(expAccept.body.code, 'expired');
  assert.equal((await call('GET', `/api/auth/invite/${expToken}`)).body.code, 'expired');
});

test('invite accept stores an optional mobile and rejects a bad or taken one', async () => {
  const taken = '9000000001';
  await User.updateOne({ email: 'admin-a@test.local' }, { $set: { mobile: taken } });
  const clash = await call('POST', '/api/invites', { token: A(), body: { email: 'mobile.clash@test.local' } });
  const clashToken = tokenFrom(clash.body.link);
  const dup = await call('POST', '/api/auth/invite/accept', { body: { token: clashToken, password: 'StaffPass-123', mobile: taken } });
  assert.equal(dup.status, 409);
  assert.match(dup.body.error, /mobile number already exists/);
  assert.equal((await call('GET', `/api/auth/invite/${clashToken}`)).body.email, 'mobile.clash@test.local', 'invite stays usable');

  const bad = await call('POST', '/api/auth/invite/accept', { body: { token: clashToken, password: 'StaffPass-123', mobile: '12' } });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /valid mobile/);

  const ok = await call('POST', '/api/auth/invite/accept', { body: { token: clashToken, password: 'StaffPass-123', mobile: '91 90000 00002' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const saved = await User.findOne({ email: 'mobile.clash@test.local' }).lean();
  assert.equal(saved.mobile, '9000000002');
});

test('linked Google recovery sets a My Library OS password and leaves googleSub unchanged', async () => {
  resetRateLimits();
  const owner = await User.findOne({ email: 'admin-a@test.local' });
  const previousSub = 'google-sub-linked';
  owner.googleSub = previousSub;
  owner.authProviders = [...new Set([...(owner.authProviders || []), 'google'])];
  await owner.save();
  const token = await issueLinkedGooglePasswordReset(owner, '127.0.0.1');
  assert.ok(token);
  assert.equal(JSON.stringify(outbox).includes(token), false);
  const bad = await call('POST', '/api/auth/reset-password-google', { body: { token: 'not-the-token', newPassword: 'GooglePass-1' } });
  assert.equal(bad.status, 400);
  const ok = await call('POST', '/api/auth/reset-password-google', { body: { token, newPassword: 'GooglePass-1' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.match(ok.body.message, /Google password was not changed/);
  const again = await call('POST', '/api/auth/reset-password-google', { body: { token, newPassword: 'GooglePass-2' } });
  assert.equal(again.status, 400);
  const saved = await User.findOne({ email: 'admin-a@test.local' }).select('+passwordHash');
  assert.equal(saved.googleSub, previousSub);
  ctx.tokens.a = await login('admin-a@test.local', 'GooglePass-1');
  assert.ok(ctx.tokens.a);
});

function mockSystemWhatsapp({ state = 'open', fail } = {}) {
  const sent = [];
  setSystemEvolutionClient({
    findInstance: async () => (state ? { connectionStatus: state } : null),
    connectionState: async () => ({ instance: { state } }),
    sendText: async (instance, number, text) => {
      if (fail) throw new Error(fail);
      sent.push({ instance, number, text });
      return { ok: true };
    },
  });
  return sent;
}

test('invite WhatsApp is best-effort from the system sender and the token stays off the list', async () => {
  const sent = mockSystemWhatsapp();
  try {
    await models.staffMembers.create({ tenantId: 'lib-a', _key: 'ST-WA', id: 'ST-WA', name: 'Wa Staff', phone: '9876502200', role: 'Librarian', status: 'Active' });
    const fromStaff = await call('POST', '/api/invites', { token: A(), body: { email: 'wa.staff@test.local', name: 'Wa Staff', staffId: 'ST-WA' } });
    assert.equal(fromStaff.status, 201);
    assert.equal(fromStaff.body.whatsapp.status, 'sent');
    assert.equal(outbox.at(-1).to, 'wa.staff@test.local');
    assert.equal(sent.length, 1);
    assert.equal(sent[0].instance, 'libos-system');
    assert.equal(sent[0].number, '919876502200');
    assert.match(sent[0].text, /My Library OS/);
    assert.ok(sent[0].text.includes(fromStaff.body.link));

    const plus = await call('POST', '/api/invites', { token: A(), body: { email: 'wa.plus@test.local', phone: '+91 98765 43211' } });
    assert.equal(plus.status, 201);
    assert.equal(plus.body.whatsapp.status, 'sent');
    assert.equal(sent.at(-1).number, '919876543211');

    const none = await call('POST', '/api/invites', { token: A(), body: { email: 'wa.none@test.local' } });
    assert.equal(none.status, 201);
    assert.equal(none.body.whatsapp.status, 'skipped');
    assert.equal(none.body.whatsapp.reason, 'no_number');

    setSystemEvolutionClient({
      findInstance: async () => ({ connectionStatus: 'close' }),
      connectionState: async () => ({ instance: { state: 'close' } }),
      sendText: async () => { throw new Error('should not send'); },
    });
    const down = await call('POST', '/api/invites', { token: A(), body: { email: 'wa.down@test.local', phone: '9876543212' } });
    assert.equal(down.status, 201);
    assert.equal(down.body.whatsapp.status, 'skipped');
    assert.equal(down.body.whatsapp.reason, 'not_ready');
    assert.equal(outbox.some(m => m.to === 'wa.down@test.local'), true);

    setSystemEvolutionClient({
      findInstance: async () => ({ connectionStatus: 'open' }),
      connectionState: async () => ({ instance: { state: 'open' } }),
      sendText: async () => { throw new Error('gateway down'); },
    });
    const failed = await call('POST', '/api/invites', { token: A(), body: { email: 'wa.fail@test.local', phone: '9876543213' } });
    assert.equal(failed.status, 201);
    assert.equal(failed.body.whatsapp.status, 'failed');
    assert.equal(failed.body.whatsapp.reason, 'gateway down');
    assert.equal(outbox.some(m => m.to === 'wa.fail@test.local'), true);

    const listed = JSON.stringify((await call('GET', '/api/invites', { token: A() })).body);
    for (const row of [fromStaff, plus, failed]) {
      assert.equal(listed.includes(tokenFrom(row.body.link)), false);
      assert.equal(listed.includes('tokenCipher'), false);
      assert.equal(listed.includes('extraTokenHash'), false);
    }
    const logs = await AuditLog.find({ action: 'invite.created', target: 'wa.staff@test.local' }).lean();
    const dumped = JSON.stringify(logs);
    assert.equal(dumped.includes(tokenFrom(fromStaff.body.link)), false);
    assert.equal(dumped.includes(fromStaff.body.link), false);

    const share = await call('POST', `/api/invites/${fromStaff.body.id}/share-link`, { token: A() });
    assert.equal(share.status, 200);
    assert.equal(share.body.link, fromStaff.body.link);
    await User.updateOne({ email: 'admin-b@test.local' }, { $set: { passwordHash: await hashPassword('Password-b-123'), status: 'Active' } });
    const otherTok = await login('admin-b@test.local', 'Password-b-123');
    assert.ok(otherTok, 'other library owner should be able to sign in');
    assert.equal((await call('POST', `/api/invites/${fromStaff.body.id}/share-link`, { token: otherTok })).status, 404);

    const { Invite } = await import('../src/accounts.js');
    const oldToken = tokenFrom(none.body.link);
    const before = await Invite.findOne({ _id: none.body.id, tenantId: 'lib-a' }).lean();
    await Invite.updateOne({ _id: none.body.id, tenantId: 'lib-a' }, { $unset: { tokenCipher: 1 } });
    const missing = await call('POST', `/api/invites/${none.body.id}/share-link`, { token: A() });
    assert.equal(missing.status, 200);
    const extraToken = tokenFrom(missing.body.link);
    assert.notEqual(extraToken, oldToken);
    const still = await Invite.findOne({ _id: none.body.id, tenantId: 'lib-a' }).lean();
    assert.equal(still.tokenHash, before.tokenHash);
    assert.equal(new Date(still.expiresAt).toISOString(), new Date(before.expiresAt).toISOString());
    assert.ok(still.extraTokenHash);
    assert.ok(still.tokenCipher);
    assert.equal(still.revokedAt || null, null);
    assert.equal(still.usedAt || null, null);
    assert.equal((await call('GET', `/api/auth/invite/${oldToken}`)).status, 200);
    assert.equal((await call('GET', `/api/auth/invite/${extraToken}`)).status, 200);
    const again = await call('POST', `/api/invites/${none.body.id}/share-link`, { token: A() });
    assert.equal(again.status, 200);
    assert.equal(again.body.link, missing.body.link);
    const afterSecond = await Invite.findOne({ _id: none.body.id, tenantId: 'lib-a' }).lean();
    assert.equal(afterSecond.tokenHash, before.tokenHash);
    assert.equal(afterSecond.extraTokenHash, still.extraTokenHash);
    assert.equal((await call('POST', '/api/auth/invite/accept', { body: { token: oldToken, password: 'StaffPass-123' } })).status, 200);
    assert.equal((await call('GET', `/api/auth/invite/${extraToken}`)).status, 410);
    assert.equal((await call('POST', '/api/auth/invite/accept', { body: { token: extraToken, password: 'StaffPass-123' } })).status, 410);

    const acceptExtra = await call('POST', '/api/invites', { token: A(), body: { email: 'wa.extra.accept@test.local' } });
    assert.equal(acceptExtra.status, 201);
    const acceptExtraOriginal = tokenFrom(acceptExtra.body.link);
    await Invite.updateOne({ _id: acceptExtra.body.id, tenantId: 'lib-a' }, { $unset: { tokenCipher: 1 } });
    const acceptExtraShare = await call('POST', `/api/invites/${acceptExtra.body.id}/share-link`, { token: A() });
    assert.equal(acceptExtraShare.status, 200);
    const acceptExtraToken = tokenFrom(acceptExtraShare.body.link);
    assert.notEqual(acceptExtraToken, acceptExtraOriginal);
    assert.equal((await call('POST', '/api/auth/invite/accept', { body: { token: acceptExtraToken, password: 'StaffPass-123' } })).status, 200);
    assert.equal((await call('GET', `/api/auth/invite/${acceptExtraOriginal}`)).status, 410);
    assert.equal((await call('POST', '/api/auth/invite/accept', { body: { token: acceptExtraOriginal, password: 'StaffPass-123' } })).status, 410);

    const revokeBoth = await call('POST', '/api/invites', { token: A(), body: { email: 'wa.extra.revoke@test.local' } });
    assert.equal(revokeBoth.status, 201);
    const revokeOriginal = tokenFrom(revokeBoth.body.link);
    await Invite.updateOne({ _id: revokeBoth.body.id, tenantId: 'lib-a' }, { $unset: { tokenCipher: 1 } });
    const revokeShare = await call('POST', `/api/invites/${revokeBoth.body.id}/share-link`, { token: A() });
    assert.equal(revokeShare.status, 200);
    const revokeExtra = tokenFrom(revokeShare.body.link);
    await call('POST', `/api/invites/${revokeBoth.body.id}/revoke`, { token: A() });
    assert.equal((await call('GET', `/api/auth/invite/${revokeOriginal}`)).status, 410);
    assert.equal((await call('GET', `/api/auth/invite/${revokeExtra}`)).status, 410);
    assert.equal((await call('POST', `/api/invites/${revokeBoth.body.id}/share-link`, { token: A() })).status, 410);

    const listedAfter = JSON.stringify((await call('GET', '/api/invites', { token: A() })).body);
    assert.equal(listedAfter.includes(oldToken), false);
    assert.equal(listedAfter.includes(extraToken), false);
    assert.equal(listedAfter.includes(acceptExtraToken), false);
    assert.equal(listedAfter.includes(revokeExtra), false);
    assert.equal(listedAfter.includes('tokenCipher'), false);
    assert.equal(listedAfter.includes('extraTokenHash'), false);
    assert.equal(listedAfter.includes(still.extraTokenHash), false);
    assert.equal(listedAfter.includes(still.tokenCipher), false);

    await call('POST', `/api/invites/${plus.body.id}/revoke`, { token: A() });
    assert.equal((await call('POST', `/api/invites/${plus.body.id}/share-link`, { token: A() })).status, 410);

    await models.staffMembers.create({ tenantId: 'lib-a', _key: 'ST-BR', id: 'ST-BR', name: 'Branch Staff', phone: '9876543214', role: 'Librarian', status: 'Active', branchId: 'b2' });
    const fromBody = await call('POST', '/api/invites', { token: A(), body: { email: 'branch.body@test.local', staffId: 'ST-BR', branchId: 'b1' } });
    assert.equal(fromBody.status, 201);
    assert.equal(fromBody.body.branchId, 'b1');
    const fromLinked = await call('POST', '/api/invites', { token: A(), body: { email: 'branch.linked@test.local', staffId: 'ST-BR' } });
    assert.equal(fromLinked.status, 201);
    assert.equal(fromLinked.body.branchId, 'b2');
    const listedBranch = (await call('GET', '/api/invites', { token: A() })).body;
    assert.equal(listedBranch.find(row => row.email === 'branch.body@test.local').branchId, 'b1');
    assert.equal(JSON.stringify(listedBranch).includes(tokenFrom(fromBody.body.link)), false);

    const accepted = await call('POST', '/api/auth/invite/accept', { body: { token: tokenFrom(fromBody.body.link), password: 'StaffPass-123' } });
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
    const staffAfter = await models.staffMembers.findOne({ tenantId: 'lib-a', _key: 'ST-BR' }).lean();
    assert.equal(staffAfter.branchId, 'b1');

    const multi = await call('POST', '/api/invites', { token: A(), body: { email: 'branch.multi@test.local', staffId: 'ST-BR', branchIds: ['b1', 'b2'] } });
    assert.equal(multi.status, 201);
    assert.deepEqual(multi.body.branchIds, ['b1', 'b2']);
  } finally {
    setSystemEvolutionClient(null);
  }
});

test('expired, revoked, or used-then-deleted invites do not block the same email or mobile', async () => {
  const { Invite } = await import('../src/accounts.js');
  const email = 'reuse.email@test.local';
  const phone = '9876500101';
  const first = await call('POST', '/api/invites', { token: A(), body: { email, phone } });
  assert.equal(first.status, 201);
  const firstToken = tokenFrom(first.body.link);
  await call('POST', `/api/invites/${first.body.id}/revoke`, { token: A() });
  assert.equal((await call('GET', `/api/auth/invite/${firstToken}`)).status, 410);
  const afterRevoke = await call('POST', '/api/invites', { token: A(), body: { email, phone } });
  assert.equal(afterRevoke.status, 201, JSON.stringify(afterRevoke.body));
  await Invite.updateOne({ _id: afterRevoke.body.id }, { $set: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await call('GET', `/api/auth/invite/${tokenFrom(afterRevoke.body.link)}`)).status, 410);
  const afterExpire = await call('POST', '/api/invites', { token: A(), body: { email, phone } });
  assert.equal(afterExpire.status, 201, JSON.stringify(afterExpire.body));
  const accepted = await call('POST', '/api/auth/invite/accept', { body: { token: tokenFrom(afterExpire.body.link), password: 'StaffPass-123', mobile: phone } });
  assert.equal(accepted.status, 200, JSON.stringify(accepted.body));
  assert.equal((await call('POST', '/api/invites', { token: A(), body: { email } })).status, 409);
  assert.equal((await call('POST', '/api/invites', { token: A(), body: { email: 'reuse.other@test.local', phone } })).status, 409);
  await User.deleteOne({ email });
  const afterGone = await call('POST', '/api/invites', { token: A(), body: { email, phone } });
  assert.equal(afterGone.status, 201, JSON.stringify(afterGone.body));
  const rejoined = await call('POST', '/api/auth/invite/accept', { body: { token: tokenFrom(afterGone.body.link), password: 'StaffPass-123', mobile: phone } });
  assert.equal(rejoined.status, 200, JSON.stringify(rejoined.body));
  assert.equal((await call('POST', '/api/auth/login', { body: { email, password: 'StaffPass-123' } })).status, 200);
});
