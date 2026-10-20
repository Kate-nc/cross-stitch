const { browserScripts } = require('./_helpers/browserScripts');

// shapeTools precedes useCanvasInteraction in build-creator-bundle.js, so
// these exercise both independent implementations, not a shared alias.
const scripts = browserScripts(['creator/shapeTools.js', 'creator/useCanvasInteraction.js']);
const cases = [
  [[0, 0, 4, 2], [[0, 0], [1, 1], [2, 1], [3, 2], [4, 2]]],
  [[4, 2, 0, 0], [[4, 2], [3, 1], [2, 1], [1, 0], [0, 0]]],
  [[0, 0, 2, 4], [[0, 0], [1, 1], [1, 2], [2, 3], [2, 4]]],
  [[2, 4, 0, 0], [[2, 4], [1, 3], [1, 2], [0, 1], [0, 0]]],
  [[0, 4, 4, 2], [[0, 4], [1, 3], [2, 3], [3, 2], [4, 2]]],
  [[4, 2, 0, 4], [[4, 2], [3, 3], [2, 3], [1, 4], [0, 4]]],
  [[2, 0, 0, 4], [[2, 0], [1, 1], [1, 2], [0, 3], [0, 4]]],
  [[0, 4, 2, 0], [[0, 4], [1, 3], [1, 2], [2, 1], [2, 0]]],
  [[3, 2, 0, 2], [[3, 2], [2, 2], [1, 2], [0, 2]]],
  [[2, 0, 2, 3], [[2, 0], [2, 1], [2, 2], [2, 3]]],
  [[2, 3, 2, 0], [[2, 3], [2, 2], [2, 1], [2, 0]]],
  [[2, 2, 2, 2], [[2, 2]]],
  [[1, 1, 3, 3], [[1, 1], [2, 2], [3, 3]]]
];

describe.each([
  ['shape preview', (...coords) => scripts.ShapeTools.shapeLineCells(...coords, false)],
  ['pointer interpolation', scripts.lineCells]
])('%s Bresenham contract', (_name, line) => {
  test.each(cases)('%j preserves endpoint and tie ordering', (coords, points) => {
    expect(line(...coords).map(p => [p.x, p.y])).toEqual(points);
  });
});

test('shape dispatch retains snapping before rasterisation', () => {
  expect(scripts.ShapeTools.shapeCells('line', { x: 2, y: 3 }, { x: 8, y: 4 }, { snap: true }))
    .toEqual([2, 3, 4, 5, 6, 7, 8].map(x => ({ x, y: 3 })));
});
