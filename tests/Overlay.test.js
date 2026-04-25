/* Regression tests for the Overlay primitive (UX-12 Phase 3).
   Static checks only — render-time behaviour (focus trap, ESC, scrim
   click) is exercised by the migrated modals' own integration tests
   and by Playwright smoke runs. We verify the CSS is wired up and
   the JS exposes the expected API surface. */
const fs = require('fs');
const path = require('path');

describe('Overlay primitive', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  const js  = fs.readFileSync(path.join(__dirname, '..', 'components', 'Overlay.js'), 'utf8');

  test('CSS defines .overlay-scrim with fixed positioning', () => {
    expect(css).toMatch(/\.overlay-scrim\s*\{[^}]*position\s*:\s*fixed/);
  });

  test('CSS defines .overlay-panel with a background', () => {
    expect(css).toMatch(/\.overlay-panel\s*\{[^}]*background\s*:/);
  });

  test('CSS defines all three variants', () => {
    expect(css).toMatch(/\.overlay-panel--dialog\b/);
    expect(css).toMatch(/\.overlay-panel--sheet\b/);
    expect(css).toMatch(/\.overlay-panel--drawer\b/);
  });

  test('Sheet variant honours iOS safe-area inset', () => {
    expect(css).toMatch(/\.overlay-panel--sheet[^}]*env\(safe-area-inset-bottom/);
  });

  test('Reduced-motion media query disables overlay animation', () => {
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*?\.overlay-scrim/);
  });

  test('Overlay.js exposes window.Overlay and sub-components', () => {
    expect(js).toMatch(/window\.Overlay\s*=\s*Overlay/);
    expect(js).toMatch(/Overlay\.Title\s*=/);
    expect(js).toMatch(/Overlay\.Body\s*=/);
    expect(js).toMatch(/Overlay\.Footer\s*=/);
    expect(js).toMatch(/Overlay\.CloseButton\s*=/);
  });

  test('Overlay delegates ESC to window.useEscape stack', () => {
    expect(js).toMatch(/window\.useEscape\s*\(\s*onClose\s*\)/);
  });

  test('Overlay sets ARIA dialog attributes', () => {
    expect(js).toMatch(/role:\s*"dialog"/);
    expect(js).toMatch(/"aria-modal":\s*"true"/);
  });

  test('Overlay implements a focus trap on Tab', () => {
    expect(js).toMatch(/e\.key\s*[!=]==\s*"Tab"/);
    expect(js).toMatch(/data-autofocus/);
  });

  test('Overlay loaded by all three HTML entry points', () => {
    const root = path.join(__dirname, '..');
    ['index.html', 'stitch.html', 'manager.html'].forEach(file => {
      const html = fs.readFileSync(path.join(root, file), 'utf8');
      expect(html).toMatch(/components\/Overlay\.js/);
    });
  });
});
