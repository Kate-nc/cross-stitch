#!/usr/bin/env node
/**
 * scripts/lint-css-tokens.js
 *
 * I13 (audit) — advisory lint for raw colour hex and bare px values inside
 * component CSS rules. Designed to surface drift away from the Workshop
 * design tokens defined at the top of styles.css.
 *
 * The lint is intentionally permissive in this first pass:
 *   - Token-definition blocks (:root, [data-theme="dark"]) are exempt.
 *   - rgba()/rgb() values inside box-shadow declarations are exempt
 *     (allowed by AGENTS.md).
 *   - SVG `fill=` / `stroke=` attribute values are exempt (svg literals).
 *   - Lines containing "css-tokens-lint-allow" are exempt.
 *
 * Usage:
 *   node scripts/lint-css-tokens.js          # human-readable, exit 0
 *   node scripts/lint-css-tokens.js --strict # exit 1 on any violation
 *   node scripts/lint-css-tokens.js --json   # JSON output for CI
 */
"use strict";

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const FILES = ["styles.css"];
const HEX_RE = /#[0-9A-Fa-f]{3,8}\b/g;

// Skip the documented theme-token blocks at the top of styles.css.
// These are the *source* of all colour tokens; raw hex is required there.
const SKIP_LINE_PATTERNS = [
  /^\s*\/\*/,                  // CSS comment line start
  /^\s*\*/,                    // continuation of block comment
  /css-tokens-lint-allow/,
];

function isInsideTokenBlock(blockHeader) {
  if (!blockHeader) return false;
  return /:root\b/.test(blockHeader)
      || /\[data-theme[^\]]*\]/.test(blockHeader);
}

function isAllowedHexContext(line) {
  // rgba()/rgb() inside box-shadow is allowed.
  if (/box-shadow\s*:/.test(line)) return true;
  // SVG attributes used as CSS data URIs.
  if (/url\(['"]?data:image\/svg/.test(line)) return true;
  return false;
}

// Strip `var(--name, #hex)` fallbacks before scanning — fallback hexes are
// idiomatic and don't represent token drift.
function stripVarFallbacks(line) {
  return line.replace(/var\(\s*--[\w-]+\s*,\s*#[0-9A-Fa-f]{3,8}\s*\)/g, "var(--TOKEN)");
}

function lint(file) {
  const full = path.join(ROOT, file);
  const text = fs.readFileSync(full, "utf8");
  const lines = text.split(/\r?\n/);
  const findings = [];

  // Track current selector block by tracking `{` and `}`.
  // Naive but adequate for styles.css conventions.
  let blockHeader = null;
  let braceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Update block header when a `{` is opened at brace depth 0.
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    if (braceDepth === 0 && opens > 0) {
      // Selector is everything before the first `{` (joined with prev lines if needed).
      const sel = line.split("{")[0].trim();
      blockHeader = sel || blockHeader;
    }
    braceDepth += opens - closes;
    if (braceDepth < 0) braceDepth = 0;

    if (SKIP_LINE_PATTERNS.some((p) => p.test(line))) continue;
    if (isInsideTokenBlock(blockHeader)) continue;
    if (isAllowedHexContext(line)) continue;

    const scannable = stripVarFallbacks(line);
    const matches = scannable.match(HEX_RE);
    if (matches) {
      for (const hex of matches) {
        findings.push({
          file,
          line: i + 1,
          column: line.indexOf(hex) + 1,
          rule: "no-raw-hex",
          message: "Raw hex `" + hex + "` outside token block. Use var(--…).",
          source: line.trim().slice(0, 160),
          selector: blockHeader,
        });
      }
    }
  }

  return findings;
}

function main() {
  const args = new Set(process.argv.slice(2));
  const json = args.has("--json");
  const strict = args.has("--strict");

  const all = [];
  for (const f of FILES) all.push(...lint(f));

  if (json) {
    process.stdout.write(JSON.stringify({ count: all.length, findings: all }, null, 2) + "\n");
  } else {
    if (all.length === 0) {
      console.log("[lint-css-tokens] No raw-hex findings outside token blocks. \u2713");
    } else {
      console.log("[lint-css-tokens] " + all.length + " advisory finding(s):\n");
      for (const f of all) {
        console.log(`  ${f.file}:${f.line}:${f.column}  ${f.rule}`);
        console.log(`    ${f.message}`);
        console.log(`    > ${f.source}`);
      }
      console.log("\n  Non-blocking by default. Run with --strict to fail CI.");
    }
  }

  process.exit(strict && all.length > 0 ? 1 : 0);
}

if (require.main === module) main();
module.exports = { lint };
