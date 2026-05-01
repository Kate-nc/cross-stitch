// stats-page.js — Tier A Stats Page
// Exposes window.StatsPage as the main component.
// Uses h = React.createElement convention, compiled via Babel at runtime.

const { useState, useEffect, useMemo, useCallback, useRef } = React;
const h = React.createElement;

// ── Stats cache ──────────────────────────────────────────────────
let statsCacheVersion = 0;
window.invalidateStatsCache = function() { statsCacheVersion++; };
const _memoised = new Map();
function getCached(key, fn) {
  const cacheKey = `${statsCacheVersion}:${key}`;
  if (_memoised.has(cacheKey)) return _memoised.get(cacheKey);
  const value = fn();
  _memoised.set(cacheKey, value);
  for (const k of _memoised.keys()) if (!k.startsWith(`${statsCacheVersion}:`)) _memoised.delete(k);
  return value;
}

// ── Default visibility prefs ─────────────────────────────────────
const DEFAULT_STATS_VISIBILITY = {
  lifetimeStitches: true,
  activeProjects: true,
  finishedThisYear: true,
  coverage: true,
  streak: true,
  pace: true,
  sableIndex: true,
  stashComposition: true,
  dmcCoverage: true,
  readyToStart: true,
  useWhatYouHave: true,
  buyingImpact: true,
  duplicateRisk: true,
  oldestWip: true,
  stashAge: true,
  mostUsedColours: true,
  threadsNeverUsed: true,
  colourFingerprint: true,
  designerLeaderboard: true,
  brandAlignment: true,
  quarterPortfolio: true,
  difficultyVsCompletion: true,
  patternSource: true
};

const SECTION_LABELS = {
  lifetimeStitches: 'Lifetime Stitches',
  activeProjects: 'Active Projects',
  finishedThisYear: 'Finished This Year',
  coverage: 'Coverage Ratio',
  streak: 'Weekly Streak',
  pace: 'Recent Pace',
  sableIndex: 'SABLE Index',
  stashComposition: 'Colour Families',
  dmcCoverage: 'DMC Palette Coverage',
  readyToStart: 'Ready to Start',
  useWhatYouHave: 'Use What You Have',
  buyingImpact: 'Buying Impact',
  duplicateRisk: 'Duplicate Alerts',
  oldestWip: 'Oldest WIPs',
  stashAge: 'Stash Age',
  mostUsedColours: 'Most-Used Colours',
  threadsNeverUsed: 'Threads Never Used',
  colourFingerprint: 'Colour Preference Fingerprint',
  designerLeaderboard: 'Designer Leaderboard',
  brandAlignment: 'Brand Alignment',
  quarterPortfolio: 'Projects per Quarter',
  difficultyVsCompletion: 'Difficulty vs Completion',
  patternSource: 'Pattern Source'
};

// ── Pref persistence ─────────────────────────────────────────────
function loadStatsVisibility() {
  try {
    const raw = localStorage.getItem('cs_stats_visibility');
    if (raw) return Object.assign({}, DEFAULT_STATS_VISIBILITY, JSON.parse(raw));
  } catch (e) {}
  return Object.assign({}, DEFAULT_STATS_VISIBILITY);
}
function saveStatsVisibility(v) {
  try { localStorage.setItem('cs_stats_visibility', JSON.stringify(v)); } catch (e) {}
}

function loadDismissedDuplicates() {
  try {
    const raw = localStorage.getItem('cs_stats_dismissed_dupes');
    if (raw) return new Set(JSON.parse(raw));
  } catch (e) {}
  return new Set();
}
function saveDismissedDuplicates(s) {
  try { localStorage.setItem('cs_stats_dismissed_dupes', JSON.stringify([...s])); } catch (e) {}
}

// fmtNum and threadKm are shared globals from helpers.js

// ── Inline SVG helpers ───────────────────────────────────────────
function SableChart({ data }) {
  if (!data || data.length < 2) return null;
  const W = 520, H = 180, PX = 40, PY = 20, PB = 25;
  const chartW = W - PX - 10, chartH = H - PY - PB;
  const maxVal = Math.max(1, ...data.map(d => d.added), ...data.map(d => d.used));
  const step = chartW / (data.length - 1);
  const toX = i => PX + i * step;
  const toY = v => PY + chartH - (v / maxVal) * chartH;
  const addedPts = data.map((d, i) => `${toX(i)},${toY(d.added)}`).join(' ');
  const usedPts = data.map((d, i) => `${toX(i)},${toY(d.used)}`).join(' ');
  // Y-axis ticks
  const ticks = [0, Math.round(maxVal / 2), Math.round(maxVal)];
  return h('svg', { viewBox: `0 0 ${W} ${H}`, style: { width: '100%', maxWidth: 520, display: 'block' }, 'aria-label': 'SABLE index chart' },
    // Grid lines
    ticks.map(t => h('line', { key: t, x1: PX, y1: toY(t), x2: W - 10, y2: toY(t), stroke: 'var(--border)', strokeWidth: 1 })),
    ticks.map(t => h('text', { key: 't' + t, x: PX - 6, y: toY(t) + 4, textAnchor: 'end', fontSize: 10, fill: 'var(--text-tertiary)' }, t)),
    // Month labels
    data.map((d, i) => i % 2 === 0 ? h('text', { key: 'l' + i, x: toX(i), y: H - 4, textAnchor: 'middle', fontSize: 9, fill: 'var(--text-tertiary)' }, d.month.slice(5)) : null),
    // Lines
    h('polyline', { points: addedPts, fill: 'none', stroke: '#f59e0b', strokeWidth: 2, strokeLinejoin: 'round' }),
    h('polyline', { points: usedPts, fill: 'none', stroke: 'var(--accent)', strokeWidth: 2, strokeLinejoin: 'round' }),
    // Legend
    h('line', { x1: PX, y1: 8, x2: PX + 16, y2: 8, stroke: '#f59e0b', strokeWidth: 2 }),
    h('text', { x: PX + 20, y: 11, fontSize: 10, fill: 'var(--text-tertiary)' }, 'Added'),
    h('line', { x1: PX + 64, y1: 8, x2: PX + 80, y2: 8, stroke: 'var(--accent)', strokeWidth: 2 }),
    h('text', { x: PX + 84, y: 11, fontSize: 10, fill: 'var(--text-tertiary)' }, 'Used')
  );
}

function HueWheel({ bins, neutral }) {
  const R = 70, CX = 90, CY = 90, IR = 35;
  const total = bins.reduce((s, b) => s + b, 0) + neutral;
  if (total === 0) return null;
  const hueColors = ['#f87171','#fb923c','#fbbf24','#a3e635','#4ade80','#34d399','#22d3ee','#38bdf8','#818cf8','var(--accent-light)','#e879f9','#fb7185'];
  const paths = [];
  let angle = -Math.PI / 2;
  for (let i = 0; i < 12; i++) {
    const pct = total > 0 ? bins[i] / total : 0;
    const sweep = pct * 2 * Math.PI;
    if (sweep < 0.001) { angle += sweep; continue; }
    const x1 = CX + R * Math.cos(angle), y1 = CY + R * Math.sin(angle);
    const x2 = CX + R * Math.cos(angle + sweep), y2 = CY + R * Math.sin(angle + sweep);
    const ix1 = CX + IR * Math.cos(angle), iy1 = CY + IR * Math.sin(angle);
    const ix2 = CX + IR * Math.cos(angle + sweep), iy2 = CY + IR * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    paths.push(h('path', { key: i, d: `M${ix1},${iy1} L${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} L${ix2},${iy2} A${IR},${IR} 0 ${large},0 ${ix1},${iy1}`, fill: hueColors[i], opacity: 0.85 }));
    angle += sweep;
  }
  return h('svg', { viewBox: '0 0 180 180', style: { width: 180, height: 180, display: 'block', margin: '0 auto' }, 'aria-label': 'Stash colour composition' },
    paths,
    neutral > 0 && h('circle', { cx: CX, cy: CY, r: IR - 4, fill: 'var(--text-tertiary)', opacity: 0.6 }),
    h('text', { x: CX, y: CY + 4, textAnchor: 'middle', fontSize:'var(--text-xs)', fill: 'var(--text-secondary)', fontWeight: 600 }, fmtNum(total)),
    h('text', { x: CX, y: CY + 16, textAnchor: 'middle', fontSize: 9, fill: 'var(--text-tertiary)' }, 'threads')
  );
}

function AgeBar({ data }) {
  const buckets = [
    { key: 'bucketUnder1Yr', label: '<1 yr', color: '#34d399' },
    { key: 'bucket1to3Yr', label: '1–3 yr', color: '#38bdf8' },
    { key: 'bucket3to5Yr', label: '3–5 yr', color: '#818cf8' },
    { key: 'bucketOver5Yr', label: '5+ yr', color: '#f472b6' },
    { key: 'legacy', label: 'Before tracking', color: 'var(--text-tertiary)' }
  ];
  const total = buckets.reduce((s, b) => s + (data[b.key] || 0), 0);
  if (total === 0) return null;
  return h('div', null,
    h('div', { style: { display: 'flex', borderRadius:'var(--radius-sm)', overflow: 'hidden', height: 24, marginBottom:'var(--s-2)' } },
      buckets.map(b => {
        const pct = (data[b.key] || 0) / total * 100;
        if (pct === 0) return null;
        return h('div', { key: b.key, style: { width: pct + '%', background: b.color, minWidth: pct > 3 ? 'auto' : 2 }, title: `${b.label}: ${data[b.key]}` });
      })
    ),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize:'var(--text-xs)', color: 'var(--text-secondary)' } },
      buckets.filter(b => data[b.key] > 0).map(b =>
        h('span', { key: b.key, style: { display: 'flex', alignItems: 'center', gap:'var(--s-1)' } },
          h('span', { style: { width: 8, height: 8, borderRadius: 2, background: b.color, display: 'inline-block' } }),
          b.label + ': ' + data[b.key]
        )
      )
    )
  );
}

// ── Colour family classification ─────────────────────────────────
// Used by ColourFamilyWheel to bin every owned thread into one of 13
// stitcher-friendly families (Reds → Metallics → Greys → Whites → Blacks).
// Inputs: { lab: [L, a, b], rgb: [r, g, b], name: string }
function classifyColourFamily(info) {
  const lab = info.lab;
  const rgb = info.rgb || [128, 128, 128];
  const name = (info.name || '').toLowerCase();
  // Metallics first — name-based; DMC names them "Light Effects"/"Jewel Effects"
  if (/metalli|effect|jewel|gold|silver|copper|bronze|pearl|fluor/i.test(name)) return 'metallics';
  if (!lab) return 'greys';
  const L = lab[0], a = lab[1], b = lab[2];
  const chroma = Math.sqrt(a * a + b * b);
  if (L >= 92 && chroma < 14) return 'whites';
  if (L <= 18 && chroma < 14) return 'blacks';
  if (chroma < 10) return 'greys';
  // Brown band: warm hue (a>0, b>0) + low–mid lightness + low–mid chroma
  if (a > 6 && b > 6 && L < 60 && chroma < 38) return 'browns';
  const hue = ((Math.atan2(b, a) * 180 / Math.PI) + 360) % 360;
  if (hue >= 340 || hue < 12)  return 'reds';
  if (hue < 30)                 return 'pinks';
  if (hue < 55)                 return 'oranges';
  if (hue < 75)                 return 'yellows';
  if (hue < 165)                return 'greens';
  if (hue < 200)                return 'teals';
  if (hue < 260)                return 'blues';
  if (hue < 320)                return 'purples';
  return 'pinks';
}
const COLOUR_FAMILY_DEFS = [
  { key: 'reds',      label: 'Reds',      swatch: '#dc2626' },
  { key: 'pinks',     label: 'Pinks',     swatch: '#ec4899' },
  { key: 'oranges',   label: 'Oranges',   swatch: '#f97316' },
  { key: 'yellows',   label: 'Yellows',   swatch: '#eab308' },
  { key: 'greens',    label: 'Greens',    swatch: '#16a34a' },
  { key: 'teals',     label: 'Teals',     swatch: '#0d9488' },
  { key: 'blues',     label: 'Blues',     swatch: '#2563eb' },
  { key: 'purples',   label: 'Purples',   swatch: '#7c3aed' },
  { key: 'browns',    label: 'Browns',    swatch: '#92400e' },
  { key: 'greys',     label: 'Greys',     swatch: '#9ca3af' },
  { key: 'whites',    label: 'Whites',    swatch: '#f5f5f4' },
  { key: 'blacks',    label: 'Blacks',    swatch: '#1c1917' },
  { key: 'metallics', label: 'Metallics', swatch: 'linear-gradient(135deg,#d4af37,#a8a29e)' }
];

function ColourFamilyWheel({ counts }) {
  const R = 78, CX = 96, CY = 96, IR = 38;
  const total = COLOUR_FAMILY_DEFS.reduce((s, f) => s + (counts[f.key] || 0), 0);
  if (total === 0) return null;
  const paths = []; let angle = -Math.PI / 2;
  COLOUR_FAMILY_DEFS.forEach((f, i) => {
    const c = counts[f.key] || 0;
    if (c === 0) return;
    const sweep = (c / total) * 2 * Math.PI;
    const x1 = CX + R * Math.cos(angle), y1 = CY + R * Math.sin(angle);
    const x2 = CX + R * Math.cos(angle + sweep), y2 = CY + R * Math.sin(angle + sweep);
    const ix1 = CX + IR * Math.cos(angle), iy1 = CY + IR * Math.sin(angle);
    const ix2 = CX + IR * Math.cos(angle + sweep), iy2 = CY + IR * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const fill = f.swatch.startsWith('linear-gradient') ? 'url(#metallic-grad)' : f.swatch;
    paths.push(h('path', { key: f.key, d: `M${ix1},${iy1} L${x1},${y1} A${R},${R} 0 ${large},1 ${x2},${y2} L${ix2},${iy2} A${IR},${IR} 0 ${large},0 ${ix1},${iy1}`, fill, opacity: 0.9 }));
    angle += sweep;
  });
  return h('div', null,
    h('svg', { viewBox: '0 0 192 192', style: { width: 180, height: 180, display: 'block', margin: '0 auto' }, 'aria-label': 'Stash colour families' },
      h('defs', null,
        h('linearGradient', { id: 'metallic-grad', x1: '0%', y1: '0%', x2: '100%', y2: '100%' },
          h('stop', { offset: '0%', stopColor: '#d4af37' }), h('stop', { offset: '100%', stopColor: '#a8a29e' })
        )
      ),
      paths,
      h('text', { x: CX, y: CY + 4, textAnchor: 'middle', fontSize: 16, fontWeight: 700, fill: 'var(--text-primary)' }, fmtNum(total)),
      h('text', { x: CX, y: CY + 20, textAnchor: 'middle', fontSize: 9, fill: 'var(--text-tertiary)' }, 'threads')
    ),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '4px 10px', marginTop: 10, justifyContent: 'center', fontSize: 11, color: 'var(--text-secondary)' } },
      COLOUR_FAMILY_DEFS.filter(f => (counts[f.key] || 0) > 0)
        .sort((a, b) => (counts[b.key] || 0) - (counts[a.key] || 0))
        .map(f => h('span', { key: f.key, style: { display: 'inline-flex', alignItems: 'center', gap: 4 } },
          h('span', { style: { width: 9, height: 9, borderRadius: '50%', background: f.swatch, border: f.key === 'whites' ? '1px solid var(--border)' : 'none', display: 'inline-block' } }),
          f.label, ' ', h('span', { style: { color: 'var(--text-tertiary)' } }, counts[f.key])
        ))
    )
  );
}

// Radial gauge (semi-circle) for percentage values, e.g. DMC palette coverage.
function RadialGauge({ pct, label, sublabel, color }) {
  const W = 200, H = 120, R = 80, CX = W / 2, CY = H - 8, SW = 14;
  const safePct = Math.max(0, Math.min(100, pct || 0));
  const startA = Math.PI, endA = startA + (safePct / 100) * Math.PI;
  const x1 = CX + R * Math.cos(startA), y1 = CY + R * Math.sin(startA);
  const x2 = CX + R * Math.cos(endA),   y2 = CY + R * Math.sin(endA);
  const large = safePct > 50 ? 1 : 0;
  const ringColor = color || 'var(--accent)';
  return h('svg', { viewBox: `0 0 ${W} ${H}`, style: { width: '100%', maxWidth: 220, display: 'block', margin: '0 auto' }, 'aria-label': label || 'Gauge' },
    // Background arc
    h('path', { d: `M ${CX - R} ${CY} A ${R} ${R} 0 0 1 ${CX + R} ${CY}`, fill: 'none', stroke: 'var(--border)', strokeWidth: SW, strokeLinecap: 'round' }),
    // Foreground arc (only render if there's any progress)
    safePct > 0 && h('path', { d: `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2}`, fill: 'none', stroke: ringColor, strokeWidth: SW, strokeLinecap: 'round' }),
    // Centre label
    h('text', { x: CX, y: CY - 22, textAnchor: 'middle', fontSize: 28, fontWeight: 700, fill: 'var(--text-primary)' }, Math.round(safePct) + '%'),
    sublabel && h('text', { x: CX, y: CY - 6, textAnchor: 'middle', fontSize: 11, fill: 'var(--text-tertiary)' }, sublabel)
  );
}

// Quarter portfolio stacked area: started/finished/active per quarter.
// data: [{ q: '2024 Q1', started: n, finished: n, active: n }, ...]
function QuarterAreaChart({ data }) {
  if (!data || data.length === 0) return null;
  const W = 520, H = 150, PAD = { top: 14, right: 8, bottom: 30, left: 28 };
  const IW = W - PAD.left - PAD.right, IH = H - PAD.top - PAD.bottom;
  const max = Math.max(1, ...data.map(d => d.started + d.finished));
  const bw = IW / data.length;
  return h('svg', { viewBox: `0 0 ${W} ${H}`, style: { width: '100%', maxWidth: W, display: 'block' }, role: 'img', 'aria-label': 'Projects per quarter' },
    [0.5, 1].map(f => h('line', { key: f, x1: PAD.left, x2: W - PAD.right, y1: PAD.top + IH * (1 - f), y2: PAD.top + IH * (1 - f), stroke: 'var(--border)', strokeWidth: 1 })),
    data.map((d, i) => {
      const x = PAD.left + i * bw + 2;
      const w = bw - 4;
      const sH = (d.started / max) * IH;
      const fH = (d.finished / max) * IH;
      const sY = PAD.top + IH - sH;
      const fY = sY - fH;
      return h('g', { key: i },
        d.started > 0 && h('rect', { x, y: sY, width: w, height: sH, fill: 'var(--accent)', opacity: 0.85 }),
        d.finished > 0 && h('rect', { x, y: fY, width: w, height: fH, fill: '#34d399', opacity: 0.9 }),
        i % Math.max(1, Math.ceil(data.length / 8)) === 0 && h('text', { x: x + w / 2, y: H - 8, textAnchor: 'middle', fontSize: 9, fill: 'var(--text-tertiary)' }, d.q)
      );
    }),
    // Legend
    h('rect', { x: PAD.left, y: 2, width: 8, height: 8, fill: 'var(--accent)' }),
    h('text', { x: PAD.left + 12, y: 9, fontSize: 10, fill: 'var(--text-tertiary)' }, 'Started'),
    h('rect', { x: PAD.left + 60, y: 2, width: 8, height: 8, fill: '#34d399' }),
    h('text', { x: PAD.left + 72, y: 9, fontSize: 10, fill: 'var(--text-tertiary)' }, 'Finished')
  );
}

// Difficulty vs completion scatter. points: [{ difficulty: 1-4, pct: 0-100, name, finished: bool }]
function DifficultyScatter({ points }) {
  if (!points || points.length === 0) return null;
  const W = 480, H = 200, PAD = { top: 12, right: 12, bottom: 32, left: 32 };
  const IW = W - PAD.left - PAD.right, IH = H - PAD.top - PAD.bottom;
  const labels = ['Beg', 'Int', 'Adv', 'Exp'];
  return h('svg', { viewBox: `0 0 ${W} ${H}`, style: { width: '100%', maxWidth: W, display: 'block' }, role: 'img', 'aria-label': 'Difficulty vs completion percentage scatter' },
    [0, 25, 50, 75, 100].map(t => h('g', { key: t },
      h('line', { x1: PAD.left, x2: W - PAD.right, y1: PAD.top + IH * (1 - t / 100), y2: PAD.top + IH * (1 - t / 100), stroke: 'var(--border)', strokeWidth: 0.5 }),
      h('text', { x: PAD.left - 4, y: PAD.top + IH * (1 - t / 100) + 3, textAnchor: 'end', fontSize: 9, fill: 'var(--text-tertiary)' }, t + '%')
    )),
    labels.map((l, i) => h('text', { key: l, x: PAD.left + (IW / 4) * (i + 0.5), y: H - 12, textAnchor: 'middle', fontSize: 10, fill: 'var(--text-tertiary)' }, l)),
    points.map((p, i) => {
      const cx = PAD.left + ((p.difficulty - 0.5) / 4) * IW + (((i * 13) % 11) - 5);
      const cy = PAD.top + IH * (1 - (p.pct || 0) / 100);
      return h('circle', { key: i, cx, cy, r: 5, fill: p.finished ? '#34d399' : 'var(--accent)', opacity: 0.75, stroke: 'var(--surface)', strokeWidth: 1 },
        h('title', null, (p.name || 'Untitled') + ' — ' + (p.pct || 0) + '%' + (p.finished ? ' (finished)' : ''))
      );
    }),
    h('text', { x: W - PAD.right, y: H - 2, textAnchor: 'end', fontSize: 9, fill: 'var(--text-tertiary)' }, 'difficulty')
  );
}

// Horizontal divergence bar: top owned vs top used colour overlap.
function FingerprintBar({ jaccardPct, overUsed, underUsed }) {
  const safePct = Math.max(0, Math.min(100, jaccardPct || 0));
  return h('div', null,
    h('div', { style: { display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 } },
      h('span', { style: { fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' } }, Math.round(safePct) + '%'),
      h('span', { style: { fontSize: 12, color: 'var(--text-secondary)' } }, 'overlap between what you own and what you use')
    ),
    h('div', { style: { height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden', marginBottom: 10 } },
      h('div', { style: { width: safePct + '%', height: '100%', background: 'linear-gradient(90deg, #34d399, var(--accent))' } })
    )
  );
}

// ── Thread swatch ────────────────────────────────────────────────
function Swatch({ rgb, size }) {
  const s = size || 20;
  const col = rgb ? `rgb(${rgb[0]},${rgb[1]},${rgb[2]})` : '#ccc';
  return h('span', { style: { display: 'inline-block', width: s, height: s, borderRadius: 3, background: col, border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 } });
}

// ── Card wrapper ─────────────────────────────────────────────────
function StatCard({ title, children, id, onClick, style }) {
  return h('div', { className: 'gsd-metric', id: id, onClick: onClick, style: Object.assign({ textAlign: 'left', cursor: onClick ? 'pointer' : 'default' }, style || {}) },
    title && h('div', { className: 'gsd-metric-label', style: { textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 6 } }, title),
    children
  );
}

// ── Customise modal ──────────────────────────────────────────────
function CustomiseModal({ visibility, onChange, onClose }) {
  if (window.useEscape) window.useEscape(onClose); else useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  return h('div', { className: 'modal-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'stats-settings-title', onClick: onClose },
    h('div', { className: 'modal-content', onClick: e => e.stopPropagation(), style: { maxWidth: 400, maxHeight: '80vh', overflowY: 'auto' } },
      h('button', { className: 'modal-close', onClick: onClose, 'aria-label': 'Close' }, '×'),
      h('h3', { id: 'stats-settings-title', style: { marginTop: 0, marginBottom:'var(--s-3)', fontSize: 18, color: 'var(--text-primary)' } }, 'Customise Stats'),
      h('p', { style: { fontSize:'var(--text-md)', color: 'var(--text-secondary)', marginBottom:'var(--s-4)' } }, 'Show or hide sections on your stats page.'),
      Object.entries(SECTION_LABELS).map(([key, label]) =>
        h('label', { key, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize:'var(--text-lg)' } },
          h('input', { type: 'checkbox', checked: visibility[key] !== false, onChange: () => {
            const next = Object.assign({}, visibility, { [key]: !visibility[key] });
            onChange(next);
          }}),
          label
        )
      )
    )
  );
}

// ── Share Card Modal ─────────────────────────────────────────────
function ShareCardModal({ lifetimeStitches, onClose }) {
  const canvasRef = useRef(null);
  const [rendered, setRendered] = useState(false);

  if (window.useEscape) window.useEscape(onClose); else useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const draw = () => {
      const ctx = canvas.getContext('2d');
      const W = 1080, H = 1080;
      canvas.width = W; canvas.height = H;
      // Background
      ctx.fillStyle = '#faf9f7';
      ctx.fillRect(0, 0, W, H);
      // Decorative border
      ctx.strokeStyle = '#B85C38';
      ctx.lineWidth = 6;
      ctx.strokeRect(40, 40, W - 80, H - 80);
      // Inner decorative cross-stitch pattern
      ctx.fillStyle = '#E5DCCB';
      for (let x = 80; x < W - 80; x += 30) {
        ctx.fillRect(x, 70, 4, 4);
        ctx.fillRect(x, H - 74, 4, 4);
      }
      // Title
      ctx.fillStyle = '#8A8270';
      ctx.font = '600 32px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('LIFETIME STITCHES', W / 2, 280);
      // Main number
      ctx.fillStyle = '#1B1814';
      ctx.font = '800 120px Inter, system-ui, sans-serif';
      ctx.fillText(fmtNum(lifetimeStitches), W / 2, 480);
      // Thread length
      const km = threadKm(lifetimeStitches);
      ctx.fillStyle = '#B85C38';
      ctx.font = '500 36px Inter, system-ui, sans-serif';
      ctx.fillText(`≈ ${km} km of thread`, W / 2, 560);
      // Cross-stitch icon area
      ctx.fillStyle = '#E5DCCB';
      const cx = W / 2, cy = 680;
      for (let i = -3; i <= 3; i++) {
        for (let j = -1; j <= 1; j++) {
          ctx.fillRect(cx + i * 22 - 8, cy + j * 22 - 8, 16, 16);
        }
      }
      ctx.fillStyle = '#B85C38';
      ctx.fillRect(cx - 8, cy - 8, 16, 16);
      // Watermark
      ctx.fillStyle = '#A89E89';
      ctx.font = '400 20px Inter, system-ui, sans-serif';
      ctx.fillText('Cross Stitch Pattern Generator', W / 2, H - 100);
      setRendered(true);
    };
    // Ensure font is loaded
    if (document.fonts && document.fonts.load) {
      document.fonts.load('120px Inter').then(draw).catch(draw);
    } else {
      draw();
    }
  }, [lifetimeStitches]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'lifetime-stitches.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  }, []);

  const handleCopy = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch (e) {
      console.warn('Copy to clipboard failed:', e);
    }
  }, []);

  return h('div', { className: 'modal-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'share-stats-title', onClick: onClose },
    h('div', { className: 'modal-content', onClick: e => e.stopPropagation(), style: { maxWidth: 480, textAlign: 'center' } },
      h('button', { className: 'modal-close', onClick: onClose, 'aria-label': 'Close' }, '×'),
      h('h3', { id: 'share-stats-title', style: { marginTop: 0, marginBottom:'var(--s-3)', fontSize: 18, color: 'var(--text-primary)' } }, 'Share Your Stats'),
      h('canvas', { ref: canvasRef, style: { width: '100%', maxWidth: 360, borderRadius:'var(--radius-md)', border: '1px solid var(--border)', marginBottom:'var(--s-3)' } }),
      rendered && h('div', { style: { display: 'flex', gap:'var(--s-2)', justifyContent: 'center' } },
        h('button', { onClick: handleDownload, style: { padding: '8px 16px', background: 'var(--accent)', color: 'var(--surface)', border: 'none', borderRadius: 'var(--radius-md)', fontSize:'var(--text-md)', fontWeight: 600, cursor: 'pointer' } }, 'Download PNG'),
        h('button', { onClick: handleCopy, style: { padding: '8px 16px', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize:'var(--text-md)', fontWeight: 600, cursor: 'pointer' } }, 'Copy to Clipboard')
      )
    )
  );
}

// ── Stats Showcase helpers ────────────────────────────────────────
const LEGACY_EPOCH = '2020-01-01T00:00:00Z';
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
const BANNER_DISMISSED_KEY = 'showcase_tracking_banner_v1';

function fmtMonthShort(yyyyMm) {
  const [y, m] = yyyyMm.split('-');
  return new Date(+y, +m - 1, 1).toLocaleString('default', { month: 'short' });
}
function daysBetween(dateA, dateB) { return Math.floor((dateB - dateA) / 86400000); }
function fmtDaysSince(dateStr) {
  const days = daysBetween(new Date(dateStr).getTime(), Date.now());
  if (days < 1) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  if (days < 31) return `${Math.floor(days / 7)} week${Math.floor(days / 7) === 1 ? '' : 's'} ago`;
  if (days < 365) return `${Math.floor(days / 30)} month${Math.floor(days / 30) === 1 ? '' : 's'} ago`;
  return `${Math.floor(days / 365)} year${Math.floor(days / 365) === 1 ? '' : 's'} ago`;
}
function fmtDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('default', { month: 'long', year: 'numeric' });
}
function isBannerDismissed() { try { return localStorage.getItem(BANNER_DISMISSED_KEY) === '1'; } catch(e) { return false; } }
function persistBannerDismissed() { try { localStorage.setItem(BANNER_DISMISSED_KEY, '1'); } catch(e) {} }
function isEarlyUser(stash) {
  let earliest = null;
  for (const entry of Object.values(stash)) {
    if (entry.addedAt && entry.addedAt !== LEGACY_EPOCH) {
      if (!earliest || entry.addedAt < earliest) earliest = entry.addedAt;
    }
  }
  if (!earliest) return true;
  return (Date.now() - new Date(earliest).getTime()) < THREE_MONTHS_MS;
}
function hasMeaningfulAgeData(ad) {
  return ((ad.bucketUnder1Yr || 0) + (ad.bucket1to3Yr || 0) + (ad.bucket3to5Yr || 0) + (ad.bucketOver5Yr || 0)) > 0;
}
function sableSentence(sableData) {
  if (!sableData || sableData.length < 3) return null;
  const totalAdded = sableData.reduce((s, d) => s + d.added, 0);
  const totalUsed = sableData.reduce((s, d) => s + d.used, 0);
  if (totalUsed === 0 && totalAdded === 0) return null;
  const ratio = totalUsed > 0 ? totalAdded / totalUsed : totalAdded > 0 ? Infinity : 1;
  if (!isFinite(ratio) || ratio > 1.5)
    return `You're adding thread ${isFinite(ratio) ? Math.round(ratio * 10) / 10 + '\xd7' : 'much'} faster than you're using it.`;
  if (ratio >= 0.8) return 'Your stash is beautifully balanced \u2014 adding and using in equal measure.';
  return "You're making real progress through your stash.";
}

function SableLineChart({ data }) {
  if (!data || data.length < 2) return null;
  const W = 600, H = 160, PAD = { top: 16, right: 12, bottom: 32, left: 36 };
  const IW = W - PAD.left - PAD.right, IH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...data.map(d => Math.max(d.added, d.used)), 1);
  function sx(i) { return PAD.left + (i / (data.length - 1)) * IW; }
  function sy(v) { return PAD.top + IH - (v / maxVal) * IH; }
  const addedPts = data.map((d, i) => `${sx(i)},${sy(d.added)}`).join(' ');
  const usedPts = data.map((d, i) => `${sx(i)},${sy(d.used)}`).join(' ');
  const labels = data.map((d, i) => {
    if (i % 2 !== 0 && i !== data.length - 1) return null;
    return h('text', { key: i, x: sx(i), y: H - 4, textAnchor: 'middle', fontSize: 10, fill: 'var(--text-tertiary)' }, fmtMonthShort(d.month));
  });
  return h('div', { style: { marginTop:'var(--s-4)' } },
    h('svg', { viewBox: `0 0 ${W} ${H}`, style: { width: '100%', maxWidth: W, display: 'block' }, role: 'img', 'aria-label': `Thread acquisition and usage over ${data.length} months` },
      [0.25, 0.5, 0.75, 1].map(f => h('line', { key: f, x1: PAD.left, x2: W - PAD.right, y1: PAD.top + IH * (1 - f), y2: PAD.top + IH * (1 - f), stroke: 'var(--border)', strokeWidth: 1 })),
      h('polyline', { points: addedPts, fill: 'none', stroke: 'var(--accent)', strokeWidth: 2.5, strokeLinejoin: 'round', strokeLinecap: 'round' }),
      h('polyline', { points: usedPts, fill: 'none', stroke: '#6ee7b7', strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round', strokeDasharray: '5 3' }),
      data.map((d, i) => h('circle', { key: 'a' + i, cx: sx(i), cy: sy(d.added), r: 3, fill: 'var(--accent)' })),
      data.map((d, i) => d.used > 0 && h('circle', { key: 'u' + i, cx: sx(i), cy: sy(d.used), r: 2.5, fill: '#6ee7b7' })),
      ...labels
    ),
    h('div', { style: { display: 'flex', gap: 20, marginTop: 6, fontSize:'var(--text-xs)', color: 'var(--text-tertiary)' } },
      h('span', { style: { display: 'flex', alignItems: 'center', gap: 5 } }, h('span', { style: { display: 'inline-block', width: 20, height: 2.5, background: 'var(--accent)', borderRadius: 2 } }), 'Added'),
      h('span', { style: { display: 'flex', alignItems: 'center', gap: 5 } }, h('span', { style: { display: 'inline-block', width: 20, height: 2, background: '#6ee7b7', borderRadius: 2 } }), 'Used')
    )
  );
}

function ShowcaseAgeBar({ ageData: ad }) {
  const buckets = [
    { key: 'bucketUnder1Yr', label: '<1 yr', color: '#34d399' },
    { key: 'bucket1to3Yr',   label: '1\u20133 yr', color: '#38bdf8' },
    { key: 'bucket3to5Yr',   label: '3\u20135 yr', color: '#818cf8' },
    { key: 'bucketOver5Yr',  label: '5+ yr',  color: 'var(--accent-light)' },
  ];
  const total = buckets.reduce((s, b) => s + (ad[b.key] || 0), 0);
  if (total === 0) return null;
  const ariaText = buckets.map(b => `${Math.round((ad[b.key] || 0) / total * 100)}% ${b.label}`).join(', ');
  return h('div', null,
    h('div', { style: { display: 'flex', borderRadius:'var(--radius-md)', overflow: 'hidden', height: 28 }, role: 'img', 'aria-label': `Stash age distribution: ${ariaText}` },
      buckets.map(b => {
        const pct = (ad[b.key] || 0) / total * 100;
        if (pct === 0) return null;
        return h('div', { key: b.key, style: { width: pct + '%', background: b.color }, title: `${b.label}: ${ad[b.key]}` });
      })
    ),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px 20px', marginTop: 10, fontSize:'var(--text-sm)', color: 'var(--text-tertiary)' } },
      buckets.filter(b => (ad[b.key] || 0) > 0).map(b => {
        const pct = Math.round((ad[b.key] || 0) / total * 100);
        return h('span', { key: b.key, style: { display: 'flex', alignItems: 'center', gap: 5 } },
          h('span', { style: { width: 10, height: 10, borderRadius: 2, background: b.color, display: 'inline-block' } }),
          `${b.label} \u2014 ${pct}%`
        );
      })
    )
  );
}

function PatternChip({ pattern }) {
  return h('div', { style: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius:'var(--radius-xl)', padding: '10px 14px', minWidth: 0 } },
    h('div', { style: { fontSize:'var(--text-md)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, pattern.title || 'Untitled'),
    h('div', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)' } }, `${pattern.coveredThreads}/${pattern.totalThreads} threads ready`)
  );
}

function ShowcaseDivider() {
  return h('hr', { style: { border: 'none', borderTop: '1px solid var(--border)', opacity: 0.3, margin: '40px 0' } });
}
function ShowcaseSectionLabel({ children }) {
  return h('div', { style: { fontSize:'var(--text-xs)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10 } }, children);
}
function ShowcaseShareBtn({ onClick }) {
  return h('button', { onClick, 'aria-label': 'Share this section', title: 'Share this section', style: { background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: 'var(--text-tertiary)', fontSize:'var(--text-lg)', borderRadius:'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', gap:'var(--s-1)' } },
    h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
      h('circle', { cx: 18, cy: 5, r: 3 }), h('circle', { cx: 6, cy: 12, r: 3 }), h('circle', { cx: 18, cy: 19, r: 3 }),
      h('line', { x1: 8.59, y1: 13.51, x2: 15.42, y2: 17.49 }), h('line', { x1: 15.41, y1: 6.51, x2: 8.59, y2: 10.49 })
    )
  );
}

function ShowcaseShareModal({ title, drawFn, onClose }) {
  const canvasRef = useRef(null);
  const closeBtnRef = useRef(null);
  const [rendered, setRendered] = useState(false);
  const [copied, setCopied] = useState(false);
  if (window.useEscape) window.useEscape(onClose); else useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  useEffect(() => { if (closeBtnRef.current) closeBtnRef.current.focus(); }, []);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const go = () => { drawFn(canvas); setRendered(true); };
    if (document.fonts && document.fonts.ready) { document.fonts.ready.then(go); } else { go(); }
  }, [drawFn]);
  const handleClose = useCallback(() => onClose(), [onClose]);
  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const a = document.createElement('a');
    a.download = (title || 'share').toLowerCase().replace(/\s+/g, '-') + '.png';
    a.href = canvas.toDataURL('image/png'); a.click();
  }, [title]);
  const handleCopy = useCallback(async () => {
    const canvas = canvasRef.current; if (!canvas) return;
    try {
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true); setTimeout(() => setCopied(false), 2000);
    } catch(e) { console.warn('Copy failed:', e); }
  }, []);
  return h('div', { className: 'modal-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'share-image-title', onClick: handleClose },
    h('div', { className: 'modal-content', onClick: e => e.stopPropagation(), style: { maxWidth: 500, textAlign: 'center' } },
      h('button', { ref: closeBtnRef, className: 'modal-close', onClick: handleClose, 'aria-label': 'Close share modal' }, '\xd7'),
      h('h3', { id: 'share-image-title', style: { marginTop: 0, marginBottom:'var(--s-3)', fontSize: 18, color: 'var(--text-primary)' } }, title || 'Share'),
      h('canvas', { ref: canvasRef, style: { width: '100%', maxWidth: 420, borderRadius:'var(--radius-md)', border: '1px solid var(--border)', display: 'block', margin: '0 auto 12px' } }),
      rendered && h('div', { style: { display: 'flex', gap:'var(--s-2)', justifyContent: 'center', flexWrap: 'wrap' } },
        h('button', { onClick: handleDownload, style: { padding: '8px 18px', background: 'var(--accent)', color: 'var(--surface)', border: 'none', borderRadius: 'var(--radius-md)', fontSize:'var(--text-md)', fontWeight: 600, cursor: 'pointer' } }, 'Download PNG'),
        h('button', { onClick: handleCopy, style: { padding: '8px 18px', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize:'var(--text-md)', fontWeight: 600, cursor: 'pointer' } }, copied ? 'Copied!' : 'Copy to clipboard')
      )
    )
  );
}

// ── Canvas draw helpers (showcase share cards) ────────────────────
const CARD_BG = '#faf9f7', CARD_ACCENT = '#B85C38', CARD_TEXT_PRI = '#1B1814', CARD_TEXT_SEC = '#8A8270', CARD_BORDER = '#E5DCCB';
function drawCardBase(ctx, W, H) {
  ctx.fillStyle = CARD_BG; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = CARD_BORDER; ctx.lineWidth = 1; ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  ctx.fillStyle = '#E5DCCB';
  for (let cx = 20; cx < W - 20; cx += 22) ctx.fillRect(cx, 10, 5, 5);
}
function drawShowcaseLabel(ctx, text, x, y, size, color) {
  ctx.fillStyle = color || CARD_TEXT_SEC;
  ctx.font = `600 ${size || 14}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center'; ctx.fillText(text.toUpperCase(), x, y);
}
function drawWatermark(ctx, W, H) {
  ctx.fillStyle = '#CFC4AC'; ctx.font = '400 16px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center'; ctx.fillText('cross stitch pattern generator', W / 2, H - 20);
}
function makeLifetimeCanvas(canvas, stitches) {
  const W = 1080, H = 1080; canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawCardBase(ctx, W, H);
  drawShowcaseLabel(ctx, 'lifetime stitches', W / 2, 200, 24, CARD_TEXT_SEC);
  ctx.fillStyle = CARD_TEXT_PRI; ctx.font = '800 120px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(fmtNum(stitches), W / 2, 400);
  ctx.fillStyle = CARD_ACCENT; ctx.font = '500 36px Inter, system-ui, sans-serif';
  ctx.fillText(`\u2248 ${threadKm(stitches)} km of thread`, W / 2, 480);
  drawWatermark(ctx, W, H);
}
function makeSableCanvas(canvas, sableData, headline) {
  const W = 1080, H = 1080; canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawCardBase(ctx, W, H); drawShowcaseLabel(ctx, 'stash vs. use', W / 2, 150, 22, CARD_TEXT_SEC);
  if (headline) {
    const words = headline.split(' '); let line = '', lines = [];
    ctx.font = '500 30px Inter, system-ui, sans-serif';
    for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > 900) { lines.push(line); line = w; } else line = test; }
    if (line) lines.push(line);
    ctx.fillStyle = CARD_TEXT_PRI; lines.forEach((l, i) => ctx.fillText(l, W / 2, 220 + i * 42));
  }
  if (sableData && sableData.length >= 2) {
    const cX = 80, cY = 350, cW = W - 160, cH = 300;
    const maxV = Math.max(...sableData.map(d => Math.max(d.added, d.used)), 1);
    const px = i => cX + (i / (sableData.length - 1)) * cW;
    const py = v => cY + cH - (v / maxV) * cH;
    ctx.strokeStyle = '#E5DCCB'; ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach(f => { ctx.beginPath(); ctx.moveTo(cX, cY + cH * (1 - f)); ctx.lineTo(cX + cW, cY + cH * (1 - f)); ctx.stroke(); });
    ctx.strokeStyle = CARD_ACCENT; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath(); sableData.forEach((d, i) => i === 0 ? ctx.moveTo(px(i), py(d.added)) : ctx.lineTo(px(i), py(d.added))); ctx.stroke();
    ctx.strokeStyle = '#6ee7b7'; ctx.lineWidth = 3; ctx.setLineDash([14, 8]);
    ctx.beginPath(); sableData.forEach((d, i) => i === 0 ? ctx.moveTo(px(i), py(d.used)) : ctx.lineTo(px(i), py(d.used))); ctx.stroke(); ctx.setLineDash([]);
    sableData.forEach((d, i) => { if (i % 2 === 0 || i === sableData.length - 1) { ctx.fillStyle = CARD_TEXT_SEC; ctx.font = '400 20px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(fmtMonthShort(d.month), px(i), cY + cH + 36); } });
    ctx.fillStyle = CARD_ACCENT; ctx.fillRect(cX, cY + cH + 70, 40, 6);
    ctx.fillStyle = CARD_TEXT_SEC; ctx.font = '400 22px Inter, system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.fillText('Added', cX + 50, cY + cH + 80);
    ctx.fillStyle = '#6ee7b7'; ctx.fillRect(cX + 160, cY + cH + 70, 40, 6); ctx.fillStyle = CARD_TEXT_SEC; ctx.fillText('Used', cX + 210, cY + cH + 80);
  }
  drawWatermark(ctx, W, H);
}
function makeAgeCanvas(canvas, ageData) {
  const W = 1080, H = 1080; canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawCardBase(ctx, W, H); drawShowcaseLabel(ctx, 'stash age', W / 2, 150, 22, CARD_TEXT_SEC);
  const bkts = [{ key: 'bucketUnder1Yr', label: '<1 yr', color: '#34d399' }, { key: 'bucket1to3Yr', label: '1\u20133 yr', color: '#38bdf8' }, { key: 'bucket3to5Yr', label: '3\u20135 yr', color: '#818cf8' }, { key: 'bucketOver5Yr', label: '5+ yr', color: 'var(--accent-light)' }];
  const total = bkts.reduce((s, b) => s + (ageData[b.key] || 0), 0);
  if (total > 0) {
    const barX = 80, barY = 400, barW = W - 160, barH = 60; let bx = barX;
    bkts.forEach(b => { const w = (ageData[b.key] || 0) / total * barW; if (w > 0) { ctx.fillStyle = b.color; ctx.fillRect(bx, barY, w, barH); bx += w; } });
    let lx = barX;
    bkts.filter(b => (ageData[b.key] || 0) > 0).forEach(b => {
      ctx.fillStyle = b.color; ctx.fillRect(lx, barY + 90, 24, 24);
      ctx.fillStyle = CARD_TEXT_SEC; ctx.font = '400 24px Inter, system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`${b.label} \u2014 ${Math.round((ageData[b.key] || 0) / total * 100)}%`, lx + 34, barY + 108); lx += 220;
    });
  }
  if (ageData.oldest) { ctx.fillStyle = CARD_TEXT_SEC; ctx.font = '400 24px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`Oldest: ${ageData.oldest.name} \u00b7 in stash since ${fmtDate(ageData.oldest.addedAt)}`, W / 2, 650); }
  drawWatermark(ctx, W, H);
}
function makeOldestCanvas(canvas, wip) {
  const W = 1080, H = 1080; canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawCardBase(ctx, W, H); drawShowcaseLabel(ctx, 'your longest companion', W / 2, 200, 22, CARD_TEXT_SEC);
  ctx.fillStyle = CARD_TEXT_PRI; ctx.font = '700 64px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(wip.name || 'Untitled', W / 2, 360);
  const days = daysBetween(new Date(wip.lastTouchedAt).getTime(), Date.now());
  ctx.fillStyle = CARD_TEXT_SEC; ctx.font = '400 34px Inter, system-ui, sans-serif';
  ctx.fillText(`Together for ${days} day${days === 1 ? '' : 's'}, ${wip.pct}% of the way through`, W / 2, 450);
  drawWatermark(ctx, W, H);
}
function makeFullPageCanvas(canvas, data) {
  const { stitches, sableData, headline, readyPatterns, ageData, oldestWip } = data;
  const W = 1080, H = 1920; canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = CARD_BG; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#E5DCCB';
  for (let gx = 30; gx < W; gx += 30) for (let gy = 30; gy < H; gy += 30) ctx.fillRect(gx - 1, gy - 1, 2, 2);
  let cy = 80;
  const section = (label, draw) => {
    drawShowcaseLabel(ctx, label, W / 2, cy, 18, CARD_TEXT_SEC); cy += 30; draw(); cy += 24;
    ctx.strokeStyle = CARD_BORDER; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(80, cy); ctx.lineTo(W - 80, cy); ctx.stroke(); cy += 36;
  };
  section('lifetime stitches', () => {
    ctx.fillStyle = CARD_TEXT_PRI; ctx.font = '800 96px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(fmtNum(stitches), W / 2, cy + 90); cy += 100;
    ctx.fillStyle = CARD_ACCENT; ctx.font = '500 28px Inter, system-ui, sans-serif'; ctx.fillText(`\u2248 ${threadKm(stitches)} km of thread`, W / 2, cy + 10); cy += 20;
  });
  if (sableData && sableData.length >= 3 && headline) {
    section('stash vs. use', () => {
      const words = headline.split(' '); let line = '', lines = [];
      ctx.font = '500 24px Inter, system-ui, sans-serif';
      for (const w of words) { const test = line ? line + ' ' + w : w; if (ctx.measureText(test).width > W - 200) { lines.push(line); line = w; } else line = test; }
      if (line) lines.push(line);
      lines.forEach(l => { ctx.fillStyle = CARD_TEXT_PRI; ctx.fillText(l, W / 2, cy + 10); cy += 34; });
      if (sableData.length >= 2) {
        const cX = 80, cW = W - 160, cH = 140;
        const maxV = Math.max(...sableData.map(d => Math.max(d.added, d.used)), 1);
        const px = i => cX + (i / (sableData.length - 1)) * cW; const pyc = v => cy + cH - (v / maxV) * cH;
        ctx.strokeStyle = CARD_ACCENT; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]);
        ctx.beginPath(); sableData.forEach((d, i) => i === 0 ? ctx.moveTo(px(i), pyc(d.added)) : ctx.lineTo(px(i), pyc(d.added))); ctx.stroke();
        ctx.strokeStyle = '#6ee7b7'; ctx.lineWidth = 2; ctx.setLineDash([10, 6]);
        ctx.beginPath(); sableData.forEach((d, i) => i === 0 ? ctx.moveTo(px(i), pyc(d.used)) : ctx.lineTo(px(i), pyc(d.used))); ctx.stroke(); ctx.setLineDash([]);
        cy += cH + 20;
      }
    });
  }
  if (readyPatterns && readyPatterns.length > 0) {
    section('ready to start', () => {
      readyPatterns.slice(0, 4).forEach(p => { ctx.fillStyle = CARD_TEXT_PRI; ctx.font = '600 26px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(p.title || 'Untitled', W / 2, cy + 20); ctx.fillStyle = CARD_TEXT_SEC; ctx.font = '400 20px Inter, system-ui, sans-serif'; ctx.fillText(`${p.coveredThreads}/${p.totalThreads} threads owned`, W / 2, cy + 48); cy += 68; });
    });
  }
  if (ageData && hasMeaningfulAgeData(ageData)) {
    section('stash age', () => {
      const bkts2 = [{ key: 'bucketUnder1Yr', color: '#34d399' }, { key: 'bucket1to3Yr', color: '#38bdf8' }, { key: 'bucket3to5Yr', color: '#818cf8' }, { key: 'bucketOver5Yr', color: 'var(--accent-light)' }];
      const total = bkts2.reduce((s, b) => s + (ageData[b.key] || 0), 0);
      if (total > 0) { const barX = 80, barW = W - 160, barH = 40; let bx = barX; bkts2.forEach(b => { const bw = (ageData[b.key] || 0) / total * barW; if (bw > 0) { ctx.fillStyle = b.color; ctx.fillRect(bx, cy, bw, barH); bx += bw; } }); cy += barH + 16; }
    });
  }
  if (oldestWip) {
    section('your longest companion', () => {
      ctx.fillStyle = CARD_TEXT_PRI; ctx.font = '700 48px Inter, system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillText(oldestWip.name || 'Untitled', W / 2, cy + 40); cy += 54;
      const days = daysBetween(new Date(oldestWip.lastTouchedAt).getTime(), Date.now());
      ctx.fillStyle = CARD_TEXT_SEC; ctx.font = '400 26px Inter, system-ui, sans-serif'; ctx.fillText(`Together for ${days} days, ${oldestWip.pct}% of the way through`, W / 2, cy + 10); cy += 24;
    });
  }
  drawWatermark(ctx, W, H);
}

// ── Stats Showcase component (rendered as the third stats tab) ────
function StatsShowcase({ onNavigateToDashboard, onNavigateToActivity }) {
  const [loading, setLoading] = useState(true);
  const [lifetimeStitches, setLifetimeStitches] = useState(0);
  const [sableData, setSableData] = useState([]);
  const [readyToStart, setReadyToStart] = useState([]);
  const [ageData, setAgeData] = useState({});
  const [oldestWip, setOldestWip] = useState(null);
  const [stash, setStash] = useState({});
  const [bannerDismissed, setBannerDismissed] = useState(isBannerDismissed);
  const [shareSection, setShareSection] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (typeof StashBridge !== 'undefined' && StashBridge.migrateSchemaToV3) await StashBridge.migrateSchemaToV3();
      if (typeof ProjectStorage !== 'undefined' && ProjectStorage.migrateProjectsToV3) await ProjectStorage.migrateProjectsToV3();
      const results = await Promise.all([
        typeof ProjectStorage !== 'undefined' ? ProjectStorage.getLifetimeStitches() : 0,
        typeof StashBridge !== 'undefined' ? StashBridge.getAcquisitionTimeseries(12) : [],
        typeof ProjectStorage !== 'undefined' ? ProjectStorage.getProjectsReadyToStart() : [],
        typeof StashBridge !== 'undefined' ? StashBridge.getStashAgeDistribution() : {},
        typeof ProjectStorage !== 'undefined' ? ProjectStorage.getOldestWIP() : null,
        typeof StashBridge !== 'undefined' ? StashBridge.getGlobalStash() : {},
      ]);
      if (cancelled) return;
      setLifetimeStitches(results[0]); setSableData(results[1]); setReadyToStart(results[2]);
      setAgeData(results[3]); setOldestWip(results[4]); setStash(results[5]);
      setLoading(false);
    }
    load();
    const reloadOnChange = () => { if (!cancelled) load(); };
    window.addEventListener('cs:stashChanged', reloadOnChange);
    window.addEventListener('cs:backupRestored', reloadOnChange);
    return () => {
      cancelled = true;
      window.removeEventListener('cs:stashChanged', reloadOnChange);
      window.removeEventListener('cs:backupRestored', reloadOnChange);
    };
  }, []);

  const earlyUser = useMemo(() => isEarlyUser(stash), [stash]);
  const showBanner = earlyUser && !bannerDismissed;
  const headline = useMemo(() => sableSentence(sableData), [sableData]);
  const showSable = sableData.length >= 3 && headline !== null;
  const readyPatterns = useMemo(() => readyToStart.filter(p => p.pct >= 100).slice(0, 4), [readyToStart]);
  const showReady = readyPatterns.length > 0;
  const showAge = hasMeaningfulAgeData(ageData);
  const showOldest = oldestWip !== null;
  const handleDismissBanner = useCallback(() => { persistBannerDismissed(); setBannerDismissed(true); }, []);
  const openShare = useCallback(s => setShareSection(s), []);
  const closeShare = useCallback(() => setShareSection(null), []);
  const drawLifetime = useCallback(canvas => makeLifetimeCanvas(canvas, lifetimeStitches), [lifetimeStitches]);
  const drawSable = useCallback(canvas => makeSableCanvas(canvas, sableData, headline), [sableData, headline]);
  const drawAge = useCallback(canvas => makeAgeCanvas(canvas, ageData), [ageData]);
  const drawOldest = useCallback(canvas => makeOldestCanvas(canvas, oldestWip), [oldestWip]);
  const drawFullPage = useCallback(canvas => makeFullPageCanvas(canvas, { stitches: lifetimeStitches, sableData, headline, readyPatterns, ageData, oldestWip }), [lifetimeStitches, sableData, headline, readyPatterns, ageData, oldestWip]);

  const lnk = { fontSize:'var(--text-sm)', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600, fontFamily: 'inherit' };
  const wrap = { maxWidth: 680, margin: '0 auto', padding: '0 4px 80px' };

  if (loading) {
    return h('div', { style: Object.assign({}, wrap, { paddingTop: 40, textAlign: 'center', color: 'var(--text-tertiary)' }) },
      h('div', { style: { width: 28, height: 28, border: '2.5px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' } }),
      'Loading your showcase\u2026'
    );
  }

  return h('div', { style: wrap },
    h('div', { style: { display: 'flex', justifyContent: 'flex-end', paddingTop: 12, paddingBottom: 8, gap:'var(--s-4)' } },
      h('button', { onClick: () => openShare('page'), style: lnk }, 'Share page \u2191'),
      onNavigateToActivity && h('button', { onClick: onNavigateToActivity, style: lnk }, 'Activity \u2192'),
      onNavigateToDashboard && h('button', { onClick: onNavigateToDashboard, style: lnk }, 'Full dashboard \u2192')
    ),
    showBanner && h('div', { role: 'status', style: { background: 'var(--accent-light)', border: '1px solid var(--accent-border)', borderRadius:'var(--radius-lg)', padding: '10px 14px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap:'var(--s-3)', fontSize:'var(--text-md)', color: 'var(--accent-hover)' } },
      h('span', null, 'Tracking since ' + (function() {
        let earliest = null;
        for (const e of Object.values(stash)) { if (e.addedAt && e.addedAt !== LEGACY_EPOCH) { if (!earliest || e.addedAt < earliest) earliest = e.addedAt; } }
        return earliest ? fmtDate(earliest) : 'recently';
      })() + ' \u2014 this page will get richer as your history builds.'),
      h('button', { onClick: handleDismissBanner, style: { background: 'none', border: 'none', cursor: 'pointer', fontSize:'var(--text-xl)', color: 'var(--accent-hover)', padding: '0 4px', lineHeight: 1 }, 'aria-label': 'Dismiss banner' }, '\xd7')
    ),
    h('section', { id: 'showcase-lifetime', 'aria-labelledby': 'showcase-lifetime-heading' },
      h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' } },
        h(ShowcaseSectionLabel, null, 'Lifetime Stitches'),
        h(ShowcaseShareBtn, { onClick: () => openShare('lifetime') })
      ),
      h('div', { role: 'figure', 'aria-label': `${fmtNum(lifetimeStitches)} lifetime stitches` },
        h('h2', { id: 'showcase-lifetime-heading', style: { fontSize: 64, fontWeight: 800, margin: 0, color: 'var(--text-primary)', lineHeight: 1.05, letterSpacing: '-0.02em' } }, fmtNum(lifetimeStitches)),
        lifetimeStitches > 0
          ? h('div', null,
              h('div', { style: { fontSize: 18, color: 'var(--accent)', marginTop: 6, fontWeight: 500 } }, `\u2248 ${threadKm(lifetimeStitches)} km of thread`),
              h('div', { style: { marginTop:'var(--s-2)' } }, h('button', { onClick: () => openShare('lifetime'), style: Object.assign({}, lnk, { fontSize:'var(--text-sm)' }) }, 'Share card \u2192'))
            )
          : h('div', { style: { fontSize: 15, color: 'var(--text-secondary)', marginTop: 10, maxWidth: 420, lineHeight: 1.6 } }, 'Your stitches will count here as you mark them off \u2014 see you soon.')
      )
    ),
    showSable && h('div', null,
      h(ShowcaseDivider),
      h('section', { id: 'showcase-sable', 'aria-labelledby': 'showcase-sable-heading' },
        h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' } },
          h(ShowcaseSectionLabel, null, 'Stash vs. Use'),
          h(ShowcaseShareBtn, { onClick: () => openShare('sable') })
        ),
        h('h3', { id: 'showcase-sable-heading', style: { fontSize: 20, fontWeight: 600, margin: '0 0 6px', color: 'var(--text-primary)', lineHeight: 1.4 } }, headline),
        h(SableLineChart, { data: sableData })
      )
    ),
    !showSable && earlyUser && h('div', null,
      h(ShowcaseDivider),
      h('section', { id: 'showcase-sable', style: { color: 'var(--text-tertiary)', fontSize:'var(--text-lg)', lineHeight: 1.6 } },
        h(ShowcaseSectionLabel, null, 'Stash vs. Use'),
        "Your stash journey will chart here once there\u2019s a few months to draw from."
      )
    ),
    showReady && h('div', null,
      h(ShowcaseDivider),
      h('section', { id: 'showcase-ready', 'aria-labelledby': 'showcase-ready-heading' },
        h(ShowcaseSectionLabel, null, 'Ready to Start'),
        h('h3', { id: 'showcase-ready-heading', style: { fontSize: 18, fontWeight: 600, margin: '0 0 14px', color: 'var(--text-primary)' } }, `${readyPatterns.length} pattern${readyPatterns.length === 1 ? '' : 's'} you can begin with what you own.`),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 } },
          readyPatterns.map(p => h(PatternChip, { key: p.id, pattern: p }))
        )
      )
    ),
    showAge && h('div', null,
      h(ShowcaseDivider),
      h('section', { id: 'showcase-age', 'aria-labelledby': 'showcase-age-heading' },
        h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' } },
          h(ShowcaseSectionLabel, null, 'Stash Age'),
          h(ShowcaseShareBtn, { onClick: () => openShare('age') })
        ),
        h('h3', { id: 'showcase-age-heading', style: { fontSize: 18, fontWeight: 600, margin: '0 0 14px', color: 'var(--text-primary)' } },
          (() => { const t = (ageData.bucketUnder1Yr || 0) + (ageData.bucket1to3Yr || 0) + (ageData.bucket3to5Yr || 0) + (ageData.bucketOver5Yr || 0) + (ageData.legacy || 0); return `${fmtNum(t)} thread${t === 1 ? '' : 's'} in your stash.`; })()
        ),
        h(ShowcaseAgeBar, { ageData }),
        ageData.oldest && h('div', { style: { display: 'flex', alignItems: 'center', gap:'var(--s-2)', marginTop:'var(--s-3)', fontSize:'var(--text-md)', color: 'var(--text-secondary)' } },
          h(Swatch, { rgb: (function() { const k = ageData.oldest.id || ''; const ci = k.indexOf(':'); const br = ci >= 0 ? k.slice(0, ci) : 'dmc'; const bi = ci >= 0 ? k.slice(ci + 1) : k; const info = typeof findThreadInCatalog === 'function' ? findThreadInCatalog(br, bi) : null; return info ? info.rgb : null; })(), size: 16 }),
          h('span', null, `Oldest: ${ageData.oldest.name} \u00b7 in stash since ${fmtDate(ageData.oldest.addedAt)}`)
        )
      )
    ),
    showOldest && h('div', null,
      h(ShowcaseDivider),
      h('section', { id: 'showcase-oldest', 'aria-labelledby': 'showcase-oldest-heading' },
        h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' } },
          h(ShowcaseSectionLabel, null, 'Your Longest Companion'),
          h(ShowcaseShareBtn, { onClick: () => openShare('oldest') })
        ),
        h('h3', { id: 'showcase-oldest-heading', style: { fontSize: 28, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' } }, oldestWip.name || 'Untitled'),
        h('p', { style: { fontSize:'var(--text-xl)', color: 'var(--text-secondary)', margin: '0 0 4px', lineHeight: 1.6 } },
          (() => { const days = daysBetween(new Date(oldestWip.lastTouchedAt).getTime(), Date.now()); return `Together for ${days} day${days === 1 ? '' : 's'}, ${oldestWip.pct}% of the way through.`; })()
        ),
        oldestWip.lastTouchedAt && h('p', { style: { fontSize:'var(--text-md)', color: 'var(--text-tertiary)', margin: 0 } }, `Last worked on ${fmtDaysSince(oldestWip.lastTouchedAt)}.`)
      )
    ),
    shareSection === 'lifetime' && h(ShowcaseShareModal, { key: 'share-lifetime', title: 'Share \u2014 Lifetime Stitches', drawFn: drawLifetime, onClose: closeShare }),
    shareSection === 'sable' && showSable && h(ShowcaseShareModal, { key: 'share-sable', title: 'Share \u2014 Stash vs. Use', drawFn: drawSable, onClose: closeShare }),
    shareSection === 'age' && showAge && h(ShowcaseShareModal, { key: 'share-age', title: 'Share \u2014 Stash Age', drawFn: drawAge, onClose: closeShare }),
    shareSection === 'oldest' && showOldest && h(ShowcaseShareModal, { key: 'share-oldest', title: 'Share \u2014 Longest Companion', drawFn: drawOldest, onClose: closeShare }),
    shareSection === 'page' && h(ShowcaseShareModal, { key: 'share-page', title: 'Share \u2014 Your Showcase', drawFn: drawFullPage, onClose: closeShare })
  );
}

// ── Main StatsPage component ─────────────────────────────────────
function StatsPage({ onClose, onNavigateToProject, onNavigateToStash }) {
  // Tab: 'stitching' | 'stash' | 'showcase' | 'activity' | 'insights'
  const initialTab = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    const t = p.get('tab');
    if (t === 'stash') return 'stash';
    if (t === 'showcase') return 'showcase';
    if (t === 'activity') return 'activity';
    if (t === 'insights') return 'insights';
    return 'stitching';
  }, []);
  const [tab, setTab] = useState(initialTab);

  const switchTab = useCallback(t => {
    setTab(t);
    const p = new URLSearchParams(window.location.search);
    p.set('tab', t);
    window.history.replaceState({}, '', '?' + p.toString());
  }, []);

  // ── All hooks below are unconditional (Rules of Hooks) ────────
  const [loading, setLoading] = useState(true);
  const [visibility, setVisibility] = useState(loadStatsVisibility);
  const [showCustomise, setShowCustomise] = useState(false);
  const [showShareCard, setShowShareCard] = useState(false);
  const [dismissedDupes, setDismissedDupes] = useState(loadDismissedDuplicates);
  const [activityLoaded, setActivityLoaded] = useState(() => typeof window.StatsActivity === 'function');
  const [insightsLoaded, setInsightsLoaded] = useState(() => typeof window.StatsInsights === 'function');
  const [neverUsedData, setNeverUsedData] = useState(null);
  const [patternSourceData, setPatternSourceData] = useState(null);

  // Data state
  const [lifetimeStitches, setLifetimeStitches] = useState(0);
  const [projects, setProjects] = useState([]);
  const [stash, setStash] = useState({});
  const [ageData, setAgeData] = useState({});
  const [sableData, setSableData] = useState([]);
  const [oldestWip, setOldestWip] = useState(null);
  const [mostUsed, setMostUsed] = useState([]);
  const [readyToStart, setReadyToStart] = useState([]);
  const [coverageRatio, setCoverageRatio] = useState(null);
  const [mostUsedFilter, setMostUsedFilter] = useState('year');
  const [readyExpanded, setReadyExpanded] = useState(false);
  // ── Extended analytics state ─────────────────────────────────
  const [oldestWips, setOldestWips] = useState([]); // top-5 leaderboard
  const [managerPatterns, setManagerPatterns] = useState([]);
  const [richProjects, setRichProjects] = useState([]); // for difficulty / quarter / fingerprint

  // Run v3 migrations then load all data
  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Ensure migrations have run
      if (typeof StashBridge !== 'undefined' && StashBridge.migrateSchemaToV3) {
        await StashBridge.migrateSchemaToV3();
      }
      if (typeof ProjectStorage !== 'undefined' && ProjectStorage.migrateProjectsToV3) {
        await ProjectStorage.migrateProjectsToV3();
      }
      if (cancelled) return;

      // Load all data in parallel where possible
      const results = await Promise.all([
        typeof ProjectStorage !== 'undefined' ? ProjectStorage.getLifetimeStitches() : 0,
        typeof ProjectStorage !== 'undefined' ? ProjectStorage.listProjects() : [],
        typeof StashBridge !== 'undefined' ? StashBridge.getGlobalStash() : {},
        typeof StashBridge !== 'undefined' ? StashBridge.getStashAgeDistribution() : {},
        typeof StashBridge !== 'undefined' ? StashBridge.getAcquisitionTimeseries(12) : [],
        typeof ProjectStorage !== 'undefined' ? ProjectStorage.getOldestWIP() : null,
        typeof ProjectStorage !== 'undefined' ? ProjectStorage.getMostUsedColours(10) : [],
        typeof ProjectStorage !== 'undefined' ? ProjectStorage.getProjectsReadyToStart() : [],
        typeof ProjectStorage !== 'undefined' && ProjectStorage.getOldestWIPs ? ProjectStorage.getOldestWIPs(5) : [],
        typeof StashBridge !== 'undefined' && StashBridge.getManagerPatterns ? StashBridge.getManagerPatterns() : [],
      ]);
      if (cancelled) return;

      setLifetimeStitches(results[0]);
      setProjects(results[1]);
      setStash(results[2]);
      setAgeData(results[3]);
      setSableData(results[4]);
      setOldestWip(results[5]);
      setMostUsed(results[6]);
      setReadyToStart(results[7]);
      setOldestWips(results[8] || []);
      setManagerPatterns(results[9] || []);

      // Compute coverage ratio
      await computeCoverage(results[2]);

      setLoading(false);
    }

    async function computeCoverage(stashData) {
      if (typeof ProjectStorage === 'undefined') return;
      try {
        const metas = await ProjectStorage.listProjects();
        const projects = await Promise.all(metas.map(m => ProjectStorage.get(m.id)));
        let totalThreads = 0, coveredThreads = 0;
        const dmcById = new Map(typeof DMC !== 'undefined' ? DMC.map(d => [d.id, d]) : []);
        const anchorById = new Map(typeof ANCHOR !== 'undefined' ? ANCHOR.map(d => [d.id, d]) : []);
        const ownedLabEntries = [];
        if (typeof rgbToLab === 'function') {
          for (const [sKey, sEntry] of Object.entries(stashData || {})) {
            if (!sEntry || !sEntry.owned || sEntry.owned <= 0) continue;
            const colonIdx = sKey.indexOf(':');
            const parsed = colonIdx >= 0 ? { brand: sKey.substring(0, colonIdx), id: sKey.substring(colonIdx + 1) } : { brand: 'dmc', id: sKey };
            const info = parsed.brand === 'anchor' ? anchorById.get(parsed.id) : dmcById.get(parsed.id);
            if (!info) continue;
            ownedLabEntries.push({
              key: sKey,
              lab: info.lab || rgbToLab(info.rgb[0], info.rgb[1], info.rgb[2]),
            });
          }
        }
        for (const proj of projects) {
          if (!proj || !proj.pattern) continue;
          if (proj.finishStatus && proj.finishStatus !== 'active' && proj.finishStatus !== 'planned') continue;
          // Get unique thread IDs used in this pattern
          const threadIds = new Set();
          for (const cell of proj.pattern) {
            if (cell && cell.id && cell.id !== '__skip__' && cell.id !== '__empty__') threadIds.add(cell.id);
          }
          for (const tid of threadIds) {
            totalThreads++;
            // Check if this thread (or a close substitute) is in the stash
            const compositeKey = normaliseStashKey(tid);
            const entry = stashData[compositeKey];
            if (entry && entry.owned > 0) { coveredThreads++; continue; }
            // Check cross-brand substitutes
            let found = false;
            if (typeof dE2000 === 'function' && ownedLabEntries.length > 0) {
              const threadInfo = dmcById.get(tid);
              if (threadInfo) {
                const targetLab = threadInfo.lab || (typeof rgbToLab === 'function' ? rgbToLab(threadInfo.rgb[0], threadInfo.rgb[1], threadInfo.rgb[2]) : null);
                if (targetLab) {
                  for (const owned of ownedLabEntries) {
                    if (owned.key === compositeKey) continue;
                    if (dE2000(targetLab, owned.lab) < 6) { found = true; break; }
                  }
                }
              }
            }
            if (found) coveredThreads++;
          }
        }
        if (!cancelled) setCoverageRatio(totalThreads > 0 ? Math.round(coveredThreads / totalThreads * 100) : null);
      } catch (e) { /* silent */ }
    }

    load();
    const reloadOnChange = () => { if (!cancelled) load(); };
    window.addEventListener('cs:stashChanged', reloadOnChange);
    window.addEventListener('cs:projectsChanged', reloadOnChange);
    window.addEventListener('cs:backupRestored', reloadOnChange);
    return () => {
      cancelled = true;
      window.removeEventListener('cs:stashChanged', reloadOnChange);
      window.removeEventListener('cs:projectsChanged', reloadOnChange);
      window.removeEventListener('cs:backupRestored', reloadOnChange);
    };
  }, []);

  // Load threads-never-used data (depends on stash + projects)
  useEffect(() => {
    if (typeof ProjectStorage === 'undefined') return;
    if (Object.keys(stash).length === 0 && !loading) { setNeverUsedData({ count: 0, legacyCount: 0, samples: [] }); return; }
    if (loading) return;
    let cancelled = false;
    async function compute() {
      try {
        const metas = await ProjectStorage.listProjects();
        const usedKeys = new Set();
        // Load projects sequentially to avoid retaining all large pattern arrays in
        // memory at once (peak-memory concern on mobile / large libraries).
        for (const m of metas) {
          let proj = null;
          try { proj = await ProjectStorage.get(m.id); } catch (_) { proj = null; }
          if (!proj || !proj.pattern) continue;
          if (proj.finishStatus === 'planned') continue;
          for (const cell of proj.pattern) {
            if (!cell || !cell.id || cell.id === '__skip__' || cell.id === '__empty__') continue;
            const normalized = normaliseStashKey(cell.id);
            usedKeys.add(normalized);
            usedKeys.add(cell.id.indexOf(':') >= 0 ? cell.id.split(':').slice(1).join(':') : cell.id);
          }
        }
        const LEGACY_EP = typeof StashBridge !== 'undefined' ? StashBridge.LEGACY_EPOCH : '2020-01-01T00:00:00Z';
        const neverUsed = [];
        let legacyCount = 0;
        for (const [key, entry] of Object.entries(stash)) {
          if (!entry || !entry.owned || entry.owned <= 0) continue;
          const colon = key.indexOf(':');
          const bareId = colon >= 0 ? key.slice(colon + 1) : key;
          if (usedKeys.has(key) || usedKeys.has(bareId)) continue;
          const isLegacy = !entry.addedAt || entry.addedAt === LEGACY_EP;
          if (isLegacy) { legacyCount++; continue; }
          neverUsed.push({ key, entry });
        }
        neverUsed.sort((a, b) => (a.entry.addedAt || '').localeCompare(b.entry.addedAt || ''));
        const samples = neverUsed.slice(0, 6).map(({ key, entry }) => {
          const colon = key.indexOf(':');
          const brand = colon >= 0 ? key.slice(0, colon) : 'dmc';
          const id = colon >= 0 ? key.slice(colon + 1) : key;
          const info = (typeof findThreadInCatalog === 'function') ? findThreadInCatalog(brand, id) : null;
          return { key, brand, id, name: info ? info.name : id, rgb: info ? info.rgb : [128, 128, 128] };
        });
        if (!cancelled) setNeverUsedData({ count: neverUsed.length + legacyCount, trackedCount: neverUsed.length, legacyCount, samples });
      } catch (e) { if (!cancelled) setNeverUsedData({ count: 0, legacyCount: 0, samples: [] }); }
    }
    compute();
    return () => { cancelled = true; };
  }, [stash, loading]);

  // Load pattern source data (size buckets from project w×h)
  useEffect(() => {
    if (typeof ProjectStorage === 'undefined') return;
    let cancelled = false;
    async function compute() {
      try {
        const metas = await ProjectStorage.listProjects();
        const buckets = { small: 0, medium: 0, large: 0 }; // <5k, 5k-25k, >25k stitches
        const designerMap = {};
        const genreMap = {};
        let hasAny = false;
        // PERF (perf-5 #7): parallel fetch.
        const fulls = await Promise.all(metas.map(m => ProjectStorage.get(m.id).catch(() => null)));
        for (const proj of fulls) {
          if (!proj) continue;
          const stitches = (proj.w || 0) * (proj.h || 0);
          if (stitches > 0) {
            hasAny = true;
            if (stitches < 5000) buckets.small++;
            else if (stitches < 25000) buckets.medium++;
            else buckets.large++;
          }
          if (proj.designerName) designerMap[proj.designerName] = (designerMap[proj.designerName] || 0) + 1;
          if (proj.tags && proj.tags.length) proj.tags.forEach(t => { genreMap[t] = (genreMap[t] || 0) + 1; });
        }
        if (!cancelled) setPatternSourceData({ buckets, designerMap, genreMap, hasAny });
      } catch (e) { if (!cancelled) setPatternSourceData(null); }
    }
    compute();
    return () => { cancelled = true; };
  }, []);

  // Lazy-load StatsActivity when activity tab is first selected
  useEffect(() => {
    if (tab !== 'activity' || activityLoaded) return;
    if (typeof window.loadStatsActivity === 'function') window.loadStatsActivity();
    const timer = setInterval(() => {
      if (typeof window.StatsActivity === 'function') { clearInterval(timer); setActivityLoaded(true); }
    }, 50);
    return () => clearInterval(timer);
  }, [tab, activityLoaded]);

  // Lazy-load StatsInsights when insights tab is first selected (Brief E)
  useEffect(() => {
    if (tab !== 'insights' || insightsLoaded) return;
    if (typeof window.loadStatsInsights === 'function') window.loadStatsInsights();
    const timer = setInterval(() => {
      if (typeof window.StatsInsights === 'function') { clearInterval(timer); setInsightsLoaded(true); }
    }, 50);
    return () => clearInterval(timer);
  }, [tab, insightsLoaded]);

  // Parse URL params for highlighting
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const highlightSection = urlParams.get('highlight');
  const highlightThread = urlParams.get('thread');

  // Scroll to highlighted section on mount
  useEffect(() => {
    if (!loading && highlightSection) {
      const el = document.getElementById('stats-' + highlightSection);
      if (el) setTimeout(() => {
        var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'center' });
      }, 100);
    }
  }, [loading, highlightSection]);

  // We need to load full projects for finishStatus - use a secondary load
  const [projectDetails, setProjectDetails] = useState([]);
  useEffect(() => {
    if (typeof ProjectStorage === 'undefined') return;
    let cancelled = false;
    async function loadDetails() {
      const metas = await ProjectStorage.listProjects();
      const details = [];
      const rich = [];
      // PERF (perf-5 #7): parallel fetch.
      const fulls = await Promise.all(metas.map(m => ProjectStorage.get(m.id).catch(() => null)));
      for (const p of fulls) {
        if (!p) continue;
        details.push({ id: p.id, name: p.name, finishStatus: p.finishStatus || 'active', completedAt: p.completedAt, startedAt: p.startedAt });
        // Compute difficulty + completion + palette stats once per project
        let total = 0, completed = 0, blendCount = 0;
        const palette = new Set();
        if (p.pattern && p.pattern.length) {
          const done = p.done && p.done.length === p.pattern.length ? p.done : null;
          for (let i = 0; i < p.pattern.length; i++) {
            const cell = p.pattern[i];
            if (!cell || !cell.id || cell.id === '__skip__' || cell.id === '__empty__') continue;
            total++;
            if (done && done[i]) completed++;
            palette.add(cell.id);
          }
          for (const id of palette) if (id.indexOf('+') >= 0) blendCount++;
        }
        const palLen = palette.size;
        const diff = (typeof calcDifficulty === 'function' && palLen > 0)
          ? calcDifficulty(palLen, blendCount, total)
          : { stars: 1, label: 'Beginner', color: 'var(--success)' };
        const pct = total > 0 ? Math.round(completed / total * 100) : 0;
        rich.push({
          id: p.id, name: p.name || 'Untitled',
          finishStatus: p.finishStatus || 'active',
          completedAt: p.completedAt, createdAt: p.createdAt, startedAt: p.startedAt,
          designerName: p.designerName || null,
          totalStitches: total, completedStitches: completed,
          paletteIds: Array.from(palette), palLen, blendCount,
          difficulty: diff.stars, difficultyLabel: diff.label, difficultyColor: diff.color,
          pct, finished: (p.finishStatus === 'completed'),
          statsSessions: Array.isArray(p.statsSessions) ? p.statsSessions : []
        });
      }
      if (!cancelled) { setProjectDetails(details); setRichProjects(rich); }
    }
    loadDetails();
    return () => { cancelled = true; };
  }, []);

  const activeProjectCount = useMemo(() => projectDetails.filter(p => p.finishStatus === 'active').length, [projectDetails]);
  const finishedThisYear = useMemo(() => {
    const yearStart = new Date().getFullYear() + '-01-01';
    return projectDetails.filter(p => p.finishStatus === 'completed' && p.completedAt && p.completedAt >= yearStart).length;
  }, [projectDetails]);

  // Hue wheel computation
  const hueData = useMemo(() => {
    const bins = new Array(12).fill(0);
    let neutral = 0;
    for (const [key, entry] of Object.entries(stash)) {
      if (!entry.owned || entry.owned <= 0) continue;
      const parsed = key.indexOf(':') >= 0 ? { brand: key.split(':')[0], id: key.split(':').slice(1).join(':') } : { brand: 'dmc', id: key };
      const info = (typeof findThreadInCatalog === 'function') ? findThreadInCatalog(parsed.brand, parsed.id) : null;
      if (!info) continue;
      const lab = info.lab || (typeof rgbToLab === 'function' ? rgbToLab(info.rgb[0], info.rgb[1], info.rgb[2]) : null);
      if (!lab) continue;
      const a = lab[1], b = lab[2];
      const chroma = Math.sqrt(a * a + b * b);
      // Low chroma → neutral (greys, whites, blacks)
      if (chroma < 10) { neutral++; continue; }
      const angle = Math.atan2(b, a); // radians
      const deg = ((angle * 180 / Math.PI) + 360) % 360;
      const bin = Math.floor(deg / 30) % 12;
      bins[bin]++;
    }
    return { bins, neutral };
  }, [stash]);

  // ── Colour family counts (replaces hue wheel as primary composition view) ─
  const familyData = useMemo(() => {
    const counts = {};
    for (const [key, entry] of Object.entries(stash)) {
      if (!entry || !entry.owned || entry.owned <= 0) continue;
      const parsed = key.indexOf(':') >= 0 ? { brand: key.split(':')[0], id: key.split(':').slice(1).join(':') } : { brand: 'dmc', id: key };
      const info = (typeof findThreadInCatalog === 'function') ? findThreadInCatalog(parsed.brand, parsed.id) : null;
      if (!info) continue;
      const lab = info.lab || (typeof rgbToLab === 'function' ? rgbToLab(info.rgb[0], info.rgb[1], info.rgb[2]) : null);
      const fam = classifyColourFamily({ lab, rgb: info.rgb, name: info.name });
      counts[fam] = (counts[fam] || 0) + 1;
    }
    return counts;
  }, [stash]);

  // ── DMC palette coverage (unique owned DMC ids / total DMC palette) ────────
  const dmcCoverage = useMemo(() => {
    if (typeof DMC === 'undefined' || !Array.isArray(DMC) || DMC.length === 0) return null;
    const ownedIds = new Set();
    for (const [key, entry] of Object.entries(stash)) {
      if (!entry || !entry.owned || entry.owned <= 0) continue;
      const colon = key.indexOf(':');
      const brand = colon >= 0 ? key.slice(0, colon) : 'dmc';
      const id = colon >= 0 ? key.slice(colon + 1) : key;
      if (brand !== 'dmc') continue;
      ownedIds.add(id);
    }
    const total = DMC.length;
    const owned = ownedIds.size;
    const pct = total > 0 ? (owned / total) * 100 : 0;
    return { owned, total, pct };
  }, [stash]);

  // ── Streak + Pace (uses InsightsEngine + sessions across all projects) ─────
  const allSessions = useMemo(() => {
    const out = [];
    for (const p of richProjects) {
      for (const s of (p.statsSessions || [])) out.push(s);
    }
    return out;
  }, [richProjects]);

  const streakData = useMemo(() => {
    if (typeof window.InsightsEngine === 'undefined' || !window.InsightsEngine.computeWeeklyStreak) return { current: 0, longest: 0 };
    const current = window.InsightsEngine.computeWeeklyStreak(allSessions);
    // Longest streak: scan back over all weeks
    if (allSessions.length === 0) return { current: 0, longest: current };
    const weekKeys = new Set();
    for (const s of allSessions) {
      const ds = s.date || (s.startTime || '').slice(0, 10);
      if (!ds) continue;
      const d = new Date(ds + 'T12:00:00');
      if (isNaN(d.getTime())) continue;
      // ISO week-start (Monday)
      const dow = d.getDay() === 0 ? 6 : d.getDay() - 1;
      const m = new Date(d); m.setDate(d.getDate() - dow);
      weekKeys.add(m.toISOString().slice(0, 10));
    }
    const sortedWeeks = Array.from(weekKeys).sort();
    let longest = 0, run = 0, prev = null;
    for (const wk of sortedWeeks) {
      if (prev) {
        const diff = (new Date(wk) - new Date(prev)) / 86400000;
        if (Math.round(diff) === 7) run++; else run = 1;
      } else run = 1;
      if (run > longest) longest = run;
      prev = wk;
    }
    return { current, longest: Math.max(longest, current) };
  }, [allSessions]);

  const paceData = useMemo(() => {
    if (typeof window.InsightsEngine === 'undefined' || !window.InsightsEngine.calculateRecentPace) return null;
    const now = new Date();
    return window.InsightsEngine.calculateRecentPace(allSessions, now, 86400000);
  }, [allSessions]);

  // ── Buying Impact: for each non-owned thread referenced by wishlist
  //    patterns, count the number of distinct patterns it appears in. ────────
  const buyingImpact = useMemo(() => {
    if (!managerPatterns || managerPatterns.length === 0) return [];
    const ownedKeys = new Set();
    for (const [key, entry] of Object.entries(stash)) {
      if (!entry || !entry.owned || entry.owned <= 0) continue;
      ownedKeys.add(key);
      const colon = key.indexOf(':');
      if (colon >= 0) ownedKeys.add(key.slice(colon + 1));
    }
    const tally = {};
    for (const pat of managerPatterns) {
      if (!pat || !pat.threads || pat.status === 'completed') continue;
      const seen = new Set();
      for (const t of pat.threads) {
        if (!t || !t.id) continue;
        if (ownedKeys.has(t.id) || ownedKeys.has('dmc:' + t.id)) continue;
        if (seen.has(t.id)) continue;
        seen.add(t.id);
        if (!tally[t.id]) tally[t.id] = { id: t.id, name: t.name || t.id, brand: t.brand || 'dmc', patternCount: 0, patterns: [] };
        tally[t.id].patternCount++;
        if (tally[t.id].patterns.length < 3) tally[t.id].patterns.push(pat.title || 'Untitled');
      }
    }
    // Look up rgb for each
    for (const t of Object.values(tally)) {
      const info = (typeof findThreadInCatalog === 'function') ? findThreadInCatalog(t.brand || 'dmc', t.id) : null;
      t.rgb = info ? info.rgb : [128, 128, 128];
    }
    return Object.values(tally).sort((a, b) => b.patternCount - a.patternCount).slice(0, 10);
  }, [managerPatterns, stash]);

  // ── Use What You Have: for each owned-but-never-used thread, find
  //    wishlist patterns that include it. ────────────────────────────────────
  const useWhatYouHaveRecs = useMemo(() => {
    if (!managerPatterns || managerPatterns.length === 0) return [];
    if (!neverUsedData || !neverUsedData.samples || neverUsedData.samples.length === 0) return [];
    const recs = [];
    const dormantIds = new Set(neverUsedData.samples.map(s => s.id));
    for (const pat of managerPatterns) {
      if (!pat || !pat.threads || pat.status === 'completed' || pat.status === 'inprogress') continue;
      const matches = [];
      for (const t of pat.threads) {
        if (t && t.id && dormantIds.has(t.id)) matches.push(t);
      }
      if (matches.length > 0) {
        recs.push({ id: pat.id, title: pat.title || 'Untitled', matches: matches.length, sampleNames: matches.slice(0, 3).map(t => t.name || t.id) });
      }
    }
    return recs.sort((a, b) => b.matches - a.matches).slice(0, 5);
  }, [managerPatterns, neverUsedData]);

  // ── Designer leaderboard: rank by project count + finished count. ─────────
  const designerLeaderboard = useMemo(() => {
    const tally = {};
    for (const p of richProjects) {
      if (!p.designerName) continue;
      if (!tally[p.designerName]) tally[p.designerName] = { name: p.designerName, total: 0, finished: 0 };
      tally[p.designerName].total++;
      if (p.finished) tally[p.designerName].finished++;
    }
    return Object.values(tally).sort((a, b) => b.total - a.total).slice(0, 5);
  }, [richProjects]);

  // ── Brand alignment: for each pattern, % of its threads that are in the
  //    user's preferred brand (most common brand owned). ─────────────────────
  const brandAlignment = useMemo(() => {
    if (!managerPatterns || managerPatterns.length === 0) return null;
    // Determine preferred brand
    const brandCounts = {};
    for (const [key, entry] of Object.entries(stash)) {
      if (!entry || !entry.owned || entry.owned <= 0) continue;
      const brand = key.indexOf(':') >= 0 ? key.split(':')[0] : 'dmc';
      brandCounts[brand] = (brandCounts[brand] || 0) + 1;
    }
    const preferred = Object.entries(brandCounts).sort(([, a], [, b]) => b - a)[0];
    if (!preferred) return null;
    const preferredBrand = preferred[0];
    let aligned = 0, total = 0;
    const conflicts = [];
    for (const pat of managerPatterns) {
      if (!pat || !pat.threads || pat.status === 'completed') continue;
      const tn = pat.threads.length;
      if (tn === 0) continue;
      let okay = 0;
      for (const t of pat.threads) {
        if ((t.brand || 'dmc') === preferredBrand) okay++;
      }
      total += tn; aligned += okay;
      const pct = Math.round((okay / tn) * 100);
      if (pct < 80) conflicts.push({ id: pat.id, title: pat.title || 'Untitled', pct, brand: pat.threads[0].brand || 'dmc' });
    }
    return { preferredBrand, aligned, total, pct: total > 0 ? Math.round(aligned / total * 100) : 0, conflicts: conflicts.slice(0, 5) };
  }, [managerPatterns, stash]);

  // ── Colour fingerprint: Jaccard overlap of top-20 owned vs top-20 used. ───
  const colourFingerprint = useMemo(() => {
    if (!mostUsed || mostUsed.length === 0) return null;
    const usedIds = new Set();
    for (const c of mostUsed.slice(0, 20)) {
      // Split blends into components
      String(c.id).split('+').forEach(part => usedIds.add(part));
    }
    // Top 20 owned by skein count
    const ownedByCount = Object.entries(stash)
      .filter(([, e]) => e && e.owned > 0)
      .map(([k, e]) => { const colon = k.indexOf(':'); return { id: colon >= 0 ? k.slice(colon + 1) : k, owned: e.owned }; })
      .sort((a, b) => b.owned - a.owned).slice(0, 20);
    const ownedIds = new Set(ownedByCount.map(o => o.id));
    if (ownedIds.size === 0) return null;
    const intersection = new Set([...usedIds].filter(x => ownedIds.has(x)));
    const union = new Set([...usedIds, ...ownedIds]);
    const jaccardPct = union.size > 0 ? (intersection.size / union.size) * 100 : 0;
    // Find over-bought (in owned, not in used) and under-bought (in used, not in owned)
    // Enrich with {id, name, rgb} so the render site can show a colour swatch.
    function enrichId(id) {
      const info = typeof findThreadInCatalog === 'function' ? findThreadInCatalog('dmc', id) : null;
      return { id, name: info ? info.name : '', rgb: info ? info.rgb : null };
    }
    const usedNotOwned = [...usedIds].filter(x => !ownedIds.has(x)).slice(0, 5).map(enrichId);
    const ownedNotUsed = [...ownedIds].filter(x => !usedIds.has(x)).slice(0, 5).map(enrichId);
    return { jaccardPct, intersection: intersection.size, usedNotOwned, ownedNotUsed };
  }, [mostUsed, stash]);

  // ── Quarter portfolio: started + finished projects per quarter. ───────────
  const quarterPortfolio = useMemo(() => {
    const buckets = {};
    function qFor(iso) {
      if (!iso) return null;
      const d = new Date(iso); if (isNaN(d.getTime())) return null;
      return d.getFullYear() + ' Q' + (Math.floor(d.getMonth() / 3) + 1);
    }
    for (const p of richProjects) {
      const startedQ = qFor(p.startedAt || p.createdAt);
      const finishedQ = p.finished ? qFor(p.completedAt) : null;
      if (startedQ) {
        if (!buckets[startedQ]) buckets[startedQ] = { q: startedQ, started: 0, finished: 0 };
        buckets[startedQ].started++;
      }
      if (finishedQ) {
        if (!buckets[finishedQ]) buckets[finishedQ] = { q: finishedQ, started: 0, finished: 0 };
        buckets[finishedQ].finished++;
      }
    }
    return Object.values(buckets).sort((a, b) => a.q.localeCompare(b.q)).slice(-8); // last 8 quarters
  }, [richProjects]);

  // ── Difficulty vs completion: scatter of all projects with a palette. ─────
  const difficultyPoints = useMemo(() => {
    return richProjects.filter(p => p.palLen > 0).map(p => ({
      difficulty: p.difficulty, pct: p.pct, name: p.name, finished: p.finished
    }));
  }, [richProjects]);

  // ── Pattern queue smart-sort: ready-to-start with composite score
  //    (closer to ready × more wishlist priority). Adds a 'recommended' badge.
  const recommendedPatternId = useMemo(() => {
    if (!readyToStart || readyToStart.length === 0) return null;
    // Score: pct + (status === 'wishlist' ? 5 : 0)
    let best = null, bestScore = -1;
    for (const p of readyToStart) {
      const score = (p.pct || 0) + (p.status === 'wishlist' ? 5 : 0);
      if (score > bestScore) { bestScore = score; best = p; }
    }
    return best ? best.id : null;
  }, [readyToStart]);

  // SABLE headline
  const sableHeadline = useMemo(() => {
    if (sableData.length < 3) return null;
    const totalAdded = sableData.reduce((s, d) => s + d.added, 0);
    const totalUsed = sableData.reduce((s, d) => s + d.used, 0);
    if (totalUsed === 0 && totalAdded === 0) return null;
    const ratio = totalUsed > 0 ? totalAdded / totalUsed : totalAdded > 0 ? Infinity : 1;
    if (ratio > 1.5) return { text: `Adding ${Math.round(ratio * 10) / 10}× the rate of using`, color: '#f59e0b' };
    if (ratio >= 0.8) return { text: 'About balanced', color: 'var(--accent)' };
    return { text: 'Using more than adding', color: 'var(--accent)' };
  }, [sableData]);

  // Duplicate detection
  const duplicates = useMemo(() => {
    const results = [];
    const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;
    for (const [key, entry] of Object.entries(stash)) {
      if (dismissedDupes.has(key)) continue;
      if (!entry.history || entry.history.length < 2) continue;
      // Check for 2+ positive deltas separated by >30 days
      const adds = entry.history.filter(h => h.delta > 0).map(h => new Date(h.date).getTime()).sort((a, b) => a - b);
      if (adds.length >= 2 && (adds[adds.length - 1] - adds[0]) > THIRTY_DAYS) {
        const parsed = key.indexOf(':') >= 0 ? { brand: key.split(':')[0], id: key.split(':').slice(1).join(':') } : { brand: 'dmc', id: key };
        const info = (typeof findThreadInCatalog === 'function') ? findThreadInCatalog(parsed.brand, parsed.id) : null;
        results.push({
          key, brand: parsed.brand, id: parsed.id,
          name: info ? info.name : parsed.id,
          rgb: info ? info.rgb : [128, 128, 128],
          addCount: adds.length,
          lastAdded: entry.lastAdjustedAt || entry.addedAt,
          owned: entry.owned || 0,
          type: 'repeat'
        });
      }
    }
    // Near-duplicate detection (different keys, very close colours)
    const LEGACY_EPOCH = typeof StashBridge !== 'undefined' ? StashBridge.LEGACY_EPOCH : '2020-01-01T00:00:00Z';
    const ownedEntries = Object.entries(stash).filter(([, e]) => e.owned > 0 && e.addedAt && e.addedAt !== LEGACY_EPOCH);
    for (let i = 0; i < ownedEntries.length; i++) {
      for (let j = i + 1; j < ownedEntries.length; j++) {
        const [k1] = ownedEntries[i], [k2] = ownedEntries[j];
        if (k1 === k2 || dismissedDupes.has(k1 + '|' + k2)) continue;
        // Get colour info for both
        const getInfo = (k) => {
          const p = k.indexOf(':') >= 0 ? { brand: k.split(':')[0], id: k.split(':').slice(1).join(':') } : { brand: 'dmc', id: k };
          return (typeof findThreadInCatalog === 'function') ? findThreadInCatalog(p.brand, p.id) : null;
        };
        const info1 = getInfo(k1), info2 = getInfo(k2);
        if (!info1 || !info2) continue;
        if (typeof rgbToLab !== 'function' || typeof dE2000 !== 'function') continue;
        const lab1 = info1.lab || rgbToLab(info1.rgb[0], info1.rgb[1], info1.rgb[2]);
        const lab2 = info2.lab || rgbToLab(info2.rgb[0], info2.rgb[1], info2.rgb[2]);
        if (dE2000(lab1, lab2) < 1) {
          const p1 = k1.indexOf(':') >= 0 ? { brand: k1.split(':')[0], id: k1.split(':').slice(1).join(':') } : { brand: 'dmc', id: k1 };
          results.push({
            key: k1 + '|' + k2, brand: p1.brand, id: p1.id,
            name: `${info1.name || p1.id} ↔ ${info2.name || k2}`,
            rgb: info1.rgb, owned: (ownedEntries[i][1].owned || 0) + (ownedEntries[j][1].owned || 0),
            type: 'near',
            keys: [k1, k2]
          });
        }
      }
    }
    return results;
  }, [stash, dismissedDupes]);

  // Handle visibility toggle
  const handleVisibilityChange = useCallback(v => {
    setVisibility(v);
    saveStatsVisibility(v);
  }, []);

  // Handle duplicate dismissal
  const handleDismiss = useCallback(key => {
    setDismissedDupes(prev => {
      const next = new Set(prev);
      next.add(key);
      saveDismissedDuplicates(next);
      return next;
    });
  }, []);

  // Navigation helpers
  const navigateToStashThread = useCallback(threadKey => {
    if (onNavigateToStash) onNavigateToStash();
    // TODO: deep-link to specific thread when stash page supports it
  }, [onNavigateToStash]);

  const navigateToProject = useCallback(projectId => {
    if (onNavigateToProject) onNavigateToProject(projectId);
  }, [onNavigateToProject]);

  const vis = visibility;
  const show = key => vis[key] !== false;

  // ── Plan B Phase 4: Lifetime overview chip ────────────────────
  // Always-visible headline chip in the tab bar so users on Activity /
  // Insights / Stash tabs can still see the lifetime number without flipping
  // back to the Stitching dashboard. Opens the shared AppInfoPopover with
  // the cross-tab summary (lifetime, active, finished YTD, coverage).
  const [lifetimeChipOpen, setLifetimeChipOpen] = useState(false);
  const lifetimeChipRef = useRef(null);

  // ── Shared tab bar (built after all hooks) ────────────────────
  // Tab labels use Icons.* (sparkles/fire/lightbulb) prefixed inline so the
  // chrome stays consistent with the rest of the app. Avoid raw unicode
  // glyphs (✶ ◎ ✨) per the no-emoji house rule.
  const _Icons = (typeof window !== 'undefined' && window.Icons) ? window.Icons : null;
  function tabIcon(name) {
    if (!_Icons || typeof _Icons[name] !== 'function') return null;
    return h('span', { 'aria-hidden': 'true', style: { display: 'inline-flex', verticalAlign: '-3px', marginRight: 4 } }, _Icons[name]());
  }
  const tabBar = h('div', { className: 'gsd-tabs', style: { paddingTop: 8 } },
    h('div', { className: 'gsd-tabs-inner' },
      h('button', { className: 'gsd-tab' + (tab === 'stitching' ? ' gsd-tab--on' : ''), onClick: () => switchTab('stitching') }, 'Stitching'),
      h('button', { className: 'gsd-tab' + (tab === 'stash' ? ' gsd-tab--on' : ''), onClick: () => switchTab('stash') }, 'Stash'),
      h('button', { className: 'gsd-tab' + (tab === 'showcase' ? ' gsd-tab--on' : ''), onClick: () => switchTab('showcase') }, tabIcon('sparkles'), 'Showcase'),
      h('button', { className: 'gsd-tab' + (tab === 'activity' ? ' gsd-tab--on' : ''), onClick: () => switchTab('activity') }, tabIcon('fire'), 'Activity'),
      h('button', { className: 'gsd-tab' + (tab === 'insights' ? ' gsd-tab--on' : ''), onClick: () => switchTab('insights') }, tabIcon('lightbulb'), 'Insights')
    ),
    h('div', { className: 'app-info-chip-wrap gsd-tabs-chip-wrap' },
      h('button', {
        ref: lifetimeChipRef,
        type: 'button',
        className: 'app-info-chip gsd-lifetime-chip',
        'aria-haspopup': 'dialog',
        'aria-expanded': lifetimeChipOpen ? 'true' : 'false',
        onClick: () => setLifetimeChipOpen(o => !o),
        title: 'Lifetime overview'
      },
        h('span', { className: 'app-info-chip__label' }, 'Lifetime'),
        h('span', { className: 'gsd-lifetime-chip__num' }, fmtNum(lifetimeStitches || 0)),
        h('span', { className: 'app-info-chip__chevron', 'aria-hidden': 'true' }, window.Icons && window.Icons.chevronDown ? window.Icons.chevronDown() : null)
      ),
      lifetimeChipOpen && window.AppInfoPopover && (() => {
        const km = lifetimeStitches > 0 ? threadKm(lifetimeStitches) : 0;
        const stitchRows = [
          ['Lifetime stitches', fmtNum(lifetimeStitches || 0)]
        ];
        if (km > 0) stitchRows.push(['Thread used', '\u2248 ' + km + ' km']);
        const projectRows = [
          ['Active projects', fmtNum(activeProjectCount || 0)],
          ['Finished this year', fmtNum(finishedThisYear || 0)]
        ];
        const stashRows = [];
        if (typeof coverageRatio === 'number') stashRows.push(['Stash coverage', coverageRatio + '%']);
        const children = [
          h(window.AppInfoSection, { key: 's1', title: 'Stitches' },
            h(window.AppInfoGrid, { rows: stitchRows })
          ),
          h(window.AppInfoDivider, { key: 'd1' }),
          h(window.AppInfoSection, { key: 's2', title: 'Projects' },
            h(window.AppInfoGrid, { rows: projectRows })
          )
        ];
        if (stashRows.length) {
          children.push(h(window.AppInfoDivider, { key: 'd2' }));
          children.push(h(window.AppInfoSection, { key: 's3', title: 'Stash' },
            h(window.AppInfoGrid, { rows: stashRows })
          ));
        }
        return h(window.AppInfoPopover, {
          open: true,
          onClose: () => setLifetimeChipOpen(false),
          triggerRef: lifetimeChipRef,
          ariaLabel: 'Lifetime stats overview',
          className: 'app-info-popover--left'
        }, children);
      })()
    )
  );

  // ── Insights tab (Brief E) ────────────────────────────────────
  if (tab === 'insights') {
    if (!insightsLoaded) {
      return h('div', null, tabBar,
        h('div', { style: { padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' } },
          h('div', { style: { width: 28, height: 28, border: '2.5px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' } }),
          'Loading insights\u2026'
        )
      );
    }
    return h('div', { className: 'gsd' }, tabBar, h(window.StatsInsights, null));
  }

  // ── Activity tab ──────────────────────────────────────────────
  if (tab === 'activity') {
    if (!activityLoaded) {
      return h('div', null, tabBar,
        h('div', { style: { padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' } },
          h('div', { style: { width: 28, height: 28, border: '2.5px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' } }),
          'Loading activity…'
        )
      );
    }
    return h('div', null, tabBar,
      h(window.StatsActivity, { onNavigateToDashboard: () => switchTab('stitching'), onNavigateToShowcase: () => switchTab('showcase') })
    );
  }

  // ── Showcase tab ──────────────────────────────────────────────
  if (tab === 'showcase') {
    return h('div', null, tabBar, h(StatsShowcase, { onNavigateToDashboard: () => switchTab('stitching'), onNavigateToActivity: () => switchTab('activity') }));
  }

  // ── Stitching tab: delegate to GlobalStatsDashboard ──────────
  if (tab === 'stitching') {
    return h('div', null, tabBar, h(GlobalStatsDashboard, { onClose }));
  }

  if (loading) {
    return h('div', { className: 'gsd', style: { padding: 40, textAlign: 'center', color: 'var(--text-secondary)' } },
      tabBar,
      h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-secondary)' } },
        h('div', { style: { width: 28, height: 28, border: '2.5px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' } }),
        'Loading stats…'
      )
    );
  }

  // ── Render ──────────────────────────────────────────────────────
  const hasAnyStitchingData = lifetimeStitches > 0 || activeProjectCount > 0 || finishedThisYear > 0 || projectDetails.length > 0;
  if (!hasAnyStitchingData && window.EmptyState) {
    return h('div', { className: 'gsd', style: { paddingBottom: 40 } },
      h('div', { style: { padding: '24px 0' } },
        h(window.EmptyState, {
          icon: window.Icons && window.Icons.barChart ? window.Icons.barChart() : null,
          title: 'No stitching data yet',
          description: 'Open a project in the Stitch Tracker and mark some stitches — your stats will appear here.',
          ctaLabel: 'Open a project to start tracking',
          ctaAction: function() { window.location.href = 'stitch.html'; }
        })
      )
    );
  }

  return h('div', { className: 'gsd', style: { paddingBottom: 40 } },
    tabBar,
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '8px 0 4px' } },
      h('button', { onClick: () => setShowCustomise(true), style: { padding: '6px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize:'var(--text-sm)', fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' } }, 'Customise')
    ),

    // ── Top row: 4 metric cards ──────────────────────────────────
    h('div', { className: 'gsd-metrics' },
      show('lifetimeStitches') && h(StatCard, { title: 'Lifetime Stitches', id: 'stats-lifetimeStitches' },
        lifetimeStitches > 0
          ? h('div', null,
              h('div', { className: 'gsd-metric-value' }, fmtNum(lifetimeStitches)),
              h('div', { className: 'gsd-metric-sub' }, '≈ ' + threadKm(lifetimeStitches) + ' km of thread'),
              h('div', { style: { marginTop: 6, display: 'flex', gap: 6 } },
                h('button', { onClick: e => { e.stopPropagation(); setShowShareCard(true); }, style: { fontSize:'var(--text-xs)', padding: '3px 8px', background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600 } }, 'Share card')
              )
            )
          : h('div', null,
              h('div', { className: 'gsd-metric-value' }, '0'),
              h('div', { className: 'gsd-metric-sub' }, 'Your stitches will count here as you mark them off')
            )
      ),
      show('activeProjects') && h(StatCard, { title: 'Active Projects', id: 'stats-activeProjects', onClick: () => onNavigateToProject && window.history.replaceState({}, '', '?mode=track') },
        h('div', { className: 'gsd-metric-value' }, fmtNum(activeProjectCount)),
        activeProjectCount === 0 && h('div', { className: 'gsd-metric-sub' }, 'No active projects right now')
      ),
      show('finishedThisYear') && h(StatCard, { title: 'Finished This Year', id: 'stats-finishedThisYear' },
        h('div', { className: 'gsd-metric-value' }, fmtNum(finishedThisYear)),
        finishedThisYear === 0 && h('div', { className: 'gsd-metric-sub' }, 'Finish a project to see it here')
      ),
      show('coverage') && h(StatCard, { title: 'Coverage Ratio', id: 'stats-coverage', onClick: onNavigateToStash },
        coverageRatio !== null
          ? h('div', null,
              h('div', { className: 'gsd-metric-value', style: { color: coverageRatio >= 80 ? 'var(--accent)' : coverageRatio >= 50 ? '#f59e0b' : '#ef4444' } }, coverageRatio + '%'),
              h('div', { className: 'gsd-metric-sub' }, 'of threads needed are in your stash')
            )
          : h('div', null,
              h('div', { className: 'gsd-metric-value', style: { color: 'var(--text-tertiary)' } }, '—'),
              h('div', { className: 'gsd-metric-sub' }, 'Add a pattern to see how your stash covers it')
            )
      ),
      show('streak') && h(StatCard, { title: 'Stitching Streak', id: 'stats-streak' },
        streakData.current > 0
          ? h('div', null,
              h('div', { className: 'gsd-metric-value' }, streakData.current),
              h('div', { className: 'gsd-metric-sub' }, 'week' + (streakData.current === 1 ? '' : 's') + ' in a row' + (streakData.longest > streakData.current ? ' (best: ' + streakData.longest + ')' : ''))
            )
          : h('div', null,
              h('div', { className: 'gsd-metric-value', style: { color: 'var(--text-tertiary)' } }, '0'),
              h('div', { className: 'gsd-metric-sub' }, 'Stitch this week to start a streak')
            )
      ),
      show('pace') && h(StatCard, { title: 'Recent Pace', id: 'stats-pace' },
        paceData && paceData.activeDays > 0
          ? h('div', null,
              h('div', { className: 'gsd-metric-value' }, fmtNum(Math.round(paceData.pacePerDay))),
              h('div', { className: 'gsd-metric-sub' }, 'stitches / day across ' + paceData.activeDays + ' active day' + (paceData.activeDays === 1 ? '' : 's'))
            )
          : h('div', null,
              h('div', { className: 'gsd-metric-value', style: { color: 'var(--text-tertiary)' } }, '—'),
              h('div', { className: 'gsd-metric-sub' }, 'No recent activity to measure pace')
            )
      )
    ),

    // ── Middle row: SABLE + Hue Wheel ────────────────────────────
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, margin: '10px 0' } },
      show('sableIndex') && h(StatCard, { title: h('span', {style:{display:'inline-flex',alignItems:'center',gap:4}}, 'SABLE Index', h('span', {title:'SABLE = Stash Accumulated Beyond Life Expectancy\nA ratio of how fast you accumulate thread vs how fast you stitch it. Above 1.0 means your stash is growing faster than you can use it.',style:{cursor:'help',color:'var(--text-tertiary)',border:'1px solid currentColor',borderRadius:'50%',width:13,height:13,display:'inline-flex',alignItems:'center',justifyContent:'center',fontSize:9,fontWeight:700,flexShrink:0,lineHeight:1}},'?')), id: 'stats-sableIndex', style: { minHeight: 200 } },
        sableData.length >= 3
          ? h('div', null,
              sableHeadline && h('div', { style: { fontSize:'var(--text-lg)', fontWeight: 600, color: sableHeadline.color, marginBottom:'var(--s-2)' } }, sableHeadline.text),
              h(SableChart, { data: sableData }),
              h('div', { style: { fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6 } }, 'SABLE = Stash Accumulated Beyond Life Expectancy')
            )
          : h('div', { style: { fontSize:'var(--text-md)', color: 'var(--text-secondary)', padding: '20px 0' } },
              'Check back after a few months of tracking to see a trend'
            )
      ),
      show('stashComposition') && h(StatCard, { title: 'Colour Families', id: 'stats-stashComposition', style: { minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } },
        Object.keys(familyData).length > 0
          ? h(ColourFamilyWheel, { counts: familyData })
          : h('div', { style: { fontSize:'var(--text-md)', color: 'var(--text-secondary)', padding: '20px 0' } },
              'Your stash is empty. Add threads to see your palette'
            )
      ),
      show('dmcCoverage') && h(StatCard, { title: 'DMC Palette Coverage', id: 'stats-dmcCoverage', style: { minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } },
        dmcCoverage
          ? h('div', { style: { textAlign: 'center', width: '100%' } },
              h(RadialGauge, { pct: dmcCoverage.pct, sublabel: fmtNum(dmcCoverage.owned) + ' of ' + fmtNum(dmcCoverage.total) + ' DMC colours' }),
              h('div', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 6 } },
                dmcCoverage.pct >= 90 ? 'Collector tier — nearly the whole library'
                  : dmcCoverage.pct >= 50 ? 'Strong coverage of the DMC palette'
                  : dmcCoverage.pct >= 20 ? 'A focused working palette'
                  : 'Plenty of room to grow'
              )
            )
          : h('div', { style: { fontSize:'var(--text-md)', color: 'var(--text-secondary)', padding: '20px 0' } },
              'No DMC threads in stash yet'
            )
      )
    ),

    // ── Bottom row: Ready to start, Duplicates, Oldest WIP ──────
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 10, margin: '10px 0' } },
      show('readyToStart') && h(StatCard, { title: 'Ready to Start', id: 'stats-readyToStart' },
        (() => {
          const full = readyToStart.filter(p => p.pct === 100);
          const nearly = readyToStart.filter(p => p.pct >= 80 && p.pct < 100);
          if (full.length === 0 && !readyExpanded) return h('div', { style: { fontSize:'var(--text-md)', color: 'var(--text-secondary)' } }, "Nothing fully kitted yet. Check individual patterns to see what's missing");
          const shown = readyExpanded ? readyToStart : full.slice(0, 3);
          return h('div', null,
            shown.map(p => h('div', { key: p.id, onClick: () => navigateToProject(p.id), style: { display: 'flex', alignItems: 'center', gap:'var(--s-2)', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize:'var(--text-md)' } },
              h('span', { style: { color: p.pct === 100 ? 'var(--accent)' : '#f59e0b', fontWeight: 600, minWidth: 36 } }, p.pct + '%'),
              h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                p.title || 'Untitled',
                recommendedPatternId === p.id && h('span', { style: { marginLeft: 6, fontSize: 9, padding: '1px 6px', borderRadius: 8, background: 'var(--accent-light)', color: 'var(--accent)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4 } }, 'Pick this')
              ),
              h('span', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)' } }, p.totalThreads + ' threads')
            )),
            (nearly.length > 0 || full.length > 3) && !readyExpanded && h('button', { onClick: () => setReadyExpanded(true), style: { fontSize:'var(--text-xs)', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', marginTop:'var(--s-1)', padding: 0 } }, 'See all (' + readyToStart.length + ')'),
            readyExpanded && h('button', { onClick: () => setReadyExpanded(false), style: { fontSize:'var(--text-xs)', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', marginTop:'var(--s-1)', padding: 0 } }, 'Show less')
          );
        })()
      ),
      show('duplicateRisk') && h(StatCard, { title: 'Duplicate Alerts', id: 'stats-duplicateRisk' },
        duplicates.length > 0
          ? h('div', null,
              duplicates.slice(0, 5).map(d => h('div', { key: d.key, style: { display: 'flex', alignItems: 'center', gap:'var(--s-2)', padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize:'var(--text-md)' } },
                h(Swatch, { rgb: d.rgb }),
                h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                  d.brand.toUpperCase() + ' ' + d.id,
                  d.type === 'repeat' && h('span', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)', marginLeft:'var(--s-1)' } }, d.addCount + ' adds'),
                  d.type === 'near' && h('span', { style: { fontSize:'var(--text-xs)', color: '#f59e0b', marginLeft:'var(--s-1)' } }, 'near-duplicate')
                ),
                h('span', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)' } }, 'owns ' + d.owned),
                h('button', { onClick: () => handleDismiss(d.key), 'aria-label': 'Dismiss', style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize:'var(--text-xl)', padding: '0 4px', lineHeight: 1 } }, '×')
              ))
            )
          : h('div', { style: { display: 'flex', alignItems: 'center', gap:'var(--s-2)', fontSize:'var(--text-md)', color: 'var(--text-secondary)' } },
              h('span', { style: { color: 'var(--accent)', fontSize: 18, display:'inline-flex', alignItems:'center' } }, window.Icons ? window.Icons.check() : null),
              'No duplicates spotted — nicely done'
            )
      ),
      show('oldestWip') && h(StatCard, { title: 'Oldest WIPs', id: 'stats-oldestWip' },
        oldestWips && oldestWips.length > 0
          ? h('div', null,
              oldestWips.map((p, i) => {
                const days = Math.floor((Date.now() - new Date(p.lastTouchedAt).getTime()) / 86400000);
                return h('div', { key: p.id, onClick: () => navigateToProject(p.id), style: { display: 'flex', alignItems: 'center', gap:'var(--s-2)', padding: '6px 0', borderBottom: i < oldestWips.length - 1 ? '1px solid var(--border-subtle)' : 'none', cursor: 'pointer', fontSize:'var(--text-md)' } },
                  h('span', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)', width: 18, textAlign: 'right' } }, i + 1),
                  h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: 500 } }, p.name || 'Untitled'),
                  h('span', { style: { fontSize:'var(--text-xs)', color: days > 180 ? '#ef4444' : days > 60 ? '#f59e0b' : 'var(--text-tertiary)', whiteSpace: 'nowrap' } }, days + 'd · ' + p.pct + '%')
                );
              })
            )
          : oldestWip
            ? h('div', null,
                h('div', { style: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom:'var(--s-1)' } }, oldestWip.name),
                h('div', { style: { fontSize:'var(--text-sm)', color: 'var(--text-secondary)' } },
                  (() => { const days = Math.floor((Date.now() - new Date(oldestWip.lastTouchedAt).getTime()) / 86400000); return days + ' day' + (days !== 1 ? 's' : '') + ' since last touched'; })()
                ),
                h('div', { style: { fontSize:'var(--text-sm)', color: 'var(--text-tertiary)', marginTop: 2 } }, oldestWip.pct + '% complete')
              )
            : h('div', { style: { fontSize:'var(--text-md)', color: 'var(--text-secondary)' } }, 'No active projects right now')
      )
    ),

    // ── Final row: Stash Age, Most Used Colours ──────────────────
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, margin: '10px 0' } },
      show('stashAge') && h(StatCard, { title: 'Stash Age', id: 'stats-stashAge' },
        (ageData.bucketUnder1Yr > 0 || ageData.bucket1to3Yr > 0 || ageData.bucket3to5Yr > 0 || ageData.bucketOver5Yr > 0 || ageData.legacy > 0)
          ? h('div', null,
              h(AgeBar, { data: ageData }),
              ageData.oldest && h('div', { style: { display: 'flex', alignItems: 'center', gap:'var(--s-2)', fontSize:'var(--text-xs)', color: 'var(--text-secondary)', marginTop:'var(--s-2)' } },
                h(Swatch, { rgb: (function() { const k = ageData.oldest.id || ''; const ci = k.indexOf(':'); const br = ci >= 0 ? k.slice(0, ci) : 'dmc'; const bi = ci >= 0 ? k.slice(ci + 1) : k; const info = typeof findThreadInCatalog === 'function' ? findThreadInCatalog(br, bi) : null; return info ? info.rgb : null; })(), size: 14 }),
                h('span', null, 'Oldest tracked: ' + (ageData.oldest.name || ageData.oldest.id) + ' \u00b7 ' + new Date(ageData.oldest.addedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }))
              ),
              ageData.legacy > 0 && !ageData.bucketUnder1Yr && !ageData.bucket1to3Yr && !ageData.bucket3to5Yr && !ageData.bucketOver5Yr &&
                h('div', { style: { fontSize:'var(--text-sm)', color: 'var(--text-secondary)', marginTop:'var(--s-1)' } }, 'Most of your stash was added before tracking started. Newly-added threads will appear here')
            )
          : h('div', { style: { fontSize:'var(--text-md)', color: 'var(--text-secondary)' } }, 'Your stash is empty. Add threads to see age data')
      ),
      show('mostUsedColours') && h(StatCard, { title: 'Most-Used Colours', id: 'stats-mostUsedColours' },
        mostUsed.length > 0
          ? h('div', null,
              h('div', { style: { display: 'flex', gap:'var(--s-2)', marginBottom:'var(--s-2)' } },
                h('button', { onClick: () => setMostUsedFilter('year'), style: { fontSize:'var(--text-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid ' + (mostUsedFilter === 'year' ? 'var(--accent)' : 'var(--border)'), background: mostUsedFilter === 'year' ? 'var(--accent-light)' : 'var(--surface)', color: mostUsedFilter === 'year' ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 } }, 'This year'),
                h('button', { onClick: () => setMostUsedFilter('all'), style: { fontSize:'var(--text-xs)', padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid ' + (mostUsedFilter === 'all' ? 'var(--accent)' : 'var(--border)'), background: mostUsedFilter === 'all' ? 'var(--accent-light)' : 'var(--surface)', color: mostUsedFilter === 'all' ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 } }, 'All time')
              ),
              mostUsed.map((c, i) => h('div', { key: c.id, onClick: () => navigateToStashThread(c.id),
                style: {
                  display: 'flex', alignItems: 'center', gap:'var(--s-2)', padding: '5px 0',
                  borderBottom: i < mostUsed.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  cursor: 'pointer', fontSize:'var(--text-md)',
                  background: highlightThread && (c.id === highlightThread || c.id === (highlightThread.split(':')[1] || highlightThread)) ? 'var(--accent-light)' : 'transparent',
                  borderRadius: 4, paddingLeft: 4, marginLeft: -4
                } },
                h('span', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)', width: 18, textAlign: 'right' } }, i + 1),
                h(Swatch, { rgb: c.rgb }),
                h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, c.id + ' ' + c.name),
                h('span', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' } }, fmtNum(c.count) + ' (' + c.pct + '%)')
              ))
            )
          : h('div', { style: { fontSize:'var(--text-md)', color: 'var(--text-secondary)' } }, 'Start stitching in the tracker to see your most-used colours build up')
      )
    ),

    // ── Threads Never Used ────────────────────────────────────────
    show('threadsNeverUsed') && neverUsedData !== null && neverUsedData.count > 0 && h('div', { style: { margin: '10px 0' } },
      h(StatCard, { title: 'Threads Never Used', id: 'stats-threadsNeverUsed' },
        h('div', null,
          h('div', { className: 'gsd-metric-value' }, fmtNum(neverUsedData.count)),
          h('div', { className: 'gsd-metric-sub', style: { marginBottom: 10 } },
            'thread' + (neverUsedData.count === 1 ? '' : 's') + ' in your stash that\u2019ve never appeared in a project' +
            (neverUsedData.legacyCount > 0 ? ' (' + fmtNum(neverUsedData.legacyCount) + ' pre-tracking)' : '')
          ),
          neverUsedData.samples.length > 0 && h('div', { style: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom:'var(--s-2)' } },
            neverUsedData.samples.map(s =>
              h('div', { key: s.key, title: s.brand.toUpperCase() + ' ' + s.id + ' ' + s.name, style: { width: 24, height: 24, borderRadius: 4, background: 'rgb(' + s.rgb[0] + ',' + s.rgb[1] + ',' + s.rgb[2] + ')', border: '1px solid rgba(0,0,0,0.1)', flexShrink: 0 } })
            )
          ),
          onNavigateToStash && h('button', { onClick: () => onNavigateToStash(), style: { fontSize:'var(--text-xs)', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600, fontFamily: 'inherit' } }, 'View in stash \u2192')
        )
      )
    ),

    // ── Pattern Source Analysis ───────────────────────────────────
    show('patternSource') && patternSourceData && patternSourceData.hasAny && h('div', { style: { margin: '10px 0' } },
      h(StatCard, { title: 'Pattern Source', id: 'stats-patternSource' },
        h('div', null,
          h('div', { className: 'gsd-metric-sub', style: { marginBottom: 10 } }, 'Size breakdown of your ' + (patternSourceData.buckets.small + patternSourceData.buckets.medium + patternSourceData.buckets.large) + ' patterns'),
          h('div', { style: { display: 'flex', gap:'var(--s-2)', alignItems: 'flex-end', marginBottom:'var(--s-2)' } },
            (() => {
              const total = patternSourceData.buckets.small + patternSourceData.buckets.medium + patternSourceData.buckets.large;
              if (total === 0) return null;
              const bars = [
                { label: 'Small\n<5k', count: patternSourceData.buckets.small, color: '#34d399' },
                { label: 'Medium\n5k\u201325k', count: patternSourceData.buckets.medium, color: '#38bdf8' },
                { label: 'Large\n25k+', count: patternSourceData.buckets.large, color: '#818cf8' },
              ];
              const maxCount = Math.max(...bars.map(b => b.count), 1);
              return bars.map(bar => h('div', { key: bar.label, style: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap:'var(--s-1)', flex: 1 } },
                h('div', { style: { fontSize:'var(--text-xs)', fontWeight: 600, color: 'var(--text-primary)' } }, bar.count),
                h('div', { style: { width: '100%', height: Math.max(4, Math.round((bar.count / maxCount) * 60)), background: bar.color, borderRadius: '3px 3px 0 0' } }),
                h('div', { style: { fontSize: 9, color: 'var(--text-tertiary)', textAlign: 'center', whiteSpace: 'pre-line', lineHeight: 1.3 } }, bar.label)
              ));
            })()
          ),
          Object.keys(patternSourceData.designerMap).length >= 3 && h('div', { style: { marginTop:'var(--s-2)' } },
            h('div', { className: 'gsd-metric-sub', style: { marginBottom:'var(--s-1)' } }, 'Top designers'),
            Object.entries(patternSourceData.designerMap).sort(([,a],[,b]) => b - a).slice(0, 3).map(([name, count]) =>
              h('div', { key: name, style: { fontSize:'var(--text-sm)', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', padding: '2px 0' } },
                h('span', null, name), h('span', { style: { color: 'var(--text-tertiary)' } }, count)
              )
            )
          )
        )
      )
    ),

    // ── What should I work on next? ─────────────────────────────
    (show('useWhatYouHave') || show('buyingImpact')) && h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, margin: '10px 0' } },
      show('useWhatYouHave') && useWhatYouHaveRecs.length > 0 && h(StatCard, { title: 'Use What You Have', id: 'stats-useWhatYouHave' },
        h('div', null,
          h('div', { className: 'gsd-metric-sub', style: { marginBottom: 8 } }, 'Wishlist patterns that lean on threads already in your stash'),
          useWhatYouHaveRecs.map(r => h('div', { key: r.id, style: { padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize:'var(--text-md)' } },
            h('div', { style: { fontWeight: 600, color: 'var(--text-primary)' } }, r.title),
            h('div', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 } },
              r.matches + ' dormant thread' + (r.matches === 1 ? '' : 's') + ' would get used: ' + r.sampleNames.slice(0, 3).join(', ')
            )
          ))
        )
      ),
      show('buyingImpact') && buyingImpact.length > 0 && h(StatCard, { title: 'Highest-Impact Threads to Buy', id: 'stats-buyingImpact' },
        h('div', null,
          h('div', { className: 'gsd-metric-sub', style: { marginBottom: 8 } }, 'Each of these unlocks multiple wishlist patterns'),
          buyingImpact.slice(0, 6).map((t, i) => h('div', { key: t.id, style: { display: 'flex', alignItems: 'center', gap:'var(--s-2)', padding: '5px 0', borderBottom: i < Math.min(5, buyingImpact.length - 1) ? '1px solid var(--border-subtle)' : 'none', fontSize:'var(--text-md)' } },
            h(Swatch, { rgb: t.rgb }),
            h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, (t.brand || 'dmc').toUpperCase() + ' ' + t.id + ' · ' + t.name),
            h('span', { style: { fontSize:'var(--text-xs)', color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap' } }, 'unlocks ' + t.patternCount)
          ))
        )
      )
    ),

    // ── How does this all connect? ──────────────────────────────
    show('colourFingerprint') && colourFingerprint && h('div', { style: { margin: '10px 0' } },
      h(StatCard, { title: 'Your Colour Fingerprint', id: 'stats-colourFingerprint' },
        h(FingerprintBar, { jaccardPct: colourFingerprint.jaccardPct }),
        h('div', { style: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 8 } },
          h('div', null,
            h('div', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 } }, 'Used a lot but not stocked'),
            colourFingerprint.usedNotOwned.length > 0
              ? colourFingerprint.usedNotOwned.map(t => h('div', { key: t.id, style: { display: 'flex', alignItems: 'center', gap:'var(--s-2)', fontSize:'var(--text-sm)', color: 'var(--text-primary)', marginBottom: 3 } }, h(Swatch, { rgb: t.rgb, size: 16 }), 'DMC ' + t.id + (t.name ? ' \u2014 ' + t.name : '')))
              : h('div', { style: { fontSize:'var(--text-sm)', color: 'var(--text-tertiary)' } }, 'Stocked everything you use')
          ),
          h('div', null,
            h('div', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 } }, 'Stocked but rarely used'),
            colourFingerprint.ownedNotUsed.length > 0
              ? colourFingerprint.ownedNotUsed.map(t => h('div', { key: t.id, style: { display: 'flex', alignItems: 'center', gap:'var(--s-2)', fontSize:'var(--text-sm)', color: 'var(--text-primary)', marginBottom: 3 } }, h(Swatch, { rgb: t.rgb, size: 16 }), 'DMC ' + t.id + (t.name ? ' \u2014 ' + t.name : '')))
              : h('div', { style: { fontSize:'var(--text-sm)', color: 'var(--text-tertiary)' } }, 'Everything earns its place')
          )
        )
      )
    ),

    (show('designerLeaderboard') || show('brandAlignment')) && h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, margin: '10px 0' } },
      show('designerLeaderboard') && designerLeaderboard.length > 0 && h(StatCard, { title: 'Designer Leaderboard', id: 'stats-designerLeaderboard' },
        h('div', null,
          designerLeaderboard.map((d, i) => h('div', { key: d.name, style: { display: 'flex', alignItems: 'center', gap:'var(--s-2)', padding: '5px 0', borderBottom: i < designerLeaderboard.length - 1 ? '1px solid var(--border-subtle)' : 'none', fontSize:'var(--text-md)' } },
            h('span', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)', width: 18, textAlign: 'right' } }, i + 1),
            h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-primary)', fontWeight: 500 } }, d.name),
            h('span', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)', whiteSpace: 'nowrap' } }, d.total + ' · ' + d.finished + ' done')
          ))
        )
      ),
      show('brandAlignment') && brandAlignment && h(StatCard, { title: 'Brand Alignment', id: 'stats-brandAlignment' },
        h('div', null,
          h('div', { className: 'gsd-metric-value' }, brandAlignment.pct + '%'),
          h('div', { className: 'gsd-metric-sub', style: { marginBottom: 8 } }, 'of wishlist threads match your preferred brand (' + brandAlignment.preferredBrand.toUpperCase() + ')'),
          brandAlignment.conflicts.length > 0 && h('div', null,
            h('div', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)', marginBottom: 4 } }, 'Patterns that’ll need conversion'),
            brandAlignment.conflicts.slice(0, 4).map(c => h('div', { key: c.id, style: { fontSize:'var(--text-sm)', color: 'var(--text-primary)', display: 'flex', justifyContent: 'space-between', padding: '2px 0' } },
              h('span', { style: { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 } }, c.title),
              h('span', { style: { color: '#f59e0b', fontSize:'var(--text-xs)', marginLeft: 8 } }, c.brand.toUpperCase() + ' ' + c.pct + '%')
            ))
          )
        )
      )
    ),

    show('quarterPortfolio') && quarterPortfolio.length > 0 && h('div', { style: { margin: '10px 0' } },
      h(StatCard, { title: 'Started vs Finished by Quarter', id: 'stats-quarterPortfolio' },
        h(QuarterAreaChart, { data: quarterPortfolio })
      )
    ),

    show('difficultyVsCompletion') && difficultyPoints.length >= 3 && h('div', { style: { margin: '10px 0' } },
      h(StatCard, { title: 'Difficulty vs Completion', id: 'stats-difficultyVsCompletion' },
        h('div', { className: 'gsd-metric-sub', style: { marginBottom: 6 } }, 'Each dot is a project — hover for details'),
        h(DifficultyScatter, { points: difficultyPoints })
      )
    ),

    // ── Modals ───────────────────────────────────────────────────
    showCustomise && h(CustomiseModal, { visibility, onChange: handleVisibilityChange, onClose: () => setShowCustomise(false) }),
    showShareCard && h(ShareCardModal, { lifetimeStitches, onClose: () => setShowShareCard(false) })
  );
}

window.StatsPage = StatsPage;
