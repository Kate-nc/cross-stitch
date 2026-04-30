/* tests/import/pdfDmcClassify.test.js — Unit 6: DMC PDF page classifier. */

const path = require('path');
const fs = require('fs');
const ENGINE = require(path.resolve(__dirname, '..', '..', 'import-engine', 'index.js'));
require(path.resolve(__dirname, '..', '..', 'import-engine', 'pdf', 'dmcPageRoles.js'));
const { classifyPage, classifyAllPages, inferLayoutVariant, refineChartPair } = ENGINE;

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'reports', 'import-2-raw', name), 'utf8'));
}

function pageStats(p, fixture) {
  const text = Array.isArray(p.longTextSample) ? p.longTextSample.join(' ') : (p.longTextSample || '');
  return {
    pageNum: p.pageNum,
    textSample: text,
    fonts: p.fontsUsed || [],
    opCounts: p.opSummary || {},
    hasLargeImage: (p.images || []).some(im => im && im.frac >= 0.6),
  };
}

describe('classifyPage (synthetic)', () => {
  it('flags a near-empty page as blank', () => {
    expect(classifyPage({ opCounts: { showText: 1 } })).toEqual({ role: 'blank', confidence: 1.0 });
  });

  it('classifies a colour chart page from fill density', () => {
    const stats = { opCounts: { setFillRGBColor: 100, fill: 5000, stroke: 500 }, textSample: '' };
    expect(classifyPage(stats).role).toBe('chart-vector-colour');
  });

  it('classifies a backstitch chart page from low fill-colour count', () => {
    const stats = { opCounts: { setFillRGBColor: 5, fill: 2000, stroke: 1500 }, textSample: '' };
    expect(classifyPage(stats).role).toBe('chart-vector-bs');
  });

  it('classifies a legend page from text codes', () => {
    const stats = {
      opCounts: { showText: 100, fill: 5 },
      textSample: 'symbol dmc colour 310 930 932 5852 5310 5283 5317 skeins échevettes',
    };
    expect(classifyPage(stats).role).toBe('legend');
  });

  it('classifies materials page from fabric tokens', () => {
    const stats = {
      opCounts: { showText: 50 },
      textSample: 'tool kit fournitures cross stitch fabric Aida 14 ct',
    };
    expect(classifyPage(stats).role).toBe('materials');
  });
});

describe('classifyAllPages — PAT1968_2 fixture', () => {
  const fixture = loadFixture('PAT1968_2.analysis.json');
  const stats = fixture.pages.map(p => pageStats(p, fixture));
  const result = classifyAllPages(stats);

  it('detects 4 pages with the right roles', () => {
    const roles = result.pages.map(p => p.role);
    expect(roles).toContain('chart-vector-colour');  // p1
    expect(roles).toContain('chart-vector-bs');       // p2
    expect(roles).toContain('materials');              // p3
    expect(roles).toContain('legend');                 // p4
  });

  it('identifies layout-A (separate BS + legend)', () => {
    expect(result.layout).toBe('layout-A');
  });

  it('every page has confidence ≥ 0.4', () => {
    for (const p of result.pages) {
      expect(p.confidence).toBeGreaterThanOrEqual(0.4);
    }
  });
});

describe('classifyAllPages — PAT2171_2 fixture', () => {
  const fixture = loadFixture('PAT2171_2.analysis.json');
  const stats = fixture.pages.map(p => pageStats(p, fixture));
  const result = classifyAllPages(stats);

  it('detects 3 pages including a colour chart', () => {
    const roles = result.pages.map(p => p.role);
    expect(roles).toContain('chart-vector-colour'); // p3 has 1731 fillRGB / 2733 fills
    expect(roles).toContain('materials');            // p2: tool kit
  });

  it('infers layout-B (no separate legend page)', () => {
    expect(result.layout).toBe('layout-B');
  });
});

describe('refineChartPair', () => {
  it('swaps roles when stroke > fill ratio identifies the BS page', () => {
    const pageA = { opCounts: { setFillRGBColor: 5,  fill: 100, stroke: 800 }, role: 'chart-vector-colour', confidence: 0.9 };
    const pageB = { opCounts: { setFillRGBColor: 80, fill: 500, stroke: 200 }, role: 'chart-vector-colour', confidence: 0.9 };
    const [a, b] = refineChartPair(pageA, pageB);
    expect(a.role).toBe('chart-vector-bs');
    expect(b.role).toBe('chart-vector-colour');
  });
});

describe('inferLayoutVariant', () => {
  it('returns layout-A when a separate BS page exists', () => {
    expect(inferLayoutVariant([{ role: 'chart-vector-bs' }, { role: 'chart-vector-colour' }, { role: 'legend' }])).toBe('layout-A');
  });
  it('returns layout-B when only chart-combined exists', () => {
    expect(inferLayoutVariant([{ role: 'chart-combined' }, { role: 'cover' }])).toBe('layout-B');
  });
});
