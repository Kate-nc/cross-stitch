// Large charts in the Creator's Edit view (e.g. the 309x467, 144k-stitch
// gen-3 test PDF) froze the editor at 100% zoom: a 6,210 x 9,370 px canvas
// was restored in full on every mouse-move, and the Creator opened at 100%
// whenever the Tracker had last saved the project.

const fs = require('fs');
const path = require('path');

function read(rel) {
  return fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
}

const patternCanvas = read('creator/PatternCanvas.js');
const useProjectIO = read('creator/useProjectIO.js');

describe('PatternCanvas base cache', () => {
  test('is an offscreen canvas restored with drawImage, not ImageData', () => {
    // putImageData processes the whole image even for a small dirty rect.
    expect(patternCanvas).not.toMatch(/getImageData|putImageData\(/);
    expect(patternCanvas).toMatch(
      /function restoreBase\(context, x, y, w, h\) \{\s*context\.clearRect\(x, y, w, h\);\s*context\.drawImage\(baseCacheRef\.current, x, y, w, h, x, y, w, h\);/);
  });

  test('the base is drawn on the CPU-backed cache; the visible canvas stays GPU-backed', () => {
    expect(patternCanvas).toMatch(
      /drawPatternBaseOnCanvas\(cache\.getContext\("2d", \{ willReadFrequently: true \}\)/);
    // willReadFrequently on the visible canvas forces a full-bitmap upload
    // on every hover repaint.
    expect(patternCanvas).not.toMatch(/canvas\.getContext\("2d", \{ willReadFrequently/);
  });
});

describe('PatternCanvas hover repaint', () => {
  test('a hover-only change repaints just the crosshair bands, clipped', () => {
    expect(patternCanvas).toMatch(/var onlyHoverMoved = !!prevKey && key\.every\(/);
    expect(patternCanvas).toMatch(/if \(onlyHoverMoved && hoverIsLocal\) \{/);
    // Old and new hover positions both get a column and a row band.
    expect(patternCanvas).toMatch(/\[shownHoverRef\.current, hov\.hoverCoords\]\.forEach/);
    expect(patternCanvas).toMatch(/restoreBase\(context, x, y, w, h\);\s*context\.rect\(x, y, w, h\);/);
    expect(patternCanvas).toMatch(/context\.clip\(\);\s*drawPatternOverlayOnCanvas\(/);
  });

  test('backstitch tools, whose hover lines cross the chart, keep the full repaint', () => {
    expect(patternCanvas).toMatch(
      /var hoverIsLocal = cv\.activeTool !== "backstitch" && cv\.activeTool !== "eraseBs";/);
  });

  test('every full paint records the hover it drew', () => {
    // Effect 1 and both marching-ants timers repaint the overlay in full; the
    // band repaint must know which hover position the canvas shows.
    const records = patternCanvas.match(/shownHoverRef\.current = /g) || [];
    expect(records.length).toBeGreaterThanOrEqual(4);
  });
});

describe('Creator zoom on project load', () => {
  test('a Tracker save does not set the Creator zoom', () => {
    expect(useProjectIO).toMatch(
      /if \(project\.savedZoom != null && project\.page !== "tracker"\) \{\s*state\.setZoom\(project\.savedZoom\);/);
  });

  test('zoom is set in the same batch as the pattern, not after a timeout', () => {
    // A timeout let the first draw run at the default 100%.
    expect(useProjectIO).not.toMatch(/setTimeout\(function\(\) \{\s*(var z = [^\n]*\n\s*)?state\.setZoom/);
    expect(useProjectIO).toMatch(
      /\} else \{\s*var box = window\.creatorFitBox\(scrollRef\.current\);\s*state\.setZoom\(window\.creatorFitZoom\(s\.sW, s\.sH,/);
  });
});
