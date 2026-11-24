/**
 * Parent-wins filtering for New Admission (and similar) forms.
 * Section is the parent of plan and shift; plan is the parent of shift.
 * Changing a parent must never be overwritten by a child that still belongs
 * to the previous parent.
 */

export function matchesScope(itemScopeId, selectedScopeId) {
  if (!selectedScopeId || selectedScopeId === 'all') return true;
  if (!itemScopeId || itemScopeId === 'all') return true;
  return itemScopeId === selectedScopeId;
}

export function planValidForSection(plan, sectionId) {
  return Boolean(plan && matchesScope(plan.sectionId, sectionId));
}

export function shiftValidForSection(shift, sectionId) {
  return Boolean(shift && matchesScope(shift.sectionId, sectionId));
}

/**
 * When the section changes, keep the plan only if it still belongs to the
 * new section (or has no/all section). Keep the shift only if the plan is
 * kept and the shift still belongs to that section and plan.
 */
export function childrenAfterSectionChange({
  sectionId,
  plan,
  planId,
  shift,
  shiftId,
  shifts = [],
  isShiftInPlan,
}) {
  const keepPlan = planValidForSection(plan, sectionId);
  const nextPlanId = keepPlan ? (planId || '') : '';
  const keepShift = Boolean(
    nextPlanId &&
    shift &&
    shiftValidForSection(shift, sectionId) &&
    typeof isShiftInPlan === 'function' &&
    isShiftInPlan(shifts, plan, shiftId)
  );
  return { planId: nextPlanId, shiftId: keepShift ? shiftId : '' };
}

/**
 * When the plan changes, keep the shift only if it is still on the new plan.
 * Does not touch section — the parent section always wins.
 */
export function shiftAfterPlanChange({ plan, shiftId, shifts = [], isShiftInPlan }) {
  if (!plan || !shiftId) return '';
  if (typeof isShiftInPlan === 'function' && isShiftInPlan(shifts, plan, shiftId)) {
    return shiftId;
  }
  return '';
}

/**
 * Plans listed in plan-first flow must not be filtered by the current shift,
 * or picking a plan that does not include that shift makes the new plan
 * disappear from the dropdown (looks like a revert).
 */
export function shouldFilterPlansByShift(admissionFlow) {
  return admissionFlow === 'seat-first';
}
