/* tests/pdfTheme.test.js — UX-12 Phase 7 PR #14
 *
 * Verifies the optional Workshop print theme is plumbed through correctly
 * AND that the default PK-compat path remains bit-stable. Pattern Keeper
 * regressions are catastrophic for end users, so several assertions here
 * are deliberately defensive against accidental changes to the legacy
 * path (font flags, embedding line, default theme value).
 */
const fs = require('fs');
const path = require('path');
const layout = require('../creator/pdfChartLayout.js');

const WORKER_SRC = fs.readFileSync(path.join(__dirname, '..', 'pdf-export-worker.js'), 'utf8');
const LAYOUT_SRC = fs.readFileSync(path.join(__dirname, '..', 'creator', 'pdfChartLayout.js'), 'utf8');
const EXPORT_SRC = fs.readFileSync(path.join(__dirname, '..', 'creator', 'pdfExport.js'), 'utf8');

describe('Layout.themeColors', () => {
  test('exists and is a function', () => {
    expect(typeof layout.themeColors).toBe('function');
  });

  test("theme === 'workshop' returns terracotta major-grid + linen page background", () => {
    const t = layout.themeColors('workshop');
    expect(t).toBeTruthy();
    // Terracotta = rgb(184, 92, 56) ≈ (0.722, 0.361, 0.220) in pdf-lib's 0..1 scale.
    expect(t.majorGrid).toBeTruthy();
    expect(t.majorGrid[0]).toBeCloseTo(0.722, 3);
    expect(t.majorGrid[1]).toBeCloseTo(0.361, 3);
    expect(t.majorGrid[2]).toBeCloseTo(0.220, 3);
    // Linen ≈ rgb(251, 248, 243) ≈ (0.984, 0.973, 0.953)
    expect(t.pageBg).toBeTruthy();
    expect(t.pageBg[0]).toBeCloseTo(0.984, 3);
    expect(t.pageBg[1]).toBeCloseTo(0.973, 3);
    expect(t.pageBg[2]).toBeCloseTo(0.953, 3);
  });

  test("theme === 'pk' (default) returns null channels — callers fall through to legacy literals", () => {
    const t = layout.themeColors('pk');
    expect(t.majorGrid).toBeNull();
    expect(t.pageBg).toBeNull();
  });

  test('unknown / undefined theme also falls through to PK-compat path', () => {
    expect(layout.themeColors(undefined).majorGrid).toBeNull();
    expect(layout.themeColors(null).pageBg).toBeNull();
    expect(layout.themeColors('something-new').majorGrid).toBeNull();
  });
});

describe('pdf-export-worker theme plumbing', () => {
  test('reads options.theme into a local guarded variable', () => {
    expect(/options\.theme\s*===\s*"workshop"/.test(WORKER_SRC)).toBe(true);
    expect(/Layout\.themeColors\s*\(\s*theme\s*\)/.test(WORKER_SRC)).toBe(true);
  });

  test('drawChartPage gates major-grid colour swap behind themeCols.majorGrid', () => {
    // The terracotta swap must be conditional. Look for a guard that checks
    // themeCols.majorGrid before reassigning `major`.
    expect(
      /if\s*\(\s*themeCols\s*&&\s*themeCols\.majorGrid\s*\)\s*\{[\s\S]*?major\s*=\s*rgbColor/m.test(WORKER_SRC)
    ).toBe(true);
  });

  test('paintWorkshopBackground helper exists and is a no-op when themeCols.pageBg is falsy', () => {
    expect(/function\s+paintWorkshopBackground\s*\(/.test(WORKER_SRC)).toBe(true);
    expect(/if\s*\(!themeCols\s*\|\|\s*!themeCols\.pageBg\)\s*return/.test(WORKER_SRC)).toBe(true);
  });

  test('PK-compat font flags remain present (subset:false, useObjectStreams:false)', () => {
    expect(/embedFont\([^)]*\{\s*subset:\s*false\s*\}/.test(WORKER_SRC)).toBe(true);
    expect(/save\(\s*\{\s*useObjectStreams:\s*false\s*\}\s*\)/.test(WORKER_SRC)).toBe(true);
  });

  test('CrossStitchSymbols font embedding line is unchanged', () => {
    // base64ToUint8(FONT_B64) → embedFont — both must still be there.
    expect(/var\s+fontBytes\s*=\s*base64ToUint8\(FONT_B64\)/.test(WORKER_SRC)).toBe(true);
    expect(/symbolFont\s*=\s*await\s+pdfDoc\.embedFont\(fontBytes,\s*\{\s*subset:\s*false\s*\}\)/.test(WORKER_SRC)).toBe(true);
  });
});

describe('pdfExport.js public exportPDF default', () => {
  test("legacyExportPDF defaults theme to 'pk' when option omitted", () => {
    // The shim should only opt into 'workshop' if explicitly requested OR if
    // the user pref is true; otherwise it falls back to 'pk'.
    expect(/theme:\s*\(legacy\.theme\s*===\s*"workshop"\s*\|\|\s*readWorkshopThemePref\(\)\)\s*\?\s*"workshop"\s*:\s*"pk"/.test(EXPORT_SRC)).toBe(true);
  });

  test('readWorkshopThemePref reads creator.pdfWorkshopTheme via UserPrefs', () => {
    expect(/UserPrefs\.get\(\s*["']creator\.pdfWorkshopTheme["']\s*\)/.test(EXPORT_SRC)).toBe(true);
  });
});

describe('pdfChartLayout themeColors source guards PK-compat', () => {
  test("source mentions 'pk' branch returning null (no colour change)", () => {
    expect(/theme\s*===\s*["']workshop["']/.test(LAYOUT_SRC)).toBe(true);
    expect(/majorGrid:\s*null/.test(LAYOUT_SRC)).toBe(true);
    expect(/pageBg:\s*null/.test(LAYOUT_SRC)).toBe(true);
  });
});
