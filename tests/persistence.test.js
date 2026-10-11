/**
 * Persistence round-trip tests
 *
 * Verifies that every important field survives save/load cycles by extracting
 * the doSaveProject, buildSnapshot, handleEditInCreator, and __flushProjectToIDB
 * code paths from tracker-app.js and checking their output includes all required
 * fields.
 */
const fs = require('fs');
const path = require('path');

const trackerSrc = fs.readFileSync(path.resolve(__dirname, '..', 'tracker-app.js'), 'utf8');

// All fields that buildSnapshot should include
const SNAPSHOT_FIELDS = [
  'version', 'id', 'page', 'name', 'createdAt', 'updatedAt',
  'settings', 'pattern', 'bsLines', 'done', 'parkMarkers',
  'hlRow', 'hlCol', 'threadOwned',
  'originalPaletteState', 'singleStitchEdits', 'halfStitches', 'halfDone',
  'statsSessions', 'statsSettings', 'achievedMilestones', 'doneSnapshots',
  'savedZoom', 'savedScroll',
  'breadcrumbs', 'stitchingStyle', 'blockW', 'blockH',
  'focusBlock', 'startCorner', 'colourSequence', 'workArea'
];

// Fields that JSON export (doSaveProject) should include
const JSON_EXPORT_FIELDS = [
  'version', 'id', 'page', 'name', 'createdAt', 'updatedAt',
  'settings', 'pattern', 'bsLines', 'done', 'parkMarkers',
  'hlRow', 'hlCol', 'threadOwned',
  'originalPaletteState', 'singleStitchEdits', 'halfStitches', 'halfDone',
  'statsSessions', 'statsSettings',
  'achievedMilestones', 'doneSnapshots',
  'breadcrumbs', 'stitchingStyle', 'blockW', 'blockH',
  'focusBlock', 'startCorner', 'colourSequence', 'workArea',
  'savedZoom', 'savedScroll'
];

describe('Persistence field coverage', () => {
  // Extract the buildSnapshot function body
  test('buildSnapshot includes all required fields', () => {
    // Find the buildSnapshot return object
    const snapshotMatch = trackerSrc.match(/const buildSnapshot\s*=\s*\(\)\s*=>\s*\{[\s\S]*?return\s*\{([\s\S]*?)\};\s*\};\s*buildSnapshotRef/);
    expect(snapshotMatch).not.toBeNull();
    const snapshotBody = snapshotMatch[1];

    for (const field of SNAPSHOT_FIELDS) {
      // Check for field as a key in the object literal (field: or field, or field\n)
      const fieldRegex = new RegExp('\\b' + field + '\\s*[,:\\n}]|\\b' + field + '\\s*$', 'm');
      expect(snapshotBody).toMatch(fieldRegex);
    }
  });

  test('doSaveProject (JSON export) includes all required fields', () => {
    // Find the doSaveProject function and its project object
    const saveMatch = trackerSrc.match(/function doSaveProject\(finalName\)\s*\{([\s\S]*?)\n  let blob/);
    expect(saveMatch).not.toBeNull();
    const saveBody = saveMatch[1];

    for (const field of JSON_EXPORT_FIELDS) {
      const fieldRegex = new RegExp('\\b' + field + '\\s*[,:\\n}]|\\b' + field + '\\s*$', 'm');
      expect(saveBody).toMatch(fieldRegex);
    }
  });

  test('handleEditInCreator cross-page path saves a full buildSnapshot()', () => {
    // The cross-page path saves the same snapshot as auto-save (whose fields
    // are checked above) instead of hand-building its own project object.
    const start = trackerSrc.indexOf('function handleEditInCreator(');
    const end = trackerSrc.indexOf('\nfunction ', start + 1);
    const fn = trackerSrc.slice(start, end);
    const crossPage = fn.slice(fn.indexOf('onSwitchToDesign();'));
    expect(crossPage).toMatch(/const project=buildSnapshot\(\);[\s\S]*persistProjectRecord\(project\)/);
    expect(crossPage).not.toMatch(/let project=\{/);
  });

  test('__flushProjectToIDB saves through the one snapshot builder, which carries these fields', () => {
    // The flush used to list fields by hand, which is how it came to omit the pattern
    // and the latest done marks. It now saves snapshotNow(), a buildSnapshot() with the
    // freshest done array, so buildSnapshot must carry every tracker field.
    const flushMatch = trackerSrc.match(/window\.__flushProjectToIDB\s*=\s*async\s*function\(\)\s*\{([\s\S]*?)\};\s*return\s*\(\)\s*=>/);
    expect(flushMatch).not.toBeNull();
    expect(flushMatch[1]).toContain('snapshotNow()');

    const start = trackerSrc.indexOf('const buildSnapshot = () => {');
    const end = trackerSrc.indexOf('buildSnapshotRef.current = buildSnapshot;');
    expect(start).toBeGreaterThan(-1);
    const builder = trackerSrc.slice(start, end);
    const requiredFields = ['breadcrumbs', 'stitchingStyle', 'blockW', 'blockH', 'focusBlock', 'startCorner', 'colourSequence', 'workArea', 'pattern', 'done'];
    for (const field of requiredFields) {
      expect(builder).toMatch(new RegExp('\\b' + field + '\\b'));
    }
  });

  test('handleEditInCreator same-page path builds fresh snapshot', () => {
    // Should call buildSnapshot() not use stale lastSnapshotRef.current
    const samePageMatch = trackerSrc.match(/if\(onSwitchToDesign\)\{[\s\S]*?const project=buildSnapshot\(\)/);
    expect(samePageMatch).not.toBeNull();
  });

  test('progress display uses statsSessions not legacy sessions for count', () => {
    // The progress text should reference statsSessions.length not sessions.length
    const progressLine = trackerSrc.match(/Time stitched:.*sessions/g);
    expect(progressLine).not.toBeNull();
    for (const line of progressLine) {
      expect(line).not.toMatch(/\bsessions\.length\b/);
    }
  });

  test('OXS import sets createdAt as ISO string not number', () => {
    const oxsMatch = trackerSrc.match(/if\(!project\.createdAt\)\s*project\.createdAt\s*=\s*(.*?);/);
    expect(oxsMatch).not.toBeNull();
    // Should be an ISO string (via new Date().toISOString()), not a raw number
    expect(oxsMatch[1]).toMatch(/\.toISOString\(\)/);
  });

  test('JSON import assigns id and createdAt before saving', () => {
    // Find the JSON import block — between the format check and processLoadedProject
    const jsonImportMatch = trackerSrc.match(/if\(!Array\.isArray\(patternField\)\)\s*throw[\s\S]*?(if\(!project\.id\)[\s\S]*?)processLoadedProject\(project\)/);
    expect(jsonImportMatch).not.toBeNull();
    const preProcess = jsonImportMatch[1];
    expect(preProcess).toMatch(/project\.id\s*=/);
    expect(preProcess).toMatch(/project\.createdAt\s*=/);
  });
});
