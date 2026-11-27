import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { api } from '../../utils/api';
import {
  SaEmpty, SaFact, SaHelper, SaMoreInfo, SaPage, SaPageHeader, SaRecordHero,
  SaRecordSection, SaRecordTimeline,
} from '../saPage';
import { formatWhen, inrMinor, signedAmount } from './shared';

const HELP = {
  'Added by Super Admin': 'A Super Admin added this credit. It is not an online payment.',
  'Deducted by Super Admin': 'A Super Admin deducted this credit. It does not change an invoice.',
  'Paid online': 'This credit was added after an online top-up was verified.',
  'Used on an invoice': 'This credit was used to pay an invoice.',
  'Referral reward': 'This promotional credit came from a referral reward.',
  'Promotional credit expired': 'This promotional credit reached its expiry date.',
  'Reserved for a payment': 'This amount was set aside while a payment was in progress.',
  'Reservation released': 'A payment did not finish, so the reserved credit was released.',
};

export function WalletEntryPage({ libraryId, entryId, onOpen }) {
  const [data, setData] = useState(null);
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    let live = true;
    setData(null);
    setMissing(false);
    api.adminWalletEntry(libraryId, entryId).then(row => { if (live) setData(row); }).catch(e => {
      if (!live) return;
      setMissing(true);
      toast.error(e.message || 'Could not load this wallet entry');
    });
    return () => { live = false; };
  }, [libraryId, entryId]);
  if (!data) {
    return (
      <SaPage id="sa-wallet-entry">
        <SaPageHeader onBack={() => onOpen('detail', libraryId)} backLabel="Library wallet" title="Wallet entry" subtitle={missing ? 'This entry could not be opened.' : 'Loading this entry.'} />
        {missing ? <SaEmpty title="This wallet entry is not available">Go back to the library wallet.</SaEmpty> : <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>Loading entry…</p>}
      </SaPage>
    );
  }
  const { library, entry } = data;
  const steps = [
    { label: 'Recorded', at: formatWhen(entry.createdAt) },
    entry.expiresAt ? { label: 'Expires', at: formatWhen(entry.expiresAt) } : null,
    entry.expiredAt ? { label: 'Expired', at: formatWhen(entry.expiredAt) } : null,
  ].filter(step => step && step.at);
  return (
    <SaPage id="sa-wallet-entry">
      <SaPageHeader onBack={() => onOpen('detail', libraryId)} backLabel={library.name || 'Library wallet'} title={entry.title} />
      <SaRecordHero name={entry.title} amount={signedAmount(entry)} />
      <SaRecordTimeline steps={steps} />
      <SaRecordSection title="Change">
        <SaFact label="Amount">{signedAmount(entry)}</SaFact>
        {entry.bucketLabel ? <SaFact label="Credit type">{entry.bucketLabel}</SaFact> : null}
        <SaFact label="Reason">{entry.reason || '—'}</SaFact>
        <SaFact label="Paid credit after">{inrMinor(entry.cashAfterMinor)}</SaFact>
        <SaFact label="Promotional credit after">{inrMinor(entry.bonusAfterMinor)}</SaFact>
      </SaRecordSection>
      <SaRecordSection title="Library">
        <SaFact label="Library">{library.name || '—'}</SaFact>
        <SaFact label="Status">{library.status || '—'}</SaFact>
        {entry.actorEmail ? <SaFact label="Changed by">{entry.actorEmail}</SaFact> : null}
      </SaRecordSection>
      <SaMoreInfo>
        <SaFact label="Entry id">{entry.id || '—'}</SaFact>
        <SaFact label="Library id">{library.libraryId || '—'}</SaFact>
        {entry.invoiceId ? <SaFact label="Invoice id">{entry.invoiceId}</SaFact> : null}
        {entry.topupId ? <SaFact label="Top-up id">{entry.topupId}</SaFact> : null}
        {entry.holdId ? <SaFact label="Reservation id">{entry.holdId}</SaFact> : null}
      </SaMoreInfo>
      <SaHelper>{HELP[entry.title] || 'This row is part of the library wallet history.'}</SaHelper>
    </SaPage>
  );
}
