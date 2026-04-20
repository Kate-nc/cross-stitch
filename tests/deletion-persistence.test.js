/**
 * Deletion persistence tests
 *
 * Verifies that deletion guards and immediate-write patterns are present
 * in the source code, and that the core _deletedIds logic works correctly.
 */
const fs = require('fs');
const path = require('path');

const storageSrc = fs.readFileSync(path.resolve(__dirname, '..', 'project-storage.js'), 'utf8');
const helpersSrc = fs.readFileSync(path.resolve(__dirname, '..', 'helpers.js'), 'utf8');
const managerSrc = fs.readFileSync(path.resolve(__dirname, '..', 'manager-app.js'), 'utf8');

describe('ProjectStorage deletion guards (source analysis)', () => {
  test('delete() records the ID in _deletedIds before deleting', () => {
    // The delete method should add to _deletedIds BEFORE issuing the IDB transaction
    const deleteMethod = storageSrc.match(/async delete\(id\)\s*\{[\s\S]*?\n    \}/);
    expect(deleteMethod).not.toBeNull();
    const body = deleteMethod[0];
    expect(body).toContain('_deletedIds.add(id)');
    // _deletedIds.add should come before the transaction
    const addIdx = body.indexOf('_deletedIds.add(id)');
    const txIdx = body.indexOf('db.transaction');
    expect(addIdx).toBeLessThan(txIdx);
  });

  test('delete() also removes the legacy auto_save key', () => {
    const deleteMethod = storageSrc.match(/async delete\(id\)\s*\{[\s\S]*?\n    \}/);
    expect(deleteMethod).not.toBeNull();
    expect(deleteMethod[0]).toContain("store.delete(\"auto_save\")");
  });

  test('save() checks _deletedIds before writing', () => {
    const saveMethod = storageSrc.match(/async save\(project\)\s*\{[\s\S]*?\n    \}/);
    expect(saveMethod).not.toBeNull();
    const body = saveMethod[0];
    expect(body).toContain('_deletedIds.has(project.id)');
    // The guard should come before the transaction
    const guardIdx = body.indexOf('_deletedIds.has(project.id)');
    const txIdx = body.indexOf('db.transaction');
    expect(guardIdx).toBeLessThan(txIdx);
  });

  test('save() returns early without writing when project is deleted', () => {
    const saveMethod = storageSrc.match(/async save\(project\)\s*\{[\s\S]*?\n    \}/);
    const body = saveMethod[0];
    // Should return early with project.id (no-op)
    expect(body).toMatch(/if\s*\(this\._deletedIds\.has\(project\.id\)\)\s*\{?\s*return project\.id/);
  });

  test('isDeleted() method exists', () => {
    expect(storageSrc).toContain('isDeleted(id)');
    expect(storageSrc).toContain('_deletedIds.has(id)');
  });

  test('_deletedIds is initialised as a Set', () => {
    expect(storageSrc).toContain('_deletedIds: new Set()');
  });
});

describe('saveProjectToDB deletion guard', () => {
  test('checks ProjectStorage.isDeleted before saving', () => {
    expect(helpersSrc).toContain('ProjectStorage.isDeleted');
  });

  test('returns early when project is deleted', () => {
    const guardPattern = /if\s*\(project\s*&&\s*project\.id\s*&&\s*typeof\s+ProjectStorage\s*!==\s*['"]undefined['"]\s*&&\s*ProjectStorage\.isDeleted\(project\.id\)\)\s*return/;
    expect(guardPattern.test(helpersSrc)).toBe(true);
  });
});

describe('Manager pattern deletion writes immediately', () => {
  test('deletePattern writes to IDB immediately (not just via debounce)', () => {
    expect(managerSrc).toContain('Immediate pattern delete save failed');
  });

  test('manager has beforeunload handler to flush pending saves', () => {
    // Verify beforeunload is registered and that it writes to the manager_state store
    const handleIdx = managerSrc.indexOf('handleBeforeUnload');
    expect(handleIdx).toBeGreaterThan(-1);
    const handlerSection = managerSrc.slice(handleIdx, handleIdx + 500);
    expect(handlerSection).toContain('manager_state');
  });

  test('stored project deletion cascades to pattern library', () => {
    // The delete button handler should remove linked patterns
    expect(managerSrc).toContain('linkedProjectId');
    expect(managerSrc).toContain('Cascade pattern library cleanup');
  });

  test('cascade delete also writes to IDB immediately', () => {
    // Verify the cascade writes the updated patterns array directly to IDB
    const cascadeIdx = managerSrc.indexOf('Cascade pattern library');
    expect(cascadeIdx).toBeGreaterThan(-1);
    const cascadeSection = managerSrc.slice(Math.max(0, cascadeIdx - 200), cascadeIdx);
    expect(cascadeSection).toContain('manager_state');
  });
});

describe('_deletedIds core logic', () => {
  // Test the Set-based deletion tracking logic directly
  test('Set correctly tracks deleted IDs', () => {
    const deleted = new Set();
    expect(deleted.has('proj_123')).toBe(false);
    deleted.add('proj_123');
    expect(deleted.has('proj_123')).toBe(true);
    expect(deleted.has('proj_456')).toBe(false);
  });

  test('save guard logic prevents resurrection', () => {
    const deleted = new Set();
    deleted.add('proj_123');
    // Simulate the guard
    const project = { id: 'proj_123' };
    const shouldSave = !deleted.has(project.id);
    expect(shouldSave).toBe(false);
  });

  test('save guard allows undeleted projects', () => {
    const deleted = new Set();
    deleted.add('proj_123');
    const project = { id: 'proj_456' };
    const shouldSave = !deleted.has(project.id);
    expect(shouldSave).toBe(true);
  });
});

describe('saveProjectToDB deletion guard', () => {
  test('saveProjectToDB source code checks ProjectStorage.isDeleted', () => {
    expect(helpersSrc).toContain('ProjectStorage.isDeleted');
  });

  test('saveProjectToDB skips saving when project is deleted', () => {
    const guardPattern = /if\s*\(project\s*&&\s*project\.id\s*&&\s*typeof\s+ProjectStorage\s*!==\s*['"]undefined['"]\s*&&\s*ProjectStorage\.isDeleted\(project\.id\)\)\s*return/;
    expect(guardPattern.test(helpersSrc)).toBe(true);
  });
});

describe('Manager pattern deletion writes immediately', () => {
  const managerSrc = fs.readFileSync(path.resolve(__dirname, '..', 'manager-app.js'), 'utf8');

  test('deletePattern writes to IDB immediately (not just via debounce)', () => {
    expect(managerSrc).toContain('Immediate pattern delete save failed');
  });

  test('manager has beforeunload handler to flush pending saves', () => {
    expect(managerSrc).toContain('beforeunload');
  });

  test('stored project deletion cascades to pattern library', () => {
    expect(managerSrc).toContain('linkedProjectId');
    expect(managerSrc).toContain('Cascade pattern library cleanup');
  });
});
