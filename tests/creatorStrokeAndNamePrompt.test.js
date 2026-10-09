// Audit B-11 (fast strokes left gaps) and B-10 (the name prompt came back on
// every reload of an unnamed project).

const fs = require('fs');
const path = require('path');

function read(rel) { return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8'); }

describe('lineCells', () => {
  const src = read('creator/useCanvasInteraction.js');
  const start = src.indexOf('function lineCells(');
  const end = src.indexOf('window.lineCells = lineCells;');
  // eslint-disable-next-line no-new-func
  const lineCells = new Function(src.slice(start, end) + '\nreturn lineCells;')();

  function contiguous(cells) {
    for (let i = 1; i < cells.length; i++) {
      const dx = Math.abs(cells[i].x - cells[i - 1].x);
      const dy = Math.abs(cells[i].y - cells[i - 1].y);
      if (dx > 1 || dy > 1 || (dx === 0 && dy === 0)) return false;
    }
    return true;
  }

  test.each([
    ['diagonal', 0, 0, 7, 7, 8],
    ['steep', 2, 1, 4, 11, 11],
    ['horizontal', 9, 3, 0, 3, 10],
    ['shallow', 0, 0, 12, 4, 13],
    ['single cell', 5, 5, 5, 5, 1],
  ])('%s line is contiguous and includes both ends', (_name, x0, y0, x1, y1, len) => {
    const cells = lineCells(x0, y0, x1, y1);
    expect(cells).toHaveLength(len);
    expect(cells[0]).toEqual({ x: x0, y: y0 });
    expect(cells[cells.length - 1]).toEqual({ x: x1, y: y1 });
    expect(contiguous(cells)).toBe(true);
  });

  test('a drag paints along the line from the last cell', () => {
    expect(src).toMatch(/lineCells\(last\.gx, last\.gy, gc\.gx, gc\.gy\)\.forEach/);
    // Reset on pointer down, pointer up and when a second finger cancels.
    expect((src.match(/lastDragCellRef\.current = null;/g) || []).length).toBeGreaterThanOrEqual(2);
    expect(src).toMatch(/lastDragCellRef\.current = \{ gx: gx, gy: gy \};/);
  });
});

describe('name prompt is shown once per project', () => {
  const io = read('creator/useProjectIO.js');
  const st = read('creator/useCreatorState.js');

  test('the flag is saved with the project in every Creator save path', () => {
    expect((io.match(/namePromptShown: !!state\.namePromptShown,/g) || []).length).toBe(3);
  });

  test('it is restored on load, older projects counting as not shown', () => {
    expect(io).toMatch(/state\.setNamePromptShown\(!!project\.namePromptShown\)/);
  });

  test('the export-time prompt checks it', () => {
    const main = read('creator-main.js');
    expect(main).toMatch(/if \(auto && !shown && state\.pat && state\.pal\)/);
  });

  test('opening the prompt sets it', () => {
    expect(st).toMatch(/if \(namePromptOpen && !namePromptShownRef\.current\) setNamePromptShown\(true\);/);
  });

  test('the Tracker carries it through its own saves', () => {
    const tr = read('tracker-app.js');
    expect(tr).toMatch(/namePromptShownRef\.current=!!project\.namePromptShown;/);
    expect((tr.match(/namePromptShown: ?namePromptShownRef\.current ?\|\| ?undefined/g) || []).length).toBe(3);
  });
});
