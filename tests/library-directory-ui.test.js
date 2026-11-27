import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dash = readFileSync(new URL('../src/auth/SuperAdminDashboard.jsx', import.meta.url), 'utf8');
const directory = readFileSync(new URL('../src/auth/LibraryDirectory.jsx', import.meta.url), 'utf8');
const details = readFileSync(new URL('../src/auth/LibraryDetails.jsx', import.meta.url), 'utf8');
const insights = readFileSync(new URL('../src/auth/LibraryInsights.jsx', import.meta.url), 'utf8');
const platform = insights.slice(insights.indexOf('export function PlatformInsightsOverview'), insights.indexOf('export function LibraryAnalytics'));
const analytics = insights.slice(insights.indexOf('export function LibraryAnalytics'));

test('insights directory is searchable and opens details instead of the owner workspace', () => {
  assert.match(directory, /id="sa-library-directory"/);
  assert.match(directory, /Library Name/);
  assert.match(directory, /Current Software Plan/);
  assert.match(directory, /Subscription Status/);
  assert.match(directory, /Account Status/);
  assert.match(directory, /Last Activity/);
  assert.match(directory, /Active\/Total Students/);
  assert.match(directory, /sa-library-search/);
  assert.match(directory, /sa-library-filters-button/);
  assert.match(directory, /sa-library-filters-menu/);
  assert.match(directory, /FiltersMenu/);
  assert.doesNotMatch(directory, /gridTemplateColumns: 'repeat\(auto-fit, minmax\(150px, 1fr\)\)'/);
  assert.match(directory, /Expiring soon/);
  assert.match(directory, /adminLibraryDirectory/);
  assert.match(dash, /setInsightNav\(\{ page: 'details'/);
  assert.doesNotMatch(directory, /Customer fee collections/);
  assert.doesNotMatch(directory, /Seat utilization/);
});

test('platform insights overview keeps libraries and students only', () => {
  assert.match(platform, /id="sa-insights-overview"/);
  assert.match(platform, /Active students/);
  assert.match(platform, /Libraries/);
  assert.match(platform, /adminInsightsOverview/);
  assert.match(platform, /separate from software revenue|Customer money is separate/);
  assert.doesNotMatch(platform, /label="Seat utilization"/);
  assert.doesNotMatch(platform, /label="Customer fee collections"/);
  assert.doesNotMatch(platform, /label="Customer expenses"/);
  assert.doesNotMatch(platform, /label="Customer net"/);
  assert.doesNotMatch(platform, /Collections by month/);
  assert.doesNotMatch(dash, /label="Customer fee collections"/);
  assert.doesNotMatch(dash, /Seat utilization/);
});

test('library details keeps plan cards and the existing management actions', () => {
  assert.match(details, /id="sa-library-details"/);
  assert.match(details, /SaRecordHero/);
  assert.match(details, /SaRecordTimeline/);
  assert.match(details, /SaMoreInfo/);
  assert.match(details, /Software Plan/);
  assert.match(details, /Plan Expiry/);
  assert.match(details, /View Only/);
  assert.match(details, /Access Library/);
  assert.match(details, /Manage Staff/);
  assert.match(details, /Assisted password reset/);
  assert.match(details, /Delete Library/);
  assert.match(details, /onOpenLibrary\(library, true\)/);
  assert.match(details, /onOpenLibrary\(library, false\)/);
  assert.match(details, /sa-library-status-reason/);
  assert.match(details, /Last Active/);
  assert.match(details, /Assigned Partner/);
  assert.match(dash, /adminDeleteLibrary|setDeleteFor/);
  assert.match(dash, /New library/);
});

test('per-library analytics is where customer fees and seat use are shown', () => {
  assert.match(analytics, /id="sa-library-analytics"/);
  assert.match(analytics, /Seat utilization/);
  assert.match(analytics, /Customer fee collections/);
  assert.match(analytics, /Customer expenses/);
  assert.match(analytics, /Customer net/);
  assert.match(analytics, /Collections by month/);
  assert.match(analytics, /Popular membership plans/);
  assert.match(analytics, /libraryId/);
  assert.match(analytics, /export\.csv/);
  assert.match(analytics, /sa-analytics-filters-button/);
  assert.match(analytics, /sa-analytics-filters-menu/);
  assert.match(analytics, /DatePeriodSelect/);
  assert.match(analytics, /sa-analytics-filters-period/);
  assert.match(analytics, /period: 'all_time'/);
  assert.match(analytics, /resolveDatePeriod/);
  assert.match(analytics, /!== 'all_time'/);
  assert.doesNotMatch(analytics, /type="date"/);
  assert.match(analytics, /<span>CSV<\/span>/);
  assert.doesNotMatch(analytics, /gridTemplateColumns: 'repeat\(auto-fit, minmax\(140px, 1fr\)\)'/);
  assert.match(dash, /page: 'analytics'/);
});
