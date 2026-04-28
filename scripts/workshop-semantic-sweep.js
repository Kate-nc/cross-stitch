// Phase 2.5 colour migration sweep.
// Two passes:
//  1. styles.css var() migration for chrome that must flip in dark mode.
//  2. Hex-to-Workshop-hex literal sweep across .js files for semantic
//     colours (success/warning/danger). Use literals (not var()) so canvas
//     contexts keep working; var() chrome migration is targeted via pass 1.
//
// EXCLUDED: colour-utils.js, dmc-data.js, embroidery.js (palette math),
// stats-page.js (intentional viz palettes), creator/bundle.js (regenerated),
// previews/, reports/, tests/, node_modules/, .git/.

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();

// ─── Pass 1: styles.css var() migration ────────────────────────────────
const cssMap = [
  ['#0f172a', 'var(--text-primary)'],
  ['#1e293b', 'var(--text-primary)'],
  ['#334155', 'var(--text-secondary)'],
  ['#475569', 'var(--text-secondary)'],
  ['#64748b', 'var(--text-muted)'],
  ['#94a3b8', 'var(--text-tertiary)'],
  ['#cbd5e1', 'var(--border)'],
  ['#e2e8f0', 'var(--border)'],
  ['#f1f5f9', 'var(--border-subtle)'],
  ['#f8fafc', 'var(--surface-secondary)'],
  ['#f9fafb', 'var(--surface-secondary)']
];

function migrateCss(file) {
  let c = fs.readFileSync(file, 'utf8');
  const orig = c;
  for (const [hex, varExpr] of cssMap) {
    // Skip occurrences that are already inside var(--x, #...) fallbacks.
    // Match the hex when NOT preceded by ', ' inside a var() call.
    const re = new RegExp(`(?<!,\\s?)${hex.replace(/[#]/g, '\\$&')}\\b`, 'gi');
    c = c.replace(re, varExpr);
  }
  if (c !== orig) {
    fs.writeFileSync(file, c, 'utf8');
    console.log('css migrated:', path.relative(ROOT, file));
  }
}

migrateCss(path.join(ROOT, 'styles.css'));

// ─── Pass 2: hex-to-Workshop-hex literal sweep across .js files ─────────
// Map preserves perceptual semantics: stale greens → workshop sage shades,
// stale oranges → amber, stale reds → brick. Soft variants → soft-tones.
// CSS var() not used so canvas ctx.fillStyle / strokeStyle keeps working.
const hexMap = {
  // Greens → Sage family
  '#16a34a': '#4F7D3F',  // success
  '#22c55e': '#5C8E4A',
  '#15803d': '#3F6432',
  '#166534': '#3F6432',
  '#14532d': '#2E4824',
  '#65a30d': '#5E8B2D',  // lime → success-warm
  '#4ade80': '#88B077',
  '#34d399': '#88B077',
  '#10b981': '#4F7D3F',
  '#059669': '#3F6432',
  '#047857': '#3F6432',
  '#86efac': '#A8C594',  // success-border
  '#bbf7d0': '#C4DCB6',
  '#d1fae5': '#D5E5C8',
  '#dcfce7': '#DEE7D2',
  '#f0fdf4': '#DEE7D2',  // success-soft
  '#ecfdf5': '#E6EDD9',
  // Oranges/Ambers → Workshop amber
  '#f59e0b': '#C0883A',  // warning
  '#d97706': '#A06F2D',
  '#b45309': '#8A5C26',
  '#92400e': '#6B461F',
  '#fbbf24': '#D49B45',
  '#fcd34d': '#D9B055',
  '#fde68a': '#E5C97D',  // warning-border
  '#fef3c7': '#F2E2BE',  // warning-soft
  '#fffbeb': '#FAF5E1',
  '#ea580c': '#A04E11',
  '#fb923c': '#C5743C',
  '#fdba74': '#D4A570',
  '#fed7aa': '#E5C99A',
  '#ffedd5': '#F2E2BE',
  '#fff7ed': '#F8EFD8',
  '#facc15': '#C9A227',
  '#eab308': '#B59230',
  '#ca8a04': '#A06F2D',
  '#a16207': '#7A4F1F',
  // Reds → Workshop brick
  '#dc2626': '#A53D3D',  // danger
  '#b91c1c': '#8A2E2E',
  '#991b1b': '#722424',
  '#7f1d1d': '#5F1F1F',
  '#ef4444': '#B85555',
  '#f87171': '#C77878',
  '#fca5a5': '#DEAEAE',
  '#fecaca': '#ECC8C8',
  '#fee2e2': '#F1D2D2',  // danger-soft
  '#fef2f2': '#FCEFEF'
};

// Excluded files: palette math, intentional viz, auto-generated.
const exclude = new Set([
  'colour-utils.js',
  'dmc-data.js',
  'stats-page.js',
  'creator/bundle.js',
  'analysis-worker.js',
  'generate-worker.js',
  'pdf-export-worker.js',
  'embroidery.js',
  'thread-conversions.js',
  'pdf.worker.min.js',
  'assets/fontkit.umd.min.js',
  'sw.js'
]);

function shouldSkip(rel) {
  if (exclude.has(rel.replace(/\\/g, '/'))) return true;
  if (/^(node_modules|reports|previews|tests|TestUploads|videos|ui-review|scripts|\.git|assets\/fonts)/.test(rel.replace(/\\/g, '/'))) return true;
  return false;
}

function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    const rel = path.relative(ROOT, full);
    if (shouldSkip(rel)) continue;
    if (e.isDirectory()) out = out.concat(walk(full));
    else if (e.isFile() && /\.js$/i.test(e.name)) out.push(full);
  }
  return out;
}

const files = walk(ROOT);
const reEntries = Object.entries(hexMap).map(([from, to]) => [
  new RegExp(from.replace(/[#]/g, '\\$&') + '\\b', 'gi'),
  to
]);

let changedCount = 0;
for (const file of files) {
  let c = fs.readFileSync(file, 'utf8');
  const orig = c;
  for (const [re, to] of reEntries) c = c.replace(re, to);
  if (c !== orig) {
    fs.writeFileSync(file, c, 'utf8');
    changedCount++;
    console.log('js migrated:', path.relative(ROOT, file));
  }
}

console.log(`\nTotal JS files migrated: ${changedCount}`);
