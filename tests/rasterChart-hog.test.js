/* tests/rasterChart-hog.test.js */
const { hog, dHash, hammingBigInt, l2, DEFAULTS } =
  require('../creator/rasterChart/hog.js');

const P = 32;
function blank()  { return new Uint8Array(P * P); }
function filled(v) { const a = new Uint8Array(P * P); a.fill(v); return a; }

function verticalEdge() {
  const a = new Uint8Array(P * P);
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) a[y * P + x] = x < P / 2 ? 0 : 255;
  return a;
}
function horizontalEdge() {
  const a = new Uint8Array(P * P);
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) a[y * P + x] = y < P / 2 ? 0 : 255;
  return a;
}
function cross() {
  const a = new Uint8Array(P * P);
  for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
    if (x === P / 2 || y === P / 2) a[y * P + x] = 255;
  }
  return a;
}

describe('hog — descriptor', () => {
  test('output length matches expected formula', () => {
    const f = hog(blank());
    const nCells = P / DEFAULTS.cell;
    const nBlocks = nCells - DEFAULTS.block + 1;
    const expected = nBlocks * nBlocks * DEFAULTS.block * DEFAULTS.block * DEFAULTS.bins;
    expect(f.length).toBe(expected);
  });

  test('uniform image → all-zero descriptor', () => {
    const f = hog(filled(128));
    expect(f.every(v => v === 0)).toBe(true);
  });

  test('vertical and horizontal edges produce different descriptors', () => {
    const a = hog(verticalEdge());
    const b = hog(horizontalEdge());
    expect(l2(a, b)).toBeGreaterThan(0.5);
  });

  test('identical input → identical output (determinism)', () => {
    const a = hog(cross());
    const b = hog(cross());
    expect(Array.from(a)).toEqual(Array.from(b));
  });

  test('wrong patch size throws', () => {
    expect(() => hog(new Uint8Array(10))).toThrow(/expected/);
  });
});

describe('dHash + hamming', () => {
  test('identical patches → distance 0', () => {
    expect(hammingBigInt(dHash(verticalEdge()), dHash(verticalEdge()))).toBe(0);
  });
  test('different patterns → non-zero hamming distance', () => {
    // dHash compares left-to-right within rows. A horizontal edge yields a
    // mostly-uniform per-row signal, while a checkerboard creates many
    // sign-flips. The Hamming gap is informational rather than dramatic.
    function checker() {
      const a = new Uint8Array(P * P);
      for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
        a[y * P + x] = ((x >> 2) + (y >> 2)) & 1 ? 0 : 255;
      }
      return a;
    }
    const d = hammingBigInt(dHash(horizontalEdge()), dHash(checker()));
    expect(d).toBeGreaterThan(0);
  });
});
