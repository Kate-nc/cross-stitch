// A4 (UX Phase 5) — touch-target floor + persistent saved tag.
// Source-content assertions; no React mounting.

const fs = require('fs');
const path = require('path');

const headerSrc = fs.readFileSync(path.join(__dirname, '..', 'header.js'), 'utf8');
const cssSrc = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const trackerSrc = fs.readFileSync(path.join(__dirname, '..', 'tracker-app.js'), 'utf8');
const creatorMainSrc = fs.readFileSync(path.join(__dirname, '..', 'creator-main.js'), 'utf8');

describe('A4 — persistent saved tag', () => {
  test('header uses Icons.check + "All changes saved" copy (no raw ✓ glyph)', () => {
    expect(headerSrc).toMatch(/All changes saved/);
    // Neither the badge nor the context bar should ship the raw checkmark glyph.
    expect(headerSrc).not.toMatch(/'✓ Auto-saved'/);
  });

  test('badge is rendered with showAutosaved + Icons.check', () => {
    // Locate the badge slice and assert it calls Icons.check.
    const slice = headerSrc.split('tb-proj-badge-saved')[1] || '';
    expect(slice).toMatch(/Icons\.check\(\)/);
  });

  test('Tracker passes showAutosaved={true} when a project is loaded', () => {
    expect(trackerSrc).toMatch(/showAutosaved=\{!!\(pat&&pal\)\}/);
  });

  test('Creator passes showAutosaved when state.pat && state.pal', () => {
    expect(creatorMainSrc).toMatch(/showAutosaved=\{!!\(state\.pat&&state\.pal\)\}/);
  });
});

describe('A4 — touch-target floor', () => {
  test('coarse-pointer rule lists tracker, home, mpd & context buttons together', () => {
    // Single combined block keeps the 44px floor consistent across pages.
    const block = cssSrc.match(/@media \(pointer: coarse\) and \(max-width: 1024px\) \{[\s\S]*?\}/);
    expect(block).not.toBeNull();
    const text = block[0];
    ['.tb-btn', '.home-btn', '.mpd-btn', '.tb-context-btn', '.resume-recap-btn']
      .forEach(sel => { expect(text).toContain(sel); });
    expect(text).toMatch(/min-height:\s*44px/);
  });

  test('home & dashboard buttons get padding bumped on touch', () => {
    expect(cssSrc).toMatch(/\.home-btn,\s*\.mpd-btn\s*\{\s*padding:\s*10px 16px/);
  });
});
