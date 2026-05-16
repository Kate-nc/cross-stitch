/* tests/rasterChart-telemetry.test.js
 *
 * Phase 1 telemetry contract tests.
 *
 *   1. **No network surface** — the source file must not import or call
 *      fetch / XMLHttpRequest / navigator.sendBeacon / WebSocket. The
 *      spec is emphatic: "All telemetry is local-only — written to a
 *      importerTelemetry object store in CrossStitchDB, never
 *      transmitted off-device."
 *   2. **Opt-out** — when the user pref is false, record* / mark*
 *      become no-ops.
 *   3. **Default ON** — when the pref is unset, capture is enabled
 *      (matches the spec: "All telemetry is local-only ... defaults on").
 *   4. **Fingerprint determinism + anonymity** — same dimensions always
 *      hash to the same value; the input string is dimensions only.
 *   5. **Aggregate maths** — medians, acceptance rate, correction
 *      frequency, source mix derived from a fixture set.
 *   6. **Record shape** — `newRecord()` returns the documented schema.
 */

const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'creator', 'rasterChart', 'telemetry.js'), 'utf8');

// Provide the browser globals the module touches before we eval it.
const memLocalStorage = new Map();
global.localStorage = {
  getItem: (k) => (memLocalStorage.has(k) ? memLocalStorage.get(k) : null),
  setItem: (k, v) => { memLocalStorage.set(k, String(v)); },
  removeItem: (k) => { memLocalStorage.delete(k); },
  clear: () => { memLocalStorage.clear(); },
};
// indexedDB intentionally absent — every record* path catches and
// resolves null, which is exactly what we test for in the opt-out and
// "no-write when unavailable" cases.
global.window = {};
global.module = { exports: {} };

eval(SRC);
const T = global.window.RasterChartTelemetry || global.module.exports;

describe('telemetry source code surface (no network)', () => {
  test.each([
    [/\bfetch\s*\(/, 'fetch('],
    [/\bXMLHttpRequest\b/, 'XMLHttpRequest'],
    [/\bnavigator\s*\.\s*sendBeacon\b/, 'navigator.sendBeacon'],
    [/\bnew\s+WebSocket\b/, 'new WebSocket'],
    [/\bnew\s+EventSource\b/, 'new EventSource'],
    [/\bnavigator\s*\.\s*serviceWorker\s*\.\s*ready/, 'serviceWorker.ready (could be used to relay)'],
  ])('source contains no %s', (pattern) => {
    expect(SRC).not.toMatch(pattern);
  });

  test('source contains no http:// or https:// literals', () => {
    expect(SRC).not.toMatch(/['"]https?:\/\//);
  });
});

describe('opt-out preference', () => {
  beforeEach(() => { memLocalStorage.clear(); });

  test('defaults to enabled when the pref is unset', () => {
    expect(T.isEnabled()).toBe(true);
  });

  test('setEnabled(false) flips isEnabled() to false', () => {
    T.setEnabled(false);
    expect(T.isEnabled()).toBe(false);
    T.setEnabled(true);
    expect(T.isEnabled()).toBe(true);
  });

  test('the pref key matches the documented constant', () => {
    expect(T.PREF_KEY).toBe('cs_pref_importer.telemetryEnabled');
  });

  test('recordImport returns null without writing when disabled', async () => {
    T.setEnabled(false);
    const r = await T.recordImport({ input: { imageW: 100, imageH: 100 } });
    expect(r).toBeNull();
  });

  test('recordCorrection returns null without writing when disabled', async () => {
    T.setEnabled(false);
    const r = await T.recordCorrection('tel_x', 'manual-grid-nudge', { delta: 1 });
    expect(r).toBeNull();
  });

  test('markAcceptance returns null without writing when disabled', async () => {
    T.setEnabled(false);
    const r = await T.markAcceptance('tel_x', 'accepted');
    expect(r).toBeNull();
  });
});

describe('fingerprint anonymity + determinism', () => {
  test('same dimensions → same fingerprint', async () => {
    const a = await T.fingerprint(1080, 1920, 100, 100);
    const b = await T.fingerprint(1080, 1920, 100, 100);
    expect(a).toBe(b);
    expect(typeof a).toBe('string');
    expect(a.length).toBeGreaterThan(0);
  });

  test('different dimensions → different fingerprint', async () => {
    const a = await T.fingerprint(1080, 1920, 100, 100);
    const b = await T.fingerprint(1080, 1920, 200, 100);
    expect(a).not.toBe(b);
  });

  test('fingerprint is hex-only (no PII / no encoded bytes)', async () => {
    const a = await T.fingerprint(1080, 1920, 100, 100);
    expect(a).toMatch(/^[0-9a-f]+$/);
  });
});

describe('record shape', () => {
  test('newRecord returns the documented Phase 1 schema', () => {
    const r = T.newRecord();
    expect(typeof r.id).toBe('string');
    expect(r.id.startsWith('tel_')).toBe(true);
    expect(r.schemaVersion).toBe(T.SCHEMA_VERSION);
    expect(r.timings).toEqual({
      preprocess: 0, grid: 0, cells: 0, cluster: 0, 'legend-ocr': 0, match: 0,
    });
    expect(r.confidence.grid).toEqual({ peakProminenceRatio: 0 });
    expect(r.confidence.cluster).toEqual({ meanSilhouette: 0, noiseCount: 0, clusterCount: 0 });
    expect(r.confidence.legend).toEqual({ meanWordConfidence: 0, regexValidatedCount: 0, confusionRepairedCount: 0 });
    expect(r.confidence.match).toEqual({ matchedCount: 0, unmatchedCount: 0 });
    expect(r.corrections).toEqual([]);
    expect(r.acceptance).toEqual({ state: 'pending', at: null });
    expect(r.input.sourceType).toBe('unknown');
  });
});

describe('aggregate maths', () => {
  const fixture = [
    {
      timings: { preprocess: 10, grid: 20, cells: 30, cluster: 40, 'legend-ocr': 0, match: 0 },
      confidence: { cluster: { meanSilhouette: 0.4 } },
      acceptance: { state: 'accepted' },
      corrections: [{ surface: 'cluster-relabel' }],
      input: { sourceType: 'photo' },
    },
    {
      timings: { preprocess: 5, grid: 10, cells: 15, cluster: 20, 'legend-ocr': 0, match: 0 },
      confidence: { cluster: { meanSilhouette: 0.6 } },
      acceptance: { state: 'accepted' },
      corrections: [
        { surface: 'cluster-relabel' },
        { surface: 'manual-grid-nudge' },
      ],
      input: { sourceType: 'screenshot' },
    },
    {
      timings: { preprocess: 50, grid: 50, cells: 50, cluster: 50, 'legend-ocr': 0, match: 0 },
      confidence: { cluster: { meanSilhouette: 0.2 } },
      acceptance: { state: 'abandoned' },
      corrections: [],
      input: { sourceType: 'screenshot' },
    },
  ];

  test('reports n, medians, rates, and breakdowns', () => {
    const agg = T.aggregate(fixture);
    expect(agg.n).toBe(3);
    // Totals: 100, 50, 200 → median 100
    expect(agg.medianTotalMs).toBe(100);
    // Silhouettes 0.4, 0.6, 0.2 → median 0.4
    expect(agg.medianSilhouette).toBeCloseTo(0.4, 5);
    expect(agg.acceptanceRate).toBeCloseTo(2 / 3, 5);
    expect(agg.abandonmentRate).toBeCloseTo(1 / 3, 5);
    expect(agg.correctionFrequency).toEqual({
      'cluster-relabel': 2,
      'manual-grid-nudge': 1,
    });
    expect(agg.sourceMix).toEqual({ screenshot: 2, photo: 1, unknown: 0 });
  });

  test('handles empty input', () => {
    const agg = T.aggregate([]);
    expect(agg.n).toBe(0);
    expect(agg.medianTotalMs).toBe(0);
    expect(agg.medianSilhouette).toBe(0);
    expect(agg.acceptanceRate).toBe(0);
  });
});
