#!/usr/bin/env node
/**
 * scripts/lint-terminology.js
 *
 * Lints user-facing JavaScript strings for terminology consistency with
 * TERMINOLOGY.md. Forbidden terms (e.g. "Inventory") are flagged with the
 * preferred replacement (e.g. "Stash"). Returns exit code 1 if violations
 * are found.
 *
 * Usage:
 *   node scripts/lint-terminology.js
 *   node scripts/lint-terminology.js --json    # machine-readable output
 *
 * To allow a deliberate use of a forbidden term, append:
 *   // terminology-lint-allow
 * at the end of the offending line. Use sparingly.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");

// Files whose user-facing strings should be linted.
const TARGET_FILES = [
  "manager-app.js",
  "tracker-app.js",
  "creator-main.js",
  "home-screen.js",
  "header.js",
  "modals.js",
  "components.js",
  "preferences-modal.js",
  "help-drawer.js",
  "onboarding-wizard.js",
  "project-library.js",
  "stats-page.js",
  "stats-activity.js",
  "backup-restore.js",
  // Convert and the pattern summaries count threads and chart symbols (P2-5).
  "creator/Sidebar.js",
  "creator/PreviewCanvas.js",
  "creator/PatternInfoPopover.js",
  "creator/useCreatorState.js",
  // The Convert, Edit and dialog wording pass (audit P2-9).
  "creator/ToolStrip.js",
  "creator/MagicWandPanel.js",
  "creator/ColourReplaceModal.js",
  "creator/AdaptModal.js",
  "creator/LegendTab.js",
  "creator/ProjectTab.js",
  "creator/PatternTab.js",
  "creator/ImportWizard.js"
];

// Forbidden → preferred. Each rule is matched as a whole word with the given
// case-sensitivity. Identifiers that happen to overlap (e.g. internal tab id
// "inventory") use lowercase and are deliberately *not* flagged — only
// user-facing strings (which we capitalise) are caught. To allow a deliberate
// use, add `// terminology-lint-allow` at the end of the line.
const FORBIDDEN = [
  { bad: "Inventory", good: "Stash",   caseSensitive: true,  note: "Use 'Stash' for the user's owned threads (per TERMINOLOGY.md)." },
  { bad: "Color",     good: "Colour",  caseSensitive: true,  note: "Use British English ('colour') in user-facing strings." },
  { bad: "Organize",  good: "Organise", caseSensitive: true, note: "Use British English ('organise')." },
  { bad: "Favorite",  good: "Favourite", caseSensitive: true, note: "Use British English ('favourite')." },
  // Max threads caps distinct threads; a blend is one chart symbol made of
  // two threads, so counts say threads or symbols, never colours (audit IMG-02).
  { bad: "Max colours", good: "Threads (max)", caseSensitive: false, note: "The limit is on threads; see TERMINOLOGY.md 'Thread vs. symbol'." }
];

// Technical names stitchers don't use (audit P2-9). Matched only inside
// string literals, so code identifiers and comments can still name the
// algorithm; the one place they may appear in the UI is an "Advanced"
// disclosure, whose lines carry the allow comment. See TERMINOLOGY.md
// "Plain names for the settings".
const DELTA = String.fromCharCode(0x394);
const DELTA_ESCAPE = "\\\\" + "u0394"; // the escape as written in source
const JARGON = [
  { bad: "Delta E", re: new RegExp(DELTA + "|" + DELTA_ESCAPE + "|\\bdelta[- ]?E\\b|\\bdE\\b", "i"), good: "Difference", note: "Say 'Difference' or 'How strict'; colour-science units stay out of the UI." },
  { bad: "luminance", re: /\bluminance\b/i, good: "brightness", note: "Say 'brightness' or 'light and dark'." },
  { bad: "chroma", re: /\bchroma\b/i, good: "colour", note: "Say 'colour' or 'how vivid'." },
  { bad: "Gaussian", re: /\bGaussian\b/, good: "Soften grainy photos", note: "Name what it does, not the filter." },
  { bad: "Bayer", re: /\bBayer\b/, good: "Pattern blend", note: "The ordered dither is 'Pattern blend'." },
  { bad: "Atkinson", re: /\bAtkinson\b/, good: "Smooth blend", note: "The error-diffusion dither is 'Smooth blend'." }
];

// The jargon rules cover the Creator and the text that explains it; the
// Stash Manager's thread-substitution cards still show the colour difference
// in its usual units.
function jargonApplies(rel) {
  return rel.indexOf("creator/") === 0 || rel === "creator-main.js" ||
    rel === "help-drawer.js" || rel === "onboarding-wizard.js";
}

// String literals on a line ("...", '...', `...`); enough for the one-line
// UI strings these files write.
const STRING_RE = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`/g;

function stringsOn(line) {
  const t = line.trim();
  if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) return [];
  return line.match(STRING_RE) || [];
}

const ALLOW_COMMENT = "terminology-lint-allow";

function scanFile(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  const src = fs.readFileSync(abs, "utf8").split(/\r?\n/);
  const hits = [];
  src.forEach((line, i) => {
    if (line.indexOf(ALLOW_COMMENT) !== -1) return;
    FORBIDDEN.forEach(rule => {
      const flags = rule.caseSensitive ? "" : "i";
      const re = new RegExp("\\b" + rule.bad.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\b", flags);
      if (re.test(line)) {
        hits.push({ file: rel, line: i + 1, term: rule.bad, suggested: rule.good, note: rule.note, snippet: line.trim().slice(0, 200) });
      }
    });
    const strs = jargonApplies(rel) ? stringsOn(line) : [];
    JARGON.forEach(rule => {
      if (strs.some(str => rule.re.test(str))) {
        hits.push({ file: rel, line: i + 1, term: rule.bad, suggested: rule.good, note: rule.note, snippet: line.trim().slice(0, 200) });
      }
    });
  });
  return hits;
}

function lintAll() {
  return TARGET_FILES.flatMap(scanFile);
}

if (require.main === module) {
  const json = process.argv.includes("--json");
  const hits = lintAll();
  if (json) {
    process.stdout.write(JSON.stringify(hits, null, 2) + "\n");
  } else if (hits.length === 0) {
    process.stdout.write("Terminology lint passed — no forbidden terms found in " + TARGET_FILES.length + " files.\n");
  } else {
    process.stderr.write("Terminology lint found " + hits.length + " issue(s):\n\n");
    hits.forEach(h => {
      process.stderr.write("  " + h.file + ":" + h.line + "  '" + h.term + "' → '" + h.suggested + "'\n");
      process.stderr.write("    " + h.note + "\n");
      process.stderr.write("    > " + h.snippet + "\n\n");
    });
    process.stderr.write("Add `// " + ALLOW_COMMENT + "` to allow a deliberate use.\n");
  }
  process.exit(hits.length === 0 ? 0 : 1);
}

module.exports = { lintAll, scanFile, FORBIDDEN, JARGON, TARGET_FILES };
