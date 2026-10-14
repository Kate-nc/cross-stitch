// Phase 5 batch 3 (TRACK-10): keyboard parity for the Tracker chart, pinned at the source level (the behaviour itself is in
// tests/e2e/phase5-batch3.spec.js). Screen-reader announcements are out of scope and nothing here asserts them.
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const tracker = read('tracker-app.js');
const handler = tracker.slice(tracker.indexOf('function handleStitchKeyDown(e){'), tracker.indexOf('const GUIDE_KEYS='));

describe('chart key handler', () => {
  test('arrows move the guide in Mark and Navigate mode, and row mode keeps Up and Down', () => {
    expect(handler).toMatch(/\(stitchMode==="navigate"\|\|stitchMode==="track"\)&&!isEditMode&&plain&&GUIDE_KEYS\[e\.key\]/);
    expect(handler).toMatch(/rowModeActive&&stitchMode!=="navigate"&&\(e\.key==="ArrowUp"\|\|e\.key==="ArrowDown"\)\)return/);
    expect(handler).toMatch(/e\.shiftKey\?10:1/);
  });
  test('Enter marks only in Mark mode; Space only once the keyboard has the guide; auto-repeat does not toggle', () => {
    expect(handler).toMatch(/const inMark=stitchMode==="track"&&!isEditMode&&!!pat/);
    expect(handler).toMatch(/inMark&&\(isEnter\|\|\(isSpace&&kbGuideRef\.current\)\)/);
    expect(handler).toMatch(/if\(e\.repeat\)return/);
  });
  test('the first press takes the guide without marking', () => {
    expect(handler).toMatch(/if\(!kbGuideRef\.current\|\|!onChart\)\{/);
  });
  test('marking goes through the same single-stitch and range paths the pointer uses (colour lock, history, undo)', () => {
    expect(handler).toMatch(/_dragMarkOnToggle\(idx\)/);
    expect(handler).toMatch(/_commitBulk\(set,anchor\.intent,'range'\)/);
  });
  test('a colour lock that refuses the mark does not move the anchor', () => {
    expect(handler).toMatch(/if\(now!==was\)kbAnchorRef\.current=/);
  });
  test('Shift+Enter needs a previous keyboard mark; without one it marks like Enter', () => {
    expect(handler).toMatch(/isEnter&&e\.shiftKey&&anchor&&anchor\.idx!==idx/);
  });
  test('Navigate mode never marks from the keyboard', () => {
    expect(handler).not.toMatch(/stitchMode==="navigate"[^;]*_dragMarkOnToggle/);
  });
});

describe('who owns the guide', () => {
  test('a primary pointer press, Esc and a change of mode hand it back', () => {
    expect(tracker).toMatch(/function handleStitchMouseDown\(e\)\{\n  if\(!stitchRef\.current\|\|!pat\)return;[\s\S]{0,200}if\(e\.button===2\|\|isMacSecondaryClick\(e\)\)return;\n  kbGuideRef\.current=false;kbAnchorRef\.current=null;/);
    expect(tracker).toMatch(/useEffect\(\(\)=>\{kbGuideRef\.current=false;kbAnchorRef\.current=null;\},\[stitchMode,pat\]\)/);
    expect(tracker).toMatch(/\(stitchMode==="navigate"\|\|kbGuideRef\.current\)&&hlRow>=0&&hlCol>=0\)\{clearGuide\(\);return;\}/);
  });
});

describe('review fixes (Copilot on #303)', () => {
  test('the Clear guide button, Esc and every other way of clearing the guide go through one helper that also hands back the keyboard', () => {
    expect(tracker).toMatch(/function clearGuide\(\)\{setHlRow\(-1\);setHlCol\(-1\);kbGuideRef\.current=false;kbAnchorRef\.current=null;setBsSelect\(-1\);\}/);
    expect(tracker).toMatch(/className="tracker-hover-bar__clear" onClick=\{clearGuide\}/);
    expect(tracker).toMatch(/hlRow>=0&&hlCol>=0\)\{clearGuide\(\);return;\}/);
  });
  test('a different pattern hands the guide back too, not only a change of mode', () => {
    expect(tracker).toMatch(/kbGuideRef\.current=false;kbAnchorRef\.current=null;\},\[stitchMode,pat\]\)/);
  });
  test('_commitBulk says whether it committed, and the range anchor moves only then', () => {
    const bulk = tracker.slice(tracker.indexOf('const _commitBulk=useCallback'), tracker.indexOf('const _dragMarkOnToggle=useCallback'));
    expect(bulk).toMatch(/if\(!changes\.length\)return false;/);
    expect(bulk).toMatch(/setMarkAllAsk\(\{set:set,intent:intent,source:source\}\);return false;/);
    expect(bulk).toMatch(/\n  return true;/);
    expect(handler).toMatch(/if\(_commitBulk\(set,anchor\.intent,'range'\)\)kbAnchorRef\.current=\{idx:idx,intent:anchor\.intent\}/);
  });
});

describe('shortcut registry', () => {
  test('[ and ] change colour in every view, the arrow keys only in Highlight view and with focus off the chart', () => {
    expect(tracker).toMatch(/id: "tracker\.col\.next", keys: "\]", scope: "tracker\.notedit"/);
    expect(tracker).toMatch(/id: "tracker\.col\.prev", keys: "\[", scope: "tracker\.notedit"/);
    expect(tracker).toMatch(/id: "tracker\.hl\.next", keys: "arrowright", scope: "tracker\.view\.highlight"/);
    expect(tracker).toMatch(/id: "tracker\.hl\.prev", keys: "arrowleft", scope: "tracker\.view\.highlight"/);
  });
  test('Shift+G goes back to the chart, so it need not be Tabbed to', () => {
    expect(tracker).toMatch(/id: "tracker\.chartFocus", keys: "shift\+g", scope: "tracker\.notedit"/);
    expect(read('help-drawer.js')).toMatch(/id: "t\.chartFocus"[^\n]*keys: \["Shift\+G"\]/);
  });
  test('G goes to the legend, which is keyboard operable', () => {
    expect(tracker).toMatch(/id: "tracker\.legend", keys: "g", scope: "tracker\.notedit"/);
    expect(tracker).toMatch(/function focusLegend\(\)/);
    expect(tracker).toMatch(/className=\{"ppal-tile"[^}]*\}\n\s+onClick/);
  });
});

describe('closed panel and focus', () => {
  test('the shut controls panel is hidden, not only off screen, so it cannot be tabbed into', () => {
    const css = read('styles.css');
    expect(css).toMatch(/\.ppal-more-panel\{\n\s+visibility:hidden;/);
    expect(css).toMatch(/\.ppal-more-panel--open\{transform:translateX\(0\);visibility:visible;/);
  });
  test('the chart box is outlined when the keyboard has the chart', () => {
    expect(read('styles.css')).toMatch(/\.tracker-chart-scroll:has\(canvas:focus-visible\)\{outline:2px solid var\(--accent\)/);
  });
});

describe('documentation', () => {
  test('help and the changelog describe the keys', () => {
    const help = read('help-drawer.js');
    expect(help).toMatch(/id: "t\.markGuide"[^\n]*keys: \["Enter", "Space"\]/);
    expect(help).toMatch(/id: "t\.markRange"[^\n]*keys: \["Shift\+Enter"\]/);
    expect(help).toMatch(/id: "t\.legend"[^\n]*keys: \["G"\]/);
    expect(help).toMatch(/\["Marking with the keyboard"/);
    expect(read('version.js')).toMatch(/You can now mark stitches without a mouse or touch screen/);
  });
  test('no screen-reader announcement was added in this batch', () => {
    expect(handler).not.toMatch(/guideLiveRef|aria-live|textContent=/);
  });
});
