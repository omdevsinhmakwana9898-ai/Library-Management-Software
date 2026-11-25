import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  isBranchScopedStaffRole,
  isMultiBranchStaffRole,
  isSingleBranchStaffRole,
  resolveStaffBranchId,
  resolveStaffBranchIds,
  showStaffBranchSelector,
  staffAllowedBranchIds,
  staffLockedBranchId,
} from '../src/utils/staffPermissions.js';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const branches = [{ id: 'b1', name: 'North' }, { id: 'b2', name: 'South' }];

test('Admin has no picker; Staff is one branch; Manager and Accountant are multi-select', () => {
  assert.equal(showStaffBranchSelector('Admin', branches), false);
  assert.equal(showStaffBranchSelector('client_admin', branches), false);
  assert.equal(isSingleBranchStaffRole('Librarian'), true);
  assert.equal(isMultiBranchStaffRole('Manager'), true);
  assert.equal(isMultiBranchStaffRole('Accountant'), true);
  assert.equal(isBranchScopedStaffRole('Librarian'), true);
  assert.equal(showStaffBranchSelector('Librarian', branches), true);
  assert.equal(showStaffBranchSelector('Manager', branches), true);
  assert.equal(showStaffBranchSelector('Accountant', branches), true);
  assert.equal(showStaffBranchSelector('Librarian', [{ id: 'b1', name: 'Only' }]), false);
  assert.equal(showStaffBranchSelector('Manager', []), false);

  assert.equal(resolveStaffBranchId('Admin', 'b1', branches), 'all');
  assert.equal(resolveStaffBranchId('Librarian', 'b2', branches), 'b2');
  assert.equal(resolveStaffBranchId('Librarian', 'all', branches), 'b1');
  assert.equal(resolveStaffBranchId('Librarian', 'b2', [{ id: 'b1', name: 'Only' }]), 'b1');
  assert.deepEqual(resolveStaffBranchIds('Admin', ['b1', 'b2'], branches), []);
  assert.deepEqual(resolveStaffBranchIds('Librarian', ['b2'], branches), ['b2']);
  assert.deepEqual(resolveStaffBranchIds('Manager', ['b2', 'b1'], branches), ['b2', 'b1']);
  assert.deepEqual(resolveStaffBranchIds('Accountant', [], branches, 'b2'), ['b2']);

  const settings = read('../src/components/LibrarySettings.jsx');
  assert.match(settings, /id="staff-branch-select"/);
  assert.match(settings, /isMultiBranchStaffRole\(staffFormData\.role\)/);
  assert.doesNotMatch(settings, /id="staff-branch-select"[\s\S]{0,400}<option value="all">All Branches<\/option>/);
});

test('login is locked to the assigned branch or branches', () => {
  assert.equal(staffLockedBranchId({ role: 'Librarian', branchId: 'b1' }), 'b1');
  assert.equal(staffLockedBranchId({ role: 'Librarian', branchId: 'all' }), null);
  assert.equal(staffLockedBranchId({ role: 'Admin', branchId: 'b1' }), null);
  assert.deepEqual(staffAllowedBranchIds({ role: 'Manager', branchIds: ['b1', 'b2'] }), ['b1', 'b2']);
  assert.equal(staffLockedBranchId({ role: 'Manager', branchIds: ['b1', 'b2'] }), null);
  assert.equal(staffLockedBranchId({ role: 'Accountant', branchIds: ['b2'] }), 'b2');
  assert.equal(staffLockedBranchId(null), null);

  const header = read('../src/components/Header.jsx');
  const provider = read('../src/context/LibraryContext.jsx');
  const profile = read('../src/components/profile/LibraryOsProfile.jsx');
  assert.match(header, /lockedBranchId \?/);
  assert.match(header, /lockedBranchIds\?\.length > 1/);
  assert.match(provider, /staffAllowedBranchIds/);
  assert.match(provider, /lockedBranchIds\.includes\(value\)/);
  assert.match(profile, /lockedBranchIds\?\.length > 1/);
  assert.equal(header.includes('<option value="all">All Branches</option>'), true);
});
