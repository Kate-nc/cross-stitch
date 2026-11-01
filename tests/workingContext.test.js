// Phase 4 batch 4 (TRACK-05): the colour, mode and view a stitcher left off in come back with the project.
const fs = require('fs');
const path = require('path');
const TM = require('../tracking-merge.js');

const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const tracker = read('tracker-app.js');
function extract(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found');
  let depth = 0, i = src.indexOf('{', start), end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}
// eslint-disable-next-line no-eval
const forSave = eval('(' + extract(tracker, 'workingContextForSave') + ')');
// eslint-disable-next-line no-eval
const normalise = eval('(' + extract(tracker, 'normaliseWorkingContext') + ')');
const pal = [{ id: '310' }, { id: '666' }];

describe('workingContextForSave', () => {
  test('a default context writes nothing, so old projects stay unchanged', () => {
    expect(forSave(null, 'track', 'symbol', 'isolate')).toBeUndefined();
  });
  test('keeps colour, navigate mode and a highlight view', () => {
    expect(forSave('310', 'navigate', 'highlight', 'tint')).toEqual({ colour: '310', mode: 'navigate', view: 'highlight', highlight: 'tint' });
  });
  test('the highlight style is only kept while highlighting', () => {
    expect(forSave('310', 'track', 'colour', 'tint')).toEqual({ colour: '310', view: 'colour' });
  });
});

describe('normaliseWorkingContext', () => {
  test('a missing or malformed context is ignored', () => {
    expect(normalise(undefined, pal)).toBeNull();
    expect(normalise('x', pal)).toBeNull();
  });
  test('a colour the pattern no longer has is dropped, and with it the highlight view', () => {
    expect(normalise({ colour: '999', view: 'highlight', highlight: 'tint' }, pal)).toEqual({ colour: null, mode: 'track', view: null, highlight: null });
  });
  test('unknown values fall back, known ones pass', () => {
    expect(normalise({ colour: '666', mode: 'zoom', view: 'wireframe', highlight: 'spotlight' }, pal))
      .toEqual({ colour: '666', mode: 'track', view: null, highlight: 'spotlight' });
    // The values the chart renderer knows: symbol, colour, highlight (not "realistic", which it does not draw).
    expect(normalise({ view: 'colour' }, pal).view).toBe('colour');
    expect(normalise({ colour: '310', view: 'realistic' }, pal).view).toBeNull();
    expect(normalise({ colour: '666', mode: 'navigate', view: 'highlight', highlight: 'outline' }, pal))
      .toEqual({ colour: '666', mode: 'navigate', view: 'highlight', highlight: 'outline' });
  });
});

describe('the field travels with the project', () => {
  test('survives a JSON round trip (export, backup, restore)', () => {
    const wc = forSave('310', 'navigate', 'highlight', 'outline');
    expect(JSON.parse(JSON.stringify({ workingContext: wc })).workingContext).toEqual(wc);
  });
  test('the other tab changing it does not trigger the overwrite question', () => {
    const pattern = [{ id: '310', type: 'solid', rgb: [0, 0, 0] }];
    const base = { pattern, done: [0] };
    const remote = { pattern, done: [1], workingContext: { colour: '310' } };
    expect(TM.canMerge(base, base, remote)).toBe(true);
  });
  test('is saved by the snapshot and the export, and kept in the navigation record when it changes', () => {
    expect((tracker.match(/workingContext: workingContextForSave\(/g) || []).length).toBe(2);
    // Looking around is not an edit: a change no longer starts a full save (seconds on a large chart on a phone).
    // The navigation record keeps it, and the next full save (leaving the page always makes one) carries it.
    const autosaveDeps = tracker.slice(tracker.indexOf('}, [pat, pal, done, bsLines'), tracker.indexOf('// ═══ Navigation record ═══'));
    for (const name of ['focusColour', 'stitchMode', 'stitchView', 'highlightMode']) expect(autosaveDeps).not.toMatch(new RegExp('\\b' + name + '\\b'));
    expect(tracker).toMatch(/useEffect\(\(\)=>\{if\(pat\)scheduleNavRecord\(\);\},\[stitchZoom,focusColour,stitchMode,stitchView,highlightMode\]\);/);
    expect(tracker).toMatch(/workingContext:workingContextForSave\(focusColour,stitchMode,stitchView,highlightMode\)\|\|null,/);
  });
  test('is carried to the Creator and preserved by its saves', () => {
    expect((tracker.match(/(?<![.\w])workingContext:project\.workingContext/g) || []).length).toBe(2);
    const io = read('creator/useProjectIO.js');
    expect(io).toMatch(/_tf\.workingContext\s*=\s*project\.workingContext/);
    expect(io).toMatch(/tf\.workingContext\s*=\s*freshProject\.workingContext/);
    expect(read('creator/bundle.js')).toMatch(/workingContext = freshProject\.workingContext/);
  });
  test('a reload of the project already on screen leaves the current mode and view alone', () => {
    expect(tracker).toMatch(/_sameProjectReload=!!project\.id&&project\.id===projectIdRef\.current;[\s\S]*?if\(!_sameProjectReload\)\{\s*const _wc=normaliseWorkingContext/);
  });
  test('the Creator drops a preserved context the Tracker has since cleared', () => {
    expect(read('creator/useProjectIO.js')).toMatch(/if \(freshProject\.workingContext\) tf\.workingContext = freshProject\.workingContext;\s*else delete tf\.workingContext;/);
  });
  test('a project switch restores the omitted colour and view; a same-project reload keeps a valid colour', () => {
    expect(tracker).toMatch(/setFocusColour\(_wc&&_wc\.colour\?_wc\.colour:null\)/);
    expect(tracker).toMatch(/else if\(stitchView==="highlight"\)setStitchView\("symbol"\)/);
    expect(tracker).toMatch(/setFocusColour\(prev=>prev&&newPal\.some/);
  });
  test('is restored on load through the validator, from the navigation record when that is newer', () => {
    expect(tracker).toMatch(/normaliseWorkingContext\(_nav\?_nav\.workingContext:project\.workingContext,newPal\)/);
    expect(tracker).toMatch(/const _nav=navRecordFor\(project\);/);
    expect(tracker).toMatch(/const _savedZoom=_nav&&_nav\.zoom>0\?_nav\.zoom:project\.savedZoom;/);
    expect(tracker).toMatch(/const _savedScroll=_nav&&_nav\.scroll\?_nav\.scroll:project\.savedScroll;/);
  });
});

describe('navRecordFor', () => {
  const store = {};
  global.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } };
  // eslint-disable-next-line no-eval
  const navRecordFor = eval('(' + extract(tracker, 'navRecordFor') + ')');
  const project = { id: 'p1', updatedAt: '2026-11-01T10:00:00.000Z' };
  const at = Date.parse(project.updatedAt);
  test('applies a record newer than the project\'s last save', () => {
    store.cs_nav_p1 = JSON.stringify({ at: at + 1000, zoom: 1.5, scroll: { left: 40, top: 80 }, workingContext: { colour: '310', view: 'highlight' } });
    expect(navRecordFor(project)).toEqual({ at: at + 1000, zoom: 1.5, scroll: { left: 40, top: 80 }, workingContext: { colour: '310', view: 'highlight' } });
  });
  test('a save since then, from this device or another, wins', () => {
    store.cs_nav_p1 = JSON.stringify({ at: at - 1, zoom: 2 });
    expect(navRecordFor(project)).toBeNull();
  });
  test('the defaults (no working context) still count as a record', () => {
    store.cs_nav_p1 = JSON.stringify({ at: at + 5, zoom: 1, scroll: null, workingContext: null });
    expect(navRecordFor(project)).toEqual({ at: at + 5, zoom: 1, scroll: null, workingContext: undefined });
  });
  test('a save is judged by when its snapshot read the navigation, not when it was written', () => {
    // saveChecked awaits a read before save() stamps updatedAt, so a navigation change flushed in between has an
    // earlier time than that save's updatedAt, yet is newer than the navigation the save holds.
    const inFlight = { id: 'p1', updatedAt: new Date(at + 5000).toISOString(), navigationAt: at };
    store.cs_nav_p1 = JSON.stringify({ at: at + 2000, zoom: 3 });
    expect(navRecordFor(inFlight)).toMatchObject({ zoom: 3 });
    // A save that read the navigation after the record was written still wins.
    expect(navRecordFor({ id: 'p1', updatedAt: inFlight.updatedAt, navigationAt: at + 3000 })).toBeNull();
    // A project saved before navigationAt existed falls back to updatedAt.
    expect(navRecordFor({ id: 'p1', updatedAt: inFlight.updatedAt })).toBeNull();
  });
  test('the snapshot records when it read the navigation', () => {
    expect(tracker).toMatch(/savedScroll: stitchScrollRef\.current \?[^\n]*\n(?:\s*\/\/[^\n]*\n)*\s*navigationAt: Date\.now\(\),/);
  });
  test('malformed or missing records, and projects without an id, are ignored', () => {
    store.cs_nav_p1 = '{not json';
    expect(navRecordFor(project)).toBeNull();
    store.cs_nav_p1 = JSON.stringify({ zoom: 2 });
    expect(navRecordFor(project)).toBeNull();
    store.cs_nav_p1 = JSON.stringify({ at: at + 5, zoom: -1, scroll: { left: 'x', top: 1 } });
    expect(navRecordFor(project)).toEqual({ at: at + 5, zoom: null, scroll: null, workingContext: undefined });
    expect(navRecordFor({ updatedAt: project.updatedAt })).toBeNull();
    expect(navRecordFor({ id: 'nobody' })).toBeNull();
  });
});

describe('palm guard reaches touches the Tracker handles itself (French knots)', () => {
  test('the knot branch tells the drag-mark hook about the finger going down and coming up', () => {
    expect(tracker).toMatch(/knotPressRef\.current=\{k,q,id:e\.pointerId,x:e\.clientX,y:e\.clientY\};if\(_dragMarkHandlers\.onExtraTouchDown\)_dragMarkHandlers\.onExtraTouchDown\(e\);return;/);
    expect(tracker).toMatch(/if\(_dragMarkHandlers\.onExtraTouchEnd\)_dragMarkHandlers\.onExtraTouchEnd\(e\);\s*if\(p\.stopPan\|\|cancelled\)return;\s*if\(Math\.hypot/);
  });
});


describe('the navigation record reaches storage, and a queued full save does not undo it', () => {
  test('the queued autosave builds its snapshot from the latest render, not the one that queued it', () => {
    // Navigation is not an autosave dependency, so the timer's own closure can predate a zoom or colour change;
    // its save would then store the old values with a newer time than the navigation record, which then loses.
    const start = tracker.indexOf('const saveTimer = setTimeout(() => {');
    const effect = tracker.slice(start, tracker.indexOf('persistProjectRecord(project).then', start));
    expect(effect).toMatch(/const project = buildSnapshotRef\.current \? buildSnapshotRef\.current\(\) : null;/);
    expect(effect).not.toMatch(/const project = buildSnapshot\(\);/);
  });

  test('hiding the page writes pending navigation before deciding whether a full save is needed', () => {
    const v = tracker.slice(tracker.indexOf('function onVisibility() {'), tracker.indexOf("document.addEventListener('visibilitychange', onVisibility);"));
    const flush = v.indexOf('if (flushNavRecordRef.current) flushNavRecordRef.current();');
    expect(flush).toBeGreaterThan(-1);
    expect(flush).toBeLessThan(v.indexOf('if (autoSaveGenRef.current === flushedGenRef.current) return;'));
  });

  test('a project switch writes the outgoing project\'s pending navigation under its own id first', () => {
    const load = tracker.slice(tracker.indexOf('const _sameProjectReload=!!project.id&&project.id===projectIdRef.current;'));
    const flush = load.indexOf('if(!_sameProjectReload&&flushNavRecordRef.current)flushNavRecordRef.current();');
    expect(flush).toBeGreaterThan(-1);
    expect(flush).toBeLessThan(load.indexOf('projectIdRef.current = project.id || null;'));
    // The record is keyed by projectIdRef at the moment it is written.
    expect(tracker).toMatch(/function writeNavRecord\(\)\{\n  const id=projectIdRef\.current;/);
  });

  test('unmounting writes pending navigation, keeping the last scroll when the scroller is gone', () => {
    // A layout cleanup: a passive one runs after the scroller ref is detached, losing the latest scroll.
    expect(tracker).toMatch(/React\.useLayoutEffect\(\(\)=>\(\)=>\{if\(flushNavRecordRef\.current\)flushNavRecordRef\.current\(\);\},\[\]\);/);
    expect(tracker).not.toMatch(/\buseEffect\(\(\)=>\(\)=>\{if\(flushNavRecordRef\.current\)/);
    expect(tracker).toMatch(/if\(!scroll\)\{const prev=JSON\.parse\(localStorage\.getItem\(NAV_RECORD_PREFIX\+id\)\|\|"null"\);if\(prev&&prev\.scroll\)scroll=prev\.scroll;\}/);
    // A flush with nothing pending writes nothing.
    expect(tracker).toMatch(/function flushNavRecord\(\)\{\n  if\(!navTimerRef\.current\)return;/);
  });
});
