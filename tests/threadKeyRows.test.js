/* tests/threadKeyRows.test.js — the colour key (UX-013, UX-014).
 *
 * The Creator Palette tab and the Stitch Tracker colour list show the same
 * words for a symbol: the one thread label, its full name, and the strands and
 * skeins it takes. These check the figures (threadCalc.js), the row model
 * (helpers.js threadKeyRow), the rendered rows (components.js ThreadKeyLabel,
 * snapshot-style), and that the Manager prints the same label for the same
 * pattern.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

const calc = require('../threadCalc.js');
// helpers.js is a global in every test (tests/setup/progress-units.js). threadKeyRow reads the usage figures from the
// page globals threadCalc.js defines.
Object.assign(globalThis, {
  threadKeyUsage: calc.threadKeyUsage,
  threadUsageText: calc.threadUsageText,
  threadUsageTitle: calc.threadUsageTitle
});

// The catalogues, so names come from the real data.
const cat = (() => {
  const ctx = { console: { log() {}, warn() {}, error() {}, info() {} } };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  vm.createContext(ctx);
  ['dmc-data.js', 'anchor-data.js', 'helpers.js'].forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
  vm.runInContext('globalThis.__dmc = DMC;', ctx);
  return ctx;
})();
const keyRow = (entry, opts) => {
  // The VM's helpers have the catalogues; the Jest-global ones do not.
  cat.threadKeyUsage = calc.threadKeyUsage;
  cat.threadUsageText = calc.threadUsageText;
  cat.threadUsageTitle = calc.threadUsageTitle;
  return cat.threadKeyRow(entry, opts);
};

// components.js, evaluated as the page does (plain script, React as a global).
const components = new Function('React', 'ReactDOM', 'window', read('components.js') + '\nreturn { ThreadKeyLabel, BlendHelpNote };')(
  React, { createPortal: (x) => x }, { threadParts: cat.threadParts, BLEND_HELP: cat.BLEND_HELP, openBlendHelp() {}, Icons: null }
);

const PAL_ROW = { wrap: 'pal-row__label', id: 'pal-row__id', tag: 'pal-row__tag', name: 'pal-row__name', use: 'pal-row__use' };
const TILE_ROW = { wrap: 'ppal-tile-text', id: 'ppal-tile-id', tag: 'ppal-tile-tag', name: 'ppal-tile-name', use: 'ppal-tile-use' };
const html = (row, classes) => renderToStaticMarkup(React.createElement(components.ThreadKeyLabel, { row, classes }));
const text = (markup) => markup.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

// One pattern as the Creator and the Tracker hold it: a solid, a blend, a long name, an Anchor thread.
const PATTERN = [
  { id: '3799', type: 'solid', name: 'Pewter VDk', count: 900 },
  { id: '341+826', type: 'blend', name: '341+826', count: 900,
    threads: [{ id: '341', name: 'Blue Violet Lt' }, { id: '826', name: 'Blue Med' }] },
  { id: '3802', type: 'solid', name: 'Antq Mauve VDk', count: 5000 },
  { id: '403', type: 'solid', name: 'Black', brand: 'anchor', count: 12 }
];

describe('threadKeyUsage: the strands and skeins a symbol takes', () => {
  test('a solid is two strands, with the 20% allowance the shopping list uses', () => {
    const u = calc.threadKeyUsage({ count: 900, type: 'solid' }, { fabricCount: 14 });
    expect(u).toEqual({ isBlend: false, count: 900, strands: [2], skeins: [expect.closeTo(0.5715, 6)], toBuy: [1] });
    expect(calc.KEY_WASTE_FACTOR).toBe(0.2);
  });

  test('a blend is one strand of each thread, so each thread costs half a solid', () => {
    const solid = calc.threadKeyUsage({ count: 5000 }, { fabricCount: 14 });
    const blend = calc.threadKeyUsage({ count: 5000, type: 'blend' }, { fabricCount: 14 });
    expect(blend.strands).toEqual([1, 1]);
    expect(blend.skeins).toEqual([expect.closeTo(1.5875, 6), expect.closeTo(1.5875, 6)]);
    expect(blend.skeins[0]).toBeCloseTo(solid.skeins[0] / 2, 1);
    expect(blend.toBuy).toEqual([2, 2]);
  });

  test('the fabric count on the project changes the amount', () => {
    expect(calc.threadKeyUsage({ count: 900 }, { fabricCount: 18 }).skeins).toEqual([expect.closeTo(0.4445, 6)]);
    expect(calc.threadKeyUsage({ count: 900 }, { fabricCount: 11 }).skeins[0]).toBeGreaterThan(0.5715);
  });

  test('a brand\'s own skein length is used: a 10 m Madeira skein goes further than an 8 m DMC one', () => {
    const dmc = calc.threadKeyUsage({ count: 900, brand: 'dmc' }, { fabricCount: 14, wasteFactor: 0.2 });
    const madeira = calc.threadKeyUsage({ count: 900, brand: 'Madeira' }, { fabricCount: 14, wasteFactor: 0.2 });
    expect(dmc.skeins).toEqual([expect.closeTo(0.5715, 6)]);
    expect(madeira.skeins).toEqual([expect.closeTo(0.4572, 6)]);
    expect(calc.threadKeyUsage({ count: 900, brand: 'madeira' }, { fabricCount: 14 }).skeins).toEqual([expect.closeTo(0.4572, 6)]);
    expect(calc.threadKeyUsage({ count: 900, brand: 'anchor' }, { fabricCount: 14 }).skeins).toEqual([expect.closeTo(0.5715, 6)]);
    // An explicit length wins, as the Manager passes its own.
    expect(calc.threadKeyUsage({ count: 900, brand: 'dmc' }, { fabricCount: 14, skeinLengthM: 10 }).skeins).toEqual([expect.closeTo(0.4572, 6)]);
    expect(calc.threadKeyUsage({ count: 900, type: 'blend', brand: 'Madeira' }, { fabricCount: 14 }).skeins).toEqual([expect.closeTo(0.2286, 6), expect.closeTo(0.2286, 6)]);
    expect(calc.skeinLengthForBrand('Cosmo')).toBe(8);
    expect(calc.skeinLengthForBrand('unknown')).toBe(8);
    expect(calc.skeinLengthForBrand(undefined)).toBe(8);
  });

  test('the Manager hands its brand skein length to the key usage', () => {
    expect(read('manager-app.js')).toMatch(/skeinLengthM:\s*skeinLengthForBrand\(t\.brand \|\| settings\.threadBrand\)/);
  });

  test('an uneven blend ratio sets the strands of each thread', () => {
    const u = calc.threadKeyUsage({ count: 900, type: 'blend', blendRatio: [1, 2] }, { fabricCount: 14 });
    expect(u.strands).toEqual([1, 2]);
    expect(u.skeins[1]).toBeCloseTo(u.skeins[0] * 2, 1);
  });

  test('a blend recorded by id alone, or as a library thread, is still a blend', () => {
    expect(calc.threadKeyUsage({ id: '341+826', count: 100 }).isBlend).toBe(true);
    expect(calc.threadKeyUsage({ id: '341', is_blended: true, blend_id: '826', count: 100 }).isBlend).toBe(true);
  });

  test('a symbol with stitches never reads as zero; one without says so', () => {
    expect(calc.threadKeyUsage({ count: 3, type: 'blend' }).skeins[0]).toBeGreaterThan(0);
    expect(calc.threadUsageText(calc.threadKeyUsage({ count: 3, type: 'blend' }))).toBe('1 strand of each · under 0.1 skein each');
    expect(calc.threadUsageText(calc.threadKeyUsage({ count: 0 }))).toBe('2 strands · 0 skeins');
  });

  test('bad input falls back to the defaults rather than "NaN skeins"', () => {
    const u = calc.threadKeyUsage({ count: 'many' }, { fabricCount: -4, strandsUsed: 0 });
    expect(u.strands).toEqual([2]);
    expect(u.skeins).toEqual([0]);
    expect(calc.threadUsageText(null)).toBe('');
  });

  test('skeins are written as a stitcher says them', () => {
    expect(calc.formatSkeins(1)).toBe('1 skein');
    expect(calc.formatSkeins(0.96)).toBe('1 skein');
    expect(calc.formatSkeins(1.3)).toBe('1.3 skeins');
    expect(calc.formatSkeins(2)).toBe('2 skeins');
    expect(calc.formatSkeins(45.26)).toBe('45.3 skeins');
    expect(calc.formatSkeins(0.03)).toBe('under 0.1 skein');
    expect(calc.formatSkeins(0)).toBe('0 skeins');
  });

  test('the usage line and the full tooltip', () => {
    const solid = calc.threadKeyUsage({ count: 900 }, { fabricCount: 14 });
    const blend = calc.threadKeyUsage({ count: 900, type: 'blend' }, { fabricCount: 14 });
    expect(calc.threadUsageText(solid)).toBe('2 strands · 0.6 skeins');
    expect(calc.threadUsageText(blend)).toBe('1 strand of each · 0.3 skeins each');
    expect(calc.threadUsageTitle(solid)).toBe('2 strands in the needle; about 0.6 skeins of thread (from scratch: buy 1)');
    expect(calc.threadUsageTitle(blend)).toBe('One strand of each thread in the needle; about 0.3 skeins of each thread');
    expect(calc.threadUsageParts(blend)).toEqual({ strands: '1 strand of each', skeins: '0.3 skeins each' });
  });
});

describe('threadKeyRow: one key row as plain strings', () => {
  test('a solid', () => {
    expect(keyRow(PATTERN[0], { fabricCount: 14 })).toEqual({
      label: 'DMC 3799 Pewter Very Dark',
      id: 'DMC 3799',
      name: 'Pewter Very Dark',
      isBlend: false,
      title: 'DMC 3799 Pewter Very Dark',
      usage: '2 strands · 0.6 skeins',
      usageTitle: '2 strands in the needle; about 0.6 skeins of thread (from scratch: buy 1)'
    });
  });

  test('a blend', () => {
    expect(keyRow(PATTERN[1], { fabricCount: 14 })).toEqual({
      label: 'DMC 341 + 826 (blend)',
      id: 'DMC 341 + 826',
      name: 'Blue Violet Light + Blue Medium',
      isBlend: true,
      title: 'DMC 341 Blue Violet Light + DMC 826 Blue Medium (blend: one strand of each thread)',
      usage: '1 strand of each · 0.3 skeins each',
      usageTitle: 'One strand of each thread in the needle; about 0.3 skeins of each thread'
    });
  });

  test('an Anchor thread keeps its brand', () => {
    const r = keyRow(PATTERN[3], { fabricCount: 14 });
    expect(r.label).toBe('Anchor 403 Black');
    expect(r.id).toBe('Anchor 403');
    expect(r.usage).toBe('2 strands · under 0.1 skein');
  });

  test('a long catalogue name is whole in the row', () => {
    const r = keyRow(PATTERN[2], { fabricCount: 14 });
    expect(r.label).toBe('DMC 3802 Antique Mauve Very Dark');
    expect(r.usage).toBe('2 strands · 3.2 skeins');
  });

  test('nothing gives null', () => {
    expect(keyRow(null)).toBeNull();
  });
});

describe('the key row, rendered (snapshot-style)', () => {
  test('a solid on the Creator Palette tab', () => {
    expect(html(keyRow(PATTERN[0], { fabricCount: 14 }), PAL_ROW)).toBe(
      '<span class="pal-row__label">' +
      '<span class="pal-row__id">DMC 3799</span>' +
      '<span class="pal-row__name">Pewter Very Dark</span>' +
      '<span class="pal-row__use" title="2 strands in the needle; about 0.6 skeins of thread (from scratch: buy 1)">2 strands · 0.6 skeins</span>' +
      '</span>');
  });

  test('a blend on the Creator Palette tab says blend once and names both threads', () => {
    expect(html(keyRow(PATTERN[1], { fabricCount: 14 }), PAL_ROW)).toBe(
      '<span class="pal-row__label">' +
      '<span class="pal-row__id">DMC 341 + 826 <span class="pal-row__tag">blend</span></span>' +
      '<span class="pal-row__name">Blue Violet Light + Blue Medium</span>' +
      '<span class="pal-row__use" title="One strand of each thread in the needle; about 0.3 skeins of each thread">1 strand of each · 0.3 skeins each</span>' +
      '</span>');
  });

  test('the Tracker colour list uses its own classes and the same words', () => {
    expect(html(keyRow(PATTERN[1], { fabricCount: 14 }), TILE_ROW)).toBe(
      '<span class="ppal-tile-text">' +
      '<span class="ppal-tile-id">DMC 341 + 826 <span class="ppal-tile-tag">blend</span></span>' +
      '<span class="ppal-tile-name">Blue Violet Light + Blue Medium</span>' +
      '<span class="ppal-tile-use" title="One strand of each thread in the needle; about 0.3 skeins of each thread">1 strand of each · 0.3 skeins each</span>' +
      '</span>');
  });

  test('a row with no name has no empty name element', () => {
    const out = html(keyRow({ id: 'U1', count: 10 }, { fabricCount: 14 }), PAL_ROW);
    expect(out).not.toContain('pal-row__name');
    expect(out).toContain('DMC U1');
  });

  test('a missing row renders nothing', () => {
    expect(renderToStaticMarkup(React.createElement(components.ThreadKeyLabel, { row: null, classes: PAL_ROW }))).toBe('');
  });
});

describe('the same pattern reads the same on the Creator, the Tracker and the Manager', () => {
  // The Manager's pattern library holds a project's threads as { id, name, qty, brand }; a project's blend arrives as
  // its combined id (manager-app.js buildAutoSyncedPattern).
  const asLibraryThread = (p) => ({ id: p.id, name: p.name, qty: p.count, unit: 'stitches', brand: p.brand === 'anchor' ? 'Anchor' : 'DMC' });

  test.each(PATTERN.map((p) => [p.id, p]))('%s', (_id, entry) => {
    const row = keyRow(entry, { fabricCount: 14 });
    const creator = text(html(row, PAL_ROW));
    const tracker = text(html(row, TILE_ROW));
    expect(tracker).toBe(creator);
    // The label the Manager prints is the same words as the key row's label.
    expect(cat.formatThread(asLibraryThread(entry))).toBe(row.label);
    // The key row is that label split in two: the id (and the word blend), then the name.
    const rebuilt = row.isBlend ? row.id + ' (blend)' : (row.id + ' ' + row.name).trim();
    expect(rebuilt).toBe(row.label);
    // And the strands and skeins follow in the same row.
    expect(creator).toContain(row.usage);
  });

  test('the Manager shows the strands and skeins with the same figures', () => {
    const lib = asLibraryThread(PATTERN[1]);
    const u = calc.threadKeyUsage({ ...lib, count: lib.qty }, { fabricCount: 14, strandsUsed: 2, wasteFactor: 0.2 });
    expect(calc.threadUsageText(u)).toBe(keyRow(PATTERN[1], { fabricCount: 14 }).usage);
  });
});

// toMatch on a whole source file prints the whole file when it fails; these say only true or false.
const has = (src, re) => re.test(src);

describe('the surfaces use the one label', () => {
  const creatorSrc = read('creator/Sidebar.js');
  const trackerSrc = read('tracker-app.js');
  const managerSrc = read('manager-app.js');
  const legendSrc = read('creator/LegendTab.js');
  const homeSrc = read('home-app.js');
  const css = read('styles.css');

  test('the Creator Palette tab and the Tracker colour list render ThreadKeyLabel from threadKeyRow', () => {
    expect(has(creatorSrc, /window\.threadKeyRow\(p, \{ fabricCount: fabricCtForStash \}\)/)).toBe(true);
    expect(has(creatorSrc, /h\(window\.ThreadKeyLabel, \{row: keyRow, classes: PAL_ROW_CLASSES\}\)/)).toBe(true);
    expect(has(trackerSrc, /threadKeyRow\(p,\{fabricCount:fabricCt\}\)/)).toBe(true);
    expect(has(trackerSrc, /<ThreadKeyLabel row=\{kr\} classes=\{TILE_KEY_CLASSES\}\/>/)).toBe(true);
  });

  test('the Materials thread list, the Manager and Home\'s practice pattern use formatThread', () => {
    expect(has(legendSrc, /window\.threadKeyRow\(p, \{ fabricCount: fabricCt \}\)/)).toBe(true);
    expect(has(managerSrc, /const label = formatThread\(t\);/)).toBe(true);
    expect(has(managerSrc, /`DMC \$\{t\.id\}/)).toBe(false);
    // Home no longer lists stash threads (that is the Stash Manager's job); the practice pattern names its threads.
    expect(has(homeSrc, /window\.formatThread\(t\)/)).toBe(true);
  });

  test('the Tracker status bar and active tile use the formatter', () => {
    expect(has(trackerSrc, /text\+="[^"]*"\+formatThread\(\(cmap&&cmap\[info\.id\]\)\|\|info\);/)).toBe(true);
    expect(has(trackerSrc, /formatThread\(fc,\{variant:"title"\}\)/)).toBe(true);
    expect(has(trackerSrc, /threads\[0\]\.name\+"\+"\+[a-zA-Z.]*threads\[1\]\.name/)).toBe(false);
  });

  test('the Tracker sort button is called Number, not "DMC ID"', () => {
    expect(has(trackerSrc, /\["id","Number"\]/)).toBe(true);
    expect(has(trackerSrc, /ID"\]\]\.map/)).toBe(false);
  });

  test('key names wrap instead of truncating', () => {
    const rule = (sel) => (css.match(new RegExp('\\n' + sel.replace(/[.]/g, '\\.') + '\\s*\\{[^}]*\\}')) || [''])[0];
    ['.pal-row__name', '.ppal-tile-name', '.ppal-active-name', '.pal-pick-row__name'].forEach((sel) => {
      const r = rule(sel);
      expect(r).not.toBe('');
      expect(r).not.toMatch(/text-overflow:\s*ellipsis/);
      expect(r).not.toMatch(/white-space:\s*nowrap/);
      expect(r).toMatch(/overflow-wrap:\s*anywhere/);
    });
  });
});

describe('"What\'s a blend?" under a key', () => {
  const Note = components.BlendHelpNote;

  test('it is a button that opens a plain-language note', () => {
    const closed = renderToStaticMarkup(React.createElement(Note, null));
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).toContain("What&#x27;s a blend?");
    expect(closed).not.toContain('one strand of each thread');
  });

  test('both keys and the Convert panel mount it only when it applies', () => {
    expect(has(read('creator/Sidebar.js'), /window\.BlendHelpNote && window\.creatorThreadCounts\(displayPal\)\.blends > 0/)).toBe(true);
    expect(has(read('tracker-app.js'), /pal\.some\(p=>p\.type==="blend"\)&&<div className="ppal-blend-note">/)).toBe(true);
    expect(has(read('creator/ConvertPanel.js'), /h\(window\.BlendHelpNote, \{ showSetting: false \}\)/)).toBe(true);
  });
});
