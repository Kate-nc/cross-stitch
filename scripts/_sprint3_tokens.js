/**
 * Sprint 3 — Token compliance pass on all remaining files.
 *
 * Rules:
 *  - For canvas-context files (stats-page, stats-showcase, tracker-app,
 *    embroidery, helpers): any line containing fillStyle=/strokeStyle=/
 *    shadowColor= is left completely untouched to preserve raw hex values
 *    that the Canvas 2D API requires.
 *  - For all other files: apply replacements globally.
 *  - Font sizes and spacing replacements are applied only in React style
 *    objects (numeric fontSize / gap / margin values), identical to Sprint 2.
 */
const fs = require('fs');

// ─────────────────────────────────────────────────────────────────────────────
// TOKEN MAP
// ─────────────────────────────────────────────────────────────────────────────
const COLOUR_MAP = [
  // Text
  [/#1B1814/gi,    'var(--text-primary)'],
  [/#0F172A/gi,    'var(--text-primary)'],   // Tailwind slate-900 → primary text
  [/#5C5448/gi,    'var(--text-secondary)'],
  [/#A89E89/gi,    'var(--text-tertiary)'],
  [/#8A8270/gi,    'var(--text-tertiary)'],
  [/#6B7280/gi,    'var(--text-tertiary)'],   // Tailwind gray-500 → tertiary
  [/#9CA3AF/gi,    'var(--text-tertiary)'],   // Tailwind gray-400 → tertiary
  [/#A53D3D/gi,    'var(--danger)'],

  // Brand
  [/#B85C38/gi,    'var(--accent)'],
  [/#944526/gi,    'var(--accent-hover)'],
  [/#9A3412/gi,    'var(--accent-hover)'],    // deep burnt sienna → accent-hover
  [/#C0883A/gi,    'var(--warning)'],
  [/#4F7D3F/gi,    'var(--success)'],
  [/#3F6432/gi,    'var(--success)'],         // deep sage → success
  [/#5E8B2D/gi,    'var(--success)'],         // mid-green → success
  [/#A04E11/gi,    'var(--accent-hover)'],    // deep orange-brown → accent-hover
  [/#F4DDCF/gi,    'var(--accent-light)'],
  [/#E8B89A/gi,    'var(--accent-border)'],
  [/#6B461F/gi,    'var(--accent-ink)'],      // dark warm brown text on accent
  [/#8A5C26/gi,    'var(--accent-ink)'],      // similar dark warm brown

  // State soft backgrounds
  [/#DEE7D2/gi,    'var(--success-soft)'],
  [/#D5E5C8/gi,    'var(--success-soft)'],    // slightly different sage
  [/#C4DCB6/gi,    'var(--success-soft)'],    // slightly different sage
  [/#F2E2BE/gi,    'var(--warning-soft)'],
  [/#FCEFEF/gi,    'var(--danger-soft)'],
  [/#F1D2D2/gi,    'var(--danger-soft)'],
  [/#ECC8C8/gi,    'var(--danger-soft)'],
  [/#8A2E2E/gi,    'var(--danger)'],          // dark danger text
  [/#722424/gi,    'var(--danger)'],          // dark danger text
  [/#7A2C2C/gi,    'var(--danger)'],          // dark danger text
  [/#7C2D12/gi,    'var(--danger)'],          // deep danger text

  // Borders / surfaces
  [/#E5DCCB/gi,    'var(--border)'],
  [/#EFE7D6/gi,    'var(--surface-tertiary)'],
  [/#FBF8F3/gi,    'var(--surface-secondary)'],
  [/#FAF9F7/gi,    'var(--surface-secondary)'],  // very light warm
  [/#F8FAFC/gi,    'var(--surface-secondary)'],  // Tailwind off-white
  [/#FAFAFA/gi,    'var(--surface-secondary)'],  // near-white
  [/#F9FAFB/gi,    'var(--surface-secondary)'],  // Tailwind gray-50
  [/#F5F5F5/gi,    'var(--surface-secondary)'],  // neutral light gray
  [/#F0F4F8/gi,    'var(--surface-secondary)'],  // very light blue-gray
  [/#E8ECF0/gi,    'var(--surface-secondary)'],  // light neutral

  // Off-brand blues / purples → brand equivalents
  [/#3B82F6/gi,    'var(--accent)'],
  [/#1D4ED8/gi,    'var(--accent)'],
  [/#0C4A6E/gi,    'var(--accent)'],
  [/#0369A1/gi,    'var(--accent)'],          // Tailwind sky-700 link colour
  [/#0284C7/gi,    'var(--accent)'],          // Tailwind sky-600 link colour
  [/#075985/gi,    'var(--accent)'],          // Tailwind sky-800
  [/#EFF6FF/gi,    'var(--surface-secondary)'],
  [/#BFDBFE/gi,    'var(--accent-light)'],
  [/#93C5FD/gi,    'var(--accent-light)'],
  [/#7DD3FC/gi,    'var(--accent-light)'],
  [/#F0F9FF/gi,    'var(--surface-secondary)'],
  [/#BAE6FD/gi,    'var(--accent-light)'],
  // Purples
  [/#7C3AED/gi,    'var(--accent)'],
  [/#6B21A8/gi,    'var(--accent)'],
  [/#A855F7/gi,    'var(--accent)'],
  [/#D8B4FE/gi,    'var(--accent-light)'],
  [/#A5B4FC/gi,    'var(--accent-light)'],
  [/#A78BFA/gi,    'var(--accent-light)'],
  [/#C4B5FD/gi,    'var(--accent-light)'],
  [/#F5F3FF/gi,    'var(--surface-secondary)'],
  [/#FAF5FF/gi,    'var(--surface-secondary)'],
  [/#FDF4FF/gi,    'var(--surface-secondary)'],
  [/#F3E8FF/gi,    'var(--surface-secondary)'],
  // Greens (off-brand for info)
  [/#065F46/gi,    'var(--success)'],
  // Yellows (off-brand) — leave (used as stash/DMC colour badges):
  // #FEF9C3, #854D0E, #F8EFD8, #FAF5E1, #E5C97D, #E5C99A, #D4A570 — intentional warm amber DMC UI

  // White — BUT only as standalone string value (not inside rgba())
  // We target both quote styles. Canvas fillStyle ="#fff" lines will be
  // protected by the per-line guard below.
  [/'#fff'/gi,     "'var(--surface)'"],
  [/"#fff"/gi,     '"var(--surface)"'],
  [/'#FFF'/gi,     "'var(--surface)'"],
  [/"#FFF"/gi,     '"var(--surface)"'],
  [/'#ffffff'/gi,  "'var(--surface)'"],
  [/"#ffffff"/gi,  '"var(--surface)"'],
  [/'#FFFFFF'/gi,  "'var(--surface)'"],
  [/"#FFFFFF"/gi,  '"var(--surface)"'],
];

const FONT_MAP = [
  [/fontSize:\s*11\b/g,  "fontSize:'var(--text-xs)'"],
  [/fontSize:\s*12\b/g,  "fontSize:'var(--text-sm)'"],
  [/fontSize:\s*13\b/g,  "fontSize:'var(--text-md)'"],
  [/fontSize:\s*14\b/g,  "fontSize:'var(--text-lg)'"],
  [/fontSize:\s*16\b/g,  "fontSize:'var(--text-xl)'"],
];

function sp(prop, val, tok) {
  return [new RegExp(`${prop}:\\s*${val}(?=[,}\\s])`, 'g'), `${prop}:'var(${tok})'`];
}
function rad(val, tok) {
  return [new RegExp(`borderRadius:\\s*${val}(?=[,}\\s])`, 'g'), `borderRadius:'var(${tok})'`];
}
const SPACING_MAP = [
  sp('gap',4,'--s-1'),sp('gap',8,'--s-2'),sp('gap',12,'--s-3'),sp('gap',16,'--s-4'),
  sp('marginTop',4,'--s-1'),sp('marginTop',8,'--s-2'),sp('marginTop',12,'--s-3'),sp('marginTop',16,'--s-4'),
  sp('marginBottom',4,'--s-1'),sp('marginBottom',8,'--s-2'),sp('marginBottom',12,'--s-3'),sp('marginBottom',16,'--s-4'),
  sp('marginLeft',4,'--s-1'),sp('marginLeft',8,'--s-2'),
  sp('marginRight',4,'--s-1'),sp('marginRight',8,'--s-2'),
  sp('padding',16,'--s-4'),
  rad(6,'--radius-sm'),rad(8,'--radius-md'),rad(10,'--radius-lg'),rad(12,'--radius-xl'),
];

const CANVAS_LINE = /(fillStyle|strokeStyle|shadowColor)\s*[=:]/;

function processFile(src, isCanvasFile) {
  const allMaps = [...COLOUR_MAP, ...FONT_MAP, ...SPACING_MAP];

  if (!isCanvasFile) {
    allMaps.forEach(([pat, rep]) => { src = src.replace(pat, rep); });
    return src;
  }

  // Canvas-file: process line by line, protecting canvas context lines
  const lines = src.split('\n');
  const out = lines.map(line => {
    if (CANVAS_LINE.test(line)) return line;
    let l = line;
    allMaps.forEach(([pat, rep]) => { l = l.replace(pat, rep); });
    return l;
  });
  return out.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// FILE LIST
// ─────────────────────────────────────────────────────────────────────────────
const CANVAS_FILES = new Set([
  'stats-page.js', 'stats-showcase.js', 'tracker-app.js',
  'helpers.js', 'embroidery.js',
]);

const FILES = [
  'home-screen.js',
  'stats-page.js', 'stats-activity.js', 'stats-insights.js', 'stats-showcase.js',
  'tracker-app.js',
  'header.js',
  'helpers.js', 'toast.js', 'command-palette.js', 'help-drawer.js',
  'coaching.js', 'home-app.js', 'embroidery.js',
  'creator/Sidebar.js', 'creator/PrepareTab.js', 'creator/ProjectTab.js',
  'creator/ExportTab.js', 'creator/LegendTab.js', 'creator/BulkAddModal.js',
  'creator/ContextMenu.js', 'creator/ConvertPaletteModal.js',
  'creator/ShoppingListModal.js', 'creator/SubstituteFromStashModal.js',
  'creator/Toast.js', 'creator/ToolStrip.js', 'creator/PatternTab.js',
];

// ─────────────────────────────────────────────────────────────────────────────
// PROCESS
// ─────────────────────────────────────────────────────────────────────────────
let totalFiles = 0, totalReplacements = 0;

FILES.forEach(f => {
  if (!fs.existsSync(f)) return;
  const original = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
  const processed = processFile(original, CANVAS_FILES.has(f));
  if (processed !== original) {
    fs.writeFileSync(f, processed.replace(/\n/g, '\r\n'));
    totalFiles++;
    // rough count
    const changed = processed.split('var(--').length - original.split('var(--').length;
    totalReplacements += changed;
    console.log('✓', f.padEnd(46), '+' + changed + ' token refs');
  } else {
    console.log('-', f);
  }
});

console.log(`\nProcessed ${totalFiles} files, ~${totalReplacements} token insertions.`);
