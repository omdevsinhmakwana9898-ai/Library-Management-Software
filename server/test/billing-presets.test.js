import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BILLING_PRESETS, billingPresetRange } from '../src/billingHistory.js';
import { presetRange } from '../src/businessCollections.js';

const now = new Date('2026-11-27T12:00:00+05:30');

test('billing history keeps older presets and accepts last 3 years', () => {
  assert.ok(BILLING_PRESETS.includes('today'));
  assert.ok(BILLING_PRESETS.includes('last_2_days'));
  assert.ok(BILLING_PRESETS.includes('last_3_years'));
  const span = billingPresetRange('last_3_years', { now });
  assert.equal(span.preset, 'last_3_years');
  assert.deepEqual({ from: span.from, to: span.to }, presetRange('last_3_years', now));
  assert.deepEqual(
    { from: billingPresetRange('today', { now }).from, to: billingPresetRange('today', { now }).to },
    { from: '2026-11-27', to: '2026-11-27' },
  );
  assert.deepEqual(
    { from: billingPresetRange('last_2_days', { now }).from, to: billingPresetRange('last_2_days', { now }).to },
    { from: '2026-11-26', to: '2026-11-27' },
  );
});
