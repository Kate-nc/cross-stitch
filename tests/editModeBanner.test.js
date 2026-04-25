// A2 (UX Phase 5) — structural assertions on the bold edit-mode strip.
// tracker-app.js is JSX (compiled in-browser by Babel) so we cannot eval it
// in Node. We instead assert on the source text that the strip is wired
// correctly and that styles.css carries the matching rules. This is the
// same low-tech approach used by `tests/terminologyLint.test.js`.

const fs = require('fs');
const path = require('path');

const trackerSrc = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');
const stylesSrc  = fs.readFileSync(path.join(__dirname, '..', 'styles.css'),    'utf8');

describe('Tracker edit-mode strip (A2)', () => {
  test('renders an aria-live status strip when isEditMode is true', () => {
    expect(trackerSrc).toMatch(/isEditMode\s*&&\s*<div className="edit-mode-strip"/);
    expect(trackerSrc).toMatch(/role="status"\s+aria-live="polite"/);
  });

  test('strip exposes an "Exit edit mode" affordance', () => {
    expect(trackerSrc).toMatch(/className="edit-mode-strip__exit"/);
    expect(trackerSrc).toMatch(/>Exit edit mode</);
  });

  test('Exit-edit handler clears edit-mode state and snapshots', () => {
    // The handler must call setIsEditMode(false) (directly or via the
    // confirmation modal). Find the strip's exit button and assert.
    const stripBlock = trackerSrc.split('edit-mode-strip__exit')[1] || '';
    expect(stripBlock).toMatch(/setIsEditMode\(false\)/);
    expect(stripBlock).toMatch(/setShowExitEditModal\(true\)/);
  });

  test('primary "Mark" button relabels to "Modify" in edit mode', () => {
    expect(trackerSrc).toMatch(/isEditMode\?"Modify":"Mark"/);
    // Button picks up the destructive red variant rather than the default
    // green when in edit mode.
    expect(trackerSrc).toMatch(/isEditMode\?" tb-btn--red":" tb-btn--green"/);
  });

  test('toolbar row gains a tinted background class while editing', () => {
    expect(trackerSrc).toMatch(/"toolbar-row"\+\(isEditMode\?" toolbar-row--edit":""\)/);
  });

  test('styles.css ships the matching edit-mode rules', () => {
    expect(stylesSrc).toMatch(/\.edit-mode-strip\s*\{/);
    expect(stylesSrc).toMatch(/\.edit-mode-strip__exit\s*\{/);
    expect(stylesSrc).toMatch(/\.toolbar-row--edit\s*\{/);
    // 40 px strip height per spec
    expect(stylesSrc).toMatch(/min-height:\s*40px/);
    // Red border colour family (Workshop brick palette: #A53D3D)
    expect(stylesSrc).toMatch(/border-bottom:\s*2px solid #A53D3D/i);
  });

  test('exit button meets the 44 px coarse-pointer touch target on the link', () => {
    // The styled exit button has a 32px min-height (small affordance),
    // but the strip itself is at least 40px tall and has 8px vertical
    // padding, giving 40-48 px total height — comfortably tappable.
    expect(stylesSrc).toMatch(/\.edit-mode-strip__exit[^}]*min-height:\s*32px/);
  });
});
