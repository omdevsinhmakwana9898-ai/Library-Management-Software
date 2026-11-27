import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../utils/api';
import { SystemWhatsAppAdmin } from './SystemWhatsAppAdmin';

const emptyGmail = { senderName: '', address: '', appPassword: '' };

export function MessagingAdmin({ accountMobile = '' }) {
  const [gmail, setGmail] = useState(emptyGmail);
  const [saved, setSaved] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [testMobile, setTestMobile] = useState('');

  useEffect(() => {
    let cancelled = false;
    api.adminMessagingConfig()
      .then(cfg => {
        if (cancelled) return;
        setSaved(cfg);
        setGmail({ senderName: cfg?.gmail?.senderName || '', address: cfg?.gmail?.address || '', appPassword: '' });
      })
      .catch(err => { if (!cancelled) toast.error(err.message || 'Could not load messaging settings'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const saveGmail = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        gmail: {
          senderName: gmail.senderName,
          address: gmail.address,
          ...(gmail.appPassword ? { appPassword: gmail.appPassword } : {}),
        },
      };
      const cfg = await api.adminUpdateMessagingConfig(body);
      setSaved(cfg);
      setGmail(g => ({ ...g, appPassword: '' }));
      toast.success(cfg?.gmail?.configured ? 'Gmail sender saved' : 'Gmail sender updated');
    } catch (err) {
      toast.error(err.message || 'Could not save Gmail sender');
    } finally { setBusy(false); }
  };

  const sendTestEmail = async () => {
    setBusy(true);
    try {
      const r = await api.adminTestMessagingEmail();
      toast.success(r?.sent ? `Test email sent to ${r.to}` : `Test email recorded for ${r.to}`);
    } catch (err) {
      toast.error(err.message || 'Test email failed');
    } finally { setBusy(false); }
  };

  const sendTestWhatsapp = async (e) => {
    e?.preventDefault();
    setBusy(true);
    try {
      const r = await api.adminTestMessagingWhatsapp(accountMobile ? {} : { mobile: testMobile });
      toast.success(`Test WhatsApp sent to ${r.to}`);
    } catch (err) {
      toast.error(err.message || 'Test WhatsApp failed');
    } finally { setBusy(false); }
  };

  return (
    <div id="messaging-settings" style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontSize: 18, fontWeight: 700, margin: '0 0 4px' }}>Messaging / Sender settings</h2>
        <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
          Platform email uses this Gmail sender when it is saved. Otherwise My Library OS keeps using the server SMTP sender. WhatsApp uses the connected system number.
        </p>
      </div>

      <form className="premium-card" onSubmit={saveGmail} style={{ padding: 16, display: 'grid', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Gmail sender</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          {loading ? 'Loading…' : saved?.gmail?.configured
            ? `Saved sender ${saved.gmail.senderName ? `${saved.gmail.senderName} ` : ''}<${saved.gmail.address}>. App password is stored encrypted.`
            : 'No Gmail sender saved. Platform mail still uses the server SMTP settings.'}
        </p>
        <div className="form-group">
          <label className="form-label" htmlFor="gmail-sender-name">Sender name</label>
          <input id="gmail-sender-name" className="form-input" value={gmail.senderName} onChange={e => setGmail(g => ({ ...g, senderName: e.target.value }))} placeholder={saved?.gmail?.senderName || 'My Library OS'} autoComplete="organization" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="gmail-address">Gmail address</label>
          <input id="gmail-address" className="form-input" type="email" value={gmail.address} onChange={e => setGmail(g => ({ ...g, address: e.target.value }))} placeholder={saved?.gmail?.address || 'sender@gmail.com'} autoComplete="off" />
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="gmail-app-password">Gmail app password {saved?.gmail?.appPasswordSet ? '(saved ••••••••)' : ''}</label>
          <input id="gmail-app-password" className="form-input" type="password" value={gmail.appPassword} onChange={e => setGmail(g => ({ ...g, appPassword: e.target.value }))} placeholder={saved?.gmail?.appPasswordSet ? 'Leave blank to keep' : ''} autoComplete="new-password" />
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button id="gmail-save" className="btn btn-primary btn-sm" type="submit" disabled={busy}>Save Gmail sender</button>
          <button id="gmail-test-email" className="btn btn-secondary btn-sm" type="button" onClick={sendTestEmail} disabled={busy}>Send test email</button>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>The test email goes only to the signed-in Super Admin email address.</p>
      </form>

      <SystemWhatsAppAdmin />

      <form className="premium-card" onSubmit={sendTestWhatsapp} style={{ padding: 16, display: 'grid', gap: 12 }}>
        <h3 style={{ margin: 0, fontSize: 16 }}>Send test message</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          {accountMobile
            ? 'Sends from the connected system WhatsApp to your registered Super Admin mobile.'
            : 'No mobile is registered on this Super Admin account. Enter a number to receive the test.'}
        </p>
        {!accountMobile && (
          <div className="form-group">
            <label className="form-label" htmlFor="system-whatsapp-test-mobile">Mobile number</label>
            <input id="system-whatsapp-test-mobile" className="form-input" type="tel" value={testMobile} onChange={e => setTestMobile(e.target.value)} placeholder="98765 43210" />
          </div>
        )}
        <div>
          <button id="system-whatsapp-test" className="btn btn-secondary btn-sm" type="submit" disabled={busy}>Send test message</button>
        </div>
      </form>
    </div>
  );
}
