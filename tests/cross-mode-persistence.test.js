/**
 * Cross-mode persistence tests
 *
 * Verifies that data is not lost when switching between Creator and Tracker modes.
 * The root cause of session and name persistence bugs was that the Creator and
 * Tracker maintain separate state copies. When the Creator auto-saved while inactive,
 * it overwrote IndexedDB with stale tracker-specific fields (statsSessions, name, etc.).
 *
 * These tests verify:
 * 1. Creator auto-save is guarded by isActive
 * 2. Tracker syncs tracker fields to Creator on auto-save
 * 3. Creator refreshes trackerFieldsRef from IDB when becoming active
 * 4. Creator preserves v3 fields (stitchLog, finishStatus, etc.)
 * 5. handleEditInCreator pushes all tracker fields to Creator
 */
const fs = require('fs');
const path = require('path');

const trackerSrc = fs.readFileSync(path.resolve(__dirname, '..', 'tracker-app.js'), 'utf8');
const creatorIOSrc = fs.readFileSync(path.resolve(__dirname, '..', 'creator', 'useProjectIO.js'), 'utf8');
const creatorMainSrc = fs.readFileSync(path.resolve(__dirname, '..', 'creator-main.js'), 'utf8');

describe('Creator auto-save isActive guard', () => {
  test('Creator auto-save skips IDB writes when isActive is false', () => {
    // The auto-save effect should check state.isActive before scheduling saves
    const autoSaveMatch = creatorIOSrc.match(/creatorSnapshotRef\.current\s*=\s*project5;[\s\S]*?if\s*\(!state\.isActive\)\s*return;/);
    expect(autoSaveMatch).not.toBeNull();
  });

  test('Creator auto-save dependency array includes isActive', () => {
    // Find the dependency array for the auto-save effect
    const depMatch = creatorIOSrc.match(/state\.projectName,\s*state\.allowBlends,\s*\n?\s*state\.isActive,/);
    expect(depMatch).not.toBeNull();
  });
});

describe('Tracker syncs tracker fields to Creator', () => {
  test('Tracker auto-save calls __updateCreatorTrackerFields', () => {
    // Find the auto-save setTimeout block
    const autoSaveBlock = trackerSrc.match(/Tracker auto-save failed[\s\S]*?__updateCreatorTrackerFields/);
    expect(autoSaveBlock).not.toBeNull();
  });

  test('Tracker auto-save syncs statsSessions to Creator', () => {
    const syncBlock = trackerSrc.match(/__updateCreatorTrackerFields\(\{[\s\S]*?statsSessions[\s\S]*?\}\)/);
    expect(syncBlock).not.toBeNull();
  });

  test('Tracker auto-save syncs statsSettings to Creator', () => {
    const syncBlock = trackerSrc.match(/__updateCreatorTrackerFields\(\{[\s\S]*?statsSettings[\s\S]*?\}\)/);
    expect(syncBlock).not.toBeNull();
  });

  test('Tracker auto-save syncs achievedMilestones to Creator', () => {
    const syncBlock = trackerSrc.match(/__updateCreatorTrackerFields\(\{[\s\S]*?achievedMilestones[\s\S]*?\}\)/);
    expect(syncBlock).not.toBeNull();
  });

  test('Tracker auto-save syncs v3 fields (stitchLog, finishStatus) to Creator', () => {
    const syncBlock = trackerSrc.match(/__updateCreatorTrackerFields\(\{[\s\S]*?finishStatus[\s\S]*?stitchLog[\s\S]*?\}\)/);
    expect(syncBlock).not.toBeNull();
  });

  test('Tracker auto-save syncs projectName to Creator', () => {
    const nameSync = trackerSrc.match(/Tracker auto-save failed[\s\S]*?__setCreatorProjectName[\s\S]*?projectName/);
    expect(nameSync).not.toBeNull();
  });
});

describe('handleEditInCreator full field sync', () => {
  test('handleEditInCreator syncs all tracker fields to Creator', () => {
    // Find the handleEditInCreator function's same-page (onSwitchToDesign) path
    const editBlock = trackerSrc.match(/function handleEditInCreator\(\)\{[\s\S]*?if\(onSwitchToDesign\)\{([\s\S]*?)onSwitchToDesign\(\);/);
    expect(editBlock).not.toBeNull();
    const body = editBlock[1];

    // Must sync tracker fields
    expect(body).toMatch(/__updateCreatorTrackerFields/);
    // Must include statsSessions
    expect(body).toMatch(/statsSessions/);
    // Must include v3 fields
    expect(body).toMatch(/finishStatus/);
    expect(body).toMatch(/stitchLog/);
  });

  test('handleEditInCreator syncs project name even when empty', () => {
    // Old code had: if(projectName&&...) — should now work with empty string
    const editBlock = trackerSrc.match(/function handleEditInCreator\(\)\{[\s\S]*?if\(onSwitchToDesign\)\{([\s\S]*?)onSwitchToDesign\(\);/);
    expect(editBlock).not.toBeNull();
    const body = editBlock[1];

    // Should call __setCreatorProjectName without a truthy guard on projectName
    // (i.e., should use projectName||'' not require projectName to be truthy)
    expect(body).toMatch(/__setCreatorProjectName.*projectName/);
    // Must NOT have the old pattern: if(projectName&&typeof window.__setCreatorProjectName
    expect(body).not.toMatch(/if\(projectName&&typeof window\.__setCreatorProjectName/);
  });
});

describe('Creator exposes __updateCreatorTrackerFields', () => {
  test('CreatorApp exposes __updateCreatorTrackerFields global', () => {
    const exposeMatch = creatorMainSrc.match(/window\.__updateCreatorTrackerFields\s*=/);
    expect(exposeMatch).not.toBeNull();
  });

  test('__updateCreatorTrackerFields is cleaned up on unmount', () => {
    const cleanupMatch = creatorMainSrc.match(/delete window\.__updateCreatorTrackerFields/);
    expect(cleanupMatch).not.toBeNull();
  });
});

describe('Creator preserves v3 fields from loaded projects', () => {
  test('Creator processLoadedProject stores finishStatus in trackerFieldsRef', () => {
    const match = creatorIOSrc.match(/_tf\.finishStatus\s*=\s*project\.finishStatus/);
    expect(match).not.toBeNull();
  });

  test('Creator processLoadedProject stores startedAt in trackerFieldsRef', () => {
    const match = creatorIOSrc.match(/_tf\.startedAt\s*=\s*project\.startedAt/);
    expect(match).not.toBeNull();
  });

  test('Creator processLoadedProject stores lastTouchedAt in trackerFieldsRef', () => {
    const match = creatorIOSrc.match(/_tf\.lastTouchedAt\s*=\s*project\.lastTouchedAt/);
    expect(match).not.toBeNull();
  });

  test('Creator processLoadedProject stores completedAt in trackerFieldsRef', () => {
    const match = creatorIOSrc.match(/_tf\.completedAt\s*=\s*project\.completedAt/);
    expect(match).not.toBeNull();
  });

  test('Creator processLoadedProject stores stitchLog in trackerFieldsRef', () => {
    const match = creatorIOSrc.match(/_tf\.stitchLog\s*=\s*project\.stitchLog/);
    expect(match).not.toBeNull();
  });
});

describe('Creator refreshes from IDB on becoming active', () => {
  test('Creator has isActive-triggered refresh effect', () => {
    // Should have a useEffect that detects becoming active and calls ProjectStorage.get
    const refreshMatch = creatorIOSrc.match(/becameActive.*=.*state\.isActive.*&&.*!wasActiveRef/);
    expect(refreshMatch).not.toBeNull();
  });

  test('Refresh effect loads trackerFieldsRef from IDB', () => {
    const refreshBlock = creatorIOSrc.match(/if\s*\(!becameActive\)\s*return;[\s\S]*?ProjectStorage\.get\(pid\)/);
    expect(refreshBlock).not.toBeNull();
  });

  test('Refresh effect updates done, totalTime, sessions from IDB', () => {
    const refreshBlock = creatorIOSrc.match(/ProjectStorage\.get\(pid\)\.then\(function\(freshProject\)\s*\{([\s\S]*?)\}\)\.catch/);
    expect(refreshBlock).not.toBeNull();
    const body = refreshBlock[1];
    expect(body).toMatch(/state\.setDone/);
    expect(body).toMatch(/state\.setTotalTime/);
    expect(body).toMatch(/state\.setSessions/);
    expect(body).toMatch(/state\.setThreadOwned/);
    expect(body).toMatch(/state\.setParkMarkers/);
  });

  test('Refresh effect also refreshes project name if Tracker changed it', () => {
    const refreshBlock = creatorIOSrc.match(/ProjectStorage\.get\(pid\)\.then\(function\(freshProject\)\s*\{([\s\S]*?)\}\)\.catch/);
    expect(refreshBlock).not.toBeNull();
    const body = refreshBlock[1];
    expect(body).toMatch(/freshProject\.name[\s\S]*?state\.setProjectName/);
  });

  test('Refresh effect includes v3 fields', () => {
    const refreshBlock = creatorIOSrc.match(/ProjectStorage\.get\(pid\)\.then\(function\(freshProject\)\s*\{([\s\S]*?)\}\)\.catch/);
    expect(refreshBlock).not.toBeNull();
    const body = refreshBlock[1];
    expect(body).toMatch(/freshProject\.finishStatus/);
    expect(body).toMatch(/freshProject\.stitchLog/);
    expect(body).toMatch(/freshProject\.startedAt/);
    expect(body).toMatch(/freshProject\.lastTouchedAt/);
    expect(body).toMatch(/freshProject\.completedAt/);
  });
});

describe('Complete field inventory: Creator trackerFieldsRef preservation', () => {
  // All fields that should be preserved in trackerFieldsRef
  const TRACKER_ONLY_FIELDS = [
    'statsSessions', 'statsSettings', 'achievedMilestones', 'doneSnapshots',
    'breadcrumbs', 'stitchingStyle', 'blockW', 'blockH',
    'focusBlock', 'startCorner', 'colourSequence', 'originalPaletteState',
    'finishStatus', 'startedAt', 'lastTouchedAt', 'completedAt', 'stitchLog'
  ];

  test.each(TRACKER_ONLY_FIELDS)('%s is preserved in Creator processLoadedProject', (field) => {
    // Should be stored in _tf (trackerFieldsRef) during project load
    const regex = new RegExp('_tf\\.' + field + '\\s*=');
    expect(creatorIOSrc).toMatch(regex);
  });

  test.each(TRACKER_ONLY_FIELDS)('%s is refreshed from IDB when Creator becomes active', (field) => {
    // Should appear in the freshProject refresh block
    const refreshBlock = creatorIOSrc.match(/ProjectStorage\.get\(pid\)\.then\(function\(freshProject\)\s*\{([\s\S]*?)\}\)\.catch/);
    expect(refreshBlock).not.toBeNull();
    const body = refreshBlock[1];
    const regex = new RegExp('freshProject\\.' + field);
    expect(body).toMatch(regex);
  });
});

describe('Session recording uses correct dates', () => {
  test('recordAutoActivity uses getStitchingDateLocal for session date', () => {
    const recordMatch = trackerSrc.match(/function recordAutoActivity[\s\S]*?date:getStitchingDateLocal\(now\)/);
    expect(recordMatch).not.toBeNull();
  });

  test('finaliseAutoSession preserves the original session date', () => {
    const finalMatch = trackerSrc.match(/function finaliseAutoSession[\s\S]*?date:session\.date/);
    expect(finalMatch).not.toBeNull();
  });

  test('getStitchingDateLocal respects dayEndHour setting', () => {
    const dateFunc = trackerSrc.match(/function getStitchingDateLocal\(now\)\{[\s\S]*?dayEndHour[\s\S]*?\}/);
    expect(dateFunc).not.toBeNull();
  });
});

describe('No stale closure in Tracker auto-save', () => {
  test('Tracker auto-save dependency array includes statsSessions', () => {
    const depMatch = trackerSrc.match(/return \(\) => clearTimeout\(saveTimer\);[\s\S]*?\[.*statsSessions/);
    expect(depMatch).not.toBeNull();
  });

  test('Tracker auto-save dependency array includes projectName', () => {
    const depMatch = trackerSrc.match(/return \(\) => clearTimeout\(saveTimer\);[\s\S]*?\[.*projectName/);
    expect(depMatch).not.toBeNull();
  });

  test('Tracker auto-save dependency array includes achievedMilestones', () => {
    // The dependency array is on the same line or next line after the closing bracket
    const depMatch = trackerSrc.match(/clearTimeout\(saveTimer\)[\s\S]*?achievedMilestones\]/);
    expect(depMatch).not.toBeNull();
  });
});
