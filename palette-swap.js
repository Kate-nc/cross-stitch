/* palette-swap.js — Colour palette swap component for cross-stitch Creator */

// ═══════════════════════════════════════════════════════════
// OKLCH Colour Conversion Utilities
// ═══════════════════════════════════════════════════════════

function rgbToOklab(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  r = r <= 0.04045 ? r / 12.92 : Math.pow((r + 0.055) / 1.055, 2.4);
  g = g <= 0.04045 ? g / 12.92 : Math.pow((g + 0.055) / 1.055, 2.4);
  b = b <= 0.04045 ? b / 12.92 : Math.pow((b + 0.055) / 1.055, 2.4);
  var l = 0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b;
  var m = 0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b;
  var s = 0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b;
  l = Math.cbrt(l); m = Math.cbrt(m); s = Math.cbrt(s);
  return {
    L: 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s
  };
}

function oklabToOklch(L, a, b) {
  var C = Math.sqrt(a * a + b * b);
  var H = Math.atan2(b, a) * 180 / Math.PI;
  if (H < 0) H += 360;
  return { L: L, C: C, H: H };
}

function oklchToOklab(L, C, H) {
  var hRad = H * Math.PI / 180;
  return { L: L, a: C * Math.cos(hRad), b: C * Math.sin(hRad) };
}

function oklabToRgb(L, a, b) {
  var l = L + 0.3963377774 * a + 0.2158037573 * b;
  var m = L - 0.1055613458 * a - 0.0638541728 * b;
  var s = L - 0.0894841775 * a - 1.2914855480 * b;
  l = l * l * l; m = m * m * m; s = s * s * s;
  var r = +4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  var g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
  var bv = -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s;
  // Linear to sRGB gamma
  r = r <= 0.0031308 ? 12.92 * r : 1.055 * Math.pow(r, 1 / 2.4) - 0.055;
  g = g <= 0.0031308 ? 12.92 * g : 1.055 * Math.pow(g, 1 / 2.4) - 0.055;
  bv = bv <= 0.0031308 ? 12.92 * bv : 1.055 * Math.pow(bv, 1 / 2.4) - 0.055;
  return [
    Math.max(0, Math.min(255, Math.round(r * 255))),
    Math.max(0, Math.min(255, Math.round(g * 255))),
    Math.max(0, Math.min(255, Math.round(bv * 255)))
  ];
}

function shiftRgbHue(rgb, degrees) {
  var ok = rgbToOklab(rgb[0], rgb[1], rgb[2]);
  var lch = oklabToOklch(ok.L, ok.a, ok.b);
  lch.H = (lch.H + degrees) % 360;
  if (lch.H < 0) lch.H += 360;
  var ab = oklchToOklab(lch.L, lch.C, lch.H);
  return oklabToRgb(ab.L, ab.a, ab.b);
}

function hexToRgb(hex) {
  hex = hex.replace(/^#/, '');
  if (hex.length === 3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
  var n = parseInt(hex, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex(rgb) {
  return '#' + rgb.map(function(c) { return ('0' + c.toString(16)).slice(-2); }).join('');
}

// ═══════════════════════════════════════════════════════════
// Preset Palette Data
// ═══════════════════════════════════════════════════════════

var PALETTE_PRESETS = {
  "Spring Pastels":     { colours: ["#FFB7C5","#FFDAB9","#FFFACD","#C1FFC1","#B0E0E6","#E6E6FA"], category: "seasonal" },
  "Summer Brights":     { colours: ["#FF4500","#FFD700","#00CED1","#FF69B4","#32CD32","#FF8C00"], category: "seasonal" },
  "Autumn Warm":        { colours: ["#8B4513","#CD853F","#DAA520","#B22222","#556B2F","#D2691E"], category: "seasonal" },
  "Winter Cool":        { colours: ["#4682B4","#708090","#B0C4DE","#DCDCDC","#5F9EA0","#2F4F4F"], category: "seasonal" },
  "Midnight":           { colours: ["#191970","#000080","#483D8B","#2E0854","#301934","#0D0D0D"], category: "seasonal" },
  "Sunset":             { colours: ["#FF6347","#FF7F50","#FFD700","#FF4500","#DC143C","#8B008B"], category: "seasonal" },
  "Forest":             { colours: ["#228B22","#006400","#2E8B57","#556B2F","#8B4513","#6B8E23"], category: "seasonal" },
  "Ocean":              { colours: ["#006994","#40E0D0","#00CED1","#20B2AA","#5F9EA0","#B0E0E6"], category: "seasonal" },
  "Monochrome Warm":    { colours: ["#8B4513","#A0522D","#CD853F","#DEB887","#F5DEB3","#FAEBD7"], category: "seasonal" },
  "Monochrome Cool":    { colours: ["#2F4F4F","#708090","#778899","#B0C4DE","#DCDCDC","#F0F8FF"], category: "seasonal" },
  "Jewel Tones":        { colours: ["#9B111E","#0F52BA","#50C878","#9966CC","#E0115F","#FF8C00"], category: "artistic" },
  "Scandinavian Minimal":{ colours: ["#F5F5DC","#D2B48C","#8FBC8F","#696969","#FFFFF0","#BC8F8F"], category: "artistic" },
  "Muted Earth":        { colours: ["#BC8F8F","#8FBC8F","#BDB76B","#D2B48C","#C4A882","#A0937D"], category: "artistic" },
  "Dusty Rose":         { colours: ["#DCAE96","#E8B4B8","#C48793","#967E76","#D4A5A5","#F5E6CC"], category: "artistic" },
  "Cottage Garden":     { colours: ["#C71585","#DA70D6","#228B22","#FFD700","#FF69B4","#8FBC8F"], category: "artistic" }
};

var HARMONY_TYPES = {
  "Complementary": [180],
  "Analogous":     [-30, 30],
  "Triadic":       [120, 240],
  "Split-comp.":   [150, 210]
};

// ═══════════════════════════════════════════════════════════
// CVD Simulation Matrices (Machado et al. 2009)
// ═══════════════════════════════════════════════════════════

var CVD_MATRICES = {
  deuteranopia: [
    0.367322, 0.860646, -0.227968,
    0.280085, 0.672501, 0.047413,
    -0.011820, 0.042940, 0.968881
  ],
  protanopia: [
    0.152286, 1.052583, -0.204868,
    0.114503, 0.786281, 0.099216,
    -0.003882, -0.048116, 1.051998
  ]
};

// ═══════════════════════════════════════════════════════════
// Core Palette Swap Logic
// ═══════════════════════════════════════════════════════════

function computeShiftMapping(pal, shiftDeg, lockedIds) {
  var mapping = {};
  var collisions = {};
  for (var i = 0; i < pal.length; i++) {
    var entry = pal[i];
    if (entry.id === "__skip__" || entry.id === "__empty__") continue;
    if (lockedIds.has(entry.id)) {
      mapping[entry.id] = { source: entry, dest: entry, dE: 0, locked: true };
      continue;
    }
    var shifted = shiftRgbHue(entry.rgb, shiftDeg);
    var idealLab = rgbToLab(shifted[0], shifted[1], shifted[2]);
    var match = findSolid(idealLab, DMC);
    var deltaE = Math.sqrt(dE2(idealLab, match.lab));
    mapping[entry.id] = {
      source: entry,
      dest: { id: match.id, name: match.name, rgb: match.rgb, lab: match.lab, type: "solid" },
      idealRgb: shifted,
      dE: deltaE,
      locked: false
    };
    if (!collisions[match.id]) collisions[match.id] = [];
    collisions[match.id].push(entry.id);
  }
  var collisionList = [];
  Object.keys(collisions).forEach(function(dmcId) {
    if (collisions[dmcId].length > 1) {
      collisionList.push({ dmcId: dmcId, sourceIds: collisions[dmcId] });
    }
  });
  return { mapping: mapping, collisions: collisionList };
}

function computePresetMapping(pal, presetColours, lockedIds) {
  // Sort source and target by OKLAB lightness
  var unlocked = pal.filter(function(e) {
    return e.id !== "__skip__" && e.id !== "__empty__" && !lockedIds.has(e.id);
  });
  var sortedSource = unlocked.slice().sort(function(a, b) {
    return rgbToOklab(a.rgb[0], a.rgb[1], a.rgb[2]).L - rgbToOklab(b.rgb[0], b.rgb[1], b.rgb[2]).L;
  });
  var targetRgbs = presetColours.map(hexToRgb);
  var sortedTarget = targetRgbs.slice().sort(function(a, b) {
    return rgbToOklab(a[0], a[1], a[2]).L - rgbToOklab(b[0], b[1], b[2]).L;
  });

  var mapping = {};
  var collisions = {};
  // Map locked entries first
  for (var i = 0; i < pal.length; i++) {
    var entry = pal[i];
    if (entry.id === "__skip__" || entry.id === "__empty__") continue;
    if (lockedIds.has(entry.id)) {
      mapping[entry.id] = { source: entry, dest: entry, dE: 0, locked: true };
    }
  }
  // Map unlocked by lightness rank
  for (var j = 0; j < sortedSource.length; j++) {
    var src = sortedSource[j];
    var tgtRgb = sortedTarget[j % sortedTarget.length];
    var tgtLab = rgbToLab(tgtRgb[0], tgtRgb[1], tgtRgb[2]);
    var match = findSolid(tgtLab, DMC);
    var deltaE = Math.sqrt(dE2(tgtLab, match.lab));
    mapping[src.id] = {
      source: src,
      dest: { id: match.id, name: match.name, rgb: match.rgb, lab: match.lab, type: "solid" },
      idealRgb: tgtRgb,
      dE: deltaE,
      locked: false
    };
    if (!collisions[match.id]) collisions[match.id] = [];
    collisions[match.id].push(src.id);
  }
  var collisionList = [];
  Object.keys(collisions).forEach(function(dmcId) {
    if (collisions[dmcId].length > 1) {
      collisionList.push({ dmcId: dmcId, sourceIds: collisions[dmcId] });
    }
  });
  return { mapping: mapping, collisions: collisionList };
}

function generateHarmonyPalette(baseHex, harmonyType) {
  var baseRgb = hexToRgb(baseHex);
  var ok = rgbToOklab(baseRgb[0], baseRgb[1], baseRgb[2]);
  var lch = oklabToOklch(ok.L, ok.a, ok.b);
  var angles = HARMONY_TYPES[harmonyType] || [];
  var colours = [rgbToHex(baseRgb)];
  for (var i = 0; i < angles.length; i++) {
    var h = (lch.H + angles[i]) % 360;
    if (h < 0) h += 360;
    var ab = oklchToOklab(lch.L, lch.C, h);
    var rgb = oklabToRgb(ab.L, ab.a, ab.b);
    colours.push(rgbToHex(rgb));
  }
  return colours;
}

function applyMapping(pat, mapping) {
  var newPat = new Array(pat.length);
  for (var i = 0; i < pat.length; i++) {
    var cell = pat[i];
    if (cell.id === "__skip__" || cell.id === "__empty__") {
      newPat[i] = cell;
      continue;
    }
    var m = mapping[cell.id];
    if (!m || m.locked) {
      newPat[i] = cell;
      continue;
    }
    newPat[i] = {
      type: m.dest.type || "solid",
      id: m.dest.id,
      name: m.dest.name,
      rgb: m.dest.rgb,
      lab: m.dest.lab,
      symbol: cell.symbol
    };
  }
  return newPat;
}

function findSimilarDmc(lab, count) {
  var results = [];
  for (var i = 0; i < DMC.length; i++) {
    var d = Math.sqrt(dE2(lab, DMC[i].lab));
    results.push({ thread: DMC[i], dE: d });
  }
  results.sort(function(a, b) { return a.dE - b.dE; });
  return results.slice(0, count || 5);
}

function computeContrastWarnings(pat, mapping, sW) {
  // Build a set of adjacent colour pairs and check contrast
  var pairSet = new Set();
  var warnings = [];
  var len = pat.length;
  var sH = Math.floor(len / sW);
  for (var i = 0; i < len; i++) {
    var cell = pat[i];
    if (cell.id === "__skip__" || cell.id === "__empty__") continue;
    var m = mapping[cell.id];
    if (!m) continue;
    var destA = m.locked ? m.source : m.dest;
    // Check right neighbour
    var x = i % sW, y = Math.floor(i / sW);
    var neighbours = [];
    if (x + 1 < sW) neighbours.push(i + 1);
    if (y + 1 < sH) neighbours.push(i + sW);
    for (var n = 0; n < neighbours.length; n++) {
      var ni = neighbours[n];
      var nCell = pat[ni];
      if (!nCell || nCell.id === "__skip__" || nCell.id === "__empty__") continue;
      var nm = mapping[nCell.id];
      if (!nm) continue;
      var destB = nm.locked ? nm.source : nm.dest;
      if (destA.id === destB.id) continue;
      var pairKey = [destA.id, destB.id].sort().join("|");
      if (pairSet.has(pairKey)) continue;
      pairSet.add(pairKey);
      var lA = (luminance(destA.rgb) + 0.05) / 255; // normalize to 0-1 range for WCAG
      var lB = (luminance(destB.rgb) + 0.05) / 255;
      // WCAG relative luminance
      var rA = destA.rgb[0]/255, gA = destA.rgb[1]/255, bA = destA.rgb[2]/255;
      rA = rA <= 0.04045 ? rA/12.92 : Math.pow((rA+0.055)/1.055, 2.4);
      gA = gA <= 0.04045 ? gA/12.92 : Math.pow((gA+0.055)/1.055, 2.4);
      bA = bA <= 0.04045 ? bA/12.92 : Math.pow((bA+0.055)/1.055, 2.4);
      var lumA = 0.2126*rA + 0.7152*gA + 0.0722*bA;
      var rB = destB.rgb[0]/255, gB = destB.rgb[1]/255, bB = destB.rgb[2]/255;
      rB = rB <= 0.04045 ? rB/12.92 : Math.pow((rB+0.055)/1.055, 2.4);
      gB = gB <= 0.04045 ? gB/12.92 : Math.pow((gB+0.055)/1.055, 2.4);
      bB = bB <= 0.04045 ? bB/12.92 : Math.pow((bB+0.055)/1.055, 2.4);
      var lumB = 0.2126*rB + 0.7152*gB + 0.0722*bB;
      var lighter = Math.max(lumA, lumB);
      var darker = Math.min(lumA, lumB);
      var ratio = (lighter + 0.05) / (darker + 0.05);
      if (ratio < 2) {
        warnings.push({ a: destA, b: destB, ratio: Math.round(ratio * 10) / 10 });
      }
    }
  }
  return warnings;
}

function renderMiniCanvas(canvas, pat, sW, sH, mapping) {
  var pw = Math.min(100, sW);
  var ph = Math.round(pw * sH / sW);
  if (ph < 1) ph = 1;
  canvas.width = pw;
  canvas.height = ph;
  canvas.style.imageRendering = "pixelated";
  var ctx = canvas.getContext("2d");
  var scaleX = sW / pw, scaleY = sH / ph;
  for (var y = 0; y < ph; y++) {
    for (var x = 0; x < pw; x++) {
      var srcX = Math.floor(x * scaleX);
      var srcY = Math.floor(y * scaleY);
      var idx = srcY * sW + srcX;
      var cell = pat[idx];
      if (!cell || cell.id === "__skip__" || cell.id === "__empty__") {
        ctx.fillStyle = "#f0f0f0";
      } else if (mapping) {
        var m = mapping[cell.id];
        if (m) {
          var dest = m.locked ? m.source : m.dest;
          ctx.fillStyle = "rgb(" + dest.rgb[0] + "," + dest.rgb[1] + "," + dest.rgb[2] + ")";
        } else {
          ctx.fillStyle = "rgb(" + cell.rgb[0] + "," + cell.rgb[1] + "," + cell.rgb[2] + ")";
        }
      } else {
        ctx.fillStyle = "rgb(" + cell.rgb[0] + "," + cell.rgb[1] + "," + cell.rgb[2] + ")";
      }
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

// ═══════════════════════════════════════════════════════════
// Saved Palettes (localStorage)
// ═══════════════════════════════════════════════════════════

var CUSTOM_PALETTES_KEY = "crossstitch_custom_palettes";

function loadCustomPalettes() {
  try {
    var raw = localStorage.getItem(CUSTOM_PALETTES_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) { return []; }
}

function saveCustomPalettes(palettes) {
  try {
    localStorage.setItem(CUSTOM_PALETTES_KEY, JSON.stringify(palettes));
  } catch (e) { /* quota exceeded */ }
}

// ═══════════════════════════════════════════════════════════
// React Components
// ═══════════════════════════════════════════════════════════

function DEBadge(props) {
  var d = props.dE;
  var tier, bg, color;
  if (d < 1) { tier = "Perfect"; bg = "#f0fdf4"; color = "#16a34a"; }
  else if (d <= 3) { tier = "Close"; bg = "#fffbeb"; color = "#d97706"; }
  else { tier = "Approx."; bg = "#fef2f2"; color = "#dc2626"; }
  return React.createElement("span", {
    style: { fontSize: 10, padding: "1px 6px", borderRadius: 8, background: bg, color: color, whiteSpace: "nowrap" }
  }, tier);
}

function SwatchBox(props) {
  var sz = props.size || 16;
  return React.createElement("span", {
    style: {
      display: "inline-block", width: sz, height: sz, borderRadius: 3,
      background: "rgb(" + props.rgb[0] + "," + props.rgb[1] + "," + props.rgb[2] + ")",
      border: "1px solid #d4d4d8", flexShrink: 0, cursor: props.onClick ? "pointer" : "default"
    },
    onClick: props.onClick || null
  });
}

function LockToggle(props) {
  var locked = props.locked;
  return React.createElement("button", {
    onClick: props.onToggle,
    title: locked ? "Unlock this colour" : "Lock this colour",
    style: {
      width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
      borderRadius: 4, border: locked ? "1px solid #fde68a" : "1px solid #e4e4e7",
      background: locked ? "#fef3c7" : "#fff", color: locked ? "#b45309" : "#a1a1aa",
      cursor: "pointer", fontSize: 11, padding: 0, lineHeight: 1
    }
  }, locked ? "\uD83D\uDD12" : "\uD83D\uDD13");
}

function HueSpectrumBar() {
  var ref = React.useRef(null);
  React.useEffect(function() {
    var c = ref.current;
    if (!c) return;
    var ctx = c.getContext("2d");
    var w = c.width, h = c.height;
    for (var x = 0; x < w; x++) {
      var hue = (x / w) * 360;
      ctx.fillStyle = "hsl(" + hue + ",80%,55%)";
      ctx.fillRect(x, 0, 1, h);
    }
  }, []);
  return React.createElement("canvas", {
    ref: ref, width: 280, height: 24,
    style: { width: "100%", height: 24, borderRadius: 6, display: "block" }
  });
}

function QuickShiftButtons(props) {
  var angles = [0, 30, 60, 90, 120, 180];
  return React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" } },
    angles.map(function(a) {
      var active = props.value === a;
      return React.createElement("button", {
        key: a,
        onClick: function() { props.onChange(a); },
        style: {
          padding: "4px 10px", fontSize: 11, fontWeight: 500, borderRadius: 12, cursor: "pointer",
          border: active ? "1px solid #1D9E75" : "1px solid #e4e4e7",
          background: active ? "#f0fdfa" : "#fff",
          color: active ? "#1D9E75" : "#71717a"
        }
      }, a + "\u00B0");
    })
  );
}

function SimilarPopover(props) {
  var lab = props.lab;
  var similar = React.useMemo(function() { return findSimilarDmc(lab, 6); }, [lab]);
  // Skip first if it's the same as current
  var filtered = similar.filter(function(s) { return s.thread.id !== props.currentId; }).slice(0, 5);
  return React.createElement("div", {
    style: {
      position: "absolute", top: "100%", right: 0, zIndex: 20,
      background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8,
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)", padding: 6, minWidth: 200
    }
  },
    React.createElement("div", { style: { fontSize: 10, color: "#a1a1aa", marginBottom: 4, fontWeight: 600 } }, "Similar DMC threads"),
    filtered.map(function(s) {
      return React.createElement("div", {
        key: s.thread.id,
        onClick: function() { props.onSelect(s.thread); },
        style: {
          display: "flex", alignItems: "center", gap: 6, padding: "3px 4px",
          borderRadius: 4, cursor: "pointer", fontSize: 11
        },
        onMouseEnter: function(e) { e.currentTarget.style.background = "#f4f4f5"; },
        onMouseLeave: function(e) { e.currentTarget.style.background = "transparent"; }
      },
        React.createElement(SwatchBox, { rgb: s.thread.rgb }),
        React.createElement("span", { style: { fontWeight: 600, minWidth: 36 } }, s.thread.id),
        React.createElement("span", { style: { color: "#71717a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, s.thread.name),
        React.createElement(DEBadge, { dE: s.dE })
      );
    })
  );
}

function DmcPickerPopover(props) {
  var _useState = React.useState(""), search = _useState[0], setSearch = _useState[1];
  var filtered = React.useMemo(function() {
    if (!search.trim()) return DMC.slice(0, 40);
    var q = search.toLowerCase();
    return DMC.filter(function(d) {
      return d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q);
    }).slice(0, 40);
  }, [search]);
  return React.createElement("div", {
    style: {
      position: "absolute", top: "100%", left: 0, zIndex: 20,
      background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8,
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)", padding: 6, width: 260
    },
    onClick: function(e) { e.stopPropagation(); }
  },
    React.createElement("input", {
      type: "text", placeholder: "Search DMC # or name\u2026", value: search,
      onChange: function(e) { setSearch(e.target.value); },
      autoFocus: true,
      style: { width: "100%", padding: "5px 8px", border: "0.5px solid #e4e4e7", borderRadius: 6, fontSize: 12, marginBottom: 4, boxSizing: "border-box" }
    }),
    React.createElement("div", { style: { maxHeight: 200, overflow: "auto" } },
      filtered.map(function(d) {
        return React.createElement("div", {
          key: d.id,
          onClick: function() { props.onSelect(d); },
          style: {
            display: "flex", alignItems: "center", gap: 6, padding: "3px 6px",
            borderRadius: 4, cursor: "pointer", fontSize: 11
          },
          onMouseEnter: function(e) { e.currentTarget.style.background = "#f4f4f5"; },
          onMouseLeave: function(e) { e.currentTarget.style.background = "transparent"; }
        },
          React.createElement(SwatchBox, { rgb: d.rgb }),
          React.createElement("span", { style: { fontWeight: 600, minWidth: 36 } }, d.id),
          React.createElement("span", { style: { color: "#71717a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, d.name)
        );
      })
    )
  );
}

// ═══════════════════════════════════════════════════════════
// Mapping Table Row
// ═══════════════════════════════════════════════════════════

function MappingTableRow(props) {
  var m = props.mapping;
  var _st1 = React.useState(false), showSimilar = _st1[0], setShowSimilar = _st1[1];
  var _st2 = React.useState(false), showPicker = _st2[0], setShowPicker = _st2[1];

  function handleSelectSimilar(thread) {
    setShowSimilar(false);
    props.onOverride(m.source.id, thread);
  }
  function handleSelectPicker(thread) {
    setShowPicker(false);
    props.onOverride(m.source.id, thread);
  }

  return React.createElement("tr", { style: { borderBottom: "0.5px solid #f4f4f5", opacity: m.locked ? 0.5 : 1 } },
    React.createElement("td", { style: { padding: "4px 6px" } },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
        React.createElement(SwatchBox, { rgb: m.source.rgb }),
        React.createElement("span", { style: { fontFamily: "monospace", fontSize: 11, fontWeight: 600 } }, m.source.id),
        React.createElement("span", { style: { fontSize: 11, color: "#71717a" } }, m.source.name || "")
      )
    ),
    React.createElement("td", { style: { padding: "4px 2px", fontSize: 13, color: "#a1a1aa" } }, "\u2192"),
    React.createElement("td", {
      style: { padding: "4px 6px", position: "relative", cursor: m.locked ? "default" : "pointer" },
      onClick: function() { if (!m.locked) setShowPicker(!showPicker); }
    },
      React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
        React.createElement(SwatchBox, { rgb: m.dest.rgb }),
        React.createElement("span", { style: { fontFamily: "monospace", fontSize: 11, fontWeight: 600 } }, m.dest.id),
        React.createElement("span", { style: { fontSize: 11, color: "#71717a" } }, m.dest.name || "")
      ),
      showPicker && React.createElement(DmcPickerPopover, { onSelect: handleSelectPicker })
    ),
    React.createElement("td", { style: { padding: "4px 6px", textAlign: "right", fontSize: 11, color: "#a1a1aa" } }, (props.count || 0).toLocaleString()),
    React.createElement("td", { style: { padding: "4px 6px" } },
      m.locked
        ? React.createElement("span", { style: { fontSize: 10, color: "#b45309", background: "#fef3c7", padding: "1px 6px", borderRadius: 8 } }, "Locked")
        : React.createElement(DEBadge, { dE: m.dE })
    ),
    React.createElement("td", { style: { padding: "4px 6px", position: "relative" } },
      !m.locked && React.createElement("button", {
        onClick: function(e) { e.stopPropagation(); setShowSimilar(!showSimilar); },
        style: {
          fontSize: 10, color: "#1D9E75", background: "#f0fdfa",
          border: "0.5px solid #99f6e4", borderRadius: 4, padding: "2px 6px", cursor: "pointer"
        }
      }, "Similar"),
      showSimilar && React.createElement(SimilarPopover, {
        lab: m.dest.lab, currentId: m.dest.id, onSelect: handleSelectSimilar
      })
    )
  );
}

// ═══════════════════════════════════════════════════════════
// Preset Card
// ═══════════════════════════════════════════════════════════

function PresetCard(props) {
  var p = props.preset;
  var selected = props.selected;
  return React.createElement("div", {
    onClick: props.onClick,
    className: "ps-preset-card" + (selected ? " ps-preset-card--selected" : ""),
    style: {
      borderRadius: 8, padding: 10, cursor: "pointer",
      border: selected ? "2px solid #1D9E75" : "1px solid #e4e4e7",
      background: selected ? "#f0fdfa" : "#fff"
    }
  },
    React.createElement("div", { style: { fontSize: 11, fontWeight: 500, marginBottom: 4, color: "#18181b" } }, p.name),
    React.createElement("div", { style: { display: "flex", gap: 3 } },
      p.colours.slice(0, 6).map(function(hex, i) {
        var rgb = hexToRgb(hex);
        return React.createElement("span", {
          key: i,
          style: {
            width: 18, height: 18, borderRadius: 3, display: "inline-block",
            background: hex, border: "1px solid #d4d4d8"
          }
        });
      })
    ),
    React.createElement("div", { style: { fontSize: 10, color: "#a1a1aa", marginTop: 3 } }, p.colours.length + " colours")
  );
}

// ═══════════════════════════════════════════════════════════
// Main PaletteSwapPanel Component
// ═══════════════════════════════════════════════════════════

function usePaletteSwap(props) {
  var pat = props.pat, pal = props.pal, cmap = props.cmap, sW = props.sW, sH = props.sH;
  var done = props.done;
  var setPat = props.setPat, setPal = props.setPal, setCmap = props.setCmap;
  var editHistory = props.editHistory, setEditHistory = props.setEditHistory;
  var setRedoHistory = props.setRedoHistory;
  var setDone = props.setDone;
  var EDIT_HISTORY_MAX = props.EDIT_HISTORY_MAX || 50;
  var buildPaletteWithScratch = props.buildPaletteWithScratch || buildPalette;

  // State
  var _s1 = React.useState(0), shiftDeg = _s1[0], setShiftDeg = _s1[1];
  var _s2 = React.useState(new Set()), lockedIds = _s2[0], setLockedIds = _s2[1];
  var _s3 = React.useState(null), activePreset = _s3[0], setActivePreset = _s3[1];
  var _s4 = React.useState("themes"), presetTab = _s4[0], setPresetTab = _s4[1];
  var _s5 = React.useState("#FF0000"), harmonyBase = _s5[0], setHarmonyBase = _s5[1];
  var _s6 = React.useState("Complementary"), harmonyType = _s6[0], setHarmonyType = _s6[1];
  var _s7 = React.useState(false), showConfirm = _s7[0], setShowConfirm = _s7[1];
  var _s8 = React.useState(""), customHex = _s8[0], setCustomHex = _s8[1];
  var _s9 = React.useState(function() { return loadCustomPalettes(); }), customPalettes = _s9[0], setCustomPalettes = _s9[1];
  var _s10 = React.useState(null), mappingOverrides = _s10[0], setMappingOverrides = _s10[1];
  var _s11 = React.useState("shift"), activeMode = _s11[0], setActiveMode = _s11[1]; // "shift" or "preset"

  var beforeRef = React.useRef(null);
  var afterRef = React.useRef(null);
  var debounceRef = React.useRef(null);

  // Compute mapping
  var computedMapping = React.useMemo(function() {
    if (activeMode === "preset" && activePreset) {
      var presetData = PALETTE_PRESETS[activePreset];
      if (presetData) return computePresetMapping(pal, presetData.colours, lockedIds);
    }
    if (activeMode === "harmony") {
      var harmonyCols = generateHarmonyPalette(harmonyBase, harmonyType);
      return computePresetMapping(pal, harmonyCols, lockedIds);
    }
    return computeShiftMapping(pal, shiftDeg, lockedIds);
  }, [pal, shiftDeg, lockedIds, activePreset, activeMode, harmonyBase, harmonyType]);

  // Apply overrides
  var finalMapping = React.useMemo(function() {
    if (!mappingOverrides) return computedMapping.mapping;
    var merged = {};
    Object.keys(computedMapping.mapping).forEach(function(id) {
      merged[id] = mappingOverrides[id] || computedMapping.mapping[id];
    });
    return merged;
  }, [computedMapping, mappingOverrides]);

  var collisions = computedMapping.collisions;

  // Stitch counts per source ID
  var countMap = React.useMemo(function() {
    var c = {};
    if (!pat) return c;
    for (var i = 0; i < pat.length; i++) {
      var id = pat[i].id;
      if (id === "__skip__" || id === "__empty__") continue;
      c[id] = (c[id] || 0) + 1;
    }
    return c;
  }, [pat]);

  // Done count
  var doneCount = React.useMemo(function() {
    if (!done) return 0;
    var c = 0;
    for (var i = 0; i < done.length; i++) if (done[i]) c++;
    return c;
  }, [done]);

  // Contrast warnings
  var contrastWarnings = React.useMemo(function() {
    if (!showConfirm) return [];
    return computeContrastWarnings(pat, finalMapping, sW);
  }, [showConfirm, pat, finalMapping, sW]);

  // Has any change?
  var hasChange = React.useMemo(function() {
    var keys = Object.keys(finalMapping);
    for (var i = 0; i < keys.length; i++) {
      var m = finalMapping[keys[i]];
      if (!m.locked && m.source.id !== m.dest.id) return true;
    }
    return false;
  }, [finalMapping]);

  // Render preview canvases
  React.useEffect(function() {
    if (!showConfirm) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(function() {
      if (beforeRef.current) renderMiniCanvas(beforeRef.current, pat, sW, sH, null);
      if (afterRef.current) renderMiniCanvas(afterRef.current, pat, sW, sH, finalMapping);
    }, 200);
    return function() { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [showConfirm, pat, sW, sH, finalMapping]);

  // Toggle lock
  function toggleLock(id) {
    setLockedIds(function(prev) {
      var next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setMappingOverrides(null);
  }

  // Override a mapping row
  function handleOverride(sourceId, thread) {
    setMappingOverrides(function(prev) {
      var n = Object.assign({}, prev || {}, finalMapping);
      var src = n[sourceId] ? n[sourceId].source : null;
      if (!src) return prev;
      var idealLab = rgbToLab(thread.rgb[0], thread.rgb[1], thread.rgb[2]);
      n[sourceId] = {
        source: src,
        dest: { id: thread.id, name: thread.name, rgb: thread.rgb, lab: thread.lab, type: "solid" },
        idealRgb: thread.rgb,
        dE: Math.sqrt(dE2(idealLab, thread.lab)),
        locked: false
      };
      return n;
    });
  }

  // Apply swap
  function applySwap() {
    // Record undo
    var changes = [];
    for (var i = 0; i < pat.length; i++) {
      var cell = pat[i];
      if (cell.id === "__skip__" || cell.id === "__empty__") continue;
      var m = finalMapping[cell.id];
      if (m && !m.locked && m.source.id !== m.dest.id) {
        changes.push({ idx: i, old: Object.assign({}, pat[i]) });
      }
    }
    if (changes.length === 0) return;

    setEditHistory(function(prev) {
      var n = prev.concat([{ type: "palette_swap", changes: changes }]);
      if (n.length > EDIT_HISTORY_MAX) n = n.slice(n.length - EDIT_HISTORY_MAX);
      return n;
    });
    setRedoHistory([]);

    var newPat = applyMapping(pat, finalMapping);
    var result = buildPaletteWithScratch(newPat);
    setPat(newPat);
    setPal(result.pal);
    setCmap(result.cmap);
    setDone(new Uint8Array(newPat.length));

    // Reset swap state
    setShiftDeg(0);
    setActivePreset(null);
    setMappingOverrides(null);
    setShowConfirm(false);
  }

  // Save current palette
  function savePalette() {
    var name = prompt("Name this palette:");
    if (!name) return;
    var colours = [];
    Object.keys(finalMapping).forEach(function(id) {
      var m = finalMapping[id];
      if (m && m.dest) colours.push(rgbToHex(m.dest.rgb));
    });
    var entry = { name: name, colours: colours, createdAt: Date.now() };
    var updated = customPalettes.concat([entry]);
    setCustomPalettes(updated);
    saveCustomPalettes(updated);
  }

  function deleteCustomPalette(idx) {
    var updated = customPalettes.filter(function(_, i) { return i !== idx; });
    setCustomPalettes(updated);
    saveCustomPalettes(updated);
  }

  // Add hex to a temporary building palette
  function addCustomHexColour() {
    var hex = customHex.trim();
    if (!/^#?[0-9a-fA-F]{3,6}$/.test(hex)) return;
    if (hex[0] !== '#') hex = '#' + hex;
    var rgb = hexToRgb(hex);
    var lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
    var match = findSolid(lab, DMC);
    setCustomHex("");
  }

  // Sorted palette for display (by count descending)
  var sortedPal = React.useMemo(function() {
    return pal.filter(function(p) { return p.id !== "__skip__" && p.id !== "__empty__"; });
  }, [pal]);

  // Preset list by category
  var presetList = React.useMemo(function() {
    return Object.keys(PALETTE_PRESETS).map(function(name) {
      return { name: name, colours: PALETTE_PRESETS[name].colours, category: PALETTE_PRESETS[name].category };
    });
  }, []);
  var seasonalPresets = presetList.filter(function(p) { return p.category === "seasonal"; });
  var artisticPresets = presetList.filter(function(p) { return p.category === "artistic"; });
  var allThemePresets = seasonalPresets.concat(artisticPresets);

  // Harmony palette
  var harmonyColours = React.useMemo(function() {
    return generateHarmonyPalette(harmonyBase, harmonyType);
  }, [harmonyBase, harmonyType]);

  var harmonyDmc = React.useMemo(function() {
    return harmonyColours.map(function(hex) {
      var rgb = hexToRgb(hex);
      var lab = rgbToLab(rgb[0], rgb[1], rgb[2]);
      return findSolid(lab, DMC);
    });
  }, [harmonyColours]);

  // Early return if no palette data
  if (!pal || pal.length === 0) {
    return { shiftSection: null, presetSection: null, confirmView: null, showConfirm: false };
  }

  // ───────────── Sidebar: Shift Colours Section ─────────────
  var shiftSection = React.createElement(Section, {
    title: "Shift Colours", defaultOpen: true
  },
    React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8, marginTop: 8 } },
      React.createElement(HueSpectrumBar, null),
      React.createElement(SliderRow, {
        label: "Shift", value: shiftDeg, min: 0, max: 360, step: 1,
        onChange: function(v) { setShiftDeg(v); setActiveMode("shift"); setActivePreset(null); setMappingOverrides(null); },
        suffix: "\u00B0"
      }),
      React.createElement(QuickShiftButtons, {
        value: activeMode === "shift" ? shiftDeg : -1,
        onChange: function(v) { setShiftDeg(v); setActiveMode("shift"); setActivePreset(null); setMappingOverrides(null); }
      }),
      React.createElement("div", { style: { borderTop: "0.5px solid #e4e4e7", margin: "4px 0" } }),
      React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#71717a", marginBottom: 2 } }, "Colour mapping preview"),
      React.createElement("div", { style: { maxHeight: 250, overflow: "auto" } },
        sortedPal.map(function(entry) {
          var m = finalMapping[entry.id];
          if (!m) return null;
          return React.createElement("div", {
            key: entry.id,
            style: { display: "flex", alignItems: "center", gap: 4, padding: "3px 0", fontSize: 11 }
          },
            React.createElement(LockToggle, { locked: lockedIds.has(entry.id), onToggle: function() { toggleLock(entry.id); } }),
            React.createElement(SwatchBox, { rgb: m.source.rgb }),
            React.createElement("span", { style: { fontFamily: "monospace", minWidth: 32 } }, m.source.id),
            React.createElement("span", { style: { color: "#a1a1aa" } }, "\u2192"),
            React.createElement(SwatchBox, { rgb: m.dest.rgb }),
            React.createElement("span", { style: { fontFamily: "monospace", minWidth: 32 } }, m.dest.id),
            React.createElement("span", { style: { color: "#71717a", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } }, m.dest.name || ""),
            m.locked
              ? React.createElement("span", { style: { fontSize: 10, color: "#b45309", background: "#fef3c7", padding: "1px 6px", borderRadius: 8 } }, "Locked")
              : React.createElement(DEBadge, { dE: m.dE })
          );
        })
      ),
      collisions.length > 0 && React.createElement("div", {
        style: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#d97706" }
      },
        "\u26A0 ",
        collisions.map(function(c) {
          return "DMC " + c.dmcId + " (" + c.sourceIds.length + " sources)";
        }).join(", "),
        " \u2014 same thread collision. Pattern may lose detail."
      ),
      React.createElement("div", { style: { display: "flex", gap: 6, marginTop: 4 } },
        React.createElement("button", {
          onClick: function() { if (hasChange) setShowConfirm(true); },
          disabled: !hasChange,
          style: {
            flex: 1, padding: "8px", fontSize: 13, fontWeight: 600, borderRadius: 8, cursor: hasChange ? "pointer" : "default",
            background: hasChange ? "#1D9E75" : "#a1a1aa", color: "#fff", border: "none"
          }
        }, "Preview & Apply"),
        React.createElement("button", {
          onClick: function() { setShiftDeg(0); setActivePreset(null); setMappingOverrides(null); },
          style: {
            padding: "8px 12px", fontSize: 12, borderRadius: 8, cursor: "pointer",
            background: "#fff", color: "#71717a", border: "1px solid #e4e4e7"
          }
        }, "Reset")
      )
    )
  );

  // ───────────── Sidebar: Palette Presets Section ─────────────
  var presetSection = React.createElement(Section, {
    title: "Palette Presets", defaultOpen: false
  },
    React.createElement("div", { style: { marginTop: 8, display: "flex", flexDirection: "column", gap: 8 } },
      // Tab switcher
      React.createElement("div", {
        style: { display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2 }
      },
        ["themes", "harmony", "saved"].map(function(t) {
          var label = t.charAt(0).toUpperCase() + t.slice(1);
          var active = presetTab === t;
          return React.createElement("button", {
            key: t,
            onClick: function() { setPresetTab(t); },
            style: {
              flex: 1, padding: "5px 8px", fontSize: 11, fontWeight: active ? 500 : 400,
              background: active ? "#fff" : "transparent", borderRadius: 6,
              color: active ? "#18181b" : "#71717a", border: "none", cursor: "pointer",
              boxShadow: active ? "0 1px 2px rgba(0,0,0,0.04)" : "none"
            }
          }, label);
        })
      ),

      // Themes tab
      presetTab === "themes" && React.createElement("div", {
        style: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }
      },
        allThemePresets.map(function(p) {
          return React.createElement(PresetCard, {
            key: p.name, preset: p,
            selected: activePreset === p.name,
            onClick: function() {
              setActivePreset(p.name);
              setActiveMode("preset");
              setMappingOverrides(null);
            }
          });
        })
      ),

      // Harmony tab
      presetTab === "harmony" && React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 8 } },
        React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
          React.createElement("span", {
            style: {
              width: 28, height: 28, borderRadius: 6, display: "inline-block",
              background: harmonyBase, border: "2px solid #e4e4e7", cursor: "pointer"
            },
            onClick: function() { /* handled by input below */ }
          }),
          React.createElement("input", {
            type: "color", value: harmonyBase,
            onChange: function(e) { setHarmonyBase(e.target.value); setActiveMode("harmony"); setMappingOverrides(null); },
            style: { width: 0, height: 0, visibility: "hidden", position: "absolute" }
          }),
          React.createElement("input", {
            type: "text", value: harmonyBase,
            onChange: function(e) {
              var v = e.target.value;
              if (/^#[0-9a-fA-F]{6}$/.test(v)) { setHarmonyBase(v); setActiveMode("harmony"); setMappingOverrides(null); }
              else setHarmonyBase(v);
            },
            style: { fontFamily: "monospace", width: 80, padding: "4px 8px", border: "0.5px solid #e4e4e7", borderRadius: 6, fontSize: 12 }
          })
        ),
        React.createElement("div", { style: { display: "flex", gap: 4, flexWrap: "wrap" } },
          Object.keys(HARMONY_TYPES).map(function(ht) {
            var active = harmonyType === ht;
            return React.createElement("button", {
              key: ht,
              onClick: function() { setHarmonyType(ht); setActiveMode("harmony"); setMappingOverrides(null); },
              style: {
                padding: "4px 10px", fontSize: 11, fontWeight: 500, borderRadius: 12, cursor: "pointer",
                border: active ? "1px solid #1D9E75" : "1px solid #e4e4e7",
                background: active ? "#f0fdfa" : "#fff",
                color: active ? "#1D9E75" : "#71717a"
              }
            }, ht);
          })
        ),
        React.createElement("div", { style: { display: "flex", gap: 3 } },
          harmonyDmc.map(function(m, i) {
            return React.createElement("div", { key: i, style: { textAlign: "center" } },
              React.createElement(SwatchBox, { rgb: m.rgb, size: 22 }),
              React.createElement("div", { style: { fontSize: 9, color: "#a1a1aa" } }, m.id)
            );
          })
        ),
        React.createElement("button", {
          onClick: function() { if (activeMode === "harmony") setShowConfirm(true); },
          disabled: activeMode !== "harmony",
          style: {
            padding: "8px", fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: activeMode === "harmony" ? "pointer" : "default",
            background: activeMode === "harmony" ? "#1D9E75" : "#a1a1aa", color: "#fff", border: "none"
          }
        }, "Preview Harmony")
      ),

      // Saved tab
      presetTab === "saved" && React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
        customPalettes.length === 0 && React.createElement("div", {
          style: { fontSize: 11, color: "#a1a1aa", textAlign: "center", padding: "12px 0" }
        }, "No saved palettes yet. Apply a swap and click \u201CSave palette\u201D."),
        customPalettes.map(function(cp, idx) {
          return React.createElement("div", {
            key: idx,
            style: {
              borderRadius: 8, padding: 8, border: "1px solid #e4e4e7", background: "#fff",
              display: "flex", flexDirection: "column", gap: 4
            }
          },
            React.createElement("div", { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
              React.createElement("span", { style: { fontSize: 11, fontWeight: 500 } }, cp.name),
              React.createElement("div", { style: { display: "flex", gap: 4 } },
                React.createElement("button", {
                  onClick: function() {
                    setActivePreset(null); // custom
                    setActiveMode("preset");
                    setMappingOverrides(null);
                    // Temporarily set active preset to a special key
                    var result = computePresetMapping(pal, cp.colours, lockedIds);
                    // We need to use preset colours directly — store in overrides
                    var merged = {};
                    Object.keys(result.mapping).forEach(function(id) { merged[id] = result.mapping[id]; });
                    setMappingOverrides(merged);
                    setShowConfirm(true);
                  },
                  style: { fontSize: 10, padding: "2px 8px", borderRadius: 6, border: "1px solid #99f6e4", background: "#f0fdfa", color: "#1D9E75", cursor: "pointer" }
                }, "Apply"),
                React.createElement("button", {
                  onClick: function() { deleteCustomPalette(idx); },
                  style: { fontSize: 10, padding: "2px 6px", borderRadius: 6, border: "1px solid #fecaca", background: "#fef2f2", color: "#dc2626", cursor: "pointer" }
                }, "\u00D7")
              )
            ),
            React.createElement("div", { style: { display: "flex", gap: 2 } },
              cp.colours.slice(0, 8).map(function(hex, ci) {
                return React.createElement("span", {
                  key: ci,
                  style: { width: 14, height: 14, borderRadius: 2, background: hex, border: "1px solid #d4d4d8", display: "inline-block" }
                });
              })
            )
          );
        })
      ),

      // Custom hex input at bottom
      presetTab === "themes" && React.createElement("div", {
        style: { display: "flex", gap: 4, alignItems: "center", borderTop: "0.5px solid #e4e4e7", paddingTop: 6 }
      },
        React.createElement("input", {
          type: "text", placeholder: "#hex", value: customHex,
          onChange: function(e) { setCustomHex(e.target.value); },
          style: { fontFamily: "monospace", width: 72, padding: "4px 8px", border: "0.5px solid #e4e4e7", borderRadius: 6, fontSize: 12 }
        }),
        React.createElement("button", {
          onClick: addCustomHexColour,
          style: { fontSize: 11, padding: "4px 10px", borderRadius: 6, border: "1px solid #e4e4e7", background: "#fafafa", cursor: "pointer" }
        }, "+ Add")
      ),

      // Apply preset button (Themes/Saved)
      (presetTab === "themes" && activePreset) && React.createElement("button", {
        onClick: function() { setShowConfirm(true); },
        style: {
          padding: "8px", fontSize: 12, fontWeight: 600, borderRadius: 8, cursor: "pointer",
          background: "#1D9E75", color: "#fff", border: "none"
        }
      }, "Preview \u201C" + activePreset + "\u201D")
    )
  );

  // ───────────── Main Content: Confirmation View ─────────────
  var confirmView = showConfirm ? React.createElement("div", {
    className: "ps-confirm-overlay",
    style: { background: "#fff", borderRadius: 10, border: "1px solid #e4e4e7", padding: 16 }
  },
    // Preview canvases
    React.createElement("div", { style: { display: "flex", gap: 12, marginBottom: 16 } },
      React.createElement("div", { style: { flex: 1 } },
        React.createElement("div", { style: { fontSize: 11, color: "#a1a1aa", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 } }, "Before"),
        React.createElement("div", { style: { borderRadius: 8, background: "#f4f4f5", overflow: "hidden", aspectRatio: sW + "/" + sH } },
          React.createElement("canvas", { ref: beforeRef, style: { width: "100%", height: "100%", display: "block", imageRendering: "pixelated" } })
        )
      ),
      React.createElement("div", { style: { flex: 1 } },
        React.createElement("div", { style: { fontSize: 11, color: "#a1a1aa", textTransform: "uppercase", fontWeight: 600, marginBottom: 4 } },
          "After" + (activeMode === "shift" ? " (" + shiftDeg + "\u00B0 shift)" : activeMode === "preset" && activePreset ? " (\u201C" + activePreset + "\u201D)" : "")
        ),
        React.createElement("div", { style: { borderRadius: 8, background: "#f4f4f5", overflow: "hidden", aspectRatio: sW + "/" + sH } },
          React.createElement("canvas", { ref: afterRef, style: { width: "100%", height: "100%", display: "block", imageRendering: "pixelated" } })
        )
      )
    ),

    // Mapping table
    React.createElement("div", { style: { fontSize: 11, fontWeight: 600, color: "#71717a", marginBottom: 4 } }, "Colour mapping"),
    React.createElement("div", { style: { overflow: "auto", maxHeight: 300, marginBottom: 12 } },
      React.createElement("table", { style: { width: "100%", borderCollapse: "collapse", fontSize: 12 } },
        React.createElement("thead", null,
          React.createElement("tr", { style: { fontSize: 10, textTransform: "uppercase", color: "#a1a1aa" } },
            React.createElement("th", { style: { textAlign: "left", padding: "2px 6px", fontWeight: 600 } }, "Source"),
            React.createElement("th", { style: { padding: "2px 2px" } }),
            React.createElement("th", { style: { textAlign: "left", padding: "2px 6px", fontWeight: 600 } }, "Destination"),
            React.createElement("th", { style: { textAlign: "right", padding: "2px 6px", fontWeight: 600 } }, "Stitches"),
            React.createElement("th", { style: { textAlign: "left", padding: "2px 6px", fontWeight: 600 } }, "Match"),
            React.createElement("th", { style: { padding: "2px 6px" } })
          )
        ),
        React.createElement("tbody", null,
          sortedPal.map(function(entry) {
            var m = finalMapping[entry.id];
            if (!m) return null;
            return React.createElement(MappingTableRow, {
              key: entry.id,
              mapping: m,
              count: countMap[entry.id] || 0,
              onOverride: handleOverride
            });
          })
        )
      )
    ),

    // Contrast warnings
    contrastWarnings.length > 0 && React.createElement("div", {
      style: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "#d97706", marginBottom: 8 }
    },
      React.createElement("strong", null, "Low contrast pairs: "),
      contrastWarnings.map(function(w, i) {
        return React.createElement("span", { key: i, style: { display: "inline-flex", alignItems: "center", gap: 2, marginRight: 8 } },
          React.createElement(SwatchBox, { rgb: w.a.rgb, size: 12 }),
          React.createElement(SwatchBox, { rgb: w.b.rgb, size: 12 }),
          React.createElement("span", null, " " + w.ratio + ":1")
        );
      })
    ),

    // Tracking progress warning
    doneCount > 0 && React.createElement("div", {
      style: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "8px 10px", fontSize: 11, color: "#d97706", marginBottom: 8 }
    },
      "This pattern has tracking progress (" + doneCount.toLocaleString() + " stitches marked). Applying a palette swap will reset your progress."
    ),

    // Collision warnings
    collisions.length > 0 && React.createElement("div", {
      style: { background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 6, padding: "6px 10px", fontSize: 11, color: "#d97706", marginBottom: 8 }
    },
      "\u26A0 Collision: ",
      collisions.map(function(c) { return "DMC " + c.dmcId + " (" + c.sourceIds.length + " sources)"; }).join(", "),
      " \u2014 multiple source colours map to the same thread."
    ),

    // Action bar
    React.createElement("div", {
      style: {
        display: "flex", alignItems: "center", gap: 8,
        background: "#fafafa", borderTop: "0.5px solid #e4e4e7", padding: "10px 0", marginTop: 8
      }
    },
      React.createElement("button", {
        onClick: savePalette,
        style: {
          fontSize: 12, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
          background: "#fff", color: "#71717a", border: "1px solid #e4e4e7", marginRight: "auto"
        }
      }, "Save palette"),
      React.createElement("button", {
        onClick: function() { setShowConfirm(false); },
        style: {
          fontSize: 12, padding: "8px 14px", borderRadius: 8, cursor: "pointer",
          background: "#fff", color: "#71717a", border: "1px solid #e4e4e7"
        }
      }, "Cancel"),
      React.createElement("button", {
        onClick: applySwap,
        style: {
          fontSize: 13, fontWeight: 600, padding: "8px 20px", borderRadius: 8, cursor: "pointer",
          background: "#1D9E75", color: "#fff", border: "none"
        }
      }, "Apply Swap")
    )
  ) : null;

  // Return the component parts for the host CreatorApp to place
  return { shiftSection: shiftSection, presetSection: presetSection, confirmView: confirmView, showConfirm: showConfirm };
}
