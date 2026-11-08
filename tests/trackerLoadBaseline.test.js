/* Opening a stored project that nothing changes writes nothing (the Tracker's
   load baseline), and every load that does change durable data is still saved.
   reports/track-mode-performance-baseline.md, finding 1; the browser side is
   tests/mobile-audit/desktop-open-save.spec.js. These hold the structure the
   browser spec cannot reach deterministically: which loads may start clean,
   which load-time changes force a save, and that an edit racing the load is
   never taken as loaded data. */
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');
const between = (a, b, from = 0) => { const i = SRC.indexOf(a, from); expect(i).toBeGreaterThanOrEqual(0); const j = SRC.indexOf(b, i + a.length); expect(j).toBeGreaterThan(i); return SRC.slice(i, j); };
const PLP = between('function processLoadedProject(project){', '\nfunction loadProject(e){');
const EFFECT = between('const _other = [pat, pal,', 'const _prevOther = autoSaveOtherRef.current;');
const names = () => JSON.parse(between('const AUTOSAVE_OTHER_NAMES = [', '];').slice('const AUTOSAVE_OTHER_NAMES = '.length).replace(/'/g, '"') + ']');

describe('which loads may start clean', () => {
  test('only a project just read from storage, and it says so at every such call', () => {
    // Every ProjectStorage.get(...) whose result goes straight to processLoadedProject.
    const reads = SRC.match(/ProjectStorage\.get(?:ActiveProject)?\([^)]*\)[\s\S]{0,260}?processLoadedProject\([^)]*\)/g) || [];
    expect(reads.length).toBeGreaterThanOrEqual(4);
    for (const r of reads) expect(r).toMatch(/processLoadedProject\(\w+, ?\{ ?stored: ?true ?\}\)/);
    // _hydrate is fed by ProjectStorage.get / getActiveProject only.
    expect(between('function _hydrate(project, source) {', '\n  }')).toContain('processLoadedProject(project, { stored: true })');
  });

  test('imports, hand-offs, links and the Creator hand-over are saved as before', () => {
    const calls = SRC.match(/processLoadedProject\([^)]*\)(?!\{)/g);   // calls, not the definition
    const unflagged = calls.filter((c) => !/stored|opts/.test(c));
    // loadProject (JSON, OXS, PDF), the image wizard x2, the Creator's project prop x2, the hand-off, the share link.
    expect(unflagged.length).toBeGreaterThanOrEqual(8);
    expect(PLP).toContain("const _needs=_stored?[]:['not read from storage'];");
  });

  test('the brand catalogue path re-enters with the same options and the project as read', () => {
    expect(PLP).toContain('const opts=arguments[1];');
    expect(PLP).toContain('window.whenProjectBrandReady(_loadedAs,p=>processLoadedProject(p,opts),');
    // Read before anything replaces `project` (a migration, the half-mark re-keying, a finished session).
    expect(PLP.indexOf('const _loadedAs=project;')).toBeLessThan(PLP.indexOf('ProgressUnits.specialty.migrate(project)'));
  });
});

describe('what a load changes that only a full save keeps', () => {
  test.each([
    ['a minted id', "if(!project.id)_needs.push('new id');"],
    ['an older format version', "if(project.version!==11)_needs.push('format version '+project.version);"],
    ['petite and long stitch migration', "if(_m!==project)_needs.push('petite and long stitch format');"],
    ['half-stitch marks re-keyed', "_needs.push('half stitch marks');"],
    ['the compact or legacy pattern format', "if (_isCompactArray || !project.pattern) _needs.push('pattern format');"],
    ['an original palette created on load', "_needs.push('original palette');"],
    ['park markers dropped', "if (liveParkMarkers.length !== rawParkMarkers.length) _needs.push('park markers');"],
    ['sessions recovered from the backup', "if(pendingSessions&&pendingSessions.length)_needs.push('recovered sessions');"],
    ['sessions migrated, patched or recovered from a checkpoint', "if(JSON.stringify(rawStatsSessions)!==_sessionsBefore)_needs.push('sessions');"],
    ['deleted snapshots filtered out', "_needs.push('snapshots');"],
  ])('%s', (_, line) => { expect(PLP).toContain(line); });

  test('sessions are compared with what was stored, taken before anything patches them in place', () => {
    const at = PLP.indexOf('_sessionsBefore=JSON.stringify(project.statsSessions||[])');
    expect(at).toBeGreaterThan(0);
    expect(at).toBeLessThan(PLP.indexOf('rebuildLoadedSessions('));
    expect(at).toBeLessThan(PLP.indexOf('finaliseAutoSessionRef.current({trimIfIdle:true})'));
  });

  test('marks that only a progress record holds are a marks change', () => {
    expect(PLP).toContain('ProjectStorage.loadedWithProgress(project)');
    expect(EFFECT).toContain('if (done === _lb.done && !_lb.marks) {');
  });

  test('marks that do not fit the pattern hold saves and take no baseline', () => {
    expect(PLP).toContain('if(_stored&&!_reconcileHeld)loadBaselineRef.current=');
  });
});

describe('the autosave takes the baseline only for the load itself', () => {
  test('the names list is the autosave input list, in order', () => {
    const list = EFFECT.slice('const _other = ['.length, EFFECT.indexOf('];')).split(',').map((x) => x.trim()).filter(Boolean);
    expect(names()).toEqual(list);
  });

  test('everything the load records is an autosave input, and every saved input it sets is recorded', () => {
    const recorded = [...PLP.matchAll(/L\('(\w+)'/g)].map((m) => m[1]);
    const n = names();
    for (const k of recorded) expect(n).toContain(k);
    // The inputs a load always sets (others it sets only sometimes keep the previous value; statsSettings is
    // a fresh object built in a line other tests read as written, and is changed only through its own dialog).
    for (const k of ['pat', 'pal', 'bsLines', 'parkMarkers', 'threadOwned', 'halfStitches', 'singleStitchEdits', 'knots', 'specialtyStitches',
      'sW', 'sH', 'wastePrefs', 'originalPaletteState', 'statsSessions', 'projectName', 'doneSnapshots', 'projectDesigner',
      'projectDescription', 'projectNotes', 'partialStitches', 'projectFabricColour', 'threadBrand', 'blockW', 'blockH', 'focusBlock',
      'startCorner', 'workArea', 'breadcrumbs', 'achievedMilestones']) expect(recorded).toContain(k);
    // ... and the marks it installs.
    expect(PLP).toContain('setDone(_loadDone=new Uint8Array(project.done))');
  });

  test('a stale or foreign baseline is never used: reset on every load, taken only with its own pattern', () => {
    expect(PLP.indexOf('loadBaselineRef.current=null;')).toBeLessThan(PLP.indexOf('setPat('));
    expect(EFFECT).toContain('if (_lb && _lb.pat === pat) {');
    expect(EFFECT).toContain('loadBaselineRef.current = null;');
  });

  test('an input that is not exactly what the load installed is a change (an edit that raced the load)', () => {
    expect(EFFECT).toContain("AUTOSAVE_OTHER_NAMES.every((n, i) => !(n in _lb.set) || Object.is(_lb.set[n], _other[i]))");
    expect(EFFECT).toContain('!_lb.needs.length &&');
  });

  test('a clean load is written nowhere: no timer, and the tab-hidden save sees nothing new', () => {
    const clean = between('if (done === _lb.done && !_lb.marks) {', '}', SRC.indexOf('const _lb = loadBaselineRef.current;'));
    expect(clean).toContain('autoSaveDirtyRef.current = false;');
    expect(clean).toContain('flushedGenRef.current = autoSaveGenRef.current;');
    expect(clean).toContain('return;');
    // Taken after this run's generation bump, so any later change is newer than it.
    expect(SRC.indexOf('autoSaveGenRef.current++;', SRC.indexOf('autoSaveDirtyRef.current = true;'))).toBeLessThan(SRC.indexOf('const _lb = loadBaselineRef.current;'));
  });

  test('the save badge counts a clean load as saved', () => {
    expect(SRC).toContain('if (loadUiCleanRef.current) { loadUiCleanRef.current = false; uiSavedGenRef.current = uiGenRef.current; }');
  });
});
