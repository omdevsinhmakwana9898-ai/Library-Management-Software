/**
 * Fixed usage of a library against a software-plan cap.
 * Students follow the same Active + Grace rule as owner limit checks.
 * Staff is current staff logins plus pending staff invites.
 * Nonfixed allocation is intentionally not counted — that feature is deferred.
 */
import mongoose from 'mongoose';
import { User, models, Settings } from './models.js';
import { countsTowardStudentLimit } from './students.js';
import { countCurrentDesks } from './plans.js';
import { todayIn } from './finance.js';

export async function usageByLibrary(tenantIds = []) {
  const ids = [...new Set(tenantIds.filter(Boolean))];
  const today = todayIn();
  const out = {};
  await Promise.all(ids.map(async (tenantId) => {
    const Invite = mongoose.models.Invite;
    const [studentDocs, staffUsers, pending, branches, desks, settings] = await Promise.all([
      models.students.find({ tenantId }).lean(),
      User.countDocuments({ tenantId, role: 'staff' }),
      Invite
        ? Invite.countDocuments({ tenantId, role: 'staff', usedAt: null, revokedAt: null, expiresAt: { $gt: new Date() } })
        : 0,
      models.branches.countDocuments({ tenantId }),
      countCurrentDesks(tenantId),
      Settings.findOne({ tenantId }).lean(),
    ]);
    const students = studentDocs.filter(s => countsTowardStudentLimit(s, { settings, today })).length;
    out[tenantId] = { students, staff: staffUsers + pending, branches, desks };
  }));
  return out;
}
