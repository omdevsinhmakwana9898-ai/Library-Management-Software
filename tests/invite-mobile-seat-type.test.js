import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const login = read('../src/auth/LoginScreen.jsx');
const wizard = read('../src/components/SetupWizard.jsx');
const settings = read('../src/components/LibrarySettings.jsx');

test('invite errors name accepted, expired and revoked, and accepted says Sign in', () => {
  assert.match(login, /code === 'accepted'/);
  assert.match(login, /This invite was already accepted\. Please sign in\./);
  assert.match(login, /This invite link has expired\./);
  assert.match(login, /This invite has been revoked\./);
  assert.match(login, /This invite link is invalid, expired or already used\./);
  assert.match(login, /inviteErrorCode === 'accepted' \? 'Sign in' : 'Go to sign in'/);
  assert.match(login, /id="forgot-password-link"/);
});

test('invite accept form has an optional mobile field', () => {
  assert.match(login, /id="invite-mobile"/);
  assert.match(login, /Mobile number \(optional\)/);
  assert.match(login, /inviteMobile\.trim\(\) \? \{ mobile: inviteMobile\.trim\(\) \}/);
});

test('invite accept already lets staff choose a password and signs them in', () => {
  assert.match(login, /Choose a password/);
  assert.match(login, /id="invite-password"/);
  assert.match(login, /id="invite-confirm-password"/);
  assert.match(login, /At least 8 characters\. You will be signed in after you join\./);
  assert.match(login, /invitePassword\.length < 8/);
  assert.match(login, /invitePassword !== inviteConfirm/);
  assert.match(login, /completeLogin\(result\)/);
});

test('desk seat type resets on scope change and stays in the current section', () => {
  assert.match(wizard, /setSelectedSeatTypeId\(''\)/);
  assert.match(wizard, /\[selectedSectionId, selectedBranchId\]/);
  assert.match(wizard, /selectedInScope \? selectedSeatTypeId : \(fixedTypes\[0\]\?\.id \|\| ''\)/);
  assert.doesNotMatch(wizard, /fixedTypes\[0\]\?\.id \|\| currentScopeSeatTypes\[0\]/);
  assert.match(wizard, /Select seat type/);
});

test('new seat types do not default to Fixed', () => {
  assert.match(wizard, /allocationMode: ''/);
  assert.match(wizard, /Select allocation mode/);
  assert.match(wizard, /value=\{st\.allocationMode \|\| ''\}/);
  assert.match(wizard, /Choose Fixed or Non-Fixed for every seat type/);
  assert.match(wizard, /Standard Fixed/);
  assert.match(settings, /useState\(''\)/);
  assert.match(settings, /setNewSeatTypeMode\(''\)/);
  assert.match(settings, /Select allocation mode/);
  assert.match(settings, /Choose Fixed or Non-Fixed/);
  assert.match(settings, /st\.allocationMode \|\| 'Fixed'/);
});
