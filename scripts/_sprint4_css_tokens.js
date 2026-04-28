/**
 * Sprint 4 — CSS token compliance pass on styles.css.
 *
 * Rules:
 *  - Lines that are CSS custom property DEFINITIONS (matching /^\s*--/)
 *    are skipped entirely — these live in :root and [data-theme="dark"].
 *  - Lines containing mask-image or -webkit-mask-image are skipped because
 *    they use #000 as a transparency mask, not a colour.
 *  - The `var(--token, #fallback)` pattern: the fallback hex inside var() is
 *    protected by a placeholder-swap approach before replacement runs.
 *  - All other raw hex values are replaced with the token map below.
 */
const fs = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
// PROTECTION GUARDS
// ─────────────────────────────────────────────────────────────────────────────
// Lines that must never be modified
const SKIP_LINE = /^\s*--|mask-image|webkit-mask/;

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN MAP (CSS-specific — matches the same palette used in JS sprints)
// ─────────────────────────────────────────────────────────────────────────────
const COLOUR_MAP = [
  // Text
  [/#1B1814/gi,    'var(--text-primary)'],
  [/#0F172A/gi,    'var(--text-primary)'],
  [/#5C5448/gi,    'var(--text-secondary)'],
  [/#A89E89/gi,    'var(--text-tertiary)'],
  [/#8A8270/gi,    'var(--text-tertiary)'],
  [/#6B7280/gi,    'var(--text-tertiary)'],
  [/#9CA3AF/gi,    'var(--text-tertiary)'],
  [/#A53D3D/gi,    'var(--danger)'],
  [/#8A2E2E/gi,    'var(--danger)'],
  [/#722424/gi,    'var(--danger)'],
  [/#7A2C2C/gi,    'var(--danger)'],
  [/#7C2D12/gi,    'var(--danger)'],

  // Brand / accent
  [/#B85C38/gi,    'var(--accent)'],
  [/#D85A30/gi,    'var(--accent)'],        // tb-action-btn--orange
  [/#C5743C/gi,    'var(--accent)'],        // card--pickBg border
  [/#944526/gi,    'var(--accent-hover)'],
  [/#9A3412/gi,    'var(--accent-hover)'],
  [/#A04E11/gi,    'var(--accent-hover)'],
  [/#bf5029/gi,    'var(--accent-hover)'],  // tb-action-btn--orange hover
  [/#F4DDCF/gi,    'var(--accent-light)'],
  [/#E8B89A/gi,    'var(--accent-border)'],
  [/#6B461F/gi,    'var(--accent-ink)'],
  [/#8A5C26/gi,    'var(--accent-ink)'],
  [/#A06F2D/gi,    'var(--accent-ink)'],    // amber-brown moderate indicator

  // State
  [/#C0883A/gi,    'var(--warning)'],
  [/#E5C97D/gi,    'var(--warning)'],       // warning border (CSS — not DMC)
  [/#E5C99A/gi,    'var(--warning)'],
  [/#D49B45/gi,    'var(--warning)'],
  [/#D4A570/gi,    'var(--warning)'],
  [/#c9a227/gi,    'var(--warning)'],       // coaching banner border
  [/#4F7D3F/gi,    'var(--success)'],
  [/#3F6432/gi,    'var(--success)'],
  [/#5C8E4A/gi,    'var(--success)'],       // session chip progress
  [/#88B077/gi,    'var(--success)'],
  [/#DEE7D2/gi,    'var(--success-soft)'],
  [/#F2E2BE/gi,    'var(--warning-soft)'],
  [/#fefce8/gi,    'var(--warning-soft)'],  // coaching banner bg (Tailwind yellow-50)
  [/#FAF5E1/gi,    'var(--warning-soft)'],  // warm amber — OK in CSS (not DMC context)
  [/#F8EFD8/gi,    'var(--warning-soft)'],
  [/#FCEFEF/gi,    'var(--danger-soft)'],
  [/#F1D2D2/gi,    'var(--danger-soft)'],
  [/#ECC8C8/gi,    'var(--danger-soft)'],
  [/#fce7f3/gi,    'var(--danger-soft)'],   // off-brand pink (in-progress badge)

  // Surfaces / borders
  [/#E5DCCB/gi,    'var(--border)'],
  [/#CFC4AC/gi,    'var(--border)'],
  [/#e5e7eb/gi,    'var(--border)'],        // Tailwind gray-200 divider
  [/#EFE7D6/gi,    'var(--surface-tertiary)'],
  [/#FBF8F3/gi,    'var(--surface-secondary)'],
  [/#FAF9F7/gi,    'var(--surface-secondary)'],
  [/#F5F5F5/gi,    'var(--surface-secondary)'],
  [/#FAFAFA/gi,    'var(--surface-secondary)'],

  // Off-brand blues/purples → brand equivalents
  [/#3B82F6/gi,    'var(--accent)'],
  [/#1d4ed8/gi,    'var(--accent)'],
  [/#1e40af/gi,    'var(--accent)'],
  [/#0284c7/gi,    'var(--accent)'],
  [/#0369A1/gi,    'var(--accent)'],
  [/#dbeafe/gi,    'var(--accent-light)'],  // Tailwind blue-100
  [/#e0f2fe/gi,    'var(--accent-light)'],  // Tailwind sky-100
  [/#eff6ff/gi,    'var(--surface-secondary)'],

  // Neutral grays that map to tokens
  [/#ccc\b/gi,     'var(--border)'],        // placeholder swatch bg
  [/#E6EDD9/gi,    'var(--success-soft)'],  // session chip success bg

  // White — standalone property values only (not inside rgba/mask)
  // We use exact patterns with surrounding CSS syntax context.
  // Simple: replace '#fff' and '#ffffff' as property values.
  // The regex checks they're followed by ; or } or whitespace (end of value).
  [/#fff(?=[;\s}])/gi,     'var(--surface)'],
  [/#FFF(?=[;\s}])/gi,     'var(--surface)'],
  [/#ffffff(?=[;\s}])/gi,  'var(--surface)'],
  [/#FFFFFF(?=[;\s}])/gi,  'var(--surface)'],
];

// ─────────────────────────────────────────────────────────────────────────────
// PLACEHOLDER SYSTEM — protect var(--token, #fallback) and rgba(#...)
// ─────────────────────────────────────────────────────────────────────────────
// We temporarily replace fallback hex values inside var() with a placeholder
// so they don't get caught by the colour map.
function protect(src) {
  // var(--anything, #hexhex) — protect the fallback
  return src.replace(/var\(--[^,)]+,\s*(#[0-9A-Fa-f]{3,6})\)/g, (m, hex) => {
    return m.replace(hex, '\x00HEX' + hex.slice(1) + '\x00');
  });
}
function unprotect(src) {
  return src.replace(/\x00HEX([0-9A-Fa-f]{3,6})\x00/g, '#$1');
}

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS
// ─────────────────────────────────────────────────────────────────────────────
const file = 'styles.css';
const original = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const lines = original.split('\n');
let replacements = 0;

const out = lines.map(line => {
  if (SKIP_LINE.test(line)) return line;

  // Protect var() fallbacks on this line
  let l = protect(line);

  COLOUR_MAP.forEach(([pat, rep]) => {
    const before = l;
    l = l.replace(pat, rep);
    if (l !== before) replacements++;
  });

  return unprotect(l);
});

const processed = out.join('\n');

if (processed !== original) {
  fs.writeFileSync(file, processed.replace(/\n/g, '\r\n'));
  console.log(`✓ styles.css — ~${replacements} token refs inserted`);
} else {
  console.log('- styles.css (no changes)');
}
