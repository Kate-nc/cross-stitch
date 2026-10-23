/* tests/convertPreviewAccuracy.test.js ───────────────────────────────────
   How the Convert preview shows the finished piece, and says what a change
   did:
   - stitchCoverage / drawStitchTile (creator/StitchedPreview.js): a stitch
     covers most of its square, more on finer fabric; its average colour is
     its thread's colour mixed with the fabric showing between the legs, not
     a darkened thread; a blend shows both threads.
   - describePreviewChange (creator/usePreview.js): names the settings that
     changed and only the counts that moved, and counts the stitches whose
     thread changed.
   ─────────────────────────────────────────────────────────────────────────── */

const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

function load(file, names) {
  const src = fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
  const win = {};
  const React = { createElement: () => null, useRef: () => ({}), useEffect: () => {}, useCallback: (f) => f };
  // eslint-disable-next-line no-new-func
  new Function('window', 'React', 'stitchOverFor', 'document', src)(win, React, (ct) => (ct >= 25 ? 2 : 1), {});
  return names.reduce((o, n) => { o[n] = win[n]; return o; }, {});
}

describe('stitched preview', () => {
  const { stitchCoverage, drawStitchTile } = load('creator/StitchedPreview.js', ['stitchCoverage', 'drawStitchTile']);

  test('finer fabric is covered more; over-two counts use their stitches per inch', () => {
    expect(stitchCoverage(11)).toBeLessThan(stitchCoverage(14));
    expect(stitchCoverage(14)).toBeLessThan(stitchCoverage(18));
    expect(stitchCoverage(18)).toBeLessThanOrEqual(1);
    expect(stitchCoverage(28)).toBeCloseTo(stitchCoverage(14), 5);
  });

  function tile(fabric, legs, ct) {
    const size = 32;
    const c = createCanvas(size, size);
    const ctx = c.getContext('2d');
    drawStitchTile(ctx, size, fabric, legs, legs, stitchCoverage(ct));
    const d = ctx.getImageData(0, 0, size, size).data;
    const sum = [0, 0, 0];
    for (let i = 0; i < d.length; i += 4) { sum[0] += d[i]; sum[1] += d[i + 1]; sum[2] += d[i + 2]; }
    return { avg: sum.map((v) => v / (size * size)), data: d };
  }

  test('a red stitch on white fabric averages close to the thread, lightened a little by the fabric', () => {
    const { avg } = tile([255, 255, 255], [[200, 30, 40]], 14);
    // Mostly thread: within 40 of red's channels, and never darker than the
    // thread itself on its brightest channel.
    expect(avg[0]).toBeGreaterThan(190);
    expect(avg[1]).toBeLessThan(80);
    expect(avg[2]).toBeLessThan(90);
  });

  test('the shading rounds the strands without darkening the thread', () => {
    // On fabric of the thread's own colour, the tile averages to that colour.
    const grey = [120, 120, 120];
    const { avg } = tile(grey, [grey], 16);
    avg.forEach((v) => expect(Math.abs(v - 120)).toBeLessThan(10));
  });

  test('fabric shows between the legs on coarse fabric, less on fine', () => {
    const fabricShare = (ct) => {
      const { data } = tile([255, 255, 255], [[0, 0, 0]], ct);
      let white = 0;
      for (let i = 0; i < data.length; i += 4) if (data[i] > 200) white++;
      return white / (data.length / 4);
    };
    expect(fabricShare(11)).toBeGreaterThan(fabricShare(18));
    expect(fabricShare(11)).toBeGreaterThan(0.05);
    expect(fabricShare(18)).toBeLessThan(0.2);
  });

  test('a blend shows both of its threads', () => {
    const { data } = tile([255, 255, 255], [[220, 20, 20], [20, 20, 220]], 14);
    let red = 0, blue = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] > 150 && data[i + 2] < 80) red++;
      if (data[i + 2] > 150 && data[i] < 80) blue++;
    }
    expect(red).toBeGreaterThan(50);
    expect(blue).toBeGreaterThan(50);
  });

  test('an unstitched square is fabric', () => {
    const { avg } = tile([232, 217, 181], null, 14);
    expect(Math.abs(avg[0] - 232)).toBeLessThan(12);
    expect(Math.abs(avg[2] - 181)).toBeLessThan(12);
  });
});

describe('describePreviewChange', () => {
  const { describePreviewChange } = load('creator/usePreview.js', ['describePreviewChange']);
  const base = { sW: 10, sH: 10, maxC: 24, dith: true, dithMode: 'weak', stitchCleanup: { enabled: true, protectDetails: true }, orphans: 2, bgCol: [255, 255, 255] };
  const summary = { threads: 24, symbols: 40, stitchable: 100, confettiPct: 4.31, skeins: 30 };

  test('nothing to compare with yet', () => {
    expect(describePreviewChange(null, { settings: base, summary, ids: [] })).toBeNull();
  });

  test('unchanged settings and cells say nothing', () => {
    expect(describePreviewChange({ settings: base, summary, ids: ['a'] }, { settings: Object.assign({}, base), summary, ids: ['a'] })).toBeNull();
  });

  test('names the setting, the stitches that changed and only the counts that moved', () => {
    const prev = { settings: base, summary, ids: ['310', '550', '310', '666'] };
    const next = { settings: Object.assign({}, base, { maxC: 12 }), summary: Object.assign({}, summary, { threads: 12, symbols: 20, confettiPct: 3.14 }), ids: ['310', '310', '310', '666'] };
    expect(describePreviewChange(prev, next)).toEqual({
      settings: ['Threads (max)'],
      stats: [{ label: 'threads', from: '24', to: '12' }, { label: 'chart symbols', from: '40', to: '20' }, { label: 'confetti', from: '4.3%', to: '3.1%' }],
      changedStitches: 1, total: 4, estimated: false
    });
  });

  test('objects and arrays compare by value; several settings are all named', () => {
    const prev = { settings: base, summary, ids: ['a'] };
    const next = { settings: Object.assign({}, base, { stitchCleanup: { enabled: true, protectDetails: false }, bgCol: [0, 0, 0], dithMode: 'off', dith: false }), summary, ids: ['a'] };
    const out = describePreviewChange(prev, next);
    expect(out.settings).toEqual(['Shading', 'Background', 'Tidying']);
    expect(out.stats).toEqual([]);
    expect(out.changedStitches).toBe(0);
  });

  test('a new size has no stitch-by-stitch count', () => {
    const prev = { settings: base, summary, ids: ['a', 'b'] };
    const next = { settings: Object.assign({}, base, { sW: 20 }), summary: Object.assign({}, summary, { stitchable: 200 }), ids: ['a', 'b', 'c', 'd'] };
    const out = describePreviewChange(prev, next);
    expect(out.settings).toEqual(['Size']);
    expect(out.changedStitches).toBeNull();
    expect(out.stats).toEqual([{ label: 'size', from: '10 \u00D7 10', to: '20 \u00D7 10' }, { label: 'stitches', from: '100', to: '200' }]);
  });
});

describe('pinned comparison audit', () => {
  const { describePreviewChange } = load('creator/usePreview.js', ['describePreviewChange']);
  test('same-size available palettes still name and count changed stitches', () => {
    const a={settings:{stashConstrained:true,stashCount:2,allowedPalette:[{id:'310'},{id:'321'}]},ids:['310','321'],w:2,h:1};
    const b={settings:{stashConstrained:true,stashCount:2,allowedPalette:[{id:'742'},{id:'820'}]},ids:['742','820'],w:2,h:1};
    expect(describePreviewChange(a,b)).toMatchObject({settings:['Available threads'],changedStitches:2,total:2});
  });
  test('pixel changes are counted even when no named setting changed', () => {
    const a={settings:{},ids:['310'],w:1,h:1},b={settings:{},ids:['321'],w:1,h:1};
    expect(describePreviewChange(a,b)).toMatchObject({settings:['Preview'],changedStitches:1});
  });
});
