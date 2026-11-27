import React, { useState } from 'react';
import { WalletsListPage } from './wallets/WalletsListPage';
import { WalletDetailPage } from './wallets/WalletDetailPage';
import { WalletAdjustPage } from './wallets/WalletAdjustPage';
import { WalletEntryPage } from './wallets/WalletEntryPage';

/** Super Admin library wallets. Each library keeps its own wallet. */
export function WalletsAdmin() {
  const [page, setPage] = useState('list');
  const [libraryId, setLibraryId] = useState(null);
  const [entryId, setEntryId] = useState(null);
  const open = (next, extra) => {
    if (next === 'detail') setLibraryId(extra || libraryId);
    if (next === 'entry') setEntryId(extra || null);
    if (next === 'add' || next === 'deduct') setLibraryId(extra || libraryId);
    setPage(next);
  };
  if (page === 'detail' && libraryId) return <WalletDetailPage libraryId={libraryId} onOpen={open} />;
  if ((page === 'add' || page === 'deduct') && libraryId) return <WalletAdjustPage libraryId={libraryId} mode={page} onOpen={open} />;
  if (page === 'entry' && libraryId && entryId) return <WalletEntryPage libraryId={libraryId} entryId={entryId} onOpen={open} />;
  return <WalletsListPage onOpen={open} />;
}
