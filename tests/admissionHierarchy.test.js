import test from 'node:test';
import assert from 'node:assert/strict';
import {
  childrenAfterSectionChange,
  shiftAfterPlanChange,
  shouldFilterPlansByShift,
  planValidForSection,
} from '../src/utils/admissionHierarchy.js';

const isShiftInPlan = (_shifts, plan, shiftId) => Boolean(plan && (plan.shiftIds || []).includes(shiftId));

const planA = { id: 'P-A', sectionId: 'S-A', shiftIds: ['SH-A1', 'SH-A2'] };
const planB = { id: 'P-B', sectionId: 'S-B', shiftIds: ['SH-B1'] };
const planAll = { id: 'P-ALL', sectionId: 'all', shiftIds: ['SH-A1', 'SH-B1'] };
const shiftA1 = { id: 'SH-A1', sectionId: 'S-A' };
const shiftB1 = { id: 'SH-B1', sectionId: 'S-B' };

test('changing section clears a plan and shift that belong to the old section', () => {
  const next = childrenAfterSectionChange({
    sectionId: 'S-B',
    plan: planA,
    planId: 'P-A',
    shift: shiftA1,
    shiftId: 'SH-A1',
    isShiftInPlan,
  });
  assert.deepEqual(next, { planId: '', shiftId: '' });
});

test('changing section keeps a plan and shift that are still valid for the new section', () => {
  const next = childrenAfterSectionChange({
    sectionId: 'S-A',
    plan: planA,
    planId: 'P-A',
    shift: shiftA1,
    shiftId: 'SH-A1',
    isShiftInPlan,
  });
  assert.deepEqual(next, { planId: 'P-A', shiftId: 'SH-A1' });
});

test('an all-section plan is kept when the section changes, but a section-bound shift is cleared', () => {
  const next = childrenAfterSectionChange({
    sectionId: 'S-B',
    plan: planAll,
    planId: 'P-ALL',
    shift: shiftA1,
    shiftId: 'SH-A1',
    isShiftInPlan,
  });
  assert.deepEqual(next, { planId: 'P-ALL', shiftId: '' });
});

test('changing plan clears a shift that is not on the new plan', () => {
  assert.equal(shiftAfterPlanChange({ plan: planB, shiftId: 'SH-A1', isShiftInPlan }), '');
});

test('changing plan keeps a shift that is still on the new plan', () => {
  assert.equal(shiftAfterPlanChange({ plan: planA, shiftId: 'SH-A1', isShiftInPlan }), 'SH-A1');
});

test('clearing the plan also clears the shift', () => {
  assert.equal(shiftAfterPlanChange({ plan: null, shiftId: 'SH-A1', isShiftInPlan }), '');
});

test('plan-first lists are not filtered by the selected shift; seat-first lists are', () => {
  assert.equal(shouldFilterPlansByShift('plan-first'), false);
  assert.equal(shouldFilterPlansByShift('seat-first'), true);
});

test('a plan with no section stays valid for any section', () => {
  assert.equal(planValidForSection({ id: 'P', shiftIds: ['SH-A1'] }, 'S-B'), true);
  assert.equal(planValidForSection(planA, 'S-B'), false);
});
