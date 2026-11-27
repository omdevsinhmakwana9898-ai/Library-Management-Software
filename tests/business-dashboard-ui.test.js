import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dash = readFileSync(new URL('../src/auth/SuperAdminDashboard.jsx', import.meta.url), 'utf8');
const details = readFileSync(new URL('../src/auth/CollectionDetails.jsx', import.meta.url), 'utf8');
const filtersMenu = readFileSync(new URL('../src/auth/FiltersMenu.jsx', import.meta.url), 'utf8');
const datePeriod = readFileSync(new URL('../src/auth/datePeriod.js', import.meta.url), 'utf8');

test('business dashboard shows the collection card and charts and moves the library table', () => {
  assert.match(dash, /This Month Software Collection/);
  assert.match(dash, /Popular Software Plans/);
  assert.match(dash, /Cities — Active Libraries/);
  assert.match(dash, /Monthly Software Collections/);
  assert.match(dash, /adminBusinessDashboard\(\)/);
  assert.match(dash, /verifiedAdminRefresh\(libs, sum\)/);
  assert.match(dash, /Software collection did not return/);
  const businessAt = dash.indexOf('id="sa-business-dashboard"');
  const insightsAt = dash.indexOf("view === 'insights' && !insightNav && (");
  assert.ok(businessAt !== -1 && insightsAt !== -1);
  assert.ok(insightsAt > businessAt);
  assert.ok(!dash.slice(businessAt, insightsAt).includes('sa-library-directory'));
  assert.ok(!dash.slice(businessAt, insightsAt).includes('LibraryDirectory'));
  assert.match(dash, /New library/);
  assert.match(dash, /LibraryDirectory/);
  assert.match(dash, /PlatformInsightsOverview/);
});

test('collection details separates cash, top-ups, pending, and refunds', () => {
  for (const label of ['Verified software collection', 'Wallet top-ups', 'Refunds', 'Pending payments', 'Gross receipts', 'Net software collection', 'Projected / scheduled']) {
    assert.match(details, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(details, /DatePeriodSelect/);
  assert.match(details, /id="sa-collection-filters-period"/);
  assert.doesNotMatch(details, /aria-pressed=\{draft\.preset/);
  assert.doesNotMatch(details, /aria-label="Date range"/);
  assert.match(details, /sa-collection-filters-button/);
  assert.match(details, /sa-collection-filters-menu/);
  assert.doesNotMatch(details, /gridTemplateColumns: 'repeat\(auto-fit, minmax\(160px, 1fr\)\)'/);
  assert.match(details, /preset: 'this_month'/);
  assert.match(details, /!== 'this_month'/);
  let cursor = -1;
  for (const preset of ['Last 7 days', 'This month', 'Last month', 'Last 2 months', 'Last 3 months', 'Last 6 months', 'Last 1 year', 'Last 3 years', 'All time', 'Custom']) {
    const at = datePeriod.indexOf(`'${preset}'`);
    assert.ok(at > cursor, preset);
    cursor = at;
  }
  assert.match(filtersMenu, /DATE_PERIOD_PRESETS/);
  assert.match(filtersMenu, /export function DatePeriodSelect/);
  assert.match(filtersMenu, /htmlFor=\{id\}[^>]*>Period/);
  assert.match(filtersMenu, /className="form-select"/);
  assert.match(filtersMenu, /value === 'custom'/);
  assert.match(filtersMenu, /type="date"/);
  assert.match(filtersMenu, /id=\{buttonId\}/);
  assert.match(filtersMenu, /id=\{menuId\}/);
  assert.match(filtersMenu, /sa-filters-menu-body/);
  assert.match(filtersMenu, /overflowY: 'auto'/);
  assert.match(filtersMenu, />Apply</);
  assert.match(filtersMenu, />Reset</);
  assert.match(details, /adminCollectionRecord/);
  assert.match(details, /Download receipt/);
  assert.match(details, /Totals follow the date range/);
  assert.match(details, /id="sa-collection-record"/);
  assert.match(details, /SaRecordHero/);
  assert.match(details, /SaRecordTimeline/);
  assert.match(details, /SaRecordSection title="Payment"/);
  assert.match(details, /SaRecordSection title="Library"/);
  assert.match(details, /SaMoreInfo/);
  assert.match(details, /Paid online/);
  assert.match(details, /label: 'Created'/);
  assert.match(details, /label: 'Due'/);
  assert.match(details, /label: 'Paid'/);
  assert.match(details, /Collection details/);
  assert.doesNotMatch(details, /SaModal/);
  assert.match(details, /if \(record\)/);
  assert.match(details, /SaPageHeader/);
  assert.match(details, /SaSummaryCard/);
  assert.match(details, /SaStatusBadge/);
  assert.match(details, /SaEmpty/);
  assert.doesNotMatch(details, />\{s\}</);
  assert.match(details, /status=\{row\.status\}/);
  assert.doesNotMatch(details, />\{row\.status\}</);
});
