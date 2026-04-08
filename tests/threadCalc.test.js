const { stitchesToSkeins, skeinsToStitches } = require('../threadCalc.js');

// ---------------------------------------------------------------------------
// stitchesToSkeins — core formula
// ---------------------------------------------------------------------------

describe('stitchesToSkeins — non-blended', () => {
    describe('parameterized tests', () => {
        test.each([
            // stitchCount, fabricCount, strandsUsed, skeinLengthM, wasteFactor, expectedExact, expectedBuy
            [5000, 14, 2, 8.0, 0.20, 2.27, 3],
            [1000, 14, 2, 8.0, 0.20, 0.45, 1],
            [1000, 18, 2, 8.0, 0.20, 0.35, 1],
            [1000, 14, 3, 8.0, 0.20, 0.68, 1],
            [5000, 14, 2, 10.0, 0.20, 1.81, 2], // Madeira length
            [5000, 14, 2, 8.0, 0.10, 2.02, 3],  // Lower waste
            [5000, 14, 2, 8.0, 0.30, 2.59, 3],  // Higher waste
            [0, 14, 2, 8.0, 0.20, 0, 0]         // Zero stitches
        ])(
            'given %p stitches, %pct, %p strands, %pm skein, %p waste → expects ~%p exact, %p to buy',
            (stitchCount, fabricCount, strandsUsed, skeinLengthM, wasteFactor, expectedExact, expectedBuy) => {
                const result = stitchesToSkeins({
                    stitchCount,
                    fabricCount,
                    strandsUsed,
                    skeinLengthM,
                    wasteFactor
                });
                expect(result.skeinsExact).toBeCloseTo(expectedExact, 1);
                expect(result.skeinsToBuy).toBe(expectedBuy);
            }
        );
    });

    it('brief verification: 5000 stitches, 2 strands, 14ct, 8m skein, 20% waste → ~2.27 skeins', () => {
        const result = stitchesToSkeins({
            stitchCount: 5000,
            fabricCount: 14,
            strandsUsed: 2,
            skeinLengthM: 8.0,
            wasteFactor: 0.20
        });
        // Expected = (5000 * (2.54/14 * 4.8 * 2)) / (800 * 6 * 0.8) ≈ 2.267
        expect(result.skeinsExact).toBeCloseTo(2.27, 1);
        expect(result.skeinsToBuy).toBe(3);
    });

    it('returns exact and rounded skein counts', () => {
        const result = stitchesToSkeins({ stitchCount: 1000, fabricCount: 14 });
        expect(result).toHaveProperty('skeinsExact');
        expect(result).toHaveProperty('skeinsToBuy');
        expect(result.skeinsToBuy).toBe(Math.ceil(result.skeinsExact));
    });

    it('returns skeinsExact > 0 for stitch counts that are large enough to register', () => {
        // skeinsExact is rounded to 2dp; need enough stitches to avoid rounding to 0
        const result = stitchesToSkeins({ stitchCount: 100, fabricCount: 14 });
        expect(result.skeinsExact).toBeGreaterThan(0);
    });

    it('result scales linearly with stitch count (within rounding tolerance)', () => {
        const r1 = stitchesToSkeins({ stitchCount: 1000, fabricCount: 14 });
        const r2 = stitchesToSkeins({ stitchCount: 2000, fabricCount: 14 });
        // skeinsExact is rounded to 2dp, so allow ±0.05
        expect(r2.skeinsExact).toBeCloseTo(r1.skeinsExact * 2, 1);
    });

    it('more strands → proportionally more skeins (within rounding tolerance)', () => {
        const r2 = stitchesToSkeins({ stitchCount: 5000, fabricCount: 14, strandsUsed: 2 });
        const r3 = stitchesToSkeins({ stitchCount: 5000, fabricCount: 14, strandsUsed: 3 });
        expect(r3.skeinsExact).toBeCloseTo(r2.skeinsExact * 1.5, 1);
    });

    it('higher fabric count → fewer skeins (finer fabric, less thread per stitch)', () => {
        const r14 = stitchesToSkeins({ stitchCount: 5000, fabricCount: 14 });
        const r18 = stitchesToSkeins({ stitchCount: 5000, fabricCount: 18 });
        expect(r18.skeinsExact).toBeLessThan(r14.skeinsExact);
    });

    it('higher wasteFactor → more skeins needed', () => {
        const rLow  = stitchesToSkeins({ stitchCount: 5000, fabricCount: 14, wasteFactor: 0.10 });
        const rHigh = stitchesToSkeins({ stitchCount: 5000, fabricCount: 14, wasteFactor: 0.30 });
        expect(rHigh.skeinsExact).toBeGreaterThan(rLow.skeinsExact);
    });

    it('longer skein → fewer skeins needed', () => {
        const r8m  = stitchesToSkeins({ stitchCount: 5000, fabricCount: 14, skeinLengthM: 8.0 });
        const r10m = stitchesToSkeins({ stitchCount: 5000, fabricCount: 14, skeinLengthM: 10.0 });
        expect(r10m.skeinsExact).toBeLessThan(r8m.skeinsExact);
    });

    it('returns totalThreadM in metres', () => {
        const result = stitchesToSkeins({ stitchCount: 5000, fabricCount: 14 });
        expect(typeof result.totalThreadM).toBe('number');
        expect(result.totalThreadM).toBeGreaterThan(0);
    });

    it('zero stitches → skeinsExact is 0, skeinsToBuy is 0', () => {
        const result = stitchesToSkeins({ stitchCount: 0, fabricCount: 14 });
        expect(result.skeinsExact).toBe(0);
        expect(result.skeinsToBuy).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// stitchesToSkeins — blended threads
// ---------------------------------------------------------------------------

describe('stitchesToSkeins — blended', () => {
    describe('parameterized tests for blends', () => {
        test.each([
            // stitchCount, fabricCount, strandsUsed, blendRatio, expectedASkeinsExact, expectedBSkeinsExact
            [5000, 14, 2, [1, 1], 1.13, 1.13],
            [5000, 14, 3, [2, 1], 2.27, 1.13],
            [5000, 14, 3, [1, 2], 1.13, 2.27],
            [10000, 18, 4, [2, 2], 3.53, 3.53],
            [0, 14, 2, [1, 1], 0, 0]
        ])(
            'given %p stitches, %pct, %p strands, ratio %p → expects colorA ~%p, colorB ~%p',
            (stitchCount, fabricCount, strandsUsed, blendRatio, expectedA, expectedB) => {
                const result = stitchesToSkeins({
                    stitchCount,
                    fabricCount,
                    strandsUsed,
                    isBlended: true,
                    blendRatio
                });
                expect(result.colorA.skeinsExact).toBeCloseTo(expectedA, 1);
                expect(result.colorB.skeinsExact).toBeCloseTo(expectedB, 1);
                expect(result.colorA.skeinsToBuy).toBe(Math.ceil(result.colorA.skeinsExact));
                expect(result.colorB.skeinsToBuy).toBe(Math.ceil(result.colorB.skeinsExact));
            }
        );
    });

    it('returns colorA and colorB objects when isBlended=true', () => {
        const result = stitchesToSkeins({
            stitchCount: 5000,
            fabricCount: 14,
            strandsUsed: 2,
            isBlended: true,
            blendRatio: [1, 1]
        });
        expect(result).toHaveProperty('colorA');
        expect(result).toHaveProperty('colorB');
        expect(result.colorA).toHaveProperty('skeinsExact');
        expect(result.colorA).toHaveProperty('skeinsToBuy');
        expect(result.colorB).toHaveProperty('skeinsExact');
        expect(result.colorB).toHaveProperty('skeinsToBuy');
    });

    it('1+1 blend: each colour uses approximately half of what a 2-strand solid would', () => {
        const solid = stitchesToSkeins({ stitchCount: 5000, fabricCount: 14, strandsUsed: 2 });
        const blend = stitchesToSkeins({
            stitchCount: 5000, fabricCount: 14, strandsUsed: 2,
            isBlended: true, blendRatio: [1, 1]
        });
        // Allow ±0.1 skein to account for rounding at 2dp
        expect(blend.colorA.skeinsExact).toBeCloseTo(solid.skeinsExact / 2, 1);
        expect(blend.colorB.skeinsExact).toBeCloseTo(solid.skeinsExact / 2, 1);
    });

    it('asymmetric blend: 2+1 splits proportionally', () => {
        const blend = stitchesToSkeins({
            stitchCount: 5000, fabricCount: 14, strandsUsed: 3,
            isBlended: true, blendRatio: [2, 1]
        });
        // colorA uses 2/3, colorB uses 1/3 → colorA needs 2× skeins of colorB (within rounding)
        expect(blend.colorA.skeinsExact).toBeCloseTo(blend.colorB.skeinsExact * 2, 1);
    });

    it('does not return skeinsExact/skeinsToBuy at top level when blended', () => {
        const result = stitchesToSkeins({
            stitchCount: 5000, fabricCount: 14, isBlended: true, blendRatio: [1, 1]
        });
        expect(result.skeinsExact).toBeUndefined();
        expect(result.skeinsToBuy).toBeUndefined();
    });
});

// ---------------------------------------------------------------------------
// skeinsToStitches — inverse function
// ---------------------------------------------------------------------------

describe('skeinsToStitches', () => {
    describe('parameterized tests', () => {
        test.each([
            // skeinCount, fabricCount, strandsUsed, skeinLengthM, wasteFactor, expectedApprox
            [1, 14, 2, 8.0, 0.20, 2205],
            [2, 14, 2, 8.0, 0.20, 4411],
            [1, 18, 2, 8.0, 0.20, 2835], // Finer fabric, more stitches
            [1, 14, 3, 8.0, 0.20, 1470], // More strands, fewer stitches
            [1, 14, 2, 10.0, 0.20, 2757], // Longer skein, more stitches
            [1, 14, 2, 8.0, 0.10, 2481], // Less waste, more stitches
            [0, 14, 2, 8.0, 0.20, 0]     // Zero skeins
        ])(
            'given %p skeins, %pct, %p strands, %pm skein, %p waste → expects ~%p stitches',
            (skeinCount, fabricCount, strandsUsed, skeinLengthM, wasteFactor, expectedApprox) => {
                const result = skeinsToStitches({
                    skeinCount,
                    fabricCount,
                    strandsUsed,
                    skeinLengthM,
                    wasteFactor
                });
                // Allow a small delta for rounding differences (Math.floor vs expected exact calculation)
                expect(result.stitchesApprox).toBeCloseTo(expectedApprox, -1);
                expect(result.isApproximate).toBe(true);
            }
        );
    });

    it('returns a positive integer stitch count for 1 skein at default settings', () => {
        const result = skeinsToStitches({ skeinCount: 1, fabricCount: 14 });
        expect(result.stitchesApprox).toBeGreaterThan(0);
        expect(Number.isInteger(result.stitchesApprox)).toBe(true);
        expect(result.isApproximate).toBe(true);
    });

    it('is approximately the inverse of stitchesToSkeins (round-trip within 1%)', () => {
        const stitches = 5000;
        const fwd = stitchesToSkeins({ stitchCount: stitches, fabricCount: 14, wasteFactor: 0 });
        const inv = skeinsToStitches({ skeinCount: fwd.skeinsExact, fabricCount: 14, wasteFactor: 0 });
        // Round-trip should be within 1% due to Math.round at 2dp and Math.floor
        expect(inv.stitchesApprox).toBeGreaterThan(stitches * 0.99);
        expect(inv.stitchesApprox).toBeLessThanOrEqual(stitches);
    });

    it('more skeins → proportionally more stitches', () => {
        const r1 = skeinsToStitches({ skeinCount: 1, fabricCount: 14 });
        const r2 = skeinsToStitches({ skeinCount: 2, fabricCount: 14 });
        // Due to Math.floor, r2 may differ by ±1 from r1*2
        expect(r2.stitchesApprox).toBeGreaterThanOrEqual(r1.stitchesApprox * 2 - 1);
        expect(r2.stitchesApprox).toBeLessThanOrEqual(r1.stitchesApprox * 2 + 1);
    });

    it('more strands → fewer stitches per skein', () => {
        const r2 = skeinsToStitches({ skeinCount: 1, fabricCount: 14, strandsUsed: 2 });
        const r3 = skeinsToStitches({ skeinCount: 1, fabricCount: 14, strandsUsed: 3 });
        expect(r3.stitchesApprox).toBeLessThan(r2.stitchesApprox);
    });

    it('higher fabric count → more stitches per skein', () => {
        const r14 = skeinsToStitches({ skeinCount: 1, fabricCount: 14 });
        const r18 = skeinsToStitches({ skeinCount: 1, fabricCount: 18 });
        expect(r18.stitchesApprox).toBeGreaterThan(r14.stitchesApprox);
    });
});

// ---------------------------------------------------------------------------
// skeinEst proxy — test the specified proxy behaviour directly
// (mirrors the implementation mandated by the brief)
// ---------------------------------------------------------------------------

describe('skeinEst (proxy behaviour)', () => {
    // Implement skeinEst exactly as specified in the brief to test its contract
    function skeinEst(stitchCount, fabricCt) {
        if (typeof stitchesToSkeins === 'function') {
            const result = stitchesToSkeins({
                stitchCount: stitchCount,
                fabricCount: fabricCt,
                strandsUsed: 2,
                wasteFactor: 0.20
            });
            return Math.max(1, result.skeinsToBuy);
        }
        return 1;
    }

    it('returns at least 1 for any positive stitch count (legacy minimum rule)', () => {
        expect(skeinEst(1, 14)).toBeGreaterThanOrEqual(1);
        expect(skeinEst(10, 14)).toBeGreaterThanOrEqual(1);
    });

    it('returns a positive integer', () => {
        const result = skeinEst(500, 14);
        expect(Number.isInteger(result)).toBe(true);
        expect(result).toBeGreaterThan(0);
    });

    it('matches stitchesToSkeins.skeinsToBuy for 5000 stitches / 14ct', () => {
        const tcResult = stitchesToSkeins({ stitchCount: 5000, fabricCount: 14, strandsUsed: 2, wasteFactor: 0.20 });
        expect(skeinEst(5000, 14)).toBe(Math.max(1, tcResult.skeinsToBuy));
    });

    it('falls back to 1 when stitchesToSkeins is unavailable', () => {
        function skeinEstFallback(stitchCount, fabricCt) {
            const fn = undefined; // simulate unavailable
            if (typeof fn === 'function') {
                const result = fn({ stitchCount, fabricCount: fabricCt, strandsUsed: 2, wasteFactor: 0.20 });
                return Math.max(1, result.skeinsToBuy);
            }
            return 1;
        }
        expect(skeinEstFallback(5000, 14)).toBe(1);
    });

    it('larger stitch count → more skeins (monotonically increasing)', () => {
        const s1 = skeinEst(500, 14);
        const s2 = skeinEst(5000, 14);
        expect(s2).toBeGreaterThanOrEqual(s1);
    });

    it('5000 stitches 14ct returns realistic count (~3 skeins, not 32)', () => {
        const result = skeinEst(5000, 14);
        expect(result).toBeGreaterThanOrEqual(1);
        expect(result).toBeLessThan(10); // old buggy helpers.js returned 32
    });
});
