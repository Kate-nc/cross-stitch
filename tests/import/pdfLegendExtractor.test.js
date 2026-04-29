/* tests/import/pdfLegendExtractor.test.js — Unit 7. */

const path = require('path');
const ENGINE = require(path.resolve(__dirname, '..', '..', 'import-engine', 'index.js'));
const { extractRow, extractRows, buildLegend, classifyStitchType } = ENGINE;

describe('classifyStitchType', () => {
  it('detects backstitch trilingually', () => {
    expect(classifyStitchType('backstitch')).toBe('bs');
    expect(classifyStitchType('point arrière')).toBe('bs');
    expect(classifyStitchType('punto atrás')).toBe('bs');
  });
  it('detects half stitch', () => {
    expect(classifyStitchType('half stitch')).toBe('half');
    expect(classifyStitchType('demi-point')).toBe('half');
  });
  it('detects quarter stitch', () => {
    expect(classifyStitchType('quarter stitch')).toBe('quarter');
    expect(classifyStitchType('1/4')).toBe('quarter');
  });
  it('defaults to full when ambiguous', () => {
    expect(classifyStitchType('')).toBe('full');
    expect(classifyStitchType('cross stitch')).toBe('full');
  });
  it('detects three-quarter stitch', () => {
    expect(classifyStitchType('three-quarter stitch')).toBe('threequarter');
    expect(classifyStitchType('3/4')).toBe('threequarter');
  });
});

describe('extractRow', () => {
  it('parses a simple row "★ 310 Black 2 strands"', () => {
    const r = extractRow('★ 310 Black 2 strands cross stitch');
    expect(r.code).toBe('310');
    expect(r.glyph).toBe('★');
    expect(r.label).toBe('Black');
    expect(r.strands).toBe(2);
    expect(r.type).toBe('full');
    expect(r.confidence).toBeGreaterThan(0.8);
  });

  it('parses backstitch row in French', () => {
    const r = extractRow('● 310 Noir point arrière');
    expect(r.code).toBe('310');
    expect(r.type).toBe('bs');
  });

  it('parses light effects code (E168)', () => {
    const r = extractRow('a E168 Silver');
    expect(r.code).toBe('E168');
  });

  it('parses 4-digit DMC code with whitespace', () => {
    const r = extractRow('Z 5852 Gold metallic');
    expect(r.code).toBe('5852');
  });

  it('returns null for rows with no DMC code', () => {
    expect(extractRow('No code on this line')).toBeNull();
    expect(extractRow('')).toBeNull();
    expect(extractRow(null)).toBeNull();
  });

  it('accepts a band object {text} or {items}', () => {
    expect(extractRow({ text: '◆ 930 Antique Blue' }).code).toBe('930');
    expect(extractRow({ items: [{ str: '◆' }, { str: '930' }, { str: 'Blue' }] }).code).toBe('930');
  });

  it('omits glyph when token before code is too long', () => {
    const r = extractRow('SOMELONGWORD 310 Black');
    expect(r.glyph).toBe('');
  });
});

describe('extractRows / buildLegend', () => {
  it('deduplicates by glyph+code+type', () => {
    const bands = [
      { text: '★ 310 Black' },
      { text: '★ 310 Black' },
      { text: '◆ 930 Blue' },
    ];
    const rows = extractRows(bands);
    expect(rows).toHaveLength(2);
  });

  it('buildLegend exposes codes set, byGlyph map, average confidence', () => {
    const bands = [
      { text: '★ 310 Black 2 strands' },
      { text: '◆ 930 Antique Blue 2 strands' },
      { text: '+ 5852 Gold metallic' },
    ];
    const lg = buildLegend(bands);
    expect(lg.codes.size).toBe(3);
    expect(lg.codes.has('310')).toBe(true);
    expect(lg.byGlyph.get('★').code).toBe('310');
    expect(lg.confidence).toBeGreaterThan(0.5);
    expect(lg.confidence).toBeLessThanOrEqual(1);
  });

  it('returns empty result for non-array input', () => {
    expect(extractRows(null)).toEqual([]);
    expect(buildLegend(undefined).rows).toEqual([]);
  });
});
