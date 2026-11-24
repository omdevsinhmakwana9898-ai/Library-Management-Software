import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  PLAN_LIMIT_TITLE,
  deskLimitExceededCopy,
  countPlanDesks,
  syncDraftSeats,
  countsTowardPlanStudentLimit,
  studentLimitExceededCopy,
} from '../src/utils/planLimitCopy.js';

test('desk growth copy names Plan Limit Exceeded and Upgrade', () => {
  const msg = deskLimitExceededCopy(100, 1, 100);
  assert.match(msg, new RegExp(PLAN_LIMIT_TITLE));
  assert.match(msg, /Upgrade/);
  assert.match(msg, /100 physical desks/);
  assert.equal(deskLimitExceededCopy(99, 1, 100), null);
  assert.equal(deskLimitExceededCopy(120, 0, 100), null);
  assert.equal(deskLimitExceededCopy(120, -1, 100), null);
  assert.equal(deskLimitExceededCopy(5, 1, null), null);
});

test('countPlanDesks ignores removed or duplicate desks', () => {
  const seats = [
    { id: '1', name: 'A-1', branchId: 'b1', sectionId: 's1' },
    { id: '2', name: 'A-1', branchId: 'b1', sectionId: 's1' },
    { id: '3', name: 'A-2', branchId: 'b1', sectionId: 's1', isDeleted: true },
    { id: '4', name: 'A-3', branchId: 'b1', sectionId: 's1', status: 'removed' },
    { id: '5', name: 'A-4', branchId: 'b1', sectionId: 's1' },
  ];
  assert.equal(countPlanDesks(seats), 2);
});

test('syncDraftSeats drops desks later removed from the live seat map', () => {
  const baseline = ['a', 'b', 'c'];
  const draft = [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }, { id: 'c', name: 'C' }, { id: 'new', name: 'N' }];
  const live = [{ id: 'a', name: 'A' }, { id: 'c', name: 'C' }];
  const next = syncDraftSeats(draft, live, baseline);
  assert.deepEqual(next.map(s => s.id).sort(), ['a', 'c', 'new']);
});

test('legacy drafts prefer the smaller live map so removed desks free capacity', () => {
  const draft = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
  const live = [{ id: 'a' }, { id: 'c' }];
  assert.deepEqual(syncDraftSeats(draft, live, null).map(s => s.id), ['a', 'c']);
});

test('left, cancelled, and expired students do not count toward the plan student cap', () => {
  const today = '2026-11-24';
  assert.equal(countsTowardPlanStudentLimit({ expiryDate: '2099-01-01' }, { today }), true);
  assert.equal(countsTowardPlanStudentLimit({ status: 'Left', expiryDate: '2099-01-01' }, { today }), false);
  assert.equal(countsTowardPlanStudentLimit({ status: 'Inactive', expiryDate: '2099-01-01' }, { today }), false);
  assert.equal(countsTowardPlanStudentLimit({ status: 'Cancelled', expiryDate: '2099-01-01' }, { today }), false);
  assert.equal(countsTowardPlanStudentLimit({ expiryDate: '2020-01-01', graceDaysSnapshot: 0 }, { today }), false);
  assert.equal(studentLimitExceededCopy(2, 1, 2) != null, true);
  assert.equal(studentLimitExceededCopy(1, 1, 2), null);
});
