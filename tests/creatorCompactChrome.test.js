// P1-2 (audit COMMON-03): the compact phone chrome.
const { loadSource } = require('./_helpers/loadSource');

const css = loadSource('styles.css');
const main = loadSource('creator-main.js');
const strip = loadSource('creator/ToolStrip.js');
const bar = loadSource('creator/CompactBar.js');

describe('compact chrome wiring', () => {
  test('CompactBar.js is bundled before ToolStrip.js', () => {
    const order = loadSource('build-creator-bundle.js');
    expect(order.indexOf("'CompactBar.js'")).toBeGreaterThan(-1);
    expect(order.indexOf("'CompactBar.js'")).toBeLessThan(order.indexOf("'ToolStrip.js'"));
    expect(loadSource('creator/bundle.js')).toMatch(/window\.CreatorCompactTopBar = function/);
  });

  test('the layout switches at 900px and sets body.creator-compact', () => {
    expect(bar).toMatch(/var COMPACT_QUERY = "\(max-width: 899px\)";/);
    expect(main).toMatch(/document\.body\.classList\.toggle\('creator-compact', on\)/);
    expect(main).toMatch(/\{_compact&&window\.CreatorCompactTopBar&&<window\.CreatorCompactTopBar/);
    expect(main).toMatch(/\{!_compact&&window\.CreatorActionBar&&<window\.CreatorActionBar/);
  });

  test('the top bar sheet carries Print PDF, Export, Open in Tracker, Pattern info and Help', () => {
    for (const label of ['"Print PDF"', '"Open in Tracker"', '"Pattern info"', '"Help"', '"Stitch Score"']) {
      expect(bar).toContain(label);
    }
    expect(bar).toMatch(/"Export(\\u2026|\u2026)"/);
  });

  test('the rail has Navigate | Draw, Paint, Fill, Erase, colour, Undo and More', () => {
    const i = strip.indexOf('if (compact) {');
    const rail = strip.slice(i, strip.indexOf('return h(React.Fragment, null,', i));
    for (const s of ['railToggle', '"Paint tool"', '"Fill tool"', '"Erase tool"', 'creator-rail__colour', '"Undo"', 'morePanelWrap']) {
      expect(rail).toContain(s);
    }
    expect(rail).toMatch(/showColourStrip && swatchRow/);
  });

  test('zoom and the colour strip toggle live in More on phones', () => {
    expect(strip).toMatch(/"aria-label":"Zoom in"/);
    expect(strip).toMatch(/"aria-label":"Zoom out"/);
    expect(strip).toMatch(/"Show colour strip"/);
  });
});

describe('compact chrome CSS', () => {
  test('header, action bar and Stitch Score banner are hidden; rail is 56px', () => {
    expect(css).toMatch(/body\.creator-compact \.tb-topbar,\s*body\.creator-compact \.creator-actionbar,\s*body\.creator-compact \.cc-hide-compact\{display:none!important;\}/);
    expect(css).toMatch(/--creator-rail-h:56px;/);
    expect(css).toMatch(/\.creator-compact-top\{[^}]*height:48px;/);
  });

  test('rail and top-bar controls are at least 44px', () => {
    expect(css).toMatch(/\.creator-rail__btn\{[^}]*min-width:44px;min-height:44px;/);
    expect(css).toMatch(/\.cc-btn\{[^}]*min-width:44px;min-height:44px;/);
  });

  test('the drawer opens above the rail and hides while closed', () => {
    expect(css).toMatch(/body\.creator-compact \.rpanel\.rpanel--edit\{bottom:calc\(var\(--creator-rail-h\)/);
    expect(css).toMatch(/body\.creator-compact \.rpanel\.rpanel--edit:not\(\.rpanel--open\)\{display:none;\}/);
  });

  test('no raw hex in the new rules', () => {
    const block = css.slice(css.indexOf('Compact phone chrome (audit COMMON-03)'));
    expect(block).not.toMatch(/#[0-9A-Fa-f]{3,6}\b/);
  });
});
