/* tests/threadBrand.test.js — a project's thread brand (P4-5, audit IMG-04).
 *
 * A project may say settings.threadBrand: 'anchor'; its cell ids are then
 * Anchor numbers. Projects without it are DMC. This runs the real catalogue
 * and helper files in a VM and checks reading, saving, labels, stash keys,
 * OXS export and the PDF key.
 */
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function load(files) {
  const ctx = { console: { log() {}, warn() {}, error() {}, info() {} } };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.removeEventListener = () => {};
  vm.createContext(ctx);
  files.forEach((f) => vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), ctx, { filename: f }));
  return ctx;
}

const BASE = ['dmc-data.js', 'helpers.js', 'colour-utils.js', 'import-formats.js'];
const withAnchor = load(['dmc-data.js', 'anchor-data.js', 'helpers.js', 'colour-utils.js', 'import-formats.js']);
const dmcOnly = load(BASE);
const run = (ctx, code) => vm.runInContext(code, ctx);

// The first Anchor number that DMC also uses, for a different colour.
const COLLIDING = run(withAnchor, `
  (function () {
    for (var i = 0; i < ANCHOR.length; i++) {
      var d = findThreadInCatalog('dmc', ANCHOR[i].id);
      if (d && (d.rgb[0] !== ANCHOR[i].rgb[0] || d.rgb[1] !== ANCHOR[i].rgb[1] || d.rgb[2] !== ANCHOR[i].rgb[2])) return ANCHOR[i].id;
    }
  })()`);

describe('project brand', () => {
  test('a project without threadBrand is DMC; unknown values are DMC too', () => {
    expect(run(withAnchor, 'projectThreadBrand({settings:{}})')).toBe('dmc');
    expect(run(withAnchor, 'projectThreadBrand({})')).toBe('dmc');
    expect(run(withAnchor, 'projectThreadBrand(null)')).toBe('dmc');
    expect(run(withAnchor, 'projectThreadBrand({settings:{threadBrand:"madeira"}})')).toBe('dmc');
    expect(run(withAnchor, 'projectThreadBrand({settings:{threadBrand:"anchor"}})')).toBe('anchor');
    expect(run(withAnchor, 'projectThreadBrand({settings:{threadBrand:"Anchor"}})')).toBe('anchor');
  });

  test('labels', () => {
    expect(run(withAnchor, 'threadLabel({id:"403", brand:"anchor"})')).toBe('Anchor 403');
    expect(run(withAnchor, 'threadLabel({id:"310"})')).toBe('DMC 310');
    expect(run(withAnchor, 'threadBrandLabel(undefined)')).toBe('DMC');
  });

  test('loadThreadBrand resolves at once for a catalogue that is already loaded', async () => {
    await expect(run(withAnchor, 'loadThreadBrand("anchor")')).resolves.toBeUndefined();
    await expect(run(dmcOnly, 'loadThreadBrand("dmc")')).resolves.toBeUndefined();
  });
});

describe('reading cells', () => {
  test('an id that is in both catalogues reads from the project brand', () => {
    expect(COLLIDING).toBeTruthy();
    const a = run(withAnchor, `restoreStitch({id:${JSON.stringify(COLLIDING)}, type:'solid'}, 'anchor')`);
    const d = run(withAnchor, `restoreStitch({id:${JSON.stringify(COLLIDING)}, type:'solid'})`);
    const anchor = run(withAnchor, `getAnchorById(${JSON.stringify(COLLIDING)})`);
    const dmc = run(withAnchor, `getDmcById(${JSON.stringify(COLLIDING)})`);
    expect(Array.from(a.rgb)).toEqual(Array.from(anchor.rgb));
    expect(a.name).toBe(anchor.name);
    expect(a.brand).toBe('anchor');
    expect(Array.from(d.rgb)).toEqual(Array.from(dmc.rgb));
    expect(d.brand).toBeUndefined();
  });

  test('an index from .map is not a brand', () => {
    const d = run(withAnchor, `[{id:'310', type:'solid'}].map(restoreStitch)[0]`);
    expect(d.name).toBe('Black');
    expect(d.brand).toBeUndefined();
  });

  test('blends of an Anchor project use two Anchor threads', () => {
    const b = run(withAnchor, `restoreStitch({id:'403+46', type:'blend'}, 'anchor')`);
    expect(b.type).toBe('blend');
    expect(b.brand).toBe('anchor');
    expect(b.threads.map((t) => t.id)).toEqual(['403', '46']);
    expect(b.threads.map((t) => t.brand)).toEqual(['anchor', 'anchor']);
    expect(b.threads[1].name).toBe(run(withAnchor, `getAnchorById('46').name`));
  });

  test('buildPalette keeps the brand', () => {
    const pal = run(withAnchor, `buildPalette([restoreStitch({id:'403', type:'solid'}, 'anchor'), restoreStitch({id:'46', type:'solid'}, 'anchor')]).pal`);
    expect(pal.map((p) => p.brand)).toEqual(['anchor', 'anchor']);
  });
});

describe('save and load', () => {
  const ids = ['403', '46', COLLIDING, '403+46'];
  const cells = run(withAnchor, `${JSON.stringify(ids)}.map(function (id) {
    return restoreStitch({ id: id, type: id.indexOf('+') >= 0 ? 'blend' : 'solid' }, 'anchor');
  })`);

  test('Anchor cells keep their rgb on disk; DMC cells are stripped as before', () => {
    const saved = run(withAnchor, `serializePattern(${JSON.stringify(cells)}, 'anchor')`);
    saved.forEach((c, i) => expect(Array.from(c.rgb)).toEqual(Array.from(cells[i].rgb)));
    // The project says Anchor, so the cells don't repeat it.
    saved.forEach((c) => expect(c).not.toHaveProperty('brand'));
    expect(run(withAnchor, `stripCellForSave(restoreStitch({id:'310', type:'solid'}))`)).toEqual({ id: '310', type: 'solid' });
  });

  test('a saved Anchor project reads back as Anchor, with or without the catalogue loaded', () => {
    const saved = JSON.parse(JSON.stringify(run(withAnchor, `serializePattern(${JSON.stringify(cells)}, 'anchor')`)));
    const back = run(withAnchor, `${JSON.stringify(saved)}.map(function (m) { return restoreStitch(m, 'anchor'); })`);
    back.forEach((c, i) => {
      expect(c.id).toBe(cells[i].id);
      expect(Array.from(c.rgb)).toEqual(Array.from(cells[i].rgb));
      expect(c.brand).toBe('anchor');
    });
    // Without anchor-data.js the colours still come back from the cells,
    // and a blend stays a blend (so the next save can't flatten it).
    const noCat = run(dmcOnly, `${JSON.stringify(saved)}.map(function (m) { return restoreStitch(m, 'anchor'); })`);
    noCat.forEach((c, i) => {
      expect(Array.from(c.rgb)).toEqual(Array.from(saved[i].rgb));
      expect(c.type).toBe(saved[i].type);
      expect(c.brand).toBe('anchor');
    });
    expect(noCat[3].threads.map((t) => t.id)).toEqual(['403', '46']);
    const again = run(dmcOnly, `serializePattern(${JSON.stringify(noCat)}, 'anchor')`);
    expect(again[3]).toEqual(saved[3]);
  });

  test('a DMC colour added to an Anchor pattern stays DMC after a save and reload', () => {
    const mixed = run(withAnchor, `[restoreStitch({id:'403', type:'solid'}, 'anchor'), restoreStitch({id:${JSON.stringify(COLLIDING)}, type:'solid'})]`);
    const saved = JSON.parse(JSON.stringify(run(withAnchor, `serializePattern(${JSON.stringify(mixed)}, 'anchor')`)));
    expect(saved[1].brand).toBe('dmc');
    const back = run(withAnchor, `${JSON.stringify(saved)}.map(function (m) { return restoreStitch(m, 'anchor'); })`);
    expect(back[0].brand).toBe('anchor');
    expect(back[1].brand).toBeUndefined();
    expect(back[1].name).toBe(run(withAnchor, `getDmcById(${JSON.stringify(COLLIDING)}).name`));
  });

  test('an Anchor colour in a DMC pattern (a mixed Adapt copy) stays Anchor', () => {
    const mixed = run(withAnchor, `[restoreStitch({id:'310', type:'solid'}), restoreStitch({id:${JSON.stringify(COLLIDING)}, type:'solid'}, 'anchor')]`);
    const saved = JSON.parse(JSON.stringify(run(withAnchor, `serializePattern(${JSON.stringify(mixed)})`)));
    expect(saved[0]).toEqual({ id: '310', type: 'solid' });
    expect(saved[1].brand).toBe('anchor');
    const back = run(withAnchor, `${JSON.stringify(saved)}.map(function (m) { return restoreStitch(m); })`);
    expect(back[1].brand).toBe('anchor');
    expect(back[1].name).toBe(run(withAnchor, `getAnchorById(${JSON.stringify(COLLIDING)}).name`));
  });

  test('the save memo is per brand', () => {
    const r = run(withAnchor, `(function () {
      var pat = [restoreStitch({id:'310', type:'solid'})];
      var a = serializePattern(pat), b = serializePattern(pat, 'anchor');
      return [a === serializePattern(pat), a[0].brand, b[0].brand];
    })()`);
    expect(r).toEqual([false, undefined, 'dmc']);
  });

  test('a project file keeps settings.threadBrand through JSON', () => {
    const project = { version: 11, settings: { sW: 2, sH: 2, threadBrand: 'anchor' }, pattern: [] };
    const back = JSON.parse(JSON.stringify(project));
    expect(run(withAnchor, `projectThreadBrand(${JSON.stringify(back)})`)).toBe('anchor');
  });
});

describe('stash keys', () => {
  test('Stash Manager library threads key by their brand', () => {
    expect(run(withAnchor, `libraryThreadKey({id:'403', brand:'Anchor'})`)).toBe('anchor:403');
    expect(run(withAnchor, `libraryThreadKey({id:'310', brand:'DMC'})`)).toBe('dmc:310');
    expect(run(withAnchor, `libraryThreadKey({id:'310'})`)).toBe('dmc:310');
    expect(run(withAnchor, `libraryThreadKey({id:'anchor:403', brand:'DMC'})`)).toBe('anchor:403');
  });

  test('materials rows for an Anchor palette match anchor: stash keys', () => {
    const src = fs.readFileSync(path.join(ROOT, 'creator/useCreatorState.js'), 'utf8');
    const start = src.indexOf('window.buildThreadShoppingRows = function');
    const end = src.indexOf('\n};\n', start) + 3;
    const win = {};
    // eslint-disable-next-line no-new-func
    new Function('window', 'stitchesToSkeins', 'threadKey', 'findThreadInCatalog', 'stashEffectiveQty', src.slice(start, end))(
      win, null, (b, id) => b + ':' + id, () => null, (e) => (e ? e.owned || 0 : 0));
    const pal = run(withAnchor, `buildPalette([restoreStitch({id:'403', type:'solid'}, 'anchor')]).pal`);
    const rows = win.buildThreadShoppingRows(pal, { fabricCt: 14, stash: { 'anchor:403': { owned: 5 }, 'dmc:403': { owned: 0 } } });
    expect(rows).toHaveLength(1);
    expect(rows[0].key).toBe('anchor:403');
    expect(rows[0].owned).toBe(5);
  });
});

describe('OXS export', () => {
  const cell = (id, rgb, brand) => Object.assign({ id, type: 'solid', rgb }, brand ? { brand } : {});
  test('Anchor threads are written "Anchor 403"', () => {
    const { xml } = run(withAnchor, `generateOXS({ w: 2, h: 1, pattern: ${JSON.stringify([cell('403', [0, 0, 0], 'anchor'), cell('46', [200, 0, 0], 'anchor')])}, bsLines: [] })`);
    expect(xml).toContain('number="Anchor 403"');
    expect(xml).toContain('number="Anchor 46"');
  });
  test('a DMC pattern is unchanged, and Anchor 403 and DMC 403-like ids stay apart', () => {
    const { xml } = run(withAnchor, `generateOXS({ w: 1, h: 1, pattern: ${JSON.stringify([cell('310', [0, 0, 0])])}, bsLines: [] })`);
    expect(xml).toContain('number="310"');
    const mixed = run(withAnchor, `generateOXS({ w: 2, h: 1, pattern: ${JSON.stringify([cell('10', [1, 1, 1], 'anchor'), cell('10', [2, 2, 2])])}, bsLines: [] })`).xml;
    expect(mixed).toContain('number="Anchor 10"');
    expect(mixed).toContain('number="10"');
    expect(mixed).toMatch(/<stitch x="1" y="0" palindex="2"/); // index 0 is cloth
  });
});

describe('PDF key', () => {
  const ctx = { console, self: null, postMessage() {}, importScripts() {} };
  ctx.self = ctx;
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'pdf-export-worker.js'), 'utf8'), ctx, { filename: 'pdf-export-worker.js' });

  test('labels Anchor entries Anchor and leaves DMC entries as they were', () => {
    expect(ctx.brandLabel({ id: '403', brand: 'anchor', type: 'solid' })).toBe('Anchor 403');
    expect(ctx.brandLabel({ id: '403+46', brand: 'anchor', type: 'blend', threads: [{ id: '403' }, { id: '46' }] })).toBe('Anchor 403 + 46');
    expect(ctx.brandLabel({ id: '310', type: 'solid' })).toBe('DMC 310');
    expect(ctx.brandLabel({ id: '310+550', type: 'blend', threads: [{ id: '310' }, { id: '550' }] })).toBe('DMC 310 + 550');
  });

  test('the export project carries brand only for another brand', () => {
    const pctx = { console };
    pctx.window = pctx;
    vm.createContext(pctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'creator/pdfExport.js'), 'utf8'), pctx, { filename: 'pdfExport.js' });
    const build = pctx.PdfExport.buildExportProject;
    const pal = [{ id: '403', name: 'Black', rgb: [0, 0, 0], type: 'solid', brand: 'anchor' }];
    expect(build({ pal, pat: [] }).palette[0].brand).toBe('anchor');
    const dmc = build({ pal: [{ id: '310', name: 'Black', rgb: [0, 0, 0], type: 'solid' }], pat: [] }).palette[0];
    expect(Object.keys(dmc)).toEqual(['id', 'name', 'rgb', 'type', 'threads']);
  });
});

describe('Adapt to brand', () => {
  const actx = { React: { useState() {}, useEffect() {}, useMemo() {}, useRef() {}, useCallback() {}, createElement() {} } };
  actx.window = actx;
  vm.createContext(actx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'creator/AdaptModal.js'), 'utf8'), actx, { filename: 'AdaptModal.js' });
  const brandOf = actx.AdaptModal.patternBrand;

  test('a pattern now all in Anchor threads is saved as an Anchor project; a mix is not', () => {
    const a = (id) => ({ id, type: 'solid', brand: 'anchor' });
    expect(brandOf([a('403'), { id: '__empty__' }, a('46')])).toBe('anchor');
    expect(brandOf([a('403'), { id: '310', type: 'solid' }])).toBeNull();
    expect(brandOf([{ id: '403+46', type: 'blend', threads: [{ id: '403', brand: 'anchor' }, { id: '46', brand: 'anchor' }] }])).toBe('anchor');
    expect(brandOf([{ id: '310', type: 'solid' }])).toBe('dmc');
  });
});
