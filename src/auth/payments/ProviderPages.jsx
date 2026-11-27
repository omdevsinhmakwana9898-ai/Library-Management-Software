import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { SaPage, SaPageHeader, SaStatusBadge, providerLabel } from '../saPage';

const SAVED_MASK = '••••••••';

export function confirmActiveProviderChange(from, to) {
  return window.confirm(`Change the active payment provider from ${from} to ${to}? Credential checks do not prove webhook delivery or settlement. Cancel leaves the active provider unchanged.`);
}

export function confirmLiveMode(provider) {
  return window.confirm(`Switch ${provider} to live mode? Live mode can create real provider charges and needs separate approval. Cancel leaves the saved mode unchanged.`);
}

function modeLabel(kind, mode) {
  if (kind === 'paypal') return mode === 'live' ? 'Live' : 'Sandbox';
  return mode === 'live' ? 'Live' : 'Test';
}

function configured(kind, block) {
  if (kind === 'paypal') return Boolean(block?.clientId && block?.clientSecretSet);
  return Boolean(block?.keyId && block?.keySecretSet);
}

export function usePaymentConfig() {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState('');
  const load = async () => {
    try { setCfg(await api.adminPaymentsConfig()); }
    catch (e) { toast.error(e.message || 'Could not load payment providers'); }
  };
  useEffect(() => { load(); }, []);
  const save = async (body) => {
    setBusy(true);
    try {
      const next = await api.adminUpdatePaymentsConfig(body);
      setCfg(next);
      setTestError('');
      toast.success('Payment settings saved (not verified)');
      return next;
    } catch (e) {
      toast.error(e.message || 'Could not save payment settings');
      return null;
    } finally { setBusy(false); }
  };
  const test = async () => {
    setTesting(true);
    setTestError('');
    try {
      const r = await api.adminTestPaymentsConfig();
      setCfg(r);
      if (r.verification?.status === 'verified') toast.success(r.verification.message || 'Provider verified');
      else if (r.verification?.status === 'failed') toast.error(r.verification.message || 'Provider verification failed');
      else toast(r.verification?.message || 'Configuration stored; verification not confirmed');
    } catch (e) {
      setTestError(e.message || 'Provider test could not be completed');
      toast.error(e.message || 'Provider test could not be completed');
      try { setCfg(await api.adminPaymentsConfig()); } catch { /* keep the request error */ }
    } finally { setTesting(false); }
  };
  return { cfg, busy, testing, testError, load, save, test };
}

export function VerificationStatus({ cfg, testError }) {
  const verification = cfg?.verification;
  const verificationLabel = verification?.status === 'verified' ? 'Verified' : verification?.status === 'failed' ? 'Failed' : 'Stored / not tested';
  return (
    <div role="status" aria-live="polite" style={{ marginTop: 10, fontSize: 13, overflowWrap: 'anywhere' }}>
      Provider verification: <strong>{verificationLabel}</strong>
      {verification?.provider && <span> · {verification.provider}{verification.mode ? ` (${verification.mode})` : ''}</span>}
      <div>{verification?.message || 'Configuration is stored only; no provider verification result is available.'}</div>
      {verification?.at && <div>Tested: {new Date(verification.at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST</div>}
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>The test probes saved credentials, not unsaved form changes. Credential verification does not confirm webhook delivery or settlement.</div>
      {testError && <div role="alert" style={{ color: '#b45309', marginTop: 8 }}>{testError}</div>}
    </div>
  );
}

function ProviderSummary({ title, kind, block, active }) {
  const ready = configured(kind, block);
  return (
    <div className="premium-card" style={{ padding: 14, minWidth: 0 }}>
      <strong>{title}</strong>
      {active && <div style={{ fontSize: 12, color: '#047857', fontWeight: 700, marginTop: 4 }}>Active provider</div>}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
        <SaStatusBadge status={ready ? 'active' : 'disabled'}>{ready ? 'Configured' : 'Not configured'}</SaStatusBadge>
        <SaStatusBadge status={block?.mode === 'live' ? 'pending' : 'open'}>{modeLabel(kind, block?.mode)}</SaStatusBadge>
        <SaStatusBadge status={block?.enabled ? 'active' : 'disabled'}>{block?.enabled ? 'Enabled' : 'Disabled'}</SaStatusBadge>
      </div>
      {kind === 'razorpay' && block?.keySecretSet && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Saved key secret: {SAVED_MASK}</div>}
      {kind === 'paypal' && block?.clientSecretSet && <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Saved client secret: {SAVED_MASK}</div>}
    </div>
  );
}

export function PaymentProvidersHome({ onOpen }) {
  const { cfg, busy, testing, testError, save, test } = usePaymentConfig();
  const [activeProvider, setActiveProvider] = useState('none');
  useEffect(() => { if (cfg) setActiveProvider(cfg.activeProvider || 'none'); }, [cfg]);
  if (!cfg) return <div id="sa-payment-providers" style={{ padding: 16 }}>Loading payment providers…</div>;
  const saveActive = async (e) => {
    e.preventDefault();
    if (activeProvider === cfg.activeProvider) {
      toast('Active provider is unchanged');
      return;
    }
    if (!confirmActiveProviderChange(cfg.activeProvider || 'none', activeProvider)) return;
    await save({ activeProvider, confirmActiveProvider: true });
  };
  return (
    <SaPage id="sa-payment-providers">
      <SaPageHeader
        onBack={() => onOpen('landing')}
        backLabel="Payments"
        title="Payment providers"
        subtitle={`Active provider: ${providerLabel(cfg.activeProvider)}. ${cfg.paymentsEnabled ? 'Payments are enabled for that provider.' : 'Payments stay off until the active provider has keys saved.'} Nothing here switches a provider to live by itself.`}
      />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 240px), 1fr))', gap: 12 }}>
        <ProviderSummary title="Razorpay" kind="razorpay" block={cfg.razorpay} active={cfg.activeProvider === 'razorpay'} />
        <ProviderSummary title="PayPal" kind="paypal" block={cfg.paypal} active={cfg.activeProvider === 'paypal'} />
      </div>
      <form className="premium-card" style={{ padding: 16 }} onSubmit={saveActive}>
        <label className="form-label" htmlFor="active-provider">Active provider</label>
        <select id="active-provider" className="form-input" value={activeProvider} onChange={e => setActiveProvider(e.target.value)}>
          <option value="none">None (payments off)</option>
          <option value="razorpay">Razorpay</option>
          <option value="paypal">PayPal</option>
        </select>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '8px 0' }}>Changing the active provider asks for confirmation and is audited. Keys are edited on the provider page.</p>
        <button className="btn btn-primary" type="submit" disabled={busy}>Save active provider</button>
      </form>
      <div className="premium-card" style={{ padding: 16 }}>
        <button className="btn btn-secondary" type="button" onClick={test} disabled={busy || testing}>{testing ? 'Testing saved credentials…' : 'Test saved active provider'}</button>
        <VerificationStatus cfg={cfg} testError={testError} />
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" className="btn btn-secondary" onClick={() => onOpen('razorpay')}>Razorpay details</button>
        <button type="button" className="btn btn-secondary" onClick={() => onOpen('paypal')}>PayPal details</button>
      </div>
    </SaPage>
  );
}

function SecretField({ label, saved, value, onChange }) {
  return (
    <div className="form-group">
      <label className="form-label">{label} {saved ? `(saved ${SAVED_MASK})` : ''}</label>
      <input className="form-input" type="password" value={value} onChange={onChange} placeholder={saved ? 'Leave blank to keep current secret' : ''} autoComplete="new-password" />
    </div>
  );
}

export function RazorpayProviderPage({ onOpen }) {
  const { cfg, busy, testing, testError, save, test } = usePaymentConfig();
  const [form, setForm] = useState({ enabled: false, keyId: '', keySecret: '', webhookSecret: '', mode: 'test', makeActive: false });
  useEffect(() => {
    if (!cfg) return;
    setForm({
      enabled: Boolean(cfg.razorpay?.enabled),
      keyId: cfg.razorpay?.keyId || '',
      keySecret: '',
      webhookSecret: '',
      mode: cfg.razorpay?.mode || 'test',
      makeActive: false,
    });
  }, [cfg]);
  if (!cfg) return <div id="sa-provider-razorpay" style={{ padding: 16 }}>Loading Razorpay…</div>;
  const onSave = async (e) => {
    e.preventDefault();
    const body = {
      razorpay: {
        enabled: form.enabled,
        keyId: form.keyId,
        mode: form.mode,
        ...(form.keySecret ? { keySecret: form.keySecret } : {}),
        ...(form.webhookSecret ? { webhookSecret: form.webhookSecret } : {}),
      },
    };
    if (form.mode === 'live' && cfg.razorpay?.mode !== 'live') {
      if (!confirmLiveMode('Razorpay')) return;
      body.confirmLiveMode = true;
    }
    if (form.makeActive && cfg.activeProvider !== 'razorpay') {
      if (!confirmActiveProviderChange(cfg.activeProvider || 'none', 'razorpay')) return;
      body.activeProvider = 'razorpay';
      body.confirmActiveProvider = true;
    }
    const next = await save(body);
    if (next) setForm(f => ({ ...f, keySecret: '', webhookSecret: '', makeActive: false }));
  };
  return (
    <SaPage id="sa-provider-razorpay">
      <SaPageHeader
        onBack={() => onOpen('providers')}
        backLabel="Payment providers"
        title="Razorpay"
        subtitle={`${configured('razorpay', cfg.razorpay) ? 'Configured' : 'Not configured'} · ${modeLabel('razorpay', cfg.razorpay?.mode)}. Keys are encrypted at rest. Leave a secret blank to keep the current value.`}
      />
      <form className="premium-card" style={{ padding: 16 }} onSubmit={onSave}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 8 }}>
          <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
          Enable Razorpay
        </label>
        <div className="form-group"><label className="form-label">Key ID</label><input className="form-input" value={form.keyId} onChange={e => setForm(f => ({ ...f, keyId: e.target.value }))} autoComplete="off" /></div>
        <SecretField label="Key secret" saved={cfg.razorpay?.keySecretSet} value={form.keySecret} onChange={e => setForm(f => ({ ...f, keySecret: e.target.value }))} />
        <SecretField label="Webhook secret" saved={cfg.razorpay?.webhookSecretSet} value={form.webhookSecret} onChange={e => setForm(f => ({ ...f, webhookSecret: e.target.value }))} />
        <div className="form-group">
          <label className="form-label" htmlFor="razorpay-mode">Mode</label>
          <select id="razorpay-mode" className="form-input" value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>
            <option value="test">Test</option>
            <option value="live">Live</option>
          </select>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 0' }}>Switching to live asks for confirmation. This page does not switch to live by itself.</p>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 8px' }}>Webhook URL: <code>/api/payments/webhook/razorpay</code></p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 10 }}>
          <input type="checkbox" checked={form.makeActive} onChange={e => setForm(f => ({ ...f, makeActive: e.target.checked }))} />
          Set Razorpay as the active provider
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" type="submit" disabled={busy || testing}>{busy ? 'Saving…' : 'Save'}</button>
          <button className="btn btn-secondary" type="button" onClick={test} disabled={busy || testing}>{testing ? 'Testing saved credentials…' : 'Test saved active provider'}</button>
        </div>
        <VerificationStatus cfg={cfg} testError={testError} />
        {cfg.activeProvider !== 'razorpay' && <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>The test checks the saved active provider ({cfg.activeProvider}), which may not be Razorpay.</p>}
      </form>
    </SaPage>
  );
}

export function PaypalProviderPage({ onOpen }) {
  const { cfg, busy, testing, testError, save, test } = usePaymentConfig();
  const [form, setForm] = useState({ enabled: false, clientId: '', clientSecret: '', webhookId: '', mode: 'sandbox', makeActive: false });
  useEffect(() => {
    if (!cfg) return;
    setForm({
      enabled: Boolean(cfg.paypal?.enabled),
      clientId: cfg.paypal?.clientId || '',
      clientSecret: '',
      webhookId: cfg.paypal?.webhookId || '',
      mode: cfg.paypal?.mode || 'sandbox',
      makeActive: false,
    });
  }, [cfg]);
  if (!cfg) return <div id="sa-provider-paypal" style={{ padding: 16 }}>Loading PayPal…</div>;
  const onSave = async (e) => {
    e.preventDefault();
    const body = {
      paypal: {
        enabled: form.enabled,
        clientId: form.clientId,
        webhookId: form.webhookId,
        mode: form.mode,
        ...(form.clientSecret ? { clientSecret: form.clientSecret } : {}),
      },
    };
    if (form.mode === 'live' && cfg.paypal?.mode !== 'live') {
      if (!confirmLiveMode('PayPal')) return;
      body.confirmLiveMode = true;
    }
    if (form.makeActive && cfg.activeProvider !== 'paypal') {
      if (!confirmActiveProviderChange(cfg.activeProvider || 'none', 'paypal')) return;
      body.activeProvider = 'paypal';
      body.confirmActiveProvider = true;
    }
    const next = await save(body);
    if (next) setForm(f => ({ ...f, clientSecret: '', makeActive: false }));
  };
  return (
    <SaPage id="sa-provider-paypal">
      <SaPageHeader
        onBack={() => onOpen('providers')}
        backLabel="Payment providers"
        title="PayPal"
        subtitle={`${configured('paypal', cfg.paypal) ? 'Configured' : 'Not configured'} · ${modeLabel('paypal', cfg.paypal?.mode)}. Leave a secret blank to keep the current value.`}
      />
      <form className="premium-card" style={{ padding: 16 }} onSubmit={onSave}>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 8 }}>
          <input type="checkbox" checked={form.enabled} onChange={e => setForm(f => ({ ...f, enabled: e.target.checked }))} />
          Enable PayPal
        </label>
        <div className="form-group"><label className="form-label">Client ID</label><input className="form-input" value={form.clientId} onChange={e => setForm(f => ({ ...f, clientId: e.target.value }))} autoComplete="off" /></div>
        <SecretField label="Client secret" saved={cfg.paypal?.clientSecretSet} value={form.clientSecret} onChange={e => setForm(f => ({ ...f, clientSecret: e.target.value }))} />
        <div className="form-group"><label className="form-label">Webhook ID</label><input className="form-input" value={form.webhookId} onChange={e => setForm(f => ({ ...f, webhookId: e.target.value }))} autoComplete="off" /></div>
        <div className="form-group">
          <label className="form-label" htmlFor="paypal-mode">Mode</label>
          <select id="paypal-mode" className="form-input" value={form.mode} onChange={e => setForm(f => ({ ...f, mode: e.target.value }))}>
            <option value="sandbox">Sandbox</option>
            <option value="live">Live</option>
          </select>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 0 0' }}>Switching to live asks for confirmation. This page does not switch to live by itself.</p>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: '0 0 8px' }}>Webhook URL: <code>/api/payments/webhook/paypal</code></p>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 10 }}>
          <input type="checkbox" checked={form.makeActive} onChange={e => setForm(f => ({ ...f, makeActive: e.target.checked }))} />
          Set PayPal as the active provider
        </label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" type="submit" disabled={busy || testing}>{busy ? 'Saving…' : 'Save'}</button>
          <button className="btn btn-secondary" type="button" onClick={test} disabled={busy || testing}>{testing ? 'Testing saved credentials…' : 'Test saved active provider'}</button>
        </div>
        <VerificationStatus cfg={cfg} testError={testError} />
        {cfg.activeProvider !== 'paypal' && <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>The test checks the saved active provider ({cfg.activeProvider}), which may not be PayPal.</p>}
      </form>
    </SaPage>
  );
}
