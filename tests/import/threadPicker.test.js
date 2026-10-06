/* tests/import/threadPicker.test.js — finding a thread for a colour in the
 * import review: by number, by nearness, by family, and from Anchor. */

const path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const { DMC, rgbToLab } = require(path.join(ROOT, 'dmc-data.js'));
global.rgbToLab = rgbToLab;                       // anchor-data.js computes Lab on load
const { ANCHOR } = require(path.join(ROOT, 'anchor-data.js'));
const { getOfficialMatch } = require(path.join(ROOT, 'thread-conversions.js'));
const P = require(path.join(ROOT, 'import-engine', 'ui', 'threadPicker.js'));

const cat = { dmc: DMC, anchor: ANCHOR, match: getOfficialMatch };

describe('findDmc', () => {
  it('finds a thread by its number, whatever the case or spacing', () => {
    expect(P.findDmc('310', cat).name).toBe('Black');
    expect(P.findDmc(' b5200 ', cat).id).toBe('B5200');
    expect(P.findDmc('Blanc', cat).id).toBe('blanc');
  });
  it('says nothing for a number DMC does not make', () => {
    expect(P.findDmc('99999', cat)).toBeNull();
    expect(P.findDmc('', cat)).toBeNull();
  });
});

describe('nearestDmc', () => {
  it('puts the exact thread first, then its neighbours', () => {
    const red = P.findDmc('321', cat);
    const near = P.nearestDmc(red.rgb, 5, null, cat);
    expect(near[0].id).toBe('321');
    expect(near).toHaveLength(5);
  });
  it('leaves out the threads it is told to', () => {
    const red = P.findDmc('321', cat);
    expect(P.nearestDmc(red.rgb, 3, ['321'], cat).map(t => t.id)).not.toContain('321');
  });
});

describe('colour families', () => {
  it('names all nineteen of dmc-data.js\'s families', () => {
    const used = new Set(DMC.map(t => t.fam).filter(Boolean));
    expect(P.FAMILIES.map(f => f.id).sort((a, b) => a - b)).toEqual([...used].sort((a, b) => a - b));
  });
  it('lists a family lightest first', () => {
    const greys = P.familyThreads(19, cat);
    expect(greys.map(t => t.id)).toContain('310');
    expect(greys[greys.length - 1].id).toBe('310');          // black is the darkest grey
  });
  it('finds the family a colour belongs to', () => {
    expect(P.familyOf([0, 0, 0], cat)).toBe(19);
  });
});

describe('fromAnchor', () => {
  it('uses the published conversion where there is one', () => {
    const r = P.fromAnchor('403', cat);
    expect(r.anchor.id).toBe('403');
    expect(r.dmc.id).toBe('310');
    expect(r.how).toBe('official');
  });
  it('falls back to the nearest DMC colour', () => {
    const noTable = { dmc: DMC, anchor: ANCHOR, match: () => null };
    const r = P.fromAnchor('403', noTable);
    expect(r.how).toBe('nearest');
    expect(r.dmc).toBeTruthy();
  });
  it('says nothing for a number Anchor does not make, or before its table loads', () => {
    expect(P.fromAnchor('999999', cat)).toBeNull();
    expect(P.fromAnchor('403', { dmc: DMC, anchor: null })).toBeNull();
  });
});

describe('the DMC table as the browser has it', () => {
  // dmc-data.js declares DMC with a top-level const: a global every script
  // can name, but not a property of window. Reading window.DMC found nothing,
  // and the picker and the number box's suggestions came up empty.
  it('finds a table declared with a top-level const in another script', () => {
    const vm = require('vm');
    const fs = require('fs');
    const ctx = vm.createContext({ console });
    ctx.window = ctx;
    vm.runInContext("const DMC = [{ id: '310', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], fam: 19 }];", ctx);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'import-engine', 'ui', 'threadPicker.js'), 'utf8'), ctx);
    expect(ctx.window.DMC).toBeUndefined();
    const TP = ctx.window.ImportEngine.threadPicker;
    expect(TP.dmcList()).toHaveLength(1);
    expect(TP.findDmc('310').name).toBe('Black');
    expect(TP.familyThreads(19).map(t => t.id)).toEqual(['310']);
  });
});
