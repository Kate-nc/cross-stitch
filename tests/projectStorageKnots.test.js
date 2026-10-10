// tests/projectStorageKnots.test.js — French knots count in the library's
// progress (P4-4).
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'project-storage.js'), 'utf8');
function extract(name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error(name + ' not found');
  let depth = 0, i = src.indexOf('{', start), end = -1;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  return src.slice(start, end);
}
// eslint-disable-next-line no-eval
const knotCounts = eval('(' + extract('knotCounts') + ')');
const countTotalStitches = p => (p.pattern || []).filter(c => c.id !== '__empty__').length;
const countCompletedStitches = d => Array.from(d).filter(v => v === 1).length;
// eslint-disable-next-line no-eval
const buildStatsSummary = eval('(' + extract('buildStatsSummary') + ')');

const pattern = [{ id: '310' }, { id: '310' }, { id: '__empty__' }, { id: '666' }];

test('knots and their done marks add to the totals', () => {
  const s = buildStatsSummary({
    id: 'p', pattern, done: [1, 0, 0, 0],
    knots: [{ x: 1, y: 1, id: '310' }, { x: 3, y: 1, id: '310' }],
    knotsDone: ['3,1', '9,9']
  });
  expect(s.totalStitches).toBe(3 + 2);
  expect(s.completedStitches).toBe(1 + 1);
});

test('a project without knots counts as before', () => {
  const s = buildStatsSummary({ id: 'p', pattern, done: [1, 1, 0, 1] });
  expect([s.totalStitches, s.completedStitches, s.isComplete]).toEqual([3, 3, true]);
  expect(knotCounts({})).toEqual({ total: 0, done: 0 });
});
