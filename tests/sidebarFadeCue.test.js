// tests/sidebarFadeCue.test.js — fix-3.6
// Sidebar mode-swap micro-cue: cs-page-fade animation includes a
// translateX(12px) start state, with prefers-reduced-motion fallback.

const fs = require('fs');
const path = require('path');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

describe('fix-3.6 — sidebar mode-swap translate cue', () => {
  it('@keyframes cs-page-fade-in-translate is defined', () => {
    expect(css).toMatch(/@keyframes\s+cs-page-fade-in-translate/);
  });

  it('keyframe applies translateX(12px) at the start', () => {
    expect(css).toMatch(/cs-page-fade-in-translate[\s\S]*?translateX\(12px\)/);
  });

  it('cs-page-fade is wired to the translate animation', () => {
    expect(css).toMatch(/\.cs-page-fade\s*\{\s*animation:\s*cs-page-fade-in-translate/);
  });

  it('honours prefers-reduced-motion (no transform)', () => {
    // Find the specific @media block that targets .cs-page-fade and assert
    // it disables the translate. Other reduced-motion blocks (older A2/A3
    // work) live elsewhere in the file and are not relevant here.
    const m = css.match(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[^}]*\.cs-page-fade[^}]*\}\s*\}/);
    expect(m).toBeTruthy();
    expect(m[0]).toMatch(/transform:\s*none/);
  });
});
