// tests/sampleStarter.test.js
// A5: Sample row + creator coachmark on empty Home.
// Verifies the buildSampleProject helper returns a valid v9 project shape
// and that home-screen.js wires the EmptyState secondary CTA correctly.

const fs = require('fs');
const path = require('path');

const HOME_SCREEN_SRC = fs.readFileSync(
  path.join(__dirname, '..', 'home-screen.js'),
  'utf8'
);

// Extract buildSampleProject from home-screen.js (top-of-file pure helper).
function loadBuildSampleProject() {
  const match = HOME_SCREEN_SRC.match(
    /function buildSampleProject\(\)\s*\{[\s\S]*?\n\}/
  );
  if (!match) throw new Error('buildSampleProject not found in home-screen.js');
  // eslint-disable-next-line no-new-func
  const fn = new Function(match[0] + '; return buildSampleProject;')();
  return fn;
}

describe('A5 — buildSampleProject', () => {
  const buildSampleProject = loadBuildSampleProject();

  test('returns a v9 project with 16x16 pattern', () => {
    const p = buildSampleProject();
    expect(p.v).toBe(9);
    expect(p.w).toBe(16);
    expect(p.h).toBe(16);
    expect(Array.isArray(p.pattern)).toBe(true);
    expect(p.pattern.length).toBe(256);
  });

  test('settings carry sW/sH/fabricCt and sensible defaults', () => {
    const p = buildSampleProject();
    expect(p.settings).toBeDefined();
    expect(p.settings.sW).toBe(16);
    expect(p.settings.sH).toBe(16);
    expect(p.settings.fabricCt).toBe(14);
    expect(typeof p.settings.skeinPrice).toBe('number');
  });

  test('contains DMC 321 stitches and skip cells', () => {
    const p = buildSampleProject();
    const reds = p.pattern.filter(c => c && c.id === '321');
    const skips = p.pattern.filter(c => c && c.id === '__skip__');
    expect(reds.length).toBeGreaterThan(20);
    expect(reds.length).toBeLessThan(120);
    expect(reds.length + skips.length).toBe(256);
    // Each red cell should have rgb tuple.
    reds.forEach(c => {
      expect(c.type).toBe('solid');
      expect(Array.isArray(c.rgb)).toBe(true);
      expect(c.rgb.length).toBe(3);
    });
  });

  test('marked as a sample so analytics/UI can distinguish it', () => {
    const p = buildSampleProject();
    expect(p.isSample).toBe(true);
    expect(p.name).toBe('Sample heart');
  });

  test('has empty progress tracking (fresh project)', () => {
    const p = buildSampleProject();
    expect(p.done).toBeNull();
    expect(p.totalTime).toBe(0);
    expect(p.sessions).toEqual([]);
  });
});

describe('A5 — EmptyState wiring', () => {
  test('home-screen.js EmptyState branch passes secondaryLabel + secondaryAction', () => {
    expect(HOME_SCREEN_SRC).toMatch(/secondaryLabel:\s*'Try a sample pattern'/);
    expect(HOME_SCREEN_SRC).toMatch(/secondaryAction:\s*function/);
  });

  test('secondary action calls ProjectStorage.save and navigates to stitch.html', () => {
    expect(HOME_SCREEN_SRC).toMatch(/buildSampleProject\(\)/);
    expect(HOME_SCREEN_SRC).toMatch(/ProjectStorage\.save\(sample\)/);
    expect(HOME_SCREEN_SRC).toMatch(/setActiveProject\(id\)/);
    expect(HOME_SCREEN_SRC).toMatch(/window\.location\.href\s*=\s*'stitch\.html'/);
  });
});
