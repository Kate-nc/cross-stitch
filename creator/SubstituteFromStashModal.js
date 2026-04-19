/* creator/SubstituteFromStashModal.js — v3
   Feature 2: Canvas substitution preview (ComparisonSlider)
   Feature 3: Near-miss suggestions for skipped threads
   Feature 4: Preserve contrast constraint
   Depends on globals: React, DMC, ANCHOR (optional), skeinEst (helpers.js),
   parseThreadKey, getThreadByKey (helpers.js),
   rgbToLab, dE, dE2000 (colour-utils.js), generatePatternThumbnail (exportPdf.js),
   CreatorContext (context.js), StashBridge (stash-bridge.js, optional) */

// ─── Module-level preference (survives modal remounts within a session) ────────
var _preserveContrastPref = true;

// ─── Shared pure helpers ──────────────────────────────────────────────────────

function _statusFromTarget(t) {
  if (!t.hasSufficient) return "insufficient";
  if (t.deltaE < 5) return "good";
  if (t.deltaE < 10) return "fair";
  return "poor";
}

// Returns Lab array for a thread identified by composite key ('dmc:310', 'anchor:403') or bare DMC id.
function _getThreadLab(key) {
  var thread = null;
  if (typeof getThreadByKey === 'function') {
    thread = getThreadByKey(key);
  } else {
    // Fallback: bare DMC id only
    var dmcArr = typeof DMC !== 'undefined' ? DMC : [];
    thread = dmcArr.find(function(d) { return d.id === key; }) || null;
  }
  if (!thread) return null;
  if (thread.lab) {
    var l = thread.lab;
    if (Array.isArray(l)) return l;
    if (l && typeof l === 'object') return [l.L || 0, l.a || 0, l.b || 0];
  }
  if (thread.rgb && typeof rgbToLab === 'function') return rgbToLab(thread.rgb[0], thread.rgb[1], thread.rgb[2]);
  return null;
}

// Legacy shim for internal callers that pass (dmcMap, id).
function _getDmcLab(dmcMap, id) {
  return _getThreadLab(id);
}

function _calcDE(labA, labB) {
  if (!labA || !labB) return 999;
  if (typeof dE2000 === 'function') return dE2000(labA, labB);
  if (typeof dE === "function") return dE(labA, labB);
  var dL = labA[0] - labB[0], da = labA[1] - labB[1], db = labA[2] - labB[2];
  return Math.sqrt(dL * dL + da * da + db * db);
}

// Resolves duplicate target IDs. Mutates substitutions in-place; returns them.
function _resolveDuplicateTargets(substitutions) {
  var maxIter = substitutions.length + 5;
  var converged = false;
  while (!converged && maxIter-- > 0) {
    converged = true;
    var targetCounts = {};
    substitutions.forEach(function(sub, i) {
      var tid = sub.selectedTarget.id;
      if (!targetCounts[tid]) targetCounts[tid] = [];
      targetCounts[tid].push(i);
    });
    Object.keys(targetCounts).forEach(function(targetId) {
      var indices = targetCounts[targetId];
      if (indices.length <= 1) return;
      converged = false;
      indices.sort(function(ai, bi) {
        return substitutions[ai].selectedTarget.deltaE - substitutions[bi].selectedTarget.deltaE;
      });
      for (var k = 1; k < indices.length; k++) {
        var sub = substitutions[indices[k]];
        var allOtherChosen = new Set();
        substitutions.forEach(function(s, si) {
          if (si !== indices[k]) allOtherChosen.add(s.selectedTarget.id);
        });
        var bumped = false;
        var cands = sub._cands || [sub.selectedTarget].concat(sub.alternativeTargets || []);
        for (var c = 0; c < cands.length; c++) {
          if (!allOtherChosen.has(cands[c].id)) {
            sub.selectedTarget = cands[c];
            sub.alternativeTargets = cands.filter(function(x) { return x.id !== cands[c].id; }).slice(0, 4);
            sub.status = _statusFromTarget(cands[c]);
            bumped = true;
            break;
          }
        }
        if (!bumped) sub.status = "conflict";
      }
    });
  }
  return substitutions;
}

// F4: Checks pairwise contrast in the "after" palette.
// For each sub whose target is too similar to another after-colour,
// tries alternatives. If unresolvable, sets sub.contrastWarning.
// Mutates substitutions in-place.
function _enforceContrastConstraints(substitutions, skeinData, minPairDeltaE, dmcMap) {
  if (!minPairDeltaE || minPairDeltaE <= 0) return;

  var subBySource = {};
  substitutions.forEach(function(sub, i) { subBySource[sub.sourceId] = i; });

  function getAfterLab(threadId) {
    if (subBySource[threadId] !== undefined) {
      var s = substitutions[subBySource[threadId]];
      return _getThreadLab(s.selectedTarget.id);
    }
    return _getThreadLab(threadId);
  }

  var allThreadIds = skeinData.map(function(t) { return t.id; });

  substitutions.forEach(function(sub, subIdx) {
    if (sub.status === "conflict") { sub.contrastWarning = null; return; }
    sub.contrastWarning = null;
    var targetLab = _getThreadLab(sub.selectedTarget.id);
    if (!targetLab) return;

    var worstConflict = null, worstDE = Infinity;
    allThreadIds.forEach(function(otherId) {
      if (otherId === sub.sourceId) return;
      var otherLab = getAfterLab(otherId);
      if (!otherLab) return;
      var de = _calcDE(targetLab, otherLab);
      if (de < minPairDeltaE && de < worstDE) { worstDE = de; worstConflict = otherId; }
    });
    if (worstConflict === null) return;

    var pool = sub._cands || [sub.selectedTarget].concat(sub.alternativeTargets || []);
    for (var ci = 0; ci < pool.length; ci++) {
      if (pool[ci].id === sub.selectedTarget.id) continue;
      var altLab = _getThreadLab(pool[ci].id);
      if (!altLab) continue;
      var hasConflict = false;
      for (var oi = 0; oi < allThreadIds.length; oi++) {
        var oid = allThreadIds[oi];
        if (oid === sub.sourceId) continue;
        var olb = getAfterLab(oid);
        if (!olb) continue;
        if (_calcDE(altLab, olb) < minPairDeltaE) { hasConflict = true; break; }
      }
      if (!hasConflict) {
        sub.selectedTarget = pool[ci];
        sub.alternativeTargets = pool.filter(function(p) { return p.id !== pool[ci].id; }).slice(0, 4);
        sub.status = _statusFromTarget(sub.selectedTarget);
        subBySource[sub.sourceId] = subIdx;
        return;
      }
    }
    var conflictDmc = dmcMap[worstConflict];
    sub.contrastWarning = {
      conflictsWith: worstConflict,
      conflictsWithName: conflictDmc ? conflictDmc.name : worstConflict,
      pairDeltaE: Math.round(worstDE * 10) / 10
    };
  });
}

// F2: Renders a pixel-per-stitch thumbnail with remap applied. Returns PNG data URL or null.
// remap: { [sourceId]: dmcEntry } where dmcEntry has .rgb
function renderSubstitutionPreview(pat, sW, sH, partialStitches, remap) {
  try {
    var c = document.createElement("canvas");
    c.width = sW; c.height = sH;
    var cx = c.getContext("2d");
    var imgData = cx.createImageData(sW, sH);
    var d = imgData.data;
    var qKeys = ["TL", "TR", "BL", "BR"];
    for (var i = 0; i < pat.length; i++) {
      var cell = pat[i];
      var idx = i * 4;
      var ps = partialStitches && partialStitches.get(i);
      if (ps) {
        var r = 0, g = 0, b = 0, cnt = 0;
        for (var qi = 0; qi < qKeys.length; qi++) {
          var qe = ps[qKeys[qi]];
          if (qe) { var mr = remap[qe.id] || qe; r += mr.rgb[0]; g += mr.rgb[1]; b += mr.rgb[2]; cnt++; }
        }
        if (cnt > 0) { d[idx] = Math.round(r / cnt); d[idx + 1] = Math.round(g / cnt); d[idx + 2] = Math.round(b / cnt); d[idx + 3] = 255; continue; }
      }
      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") {
        d[idx] = 255; d[idx + 1] = 255; d[idx + 2] = 255; d[idx + 3] = 255;
      } else if (cell.type === "blend" && cell.threads) {
        var t0 = remap[cell.threads[0].id] || cell.threads[0];
        var t1 = remap[cell.threads[1].id] || cell.threads[1];
        d[idx]     = Math.round((t0.rgb[0] + t1.rgb[0]) / 2);
        d[idx + 1] = Math.round((t0.rgb[1] + t1.rgb[1]) / 2);
        d[idx + 2] = Math.round((t0.rgb[2] + t1.rgb[2]) / 2);
        d[idx + 3] = 255;
      } else {
        var rgb = (remap[cell.id] || cell).rgb;
        d[idx] = rgb[0]; d[idx + 1] = rgb[1]; d[idx + 2] = rgb[2]; d[idx + 3] = 255;
      }
    }
    cx.putImageData(imgData, 0, 0);
    return c.toDataURL("image/png");
  } catch (e) { return null; }
}

// ─── Analysis engine ──────────────────────────────────────────────────────────
// analyseSubstitutions(skeinData, threadOwned, globalStash, fabricCt, options)
//   → { substitutions: SubstitutionProposal[], skipped: SkippedThread[] }
window.analyseSubstitutions = function analyseSubstitutions(skeinData, threadOwned, globalStash, fabricCt, options) {
  options = options || {};
  var maxDeltaE = (options.maxDeltaE != null) ? options.maxDeltaE : 15;
  var dmcData = options.dmcData || (typeof DMC !== "undefined" ? DMC : []);
  var preserveContrast = options.preserveContrast !== false; // default true
  var minPairwiseDeltaE = options.minPairwiseDeltaE != null ? options.minPairwiseDeltaE : 4;

  var dmcMap = {};
  dmcData.forEach(function(d) { dmcMap[d.id] = d; });

  // Build list of stash candidates (threads with owned > 0, from any brand)
  var stashEntries = [];
  Object.keys(globalStash).forEach(function(compositeKey) {
    var entry = globalStash[compositeKey];
    if (!entry || !(entry.owned > 0)) return;
    // Resolve thread object: handle composite ('dmc:310', 'anchor:403') or legacy bare id.
    var thread = null;
    if (typeof getThreadByKey === 'function') {
      thread = getThreadByKey(compositeKey);
    } else {
      thread = dmcMap[compositeKey] || dmcMap[(compositeKey.indexOf(':') >= 0 ? compositeKey.split(':')[1] : compositeKey)] || null;
    }
    if (!thread) return;
    var brand = compositeKey.indexOf(':') >= 0 ? compositeKey.split(':')[0] : 'dmc';
    stashEntries.push({ id: compositeKey, name: thread.name, rgb: thread.rgb, brand: brand, lab: _getThreadLab(compositeKey), ownedSkeins: entry.owned });
  });

  var substitutions = [];
  var skipped = [];

  skeinData.forEach(function(thread) {
    if ((threadOwned[thread.id] || "") === "owned") return;

    var targetLab = _getThreadLab(thread.id);
    if (!targetLab) {
      skipped.push({ sourceId: thread.id, sourceName: thread.name || thread.id, sourceRgb: thread.rgb || [128, 128, 128], sourceStitches: thread.stitches, reason: "no_stash_match", nearMisses: [], isBlendComponent: false, blendId: null });
      return;
    }

    var neededSkeins = typeof skeinEst === "function"
      ? skeinEst(thread.stitches, fabricCt)
      : Math.ceil(thread.stitches / 200);

    var candidates = [];
    stashEntries.forEach(function(stash) {
      if (stash.id === thread.id) return;
      var de = _calcDE(targetLab, stash.lab);
      candidates.push({ id: stash.id, name: stash.name, rgb: stash.rgb, brand: stash.brand || 'dmc', deltaE: Math.round(de * 10) / 10, ownedSkeins: stash.ownedSkeins, neededSkeins: neededSkeins, hasSufficient: stash.ownedSkeins >= neededSkeins });
    });

    if (candidates.length === 0) {
      skipped.push({ sourceId: thread.id, sourceName: thread.name || thread.id, sourceRgb: thread.rgb || [128, 128, 128], sourceStitches: thread.stitches, reason: "no_stash_match", nearMisses: [], isBlendComponent: false, blendId: null });
      return;
    }

    candidates.sort(function(a, b) { return a.deltaE - b.deltaE; });
    var validCandidates = candidates.filter(function(c) { return c.deltaE <= maxDeltaE; });

    if (validCandidates.length === 0) {
      // F3: collect near-misses between maxDeltaE and maxDeltaE×1.5, max 3
      var nearMissMax = maxDeltaE * 1.5;
      var nearMisses = candidates.filter(function(c) {
        return c.deltaE > maxDeltaE && c.deltaE <= nearMissMax;
      }).slice(0, 3);
      skipped.push({ sourceId: thread.id, sourceName: thread.name || thread.id, sourceRgb: thread.rgb || [128, 128, 128], sourceStitches: thread.stitches, reason: "all_above_threshold", nearMisses: nearMisses, isBlendComponent: false, blendId: null });
      return;
    }

    var top5 = validCandidates.slice(0, 5);

    // Prefer a candidate with sufficient stock, else fall back to lowest deltaE
    var best = null;
    for (var i = 0; i < top5.length; i++) {
      if (top5[i].hasSufficient) { best = top5[i]; break; }
    }
    if (!best) best = top5[0];

    substitutions.push({
      sourceId: thread.id,
      sourceName: thread.name || thread.id,
      sourceRgb: thread.rgb || [128, 128, 128],
      sourceStitches: thread.stitches,
      sourceSkeins: neededSkeins,
      isBlendComponent: false,
      blendId: null,
      selectedTarget: best,
      alternativeTargets: top5.slice(1),
      _cands: top5,          // retained for duplicate/contrast resolution
      status: _statusFromTarget(best),
      userOverride: null,
      contrastWarning: null
    });
  });

  // Resolve duplicate targets
  _resolveDuplicateTargets(substitutions);

  // F4: Enforce pairwise contrast
  if (preserveContrast && minPairwiseDeltaE > 0) {
    _enforceContrastConstraints(substitutions, skeinData, minPairwiseDeltaE, dmcMap);
  }

  return { substitutions: substitutions, skipped: skipped };
};

// ─── Modal outer wrapper ──────────────────────────────────────────────────────
window.SubstituteFromStashModal = function SubstituteFromStashModal() {
  var ctx = window.usePatternData();
  var cv = window.useCanvas();
  var app = window.useApp();
  var h = React.createElement;
  if (!ctx.substituteModalOpen || !ctx.substituteProposal) return null;
  return h(SubstituteFromStashModalInner, { key: ctx.substituteModalKey, ctx: ctx });
};

// ─── Inner modal ──────────────────────────────────────────────────────────────
function SubstituteFromStashModalInner(props) {
  var ctx = props.ctx;
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  var proposal = ctx.substituteProposal;

  function makeKey(sub) { return sub.sourceId + "|" + (sub.blendId || ""); }
  function skipKey(sk)  { return sk.sourceId  + "|" + (sk.blendId  || ""); }

  var _en = useState(function() {
    var m = {};
    proposal.substitutions.forEach(function(s) { m[makeKey(s)] = true; });
    return m;
  });
  var enabledMap = _en[0], setEnabledMap = _en[1];

  var _ov = useState({});
  var overrides = _ov[0], setOverrides = _ov[1];

  var _ex = useState({});
  var expanded = _ex[0], setExpanded = _ex[1];

  // F3: near-miss expand state per skipped row
  var _nm = useState({});
  var nmExpanded = _nm[0], setNmExpanded = _nm[1];

  var _maxDE = useState(ctx.substituteMaxDeltaE);
  var localMaxDE = _maxDE[0], setLocalMaxDE = _maxDE[1];

  // F4: preserve contrast toggle (initialised from module-level pref)
  var _pc = useState(_preserveContrastPref);
  var preserveContrast = _pc[0], setPreserveContrast = _pc[1];

  var _analyzing = useState(false);
  var analyzing = _analyzing[0], setAnalyzing = _analyzing[1];

  var _localProposal = useState(proposal);
  var localProposal = _localProposal[0], setLocalProposal = _localProposal[1];

  var debounceRef = useRef(null);

  useEffect(function() {
    return function() {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function reanalyse(maxDE, overridePC) {
    if (typeof StashBridge === "undefined") return;
    var usePC = (overridePC !== undefined) ? overridePC : preserveContrast;
    setAnalyzing(true);
    ctx.setSubstituteMaxDeltaE(maxDE);
    StashBridge.getGlobalStash().then(function(stash) {
      var result = analyseSubstitutions(
        ctx.skeinData, ctx.threadOwned, stash, ctx.fabricCt,
        { maxDeltaE: maxDE, dmcData: DMC, preserveContrast: usePC }
      );
      ctx.setSubstituteProposal(result);
      setLocalProposal(result);
      var newEnabled = {};
      result.substitutions.forEach(function(s) { newEnabled[makeKey(s)] = true; });
      setEnabledMap(newEnabled);
      setOverrides({}); setExpanded({}); setNmExpanded({});
      setAnalyzing(false);
    }).catch(function() { setAnalyzing(false); });
  }

  function handleSliderChange(v) {
    setLocalMaxDE(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(function() { reanalyse(v); }, 300);
  }

  function handlePreserveContrastChange(val) {
    _preserveContrastPref = val;
    setPreserveContrast(val);
    reanalyse(localMaxDE, val);
  }

  function getEffectiveTarget(sub) {
    var key = makeKey(sub);
    return overrides[key] || sub.selectedTarget;
  }

  function getEffectiveStatus(sub) {
    var key = makeKey(sub);
    var ov = overrides[key];
    if (!ov) return sub.status;
    if (!ov.hasSufficient) return "insufficient";
    if (ov.deltaE < 5) return "good";
    if (ov.deltaE < 10) return "fair";
    return "poor";
  }

  function toggleEnabled(sub) {
    var key = makeKey(sub);
    setEnabledMap(function(prev) { var n = Object.assign({}, prev); n[key] = !n[key]; return n; });
  }

  function toggleExpanded(sub) {
    var key = makeKey(sub);
    setExpanded(function(prev) { var n = Object.assign({}, prev); n[key] = !n[key]; return n; });
  }

  function selectOverride(sub, alt) {
    var key = makeKey(sub);
    setOverrides(function(prev) { var n = Object.assign({}, prev); n[key] = alt; return n; });
    setExpanded(function(prev) { var n = Object.assign({}, prev); n[key] = false; return n; });
  }

  // F3: include a near-miss as a substitution
  function includeNearMiss(sk, nm) {
    var neededSkeins = typeof skeinEst === "function"
      ? skeinEst(sk.sourceStitches, ctx.fabricCt)
      : Math.ceil(sk.sourceStitches / 200);
    var otherNm = (sk.nearMisses || []).filter(function(x) { return x.id !== nm.id; });
    var newSub = {
      sourceId: sk.sourceId, sourceName: sk.sourceName, sourceRgb: sk.sourceRgb,
      sourceStitches: sk.sourceStitches, sourceSkeins: neededSkeins,
      isBlendComponent: sk.isBlendComponent || false, blendId: sk.blendId || null,
      selectedTarget: nm, alternativeTargets: otherNm, _cands: [nm].concat(otherNm),
      status: "poor", userOverride: null, contrastWarning: null, includedFromNearMiss: true
    };
    setLocalProposal(function(prev) {
      var newSkipped = prev.skipped.filter(function(s) { return s.sourceId !== sk.sourceId; });
      var newSubs = prev.substitutions.concat([newSub]);
      _resolveDuplicateTargets(newSubs);
      if (preserveContrast) {
        var dmcMap = {};
        if (typeof DMC !== "undefined" && Array.isArray(DMC)) {
          DMC.forEach(function(d) { dmcMap[d.id] = d; });
        }
        _enforceContrastConstraints(newSubs, ctx.skeinData, 4, dmcMap);
      }
      return { substitutions: newSubs, skipped: newSkipped };
    });
    setEnabledMap(function(prev) { var n = Object.assign({}, prev); n[makeKey(newSub)] = true; return n; });
    setNmExpanded(function(prev) { var n = Object.assign({}, prev); n[skipKey(sk)] = false; return n; });
  }

  // Enabled substitutions for Apply
  var enabledSubs = localProposal.substitutions.filter(function(s) { return enabledMap[makeKey(s)] !== false; });

  var warningCount = enabledSubs.filter(function(s) { return !getEffectiveTarget(s).hasSufficient; }).length;
  var contrastWarningCount = enabledSubs.filter(function(s) { return s.contrastWarning && !overrides[makeKey(s)]; }).length;

  // F2: Canvas previews via useState+useEffect (more robust than useMemo)
  var _ot = useState(null);
  var originalThumb = _ot[0], setOriginalThumb = _ot[1];
  var _st = useState(null);
  var substitutedThumb = _st[0], setSubstitutedThumb = _st[1];

  // Generate original thumbnail once on mount
  useEffect(function() {
    if (!ctx.pat || !ctx.sW || !ctx.sH) return;
    try {
      var thumb = typeof generatePatternThumbnail === "function"
        ? generatePatternThumbnail(ctx.pat, ctx.sW, ctx.sH, ctx.partialStitches)
        : renderSubstitutionPreview(ctx.pat, ctx.sW, ctx.sH, ctx.partialStitches, {});
      setOriginalThumb(thumb);
    } catch (e) {}
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Recompute substituted thumbnail whenever selection changes
  useEffect(function() {
    if (!ctx.pat || !ctx.sW || !ctx.sH) return;
    try {
      var remap = {};
      localProposal.substitutions.forEach(function(sub) {
        if (enabledMap[makeKey(sub)] === false) return;
        var target = overrides[makeKey(sub)] || sub.selectedTarget;
        var dmcEntry = DMC.find(function(d) { return d.id === target.id; });
        if (dmcEntry) remap[sub.sourceId] = dmcEntry;
      });
      setSubstitutedThumb(renderSubstitutionPreview(ctx.pat, ctx.sW, ctx.sH, ctx.partialStitches, remap));
    } catch (e) {}
  }, [localProposal, enabledMap, overrides]); // eslint-disable-line react-hooks/exhaustive-deps

  // ─── Apply ───────────────────────────────────────────────────────────────────
  function applySubstitutions() {
    var pat = ctx.pat;
    var partialStitches = ctx.partialStitches;

    // Step 1: Build remap { sourceId → new cell entry }
    var remap = {};
    enabledSubs.forEach(function(sub) {
      var target = getEffectiveTarget(sub);
      var dmcEntry = DMC.find(function(d) { return d.id === target.id; });
      if (dmcEntry) {
        remap[sub.sourceId] = {
          id: dmcEntry.id,
          type: "solid",
          name: dmcEntry.name,
          rgb: dmcEntry.rgb,
          lab: dmcEntry.lab || (typeof rgbToLab === "function" ? rgbToLab(dmcEntry.rgb[0], dmcEntry.rgb[1], dmcEntry.rgb[2]) : null)
        };
      }
    });

    // Step 2: Apply to pattern cells
    var np = pat.slice();
    var changes = [];
    for (var i = 0; i < np.length; i++) {
      var cell = np[i];
      if (cell.id === "__skip__" || cell.id === "__empty__") continue;

      if (cell.type === "blend" && cell.threads) {
        var needsChange = false;
        var newThreads = cell.threads.map(function(t) {
          if (remap[t.id]) { needsChange = true; return remap[t.id]; }
          return t;
        });
        if (needsChange) {
          changes.push({ idx: i, old: Object.assign({}, cell) });
          var newBlendId = newThreads.map(function(t) { return t.id; }).sort().join("+");
          np[i] = Object.assign({}, cell, {
            id: newBlendId,
            threads: newThreads,
            rgb: [
              Math.round((newThreads[0].rgb[0] + newThreads[1].rgb[0]) / 2),
              Math.round((newThreads[0].rgb[1] + newThreads[1].rgb[1]) / 2),
              Math.round((newThreads[0].rgb[2] + newThreads[1].rgb[2]) / 2)
            ]
          });
        }
        continue;
      }

      if (remap[cell.id]) {
        changes.push({ idx: i, old: Object.assign({}, cell) });
        np[i] = Object.assign({}, remap[cell.id]);
      }
    }

    // Step 3: Apply to partial stitches
    var psChanged = false;
    var psChanges = [];
    var nm = new Map(partialStitches);
    nm.forEach(function(entry, idx) {
      var newEntry = Object.assign({}, entry);
      var changed = false;
      ["TL", "TR", "BL", "BR"].forEach(function(q) {
        if (entry[q] && remap[entry[q].id]) {
          var t = remap[entry[q].id];
          newEntry[q] = { id: t.id, rgb: t.rgb };
          changed = true;
        }
      });
      if (changed) {
        psChanges.push({ idx: idx, old: Object.assign({}, entry) });
        nm.set(idx, newEntry);
        psChanged = true;
      }
    });

    // Step 4: Guard — nothing changed
    if (changes.length === 0 && !psChanged) {
      app.addToast("No stitches were changed.", { type: "info", duration: 2000 });
      return;
    }

    // Step 4: Commit undo entry
    cv.setEditHistory(function(prev) {
      var entry = { type: "stashSubstitution", changes: changes, psChanges: psChanges.length > 0 ? psChanges : undefined };
      var n = prev.concat([entry]);
      if (n.length > cv.EDIT_HISTORY_MAX) n = n.slice(n.length - cv.EDIT_HISTORY_MAX);
      return n;
    });
    cv.setRedoHistory([]);
    ctx.setPat(np);
    if (psChanged) ctx.setPartialStitches(nm);

    var result = ctx.buildPaletteWithScratch(np);
    ctx.setPal(result.pal);
    ctx.setCmap(result.cmap);

    // Mark substituted targets as owned
    var newOwned = Object.assign({}, ctx.threadOwned);
    enabledSubs.forEach(function(sub) {
      var t = getEffectiveTarget(sub);
      newOwned[t.id] = "owned";
    });
    ctx.setThreadOwned(newOwned);

    // Step 5: Close and toast
    ctx.setSubstituteModalOpen(false);
    ctx.setSubstituteProposal(null);
    app.addToast(
      changes.length + " stitches updated across " + enabledSubs.length + " colour" + (enabledSubs.length !== 1 ? "s" : "") + ". Ctrl+Z to undo.",
      { type: "success", duration: 4000 }
    );
  }

  function closeModal() {
    ctx.setSubstituteModalOpen(false);
    ctx.setSubstituteProposal(null);
  }

  // ─── Render helpers ───────────────────────────────────────────────────────────
  function swatch(rgb, size) {
    size = size || 14;
    return h("span", {
      style: {
        display: "inline-block", width: size, height: size,
        borderRadius: 3,
        background: "rgb(" + rgb[0] + "," + rgb[1] + "," + rgb[2] + ")",
        border: "1px solid #cbd5e1", flexShrink: 0, verticalAlign: "middle"
      }
    });
  }

  function statusBadge(status) {
    var s = { fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8, flexShrink: 0 };
    if (status === "good")         return h("span", { style: Object.assign({}, s, { background: "#d1fae5", color: "#065f46" }) }, "Good");
    if (status === "fair")         return h("span", { style: Object.assign({}, s, { background: "#fef3c7", color: "#92400e" }) }, "Fair");
    if (status === "poor")         return h("span", { style: Object.assign({}, s, { background: "#fee2e2", color: "#991b1b" }) }, "Poor");
    if (status === "insufficient") return h("span", { style: Object.assign({}, s, { background: "#ffedd5", color: "#7c2d12" }) }, "\u26A0 Low stock");
    if (status === "conflict")     return h("span", { style: Object.assign({}, s, { background: "#fce7f3", color: "#9d174d" }) }, "Conflict");
    return null;
  }

  // ─── Substitution row ─────────────────────────────────────────────────────────
  function renderSubRow(sub) {
    var key = makeKey(sub);
    var isEnabled = enabledMap[key] !== false;
    var target = getEffectiveTarget(sub);
    var isExpanded = !!expanded[key];
    var hasAlts = sub.alternativeTargets && sub.alternativeTargets.length > 0;
    var effStatus = getEffectiveStatus(sub);
    var hasContrastWarning = !!(sub.contrastWarning && !overrides[key]);

    return h(React.Fragment, { key: key },
      h("div", {
        style: {
          borderRadius: 6, overflow: "hidden",
          border: "1px solid " + (isEnabled ? (hasContrastWarning ? "#fed7aa" : "#e2e8f0") : "#f1f5f9"),
          opacity: isEnabled ? 1 : 0.55
        }
      },
        // Main row
        h("div", {
          style: {
            display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
            background: isEnabled ? (hasContrastWarning ? "#fffbeb" : "#fff") : "#f8f9fa"
          }
        },
          h("input", {
            type: "checkbox", checked: isEnabled, onChange: function() { toggleEnabled(sub); },
            style: { flexShrink: 0, width: 14, height: 14, cursor: "pointer", accentColor: "#7c3aed" }
          }),
          swatch(sub.sourceRgb),
          h("span", { style: { fontSize: 12, fontWeight: 700, minWidth: 58, flexShrink: 0 } }, "DMC " + sub.sourceId),
          sub.isBlendComponent
            ? h("span", { style: { fontSize: 10, color: "#94a3b8", flexShrink: 0 } }, "(blend)")
            : null,
          h("span", { style: { color: "#94a3b8", fontSize: 13, flexShrink: 0 } }, "\u2192"),
          swatch(target.rgb),
          h("span", { style: { fontSize: 12, fontWeight: 700, minWidth: 58, flexShrink: 0 } }, "DMC " + target.id),
          h("span", { style: { fontSize: 11, color: "#475569", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, target.name),
          sub.includedFromNearMiss
            ? h("span", { style: { fontSize: 10, fontWeight: 600, padding: "1px 6px", borderRadius: 8, background: "#fff7ed", color: "#c2410c", flexShrink: 0 } }, "manual\u00B7\u0394E\u202F" + target.deltaE)
            : statusBadge(effStatus),
          !sub.includedFromNearMiss
            ? h("span", { style: { fontSize: 10, color: "#94a3b8", flexShrink: 0, minWidth: 36, textAlign: "right" } }, "\u0394E\u202F" + target.deltaE)
            : null,
          h("span", {
            style: { fontSize: 10, color: target.hasSufficient ? "#16a34a" : "#ea580c", flexShrink: 0, minWidth: 44, textAlign: "right" }
          }, target.ownedSkeins + "/" + target.neededSkeins + "sk"),
          hasAlts
            ? h("button", {
                onClick: function() { toggleExpanded(sub); },
                style: {
                  fontSize: 10, padding: "2px 7px", borderRadius: 5, cursor: "pointer",
                  border: "1px solid #e0e7ff",
                  background: isExpanded ? "#e0e7ff" : "#fff",
                  color: "#4338ca", flexShrink: 0
                },
                title: "Show alternative substitutions"
              }, isExpanded ? "\u25B4 Hide" : "\u25BE Alts")
            : null
        ),
        // F4: Contrast warning detail row
        hasContrastWarning && isEnabled
          ? h("div", {
              style: {
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px 5px 34px",
                background: "#fef3c7", borderTop: "1px solid #fde68a",
                fontSize: 11, color: "#92400e"
              }
            },
              h("span", null, "\u26A0 Contrast: \u0394E\u202F" + sub.contrastWarning.pairDeltaE +
                " from DMC\u202F" + sub.contrastWarning.conflictsWith + " " + sub.contrastWarning.conflictsWithName +
                " \u2014 pattern may lose colour distinction")
            )
          : null
      ),
      isExpanded && hasAlts
        ? h("div", { style: { padding: "4px 10px 6px 36px", display: "flex", flexDirection: "column", gap: 3 } },
            sub.alternativeTargets.map(function(alt) {
              var isSelected = overrides[key] && overrides[key].id === alt.id;
              return h("div", {
                key: alt.id,
                onClick: function() { selectOverride(sub, alt); },
                style: {
                  display: "flex", alignItems: "center", gap: 6, padding: "5px 8px", borderRadius: 5,
                  border: "1px solid " + (isSelected ? "#a78bfa" : "#e2e8f0"),
                  background: isSelected ? "#f5f3ff" : "#fafafa",
                  cursor: "pointer", fontSize: 11
                }
              },
                swatch(alt.rgb, 12),
                h("span", { style: { fontWeight: 700, minWidth: 52, flexShrink: 0 } }, "DMC " + alt.id),
                h("span", { style: { color: "#475569", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, alt.name),
                h("span", { style: { color: "#94a3b8", flexShrink: 0 } }, "\u0394E\u202F" + alt.deltaE),
                h("span", { style: { color: alt.hasSufficient ? "#16a34a" : "#ea580c", flexShrink: 0, minWidth: 40, textAlign: "right" } }, alt.ownedSkeins + "/" + alt.neededSkeins + "sk"),
                isSelected ? h("span", { style: { color: "#7c3aed", fontWeight: 700, marginLeft: 4, flexShrink: 0 } }, "\u2713") : null
              );
            })
          )
        : null
    );
  }

  // F3: Skipped row with near-miss expansion
  function renderSkipRow(sk) {
    var skk = skipKey(sk);
    var isNmOpen = !!nmExpanded[skk];
    var hasNm = sk.nearMisses && sk.nearMisses.length > 0;
    var reasonText = sk.reason === "no_stash_match"
      ? "no threads in stash"
      : sk.reason === "all_above_threshold"
        ? "all above \u0394E\u202F" + localMaxDE
        : "blend component";

    return h(React.Fragment, { key: skk },
      h("div", { style: { display: "flex", alignItems: "center", gap: 7, padding: "5px 8px", fontSize: 12 } },
        swatch(sk.sourceRgb || [128, 128, 128], 12),
        h("span", { style: { fontWeight: 700, minWidth: 58, flexShrink: 0 } }, "DMC " + sk.sourceId),
        h("span", { style: { color: "#475569", flex: 1 } }, sk.sourceName),
        sk.isBlendComponent
          ? h("span", { style: { fontSize: 10, color: "#94a3b8", flexShrink: 0 } }, "(blend)")
          : null,
        h("span", { style: { color: "#94a3b8", fontSize: 11, flexShrink: 0 } }, reasonText),
        hasNm
          ? h("button", {
              onClick: function() { setNmExpanded(function(prev) { var n = Object.assign({}, prev); n[skk] = !n[skk]; return n; }); },
              style: {
                fontSize: 10, padding: "2px 7px", borderRadius: 5, cursor: "pointer",
                border: "1px solid #fed7aa",
                background: isNmOpen ? "#fed7aa" : "#fff7ed",
                color: "#92400e", flexShrink: 0
              }
            }, isNmOpen ? "\u25B4 Hide" : "Near misses \u25BE")
          : h("span", { style: { fontSize: 10, color: "#cbd5e1", flexShrink: 0 } }, "no near misses")
      ),
      isNmOpen && hasNm
        ? h("div", { style: { paddingLeft: 28, paddingBottom: 6, display: "flex", flexDirection: "column", gap: 4 } },
            sk.nearMisses.map(function(nm) {
              return h("div", {
                key: nm.id,
                style: {
                  display: "flex", alignItems: "center", gap: 6, padding: "5px 10px", borderRadius: 5,
                  border: "1px solid #fed7aa", background: "#fff7ed", fontSize: 11
                }
              },
                swatch(nm.rgb, 12),
                h("span", { style: { fontWeight: 700, minWidth: 52, flexShrink: 0 } }, "DMC " + nm.id),
                h("span", { style: { color: "#475569", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, nm.name),
                h("span", { style: { color: "#d97706", flexShrink: 0 } }, "\u0394E\u202F" + nm.deltaE),
                h("span", { style: { color: nm.hasSufficient ? "#16a34a" : "#ea580c", flexShrink: 0, minWidth: 40, textAlign: "right" } }, nm.ownedSkeins + "/" + nm.neededSkeins + "sk"),
                h("button", {
                  onClick: function() { includeNearMiss(sk, nm); },
                  style: {
                    fontSize: 10, padding: "3px 9px", borderRadius: 5, cursor: "pointer",
                    border: "1px solid #a78bfa", background: "#f5f3ff", color: "#7c3aed",
                    fontWeight: 600, flexShrink: 0
                  }
                }, "Include anyway \u2192")
              );
            })
          )
        : null
    );
  }

  // F2: Canvas preview section
  function renderPreview() {
    if (!ctx.pat || !ctx.sW || !ctx.sH) return null;
    var sectionHeader = h("div", { style: { fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 700, marginBottom: 8, letterSpacing: "0.04em" } }, "Pattern Preview");

    // Still generating
    if (!originalThumb) {
      return h("div", { style: { marginBottom: 14 } },
        sectionHeader,
        h("div", { style: { height: 90, display: "flex", alignItems: "center", justifyContent: "center", background: "#f8f9fa", borderRadius: 8, border: "1px solid #f1f5f9", color: "#94a3b8", fontSize: 12 } },
          "Generating preview\u2026"
        )
      );
    }

    // Use ComparisonSlider if available, otherwise plain side-by-side imgs
    var CompSlider = typeof window !== "undefined" && typeof window.ComparisonSlider === "function" ? window.ComparisonSlider : null;
    var afterSrc = substitutedThumb || originalThumb;

    return h("div", { style: { marginBottom: 14 } },
      sectionHeader,
      CompSlider
        ? h(CompSlider, {
            originalSrc: originalThumb, previewSrc: afterSrc,
            heatmapSrc: null, highlightSrc: null,
            width: ctx.sW, height: ctx.sH,
            leftLabel: "Current", rightLabel: "After substitution"
          })
        : h("div", { style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 } },
            h("div", { style: { textAlign: "center" } },
              h("img", { src: originalThumb, alt: "Current pattern", draggable: false, style: { width: "100%", imageRendering: "pixelated", borderRadius: 6, border: "1px solid #e2e8f0" } }),
              h("div", { style: { fontSize: 10, color: "#94a3b8", marginTop: 3 } }, "Current")
            ),
            h("div", { style: { textAlign: "center" } },
              h("img", { src: afterSrc, alt: "After substitution", draggable: false, style: { width: "100%", imageRendering: "pixelated", borderRadius: 6, border: "1px solid #e2e8f0" } }),
              h("div", { style: { fontSize: 10, color: "#94a3b8", marginTop: 3 } }, "After substitution")
            )
          )
    );
  }

  // ─── Render ───────────────────────────────────────────────────────────────────
  var p = localProposal;
  var applyLabel = "Apply " + enabledSubs.length + " Substitution" + (enabledSubs.length !== 1 ? "s" : "");
  if (contrastWarningCount > 0) applyLabel += " (\u26A0\u202F" + contrastWarningCount + " contrast)";

  return h("div", {
    onClick: function(e) { if (e.target === e.currentTarget) closeModal(); },
    style: {
      position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1200,
      display: "flex", alignItems: "center", justifyContent: "center"
    }
  },
    h("div", {
      style: {
        background: "#fff", borderRadius: 12, boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
        width: "100%", maxWidth: 660, maxHeight: "90vh",
        display: "flex", flexDirection: "column", overflow: "hidden",
        margin: "0 16px"
      }
    },
      // ── Header ────────────────────────────────────────────────────────────────
      h("div", { style: { display: "flex", alignItems: "center", padding: "16px 20px 14px", borderBottom: "1px solid #f1f5f9", flexShrink: 0 } },
        h("h2", { style: { margin: 0, fontSize: 17, fontWeight: 700, color: "#1e293b", flex: 1 } }, "Substitute from Stash"),
        h("button", {
          onClick: closeModal,
          style: { background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8", padding: "0 4px", borderRadius: 6, lineHeight: 1 }
        }, "\xD7")
      ),

      // ── Scrollable body ───────────────────────────────────────────────────────
      h("div", { style: { overflow: "auto", flex: 1, padding: "16px 20px" } },

        // Controls: ΔE slider + preserve contrast toggle
        h("div", { style: { marginBottom: 16, padding: "12px 14px", background: "#f8f9fa", borderRadius: 8, border: "1px solid #f1f5f9" } },
          h("div", { style: { display: "flex", alignItems: "center", gap: 10, marginBottom: 8 } },
            h("span", { style: { fontSize: 12, color: "#475569", fontWeight: 600 } }, "Max colour distance (\u0394E):"),
            h("span", { style: { fontSize: 15, fontWeight: 700, color: "#1e293b", minWidth: 28 } }, localMaxDE),
            analyzing ? h("span", { style: { fontSize: 11, color: "#7c3aed" } }, "Analysing\u2026") : null
          ),
          h("input", {
            type: "range", min: 1, max: 40, step: 1,
            value: localMaxDE,
            onChange: function(e) { handleSliderChange(parseInt(e.target.value)); },
            style: { width: "100%", accentColor: "#7c3aed", cursor: "pointer" }
          }),
          h("div", { style: { display: "flex", justifyContent: "space-between", fontSize: 10, color: "#94a3b8", marginTop: 2 } },
            h("span", null, "1 \u2014 exact match"),
            h("span", null, "40 \u2014 broad")
          ),
          // F4: Preserve contrast toggle
          h("label", { style: { display: "flex", alignItems: "center", gap: 6, marginTop: 10, cursor: "pointer" } },
            h("input", {
              type: "checkbox", checked: preserveContrast,
              onChange: function(e) { handlePreserveContrastChange(e.target.checked); },
              style: { width: 14, height: 14, accentColor: "#7c3aed", cursor: "pointer" }
            }),
            h("span", { style: { fontSize: 12, color: "#475569" } }, "Preserve colour contrast"),
            h("span", { style: { fontSize: 10, color: "#94a3b8", marginLeft: 2 } },
              "(avoid substitutions that make palette colours too similar)"
            )
          )
        ),

        // F2: Preview — placed here so it's visible without scrolling
        renderPreview(),

        // Proposed substitutions
        p.substitutions.length > 0
          ? h("div", { style: { marginBottom: 14 } },
              h("div", {
                style: { fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 700, marginBottom: 8, letterSpacing: "0.04em" }
              }, "Proposed Substitutions (" + p.substitutions.length + ")"),
              h("div", { style: { display: "flex", flexDirection: "column", gap: 4 } },
                p.substitutions.map(renderSubRow)
              )
            )
          : null,

        // Skipped (F3: with near-miss expansion)
        p.skipped.length > 0
          ? h("div", { style: { marginBottom: 14 } },
              h("div", { style: { fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 700, marginBottom: 8, letterSpacing: "0.04em" } },
                "Skipped \u2014 No Suitable Match (" + p.skipped.length + ")"
              ),
              h("div", { style: { background: "#f8f9fa", borderRadius: 8, border: "1px solid #f1f5f9", padding: "4px 8px", display: "flex", flexDirection: "column" } },
                p.skipped.map(renderSkipRow)
              )
            )
          : null,

        // No results at all
        p.substitutions.length === 0 && p.skipped.length === 0
          ? h("div", { style: { padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: 13 } },
              "No unowned threads found \u2014 all threads are already marked as owned."
            )
          : null,

        // Summary
        h("div", { style: { padding: "10px 14px", background: "#f0f9ff", borderRadius: 8, border: "1px solid #bae6fd", fontSize: 12, color: "#0c4a6e" } },
          h("strong", null, enabledSubs.length + " substitution" + (enabledSubs.length !== 1 ? "s" : "") + " selected"),
          h("span", null, " \xB7 " + p.skipped.length + " skipped"),
          warningCount > 0
            ? h("span", { style: { color: "#ea580c" } }, " \xB7 " + warningCount + " low stock")
            : null,
          contrastWarningCount > 0
            ? h("span", { style: { color: "#b45309" } }, " \xB7 " + contrastWarningCount + " contrast warning" + (contrastWarningCount !== 1 ? "s" : ""))
            : null
        ),
        h("div", { style: { marginTop: 8, fontSize: 11, color: "#94a3b8" } },
          "Tip: All changes can be undone with Ctrl+Z"
        )
      ),

      // ── Footer ────────────────────────────────────────────────────────────────
      h("div", {
        style: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", borderTop: "1px solid #f1f5f9", flexShrink: 0 }
      },
        h("button", {
          onClick: closeModal,
          style: { padding: "8px 20px", fontSize: 13, borderRadius: 8, border: "1px solid #e2e8f0", background: "#fff", color: "#475569", cursor: "pointer", fontWeight: 500 }
        }, "Cancel"),
        h("button", {
          onClick: applySubstitutions,
          disabled: enabledSubs.length === 0,
          style: {
            padding: "8px 22px", fontSize: 13, borderRadius: 8, fontWeight: 700,
            cursor: enabledSubs.length === 0 ? "not-allowed" : "pointer",
            border: enabledSubs.length === 0 ? "1px solid #e2e8f0" : "1px solid #a78bfa",
            background: enabledSubs.length === 0 ? "#f8f9fa" : "#7c3aed",
            color: enabledSubs.length === 0 ? "#94a3b8" : "#fff"
          }
        }, applyLabel)
      )
    )
  );
}
