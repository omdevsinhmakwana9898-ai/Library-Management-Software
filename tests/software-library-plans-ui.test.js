import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const dash = readFileSync(new URL('../src/auth/SuperAdminDashboard.jsx', import.meta.url), 'utf8');
const catalog = readFileSync(new URL('../src/auth/SoftwarePlansCatalog.jsx', import.meta.url), 'utf8');
const plans = readFileSync(new URL('../src/auth/LibraryPlans.jsx', import.meta.url), 'utf8');
const details = readFileSync(new URL('../src/auth/LibraryDetails.jsx', import.meta.url), 'utf8');

test('software catalog and library plans are separate super admin pages', () => {
  assert.match(dash, /id="sa-tab-software-plans"/);
  assert.match(dash, /id="sa-tab-library-plans"/);
  assert.match(dash, /SoftwarePlansCatalog/);
  assert.match(dash, /LibraryPlans/);
  assert.match(catalog, /id="sa-software-plans-catalog"/);
  assert.match(catalog, /id="sa-plan-editor"/);
  assert.match(catalog, /id="sa-plan-details"/);
  assert.match(catalog, /sa-software-plans-filters-button/);
  assert.match(catalog, /sa-software-plans-filters-menu/);
  assert.match(catalog, /FiltersMenu/);
  assert.match(catalog, /WhatsApp/);
  assert.match(catalog, /Seat capacity/);
  assert.match(catalog, /confirmArchive/);
  assert.match(catalog, /does not change paid invoices/);
  assert.match(plans, /id="sa-library-plans"/);
  assert.match(plans, /sa-library-plans-filters-button/);
  assert.match(plans, /sa-library-plans-filters-menu/);
  assert.match(plans, /sa-library-plans-search/);
  assert.match(plans, /FiltersMenu/);
  assert.match(plans, /Renewal outstanding/);
  assert.match(plans, /Expired for N months/);
  assert.match(plans, /Account/);
  assert.match(plans, /adminLibraryPlans/);
  assert.match(details, /sa-library-plan-assign/);
  assert.match(details, /does not create a charge/);
  assert.match(details, /Back to library plans|backLabel/);
  assert.doesNotMatch(catalog, /adminUpdateLibrary/);
});
