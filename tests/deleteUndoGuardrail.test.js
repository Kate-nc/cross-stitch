/* tests/deleteUndoGuardrail.test.js — regression guard for the delete
 * wrong-target and undo-silently-fails bugs.
 * ════════════════════════════════════════════════════════════════════════
 *
 * Bugs fixed:
 *
 *   DEL-BUG-002 — home-screen.js doBulkDelete's undoAction called
 *     ProjectStorage.save(p) without first removing p.id from
 *     ProjectStorage._deletedIds.  save() silently no-ops for IDs in
 *     _deletedIds, so the restore was swallowed with no error or feedback.
 *
 *   DEL-BUG-003 — BulkDeleteModal body said "This cannot be undone" while
 *     simultaneously showing a Toast Undo button.  Updated to reflect the
 *     undo window.
 *
 * Diagnosis context:
 *
 *   The reported "deletes the wrong (most recently edited) project" symptom
 *   was traced to an indirect interaction with the navigation bug documented
 *   in reports/edit-track-navigation-bug.md.  The navigation bug caused
 *   Track/Edit to open the wrong project, which silently reordered the
 *   project list, causing subsequent delete clicks to land on the wrong row.
 *   The navigation fix (belt-and-suspenders ?id= URL param) addresses this.
 *   These tests confirm the delete path itself never reads getActiveProjectId()
 *   as its deletion target.
 *
 * Testing strategy: source-content assertions (no IndexedDB / React / DOM
 * required), following the pattern established in
 * tests/trackNavigationGuardrail.test.js and tests/multiSelectDashboard.test.js.
 * ════════════════════════════════════════════════════════════════════════
 */

const fs = require('fs');
const path = require('path');

const homeScreen = fs.readFileSync(path.join(__dirname, '..', 'home-screen.js'), 'utf8');
const managerApp = fs.readFileSync(path.join(__dirname, '..', 'manager-app.js'), 'utf8');

// ── DEL-BUG-002 fix: undo handler clears _deletedIds before save ─────────────
describe('doBulkDelete undo handler clears _deletedIds before restore (DEL-BUG-002)', () => {
  test('undoAction calls _deletedIds.delete(p.id) before ProjectStorage.save(p)', () => {
    // Locate the undoAction block inside doBulkDelete.
    const undoBlock = homeScreen.match(
      /undoAction:\s*function\s*\(\)\s*\{[\s\S]*?ProjectStorage\.save\(p\)/
    );
    expect(undoBlock).not.toBeNull();
    const block = undoBlock[0];

    // The _deletedIds.delete() call must appear in the block.
    expect(block).toMatch(/ProjectStorage\._deletedIds/);
    expect(block).toMatch(/_deletedIds\.delete\(p\.id\)/);

    // _deletedIds.delete must appear BEFORE ProjectStorage.save.
    const deleteIdx = block.indexOf('_deletedIds.delete(p.id)');
    const saveIdx   = block.indexOf('ProjectStorage.save(p)');
    expect(deleteIdx).toBeGreaterThanOrEqual(0);
    expect(saveIdx).toBeGreaterThanOrEqual(0);
    expect(deleteIdx).toBeLessThan(saveIdx);
  });

  test('undoAction guards _deletedIds access with typeof check', () => {
    // The guard prevents crashes if _deletedIds is ever removed from
    // ProjectStorage (e.g. a future refactor).
    expect(homeScreen).toMatch(
      /ProjectStorage\._deletedIds\s*&&\s*typeof\s*ProjectStorage\._deletedIds\.delete\s*===\s*['"]function['"]/
    );
  });

  test('undoAction shows a success toast after restoring', () => {
    // Confirms the user gets feedback that the restore worked.
    const undoBlock = homeScreen.match(
      /undoAction:\s*function\s*\(\)\s*\{[\s\S]*?Restored/
    );
    expect(undoBlock).not.toBeNull();
    expect(undoBlock[0]).toMatch(/Restored/);
  });
});

// ── DEL-BUG-003 fix: modal copy no longer says "cannot be undone" ────────────
describe('BulkDeleteModal copy reflects undo window (DEL-BUG-003)', () => {
  test('BulkDeleteModal body does NOT say "cannot be undone"', () => {
    // The old text was factually wrong: a Toast Undo button exists.
    // After the DEL-BUG-002 fix the undo now actually works.
    const modalBlock = homeScreen.match(
      /function BulkDeleteModal[\s\S]*?^}/m
    );
    expect(modalBlock).not.toBeNull();
    expect(modalBlock[0]).not.toMatch(/cannot be undone/i);
  });

  test('BulkDeleteModal body mentions undo opportunity', () => {
    // Replacement copy should tell the user they can undo.
    const modalBlock = homeScreen.match(
      /function BulkDeleteModal[\s\S]*?^}/m
    );
    expect(modalBlock).not.toBeNull();
    expect(modalBlock[0]).toMatch(/undo/i);
  });
});

// ── Delete target is always the row's explicit ID, not the active project ─────
describe('home-screen.js delete path uses explicit project IDs only', () => {
  test('handleSingleDelete targets proj.id from its argument, not active pointer', () => {
    // Extract handleSingleDelete and verify it uses proj.id, not getActiveProjectId.
    const fn = homeScreen.match(
      /function handleSingleDelete\(proj\)\s*\{[\s\S]*?\}/
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toMatch(/setConfirmDelete\(\[proj\.id\]\)/);
    expect(fn[0]).not.toMatch(/getActiveProjectId/);
  });

  test('doBulkDelete reads confirmDelete state, not getActiveProjectId', () => {
    const fn = homeScreen.match(
      /function doBulkDelete\(\)\s*\{[\s\S]*?ProjectStorage\.deleteMany\(ids\)/
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toMatch(/confirmDelete\.slice\(\)/);
    expect(fn[0]).not.toMatch(/getActiveProjectId/);
  });

  test('handleBulkDelete reads from selected Set, not getActiveProjectId', () => {
    const fn = homeScreen.match(
      /function handleBulkDelete\(\)\s*\{[\s\S]*?setConfirmDelete/
    );
    expect(fn).not.toBeNull();
    expect(fn[0]).toMatch(/Array\.from\(selected\)/);
    expect(fn[0]).not.toMatch(/getActiveProjectId/);
  });
});

describe('manager-app.js delete path uses explicit project IDs only', () => {
  test('inline delete button uses p.id from the map parameter', () => {
    // The delete handler must reference p.id (the row's scoped variable),
    // not getActiveProjectId() or a shared active-project variable.
    expect(managerApp).toMatch(/await ProjectStorage\.delete\(p\.id\)/);
  });

  test('inline delete handler does NOT use getActiveProjectId as delete target', () => {
    // Confirm no code path resolves the active project pointer and passes it
    // to ProjectStorage.delete as the target.  (getActiveProjectId IS read
    // for the wasActive check, but must not be the argument to delete.)
    const deleteBlock = managerApp.match(
      /await ProjectStorage\.delete\([\s\S]{0,20}\)/
    );
    expect(deleteBlock).not.toBeNull();
    // The argument must be p.id, not getActiveProjectId() or a variable set from it.
    expect(deleteBlock[0]).toMatch(/delete\(p\.id\)/);
    expect(deleteBlock[0]).not.toMatch(/delete\(activeProjectId\)/);
  });

  test('manager-app.js undo handler clears _deletedIds before save (existing correct pattern)', () => {
    // This path was already correct — this test locks it in place so a
    // future refactor cannot accidentally drop it.
    const undoBlock = managerApp.match(
      /_deletedIds\.delete\(fullProject\.id\)[\s\S]{0,200}ProjectStorage\.save\(fullProject\)/
    );
    expect(undoBlock).not.toBeNull();
  });
});

// ── BulkDeleteModal lists project names before confirmation ───────────────────
describe('BulkDeleteModal names the target before the user confirms', () => {
  test('BulkDeleteModal renders a list of project names from projectsById', () => {
    // The modal shows up to 5 names so the user can verify the target.
    expect(homeScreen).toMatch(/projectsById\s*&&\s*projectsById\[id\]/);
    expect(homeScreen).toMatch(/h\('ul'/);
    expect(homeScreen).toMatch(/h\('li',\s*\{\s*key:\s*id\s*\}/);
  });

  test('confirmDelete is set to [proj.id] (single) before BulkDeleteModal mounts', () => {
    // Ensures the modal always receives the confirmed target ID, not a stale value.
    expect(homeScreen).toMatch(/setConfirmDelete\(\[proj\.id\]\)/);
    expect(homeScreen).toMatch(/confirmDelete\s*&&\s*h\(BulkDeleteModal/);
  });
});
