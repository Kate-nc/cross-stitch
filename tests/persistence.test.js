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
  'focusBlock', 'startCorner', 'colourSequence'
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
  'focusBlock', 'startCorner', 'colourSequence',
  'savedZoom', 'savedScroll'
];

// Fields that the cross-page handleEditInCreator handoff should include
const HANDOFF_FIELDS = [
  'version', 'id', 'page', 'name', 'createdAt', 'updatedAt',
  'settings', 'pattern', 'bsLines', 'done', 'parkMarkers',
  'hlRow', 'hlCol', 'threadOwned',
  'originalPaletteState', 'singleStitchEdits', 'halfStitches', 'halfDone',
  'statsSessions', 'statsSettings',
  'achievedMilestones', 'doneSnapshots',
  'breadcrumbs', 'stitchingStyle', 'blockW', 'blockH',
  'focusBlock', 'startCorner', 'colourSequence'
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

  test('handleEditInCreator cross-page handoff includes id and createdAt', () => {
    // Find the cross-page handoff object
    const handoffMatch = trackerSrc.match(/let project=\{version:9,id:projectIdRef\.current/);
    expect(handoffMatch).not.toBeNull();

    // Extract the full line for that project object
    const lineStart = trackerSrc.lastIndexOf('\n', handoffMatch.index) + 1;
    const lineEnd = trackerSrc.indexOf(';\n', handoffMatch.index);
    const handoffLine = trackerSrc.slice(lineStart, lineEnd);

    for (const field of HANDOFF_FIELDS) {
      const fieldRegex = new RegExp('\\b' + field + '\\b');
      expect(handoffLine).toMatch(fieldRegex);
    }
  });

  test('handleEditInCreator cross-page uses actual skeinPrice, not hardcoded', () => {
    const handoffMatch = trackerSrc.match(/let project=\{version:9,id:projectIdRef\.current/);
    expect(handoffMatch).not.toBeNull();
    const lineStart = trackerSrc.lastIndexOf('\n', handoffMatch.index) + 1;
    const lineEnd = trackerSrc.indexOf(';\n', handoffMatch.index);
    const handoffLine = trackerSrc.slice(lineStart, lineEnd);

    // Should NOT contain hardcoded skeinPrice:1.2
    expect(handoffLine).not.toMatch(/skeinPrice:\s*1\.2/);
    // Should NOT contain hardcoded stitchSpeed:40
    expect(handoffLine).not.toMatch(/stitchSpeed:\s*40/);
    // Should contain the variable references
    expect(handoffLine).toMatch(/skeinPrice/);
    expect(handoffLine).toMatch(/stitchSpeed/);
  });

  test('__flushProjectToIDB includes breadcrumbs and stitching style fields', () => {
    // The main flush handler (registered in the useEffect body) must contain these fields.
    // The cleanup now replaces with a snapshot fallback instead of deleting, so we match
    // up to the return statement rather than to 'delete window.__flushProjectToIDB'.
    const flushMatch = trackerSrc.match(/window\.__flushProjectToIDB\s*=\s*async\s*function\(\)\s*\{([\s\S]*?)\};\s*return\s*\(\)\s*=>/);
    expect(flushMatch).not.toBeNull();
    const flushBody = flushMatch[1];

    const requiredFields = ['breadcrumbs', 'stitchingStyle', 'blockW', 'blockH', 'focusBlock', 'startCorner', 'colourSequence'];
    for (const field of requiredFields) {
      expect(flushBody).toMatch(new RegExp('\\b' + field + '\\b'));
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
    const jsonImportMatch = trackerSrc.match(/if\(!project\.pattern\s*&&\s*!project\.p\)\s*throw[\s\S]*?(if\(!project\.id\)[\s\S]*?)processLoadedProject\(project\)/);
    expect(jsonImportMatch).not.toBeNull();
    const preProcess = jsonImportMatch[1];
    expect(preProcess).toMatch(/project\.id\s*=/);
    expect(preProcess).toMatch(/project\.createdAt\s*=/);
  });
});
