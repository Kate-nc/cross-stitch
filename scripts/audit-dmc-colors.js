#!/usr/bin/env node
// =============================================================================
// scripts/audit-dmc-colors.js
// =============================================================================
// Compares the current dmc-data.js values against the community consensus
// reference dataset and reports:
//   - Identical-value pairs (should be zero after P0 fixes)
//   - Colors where ΔE₀₀ vs reference > threshold
//   - Brown family hue analysis (hue angle and relative hue steps)
//
// Usage:
//   node scripts/audit-dmc-colors.js
//   node scripts/audit-dmc-colors.js --threshold 1.5
//   node scripts/audit-dmc-colors.js --browns-only
//   node scripts/audit-dmc-colors.js --identical-only
// =============================================================================

const fs = require('fs');
const path = require('path');

// ---------------------------------------------------------------------------
// Load DMC data
// ---------------------------------------------------------------------------
const { DMC, rgbToLab, dE00 } = require(path.join(__dirname, '..', 'dmc-data.js'));

// ---------------------------------------------------------------------------
// Parse CLI args
// ---------------------------------------------------------------------------
const args = process.argv.slice(2);
const thresholdArg = args.find(a => a.startsWith('--threshold='));
const THRESHOLD = thresholdArg ? parseFloat(thresholdArg.split('=')[1]) : 2.0;
const BROWNS_ONLY = args.includes('--browns-only');
const IDENTICAL_ONLY = args.includes('--identical-only');

// ---------------------------------------------------------------------------
// Community consensus reference dataset
// ---------------------------------------------------------------------------
// Values sourced from: PC Stitch / WinStitch legacy, Lord Libidan chart,
// and cross-referenced with nathantspencer/DMC-ColorCodes (2017).
// Confidence levels:
//   HIGH  = multiple sources agree, widely validated by community
//   MED   = one strong source, not contradicted elsewhere
//   LOW   = best available, known to have some disagreement between sources
//
// Only includes colors where confidence >= MED and ΔE₀₀ vs community is
// likely to exceed 1.0. Colors not listed are assumed to be within tolerance.
// ---------------------------------------------------------------------------
const REFERENCE = {
  // Whites (HIGH confidence)
  'blanc':  { rgb: [255, 251, 245], conf: 'HIGH', note: 'warm off-white — distinguishes from B5200' },
  '3865':   { rgb: [242, 240, 234], conf: 'MED',  note: 'winter white — slightly darker in community ref' },

  // Christmas reds (HIGH confidence for 666; MED for others)
  '304':    { rgb: [185, 20,  47 ], conf: 'MED',  note: 'Christmas Red M' },
  '321':    { rgb: [205, 32,  44 ], conf: 'HIGH', note: 'Christmas Red — deeper, less pink cast' },
  '498':    { rgb: [168, 18,  38 ], conf: 'MED',  note: 'Christmas Dk' },
  '666':    { rgb: [205, 10,  24 ], conf: 'HIGH', note: 'CRITICAL: was pink/magenta (ΔE₀₀ 9.82)' },

  // Garnet/coral reds (MED confidence)
  '815':    { rgb: [131, 4,   28 ], conf: 'MED',  note: 'Garnet Med' },
  '816':    { rgb: [148, 7,   31 ], conf: 'MED',  note: 'Garnet' },
  '817':    { rgb: [177, 0,   26 ], conf: 'MED',  note: 'Coral Red VDk' },

  // Carnations (MED confidence — community ref is deeper/less pink)
  '891':    { rgb: [255, 77,  95 ], conf: 'MED',  note: 'Carnation Dk' },
  '892':    { rgb: [255, 108, 131], conf: 'MED',  note: 'Carnation Med' },
  '893':    { rgb: [252, 133, 154], conf: 'MED',  note: 'Carnation Lt' },

  // Royal blues (HIGH confidence — well-documented community disagreement)
  '796':    { rgb: [26,  76,  128], conf: 'HIGH', note: 'Royal Blue Dk — brighter in community ref' },
  '797':    { rgb: [22,  82,  150], conf: 'HIGH', note: 'Royal Blue' },
  '798':    { rgb: [73,  110, 146], conf: 'MED',  note: 'Delft Blue Dk' },
  '799':    { rgb: [119, 146, 185], conf: 'MED',  note: 'Delft Blue Med' },

  // Electric/bright blues (HIGH confidence)
  '3843':   { rgb: [0,   162, 201], conf: 'HIGH', note: 'Electric Blue — bluer, less green cast' },
  '3844':   { rgb: [0,   164, 176], conf: 'MED',  note: 'Bright Turq Dk' },

  // ─── BROWNS ───────────────────────────────────────────────────────────────
  // The brown families below have been reviewed specifically for relative hue
  // accuracy. Community reference values for browns are less certain than for
  // reds and blues. Differences flagged here are in the MED confidence tier.
  //
  // The key issue is hue angle: real DMC browns span a wider warm → neutral
  // range than the screen values suggest. The 433-437 Tan/Brown family and
  // the 838-842 Beige Brown family both lean too uniformly orange in the
  // current data, compressing the perceptual hue steps between adjacent shades.
  // ──────────────────────────────────────────────────────────────────────────

  // Coffee/dark browns (MED confidence)
  '801':    { rgb: [100, 55,  22 ], conf: 'MED',  note: 'Coffee Brown Dk — slightly warmer than current' },
  '898':    { rgb: [72,  42,  19 ], conf: 'MED',  note: 'Coffee Brown VDk' },
  '938':    { rgb: [52,  29,  13 ], conf: 'MED',  note: 'Coffee UDk — community slightly darker/cooler' },

  // Brown/Tan 433-437 family (MED confidence — hue accuracy concern)
  '433':    { rgb: [117, 68,  31 ], conf: 'MED',  note: 'Brown Med — slightly cooler/less orange than current' },
  '434':    { rgb: [148, 92,  49 ], conf: 'MED',  note: 'Brown Lt — hue step from 433 should be more neutral' },
  '435':    { rgb: [180, 115, 64 ], conf: 'MED',  note: 'Brown VLt' },
  '436':    { rgb: [199, 138, 73 ], conf: 'MED',  note: 'Tan — less orange-warm; hue should shift toward neutral' },
  '437':    { rgb: [222, 178, 132], conf: 'MED',  note: 'Tan Lt — wider step from 436 than current' },

  // Beige Brown 838-842 family (MED confidence — hue step concern)
  '838':    { rgb: [86,  70,  52 ], conf: 'MED',  note: 'Beige Brown VDk — cooler, more gray-brown quality' },
  '839':    { rgb: [100, 83,  63 ], conf: 'MED',  note: 'Beige Brown Dk' },
  '840':    { rgb: [151, 121, 91 ], conf: 'MED',  note: 'Beige Brown Med — reference is slightly cooler' },
  '841':    { rgb: [179, 153, 124], conf: 'MED',  note: 'Beige Brown Lt' },
  '842':    { rgb: [207, 183, 158], conf: 'MED',  note: 'Beige Brown VLt — hue should be more pinkish-beige' },

  // Mocha 3031-3033 family (MED confidence)
  '3031':   { rgb: [74,  59,  42 ], conf: 'MED',  note: 'Mocha VDk — warm brown with red undertone' },
  '3032':   { rgb: [177, 157, 137], conf: 'MED',  note: 'Mocha Med' },
  '3033':   { rgb: [225, 213, 201], conf: 'MED',  note: 'Mocha VLt' },

  // Brown Gray 3021-3024 family (MED confidence — should lean cooler/grayer)
  '3021':   { rgb: [77,  63,  48 ], conf: 'MED',  note: 'Brown Gray VDk — slightly cooler/grayer than current' },
  '3022':   { rgb: [139, 133, 116], conf: 'MED',  note: 'Brown Gray Med — more gray quality' },
  '3023':   { rgb: [174, 167, 148], conf: 'MED',  note: 'Brown Gray Lt' },

  // Hazelnut family (MED confidence)
  '420':    { rgb: [158, 109, 63 ], conf: 'MED',  note: 'Hazelnut Dk' },
  '422':    { rgb: [196, 156, 119], conf: 'MED',  note: 'Hazelnut Lt' },
  '869':    { rgb: [130, 92,  56 ], conf: 'MED',  note: 'Hazelnut VDk' },

  // Mahogany family (MED confidence)
  '300':    { rgb: [111, 47,  0  ], conf: 'MED',  note: 'Mahogany VDk' },
  '400':    { rgb: [143, 67,  15 ], conf: 'MED',  note: 'Mahogany Dk' },
};

// ---------------------------------------------------------------------------
// Brown family IDs for hue analysis
// ---------------------------------------------------------------------------
const BROWN_FAMILIES = {
  'Coffee':       ['938', '898', '801'],
  'Mahogany':     ['300', '400', '301', '402'],
  'Brown/Tan':    ['433', '434', '435', '436', '437'],
  'Beige Brown':  ['838', '839', '840', '841', '842'],
  'Hazelnut':     ['869', '420', '422'],
  'Mocha':        ['3031', '3032', '3033'],
  'Brown Gray':   ['3021', '3022', '3023', '3024'],
  'Golden Brown': ['975', '976', '977', '3826', '3827'],
  'Drab Brown':   ['610', '611', '612', '613'],
  'Mocha Beige':  ['3862', '3863', '3864'],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function labHueAngle(lab) {
  return (Math.atan2(lab[2], lab[1]) * 180 / Math.PI + 360) % 360;
}

function labChroma(lab) {
  return Math.sqrt(lab[1] ** 2 + lab[2] ** 2);
}

function getThread(id) {
  return DMC.find(t => t.id === id);
}

// ---------------------------------------------------------------------------
// Check 1: Identical RGB value pairs
// ---------------------------------------------------------------------------
function findIdenticalPairs() {
  const byKey = {};
  for (const t of DMC) {
    const key = t.rgb.join(',');
    if (!byKey[key]) byKey[key] = [];
    byKey[key].push(t);
  }
  const dupes = Object.entries(byKey).filter(([, v]) => v.length > 1);
  return dupes;
}

// ---------------------------------------------------------------------------
// Check 2: ΔE₀₀ vs community reference
// ---------------------------------------------------------------------------
function auditAgainstReference(threshold) {
  const results = [];
  for (const [id, ref] of Object.entries(REFERENCE)) {
    const thread = getThread(id);
    if (!thread) {
      results.push({ id, status: 'NOT_FOUND' });
      continue;
    }
    const refLab = rgbToLab(ref.rgb[0], ref.rgb[1], ref.rgb[2]);
    const de = dE00(thread.lab, refLab);
    results.push({
      id,
      name: thread.name,
      current: thread.rgb,
      reference: ref.rgb,
      de00: de,
      conf: ref.conf,
      note: ref.note,
      exceeds: de > threshold,
    });
  }
  return results.sort((a, b) => (b.de00 || 0) - (a.de00 || 0));
}

// ---------------------------------------------------------------------------
// Check 3: Brown family hue analysis
// ---------------------------------------------------------------------------
function brownHueAnalysis() {
  const report = {};
  for (const [familyName, ids] of Object.entries(BROWN_FAMILIES)) {
    const threads = ids.map(id => {
      const t = getThread(id);
      if (!t) return null;
      const hue = labHueAngle(t.lab);
      const chroma = labChroma(t.lab);
      const L = t.lab[0];
      return { id: t.id, name: t.name, rgb: t.rgb, L: Math.round(L * 10) / 10, hue: Math.round(hue * 10) / 10, chroma: Math.round(chroma * 10) / 10 };
    }).filter(Boolean);

    // Compute hue step between adjacent members
    const steps = [];
    for (let i = 1; i < threads.length; i++) {
      let diff = Math.abs(threads[i].hue - threads[i - 1].hue);
      if (diff > 180) diff = 360 - diff;
      // Compute ΔE₀₀ between this and previous
      const ta = getThread(threads[i - 1].id);
      const tb = getThread(threads[i].id);
      const de = ta && tb ? Math.round(dE00(ta.lab, tb.lab) * 100) / 100 : null;
      steps.push({
        from: threads[i - 1].id,
        to: threads[i].id,
        hueDiff: Math.round(diff * 10) / 10,
        de00: de,
        warning: de !== null && de < 6 ? 'TOO_CLOSE' : null,
      });
    }

    report[familyName] = { threads, steps };
  }
  return report;
}

// ---------------------------------------------------------------------------
// Render output
// ---------------------------------------------------------------------------
console.log('\n═══════════════════════════════════════════════════════════════════');
console.log('  DMC COLOUR AUDIT REPORT');
console.log(`  Threshold: ΔE₀₀ > ${THRESHOLD} triggers a recommended change`);
console.log('═══════════════════════════════════════════════════════════════════\n');

// ─── Section 1: Identical pairs ─────────────────────────────────────────────
if (!BROWNS_ONLY) {
  const dupes = findIdenticalPairs();
  console.log(`── IDENTICAL RGB VALUE PAIRS (${dupes.length} groups) ──────────────────────`);
  if (dupes.length === 0) {
    console.log('  PASS: No identical value pairs found.\n');
  } else {
    for (const [key, threads] of dupes) {
      console.log(`  rgb(${key}) shared by: ${threads.map(t => `${t.id} "${t.name}"`).join(', ')}`);
    }
    console.log();
  }
}

// ─── Section 2: Reference comparison ────────────────────────────────────────
if (!BROWNS_ONLY) {
  const results = auditAgainstReference(THRESHOLD);
  const exceeding = results.filter(r => r.exceeds);
  const passing = results.filter(r => r.de00 !== undefined && !r.exceeds);

  console.log(`── REFERENCE COMPARISON (threshold ΔE₀₀ > ${THRESHOLD}) ─────────────────`);
  console.log(`  ${exceeding.length} colors exceed threshold | ${passing.length} within tolerance\n`);

  if (exceeding.length > 0) {
    console.log('  RECOMMENDED CHANGES:');
    console.log('  ' + ['DMC'.padEnd(8), 'Name'.padEnd(28), 'Current RGB'.padEnd(18), 'Reference RGB'.padEnd(18), 'ΔE₀₀'.padEnd(8), 'Conf'].join(''));
    console.log('  ' + '─'.repeat(92));
    for (const r of exceeding) {
      const curr = `${r.current[0]},${r.current[1]},${r.current[2]}`;
      const ref  = `${r.reference[0]},${r.reference[1]},${r.reference[2]}`;
      const flag = r.de00 > 5 ? '  *** CRITICAL' : r.de00 > 3 ? '  ** HIGH' : '  * MEDIUM';
      console.log(`  ${String(r.id).padEnd(8)}${String(r.name).padEnd(28)}${curr.padEnd(18)}${ref.padEnd(18)}${r.de00.toFixed(2).padEnd(8)}${r.conf}${flag}`);
    }
    console.log();
  }

  if (!IDENTICAL_ONLY && passing.length > 0) {
    console.log('  WITHIN TOLERANCE (no change recommended):');
    for (const r of passing) {
      const curr = `rgb(${r.current.join(',')})`;
      console.log(`  ${String(r.id).padEnd(8)}${String(r.name).padEnd(28)}${curr}   ΔE₀₀ ${r.de00.toFixed(2)}`);
    }
    console.log();
  }
}

// ─── Section 3: Brown family hue analysis ───────────────────────────────────
if (!IDENTICAL_ONLY) {
  const brownReport = brownHueAnalysis();
  console.log('── BROWN FAMILY HUE ANALYSIS ───────────────────────────────────────');
  console.log('  Hue angle in L*a*b* (0° = red, 90° = yellow, 180° = cyan-green)');
  console.log('  Chroma = colour saturation. ΔE₀₀ between adjacent family members shown.\n');

  for (const [family, data] of Object.entries(brownReport)) {
    console.log(`  ${family}:`);
    const header = ['DMC'.padEnd(8), 'Name'.padEnd(24), 'L*'.padEnd(7), 'Hue°'.padEnd(8), 'Chroma'.padEnd(10), 'RGB'].join('');
    console.log('  ' + header);
    console.log('  ' + '─'.repeat(72));

    for (let i = 0; i < data.threads.length; i++) {
      const t = data.threads[i];
      const step = data.steps[i - 1];
      if (step) {
        const warn = step.warning ? ` ← WARNING: ΔE₀₀ ${step.de00} (TOO CLOSE for distinct shades)` : `   ΔE₀₀ ${step.de00}`;
        console.log(`  ${''.padEnd(8)}${'↕ hue diff '.padEnd(24)}${step.hueDiff.toFixed(1).padEnd(7)}${warn}`);
      }
      const rgb = `rgb(${t.rgb.join(',')})`;
      console.log(`  ${String(t.id).padEnd(8)}${String(t.name).padEnd(24)}${String(t.L).padEnd(7)}${String(t.hue).padEnd(8)}${String(t.chroma).padEnd(10)}${rgb}`);
    }
    console.log();
  }

  // Summary: flag any adjacent browns where ΔE₀₀ < 6
  const warnings = [];
  for (const [family, data] of Object.entries(brownReport)) {
    for (const step of data.steps) {
      if (step.warning) warnings.push({ family, ...step });
    }
  }

  if (warnings.length > 0) {
    console.log('  BROWN WARNINGS — pairs that may be too similar for practical use:');
    for (const w of warnings) {
      console.log(`  [${w.family}] ${w.from} → ${w.to}: ΔE₀₀ ${w.de00} (hue diff ${w.hueDiff}°)`);
    }
  } else {
    console.log('  PASS: All adjacent brown pairs have ΔE₀₀ ≥ 6.');
  }
  console.log();
}

// ─── Summary ────────────────────────────────────────────────────────────────
console.log('═══════════════════════════════════════════════════════════════════');
console.log('  SUMMARY');
console.log('═══════════════════════════════════════════════════════════════════');
if (!BROWNS_ONLY) {
  const dupes = findIdenticalPairs();
  const all = auditAgainstReference(THRESHOLD);
  const exceeding = all.filter(r => r.exceeds);
  const critical = exceeding.filter(r => r.de00 > 5);
  console.log(`  Identical pairs:       ${dupes.length} (should be 0)`);
  console.log(`  Exceeding ΔE₀₀ ${THRESHOLD}:    ${exceeding.length} colors`);
  console.log(`  Critical (ΔE₀₀ > 5):   ${critical.length} colors`);
}
console.log(`  Run with --browns-only for brown hue analysis only`);
console.log(`  Run with --threshold=1.5 for a tighter threshold`);
console.log(`  Run with --identical-only to check just for identical pairs`);
console.log('═══════════════════════════════════════════════════════════════════\n');
