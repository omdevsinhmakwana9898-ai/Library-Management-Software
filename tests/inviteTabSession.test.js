import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

test('invite page uses a tab session and does not take over an existing login', () => {
  const app = read('../src/App.jsx');
  const api = read('../src/utils/api.js');
  const login = read('../src/auth/LoginScreen.jsx');
  const auth = read('../src/auth/AuthContext.jsx');
  const team = read('../src/components/TeamAccess.jsx');

  const router = app.slice(app.indexOf('const RoleRouter'), app.indexOf('const RoleRouter') + 2500);
  const inviteGate = router.indexOf('if (readInviteToken())');
  const authedGate = router.indexOf("status !== 'authenticated'");
  assert.ok(inviteGate >= 0 && inviteGate < authedGate);
  assert.match(router.slice(inviteGate, inviteGate + 400), /return <LoginScreen existingUser=/);

  assert.match(api, /inviteInfo: \(token\) => apiRequest\(`\/auth\/invite\/\$\{encodeURIComponent\(token\)\}`, \{ auth: false \}\)/);
  assert.match(api, /acceptInvite: async \(body\) => \{ const r = await apiRequest\('\/auth\/invite\/accept', \{ method: 'POST', body, auth: false \}\); setToken\(r\.token, \{ tab: true \}\); return r; \}/);
  assert.match(login, /id="invite-existing-session"/);
  assert.match(login, /You are signed in as \{existingUser\.name/);
  assert.match(login, /continue as invited user in this tab/);
  assert.match(login, /window\.history\.replaceState\(null, '', '\/'\)/);
  assert.match(login, /sessionStorage\.setItem\('library_invite_tab', '1'\)/);
  assert.match(auth, /setToken\(token, \{ tab \}\)/);
  assert.match(auth, /library_invite_tab/);

  assert.match(team, /window\.open\(`https:\/\/wa\.me\/\?text=\$\{encodeURIComponent\(text\)\}`, '_blank', 'noopener,noreferrer'\)/);
});
