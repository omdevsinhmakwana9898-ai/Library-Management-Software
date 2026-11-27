import React, { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { FiltersMenu } from '../FiltersMenu';
import { SaEmpty, SaFact, SaFactList, SaList, SaListRow, SaPage, SaPageHeader, SaStatusBadge, statusLabel } from '../saPage';

const emptyForm = { name: '', rewardMinor: 0, rewardBucket: 'bonus', startsAt: '', endsAt: '', planIds: '', maxRewards: '', allowTrials: false, allow100PercentPromo: false };
const emptyQuery = { q: '', active: '', status: '' };
const day = (d) => (d ? String(d).slice(0, 10) : '');
const rupees = (minor) => `₹${(Number(minor || 0) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function ReferralsPage({ onOpen }) {
  const [campaigns, setCampaigns] = useState([]);
  const [history, setHistory] = useState(null);
  const [query, setQuery] = useState(emptyQuery);
  const [draft, setDraft] = useState(emptyQuery);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [selected, setSelected] = useState(null);
  const [screen, setScreen] = useState('list');
  const [busy, setBusy] = useState(false);
  const [page, setPage] = useState(1);

  const load = useCallback(async (next, pageNo) => {
    const camp = new URLSearchParams();
    const hist = new URLSearchParams();
    if (next.q) { camp.set('q', next.q); hist.set('q', next.q); }
    if (next.active) camp.set('active', next.active);
    if (next.status) hist.set('status', next.status);
    hist.set('page', String(pageNo));
    try {
      const [c, h] = await Promise.all([
        api.adminReferralCampaigns(camp.toString() ? `?${camp}` : ''),
        api.adminReferrals(`?${hist}`),
      ]);
      setCampaigns(c || []);
      setHistory(h);
    } catch (e) { toast.error(e.message || 'Could not load referral campaigns'); }
  }, []);
  useEffect(() => { load(query, page); }, [load, query, page]);
  useEffect(() => { setDraft(query); }, [query]);

  const chips = [];
  if (query.q) chips.push({ key: 'q', label: `Search: ${query.q}`, onDismiss: () => { setPage(1); setQuery({ ...query, q: '' }); } });
  if (query.active) chips.push({ key: 'active', label: query.active === 'true' ? 'Active campaigns' : 'Inactive campaigns', onDismiss: () => setQuery({ ...query, active: '' }) });
  if (query.status) chips.push({ key: 'status', label: statusLabel(query.status), onDismiss: () => { setPage(1); setQuery({ ...query, status: '' }); } });

  const fill = (c) => ({
    name: c.name || '',
    rewardMinor: c.rewardMinor || 0,
    rewardBucket: c.rewardBucket || 'bonus',
    startsAt: day(c.startsAt),
    endsAt: day(c.endsAt),
    planIds: (c.planIds || []).join(', '),
    maxRewards: c.maxRewards ?? '',
    allowTrials: !!c.allowTrials,
    allow100PercentPromo: !!c.allow100PercentPromo,
  });
  const startCreate = () => { setEditing(null); setForm(emptyForm); setScreen('editor'); };
  const openCampaign = (c, next = 'detail') => { setEditing(c); setForm(fill(c)); setScreen(next); };
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        ...form,
        rewardMinor: Number(form.rewardMinor || 0),
        planIds: String(form.planIds || '').split(',').map(s => s.trim()).filter(Boolean),
        maxRewards: form.maxRewards === '' ? null : Number(form.maxRewards),
        startsAt: form.startsAt || null,
        endsAt: form.endsAt || null,
      };
      if (editing) await api.adminUpdateReferralCampaign(editing.campaignId, body);
      else await api.adminCreateReferralCampaign(body);
      setScreen('list');
      toast.success(editing ? 'Campaign updated' : 'Referral campaign created');
      await load(query, page);
    } catch (err) { toast.error(err.message || 'Could not save campaign'); }
    finally { setBusy(false); }
  };
  const toggle = async (c) => {
    try {
      const next = await api.adminUpdateReferralCampaign(c.campaignId, { active: c.active === false });
      setEditing({ ...c, ...(next && typeof next === 'object' ? next : { active: c.active === false }) });
      await load(query, page);
    } catch (e) { toast.error(e.message); }
  };

  if (screen === 'editor') {
    return (
      <SaPage id="sa-referrals">
        <SaPageHeader
          onBack={() => setScreen(editing ? 'detail' : 'list')}
          backLabel={editing ? 'Campaign' : 'Referral campaigns'}
          title={editing ? 'Edit referral campaign' : 'New referral campaign'}
          subtitle="A reward follows the first genuine paid subscription. Saving does not pay out rewards."
        />
        <form className="premium-card" style={{ padding: 16, display: 'grid', gap: 10 }} onSubmit={submit}>
          <label className="form-label">Name<input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label>
          <label className="form-label">Reward (paise)<input className="form-input" value={form.rewardMinor} onChange={e => setForm({ ...form, rewardMinor: e.target.value })} /></label>
          <label className="form-label">Reward type<select className="form-select" value={form.rewardBucket} onChange={e => setForm({ ...form, rewardBucket: e.target.value })}><option value="bonus">Bonus</option><option value="cash">Cash</option></select></label>
          <label className="form-label">Eligible plans<input className="form-input" value={form.planIds} onChange={e => setForm({ ...form, planIds: e.target.value })} placeholder="All plans" /></label>
          <label className="form-label">Max rewards<input className="form-input" value={form.maxRewards} onChange={e => setForm({ ...form, maxRewards: e.target.value })} placeholder="Unlimited" /></label>
          <label className="form-label">Starts<input className="form-input" type="date" value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} /></label>
          <label className="form-label">Ends<input className="form-input" type="date" value={form.endsAt} onChange={e => setForm({ ...form, endsAt: e.target.value })} /></label>
          <label style={{ display: 'flex', gap: 6, fontSize: 13 }}><input type="checkbox" checked={form.allowTrials} onChange={e => setForm({ ...form, allowTrials: e.target.checked })} /> Allow trials (off unless this campaign enables it)</label>
          <label style={{ display: 'flex', gap: 6, fontSize: 13 }}><input type="checkbox" checked={form.allow100PercentPromo} onChange={e => setForm({ ...form, allow100PercentPromo: e.target.checked })} /> Allow 100% promo (off unless this campaign enables it)</label>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>Qualifying event stays the first genuine paid subscription. Saving does not create a payout.</p>
          <div className="sa-action-row" style={{ justifyContent: 'flex-end' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setScreen(editing ? 'detail' : 'list')}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{editing ? 'Save campaign' : 'Create campaign'}</button>
          </div>
        </form>
      </SaPage>
    );
  }

  if (screen === 'detail' && editing) {
    const c = editing;
    return (
      <SaPage id="sa-referrals">
        <SaPageHeader
          onBack={() => setScreen('list')}
          backLabel="Referral campaigns"
          title={c.name || 'Campaign'}
          subtitle="Reward eligibility is only after a qualifying first genuine paid subscription."
          actions={<button type="button" className="btn btn-primary" onClick={() => openCampaign(c, 'editor')}>Edit</button>}
        />
        <div className="sa-action-row">
          <SaStatusBadge status={c.active === false ? 'inactive' : 'active'}>{c.active === false ? 'Inactive' : 'Active'}</SaStatusBadge>
        </div>
        <SaFactList>
          <SaFact label="Reward">{rupees(c.rewardMinor)} · {c.rewardBucket === 'cash' ? 'Cash' : 'Bonus'}</SaFact>
          <SaFact label="Qualifying event">First genuine paid subscription</SaFact>
          <SaFact label="Trials">{c.allowTrials ? 'Allowed' : 'Not rewarded'}</SaFact>
          <SaFact label="100% promo">{c.allow100PercentPromo ? 'Allowed' : 'Not rewarded'}</SaFact>
          <SaFact label="Plans">{(c.planIds || []).length ? c.planIds.join(', ') : 'All plans'}</SaFact>
          <SaFact label="Max rewards">{c.maxRewards || 'Unlimited'}</SaFact>
        </SaFactList>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>This page does not pay out rewards, and editing a rate does not rewrite rewards already credited.</p>
        <button type="button" className="btn btn-secondary" onClick={() => toggle(c)}>{c.active === false ? 'Enable' : 'Disable'}</button>
      </SaPage>
    );
  }

  if (screen === 'referral' && selected) {
    const r = selected;
    return (
      <SaPage id="sa-referrals">
        <SaPageHeader onBack={() => setScreen('list')} backLabel="Referral campaigns" title={r.code || 'Referral'} subtitle="One referral record." />
        <SaStatusBadge status={r.status} />
        <SaFactList>
          <SaFact label="Referring library">{r.referrerLibraryName || r.referrerTenantId || '—'}</SaFact>
          <SaFact label="Referred library">{r.referredLibraryName || r.referredTenantId || '—'}</SaFact>
          <SaFact label="Reward">{rupees(r.rewardMinor)}</SaFact>
          <SaFact label="Invoice">{r.invoiceId || '—'}</SaFact>
        </SaFactList>
      </SaPage>
    );
  }

  return (
    <SaPage id="sa-referrals">
      <SaPageHeader
        onBack={() => onOpen('landing')}
        backLabel="Payments"
        title="Referral campaigns"
        subtitle="Reward eligibility is only after a qualifying first genuine paid subscription, including a fully wallet-funded one. This page does not pay out rewards."
        actions={<button type="button" className="btn btn-primary" onClick={startCreate}>New campaign</button>}
      />
      <FiltersMenu
        buttonId="sa-referrals-filters-button"
        menuId="sa-referrals-filters-menu"
        chips={chips}
        onApply={() => { setPage(1); setQuery(draft); }}
        onReset={() => { setDraft(emptyQuery); setPage(1); setQuery(emptyQuery); }}
        onClose={() => setDraft(query)}
      >
        <label className="form-label" style={{ margin: 0 }}>Search
          <input className="form-input" value={draft.q} onChange={e => setDraft(d => ({ ...d, q: e.target.value }))} placeholder="Campaign, library, code, invoice" />
        </label>
        <label className="form-label" htmlFor="sa-referrals-active" style={{ margin: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>Campaign
          <select id="sa-referrals-active" className="form-select" value={draft.active} onChange={e => setDraft(d => ({ ...d, active: e.target.value }))}>
            <option value="">All campaigns</option>
            <option value="true">Active campaigns</option>
            <option value="false">Inactive campaigns</option>
          </select>
        </label>
        <label className="form-label" style={{ margin: 0 }}>Referral history status
          <select className="form-select" value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="qualified">Qualified</option>
            <option value="credited">Credited</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
      </FiltersMenu>
      {campaigns.length === 0 && <SaEmpty title="No campaign configured">Create a campaign when you are ready to offer a referral reward.</SaEmpty>}
      {campaigns.length > 0 && (
        <SaList>
          {campaigns.map(c => (
            <SaListRow
              key={c.campaignId}
              title={c.name}
              meta={`Reward ${rupees(c.rewardMinor)} · ${c.rewardBucket === 'cash' ? 'Cash' : 'Bonus'}`}
              extra="First genuine paid subscription"
              status={c.active === false ? 'inactive' : 'active'}
              onClick={() => openCampaign(c)}
            />
          ))}
        </SaList>
      )}
      <div className="premium-card" style={{ padding: 16, minWidth: 0 }}>
        <strong>Referral history</strong>
        {history?.policy && <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: '4px 0 8px' }}>{history.policy}</p>}
        {(history?.items || []).length === 0 && <SaEmpty title="No referral rows match">Clear the history status filter to see more.</SaEmpty>}
        {(history?.items || []).length > 0 && (
          <SaList>
            {history.items.map(r => (
              <SaListRow
                key={r.referralId}
                title={r.code || 'Referral'}
                meta={rupees(r.rewardMinor)}
                extra={r.invoiceId || 'No invoice yet'}
                status={r.status}
                onClick={() => { setSelected(r); setScreen('referral'); }}
              />
            ))}
          </SaList>
        )}
        {history && (
          <div className="sa-action-row" style={{ marginTop: 8, alignItems: 'center' }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <span style={{ fontSize: 13 }}>Page {history.page} of {history.pages}</span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={page >= history.pages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        )}
      </div>
    </SaPage>
  );
}
