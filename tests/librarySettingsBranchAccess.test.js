import { test } from 'node:test';
import assert from 'node:assert/strict';
import { librarySettingsBranchAccess, resolveConfigurationScope } from '../src/utils/scopeResolver.js';

test('zero branches open Library Settings at library scope with no picker', () => {
  const access = librarySettingsBranchAccess([]);
  assert.equal(access.showBranchPicker, false);
  assert.equal(access.openDirectly, true);
  assert.equal(access.selectedBranchId, 'all');
  const scope = resolveConfigurationScope({ branches: [], sections: [], selectedBranchId: access.selectedBranchId });
  assert.equal(scope.resolvedBranchId, null);
  assert.equal(scope.scopeType, 'LIBRARY');
  assert.equal(scope.showBranchSelector, false);
});

test('one branch opens Library Settings on that branch with no picker', () => {
  const branches = [{ id: 'b-main', name: 'Main' }];
  const access = librarySettingsBranchAccess(branches);
  assert.equal(access.showBranchPicker, false);
  assert.equal(access.openDirectly, true);
  assert.equal(access.selectedBranchId, 'b-main');
  const scope = resolveConfigurationScope({ branches, sections: [], selectedBranchId: access.selectedBranchId });
  assert.equal(scope.resolvedBranchId, 'b-main');
  assert.equal(scope.showBranchSelector, false);
});

test('two or more branches still require an explicit branch pick', () => {
  const branches = [{ id: 'b1', name: 'North' }, { id: 'b2', name: 'South' }];
  const access = librarySettingsBranchAccess(branches);
  assert.equal(access.showBranchPicker, true);
  assert.equal(access.openDirectly, false);
  assert.equal(access.selectedBranchId, null);
  const scope = resolveConfigurationScope({ branches, sections: [], selectedBranchId: 'b2' });
  assert.equal(scope.showBranchSelector, true);
  assert.equal(scope.resolvedBranchId, 'b2');
});
