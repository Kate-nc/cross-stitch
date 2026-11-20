// tests/editSectionStyle.test.js
// Stage 3 (D3): Edit's side panel uses the Convert panel's sections. Every
// section in creator/Sidebar.js is built by Convert's own helper
// (CreatorPanelParts.sec, creator/ConvertPanel.js), so the header is the same
// element and class (h3.cs-toolsec__title in .cv-sec__head), and that class
// is sentence case: no uppercase, letter-spaced labels as section headers.

const fs = require('fs');
const path = require('path');
const read = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');

const sidebar = read('creator/Sidebar.js');
const convert = read('creator/ConvertPanel.js');
const swap = read('palette-swap.js');
const css = read('styles.css');

function rule(selector) {
  const at = css.indexOf(selector + ' {');
  if (at < 0) throw new Error('no rule for ' + selector);
  return css.slice(at, css.indexOf('}', at));
}

describe('one section style in Convert and Edit (Stage 3, D3)', () => {
  test('ConvertPanel shares its section helper', () => {
    expect(convert).toMatch(/window\.CreatorPanelParts = \{ sec: sec,/);
    expect(convert).toMatch(/h\("h3", \{ className: "cs-toolsec__title cv-sec__title" \}/);
  });

  test('every side-panel section in Edit is built with it', () => {
    const secs = sidebar.match(/P\.sec\("[a-z-]+"/g) || [];
    const ids = secs.map((m) => m.slice(7, -1));
    for (const id of ['pal-threads', 'recolour', 'chart-view', 'highlight', 'overlay', 'preview', 'compare', 'project-info', 'fabric',
      'stitch-type', 'brush-size', 'shapes', 'mirror', 'selection', 'correct', 'chart-mode']) {
      expect(ids).toContain(id);
    }
  });

  test('no hand-made section headers or card sections are left in the side panel', () => {
    expect(sidebar).not.toMatch(/className:\s*"cs-toolsec__title"/);
    expect(sidebar).not.toMatch(/textTransform/);
    expect(sidebar).not.toMatch(/h\(Section,/);
    expect(swap).not.toMatch(/createElement\(Section,/);
  });

  test('the shared section header is sentence case', () => {
    const title = rule('.cs-toolsec__title');
    expect(title).not.toMatch(/text-transform/);
    expect(title).not.toMatch(/letter-spacing/);
    expect(title).toMatch(/font-size: var\(--text-sm\)/);
    for (const sel of ['.size-field__heading', '.fabric-block__label']) {
      const at = css.indexOf(sel);
      const body = css.slice(at, css.indexOf('}', at));
      expect(body).not.toMatch(/uppercase/);
    }
  });
});
