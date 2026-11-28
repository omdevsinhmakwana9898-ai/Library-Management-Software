import test from 'node:test';
import assert from 'node:assert/strict';
import { appSignupHash, readSignupIntent } from '../src/auth/signupIntent.js';

const loc = (partial) => ({ pathname: '/', search: '', hash: '', ...partial });

test('sign in stays the default when the URL has no signup flag', () => {
  assert.deepEqual(readSignupIntent(loc({})), { openSignup: false, planId: '' });
  assert.deepEqual(readSignupIntent(loc({ hash: '#login' })), { openSignup: false, planId: '' });
  assert.deepEqual(readSignupIntent(loc({ search: '?next=/dashboard' })), { openSignup: false, planId: '' });
  assert.deepEqual(readSignupIntent(null), { openSignup: false, planId: '' });
});

test('hash or query signup opens Create account, and can carry a plan id', () => {
  assert.deepEqual(readSignupIntent(loc({ hash: '#signup' })), { openSignup: true, planId: '' });
  assert.deepEqual(readSignupIntent(loc({ hash: '#signup&plan=standard' })), { openSignup: true, planId: 'standard' });
  assert.deepEqual(readSignupIntent(loc({ hash: '#?signup=1&plan=premium' })), { openSignup: true, planId: 'premium' });
  assert.deepEqual(readSignupIntent(loc({ search: '?signup=1&plan=advanced' })), { openSignup: true, planId: 'advanced' });
  assert.equal(readSignupIntent(loc({ hash: '#signingup' })).openSignup, false);
});

test('existing referral hash still opens Create account', () => {
  assert.deepEqual(readSignupIntent(loc({ hash: '#referral=ABC123' })), { openSignup: true, planId: '' });
});

test('invite-only URLs do not open Create account', () => {
  assert.equal(readSignupIntent(loc({ hash: '#invite=token' })).openSignup, false);
});

test('appSignupHash builds the Create account deep link', () => {
  assert.equal(appSignupHash(), '#signup');
  assert.equal(appSignupHash('standard'), '#signup&plan=standard');
});
