/* tests/blendsAndConfetti.test.js — blends explained once, confetti counted once (UX-012, UX-013).
 *
 * "Confetti stitches" is the one user-facing term, defined as "single stitches
 * of a colour on their own; slow to stitch", and the count is one number:
 * Ready to stitch, Pattern info and the Convert preview all take it from
 * colour-utils.js. A blend is explained in the same words on the key, the
 * Convert panel, the result toast and the Help glossary.
 */
const fs = require('fs');
const path = require('path');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const ROOT = path.join(__dirname, '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
// toMatch on a whole source file prints the whole file when it fails; these say only true or false.
const has = (src, re) => (typeof re === 'string' ? src.indexOf(re) !== -1 : re.test(src));

const { analyzeConfetti, confettiSummary, labelConnectedComponents } = require('../colour-utils');

const cell = (id, extra) => Object.assign({ id, type: 'solid' }, extra);

describe('confettiSummary: the one confetti count', () => {
  // 4 x 3. A is one block of four; B is a single stitch; C is a pair; D is a single stitch; two cells are empty.
  //   A A B .
  //   A A . C
  //   D . . C
  const A = cell('A'), B = cell('B'), C = cell('C'), D = cell('D'), skip = cell('__skip__'), empty = cell('__empty__');
  const grid = [A, A, B, skip, A, A, empty, C, D, empty, null, C];

  test('confetti stitches are crosses with no same-colour neighbour; pairs and trios are counted apart', () => {
    expect(confettiSummary(grid, 4, 3)).toEqual({ stitches: 2, groups: 2, stitchable: 8, pct: 25 });
  });

  test('it is the same number analyzeConfetti calls singles, whichever way it is computed', () => {
    const safe = grid.map((p) => (p && p.id.indexOf('__') !== 0 ? { id: 'dmc:' + p.id } : { id: '__empty__' }));
    const bfs = analyzeConfetti(safe, 4, 3);
    const fast = analyzeConfetti(safe, 4, 3, labelConnectedComponents(safe, 4, 3));
    expect(confettiSummary(grid, 4, 3).stitches).toBe(bfs.singles);
    expect(fast.singles).toBe(bfs.singles);
  });

  test('the same number on one colour in two brands is two stitches, not one', () => {
    const row = [cell('310', { brand: 'dmc' }), cell('310', { brand: 'anchor' })];
    expect(confettiSummary(row, 2, 1).stitches).toBe(2);
  });

  test('skipped, empty and missing cells are not stitches', () => {
    expect(confettiSummary([skip, empty, null, undefined], 2, 2)).toEqual({ stitches: 0, groups: 0, stitchable: 0, pct: 0 });
  });

  test('a solid area has none', () => {
    expect(confettiSummary(Array.from({ length: 25 }, () => cell('310')), 5, 5)).toEqual({ stitches: 0, groups: 0, stitchable: 25, pct: 0 });
  });

  test('it does not change the chart it reads', () => {
    const copy = JSON.stringify(grid);
    confettiSummary(grid, 4, 3);
    expect(JSON.stringify(grid)).toBe(copy);
  });
});

describe('analyzeConfetti: singles on their own', () => {
  const mk = (id) => ({ id });
  const W = 4, H = 1;
  const mapped = [mk('A'), mk('A'), mk('B'), mk('C')];

  test('colorSingles counts singles only, colorConfetti keeps the small groups too', () => {
    const r = analyzeConfetti(mapped, W, H);
    expect(r.singles).toBe(2);
    expect(r.colorSingles).toEqual({ B: 1, C: 1 });
    expect(r.colorConfetti).toEqual({ A: 2, B: 1, C: 1 });
    expect(r.singlesPct).toBeCloseTo(50, 5);
  });

  test('the precomputed-labels path agrees', () => {
    const slow = analyzeConfetti(mapped, W, H);
    const fast = analyzeConfetti(mapped, W, H, labelConnectedComponents(mapped, W, H));
    expect(fast.colorSingles).toEqual(slow.colorSingles);
    expect(fast.singlesPct).toBeCloseTo(slow.singlesPct, 5);
  });
});

describe('Ready to stitch and Pattern info show the same count', () => {
  const grid = [cell('A'), cell('A'), cell('B'), cell('__skip__'), cell('A'), cell('A'), cell('__empty__'), cell('C'), cell('D'), cell('__empty__'), null, cell('C')];

  function readyReview() {
    const window = {};
    new Function('window', 'React', 'confettiSummary', 'stitchOverFor', read('creator/ReadyReview.js'))(
      window, { createElement() {} }, confettiSummary, () => 1);
    return window.ReadyReview;
  }

  function patternInfo(props) {
    const window = { CONFETTI_HELP: global.CONFETTI_HELP, threadCountsShort: () => '', finishedSizeText: () => '' };
    new Function('window', 'React', read('creator/PatternInfoPopover.js'))(window, React);
    return renderToStaticMarkup(React.createElement(window.CreatorPatternInfoPopover, Object.assign({ open: true, onClose() {} }, props)));
  }

  test('Ready to stitch takes its count from confettiSummary', () => {
    expect(readyReview().metrics(grid, 4, 3).confetti).toEqual(confettiSummary(grid, 4, 3));
  });

  test('Pattern info prints that count with the one definition', () => {
    const out = patternInfo({ sW: 4, sH: 3, totalStitchable: 8, confetti: confettiSummary(grid, 4, 3) });
    expect(out).toContain('Confetti stitches');
    expect(out).toContain('2 (25.0%)');
    expect(out).toContain('Confetti stitches are single stitches of a colour on their own; slow to stitch.');
  });

  test('Pattern info says nothing about confetti when it has no count to show', () => {
    expect(patternInfo({ sW: 4, sH: 3, totalStitchable: 8 })).not.toContain('Confetti');
  });

  test('the Creator takes the difficulty model\'s confetti from the same function', () => {
    const state = read('creator/useCreatorState.js');
    expect(has(state, /confettiSummary\(pat, sW, sH\)/)).toBe(true);
    expect(has(state, /confettiScore: confetti \? confetti\.stitches \/ totalStitchable : undefined/)).toBe(true);
    expect(has(state, /confettiStats: difficultyMetrics\.confetti/)).toBe(true);
  });

  test('the count reaches the popover from both bars', () => {
    expect(has(read('creator-main.js'), /confetti=\{state\.confettiStats\}/)).toBe(true);
    expect(has(read('creator/ActionBar.js'), /confetti: props\.confetti/)).toBe(true);
    expect(has(read('creator/CompactBar.js'), /confetti: props\.confetti/)).toBe(true);
  });

  test('the Ready to stitch text says confetti stitches, with a count and the definition', () => {
    const src = read('creator/ReadyReview.js');
    expect(has(src, /confetti stitches \(' \+ m\.confetti\.pct\.toFixed\(1\)/)).toBe(true);
    expect(has(src, 'window.CONFETTI_HELP.definition')).toBe(true);
    expect(has(src, /isolated full crosses/)).toBe(false);
  });
});

describe('Reduce confetti is the one name', () => {
  const files = ['creator/Sidebar.js', 'creator/ToolStrip.js', 'creator/MagicWandPanel.js', 'creator/PatternTab.js',
    'preferences-modal.js', 'help-drawer.js', 'creator/ImportWizard.js', 'creator/useDenoiseMode.js', 'creator/useCreatorState.js'];

  test('the old names are gone from the app', () => {
    const old = [/Tidy stray stitches/, /Tidy stray/, /Confetti Cleanup/, /Remove Orphans/i, /stray stitches/i, /isolated (full )?(stitch|cross)/i];
    const hits = [];
    files.concat(['creator-main.js', 'creator/ReadyReview.js', 'creator/LegendTab.js', 'creator/PatternInfoPopover.js']).forEach((f) => {
      const src = read(f);
      old.forEach((re) => { if (re.test(src)) hits.push(f + ' ' + re); });
    });
    expect(hits).toEqual([]);
  });

  test('the tool, the Convert slider and the preferences all say Reduce confetti', () => {
    expect(has(read('creator/ToolStrip.js'), '" Reduce confetti"')).toBe(true);
    expect(has(read('creator/Sidebar.js'), 'label:"Reduce confetti"')).toBe(true);
    expect(has(read('creator/Sidebar.js'), '}, "Reduce confetti")')).toBe(true);
    expect(has(read('preferences-modal.js'), 'label: "Reduce confetti"')).toBe(true);
    expect(has(read('creator/MagicWandPanel.js'), '"Reduce confetti in selection"')).toBe(true);
    expect(has(read('help-drawer.js'), 'heading: "Reduce confetti"')).toBe(true);
  });

  test('the term is defined where it first appears', () => {
    const def = 'single stitches of a colour on their own; slow to stitch';
    expect(has(read('helpers.js'), "definition:'" + def + "'")).toBe(true);
    // The Convert slider hint, the Convert preview, the tool tooltip, Pattern info, Ready to stitch and the preferences.
    expect(has(read('creator/Sidebar.js'), 'window.CONFETTI_HELP.definition')).toBe(true);
    expect(has(read('creator-main.js'), 'window.CONFETTI_HELP.definition')).toBe(true);
    expect(has(read('creator/ToolStrip.js'), 'window.CONFETTI_HELP.definition')).toBe(true);
    expect(has(read('creator/PatternInfoPopover.js'), 'confettiDefinition')).toBe(true);
    expect(has(read('creator/ReadyReview.js'), 'window.CONFETTI_HELP.definition')).toBe(true);
    expect(has(read('preferences-modal.js'), def)).toBe(true);
  });

  test('the Convert preview shows singles with their own percentage', () => {
    const main = read('creator-main.js');
    expect(has(main, 'confettiSinglesPct')).toBe(true);
    expect(has(read('creator/usePreview.js'), 'confettiSinglesPct: confettiRaw.singlesPct')).toBe(true);
  });

  test('generation reports "Reducing confetti"', () => {
    expect(has(read('creator/useCreatorState.js'), "label: 'Reducing confetti\\u2026'")).toBe(true);
  });
});

describe('the terminology lint holds the line', () => {
  const lint = require('../scripts/lint-terminology');
  const matches = (term, text) => lint.PLAIN_TERMS.find((r) => r.bad === term).re.test(text);

  test('the whole app is clean', () => {
    expect(lint.lintAll()).toEqual([]);
  });

  test('each old name is caught', () => {
    expect(matches('stray stitches', 'Tidy stray stitches')).toBe(true);
    expect(matches('isolated stitches', 'removes ~12 isolated stitches')).toBe(true);
    expect(matches('isolated stitches', '36 isolated full crosses')).toBe(true);
    expect(matches('orphans', 'try the Remove Orphans slider')).toBe(true);
    expect(matches('Confetti Cleanup', 'Confetti Cleanup in Selection')).toBe(true);
    expect(matches('single stitches', 'Fewer single stitches in blends')).toBe(true);
    expect(matches('Allow blended threads', 'Allow blended threads')).toBe(true);
  });

  test('the definition itself is allowed', () => {
    expect(matches('single stitches', 'Confetti stitches are single stitches of a colour on their own; slow to stitch.')).toBe(false);
    expect(matches('stray stitches', 'Reduce confetti')).toBe(false);
  });

  test('TERMINOLOGY.md records the new names and the old ones to avoid', () => {
    const t = read('TERMINOLOGY.md');
    expect(has(t, /\| Denoise tool \| \*\*Reduce confetti\*\* \|/)).toBe(true);
    expect(has(t, /\| Two-thread mixing in Convert \| \*\*Allow two-thread blends\*\* \|/)).toBe(true);
    expect(has(t, /\| Smooth-dither clean-up \| \*\*Fewer confetti stitches in shading\*\* \|/)).toBe(true);
    expect(has(t, '### One thread label')).toBe(true);
    expect(has(t, '### Confetti stitches')).toBe(true);
    expect(has(t, '**DMC 341 + 826 (blend)**')).toBe(true);
  });
});

describe('blends are explained once, in plain language', () => {
  test('Convert calls the setting Allow two-thread blends and says what it does beside it', () => {
    const side = read('creator/Sidebar.js');
    expect(has(side, 'h("span", null, "Allow two-thread blends")')).toBe(true);
    expect(has(side, 'On: smoother shading, but more chart symbols to follow and two threads in some needles.')).toBe(true);
    expect(has(side, 'Off: every stitch is one thread, so there are fewer symbols, but shading is coarser.')).toBe(true);
    expect(has(side, /Allow blended threads/)).toBe(false);
    expect(has(read('preferences-modal.js'), 'label: "Allow two-thread blends"')).toBe(true);
  });

  test('the setting still defaults to on for photos and off for graphics and pixel art', () => {
    const state = read('creator/useCreatorState.js');
    expect(has(state, /loadUserPref\("creatorAllowBlends", true\)/)).toBe(true);
    expect(has(state, /photo:   \{[^}]*allowBlends: true/)).toBe(true);
    expect(has(state, /graphic: \{[^}]*allowBlends: false/)).toBe(true);
    expect(has(state, /pixel:   \{[^}]*allowBlends: false/)).toBe(true);
    expect(has(read('user-prefs.js'), /creatorAllowBlends:\s*true/)).toBe(true);
  });

  test('the Convert result toast offers What\'s a blend? when the pattern has blends', () => {
    const state = read('creator/useCreatorState.js');
    expect(has(state, /var blendAction = tc\.blends > 0 && typeof openBlendHelp === "function"/)).toBe(true);
    expect(has(state, /\{ label: window\.BLEND_HELP\.title, onClick: openBlendHelp \}/)).toBe(true);
    expect(has(state, /action: blendAction/)).toBe(true);
  });

  test('openBlendHelp opens the glossary at its blends section', () => {
    const open = jest.fn();
    global.window = { HelpDrawer: { open } };
    try {
      global.openBlendHelp();
    } finally { delete global.window; }
    expect(open).toHaveBeenCalledWith({ topic: 'glossary', section: 'Blends and confetti' });
    expect(has(read('help-drawer.js'), 'heading: "Blends and confetti"')).toBe(true);
  });

  test('the glossary and the key say the same thing', () => {
    const help = read('help-drawer.js');
    expect(has(help, /\["What's a blend\?", "A blend is one chart symbol worked with two threads together in the same needle\. Put one strand of each thread in the needle/)).toBe(true);
    expect(global.BLEND_HELP.summary).toBe('A blend is one chart symbol worked with two threads together in the same needle.');
    expect(global.BLEND_HELP.body.startsWith('Put one strand of each thread in the needle')).toBe(true);
    expect(has(help, global.BLEND_HELP.summary + ' Put one strand of each thread in the needle')).toBe(true);
  });

  test('the Palette tab and the Tracker colour list link to the Help glossary from the note', () => {
    expect(has(read('components.js'), /window\.openBlendHelp\) window\.openBlendHelp\(\)/)).toBe(true);
  });
});

describe('the help and the changelog are in step', () => {
  test('the Palette and Tracker help describe the new key', () => {
    const help = read('help-drawer.js');
    expect(has(help, '["Strands and skeins"')).toBe(true);
    expect(has(help, "the strands in the needle and the skeins it takes. Sort by Remaining, % done or Number.")).toBe(true);
  });

  test('the changelog says what changed', () => {
    const v = read('version.js');
    expect(has(v, 'Improved: one thread label and a fuller colour key everywhere.')).toBe(true);
    expect(has(v, 'Tidy stray stitches and Confetti Cleanup are now Reduce confetti')).toBe(true);
  });
});
