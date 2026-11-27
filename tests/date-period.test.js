import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DATE_PERIOD_PRESETS, resolveDatePeriod } from '../src/auth/datePeriod.js';

const now = new Date('2026-11-27T12:00:00+05:30');

test('period dropdown keys stay in the shared order', () => {
  assert.deepEqual(DATE_PERIOD_PRESETS.map(([id]) => id), [
    'last_7_days', 'this_month', 'last_month', 'last_2_months', 'last_3_months',
    'last_6_months', 'last_1_year', 'last_3_years', 'all_time', 'custom',
  ]);
});

test('client period bounds match collection calendar math in Asia/Kolkata', () => {
  assert.deepEqual(resolveDatePeriod('last_7_days', now), { from: '2026-11-21', to: '2026-11-27' });
  assert.deepEqual(resolveDatePeriod('this_month', now), { from: '2026-11-01', to: '2026-11-30' });
  assert.deepEqual(resolveDatePeriod('last_month', now), { from: '2026-10-01', to: '2026-10-31' });
  assert.deepEqual(resolveDatePeriod('last_2_months', now), { from: '2026-10-01', to: '2026-11-30' });
  assert.deepEqual(resolveDatePeriod('last_3_months', now), { from: '2026-09-01', to: '2026-11-30' });
  assert.deepEqual(resolveDatePeriod('last_6_months', now), { from: '2026-06-01', to: '2026-11-30' });
  assert.deepEqual(resolveDatePeriod('last_1_year', now), { from: '2025-12-01', to: '2026-11-30' });
  assert.deepEqual(resolveDatePeriod('last_3_years', now), { from: '2023-12-01', to: '2026-11-30' });
  assert.deepEqual(resolveDatePeriod('all_time', now), { from: null, to: null });
  assert.deepEqual(resolveDatePeriod('custom', now), { from: null, to: null });
});
