/* tests/uniqueChartSymbols.test.js — a chart never reuses a symbol, and the
 * symbol on screen is the glyph the printed PDF uses for the same thread
 * (audit UX-001, UX-002, UX-005).
 *
 * Runs the real colour-utils.js buildPalette in a VM with the real thread
 * catalogue, the PDF's symbol font spec and PdfChartLayout (read-only: the PDF
 * files themselves are untouched), and symbol-glyphs.js.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const quiet = { log() {}, warn() {}, info() {}, error() {} };
const ctx = { console: quiet, addEventListener() {}, removeEventListener() {},
  document: { createElement: () => ({ getContext: () => null }) } };
ctx.window = ctx;
vm.createContext(ctx);
['constants.js', 'dmc-data.js', 'anchor-data.js', 'helpers.js', 'creator/symbolFontSpec.js', 'creator/pdfChartLayout.js', 'symbol-glyphs.js', 'colour-utils.js', 'creator/paletteTools.js']
  .forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
const run = (code) => vm.runInContext(code, ctx);
const spec = require('../creator/symbolFontSpec');
const layout = require('../creator/pdfChartLayout');
const { DMC } = require('../dmc-data.js');

const SOLIDS = DMC.filter((d) => /^\d+$/.test(d.id));
const ID0 = SOLIDS[0].id, ID1 = SOLIDS[1].id;
const glyph = (cp) => String.fromCodePoint(cp);

// n distinct DMC solids, plus blends once n passes the solids we want, with
// strictly decreasing stitch counts so the order is predictable.
function cells(n, opts) {
  const o = opts || {};
  const out = [];
  const solids = SOLIDS.slice(0, n);
  solids.forEach((d, i) => {
    const c = { id: d.id, type: 'solid', name: d.name, rgb: d.rgb, lab: d.lab };
    if (o.carry && o.carry[d.id]) c.symbol = o.carry[d.id];
    for (let k = 0; k < n - i; k++) out.push(c);
  });
  return out;
}
function blendCells(count, startCount) {
  const out = [];
  for (let i = 0; i < count; i++) {
    const a = DMC[i * 2], b = DMC[i * 2 + 1];
    const c = { id: a.id + '+' + b.id, type: 'blend', name: a.name + ' + ' + b.name, rgb: a.rgb, lab: a.lab,
      threads: [{ id: a.id }, { id: b.id }] };
    out.push(c);
  }
  return out;
}
const build = (pat) => { ctx.__pat = pat; return run('buildPalette(__pat)'); };
const symbolsOf = (r) => r.pal.map((p) => p.symbol);

describe('buildPalette never reuses a symbol', () => {
  test.each([43, 71, 112])('%i palette entries get %i different symbols', (n) => {
    const syms = symbolsOf(build(cells(n)));
    expect(syms).toHaveLength(n);
    expect(new Set(syms).size).toBe(n);
  });

  test('blends count as palette entries too (40 threads with blends -> 71 symbols)', () => {
    const solids = cells(40);
    const pat = solids.concat(blendCells(31));
    const r = build(pat);
    expect(r.pal).toHaveLength(71);
    expect(new Set(symbolsOf(r)).size).toBe(71);
  });

  test('every symbol up to the font capacity comes from the PDF symbol font', () => {
    const syms = symbolsOf(build(cells(112)));
    const fontChars = new Set(spec.glyphs.map((g) => glyph(g.codepoint)));
    syms.forEach((s) => expect(fontChars.has(s)).toBe(true));
  });

  test('past the font capacity symbols are still unique and the overflow is reported', () => {
    const r = build(cells(120));
    expect(new Set(symbolsOf(r)).size).toBe(120);
    expect(r.symbolOverflow).toBe(120 - spec.glyphs.length);
  });

  test('within capacity nothing is flagged as overflow', () => {
    expect(build(cells(112)).symbolOverflow || 0).toBe(0);
  });
});

describe('user-chosen symbols are still respected', () => {
  test('a symbol carried on a thread\'s cells is kept, and nobody else gets it', () => {
    const star = '★';
    const pat = cells(20, { carry: { [ID0]: star } });
    const r = build(pat);
    expect(r.cmap[ID0].symbol).toBe(star);
    expect(new Set(symbolsOf(r)).size).toBe(20);
  });

  test('a carried font glyph is not also handed to the thread whose PDF glyph it is', () => {
    const first = glyph(spec.glyphs[0].codepoint);
    const pat = cells(20, { carry: { [ID1]: first } });
    const r = build(pat);
    expect(r.cmap[ID1].symbol).toBe(first);
    expect(new Set(symbolsOf(r)).size).toBe(20);
  });

  test('two threads carrying the same symbol: the one with more stitches keeps it', () => {
    const star = '★';
    // cells() gives the first thread the most stitches.
    const pat = cells(10, { carry: { [ID0]: star, [ID1]: star } });
    const r = build(pat);
    const keeper = ID0, loser = ID1;
    expect(r.cmap[keeper].symbol).toBe(star);
    expect(r.cmap[loser].symbol).not.toBe(star);
    expect(new Set(symbolsOf(r)).size).toBe(10);
  });
});

describe('symbols buildPalette handed out are not mistaken for choices', () => {
  // Conversion copies palette entries from one pass into the cells of the next
  // (orphan clean-up, thread migration), so cells carry symbols from a palette
  // with different threads in it. Those must not stick.
  test('cells made from an earlier palette\'s entries still get the PDF symbols', () => {
    const early = build(cells(30));
    // Later pass: some threads gone, so every PDF rank moves; cells are the early entries.
    const kept = early.pal.filter((p, i) => i % 3 !== 0);
    const pat = [];
    kept.forEach((e) => { for (let k = 0; k < e.count; k++) pat.push(e); });
    const later = build(pat);
    const used = Object.fromEntries(later.pal.map((p) => [p.id, 1]));
    const pdf = layout.buildCodepointMap(later.pal, spec, used);
    later.pal.forEach((p) => expect(p.symbol).toBe(glyph(pdf.map[p.id])));
  });

  test('a symbol chosen with Change symbol (stamped on the cells) survives that rebuild', () => {
    const early = build(cells(10));
    const chosen = early.pal[3];
    ctx.__cells = cells(10); ctx.__id = chosen.id;
    const stamped = run('PaletteTools.stampSymbol(__cells, __id, "\u2605")');
    // Mix in cells copied from the early palette's entries, as painting does.
    const mixed = stamped.concat(early.pal.filter((p) => p.id !== chosen.id));
    expect(build(mixed).cmap[chosen.id].symbol).toBe('\u2605');
  });
});

describe('screen and PDF show the same glyph for a thread', () => {
  test.each([5, 43, 71, 112])('%i threads: palette symbol === PDF code point', (n) => {
    const pat = n > 40 ? cells(40).concat(blendCells(n - 40)) : cells(n);
    const r = build(pat);
    const used = Object.fromEntries(r.pal.map((p) => [p.id, 1]));
    const pdf = layout.buildCodepointMap(r.pal, spec, used);
    r.pal.forEach((p) => expect(p.symbol).toBe(glyph(pdf.map[p.id])));
  });

  test('the screen symbol does not depend on how many stitches a thread has', () => {
    const a = build(cells(30));
    // Same threads, opposite stitch counts.
    const pat = [];
    SOLIDS.slice(0, 30).forEach((d, i) => {
      for (let k = 0; k < i + 1; k++) pat.push({ id: d.id, type: 'solid', name: d.name, rgb: d.rgb, lab: d.lab });
    });
    const b = build(pat);
    a.pal.forEach((p) => expect(b.cmap[p.id].symbol).toBe(p.symbol));
  });

  test('SymbolGlyphs.forPalette exposes the same mapping the PDF uses', () => {
    const r = build(cells(12));
    const used = Object.fromEntries(r.pal.map((p) => [p.id, 1]));
    const pdf = layout.buildCodepointMap(r.pal, spec, used);
    ctx.__pal = r.pal;
    const m = run('SymbolGlyphs.forPalette(__pal)');
    Object.keys(pdf.map).forEach((id) => expect(m[id]).toBe(glyph(pdf.map[id])));
  });
});

describe('saved projects with repeated symbols are repaired on load', () => {
  // A project saved by the old build: 71 colours, so the auto symbols repeated
  // (they are not saved), and two colours' chosen symbols collided.
  function savedProject() {
    const solids = SOLIDS.slice(0, 71);
    const pattern = [];
    const done = [];
    solids.forEach((d, i) => {
      for (let k = 0; k < 71 - i; k++) { pattern.push({ id: d.id, type: 'solid' }); done.push(k % 3 === 0 ? 1 : 0); }
    });
    return {
      version: 11, id: 'proj_1', page: 'creator', name: 'Old picture',
      settings: { sW: pattern.length, sH: 1, fabricCt: 14 },
      pattern, done,
      // The first two threads both chose the heart; the third chose the star.
      symbols: { [ID0]: '♥', [ID1]: '♥', [SOLIDS[2].id]: '★' },
    };
  }

  function load(project) {
    ctx.__project = project;
    return run(`(function () {
      var restored = __project.pattern.map(function (m) { return restoreStitch(m, 'dmc'); });
      restored = applySavedSymbols(restored, __project.symbols);
      return buildPalette(restored);
    })()`);
  }

  test('every colour ends up with its own symbol', () => {
    const r = load(savedProject());
    expect(r.pal).toHaveLength(71);
    expect(new Set(symbolsOf(r)).size).toBe(71);
  });

  test('a unique chosen symbol is kept; only the duplicate is reassigned', () => {
    const r = load(savedProject());
    expect(r.cmap[SOLIDS[2].id].symbol).toBe('★');
    // The first thread has more stitches, so it keeps the heart and the second moves.
    expect(r.cmap[ID0].symbol).toBe('♥');
    expect(r.cmap[ID1].symbol).not.toBe('♥');
  });

  test('loading never touches the done data', () => {
    const project = savedProject();
    const before = project.done.slice();
    load(project);
    expect(project.done).toEqual(before);
  });

  test('a project with no saved symbols loads with the PDF symbols', () => {
    const project = savedProject();
    delete project.symbols;
    const r = load(project);
    const used = Object.fromEntries(r.pal.map((p) => [p.id, 1]));
    const pdf = layout.buildCodepointMap(r.pal, spec, used);
    r.pal.forEach((p) => expect(p.symbol).toBe(glyph(pdf.map[p.id])));
  });
});

describe('symbols for colours that join or linger beside a palette', () => {
  test('dedupeChartSymbols keeps a free symbol and replaces one a palette entry now uses', () => {
    const r = build(cells(5));
    const taken = r.pal[0].symbol;
    ctx.__pal = r.pal;
    ctx.__extras = [{ id: 'x1', symbol: taken, count: 0 }, { id: 'x2', symbol: '★', count: 0 }, { id: 'x3', count: 0 }];
    const out = run('dedupeChartSymbols(__pal, __extras)');
    expect(out[0].symbol).not.toBe(taken);
    expect(out[1].symbol).toBe('★');
    expect(new Set(r.pal.concat(out).map((p) => p.symbol)).size).toBe(8);
    // The inputs are not changed.
    expect(ctx.__extras[0].symbol).toBe(taken);
  });

  test('nextChartSymbol gives a new colour a symbol no entry uses, 112 times over', () => {
    let pal = [];
    for (let i = 0; i < 112; i++) {
      ctx.__pal = pal; ctx.__entry = { id: SOLIDS[i].id, type: 'solid' };
      const s = run('nextChartSymbol(__entry, __pal)');
      expect(pal.some((p) => p.symbol === s)).toBe(false);
      pal = pal.concat([{ id: SOLIDS[i].id, symbol: s }]);
    }
    expect(new Set(pal.map((p) => p.symbol)).size).toBe(112);
  });

  test('freeChartSymbol keeps going past every shape: numbers, never a repeat', () => {
    const claimed = {};
    for (let i = 0; i < 300; i++) {
      ctx.__claimed = claimed;
      const s = run('freeChartSymbol(__claimed)');
      expect(claimed[s]).toBeUndefined();
      claimed[s] = true;
    }
    expect(Object.keys(claimed)).toHaveLength(300);
  });
});

describe('the pages that build or draw a palette have the symbol font and mapping', () => {
  const html = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
  test.each(['create.html', 'index.html', 'stitch.html'])('%s loads the font bytes, PdfChartLayout and symbol-glyphs.js in order', (f) => {
    const h = html(f);
    const at = (s) => h.indexOf('src="' + s + '"');
    expect(at('assets/fonts/CrossStitchSymbols.base64.js')).toBeGreaterThan(-1);
    expect(at('creator/pdfChartLayout.js')).toBeGreaterThan(-1);
    expect(at('symbol-glyphs.js')).toBeGreaterThan(at('assets/fonts/CrossStitchSymbols.base64.js'));
    expect(at('symbol-glyphs.js')).toBeGreaterThan(at('dmc-data.js'));
  });

  test('stitch.html also loads the font spec the mapping needs', () => {
    expect(html('stitch.html')).toMatch(/src="creator\/symbolFontSpec\.js"/);
  });

  test('the generate worker imports the mapping, so its palettes match', () => {
    const w = fs.readFileSync(path.join(ROOT, 'generate-worker.js'), 'utf8');
    expect(w).toMatch(/importScripts\([^)]*symbolFontSpec\.js[^)]*pdfChartLayout\.js[^)]*symbol-glyphs\.js[^)]*colour-utils\.js/);
  });

  test('the symbol picker offers the PDF font glyphs', () => {
    const side = fs.readFileSync(path.join(ROOT, 'creator/Sidebar.js'), 'utf8');
    expect(side).toMatch(/unusedSymbols\(ctx\.pal \|\| list, window\.SymbolGlyphs\.pool\(\)\)/);
  });

  test('the chart canvases draw symbols in the symbol font', () => {
    ['creator/canvasRenderer.js', 'tracker-app.js', 'helpers.js'].forEach((f) => {
      expect(fs.readFileSync(path.join(ROOT, f), 'utf8')).toMatch(/chartSymbolFont\(/);
    });
  });
});

describe('the over-capacity warning', () => {
  const src = fs.readFileSync(path.join(ROOT, 'creator/useCreatorState.js'), 'utf8');
  const fn = src.match(/function symbolLimitWarning[\s\S]*?\n\}/)[0];
  // eslint-disable-next-line no-new-func
  const warn = new Function('window', fn + '; return symbolLimitWarning;')(ctx);

  test('nothing to say at or under the limit', () => {
    expect(warn({ threads: 40, symbols: 112, blends: 72 })).toBe('');
    expect(warn({ threads: 3, symbols: 3, blends: 0 })).toBe('');
  });

  test('over the limit it names the symbols, the limit and what to change', () => {
    const m = warn({ threads: 90, symbols: 140, blends: 50 });
    expect(m).toMatch(/140 symbols/);
    expect(m).toMatch(/112/);
    expect(m).toMatch(/Threads \(max\)/);
  });

  test('Generate and the Palette header use it, keeping the "N threads · M symbols" wording', () => {
    expect(src).toMatch(/var limitMsg = symbolLimitWarning\(tc\)/);
    expect(src).toMatch(/' \\u00B7 ' \+ _threadPlural\(c\.symbols, 'symbol', 'symbols'\)/);
    expect(fs.readFileSync(path.join(ROOT, 'creator/Sidebar.js'), 'utf8')).toMatch(/window\.symbolLimitWarning/);
  });
});
