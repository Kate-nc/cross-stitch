/**
 * Tests for the spatial analysis engine (core logic extracted from analysis-worker.js).
 * We extract the pure functions via regex+eval to avoid Worker-specific globals.
 */
const fs = require("fs");
const path = require("path");

const { loadSource } = require('./_helpers/loadSource');
const workerSrc = loadSource('analysis-worker.js');

// Extract and define the pure functions without the self.onmessage handler
// Strip the self.onmessage block so we can eval in Node
const stripped = workerSrc.replace(/self\.onmessage\s*=.*$/ms, "");
/* global computeClusters, computeNeighbourCounts, computeNearestSameColour, runAnalysis, REGION_SIZE */
eval(stripped); // eslint-disable-line no-eval

// ── Helpers ──────────────────────────────────────────────────────────────────
function makePat(ids) {
  return ids.map(id => ({ id }));
}

// ── computeNeighbourCounts ────────────────────────────────────────────────────
describe("computeNeighbourCounts", () => {
  test("single cell has 0 neighbours", () => {
    const pat = makePat(["A"]);
    const counts = computeNeighbourCounts(pat, 1, 1);
    expect(counts[0]).toBe(0);
  });

  test("3×1 row: middle cell has 2 same-colour neighbours", () => {
    const pat = makePat(["A", "A", "A"]);
    const counts = computeNeighbourCounts(pat, 3, 1);
    expect(counts[0]).toBe(1); // left edge
    expect(counts[1]).toBe(2); // middle
    expect(counts[2]).toBe(1); // right edge
  });

  test("2×2 all same: corners have 3 diagonal+cardinal neighbours", () => {
    // 8-connected: corner of 2×2 sees 3 others
    const pat = makePat(["A", "A", "A", "A"]);
    const counts = computeNeighbourCounts(pat, 2, 2);
    expect(counts[0]).toBe(3);
    expect(counts[1]).toBe(3);
    expect(counts[2]).toBe(3);
    expect(counts[3]).toBe(3);
  });

  test("skip cells have 0 neighbour count", () => {
    const pat = makePat(["__skip__", "__skip__"]);
    const counts = computeNeighbourCounts(pat, 2, 1);
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBe(0);
  });

  test("isolated stitch surrounded by different colours has 0 same-colour neighbours", () => {
    // 3×3: centre is A, all others are B
    const pat = makePat(["B","B","B","B","A","B","B","B","B"]);
    const counts = computeNeighbourCounts(pat, 3, 3);
    expect(counts[4]).toBe(0); // centre cell A
  });
});

// ── computeClusters ───────────────────────────────────────────────────────────
describe("computeClusters", () => {
  test("two diagonally adjacent same-colour cells are NOT 4-connected (different clusters)", () => {
    // 2×2: A at [0,0] and [1,1] — only diagonal, not 4-connected
    const pat = makePat(["A", "B", "B", "A"]);
    const { clusterLabel, clusterSizes } = computeClusters(pat, 2, 2);
    // [0,0] and [1,1] should have different labels
    expect(clusterLabel[0]).not.toBe(clusterLabel[3]);
    // Each should be a singleton cluster
    expect(clusterSizes[clusterLabel[0] - 1]).toBe(1);
    expect(clusterSizes[clusterLabel[3] - 1]).toBe(1);
  });

  test("4-connected same-colour cells form one cluster", () => {
    // 3×1 row all A
    const pat = makePat(["A", "A", "A"]);
    const { clusterLabel, clusterSizes } = computeClusters(pat, 3, 1);
    expect(clusterLabel[0]).toBe(clusterLabel[1]);
    expect(clusterLabel[1]).toBe(clusterLabel[2]);
    expect(clusterSizes[clusterLabel[0] - 1]).toBe(3);
  });

  test("skip cells are excluded from clusters (label -1)", () => {
    const pat = makePat(["__skip__", "A", "__skip__"]);
    const { clusterLabel } = computeClusters(pat, 3, 1);
    expect(clusterLabel[0]).toBe(-1);
    expect(clusterLabel[2]).toBe(-1);
    expect(clusterLabel[1]).toBeGreaterThan(0);
  });

  test("two disconnected same-colour groups get different labels", () => {
    // A _ A (gap in middle)
    const pat = makePat(["A", "__skip__", "A"]);
    const { clusterLabel } = computeClusters(pat, 3, 1);
    expect(clusterLabel[0]).not.toBe(clusterLabel[2]);
  });
});

// ── computeNearestSameColour ──────────────────────────────────────────────────
describe("computeNearestSameColour", () => {
  test("adjacent same-colour cell: distance 1", () => {
    const pat = makePat(["A", "A"]);
    const dist = computeNearestSameColour(pat, 2, 1);
    expect(dist[0]).toBeCloseTo(1.0);
    expect(dist[1]).toBeCloseTo(1.0);
  });

  test("diagonal same-colour cell: distance sqrt(2)", () => {
    // A _ / _ A diagonal
    const pat = makePat(["A", "B", "B", "A"]);
    const dist = computeNearestSameColour(pat, 2, 2);
    expect(dist[0]).toBeCloseTo(Math.sqrt(2));
    expect(dist[3]).toBeCloseTo(Math.sqrt(2));
  });

  test("isolated stitch with no neighbours returns 999", () => {
    const pat = makePat(["A"]);
    const dist = computeNearestSameColour(pat, 1, 1);
    expect(dist[0]).toBe(999);
  });
});

// ── runAnalysis ───────────────────────────────────────────────────────────────
describe("runAnalysis", () => {
  test("returns null for empty pattern", () => {
    const result = runAnalysis(null, null, 0, 0, 10);
    expect(result).toBeNull();
  });

  test("produces correct per-stitch arrays for 2×2 pattern", () => {
    const pat = makePat(["A", "A", "B", "B"]);
    const result = runAnalysis(pat, null, 2, 2, 10);
    expect(result).not.toBeNull();
    expect(result.perStitch.neighbourCount.length).toBe(4);
    expect(result.perStitch.clusterSize.length).toBe(4);
    expect(result.sW).toBe(2);
    expect(result.sH).toBe(2);
  });

  test("per-colour metrics count correctly", () => {
    // 4 A and 4 B stitches in a 4×2 grid
    const pat = makePat(["A","A","A","A","B","B","B","B"]);
    const result = runAnalysis(pat, null, 4, 2, 10);
    expect(result.perColour["A"].totalStitches).toBe(4);
    expect(result.perColour["B"].totalStitches).toBe(4);
  });

  test("completedStitches matches done array", () => {
    const pat = makePat(["A","A","A","A"]);
    const done = [1, 1, 0, 0];
    const result = runAnalysis(pat, done, 2, 2, 10);
    expect(result.perColour["A"].completedStitches).toBe(2);
  });

  test("confettiCount is correct for isolated stitches", () => {
    // Only centre cell is A, surrounded by B — so A has 1 confetti
    const pat = makePat(["B","B","B","B","A","B","B","B","B"]);
    const result = runAnalysis(pat, null, 3, 3, 10);
    expect(result.perColour["A"].confettiCount).toBe(1);
  });

  test("perRegion: completionPercentage is computed", () => {
    const pat = makePat(["A","A","A","A"]);
    const done = [1, 0, 1, 0];
    const result = runAnalysis(pat, done, 2, 2, 10);
    // With region size 10, the whole 2×2 pattern is one region
    expect(result.perRegion[0].completionPercentage).toBeCloseTo(0.5);
  });

  test("perRegion: impactScore is between 0 and 1 for incomplete regions", () => {
    const pat = makePat(["A","A","A","A"]);
    const done = [0, 0, 0, 0];
    const result = runAnalysis(pat, done, 2, 2, 10);
    const score = result.perRegion[0].impactScore;
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(1);
  });

  test("skip cells are excluded from perColour and counts", () => {
    const pat = makePat(["__skip__","A","A","__empty__"]);
    const result = runAnalysis(pat, null, 2, 2, 10);
    expect(result.perColour["__skip__"]).toBeUndefined();
    expect(result.perColour["__empty__"]).toBeUndefined();
    expect(result.perColour["A"].totalStitches).toBe(2);
  });

  test("regionCols and regionRows match expected tiling", () => {
    const pat = makePat(new Array(100).fill("A"));
    const result = runAnalysis(pat, null, 10, 10, 10);
    expect(result.regionCols).toBe(1);
    expect(result.regionRows).toBe(1);
    expect(result.perRegion.length).toBe(1);
  });

  test("4-connected cluster spanning rows produces 1 cluster", () => {
    // 3×3 all A: one big cluster
    const pat = makePat(new Array(9).fill("A"));
    const result = runAnalysis(pat, null, 3, 3, 10);
    expect(result.perColour["A"].clusterCount).toBe(1);
    expect(result.perColour["A"].largestClusterSize).toBe(9);
  });
});
