/* tests/rasterChart-projectionProfile.test.js */
const { findPeaks, gridFromProfiles, median, detectMajorPeriod } =
  require('../creator/rasterChart/projectionProfile.js');

function synthesise1D(n, peakIndices, peakValue, minorValue) {
  const a = new Float32Array(n);
  a.fill(minorValue || 0);
  for (const i of peakIndices) if (i >= 0 && i < n) a[i] = peakValue;
  return a;
}

describe('findPeaks', () => {
  test('finds clean evenly-spaced peaks', () => {
    const profile = synthesise1D(100, [10, 20, 30, 40, 50, 60, 70, 80, 90], 10);
    const peaks = findPeaks(profile, { minProminenceFrac: 0.3, minSpacing: 5 });
    expect(peaks).toEqual([10, 20, 30, 40, 50, 60, 70, 80, 90]);
  });

  test('respects minProminenceFrac', () => {
    const a = new Float32Array(50);
    a[10] = 10; a[20] = 2; a[30] = 10;
    const peaks = findPeaks(a, { minProminenceFrac: 0.5 });
    expect(peaks).toEqual([10, 30]);
  });

  test('enforces minSpacing by greedy NMS', () => {
    const a = new Float32Array(50);
    a[10] = 8; a[12] = 10; // both peaks within window
    const peaks = findPeaks(a, { minSpacing: 5 });
    expect(peaks).toEqual([12]); // stronger wins
  });

  test('returns empty for flat input', () => {
    const a = new Float32Array(20);
    expect(findPeaks(a)).toEqual([]);
  });
});

describe('gridFromProfiles', () => {
  test('recovers cell pitch within 1px on a synthetic 50×50 chart', () => {
    const w = 500, h = 500, pitch = 10;
    const colSum = new Float32Array(w);
    const rowSum = new Float32Array(h);
    for (let i = 0; i <= 50; i++) {
      const x = i * pitch;
      if (x < w) colSum[x] = 100;
      if (x < h) rowSum[x] = 100;
    }
    const g = gridFromProfiles(rowSum, colSum, { expectedCellSizeHint: 10 });
    expect(Math.abs(g.cellPitch - pitch)).toBeLessThanOrEqual(1);
    expect(g.rows).toBeGreaterThan(40);
    expect(g.cols).toBeGreaterThan(40);
    expect(g.confidence).toBeGreaterThan(0.5);
  });

  test('reports zero confidence when no peaks', () => {
    const empty = new Float32Array(100);
    const g = gridFromProfiles(empty, empty);
    expect(g.cellPitch).toBe(0);
    expect(g.confidence).toBe(0);
  });
});

describe('detectMajorPeriod', () => {
  test('detects every-10 major lines', () => {
    const n = 110;
    const profile = new Float32Array(n);
    const peaks = [];
    for (let i = 0; i <= 100; i++) {
      const v = (i % 10 === 0) ? 100 : 50;
      profile[i] = v;
      peaks.push(i);
    }
    expect(detectMajorPeriod(peaks, profile)).toBe(10);
  });

  test('returns 0 when no bimodal split', () => {
    const profile = new Float32Array(50);
    const peaks = [];
    for (let i = 0; i < 20; i++) { profile[i * 2] = 10; peaks.push(i * 2); }
    expect(detectMajorPeriod(peaks, profile)).toBe(0);
  });
});

describe('median', () => {
  test('odd-length', () => { expect(median([1, 2, 3])).toBe(2); });
  test('even-length', () => { expect(median([1, 2, 3, 4])).toBe(2.5); });
  test('empty', () => { expect(median([])).toBe(0); });
});
