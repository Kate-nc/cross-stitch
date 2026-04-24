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
  "stats-showcase.js",
  "backup-restore.js"
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
  { bad: "Favorite",  good: "Favourite", caseSensitive: true, note: "Use British English ('favourite')." }
];

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

module.exports = { lintAll, scanFile, FORBIDDEN, TARGET_FILES };
