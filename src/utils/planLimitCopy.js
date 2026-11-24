import { subscriptionLifecycle } from './subscriptionLifecycle.js';

export const PLAN_LIMIT_TITLE = 'Plan Limit Exceeded';

let cachedLimits = null;
export function rememberPlanLimits(limits) {
  if (limits && typeof limits === 'object') cachedLimits = limits;
}
export function cachedDeskLimit() { return cachedLimits?.deskLimit ?? null; }
export function cachedStudentLimit() { return cachedLimits?.studentLimit ?? null; }

const INACTIVE_STUDENT_STATUSES = new Set(['Archived', 'Cancelled', 'Left', 'Inactive', 'Deleted', 'Removed']);

/** Current physical desks that count toward the software-plan desk cap. */
export function countPlanDesks(seats = []) {
  const seen = new Set();
  let n = 0;
  for (const seat of seats) {
    if (!deskCountsTowardLimit(seat)) continue;
    const key = deskIdentity(seat);
    if (seen.has(key)) continue;
    seen.add(key);
    n++;
  }
  return n;
}

export function deskCountsTowardLimit(seat) {
  if (!seat) return false;
  if (seat.isDeleted || seat.deletedAt || seat.deleted) return false;
  const status = String(seat.status || '').toLowerCase();
  if (status === 'deleted' || status === 'removed' || status === 'inactive') return false;
  return true;
}

export function deskIdentity(seat) {
  const name = String(seat?.name ?? seat?.seatNumber ?? '').trim().toLowerCase();
  return `${seat?.branchId || 'none'}|${seat?.sectionId || 'none'}|${name || seat?.id || ''}`;
}

/**
 * Keep a Setup Wizard draft in sync with Seat Map removals and additions.
 * `baselineIds` are the live seat ids when the draft was opened.
 * Desks later removed from the live map are dropped; wizard-only adds are kept.
 */
export function syncDraftSeats(draftSeats, liveSeats = [], baselineIds = null) {
  const live = Array.isArray(liveSeats) ? liveSeats : [];
  const liveIds = new Set(live.map(s => s?.id).filter(Boolean));
  if (!Array.isArray(draftSeats)) return [...live];
  if (!Array.isArray(baselineIds)) {
    // Legacy drafts have no baseline: if the live map is smaller, prefer live
    // seats so removed desks do not keep consuming capacity in the wizard.
    if (live.length && live.length < draftSeats.length) return [...live];
    return draftSeats.length ? [...draftSeats] : [...live];
  }
  const baseline = new Set(baselineIds);
  const kept = draftSeats.filter(s => liveIds.has(s?.id) || !baseline.has(s?.id));
  const keptIds = new Set(kept.map(s => s?.id).filter(Boolean));
  for (const s of live) {
    if (s?.id && !keptIds.has(s.id) && !baseline.has(s.id)) {
      kept.push(s);
      keptIds.add(s.id);
    }
  }
  return kept;
}

/** Copy when a desk add would grow past the cap. Null when the add is allowed. */
export function deskLimitExceededCopy(currentCount, addCount, limit) {
  if (!(addCount > 0) || !(limit > 0)) return null;
  const next = currentCount + addCount;
  if (next > limit && next > currentCount) {
    return `${PLAN_LIMIT_TITLE}. Your plan allows up to ${limit} physical desks (${currentCount} in use). Upgrade the plan to add more.`;
  }
  return null;
}

/** Returns an error string when adding desks would pass the cap, otherwise null. */
export async function deskGrowthMessage(currentCount, addCount) {
  if (!(addCount > 0)) return null;
  let limit = null;
  try {
    const { api } = await import('./api');
    const sub = await api.subscription();
    rememberPlanLimits(sub?.limits);
    limit = sub?.limits?.deskLimit;
  } catch {
    return null;
  }
  return deskLimitExceededCopy(currentCount, addCount, limit);
}

export function countPlanStudents(students = [], { settings = null, today = '' } = {}) {
  return students.filter(s => countsTowardPlanStudentLimit(s, { settings, today })).length;
}

export function countsTowardPlanStudentLimit(student, { settings = null, today = '' } = {}) {
  if (!student) return false;
  const stored = String(student.status || '');
  if (INACTIVE_STUDENT_STATUSES.has(stored)) return false;
  const life = subscriptionLifecycle(student, { settings, today });
  return life.status === 'Active' || life.status === 'Grace Period';
}

export function studentLimitExceededCopy(currentCount, addCount, limit) {
  if (!(addCount > 0) || !(limit > 0)) return null;
  const next = currentCount + addCount;
  if (next > limit && next > currentCount) {
    return `${PLAN_LIMIT_TITLE} (${next}/${limit} active students, including grace). Upgrade the plan to add more.`;
  }
  return null;
}

export async function studentGrowthMessage(currentCount, addCount) {
  if (!(addCount > 0)) return null;
  let limit = null;
  try {
    const { api } = await import('./api');
    const sub = await api.subscription();
    rememberPlanLimits(sub?.limits);
    limit = sub?.limits?.studentLimit;
  } catch {
    return null;
  }
  return studentLimitExceededCopy(currentCount, addCount, limit);
}
