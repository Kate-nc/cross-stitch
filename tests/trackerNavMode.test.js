/* Navigate mode is a hand tool.

   Before: a left press in Navigate mode dropped the guide crosshair at once,
   so trying to drag the chart just moved the guide, and the cursor stayed an
   arrow. Now a press-and-drag pans the chart (tracked on window so it keeps
   panning off the canvas), and a press released without moving toggles the
   guide: it places it, or clears it if it is already on that cell. Esc also
   clears it in Navigate mode.

   Also guarded here: the one-time "sessions are tracked" hint is a floating
   toast, not a banner above the chart that pushed it down on the first
   stitch and back up when it auto-dismissed. */
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');

function body(startMarker, endMarker) {
  const s = src.indexOf(startMarker);
  const e = src.indexOf(endMarker, s + 1);
  expect(s).toBeGreaterThan(-1);
  expect(e).toBeGreaterThan(s);
  return src.slice(s, e);
}

describe('Navigate mode press', () => {
  test('a Navigate-mode mousedown starts a press instead of placing the guide', () => {
    const b = body('function handleStitchMouseDown(e){', '\nfunction handleStitchMouseMove(');
    expect(b).toMatch(/if\(stitchMode==="navigate"\)\{[\s\S]*?beginNavPress\(e,gx,gy\);\s*return;\s*\}/);
    expect(b).not.toMatch(/setHlRow\(/);
  });

  test('past a few pixels the press pans the scroller', () => {
    const b = body('function beginNavPress(e,gx,gy){', '\nuseEffect(');
    expect(src).toMatch(/const NAV_DRAG_PX=4;/);
    expect(b).toMatch(/if\(Math\.abs\(dx\)<=NAV_DRAG_PX&&Math\.abs\(dy\)<=NAV_DRAG_PX\)return;/);
    expect(b).toMatch(/el\.scrollLeft=press\.sl-dx;el\.scrollTop=press\.st-dy;/);
    // Same maths as doPan, so the canvas mousemove handler agrees.
    expect(b).toMatch(/panStart\.current=\{x:press\.x,y:press\.y,scrollX:press\.sl,scrollY:press\.st\};/);
  });

  test('the press is tracked on window so a drag survives leaving the canvas', () => {
    const b = body('function beginNavPress(e,gx,gy){', '\nuseEffect(');
    expect(b).toMatch(/window\.addEventListener\("mousemove",move\);/);
    expect(b).toMatch(/window\.addEventListener\("mouseup",up\);/);
    expect(b).toMatch(/window\.removeEventListener\("mousemove",move\);window\.removeEventListener\("mouseup",up\);/);
  });

  test('a release without a drag toggles the guide', () => {
    const b = body('function beginNavPress(e,gx,gy){', '\nuseEffect(');
    expect(b).toMatch(/if\(press\.dragging\)\{setIsPanning\(false\);return;\}\s*toggleGuideAt\(gx,gy\);/);
    const t = body('function toggleGuideAt(gx,gy){', '\n}\n');
    expect(t).toMatch(/if\(g\.row===gy&&g\.col===gx\)\{setHlRow\(-1\);setHlCol\(-1\);\}/);
  });

  test('Esc clears the guide in Navigate mode, after every other Esc target', () => {
    const esc = body('{ id: "tracker.esc"', '} },');
    const clear = esc.indexOf('if(stitchMode==="navigate"&&hlRow>=0&&hlCol>=0){setHlRow(-1);setHlCol(-1);return;}');
    expect(clear).toBeGreaterThan(esc.indexOf('setLeftSidebarOpen(false)'));
  });

  test('the shortcut list re-registers when the mode or guide changes (Esc reads them)', () => {
    expect(src).toMatch(/,sW,sH,startCorner,stitchMode,hlRow,hlCol\]\);/);
  });

  test('the cursor is a hand in Navigate mode', () => {
    expect(src).toMatch(/!isEditMode&&stitchMode==="navigate"\?"grab":"default"/);
  });

  test('the Nav button no longer claims to be the parking tool', () => {
    expect(src).toMatch(/title="Navigate \(N\)"/);
    expect(src).not.toMatch(/Navigate \/ park/);
  });
});

describe('session onboarding hint', () => {
  test('is not rendered above the chart', () => {
    expect(src).not.toMatch(/className="session-onboarding-toast"/);
  });

  test('is a one-time floating toast, marked seen when shown', () => {
    const b = body('// ═══ Session onboarding hint ═══', '// ═══ Thread usage overlay rendering ═══');
    expect(b).toMatch(/setSessionOnboardingShown\(true\);/);
    expect(b).toMatch(/window\.Toast\.show\(\{/);
  });
});

describe('Nav button', () => {
  test('uses the hand icon, not the parking flag', () => {
    expect(src).toMatch(/title="Navigate \(N\)" aria-pressed=\{stitchMode==="navigate"\}>\s*<span className="ppal-mode-btn-icon">\{Icons\.hand\(\)\}<\/span>/);
    expect(src).not.toMatch(/Icons\.parkFlag\(\)/);
  });
});
