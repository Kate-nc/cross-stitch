/* Phase 4 batch 1 (tracking audit TRACK-06 / TRACK-07): source-level guards that the small-target and icon rules hold. */
const fs = require('fs');
const path = require('path');
const read = f => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');

describe('dismiss controls are sized for touch and use the shared icon', () => {
  test('every Dismiss button in the Tracker carries the touch-size class', () => {
    const src = read('tracker-app.js');
    const buttons = src.match(/<button[^>]*>(?:(?!<\/button>)[\s\S])*?<\/button>/g).filter(b => /aria-label="Dismiss"|>Dismiss<\/button>/.test(b));
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    buttons.forEach(b => expect(b).toMatch(/tracker-dismiss-btn/));
  });
  test('the stylesheet sizes those classes to 44 px on coarse pointers', () => {
    const css = read('styles.css');
    expect(css).toMatch(/@media \(pointer: coarse\) \{\s*\.ppal-close, \.ppal-more-close, \.lp-close, \.tracker-dismiss-btn, \.toast-dismiss\{ min-width:44px; min-height:44px;/);
  });
  test('the Toast close button draws the shared close icon, not a typed glyph', () => {
    const src = read('toast.js');
    expect(src).not.toMatch(/textContent = "×"/);
    expect(src).toMatch(/svgString\("x"\)/);
  });
});

describe('the docked colour panel starts below the top bar', () => {
  test('desktop .lpanel rule uses the header height', () => {
    expect(read('styles.css')).toMatch(/\.lpanel\{[^}]*top:var\(--app-header-height, 48px\);bottom:0;/);
  });
});
