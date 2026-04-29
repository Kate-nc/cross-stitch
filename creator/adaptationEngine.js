/* creator/adaptationEngine.js — Stash-Adapt proposal/apply engine.
 *
 * Pure module. Provides:
 *   proposeStash(palette, stash, opts)   → Proposal
 *   proposeBrand(palette, srcBrand, tgtBrand, opts) → Proposal
 *   applyProposal(srcProject, proposal, opts) → newProject (deep copy)
 *   reRunAuto(proposal, lockedKeys, opts) → Proposal (locked rows preserved)
 *   findReplacement(srcLab, candidates, opts) → target | null
 *   isSpecialty(id) → bool
 *
 * Substitution shape (canonical for the whole flow):
 *   {
 *     sourceId, sourceBrand, sourceName, sourceRgb, sourceLab,
 *     target: null | {
 *       key, id, brand, name, rgb, lab, deltaE, tier,
 *       confidence, source, inStash, ownedSkeins?, neededSkeins?, hasSufficient?
 *     },
 *     state: "accepted" | "skipped" | "no-match",
 *     skipReason?: "no-stash-match" | "all-above-threshold" | "no-equivalent" | "user-skipped",
 *     nearMisses?: NearMiss[]
 *   }
 *
 * Loaded by build-creator-bundle.js AFTER matchQuality.js, BEFORE AdaptModal.js.
 *
 * Depends on globals (browser): MatchQuality, DMC, ANCHOR (optional),
 *   rgbToLab, dE2000 (colour-utils.js), threadKey, parseThreadKey, getThreadByKey,
 *   skeinEst (helpers.js), CONVERSIONS, getOfficialMatch (thread-conversions.js,
 *   optional — falls back to pure ΔE2000 when unavailable).
 *
 * Specialty thread prefixes (excluded from auto-matching by default):
 *   E*  — Light Effects (DMC)
 *   S*  — Satin (DMC)
 *   4xxx — Variations (DMC)
 *   1300+ — Anchor multicoloured/marlitt (heuristic)
 */

(function () {
  // ─── Specialty exclusion ─────────────────────────────────────────────────
  var SPECIALTY_PREFIXES = ['E', 'S'];
  function isSpecialty(id) {
    if (typeof id !== 'string' || !id) return false;
    var first = id.charAt(0);
    if (first === 'E' || first === 'S') return true;
    // DMC Variations — 4-digit ids starting with 4
    if (/^4\d{3}$/.test(id)) return true;
    return false;
  }

  // Blend handling — adaptation operates on bare component ids; the canvas
  // already serialises blends as "a+b" with sorted components.
  function _splitBlend(id) {
    if (typeof id !== 'string' || id.indexOf('+') === -1) return null;
    return id.split('+');
  }

  function _isBlend(id) { return _splitBlend(id) !== null; }

  // ─── Catalogue helpers ───────────────────────────────────────────────────
  function _catalogue(brand) {
    if (brand === 'anchor') return (typeof ANCHOR !== 'undefined' && ANCHOR) ? ANCHOR : [];
    return (typeof DMC !== 'undefined' && DMC) ? DMC : [];
  }

  function _labOf(thread) {
    if (!thread) return null;
    if (thread.lab) {
      if (Array.isArray(thread.lab)) return thread.lab;
      return [thread.lab.L || 0, thread.lab.a || 0, thread.lab.b || 0];
    }
    if (thread.rgb && typeof rgbToLab === 'function') {
      return rgbToLab(thread.rgb[0], thread.rgb[1], thread.rgb[2]);
    }
    return null;
  }

  function _findThread(brand, id) {
    var arr = _catalogue(brand);
    for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i];
    return null;
  }

  function _resolveBrand(id) {
    if (_findThread('dmc', id)) return 'dmc';
    if (_findThread('anchor', id)) return 'anchor';
    return 'dmc';
  }

  function _de(a, b) {
    if (!a || !b) return Infinity;
    if (typeof dE2000 === 'function') return dE2000(a, b);
    var dL = a[0]-b[0], da = a[1]-b[1], db = a[2]-b[2];
    return Math.sqrt(dL*dL + da*da + db*db);
  }

  // Round ΔE to one decimal for stable storage / display.
  function _roundDe(x) { return Math.round(x * 10) / 10; }

  // ─── Palette extraction — unique source threads ──────────────────────────
  // palette: either a flat pattern array of {id,type,rgb,...} cells OR an
  // already-deduped list of {id, name, rgb, stitches?, brand?} entries.
  // Returns an array of unique source thread descriptors.
  function _extractSourceThreads(palette, defaultBrand) {
    var seen = Object.create(null);
    var out = [];
    function add(id, brand, name, rgb, stitches) {
      if (!id || id === '__skip__' || id === '__empty__') return;
      var key = brand + ':' + id;
      if (seen[key]) {
        if (stitches != null) seen[key].stitches += stitches;
        return;
      }
      var thread = _findThread(brand, id);
      var entry = {
        id: id,
        brand: brand,
        name: name || (thread && thread.name) || id,
        rgb: rgb || (thread && thread.rgb) || [128,128,128],
        lab: thread ? _labOf(thread) : (rgb && typeof rgbToLab === 'function' ? rgbToLab(rgb[0], rgb[1], rgb[2]) : null),
        stitches: stitches || 0
      };
      seen[key] = entry;
      out.push(entry);
    }

    for (var i = 0; i < palette.length; i++) {
      var c = palette[i];
      if (!c) continue;
      var brand = c.brand || defaultBrand || 'dmc';
      var stitches = (typeof c.stitches === 'number') ? c.stitches
                   : (typeof c.count === 'number') ? c.count
                   : 1;
      // Blend cells: split into components and credit half-stitches each.
      if (c.type === 'blend' || _isBlend(c.id)) {
        var parts = _splitBlend(c.id) || (c.threads ? c.threads.map(function (t) { return t.id; }) : []);
        for (var p = 0; p < parts.length; p++) {
          add(parts[p], brand, null, null, Math.ceil(stitches / parts.length));
        }
        continue;
      }
      add(c.id, brand, c.name, c.rgb, stitches);
    }
    return out;
  }

  // ─── findReplacement — generic nearest-by-ΔE2000 search ──────────────────
  function findReplacement(srcLab, candidates, opts) {
    opts = opts || {};
    var maxDeltaE = opts.maxDeltaE != null ? opts.maxDeltaE : Infinity;
    if (!srcLab || !candidates || !candidates.length) return null;
    var best = null, bestDe = Infinity;
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i];
      if (!c.lab) continue;
      var de = _de(srcLab, c.lab);
      if (de < bestDe) { bestDe = de; best = c; }
    }
    if (!best || bestDe > maxDeltaE) return null;
    return { candidate: best, deltaE: _roundDe(bestDe) };
  }

  // ─── proposeStash — Flow A ───────────────────────────────────────────────
  function proposeStash(palette, stash, opts) {
    opts = opts || {};
    var maxDeltaE        = opts.maxDeltaE        != null ? opts.maxDeltaE        : 10;
    var fabricCt         = opts.fabricCt         != null ? opts.fabricCt         : 14;
    var excludeSpecialty = opts.excludeSpecialty !== false; // default true
    var nearMissMult     = opts.nearMissMult     || 1.5;

    // Build candidate list from owned stash entries.
    var candidates = [];
    var stashKeys = stash ? Object.keys(stash) : [];
    for (var k = 0; k < stashKeys.length; k++) {
      var key = stashKeys[k];
      var entry = stash[key];
      if (!entry || !(entry.owned > 0)) continue;
      var parsed = (typeof parseThreadKey === 'function')
        ? parseThreadKey(key)
        : (key.indexOf(':') >= 0 ? { brand: key.split(':')[0], id: key.split(':')[1] } : { brand: 'dmc', id: key });
      if (excludeSpecialty && isSpecialty(parsed.id)) continue;
      var thread = _findThread(parsed.brand, parsed.id);
      if (!thread) continue;
      candidates.push({
        key: key,
        id: parsed.id,
        brand: parsed.brand,
        name: thread.name,
        rgb: thread.rgb,
        lab: _labOf(thread),
        ownedSkeins: entry.owned
      });
    }

    var sources = _extractSourceThreads(palette);
    var subs = [];
    var stashSnapshotKeys = candidates.map(function (c) { return c.key; });

    for (var s = 0; s < sources.length; s++) {
      var src = sources[s];
      var sub = _baseSub(src);

      if (!src.lab) {
        sub.state = 'no-match';
        sub.skipReason = 'no-stash-match';
        subs.push(sub);
        continue;
      }

      // Skein need from this source's stitch count.
      var needed = (typeof skeinEst === 'function')
        ? skeinEst(src.stitches || 1, fabricCt)
        : Math.max(1, Math.ceil((src.stitches || 1) / 200));

      // Score every candidate. The source thread itself is a valid candidate
      // when the user owns it — that's the "no swap needed" case and surfaces
      // as an exact match.
      var ranked = [];
      for (var c = 0; c < candidates.length; c++) {
        var de = _roundDe(_de(src.lab, candidates[c].lab));
        ranked.push({ cand: candidates[c], de: de });
      }
      ranked.sort(function (a, b) { return a.de - b.de; });

      if (!ranked.length) {
        sub.state = 'no-match';
        sub.skipReason = 'no-stash-match';
        subs.push(sub);
        continue;
      }

      var withinThresh = [];
      var nearMisses   = [];
      for (var r = 0; r < ranked.length; r++) {
        if (ranked[r].de <= maxDeltaE) withinThresh.push(ranked[r]);
        else if (ranked[r].de <= maxDeltaE * nearMissMult && nearMisses.length < 3) nearMisses.push(ranked[r]);
        if (withinThresh.length >= 5 && nearMisses.length >= 3) break;
      }

      if (!withinThresh.length) {
        sub.state = 'no-match';
        sub.skipReason = 'all-above-threshold';
        sub.nearMisses = nearMisses.map(function (n) { return _toNearMiss(n.cand, n.de); });
        subs.push(sub);
        continue;
      }

      // Prefer a candidate with sufficient stock; else the closest.
      var pick = null;
      for (var i = 0; i < withinThresh.length; i++) {
        if (withinThresh[i].cand.ownedSkeins >= needed) { pick = withinThresh[i]; break; }
      }
      if (!pick) pick = withinThresh[0];

      sub.target = _toTarget(pick.cand, pick.de, {
        confidence: 'nearest',
        source:     'auto-stash',
        inStash:    true,
        neededSkeins: needed
      });
      sub.state = 'accepted';
      subs.push(sub);
    }

    return {
      mode: 'stash',
      substitutions: subs,
      stashSnapshotKeys: stashSnapshotKeys,
      computedAt: new Date().toISOString(),
      opts: { maxDeltaE: maxDeltaE, fabricCt: fabricCt, excludeSpecialty: excludeSpecialty }
    };
  }

  // ─── proposeBrand — Flow C ───────────────────────────────────────────────
  function proposeBrand(palette, srcBrand, tgtBrand, opts) {
    opts = opts || {};
    var maxDeltaE        = opts.maxDeltaE        != null ? opts.maxDeltaE        : 10;
    var preferOfficial   = opts.preferOfficial   !== false; // default true
    var excludeSpecialty = opts.excludeSpecialty !== false; // default true
    var stash            = opts.stash || null;

    var tgtArr = _catalogue(tgtBrand);
    var candidates = [];
    for (var i = 0; i < tgtArr.length; i++) {
      var t = tgtArr[i];
      if (excludeSpecialty && isSpecialty(t.id)) continue;
      candidates.push({
        key: tgtBrand + ':' + t.id,
        id: t.id, brand: tgtBrand, name: t.name, rgb: t.rgb,
        lab: _labOf(t)
      });
    }

    var sources = _extractSourceThreads(palette, srcBrand);
    var subs = [];

    for (var s = 0; s < sources.length; s++) {
      var src = sources[s];
      // Force the source brand for this flow even when ids parse ambiguously.
      src.brand = srcBrand;
      var sub = _baseSub(src);

      if (!src.lab) { sub.state = 'no-match'; sub.skipReason = 'no-equivalent'; subs.push(sub); continue; }

      // 1. Chart lookup.
      var charted = null;
      if (preferOfficial && typeof getOfficialMatch === 'function') {
        var m = getOfficialMatch(srcBrand, src.id, tgtBrand);
        if (m && m.id) {
          var chartedThread = _findThread(tgtBrand, m.id);
          if (chartedThread) {
            var de = _roundDe(_de(src.lab, _labOf(chartedThread)));
            charted = {
              cand: {
                key: tgtBrand + ':' + chartedThread.id,
                id: chartedThread.id, brand: tgtBrand, name: chartedThread.name,
                rgb: chartedThread.rgb, lab: _labOf(chartedThread)
              },
              de: de,
              confidence: m.confidence || 'reconciled'
            };
          }
        }
      }

      if (charted) {
        sub.target = _toTarget(charted.cand, charted.de, {
          confidence: charted.confidence,
          source:     'auto-brand',
          inStash:    _isOwned(stash, charted.cand.key)
        });
        sub.state = 'accepted';
        subs.push(sub);
        continue;
      }

      // 2. ΔE2000 fallback.
      var best = findReplacement(src.lab, candidates, { maxDeltaE: Infinity });
      if (!best) { sub.state = 'no-match'; sub.skipReason = 'no-equivalent'; subs.push(sub); continue; }

      if (best.deltaE > maxDeltaE) {
        sub.state = 'no-match';
        sub.skipReason = 'all-above-threshold';
        sub.nearMisses = [_toNearMiss(best.candidate, best.deltaE)];
        subs.push(sub);
        continue;
      }

      sub.target = _toTarget(best.candidate, best.deltaE, {
        confidence: 'nearest',
        source:     'auto-brand',
        inStash:    _isOwned(stash, best.candidate.key)
      });
      sub.state = 'accepted';
      subs.push(sub);
    }

    return {
      mode: 'brand',
      substitutions: subs,
      brandSource: srcBrand,
      brandTarget: tgtBrand,
      computedAt: new Date().toISOString(),
      opts: { maxDeltaE: maxDeltaE, preferOfficial: preferOfficial, excludeSpecialty: excludeSpecialty }
    };
  }

  function _isOwned(stash, key) {
    if (!stash) return false;
    var e = stash[key];
    return !!(e && e.owned > 0);
  }

  function _baseSub(src) {
    return {
      sourceId:    src.id,
      sourceBrand: src.brand,
      sourceName:  src.name,
      sourceRgb:   src.rgb,
      sourceLab:   src.lab,
      sourceStitches: src.stitches || 0,
      target:      null,
      state:       'no-match',
      skipReason:  null,
      nearMisses:  null
    };
  }

  function _toTarget(cand, de, extra) {
    var tier = MatchQuality.classifyMatch(de, cand);
    var t = {
      key:        cand.key,
      id:         cand.id,
      brand:      cand.brand,
      name:       cand.name,
      rgb:        cand.rgb,
      lab:        cand.lab,
      deltaE:     _roundDe(de),
      tier:       tier,
      confidence: extra && extra.confidence || 'nearest',
      source:     extra && extra.source     || 'auto-stash',
      inStash:    !!(extra && extra.inStash)
    };
    if (extra && extra.neededSkeins != null) {
      t.neededSkeins  = extra.neededSkeins;
      t.ownedSkeins   = cand.ownedSkeins || 0;
      t.hasSufficient = (cand.ownedSkeins || 0) >= extra.neededSkeins;
    }
    return t;
  }

  function _toNearMiss(cand, de) {
    return {
      key: cand.key, id: cand.id, brand: cand.brand, name: cand.name,
      rgb: cand.rgb, deltaE: _roundDe(de),
      tier: MatchQuality.classifyMatch(de, cand),
      inStash: cand.ownedSkeins != null,
      ownedSkeins: cand.ownedSkeins || 0
    };
  }

  // ─── reRunAuto — preserve manual/locked picks ────────────────────────────
  function reRunAuto(proposal, lockedKeys, opts) {
    if (!proposal) return null;
    opts = opts || {};
    var locked = {};
    (lockedKeys || []).forEach(function (k) { locked[k] = true; });

    // Auto-locked: any sub whose target.source === 'manual' is implicitly locked.
    var palette = proposal.substitutions.map(function (s) {
      return { id: s.sourceId, brand: s.sourceBrand, name: s.sourceName, rgb: s.sourceRgb, stitches: s.sourceStitches };
    });
    var fresh = (proposal.mode === 'brand')
      ? proposeBrand(palette, proposal.brandSource, proposal.brandTarget, Object.assign({}, proposal.opts || {}, opts))
      : proposeStash(palette, opts.stash || _stashFromProposal(proposal), Object.assign({}, proposal.opts || {}, opts));

    var bySource = {};
    proposal.substitutions.forEach(function (s) { bySource[s.sourceBrand + ':' + s.sourceId] = s; });

    fresh.substitutions = fresh.substitutions.map(function (newSub) {
      var k = newSub.sourceBrand + ':' + newSub.sourceId;
      var prev = bySource[k];
      var isManual = prev && prev.target && prev.target.source === 'manual';
      if (locked[k] || isManual) return prev; // keep prior decision
      return newSub;
    });

    return fresh;
  }

  function _stashFromProposal(proposal) {
    // Reconstruct a minimal stash object from the snapshot keys, so reRunAuto
    // can be called without the caller passing the live stash. Owned counts
    // are unknown post-hoc — assume 1, which preserves "owned > 0" filtering.
    var s = {};
    (proposal.stashSnapshotKeys || []).forEach(function (k) { s[k] = { owned: 1 }; });
    return s;
  }

  // ─── applyProposal — build the adapted project ───────────────────────────
  // Returns a new project object — does NOT save. Caller must invoke
  // ProjectStorage.save(newProject).
  function applyProposal(srcProject, proposal, opts) {
    opts = opts || {};
    if (!srcProject) throw new Error('applyProposal: srcProject required');
    if (!proposal)   throw new Error('applyProposal: proposal required');

    // Build remap: sourceBrand:sourceId → target spec (or null to keep original).
    var remap = Object.create(null);
    proposal.substitutions.forEach(function (sub) {
      var k = sub.sourceBrand + ':' + sub.sourceId;
      if (sub.state === 'accepted' && sub.target) {
        remap[k] = sub.target;
        // Also key by bare id for legacy lookups (project palette uses bare ids).
        remap[sub.sourceId] = sub.target;
      }
    });

    // Deep-copy via JSON. The pattern array contains plain {id,type,rgb,...}
    // objects, so JSON round-trip is faithful and severs all references.
    var copy = JSON.parse(JSON.stringify(srcProject));

    // New identity.
    var nowIso = new Date().toISOString();
    copy.id = opts.newId || ('proj_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8));
    copy.createdAt = nowIso;
    copy.updatedAt = nowIso;
    copy.name = opts.name || _autoName(srcProject.name || 'Untitled', proposal.mode, proposal.brandTarget);
    // Schema bump: adapted projects carry the optional `adaptation` field.
    copy.v = 12;

    // Reset tracking state — adapted patterns start fresh.
    copy.done = null;
    copy.halfStitches = {};
    copy.halfDone = {};
    copy.sessions = [];
    copy.statsSessions = [];
    copy.totalTime = 0;
    copy.completedStitches = 0;
    copy.achievedMilestones = [];

    // Apply substitutions to the pattern array.
    if (Array.isArray(copy.pattern)) {
      for (var i = 0; i < copy.pattern.length; i++) {
        var cell = copy.pattern[i];
        if (!cell || cell.id === '__skip__' || cell.id === '__empty__') continue;
        if (cell.type === 'blend' && cell.threads) {
          // Substitute each component.
          for (var t = 0; t < cell.threads.length; t++) {
            var th = cell.threads[t];
            var rep = remap[th.brand + ':' + th.id] || remap[th.id];
            if (rep) {
              th.id = rep.id; th.brand = rep.brand; th.rgb = rep.rgb; th.name = rep.name;
            }
          }
          // Rebuild canonical blend id (sorted).
          var ids = cell.threads.map(function (x) { return x.id; }).sort();
          cell.id = ids.join('+');
          // Average RGB.
          cell.rgb = [
            Math.round((cell.threads[0].rgb[0] + cell.threads[1].rgb[0]) / 2),
            Math.round((cell.threads[0].rgb[1] + cell.threads[1].rgb[1]) / 2),
            Math.round((cell.threads[0].rgb[2] + cell.threads[1].rgb[2]) / 2)
          ];
        } else {
          var repCell = remap[(cell.brand || 'dmc') + ':' + cell.id] || remap[cell.id];
          if (repCell) {
            cell.id = repCell.id;
            cell.brand = repCell.brand;
            cell.rgb = repCell.rgb;
            if (cell.name !== undefined) cell.name = repCell.name;
          }
        }
      }
    }

    // Backstitches reference palette ids — substitute them too.
    if (Array.isArray(copy.bsLines)) {
      for (var b = 0; b < copy.bsLines.length; b++) {
        var bs = copy.bsLines[b];
        if (!bs || !bs.colour) continue;
        var rep2 = remap[bs.colour] || remap[(bs.brand || 'dmc') + ':' + bs.colour];
        if (rep2) { bs.colour = rep2.id; if (bs.brand !== undefined) bs.brand = rep2.brand; }
      }
    }

    // Attach adaptation metadata.
    copy.adaptation = {
      fromProjectId:    srcProject.id,
      fromName:         srcProject.name || 'Untitled',
      snapshotAt:       nowIso,
      modeAtCreate:     proposal.mode,
      stashSnapshotAt:  proposal.mode === 'stash' ? nowIso : undefined,
      stashSnapshotKeys: proposal.mode === 'stash' ? (proposal.stashSnapshotKeys || []).slice() : undefined,
      brandSource:      proposal.brandSource,
      brandTarget:      proposal.brandTarget,
      substitutions:    proposal.substitutions.map(_serializeSubstitution)
    };

    return copy;
  }

  function _autoName(srcName, mode, brandTarget) {
    if (mode === 'stash')  return srcName + ' (adapted to stash)';
    if (mode === 'brand')  return srcName + ' (adapted to ' + (brandTarget || 'brand') + ')';
    return srcName + ' (adapted)';
  }

  function _serializeSubstitution(sub) {
    // Strip hot-path fields (sourceStitches isn't part of the documented
    // schema but is harmless to keep; near-misses retained for the "Show
    // what changed" view).
    return {
      sourceId:    sub.sourceId,
      sourceBrand: sub.sourceBrand,
      sourceName:  sub.sourceName,
      sourceRgb:   sub.sourceRgb,
      sourceLab:   sub.sourceLab,
      target:      sub.target ? Object.assign({}, sub.target) : null,
      state:       sub.state,
      skipReason:  sub.skipReason || undefined,
      nearMisses:  sub.nearMisses || undefined
    };
  }

  // ─── Public API ──────────────────────────────────────────────────────────
  var api = {
    SPECIALTY_PREFIXES: SPECIALTY_PREFIXES.slice(),
    isSpecialty:    isSpecialty,
    findReplacement: findReplacement,
    proposeStash:   proposeStash,
    proposeBrand:   proposeBrand,
    reRunAuto:      reRunAuto,
    applyProposal:  applyProposal
  };

  if (typeof window !== 'undefined') window.AdaptationEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
