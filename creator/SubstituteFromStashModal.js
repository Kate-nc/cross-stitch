/* creator/SubstituteFromStashModal.js — Analyse unowned threads and propose
   substitutions from the user's stash. Pure analysis function + review modal.
   Depends on globals: React, DMC, skeinEst (helpers.js),
   rgbToLab, dE (colour-utils.js), CreatorContext (context.js),
   StashBridge (stash-bridge.js, optional) */

// ─── Pure analysis engine ─────────────────────────────────────────────────────
// analyseSubstitutions(skeinData, threadOwned, globalStash, fabricCt, options)
//   → { substitutions: SubstitutionProposal[], skipped: SkippedThread[] }
window.analyseSubstitutions = function analyseSubstitutions(skeinData, threadOwned, globalStash, fabricCt, options) {
  options = options || {};
  var maxDeltaE = (options.maxDeltaE != null) ? options.maxDeltaE : 15;
  var dmcData = options.dmcData || (typeof DMC !== "undefined" ? DMC : []);

  var dmcMap = {};
  dmcData.forEach(function(d) { dmcMap[d.id] = d; });

  function getLabForId(id) {
    var d = dmcMap[id];
    if (!d) return null;
    if (d.lab) {
      var l = d.lab;
      if (Array.isArray(l)) return l;
      if (l && typeof l === "object") return [l.L || 0, l.a || 0, l.b || 0];
    }
    if (d.rgb && typeof rgbToLab === "function") return rgbToLab(d.rgb[0], d.rgb[1], d.rgb[2]);
    return null;
  }

  function calcDE(labA, labB) {
    if (!labA || !labB) return 999;
    if (typeof dE === "function") return dE(labA, labB);
    var dL = labA[0] - labB[0], da = labA[1] - labB[1], db = labA[2] - labB[2];
    return Math.sqrt(dL * dL + da * da + db * db);
  }

  function statusFromTarget(t) {
    if (!t.hasSufficient) return "insufficient";
    if (t.deltaE < 5) return "good";
    if (t.deltaE < 10) return "fair";
    return "poor";
  }

  // Build list of stash candidates (threads with owned > 0)
  var stashEntries = [];
  Object.keys(globalStash).forEach(function(id) {
    var entry = globalStash[id];
    if (!entry || !(entry.owned > 0)) return;
    var dmc = dmcMap[id];
    if (!dmc) return;
    stashEntries.push({ id: id, name: dmc.name, rgb: dmc.rgb, lab: getLabForId(id), ownedSkeins: entry.owned });
  });

  var substitutions = [];
  var skipped = [];

  skeinData.forEach(function(thread) {
    if ((threadOwned[thread.id] || "") === "owned") return;

    var targetLab = getLabForId(thread.id);
    if (!targetLab) {
      skipped.push({ sourceId: thread.id, sourceName: thread.name || thread.id, sourceRgb: thread.rgb || [128, 128, 128], sourceStitches: thread.stitches, reason: "no_stash_match", isBlendComponent: false, blendId: null });
      return;
    }

    var neededSkeins = typeof skeinEst === "function"
      ? skeinEst(thread.stitches, fabricCt)
      : Math.ceil(thread.stitches / 200);

    var candidates = [];
    stashEntries.forEach(function(stash) {
      if (stash.id === thread.id) return;
      var de = calcDE(targetLab, stash.lab);
      candidates.push({ id: stash.id, name: stash.name, rgb: stash.rgb, deltaE: Math.round(de * 10) / 10, ownedSkeins: stash.ownedSkeins, neededSkeins: neededSkeins, hasSufficient: stash.ownedSkeins >= neededSkeins });
    });

    if (candidates.length === 0) {
      skipped.push({ sourceId: thread.id, sourceName: thread.name || thread.id, sourceRgb: thread.rgb || [128, 128, 128], sourceStitches: thread.stitches, reason: "no_stash_match", isBlendComponent: false, blendId: null });
      return;
    }

    candidates.sort(function(a, b) { return a.deltaE - b.deltaE; });
    var validCandidates = candidates.filter(function(c) { return c.deltaE <= maxDeltaE; });

    if (validCandidates.length === 0) {
      skipped.push({ sourceId: thread.id, sourceName: thread.name || thread.id, sourceRgb: thread.rgb || [128, 128, 128], sourceStitches: thread.stitches, reason: "all_above_threshold", isBlendComponent: false, blendId: null });
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
      _allCandidates: top5,
      status: statusFromTarget(best),
      userOverride: null
    });
  });

  // ─── Duplicate target detection ───────────────────────────────────────────────
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

      // Sort by ascending deltaE — keep the best match, bump the rest
      indices.sort(function(ai, bi) {
        return substitutions[ai].selectedTarget.deltaE - substitutions[bi].selectedTarget.deltaE;
      });

      // Bump indices[1..n] to their next-best available candidate
      for (var k = 1; k < indices.length; k++) {
        var sub = substitutions[indices[k]];

        // Collect all targets chosen by OTHER substitutions
        var allOtherChosen = new Set();
        substitutions.forEach(function(s, si) {
          if (si !== indices[k]) allOtherChosen.add(s.selectedTarget.id);
        });

        var bumped = false;
        var cands = sub._allCandidates || [];
        for (var c = 0; c < cands.length; c++) {
          if (!allOtherChosen.has(cands[c].id)) {
            sub.selectedTarget = cands[c];
            sub.alternativeTargets = cands.filter(function(x) { return x.id !== cands[c].id; }).slice(0, 4);
            sub.status = statusFromTarget(cands[c]);
            bumped = true;
            break;
          }
        }
        if (!bumped) {
          sub.status = "conflict";
        }
      }
    });
  }

  // Remove internal field
  substitutions.forEach(function(sub) { delete sub._allCandidates; });

  return { substitutions: substitutions, skipped: skipped };
};

// ─── Modal component (outer wrapper — returns null when closed) ───────────────
window.SubstituteFromStashModal = function SubstituteFromStashModal() {
  var ctx = React.useContext(window.CreatorContext);
  var h = React.createElement;

  if (!ctx.substituteModalOpen || !ctx.substituteProposal) return null;

  // Force a full remount by keying on the proposal object identity
  return h(SubstituteFromStashModalInner, { key: ctx.substituteProposal, ctx: ctx });
};

// ─── Inner modal — mounts only when open, hooks always fire ──────────────────
function SubstituteFromStashModalInner(props) {
  var ctx = props.ctx;
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useRef = React.useRef;

  var proposal = ctx.substituteProposal;

  function makeKey(sub) { return sub.sourceId + "|" + (sub.blendId || ""); }

  // Local UI state ─ initialised fresh on each mount (one per modal open)
  var initEnabled = (function() {
    var m = {};
    proposal.substitutions.forEach(function(s) { m[makeKey(s)] = true; });
    return m;
  })();

  var _en = useState(initEnabled);
  var enabledMap = _en[0], setEnabledMap = _en[1];

  var _ov = useState({});
  var overrides = _ov[0], setOverrides = _ov[1];

  var _ex = useState({});
  var expanded = _ex[0], setExpanded = _ex[1];

  var _maxDE = useState(ctx.substituteMaxDeltaE);
  var localMaxDE = _maxDE[0], setLocalMaxDE = _maxDE[1];

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

  function reanalyse(maxDE) {
    if (typeof StashBridge === "undefined") return;
    setAnalyzing(true);
    ctx.setSubstituteMaxDeltaE(maxDE);
    StashBridge.getGlobalStash().then(function(stash) {
      var result = analyseSubstitutions(
        ctx.skeinData,
        ctx.threadOwned,
        stash,
        ctx.fabricCt,
        { maxDeltaE: maxDE, dmcData: DMC }
      );
      ctx.setSubstituteProposal(result);
      setLocalProposal(result);
      // Reset local UI state for the fresh proposal
      var newEnabled = {};
      result.substitutions.forEach(function(s) { newEnabled[makeKey(s)] = true; });
      setEnabledMap(newEnabled);
      setOverrides({});
      setExpanded({});
      setAnalyzing(false);
    }).catch(function() { setAnalyzing(false); });
  }

  function handleSliderChange(v) {
    setLocalMaxDE(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(function() { reanalyse(v); }, 300);
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
    setEnabledMap(function(prev) {
      var n = Object.assign({}, prev);
      n[key] = !n[key];
      return n;
    });
  }

  function toggleExpanded(sub) {
    var key = makeKey(sub);
    setExpanded(function(prev) {
      var n = Object.assign({}, prev);
      n[key] = !n[key];
      return n;
    });
  }

  function selectOverride(sub, alt) {
    var key = makeKey(sub);
    setOverrides(function(prev) { var n = Object.assign({}, prev); n[key] = alt; return n; });
    setExpanded(function(prev) { var n = Object.assign({}, prev); n[key] = false; return n; });
  }

  // Enabled substitutions for Apply
  var enabledSubs = localProposal.substitutions.filter(function(s) { return enabledMap[makeKey(s)] !== false; });

  var warningCount = enabledSubs.filter(function(s) {
    var t = getEffectiveTarget(s);
    return !t.hasSufficient;
  }).length;

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
      ctx.addToast("No stitches were changed.", { type: "info", duration: 2000 });
      return;
    }

    // Step 4: Commit undo entry
    ctx.setEditHistory(function(prev) {
      var entry = { type: "stashSubstitution", changes: changes, psChanges: psChanges.length > 0 ? psChanges : undefined };
      var n = prev.concat([entry]);
      if (n.length > ctx.EDIT_HISTORY_MAX) n = n.slice(n.length - ctx.EDIT_HISTORY_MAX);
      return n;
    });
    ctx.setRedoHistory([]);
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
    ctx.addToast(
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

    var rowChildren = [
      h("input", {
        key: "chk",
        type: "checkbox",
        checked: isEnabled,
        onChange: function() { toggleEnabled(sub); },
        style: { flexShrink: 0, width: 14, height: 14, cursor: "pointer", accentColor: "#7c3aed" }
      }),
      swatch(sub.sourceRgb),
      h("span", { key: "src-id", style: { fontSize: 12, fontWeight: 700, minWidth: 58, flexShrink: 0 } }, "DMC " + sub.sourceId),
      sub.isBlendComponent
        ? h("span", { key: "blend-tag", style: { fontSize: 10, color: "#94a3b8", flexShrink: 0 } }, "(blend)")
        : null,
      h("span", { key: "arrow", style: { color: "#94a3b8", fontSize: 13, flexShrink: 0 } }, "\u2192"),
      swatch(target.rgb),
      h("span", { key: "tgt-id", style: { fontSize: 12, fontWeight: 700, minWidth: 58, flexShrink: 0 } }, "DMC " + target.id),
      h("span", { key: "tgt-name", style: { fontSize: 11, color: "#475569", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, target.name),
      statusBadge(effStatus),
      h("span", { key: "de", style: { fontSize: 10, color: "#94a3b8", flexShrink: 0, minWidth: 36, textAlign: "right" } }, "\u0394E\u202F" + target.deltaE),
      h("span", {
        key: "stock",
        style: { fontSize: 10, color: target.hasSufficient ? "#16a34a" : "#ea580c", flexShrink: 0, minWidth: 44, textAlign: "right" }
      }, target.ownedSkeins + "/" + target.neededSkeins + "sk"),
      hasAlts
        ? h("button", {
            key: "expand",
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
    ];

    return h(React.Fragment, { key: key },
      h("div", {
        style: {
          display: "flex", alignItems: "center", gap: 6, padding: "6px 10px",
          borderRadius: 6,
          background: isEnabled ? "#fff" : "#f8f9fa",
          border: "1px solid " + (isEnabled ? "#e2e8f0" : "#f1f5f9"),
          opacity: isEnabled ? 1 : 0.55
        }
      }, rowChildren),
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

  // ─── Render ───────────────────────────────────────────────────────────────────
  var p = localProposal;

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
        width: "100%", maxWidth: 640, maxHeight: "90vh",
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

        // Max ΔE slider
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
          )
        ),

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

        // Skipped
        p.skipped.length > 0
          ? h("div", { style: { marginBottom: 14 } },
              h("div", { style: { fontSize: 11, color: "#64748b", textTransform: "uppercase", fontWeight: 700, marginBottom: 8, letterSpacing: "0.04em" } },
                "Skipped \u2014 No Suitable Match (" + p.skipped.length + ")"
              ),
              h("div", { style: { background: "#f8f9fa", borderRadius: 8, border: "1px solid #f1f5f9", padding: "8px 12px", display: "flex", flexDirection: "column", gap: 5 } },
                p.skipped.map(function(sk) {
                  var reasonText = sk.reason === "no_stash_match"
                    ? "no threads in stash"
                    : sk.reason === "all_above_threshold"
                      ? "all matches above \u0394E\u202F" + localMaxDE
                      : "blend component";
                  return h("div", {
                    key: sk.sourceId + "|" + (sk.blendId || ""),
                    style: { display: "flex", alignItems: "center", gap: 7, fontSize: 12 }
                  },
                    swatch(sk.sourceRgb || [128, 128, 128], 12),
                    h("span", { style: { fontWeight: 700, minWidth: 58, flexShrink: 0 } }, "DMC " + sk.sourceId),
                    h("span", { style: { color: "#475569", flex: 1 } }, sk.sourceName),
                    sk.isBlendComponent
                      ? h("span", { style: { fontSize: 10, color: "#94a3b8", flexShrink: 0 } }, "(blend)")
                      : null,
                    h("span", { style: { color: "#94a3b8", fontSize: 11, flexShrink: 0 } }, reasonText)
                  );
                })
              )
            )
          : null,

        // No results at all
        p.substitutions.length === 0 && p.skipped.length === 0
          ? h("div", {
              style: { padding: "20px", textAlign: "center", color: "#94a3b8", fontSize: 13 }
            }, "No unowned threads found \u2014 all threads are already marked as owned.")
          : null,

        // Summary
        h("div", { style: { padding: "10px 14px", background: "#f0f9ff", borderRadius: 8, border: "1px solid #bae6fd", fontSize: 12, color: "#0c4a6e" } },
          h("strong", null, enabledSubs.length + " substitution" + (enabledSubs.length !== 1 ? "s" : "") + " selected"),
          h("span", null, " \xB7 " + p.skipped.length + " skipped"),
          warningCount > 0
            ? h("span", { style: { color: "#ea580c" } }, " \xB7 " + warningCount + " low stock warning" + (warningCount !== 1 ? "s" : ""))
            : null
        ),

        // Tip
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
        }, "Apply " + enabledSubs.length + " Substitution" + (enabledSubs.length !== 1 ? "s" : ""))
      )
    )
  );
}
