import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import { SaModal } from '../SaModal';
import { FiltersMenu } from '../FiltersMenu';

const emptyForm = { name: '', rewardMinor: 0, rewardBucket: 'bonus', startsAt: '', endsAt: '', planIds: '', maxRewards: '', allowTrials: false, allow100PercentPromo: false };
const emptyQuery = { q: '', active: '', status: '' };
const day = (d) => (d ? String(d).slice(0, 10) : '');

export function ReferralsPage({ onOpen }) {
  const [campaigns, setCampaigns] = useState([]);
  const [history, setHistory] = useState(null);
  const [query, setQuery] = useState(emptyQuery);
  const [draft, setDraft] = useState(emptyQuery);
  const [form, setForm] = useState(emptyForm);
  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(false);
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
  if (query.status) chips.push({ key: 'status', label: query.status, onDismiss: () => { setPage(1); setQuery({ ...query, status: '' }); } });

  const startCreate = () => { setEditing(null); setForm(emptyForm); setOpen(true); };
  const startEdit = (c) => {
    setEditing(c);
    setForm({
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
    setOpen(true);
  };
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
      setOpen(false);
      toast.success(editing ? 'Campaign updated' : 'Referral campaign created');
      await load(query, page);
    } catch (err) { toast.error(err.message || 'Could not save campaign'); }
    finally { setBusy(false); }
  };

  return (
    <div id="sa-referrals" style={{ display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <div>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => onOpen('landing')}><ArrowLeft size={14} /> Payments</button>
          <h2 style={{ fontSize: 22, fontWeight: 800, margin: '8px 0 0' }}>Referral campaigns</h2>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={startCreate}>+ New campaign</button>
      </div>
      <p style={{ fontSize: 13, color: 'var(--text-secondary)', margin: 0 }}>
        Reward eligibility is only after a qualifying first genuine paid subscription, including a fully wallet-funded one. Trials and 100% promos do not qualify unless that option is already enabled on the campaign. This page does not pay out rewards, and editing a rate does not rewrite rewards already credited.
      </p>
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
        <div role="group" aria-label="Campaign state" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {[['', 'All campaigns'], ['true', 'Active campaigns'], ['false', 'Inactive campaigns']].map(([id, label]) => (
            <button key={id || 'all'} type="button" className={`btn btn-sm ${draft.active === id ? 'btn-primary' : 'btn-secondary'}`} style={{ justifyContent: 'flex-start', width: '100%' }} aria-pressed={draft.active === id} onClick={() => setDraft(d => ({ ...d, active: id }))}>{label}</button>
          ))}
        </div>
        <label className="form-label" style={{ margin: 0 }}>Referral history status
          <select className="form-input" value={draft.status} onChange={e => setDraft(d => ({ ...d, status: e.target.value }))}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="qualified">Qualified</option>
            <option value="credited">Credited</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>
      </FiltersMenu>
      <SaModal open={open} title={editing ? 'Edit referral campaign' : 'New referral campaign'} onClose={() => setOpen(false)}>
        <form onSubmit={submit} style={{ display: 'grid', gap: 10 }}>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Name<input className="form-input" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required /></label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Reward (minor units)<input className="form-input" value={form.rewardMinor} onChange={e => setForm({ ...form, rewardMinor: e.target.value })} /></label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Bucket<select className="form-input" value={form.rewardBucket} onChange={e => setForm({ ...form, rewardBucket: e.target.value })}><option value="bonus">Bonus</option><option value="cash">Cash</option></select></label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Eligible plans<input className="form-input" value={form.planIds} onChange={e => setForm({ ...form, planIds: e.target.value })} placeholder="All plans" /></label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Max rewards<input className="form-input" value={form.maxRewards} onChange={e => setForm({ ...form, maxRewards: e.target.value })} placeholder="Unlimited" /></label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Starts<input className="form-input" type="date" value={form.startsAt} onChange={e => setForm({ ...form, startsAt: e.target.value })} /></label>
          <label style={{ display: 'grid', gap: 4, fontSize: 13 }}>Ends<input className="form-input" type="date" value={form.endsAt} onChange={e => setForm({ ...form, endsAt: e.target.value })} /></label>
          <label style={{ display: 'flex', gap: 6, fontSize: 13 }}><input type="checkbox" checked={form.allowTrials} onChange={e => setForm({ ...form, allowTrials: e.target.checked })} /> Allow trials (off unless this campaign enables it)</label>
          <label style={{ display: 'flex', gap: 6, fontSize: 13 }}><input type="checkbox" checked={form.allow100PercentPromo} onChange={e => setForm({ ...form, allow100PercentPromo: e.target.checked })} /> Allow 100% promo (off unless this campaign enables it)</label>
          <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: 0 }}>Qualifying event stays the first genuine paid subscription. Saving does not create a payout.</p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary" disabled={busy}>{editing ? 'Save campaign' : 'Create campaign'}</button>
          </div>
        </form>
      </SaModal>
      {campaigns.map(c => (
        <div key={c.campaignId} className="premium-card" style={{ padding: 12, fontSize: 13, minWidth: 0 }}>
          <div style={{ overflowWrap: 'anywhere' }}><strong>{c.name}</strong> · reward {c.rewardMinor} {c.rewardBucket} · {c.active === false ? 'inactive' : 'active'}</div>
          <div>Qualifying event: first genuine paid subscription · trials {c.allowTrials ? 'allowed' : 'not rewarded'} · 100% promo {c.allow100PercentPromo ? 'allowed' : 'not rewarded'}</div>
          <div>{(c.planIds || []).length ? `Plans: ${c.planIds.join(', ')}` : 'All plans'}{c.maxRewards ? ` · max ${c.maxRewards}` : ''}</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => startEdit(c)}>Edit</button>
            <button type="button" className="btn btn-ghost btn-sm" onClick={async () => { try { await api.adminUpdateReferralCampaign(c.campaignId, { active: c.active === false }); await load(query, page); } catch (e) { toast.error(e.message); } }}>{c.active === false ? 'Enable' : 'Disable'}</button>
          </div>
        </div>
      ))}
      {campaigns.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No campaign configured.</div>}
      <div className="premium-card" style={{ padding: 12, minWidth: 0 }}>
        <strong>Referral history</strong>
        <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 8px' }}>{history?.policy}</p>
        {(history?.items || []).map(r => (
          <div key={r.referralId} style={{ borderTop: '1px solid var(--border-light, #e5e7eb)', padding: '8px 0', fontSize: 13, overflowWrap: 'anywhere' }}>
            {r.code} · {r.referrerTenantId} → {r.referredTenantId} · {r.status} · reward {r.rewardMinor || 0}
            {r.invoiceId ? ` · ${r.invoiceId}` : ''}
          </div>
        ))}
        {history && history.items?.length === 0 && <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>No referral rows match.</div>}
        {history && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn btn-secondary btn-sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Previous</button>
            <span style={{ fontSize: 13 }}>Page {history.page} of {history.pages}</span>
            <button type="button" className="btn btn-secondary btn-sm" disabled={page >= history.pages} onClick={() => setPage(p => p + 1)}>Next</button>
          </div>
        )}
      </div>
    </div>
  );
}
