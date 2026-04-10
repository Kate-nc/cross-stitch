const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const TMP_DIR = path.join(ROOT, 'tests', '.tmp');
const GRID_GUTTER = 28;
const FIXTURE_ZOOM = 2;
const FIXTURE_CELL_SIZE = Math.round(20 * FIXTURE_ZOOM);

function ensureTmpDir() {
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });
}

function ensureCreatorProjectFixture() {
  ensureTmpDir();
  const filePath = path.join(TMP_DIR, 'creator-touch-project.json');
  const sW = 60;
  const sH = 60;
  const total = sW * sH;
  const project = {
    version: 9,
    page: 'creator',
    name: 'Creator Touch Fixture',
    settings: {
      sW,
      sH,
      maxC: 20,
      bri: 0,
      con: 0,
      sat: 0,
      dith: false,
      skipBg: false,
      bgTh: 15,
      bgCol: [255, 255, 255],
      minSt: 0,
      arLock: true,
      ar: 1,
      fabricCt: 14,
      skeinPrice: 0.95,
      stitchSpeed: 40,
      smooth: 0,
      smoothType: 'median',
      orphans: 0,
      isScratchMode: false,
      allowBlends: false,
      stitchCleanup: { enabled: false, strength: 'balanced', protectDetails: true, smoothDithering: true },
    },
    pattern: Array.from({ length: total }, function(_value, index) {
      const x = index % sW;
      return x < sW / 2
        ? { id: '310', type: 'solid', rgb: [0, 0, 0] }
        : { id: '606', type: 'solid', rgb: [250, 50, 40] };
    }),
    bsLines: [],
    done: null,
    parkMarkers: [],
    totalTime: 0,
    sessions: [],
    hlRow: -1,
    hlCol: -1,
    threadOwned: {},
    halfStitches: [],
    savedZoom: FIXTURE_ZOOM,
    savedScroll: { left: 0, top: 0 },
  };
  fs.writeFileSync(filePath, JSON.stringify(project), 'utf8');
  return filePath;
}

function ensureTrackerProjectFixture() {
  ensureTmpDir();
  const filePath = path.join(TMP_DIR, 'tracker-touch-project.json');
  const sW = 60;
  const sH = 60;
  const total = sW * sH;
  const pattern = Array.from({ length: total }, function() {
    return { id: '310', type: 'solid', rgb: [0, 0, 0], symbol: 'A' };
  });
  const done = Array.from({ length: total }, function() { return 0; });
  const project = {
    version: 9,
    page: 'tracker',
    name: 'Touch Fixture',
    settings: { sW, sH, fabricCt: 14, skeinPrice: 0.95, stitchSpeed: 40 },
    pattern,
    bsLines: [],
    done,
    parkMarkers: [],
    totalTime: 0,
    sessions: [],
    hlRow: -1,
    hlCol: -1,
    threadOwned: {},
    originalPaletteState: [{ id: '310', type: 'solid', name: 'Black', rgb: [0, 0, 0], lab: [0, 0, 0], count: total, symbol: 'A' }],
    singleStitchEdits: [],
    halfStitches: [],
    halfDone: [],
    statsSessions: [],
    statsSettings: {},
    savedZoom: FIXTURE_ZOOM,
    savedScroll: { left: 0, top: 0 },
  };
  fs.writeFileSync(filePath, JSON.stringify(project), 'utf8');
  return filePath;
}

async function loadCreatorFixture(page, projectPath) {
  await page.goto('/index.html');
  await page.waitForSelector('text=Open file');
  const chooserPromise = page.waitForEvent('filechooser');
  await page.getByText('Open file').first().click();
  const chooser = await chooserPromise;
  await chooser.setFiles(projectPath || ensureCreatorProjectFixture());
  await page.waitForSelector('.tb-strip');
  await page.waitForFunction(function(expectedZoom) {
    const zoomEl = document.querySelector('.tb-zoom-pct');
    const canvases = Array.from(document.querySelectorAll('canvas'));
    return zoomEl && zoomEl.textContent && zoomEl.textContent.includes(String(expectedZoom)) && canvases.some(function(el) { return el.width > 1000; });
  }, Math.round(FIXTURE_ZOOM * 100));
}

async function loadTrackerFixture(page, projectPath) {
  await page.goto('/stitch.html');
  await page.locator('input[type="file"]').first().setInputFiles(projectPath || ensureTrackerProjectFixture());
  await page.waitForSelector('.tb-progress');
  await page.waitForFunction(function(expectedZoom) {
    const zoomEl = document.querySelector('.tb-zoom-pct');
    return zoomEl && zoomEl.textContent && zoomEl.textContent.includes(String(expectedZoom));
  }, Math.round(FIXTURE_ZOOM * 100));
}

async function dispatchPointerSequence(locator, steps) {
  await locator.evaluate(function(el, payload) {
    payload.forEach(function(step) {
      const isPointerUp = step.type === 'pointerup' || step.type === 'pointercancel';
      const event = new PointerEvent(step.type, {
        bubbles: true,
        cancelable: true,
        composed: true,
        pointerId: step.pointerId,
        pointerType: step.pointerType || 'touch',
        isPrimary: step.isPrimary !== false,
        clientX: step.x,
        clientY: step.y,
        button: step.button == null ? 0 : step.button,
        buttons: step.buttons == null ? (isPointerUp ? 0 : 1) : step.buttons,
      });
      el.dispatchEvent(event);
    });
  }, steps);
}

async function dispatchTouchSequence(page, steps) {
  const session = await page.context().newCDPSession(page);
  try {
    for (const step of steps) {
      await session.send('Input.dispatchTouchEvent', {
        type: step.type,
        touchPoints: (step.touchPoints || []).map(function(point) {
          return {
            x: Math.round(point.x),
            y: Math.round(point.y),
            radiusX: 6,
            radiusY: 6,
            force: 1,
            id: point.id,
          };
        }),
      });
    }
  } finally {
    await session.detach().catch(function() {});
  }
}

async function dispatchSyntheticTouchSequence(locator, steps) {
  await locator.evaluate(function(el, payload) {
    function normalizeTouches(list) {
      return (list || []).map(function(touch) {
        return {
          identifier: touch.id,
          clientX: touch.x,
          clientY: touch.y,
          pageX: touch.x,
          pageY: touch.y,
          screenX: touch.x,
          screenY: touch.y,
          target: el,
        };
      });
    }

    payload.forEach(function(step) {
      const touches = normalizeTouches(step.touchPoints);
      const event = new Event(step.type, { bubbles: true, cancelable: true, composed: true });
      Object.defineProperty(event, 'touches', { value: touches });
      Object.defineProperty(event, 'changedTouches', { value: touches });
      Object.defineProperty(event, 'targetTouches', { value: touches });
      el.dispatchEvent(event);
    });
  }, steps);
}

async function getCanvasCellPoint(canvas, gridX, gridY, cellSize, gutter) {
  const box = await canvas.boundingBox();
  if (!box) throw new Error('Canvas is not visible');
  const canvasSize = await canvas.evaluate(function(el) {
    return { width: el.width, height: el.height };
  });
  const localX = gutter + gridX * cellSize + Math.floor(cellSize / 2);
  const localY = gutter + gridY * cellSize + Math.floor(cellSize / 2);
  return {
    localX,
    localY,
    clientX: box.x + (localX / canvasSize.width) * box.width,
    clientY: box.y + (localY / canvasSize.height) * box.height,
  };
}

async function getLargestCanvas(page) {
  const canvases = page.locator('canvas');
  const index = await canvases.evaluateAll(function(elements) {
    let bestIndex = 0;
    let bestArea = 0;
    elements.forEach(function(el, currentIndex) {
      const area = el.width * el.height;
      if (area > bestArea) {
        bestArea = area;
        bestIndex = currentIndex;
      }
    });
    return bestIndex;
  });
  return canvases.nth(index);
}

async function sampleCanvasPixel(locator, x, y) {
  return locator.evaluate(function(el, point) {
    return Array.from(el.getContext('2d').getImageData(point.x, point.y, 1, 1).data);
  }, { x, y });
}

async function chooseRedCreatorPaletteChip(page) {
  const chips = page.locator('.creator-palette-chip');
  const index = await chips.evaluateAll(function(elements) {
    return elements.findIndex(function(el) {
      const swatch = el.querySelector('.creator-palette-chip-swatch');
      if (!swatch) return false;
      const rgb = (getComputedStyle(swatch).backgroundColor.match(/\d+/g) || []).map(Number);
      return rgb.length === 3 && rgb[0] > 200 && rgb[1] < 80 && rgb[2] < 80;
    });
  });
  if (index < 0) throw new Error('Could not find a red creator palette chip');
  await chips.nth(index).tap();
}

module.exports = {
  FIXTURE_CELL_SIZE,
  GRID_GUTTER,
  chooseRedCreatorPaletteChip,
  dispatchPointerSequence,
  dispatchSyntheticTouchSequence,
  dispatchTouchSequence,
  getCanvasCellPoint,
  getLargestCanvas,
  loadCreatorFixture,
  loadTrackerFixture,
  sampleCanvasPixel,
};