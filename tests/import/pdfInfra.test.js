/* tests/import/pdfInfra.test.js — Unit 5: PDF infrastructure.
 *
 * Tests cover the pure components: operator walker, text-bands grouper,
 * and publisher fingerprint. The pdfDocLoader requires pdfjsLib + a real
 * Worker, so it's smoke-tested elsewhere.
 */

const path = require('path');
const fs = require('fs');
const ENGINE = require(path.resolve(__dirname, '..', '..', 'import-engine', 'index.js'));
const { walkOperatorList, _DEFAULT_OPS: OPS } = ENGINE;
const { groupTextBands } = ENGINE;
const { detectPublisher } = ENGINE;

function opList(seq) {
  // seq = [[opName, args], ...]
  const fnArray = [];
  const argsArray = [];
  for (const [name, args] of seq) {
    if (!(name in OPS)) throw new Error('Unknown OP: ' + name);
    fnArray.push(OPS[name]);
    argsArray.push(args || []);
  }
  return { fnArray, argsArray };
}

describe('operatorWalker', () => {
  it('emits a fillRect for a simple rectangle fill', () => {
    const events = walkOperatorList(opList([
      ['setFillRGBColor', [255, 0, 0]],
      ['rectangle', [10, 20, 5, 7]],
      ['fill', []],
    ]), OPS);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('fillRect');
    expect(events[0].fill).toEqual([255, 0, 0]);
    expect(events[0].x).toBe(10);
    expect(events[0].y).toBe(20);
    expect(events[0].w).toBe(5);
    expect(events[0].h).toBe(7);
  });

  it('honours save/restore for graphics state', () => {
    const events = walkOperatorList(opList([
      ['setFillRGBColor', [255, 0, 0]],
      ['save', []],
      ['setFillRGBColor', [0, 255, 0]],
      ['rectangle', [0, 0, 1, 1]],
      ['fill', []],
      ['restore', []],
      ['rectangle', [2, 2, 1, 1]],
      ['fill', []],
    ]), OPS);
    expect(events).toHaveLength(2);
    expect(events[0].fill).toEqual([0, 255, 0]);
    expect(events[1].fill).toEqual([255, 0, 0]);
  });

  it('applies the CTM to coordinates', () => {
    const events = walkOperatorList(opList([
      ['transform', [1, 0, 0, 1, 100, 50]], // translate
      ['rectangle', [0, 0, 3, 3]],
      ['fill', []],
    ]), OPS);
    expect(events[0].x).toBe(100);
    expect(events[0].y).toBe(50);
  });

  it('detects line segments', () => {
    const events = walkOperatorList(opList([
      ['setLineWidth', [1.5]],
      ['setStrokeRGBColor', [0, 0, 0]],
      ['moveTo', [0, 0]],
      ['lineTo', [10, 10]],
      ['stroke', []],
    ]), OPS);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('line');
    expect(events[0].x1).toBe(0); expect(events[0].x2).toBe(10);
    expect(events[0].lineWidth).toBe(1.5);
  });

  it('emits text events with computed position', () => {
    const events = walkOperatorList(opList([
      ['beginText', []],
      ['setFont', ['Helvetica', 12]],
      ['setTextMatrix', [1, 0, 0, 1, 50, 100]],
      ['showText', ['Hello']],
      ['endText', []],
    ]), OPS);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('text');
    expect(events[0].text).toBe('Hello');
    expect(events[0].x).toBe(50);
    expect(events[0].y).toBe(100);
    expect(events[0].font.name).toBe('Helvetica');
  });

  it('handles constructPath bundles', () => {
    const events = walkOperatorList(opList([
      ['constructPath', [[OPS.rectangle], [10, 10, 4, 4], null]],
      ['fill', []],
    ]), OPS);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe('fillRect');
    expect(events[0].x).toBe(10);
  });
});

describe('groupTextBands', () => {
  it('groups text events by Y coordinate', () => {
    const items = [
      { type: 'text', x: 10, y: 100, text: 'A', font: { size: 10 } },
      { type: 'text', x: 30, y: 101, text: 'B', font: { size: 10 } },
      { type: 'text', x: 10, y: 80,  text: 'C', font: { size: 10 } },
    ];
    const bands = groupTextBands(items);
    expect(bands).toHaveLength(2);
    expect(bands[0].text).toBe('A B');
    expect(bands[1].text).toBe('C');
  });

  it('orders items left-to-right inside each band', () => {
    const items = [
      { type: 'text', x: 30, y: 100, text: 'second', font: { size: 10 } },
      { type: 'text', x: 5,  y: 100, text: 'first', font: { size: 10 } },
    ];
    const bands = groupTextBands(items);
    expect(bands[0].text).toBe('first second');
  });

  it('accepts pdfjs textContent items', () => {
    const items = [
      { str: 'Title', transform: [1, 0, 0, 1, 50, 200], height: 14 },
      { str: 'sub',   transform: [1, 0, 0, 1, 50, 180], height: 10 },
    ];
    const bands = groupTextBands(items);
    expect(bands).toHaveLength(2);
    expect(bands[0].text).toBe('Title');
    expect(bands[1].text).toBe('sub');
  });
});

describe('detectPublisher', () => {
  it('detects DMC from sample text', () => {
    const r = detectPublisher({
      info: { Producer: 'Adobe PDF Library' },
      sample: 'Color Key by DMC Studio thread #310',
    });
    expect(r.id).toBe('dmc');
    expect(r.confidence).toBe(0.95);
  });

  it('detects DMC from XMP metadata creator', () => {
    const r = detectPublisher({ xmp: { 'xmp:creatortool': 'DMC Creative World' } });
    expect(r.id).toBe('dmc');
  });

  it('detects PatternKeeper', () => {
    const r = detectPublisher({ info: { Producer: 'PatternKeeper 1.2' } });
    expect(r.id).toBe('patternkeeper');
  });

  it('returns unknown when nothing matches', () => {
    const r = detectPublisher({ info: { Producer: 'Microsoft Word' } });
    expect(r.id).toBe('unknown');
    expect(r.confidence).toBe(0);
  });

  it('detects DMC against the real fixture', () => {
    const fixture = path.resolve(__dirname, '..', '..', 'reports', 'import-2-raw', 'PAT1968_2.analysis.json');
    if (!fs.existsSync(fixture)) return;
    const j = JSON.parse(fs.readFileSync(fixture, 'utf8'));
    const sample = (j.pages || []).map(p => p.longTextSample || '').join('\n');
    const r = detectPublisher({ info: j.info, xmp: j.metadata, sample });
    expect(r.id).toBe('dmc');
  });
});
