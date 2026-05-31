/**
 * @jest-environment jsdom
 *
 * Unit tests for prescaleForGrid() — the step-halving area-average downscale
 * helper added to creator/generate.js to fix speckle noise in photo-to-grid
 * conversion.
 *
 * Canvas is not implemented in jsdom, so we mock document.createElement to
 * intercept canvas creation and track intermediate step sizes and smoothing
 * settings.  The function's public contract is:
 *
 *   1. Returns `source` unchanged when srcW ≤ targetW*2 AND srcH ≤ targetH*2.
 *   2. Creates one or more intermediate canvases when the ratio exceeds 2:1.
 *   3. Each intermediate canvas has width ≤ previous/2+1 (strict halving).
 *   4. The final intermediate canvas dimensions are within 2× of the target.
 *   5. Every intermediate canvas context has imageSmoothingEnabled=true and
 *      imageSmoothingQuality='high'.
 */

const fs   = require('fs');
const path = require('path');

const genSrc = fs.readFileSync(path.join(__dirname, '..', 'creator', 'generate.js'), 'utf8');

// ── Extract prescaleForGrid by braces-matching ──────────────────────────────
function extractFn(src, name) {
  let start = src.indexOf('\nfunction ' + name + '(');
  if (start === -1) start = src.indexOf('function ' + name + '(');
  else start += 1;
  if (start === -1) throw new Error('Function ' + name + ' not found in source');
  let i = start;
  while (i < src.length && src[i] !== '{') i++;
  let depth = 0;
  while (i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { if (--depth === 0) return src.slice(start, i + 1); }
    i++;
  }
  throw new Error('Unterminated function ' + name);
}

// ── Mock canvas infrastructure ──────────────────────────────────────────────
let capturedCanvases = [];

function makeMockCtx() {
  return {
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'low',
    drawImage() {},
  };
}

function makeMockCanvas() {
  const ctx = makeMockCtx();
  return { width: 0, height: 0, _ctx: ctx, getContext() { return ctx; } };
}

// Override document.createElement for canvas tags only.
const origCreateElement = document.createElement.bind(document);
document.createElement = function(tag) {
  if (tag !== 'canvas') return origCreateElement(tag);
  const c = makeMockCanvas();
  capturedCanvases.push(c);
  return c;
};

// Evaluate the function in this scope (document is available via jsdom).
// eslint-disable-next-line no-eval
eval(extractFn(genSrc, 'prescaleForGrid'));

// ── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => { capturedCanvases = []; });

describe('prescaleForGrid — source-level assertions', () => {
  test('prescaleForGrid is defined in creator/generate.js', () => {
    expect(genSrc).toMatch(/function prescaleForGrid\(/);
  });

  test('runGenerationPipeline calls prescaleForGrid before drawImage', () => {
    expect(genSrc).toMatch(/drawImage\(\s*prescaleForGrid\(/);
  });

  test('generate.js sets imageSmoothingQuality on the final canvas context', () => {
    expect(genSrc).toMatch(/imageSmoothingQuality/);
  });
});

describe('prescaleForGrid — useCreatorState.js usage', () => {
  const ucs = fs.readFileSync(path.join(__dirname, '..', 'creator', 'useCreatorState.js'), 'utf8');

  test('useCreatorState.js uses prescaleForGrid in startGeneration', () => {
    expect(ucs).toMatch(/drawImage\(\s*prescaleForGrid\(/);
  });

  test('useCreatorState.js sets imageSmoothingEnabled before drawImage', () => {
    expect(ucs).toMatch(/imageSmoothingEnabled\s*=\s*true/);
  });
});

describe('prescaleForGrid — usePreview.js usage', () => {
  const up = fs.readFileSync(path.join(__dirname, '..', 'creator', 'usePreview.js'), 'utf8');

  test('usePreview.js uses prescaleForGrid in generatePreview', () => {
    expect(up).toMatch(/drawImage\(\s*prescaleForGrid\(/);
  });

  test('usePreview.js sets imageSmoothingEnabled before drawImage', () => {
    expect(up).toMatch(/imageSmoothingEnabled\s*=\s*true/);
  });
});

describe('prescaleForGrid — behaviour', () => {
  test('returns source unchanged when srcW and srcH are missing', () => {
    const img = {};
    expect(prescaleForGrid(img, 50, 50)).toBe(img);
    expect(capturedCanvases).toHaveLength(0);
  });

  test('returns source unchanged when ratio is exactly 2:1', () => {
    // srcW=100, targetW=50 → 100 <= 50*2=100 → no step needed
    const img = { naturalWidth: 100, naturalHeight: 100 };
    const result = prescaleForGrid(img, 50, 50);
    expect(result).toBe(img);
    expect(capturedCanvases).toHaveLength(0);
  });

  test('returns source unchanged when ratio is less than 2:1', () => {
    const img = { naturalWidth: 90, naturalHeight: 80 };
    const result = prescaleForGrid(img, 50, 50);
    expect(result).toBe(img);
    expect(capturedCanvases).toHaveLength(0);
  });

  test('returns source unchanged for equal dimensions', () => {
    const img = { naturalWidth: 50, naturalHeight: 50 };
    expect(prescaleForGrid(img, 50, 50)).toBe(img);
    expect(capturedCanvases).toHaveLength(0);
  });

  test('creates one intermediate canvas for 4:1 ratio (200 → 50)', () => {
    // 200 > 50*2=100 → halve to 100. 100 <= 100 → stop.
    const img = { naturalWidth: 200, naturalHeight: 200 };
    const result = prescaleForGrid(img, 50, 50);
    expect(capturedCanvases).toHaveLength(1);
    expect(capturedCanvases[0].width).toBe(100);
    expect(capturedCanvases[0].height).toBe(100);
    expect(result).toBe(capturedCanvases[0]);
  });

  test('creates multiple intermediate canvases for a 20:1 ratio (1000 → 50)', () => {
    // Steps: 500 → 250 → 125 → 63. 63 <= 100 → stop.
    const img = { naturalWidth: 1000, naturalHeight: 1000 };
    prescaleForGrid(img, 50, 50);
    expect(capturedCanvases.length).toBeGreaterThanOrEqual(3);
    // Verify each step roughly halves from the previous
    const widths = capturedCanvases.map(c => c.width);
    for (let i = 1; i < widths.length; i++) {
      expect(widths[i]).toBeLessThanOrEqual(Math.ceil(widths[i - 1] / 2) + 1);
    }
  });

  test('final intermediate canvas width is within 2× of targetW', () => {
    const img = { naturalWidth: 1000, naturalHeight: 750 };
    const result = prescaleForGrid(img, 50, 50);
    // result is the last canvas created
    const last = capturedCanvases[capturedCanvases.length - 1];
    expect(result).toBe(last);
    expect(last.width).toBeLessThanOrEqual(100);  // ≤ 2×targetW
    expect(last.height).toBeLessThanOrEqual(100); // ≤ 2×targetH
  });

  test('handles non-square source with asymmetric ratio', () => {
    // srcW=400 (8:1), srcH=100 (2:1 — no step needed for height but width needs halving)
    const img = { naturalWidth: 400, naturalHeight: 100 };
    prescaleForGrid(img, 50, 50);
    expect(capturedCanvases.length).toBeGreaterThanOrEqual(1);
    const last = capturedCanvases[capturedCanvases.length - 1];
    expect(last.width).toBeLessThanOrEqual(100);
    expect(last.height).toBeLessThanOrEqual(100);
  });

  test('uses naturalHeight as fallback for canvas sources (no naturalHeight)', () => {
    // Canvas elements have .width/.height not .naturalWidth/.naturalHeight
    const canvas = { width: 400, height: 400 };
    prescaleForGrid(canvas, 50, 50);
    // Should have created intermediate canvases (4:1 ratio requires steps)
    expect(capturedCanvases.length).toBeGreaterThanOrEqual(1);
  });

  test('all intermediate canvases have imageSmoothingEnabled=true', () => {
    const img = { naturalWidth: 800, naturalHeight: 600 };
    prescaleForGrid(img, 50, 50);
    expect(capturedCanvases.length).toBeGreaterThan(0);
    for (const c of capturedCanvases) {
      expect(c._ctx.imageSmoothingEnabled).toBe(true);
    }
  });

  test('all intermediate canvases have imageSmoothingQuality=high', () => {
    const img = { naturalWidth: 800, naturalHeight: 600 };
    prescaleForGrid(img, 50, 50);
    expect(capturedCanvases.length).toBeGreaterThan(0);
    for (const c of capturedCanvases) {
      expect(c._ctx.imageSmoothingQuality).toBe('high');
    }
  });

  test('covers the 101-wide edge case that just exceeds 2× boundary', () => {
    // srcW=201 > 100 → ceil(201/2)=101. 101 > 100 → ceil(101/2)=max(50,51)=51. 51 <= 100 → stop.
    const img = { naturalWidth: 201, naturalHeight: 201 };
    prescaleForGrid(img, 50, 50);
    // Two intermediate canvases expected: [101, 51]
    expect(capturedCanvases.length).toBe(2);
    expect(capturedCanvases[0].width).toBe(101);
    expect(capturedCanvases[1].width).toBe(51);
  });

  test('non-divisible target: 1000 → 47 stitches stays within 2× bound', () => {
    const img = { naturalWidth: 1000, naturalHeight: 1000 };
    const result = prescaleForGrid(img, 47, 47);
    const last = capturedCanvases[capturedCanvases.length - 1];
    expect(result).toBe(last);
    expect(last.width).toBeLessThanOrEqual(94);  // ≤ 2×47
    expect(last.height).toBeLessThanOrEqual(94);
  });
});
