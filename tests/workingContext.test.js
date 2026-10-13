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
  test('is saved by the snapshot, the export and the autosave dependencies', () => {
    expect((tracker.match(/workingContext: workingContextForSave\(/g) || []).length).toBe(2);
    expect(tracker).toMatch(/focusColour, stitchMode, stitchView, highlightMode, achievedMilestones\]\);/);
  });
  test('is carried to the Creator and preserved by its saves', () => {
    expect((tracker.match(/workingContext:project\.workingContext/g) || []).length).toBe(2);
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
  test('is restored on load through the validator', () => {
    expect(tracker).toMatch(/normaliseWorkingContext\(project\.workingContext,newPal\)/);
  });
});

describe('palm guard reaches touches the Tracker handles itself (French knots)', () => {
  test('the knot branch tells the drag-mark hook about the finger going down and coming up', () => {
    expect(tracker).toMatch(/knotPressRef\.current=\{k,id:e\.pointerId,x:e\.clientX,y:e\.clientY\};if\(_dragMarkHandlers\.onExtraTouchDown\)_dragMarkHandlers\.onExtraTouchDown\(e\);return;/);
    expect(tracker).toMatch(/if\(_dragMarkHandlers\.onExtraTouchEnd\)_dragMarkHandlers\.onExtraTouchEnd\(e\);\s*if\(Math\.hypot/);
  });
});

