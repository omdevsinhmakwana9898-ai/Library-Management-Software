import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dashboard = readFileSync(new URL('../src/auth/SuperAdminDashboard.jsx', import.meta.url), 'utf8');
const messaging = readFileSync(new URL('../src/auth/MessagingAdmin.jsx', import.meta.url), 'utf8');
const whatsapp = readFileSync(new URL('../src/auth/SystemWhatsAppAdmin.jsx', import.meta.url), 'utf8');
const api = readFileSync(new URL('../src/utils/api.js', import.meta.url), 'utf8');

test('Super Admin messaging tab keeps system WhatsApp and adds a Gmail sender', () => {
  assert.match(dashboard, /id="sa-tab-messaging"/);
  assert.match(dashboard, />Messaging</);
  assert.match(dashboard, /MessagingAdmin/);
  assert.match(messaging, /Messaging \/ Sender settings/);
  assert.match(messaging, /id="gmail-sender-name"/);
  assert.match(messaging, /id="gmail-address"/);
  assert.match(messaging, /id="gmail-app-password"/);
  assert.match(messaging, /id="gmail-test-email"/);
  assert.match(messaging, /id="system-whatsapp-test"/);
  assert.match(messaging, /SystemWhatsAppAdmin/);
  assert.match(whatsapp, /systemWhatsappConnect/);
  assert.match(api, /\/admin\/messaging\/config/);
  assert.match(api, /\/admin\/messaging\/test-email/);
  assert.match(api, /\/admin\/messaging\/test-whatsapp/);
  assert.match(api, /\/admin\/system-whatsapp\/connect/);
});
