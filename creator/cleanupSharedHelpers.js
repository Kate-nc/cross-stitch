/* creator/cleanupSharedHelpers.js — Pure helpers shared by useCleanupMode.js
   and useDenoiseMode.js. No React, no DOM. Depends on dE2000 (colour-utils.js).

   Exposed on window:
     window.cleanupFindEntry(prePat, id, opts?)
     window.cleanupNeighbourVote(idx, prePat, selectedSet, sW, sH, wideRadius, opts?)
*/

// ═══════════════════════════════════════════════════════════════════════════════
// Shared constants
// ═══════════════════════════════════════════════════════════════════════════════

// Default radius for the wider neighbourhood used in tie-break 1.
// Both cleanup and denoise modes pass their own constant; this value is the
// fallback when wideRadius is not supplied.
var CLEANUP_SHARED_WIDE_NEIGHBOURHOOD_RADIUS = 2;

// ─── cleanupFindEntry ────────────────────────────────────────────────────────
// Find the first cell in prePat whose id matches and return it, or null.
// Used by cleanupNeighbourVote to avoid needing a live cmap reference during
// the apply step (cmap may be stale while cells are being rewritten).
window.cleanupFindEntry = function cleanupFindEntry(prePat, id, opts) {
  var options = opts || {};
  var ignoreBlend = !!options.ignoreBlend;
  for (var i = 0; i < prePat.length; i++) {
    if (!prePat[i]) continue;
    if (ignoreBlend && prePat[i].type === 'blend') continue;
    if (prePat[i].id === id) return prePat[i];
  }
  return null;
};

// ─── cleanupNeighbourVote ────────────────────────────────────────────────────
// Determines the replacement colour for a single cell at `idx` using an
// 8-connected majority vote with two tie-break passes.
//
// Parameters
//   idx         — flat index of the cell being replaced
//   prePat      — pre-apply pattern snapshot (read-only)
//   selectedSet — Set<number> of flat indices that are also pending replacement
//                 (excluded from the vote so they don't vote for each other)
//   sW, sH      — pattern dimensions
//   wideRadius  — radius for tie-break 1 neighbourhood (default 2 → 5×5 region)
//
// Returns the matching cell object from prePat, or null when no valid
// neighbours exist (caller should skip / keep the original cell).
//
// Tie-break rules (identical to the original _neighbourVote in useCleanupMode.js):
//   1. Most frequent colour in 8-connected neighbourhood (excluding selectedSet)
//   2. Tie-break 1: most frequent in wider (2r+1)×(2r+1) neighbourhood
//   3. Tie-break 2: Lab distance to the average Lab of all 8 valid neighbours
window.cleanupNeighbourVote = function cleanupNeighbourVote(idx, prePat, selectedSet, sW, sH, wideRadius, opts) {
  var options = opts || {};
  var ignoreBlend = !!options.ignoreBlend;
  var r = (wideRadius !== undefined && wideRadius !== null) ? wideRadius : CLEANUP_SHARED_WIDE_NEIGHBOURHOOD_RADIUS;
  var x = idx % sW;
  var y = (idx / sW) | 0;

  // ── Step 1: 8-connected neighbour vote ──────────────────────────────────
  var freq = {};
  var validNeighbours = [];

  for (var dy = -1; dy <= 1; dy++) {
    for (var dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      var nx = x + dx, ny = y + dy;
      if (nx < 0 || nx >= sW || ny < 0 || ny >= sH) continue;
      var ni = ny * sW + nx;
      if (selectedSet.has(ni)) continue;
      var cell = prePat[ni];
      if (!cell || cell.id === '__skip__' || cell.id === '__empty__') continue;
      if (ignoreBlend && cell.type === 'blend') continue;
      freq[cell.id] = (freq[cell.id] || 0) + 1;
      validNeighbours.push(cell);
    }
  }

  // Edge case: all 8 neighbours are also selected → keep current colour.
  if (validNeighbours.length === 0) return null;

  // Find maximum frequency
  var maxFreq = 0;
  for (var id in freq) { if (freq[id] > maxFreq) maxFreq = freq[id]; }

  // Candidates at max frequency
  var candidates = [];
  for (var id2 in freq) { if (freq[id2] === maxFreq) candidates.push(id2); }

  if (candidates.length === 1) {
    return window.cleanupFindEntry(prePat, candidates[0], options);
  }

  // ── Tie-break 1: wider neighbourhood frequency ────────────────────────
  var wideFreq = {};
  for (var wy = -r; wy <= r; wy++) {
    for (var wx = -r; wx <= r; wx++) {
      if (wx === 0 && wy === 0) continue;
      var wnx = x + wx, wny = y + wy;
      if (wnx < 0 || wnx >= sW || wny < 0 || wny >= sH) continue;
      var wni = wny * sW + wnx;
      if (selectedSet.has(wni)) continue;
      var wc = prePat[wni];
      if (!wc || wc.id === '__skip__' || wc.id === '__empty__') continue;
      if (ignoreBlend && wc.type === 'blend') continue;
      if (candidates.indexOf(wc.id) === -1) continue; // only compare tied candidates
      wideFreq[wc.id] = (wideFreq[wc.id] || 0) + 1;
    }
  }
  var maxWide = 0;
  for (var wid in wideFreq) { if (wideFreq[wid] > maxWide) maxWide = wideFreq[wid]; }
  var wideCandidates = candidates.filter(function(cid) { return (wideFreq[cid] || 0) >= maxWide; });
  if (wideCandidates.length === 1) return window.cleanupFindEntry(prePat, wideCandidates[0], options);

  // ── Tie-break 2: Lab distance to average of 8-neighbours ──────────────
  var avgL = 0, avgA = 0, avgB = 0, n = validNeighbours.length;
  for (var vi = 0; vi < n; vi++) {
    var vlab = validNeighbours[vi].lab;
    if (!vlab) continue;
    avgL += vlab[0]; avgA += vlab[1]; avgB += vlab[2];
  }
  avgL /= n; avgA /= n; avgB /= n;
  var avgLab = [avgL, avgA, avgB];

  var bestId = wideCandidates[0];
  var bestDE = Infinity;
  for (var ci = 0; ci < wideCandidates.length; ci++) {
    var entry = window.cleanupFindEntry(prePat, wideCandidates[ci], options);
    if (!entry || !entry.lab) continue;
    var de = dE2000(avgLab, entry.lab);
    if (de < bestDE) { bestDE = de; bestId = wideCandidates[ci]; }
  }
  return window.cleanupFindEntry(prePat, bestId, options);
};
