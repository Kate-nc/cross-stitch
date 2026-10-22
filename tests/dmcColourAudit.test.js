const fs = require('fs');
const vm = require('vm');
const crypto = require('crypto');
const { validateCatalogue, VERIFIED } = require('../scripts/update-dmc-colours');
const { DMC, DMC_FAM, rgbToLab, rgbToOklab } = require('../dmc-data');
global.rgbToLab = rgbToLab;
const picker = require('../import-engine/ui/threadPicker');
const raw = JSON.parse(fs.readFileSync('dmc-data.js', 'utf8').match(/const DMC_RAW=(\[.*?\]);/s)[1]);
const ctx = { console, addEventListener() {}, removeEventListener() {} };
ctx.window = ctx;
vm.createContext(ctx);
['dmc-data.js', 'anchor-data.js', 'helpers.js', 'colour-utils.js'].forEach(file =>
  vm.runInContext(fs.readFileSync(file, 'utf8'), ctx, { filename: file }));
const run = code => vm.runInContext(code, ctx);

it('retains all 525 string IDs, leading zeros, names and order with valid RGB', () => {
  expect(validateCatalogue(raw)).toBe(525);
  expect(crypto.createHash('sha256').update(JSON.stringify(raw.map(r => r.slice(0, 2)))).digest('hex'))
    .toBe('99f285414453dbe2e9f80cf3c0bf793c4b13c0eba03c0408698adb090d681029');
  for (let i = 1; i <= 9; i++) expect(DMC.some(t => t.id === '0' + i)).toBe(true);
  const ids = new Set(DMC.map(t => t.id));
  for (const family of Object.values(DMC_FAM)) for (const id of family) expect(ids.has(id)).toBe(true);
});

it('rejects invalid channels, duplicates, missing entries and changed identities', () => {
  const bad = mutation => { const rows = raw.map(r => [...r]); mutation(rows); expect(() => validateCatalogue(rows)).toThrow(); };
  for (const v of [-1, 256, NaN, 1.5, '100']) bad(rows => { rows[0][2] = v; });
  bad(rows => rows.push(rows[0]));
  bad(rows => rows.pop());
  bad(rows => { rows[3][0] = 1; });
  bad(rows => { rows[0][1] = 'Renamed'; });
});

it('rebuilds finite Lab/OKLab for every catalogue entry from current RGB', () => {
  run('_labCache.clear(); _oklabCache.clear();');
  for (const t of DMC) {
    expect(t.lab.every(Number.isFinite)).toBe(true);
    expect(t.oklab.every(Number.isFinite)).toBe(true);
    expect(t.lab).toEqual(run(`rgbToLab(...${JSON.stringify(t.rgb)})`));
    expect(t.oklab).toEqual(run(`rgbToOklab(...${JSON.stringify(t.rgb)})`));
  }
  expect(rgbToLab(0, 0, 0)).toEqual([0, 0, 0]);
  expect(rgbToLab(255, 255, 255)[0]).toBeCloseTo(100, 4);
});

it('does not alias fractional imported RGB to cached integer RGB', () => {
  for (const fn of [rgbToLab, rgbToOklab]) {
    const integer = fn(51, 131, 98);
    const fractional = fn(51.5, 131, 98);
    expect(fractional).not.toEqual(integer);
    expect(fn(51, 131, 98)).toEqual(integer);
    expect(fn(51.5, 131, 98)).toEqual(fractional);
  }
});

test.each(Object.entries(VERIFIED))('%s propagates to matching, restoration and palette swatches', (id, rgb) => {
  const thread = DMC.find(t => t.id === id);
  expect(thread.rgb).toEqual(rgb);
  expect(run(`findSolid(rgbToLab(...${JSON.stringify(rgb)}),DMC).id`)).toBe(id);
  expect(picker.nearestDmc(rgb, 1, [], { dmc: DMC })[0].id).toBe(id);
  const palette = run(`buildPalette([restoreStitch({id:'${id}',type:'solid'})]).pal`);
  expect(Array.from(palette[0].rgb)).toEqual(rgb);
  expect(run(`stripCellForSave(restoreStitch({id:'${id}',type:'solid'}))`)).toEqual({ id, type: 'solid' });
});

it('resolves aliases without losing canonical IDs or leading zeros', () => {
  for (const alias of ['white', ' WHITE ', 'Blanc', 'BLANC']) expect(run(`restoreStitch({id:${JSON.stringify(alias)}}).id`)).toBe('blanc');
  expect(run('restoreStitch({id:"b5200"}).id')).toBe('B5200');
  expect(run('restoreStitch({id:"ECRU"}).id')).toBe('ecru');
  expect(run('restoreStitch({id:"01"}).id')).toBe('01');
  expect(run('findThreadInCatalog("dmc","1")')).toBeNull();
});

it('restores ID-only blends from corrected components consistently with matching', () => {
  const b = run('restoreStitch({id:"505+783",type:"blend",symbol:"X"})');
  expect(Array.from(b.rgb)).toEqual([129, 138, 67]);
  expect(b.symbol).toBe('X');
  // 505 and 783 are too far apart for a new blend to pair them
  // (BLEND_MAX_PARTNER_DE); lift the limit to compare the composite formula.
  run('var _lim = BLEND_MAX_PARTNER_DE; BLEND_MAX_PARTNER_DE = Infinity; findBest.precomputeBlends([getDmcById("505"),getDmcById("783")]); BLEND_MAX_PARTNER_DE = _lim;');
  const computed = run('findBest._blends[0]');
  expect(b.rgb).toEqual(computed.rgb);
  expect(b.lab).toEqual(computed.lab);
  expect(b.threads.map(t => t.id)).toEqual(['505', '783']);
});

test.each([
  { id: '505', type: 'solid', rgb: [44, 92, 53] }, // legacy RGB with ambiguous origin
  { id: '783', type: 'solid', rgb: [12, 34, 56] }, // deliberately custom, known ID
  { id: '505+783', type: 'blend', rgb: [12, 34, 56] },
  { id: 'custom', type: 'solid', rgb: [12, 34, 56] },
  { id: '505+custom', type: 'blend', rgb: [12, 34, 56] },
  { id: '403', type: 'solid', rgb: [12, 34, 56], brand: 'anchor' },
  { id: '403+46', type: 'blend', rgb: [12, 34, 56], brand: 'anchor' }
])('preserves explicit imported/custom RGB through repeated save/load: $id $type', cell => {
  ctx.savedCell = cell;
  const restored = run('restoreStitch(savedCell)');
  expect(Array.from(restored.rgb)).toEqual(cell.rgb);
  expect(restored.type).toBe(cell.type);
  expect(restored.lab).toEqual(rgbToLab(...cell.rgb));
  const again = run('restoreStitch(stripCellForSave(restoreStitch(savedCell)))');
  expect(Array.from(again.rgb)).toEqual(cell.rgb);
  expect(again.type).toBe(cell.type);
  expect(again.brand).toBe(cell.brand);
});

it('leaves skip and empty placeholders intact', () => {
  expect(run('restoreStitch({id:"__skip__"}).type')).toBe('skip');
  expect(run('restoreStitch({id:"__empty__"}).rgb')).toEqual([255, 255, 255]);
});
