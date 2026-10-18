// tests/trackerMarkColourSafety.test.js
// Whole-colour Done / Not done in the Stitch Tracker colour list: clearly named, always confirmed in the styled dialog
// with the exact count, one undo step, and no native confirm() left in tracker-app.js.

const fs = require('fs');

const helpersSrc = fs.readFileSync('./helpers.js', 'utf8');
const trackerSrc = fs.readFileSync('./tracker-app.js', 'utf8');
const stylesSrc = fs.readFileSync('./styles.css', 'utf8');

function grab(name) {
  const m = helpersSrc.match(new RegExp('function ' + name + '\\s*\\([^)]*\\)\\s*\\{[\\s\\S]*?\\n\\}'));
  if (!m) throw new Error('Could not extract ' + name + ' from helpers.js');
  return m[0];
}
// threadLabel needs the brand table, so it is stubbed to what it returns for a DMC entry.
const api = new Function(
  'function threadLabel(e){ return e ? "DMC " + e.id : ""; }\n' +
  grab('colourDoneChanges') + '\n' + grab('colourDoneName') + '\n' + grab('colourDoneConfirmText') + '\n' +
  'return { colourDoneChanges, colourDoneName, colourDoneConfirmText };'
)();

function makePattern() {
  // 10 cells: 05 at 0,1,2,5,6; 310 at 3,4,7; the rest skipped.
  const ids = ['05', '05', '05', '310', '310', '05', '05', '310', '__skip__', '__skip__'];
  return ids.map((id) => ({ id }));
}

describe('colourDoneChanges', () => {
  test('marking lists every not-done stitch of the colour, with its old value', () => {
    const pat = makePattern();
    const done = new Uint8Array([1, 0, 0, 0, 0, 0, 1, 0, 0, 0]);
    const ch = api.colourDoneChanges(pat, done, '05', true, null);
    expect(ch.map((c) => c.idx)).toEqual([1, 2, 5]);
    expect(ch.every((c) => c.oldVal === 0)).toBe(true);
  });

  test('unmarking lists only the done stitches of the colour', () => {
    const pat = makePattern();
    const done = new Uint8Array([1, 0, 0, 1, 0, 0, 1, 0, 0, 0]);
    const ch = api.colourDoneChanges(pat, done, '05', false, null);
    expect(ch.map((c) => c.idx)).toEqual([0, 6]);
    expect(ch.every((c) => c.oldVal === 1)).toBe(true);
  });

  test('a work area limits the change to cells inside it', () => {
    const pat = makePattern();
    const done = new Uint8Array(10);
    const ch = api.colourDoneChanges(pat, done, '05', true, (i) => i >= 5);
    expect(ch.map((c) => c.idx)).toEqual([5, 6]);
  });

  test('nothing to change gives an empty list, and missing state is safe', () => {
    expect(api.colourDoneChanges(makePattern(), new Uint8Array([1, 1, 1, 0, 0, 1, 1, 0, 0, 0]), '05', true, null)).toEqual([]);
    expect(api.colourDoneChanges(null, null, '05', true, null)).toEqual([]);
  });

  test('applying the change and then restoring each oldVal returns the state exactly', () => {
    const pat = makePattern();
    const before = new Uint8Array([1, 0, 1, 1, 0, 0, 0, 1, 0, 0]);
    for (const md of [true, false]) {
      const ch = api.colourDoneChanges(pat, before, '05', md, null);
      const after = new Uint8Array(before);
      ch.forEach((c) => { after[c.idx] = md ? 1 : 0; });
      expect(Array.from(after)).not.toEqual(Array.from(before));
      // This is what undoTrack does with a history step: put oldVal back.
      ch.forEach((c) => { after[c.idx] = c.oldVal; });
      expect(Array.from(after)).toEqual(Array.from(before));
    }
  });
});

describe('colourDoneName and colourDoneConfirmText', () => {
  test('a solid names the brand, id and thread', () => {
    expect(api.colourDoneName({ id: '05', name: 'Light Driftwood' })).toBe('DMC 05 Light Driftwood');
  });

  test('a blend names both threads', () => {
    const e = { id: '310+415', type: 'blend', threads: [{ name: 'Black' }, { name: 'Pearl Grey' }] };
    expect(api.colourDoneName(e)).toBe('DMC 310+415 Black+Pearl Grey');
  });

  test('the confirmation quotes the colour and the exact count', () => {
    const t = api.colourDoneConfirmText('DMC 05 Light Driftwood', 1573, true, false);
    expect(t.message.split('\n')[0]).toBe('Mark all 1,573 stitches of DMC 05 Light Driftwood as done?');
    expect(t.confirmLabel).toBe('Mark all done');
  });

  test('unmarking is worded as not done and says what it costs', () => {
    const t = api.colourDoneConfirmText('DMC 310 Black', 40, false, false);
    expect(t.message.split('\n')[0]).toBe('Mark all 40 stitches of DMC 310 Black as not done?');
    expect(t.message).toMatch(/come off your progress/);
    expect(t.confirmLabel).toBe('Mark all not done');
  });

  test('a work area and a single stitch are worded plainly', () => {
    expect(api.colourDoneConfirmText('DMC 310 Black', 12, true, true).message.split('\n')[0])
      .toBe('Mark all 12 stitches of DMC 310 Black in this work area as done?');
    expect(api.colourDoneConfirmText('DMC 310 Black', 1, true, false).message.split('\n')[0])
      .toBe('Mark 1 stitch of DMC 310 Black as done?');
  });
});

describe('tracker-app.js wiring', () => {
  test('no native confirm() remains', () => {
    const stripped = trackerSrc.replace(/\/\/[^\n]*/g, '');
    expect(stripped).not.toMatch(/(^|[^\w.])confirm\s*\(/);
    expect(stripped).not.toMatch(/window\.confirm/);
  });

  test('the colour row chip is named for what it does and never says Undo', () => {
    const start = trackerSrc.indexOf('className="ppal-tile-done-btn"\n');
    expect(start).toBeGreaterThan(-1);
    const chip = trackerSrc.slice(start, trackerSrc.indexOf('</button>}', start));
    expect(chip).toContain('Mark all not done');
    expect(chip).toContain('Mark all done');
    expect(chip).not.toMatch(/>\s*\{?" ?Undo/);
    expect(chip).not.toMatch(/Icons\.undo/);
    expect(chip).toContain('confirmAndMarkColour(p,!complete)');
    // The accessible name carries the full text and the colour.
    expect(chip).toMatch(/aria-label=\{\(complete\?"Mark all not done: ":"Mark all done: "\)\+colourDoneName\(p\)\}/);
  });

  test('the chip click is separate from selecting the colour', () => {
    expect(trackerSrc).toMatch(/className="ppal-tile-actions" onClick=\{e=>e\.stopPropagation\(\)\}/);
    expect(trackerSrc).toMatch(/onClick=\{e=>\{e\.stopPropagation\(\);confirmAndMarkColour\(p,!complete\);\}\}/);
  });

  test('the confirmation uses the styled dialog and then the existing catch-up flow', () => {
    const fn = trackerSrc.slice(trackerSrc.indexOf('function confirmAndMarkColour('));
    const body = fn.slice(0, fn.indexOf('\n}\n'));
    expect(body).toContain('colourDoneConfirmText(');
    expect(body).toContain('askConfirm(');
    expect(body).toContain('requestMarkColourDone(p.id,md)');
    expect(trackerSrc).toMatch(/function askConfirm\(opts\)\{\s*if\(window\.ConfirmDialog&&window\.ConfirmDialog\.show\)return window\.ConfirmDialog\.show\(opts\);/);
  });

  test('a whole-colour change is a single history step with an Undo toast', () => {
    const start = trackerSrc.indexOf('function markColourDone(');
    const body = trackerSrc.slice(start, trackerSrc.indexOf('function confirmAndMarkColour('));
    expect((body.match(/pushTrackHistory\(/g) || []).length).toBe(1);
    expect(body).toContain('offerStepUndo(changes,');
    const offer = trackerSrc.slice(trackerSrc.indexOf('function offerStepUndo('), start);
    expect(offer).toContain('undoLabel');
    expect(offer).toContain('h[h.length-1]!==entry');
    expect(offer).toContain('bulkUndoRef.current()');
  });

  test('park marker Clear all confirms and offers Undo', () => {
    expect(trackerSrc).toContain('onClick={clearAllParkMarkers}');
    const start = trackerSrc.indexOf('function clearAllParkMarkers(');
    const body = trackerSrc.slice(start, trackerSrc.indexOf('// Apply a PARK history entry'));
    expect(body).toContain('askConfirm(');
    expect(body).toContain('danger:true');
    expect(body).toContain('offerStepUndo(entry,');
    expect(trackerSrc).toMatch(/const entry=\{type:"PARK",added,removed\};[\s\S]*return entry;/);
  });

  test('a key explains the done and not-done look and points to Corner tick', () => {
    expect(trackerSrc).toContain('className="ppal-key"');
    expect(trackerSrc).toContain('To stitch</span>');
    expect(trackerSrc).toContain('Stitched');
    expect(trackerSrc).toMatch(/Corner tick in More &gt; View/);
  });
});

describe('styles.css touch targets', () => {
  test('on coarse pointers the chips are 44 px and the actions are spaced', () => {
    const m = stylesSrc.match(/@media \(pointer:coarse\)\{\s*\.ppal-tile-park-btn,\.ppal-tile-done-btn\{([^}]*)\}\s*\.ppal-tile-actions\{([^}]*)\}/);
    expect(m).not.toBeNull();
    expect(m[1]).toMatch(/min-height:44px/);
    expect(m[1]).toMatch(/min-width:44px/);
    expect(m[2]).toMatch(/gap:8px/);
  });

  test('the key uses theme tokens only', () => {
    const rules = stylesSrc.split('\n').filter((l) => /^\.ppal-key/.test(l)).join('\n');
    expect(rules.length).toBeGreaterThan(0);
    expect(rules).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
