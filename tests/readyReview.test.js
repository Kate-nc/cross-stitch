const fs = require('fs');
const { analyzeConfetti } = require('../colour-utils');
const window = {};
new Function('window', 'React', 'analyzeConfetti', 'stitchOverFor', fs.readFileSync('creator/ReadyReview.js', 'utf8'))(
  window, {createElement() {}}, analyzeConfetti, ct => [25, 28, 32].includes(ct) ? 2 : 1);
const review = window.ReadyReview;
const cell = id => ({id, type: 'solid', rgb: [0, 0, 0]});

test('metrics reflect the current sparse chart, exclude null/empty, preserve intentional details and refresh after edits', () => {
  const pat = [cell('310'), null, cell('321'), cell('310'), cell('__skip__'), cell('__empty__')];
  const original = JSON.stringify(pat);
  expect(review.metrics(pat, 3, 2)).toMatchObject({total: 3, confetti: {singles: 1, smallClusters: 2}});
  expect(review.metrics(pat, 3, 2).rare.map(p => [p.id, p.count])).toEqual([['310', 2], ['321', 1]]);
  expect(JSON.stringify(pat)).toBe(original);
  pat[2] = cell('__empty__');
  expect(review.metrics(pat, 3, 2)).toMatchObject({total: 2, confetti: {singles: 0}});
});

test('sample clamps to chart edges and exports a row-major region without modifying the source', () => {
  const pat = Array.from({length: 35}, (_, i) => cell(String(i)));
  const r = review.region(7, 5, {x: 3, y: 2, w: 3, h: 2});
  expect(review.crop(pat, 7, r).map(p => p.id)).toEqual(['17', '18', '19', '24', '25', '26']);
  expect(review.region(7, 5, {x: 999, y: -5, w: 20, h: 999})).toEqual({x: 6, y: 0, w: 1, h: 5});
  expect(review.region(200, 200, {x: 0, y: 0, w: 999, h: NaN})).toEqual({x: 0, y: 0, w: 80, h: 30});
  expect(pat).toHaveLength(35);
});

test('dimensions use effective fabric count and exact inch/cm conversion', () => {
  expect(review.size(140, 70, 14)).toBe('10.0 × 5.0 in (25.4 × 12.7 cm)');
  expect(review.size(140, 70, 28)).toBe(review.size(140, 70, 14));
  expect(review.size(140, 70, 20)).toBe('7.0 × 3.5 in (17.8 × 8.9 cm)');
});

test('blend chart symbols count once and retain their component data', () => {
  const blend = {id: '310+321', type: 'blend', threads: [cell('310'), cell('321')]};
  const m = review.metrics([blend, blend], 2, 1);
  expect(m.pal).toHaveLength(1);
  expect(m.pal[0]).toMatchObject({count: 2, threads: blend.threads});
});

test('sample preserves portions of backstitch crossing its boundary, excludes outside lines', () => {
  const r = {x: 5, y: 5, w: 10, h: 10};
  expect(review.clipLine({x1: 0, y1: 10, x2: 20, y2: 10, threadId: '310'}, r))
    .toEqual({x1: 5, y1: 10, x2: 15, y2: 10, threadId: '310'});
  expect(review.clipLine({x1: 0, y1: 0, x2: 1, y2: 0}, r)).toBeNull();
});

test('project source restore clears missing/corrupt sources and ignores an older image decoding late', () => {
  const src = fs.readFileSync('creator/useProjectIO.js','utf8');
  const block = src.slice(src.indexOf('    // The chart changes immediately.'), src.indexOf('\n  // ─── Tracing picture'));
  const images = [], state = {userActedRef:{current:false},setImg:jest.fn(),setOrigW:jest.fn(),setOrigH:jest.fn()};
  function Image() { images.push(this); }
  const token={current:0};
  const restore=new Function('state','project','s','Image','sourceRestoreRef','window',block.slice(0,block.lastIndexOf('\n  }')));
  restore(state,{imgData:'data:image/png;base64,old'}, {}, Image, token, {});
  expect(state.setImg).toHaveBeenLastCalledWith(null);
  restore(state,{}, {}, Image, token, {});
  images[0].onload();
  expect(state.setImg.mock.calls.map(c=>c[0])).toEqual([null,null]);
  restore(state,{imgData:'data:image/png;base64,current'}, {}, Image, token, {});
  images[1].onload();
  expect(state.setImg).toHaveBeenLastCalledWith(images[1]);
});

test('equal numeric thread IDs from different brands remain distinct effort metrics', () => {
  const m=review.metrics([{...cell('310'),brand:'dmc'},{...cell('310'),brand:'anchor'}],2,1);
  expect(m.pal).toHaveLength(2);expect(m.confetti.singles).toBe(2);
});
