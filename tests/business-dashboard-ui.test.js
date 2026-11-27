import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dash = readFileSync(new URL('../src/auth/SuperAdminDashboard.jsx', import.meta.url), 'utf8');
const details = readFileSync(new URL('../src/auth/CollectionDetails.jsx', import.meta.url), 'utf8');
const filtersMenu = readFileSync(new URL('../src/auth/FiltersMenu.jsx', import.meta.url), 'utf8');

test('business dashboard shows the collection card and charts and moves the library table', () => {
  assert.match(dash, /This Month Software Collection/);
  assert.match(dash, /Popular Software Plans/);
  assert.match(dash, /Cities — Active Libraries/);
  assert.match(dash, /Monthly Software Collections/);
  assert.match(dash, /adminBusinessDashboard\(\)/);
  assert.match(dash, /verifiedAdminRefresh\(libs, sum\)/);
  assert.match(dash, /Software collection did not return/);
  const businessAt = dash.indexOf('id="sa-business-dashboard"');
  const directoryAt = dash.indexOf('id="sa-library-directory"');
  const insightsAt = dash.indexOf("view === 'insights' && (\n          <div style={{ display: 'flex', justifyContent: 'space-between'");
  assert.ok(businessAt !== -1 && directoryAt !== -1 && insightsAt !== -1);
  assert.ok(directoryAt > insightsAt);
  assert.ok(!dash.slice(businessAt, insightsAt).includes('sa-library-directory'));
  assert.match(dash, /New library/);
});

test('collection details separates cash, top-ups, pending, and refunds', () => {
  for (const label of ['Verified software collection', 'Wallet top-ups', 'Refunds', 'Pending payments', 'Gross receipts', 'Net software collection', 'Projected / scheduled']) {
    assert.match(details, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  for (const preset of ['Last 7 days', 'This month', 'Last month', 'Last 2 months', 'Last 3 months', 'Last 6 months', 'Last 1 year', 'Last 3 years', 'All time', 'Custom']) {
    assert.match(details, new RegExp(preset));
  }
  assert.match(details, /sa-collection-filters-button/);
  assert.match(details, /sa-collection-filters-menu/);
  assert.match(details, /aria-label="Date range"/);
  assert.match(details, /flexDirection: 'column'/);
  assert.doesNotMatch(details, /gridTemplateColumns: 'repeat\(auto-fit, minmax\(160px, 1fr\)\)'/);
  assert.match(filtersMenu, /id=\{buttonId\}/);
  assert.match(filtersMenu, /id=\{menuId\}/);
  assert.match(filtersMenu, /sa-filters-menu-body/);
  assert.match(filtersMenu, /overflowY: 'auto'/);
  assert.match(filtersMenu, />Apply</);
  assert.match(filtersMenu, />Reset</);
  assert.match(details, /adminCollectionRecord/);
  assert.match(details, /Download receipt/);
  assert.match(details, /Totals follow the date range/);
});
