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
  sableIndex: true,
  stashComposition: true,
  readyToStart: true,
  duplicateRisk: true,
  oldestWip: true,
  stashAge: true,
  mostUsedColours: true
};

const SECTION_LABELS = {
  lifetimeStitches: 'Lifetime Stitches',
  activeProjects: 'Active Projects',
  finishedThisYear: 'Finished This Year',
  coverage: 'Coverage Ratio',
  sableIndex: 'SABLE Index',
  stashComposition: 'Stash Composition',
  readyToStart: 'Ready to Start',
  duplicateRisk: 'Duplicate Alerts',
  oldestWip: 'Oldest WIP',
  stashAge: 'Stash Age',
  mostUsedColours: 'Most-Used Colours'
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

// ── Helper: format number with thousands separator ───────────────
function fmtNum(n) { return n.toLocaleString('en-GB'); }

// ── Helper: thread km novelty calc ───────────────────────────────
// 14-count Aida: 1 cross = 2 diagonals ≈ 4mm total thread per stitch
function threadKm(stitches) { return Math.round(stitches * 0.004 / 1000 * 10) / 10; }

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
    ticks.map(t => h('line', { key: t, x1: PX, y1: toY(t), x2: W - 10, y2: toY(t), stroke: '#e2e8f0', strokeWidth: 1 })),
    ticks.map(t => h('text', { key: 't' + t, x: PX - 6, y: toY(t) + 4, textAnchor: 'end', fontSize: 10, fill: '#64748b' }, t)),
    // Month labels
    data.map((d, i) => i % 2 === 0 ? h('text', { key: 'l' + i, x: toX(i), y: H - 4, textAnchor: 'middle', fontSize: 9, fill: '#64748b' }, d.month.slice(5)) : null),
    // Lines
    h('polyline', { points: addedPts, fill: 'none', stroke: '#f59e0b', strokeWidth: 2, strokeLinejoin: 'round' }),
    h('polyline', { points: usedPts, fill: 'none', stroke: '#0d9488', strokeWidth: 2, strokeLinejoin: 'round' }),
    // Legend
    h('line', { x1: PX, y1: 8, x2: PX + 16, y2: 8, stroke: '#f59e0b', strokeWidth: 2 }),
    h('text', { x: PX + 20, y: 11, fontSize: 10, fill: '#64748b' }, 'Added'),
    h('line', { x1: PX + 64, y1: 8, x2: PX + 80, y2: 8, stroke: '#0d9488', strokeWidth: 2 }),
    h('text', { x: PX + 84, y: 11, fontSize: 10, fill: '#64748b' }, 'Used')
  );
}

function HueWheel({ bins, neutral }) {
  const R = 70, CX = 90, CY = 90, IR = 35;
  const total = bins.reduce((s, b) => s + b, 0) + neutral;
  if (total === 0) return null;
  const hueColors = ['#f87171','#fb923c','#fbbf24','#a3e635','#4ade80','#34d399','#22d3ee','#38bdf8','#818cf8','#a78bfa','#e879f9','#fb7185'];
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
    neutral > 0 && h('circle', { cx: CX, cy: CY, r: IR - 4, fill: '#94a3b8', opacity: 0.6 }),
    h('text', { x: CX, y: CY + 4, textAnchor: 'middle', fontSize: 11, fill: '#475569', fontWeight: 600 }, fmtNum(total)),
    h('text', { x: CX, y: CY + 16, textAnchor: 'middle', fontSize: 9, fill: '#64748b' }, 'threads')
  );
}

function AgeBar({ data }) {
  const buckets = [
    { key: 'bucketUnder1Yr', label: '<1 yr', color: '#34d399' },
    { key: 'bucket1to3Yr', label: '1–3 yr', color: '#38bdf8' },
    { key: 'bucket3to5Yr', label: '3–5 yr', color: '#818cf8' },
    { key: 'bucketOver5Yr', label: '5+ yr', color: '#f472b6' },
    { key: 'legacy', label: 'Before tracking', color: '#94a3b8' }
  ];
  const total = buckets.reduce((s, b) => s + (data[b.key] || 0), 0);
  if (total === 0) return null;
  return h('div', null,
    h('div', { style: { display: 'flex', borderRadius: 6, overflow: 'hidden', height: 24, marginBottom: 8 } },
      buckets.map(b => {
        const pct = (data[b.key] || 0) / total * 100;
        if (pct === 0) return null;
        return h('div', { key: b.key, style: { width: pct + '%', background: b.color, minWidth: pct > 3 ? 'auto' : 2 }, title: `${b.label}: ${data[b.key]}` });
      })
    ),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '6px 14px', fontSize: 11, color: '#475569' } },
      buckets.filter(b => data[b.key] > 0).map(b =>
        h('span', { key: b.key, style: { display: 'flex', alignItems: 'center', gap: 4 } },
          h('span', { style: { width: 8, height: 8, borderRadius: 2, background: b.color, display: 'inline-block' } }),
          b.label + ': ' + data[b.key]
        )
      )
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
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);
  return h('div', { className: 'modal-overlay', onClick: onClose },
    h('div', { className: 'modal-content', onClick: e => e.stopPropagation(), style: { maxWidth: 400, maxHeight: '80vh', overflowY: 'auto' } },
      h('button', { className: 'modal-close', onClick: onClose, 'aria-label': 'Close' }, '×'),
      h('h3', { style: { marginTop: 0, marginBottom: 12, fontSize: 18, color: 'var(--text-primary)' } }, 'Customise Stats'),
      h('p', { style: { fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 } }, 'Show or hide sections on your stats page.'),
      Object.entries(SECTION_LABELS).map(([key, label]) =>
        h('label', { key, style: { display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize: 14 } },
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

  useEffect(() => {
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
      ctx.strokeStyle = '#0d9488';
      ctx.lineWidth = 6;
      ctx.strokeRect(40, 40, W - 80, H - 80);
      // Inner decorative cross-stitch pattern
      ctx.fillStyle = '#e2e8f0';
      for (let x = 80; x < W - 80; x += 30) {
        ctx.fillRect(x, 70, 4, 4);
        ctx.fillRect(x, H - 74, 4, 4);
      }
      // Title
      ctx.fillStyle = '#64748b';
      ctx.font = '600 32px Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('LIFETIME STITCHES', W / 2, 280);
      // Main number
      ctx.fillStyle = '#1e293b';
      ctx.font = '800 120px Inter, system-ui, sans-serif';
      ctx.fillText(fmtNum(lifetimeStitches), W / 2, 480);
      // Thread length
      const km = threadKm(lifetimeStitches);
      ctx.fillStyle = '#0d9488';
      ctx.font = '500 36px Inter, system-ui, sans-serif';
      ctx.fillText(`≈ ${km} km of thread`, W / 2, 560);
      // Cross-stitch icon area
      ctx.fillStyle = '#e2e8f0';
      const cx = W / 2, cy = 680;
      for (let i = -3; i <= 3; i++) {
        for (let j = -1; j <= 1; j++) {
          ctx.fillRect(cx + i * 22 - 8, cy + j * 22 - 8, 16, 16);
        }
      }
      ctx.fillStyle = '#0d9488';
      ctx.fillRect(cx - 8, cy - 8, 16, 16);
      // Watermark
      ctx.fillStyle = '#94a3b8';
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

  return h('div', { className: 'modal-overlay', onClick: onClose },
    h('div', { className: 'modal-content', onClick: e => e.stopPropagation(), style: { maxWidth: 480, textAlign: 'center' } },
      h('button', { className: 'modal-close', onClick: onClose, 'aria-label': 'Close' }, '×'),
      h('h3', { style: { marginTop: 0, marginBottom: 12, fontSize: 18, color: 'var(--text-primary)' } }, 'Share Your Stats'),
      h('canvas', { ref: canvasRef, style: { width: '100%', maxWidth: 360, borderRadius: 8, border: '1px solid var(--border)', marginBottom: 12 } }),
      rendered && h('div', { style: { display: 'flex', gap: 8, justifyContent: 'center' } },
        h('button', { onClick: handleDownload, style: { padding: '8px 16px', background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' } }, 'Download PNG'),
        h('button', { onClick: handleCopy, style: { padding: '8px 16px', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 13, fontWeight: 600, cursor: 'pointer' } }, 'Copy to Clipboard')
      )
    )
  );
}

// ── Main StatsPage component ─────────────────────────────────────
function StatsPage({ onClose, onNavigateToProject, onNavigateToStash }) {
  // Tab: 'stitching' (original GlobalStatsDashboard) | 'stash' (new stash analytics)
  const initialTab = useMemo(() => {
    const p = new URLSearchParams(window.location.search);
    return p.get('tab') === 'stash' ? 'stash' : 'stitching';
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

      // Compute coverage ratio
      await computeCoverage(results[2]);

      setLoading(false);
    }

    async function computeCoverage(stashData) {
      if (typeof ProjectStorage === 'undefined') return;
      try {
        const metas = await ProjectStorage.listProjects();
        let totalThreads = 0, coveredThreads = 0;
        for (const meta of metas) {
          const proj = await ProjectStorage.get(meta.id);
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
            const compositeKey = tid.indexOf(':') >= 0 ? tid : 'dmc:' + tid;
            const entry = stashData[compositeKey];
            if (entry && entry.owned > 0) { coveredThreads++; continue; }
            // Check cross-brand substitutes
            let found = false;
            if (typeof rgbToLab === 'function' && typeof dE2000 === 'function') {
              const threadInfo = typeof DMC !== 'undefined' ? DMC.find(d => d.id === tid) : null;
              if (threadInfo) {
                const targetLab = threadInfo.lab || rgbToLab(threadInfo.rgb[0], threadInfo.rgb[1], threadInfo.rgb[2]);
                for (const [sKey, sEntry] of Object.entries(stashData)) {
                  if (!sEntry.owned || sEntry.owned <= 0 || sKey === compositeKey) continue;
                  const parsed = sKey.indexOf(':') >= 0 ? { brand: sKey.split(':')[0], id: sKey.split(':').slice(1).join(':') } : { brand: 'dmc', id: sKey };
                  let info = null;
                  if (parsed.brand === 'anchor' && typeof ANCHOR !== 'undefined') info = ANCHOR.find(d => d.id === parsed.id);
                  else if (typeof DMC !== 'undefined') info = DMC.find(d => d.id === parsed.id);
                  if (!info) continue;
                  const lab = info.lab || rgbToLab(info.rgb[0], info.rgb[1], info.rgb[2]);
                  if (dE2000(targetLab, lab) < 6) { found = true; break; }
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
    return () => { cancelled = true; };
  }, []);

  // Parse URL params for highlighting
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const highlightSection = urlParams.get('highlight');
  const highlightThread = urlParams.get('thread');

  // Scroll to highlighted section on mount
  useEffect(() => {
    if (!loading && highlightSection) {
      const el = document.getElementById('stats-' + highlightSection);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
  }, [loading, highlightSection]);

  // Derived stats
  const activeCount = useMemo(() => {
    return projects.filter(p => {
      // Without finishStatus, count anything that has stitches
      return true; // We count from the full project list — real filtering happens below
    }).length;
  }, [projects]);

  // We need to load full projects for finishStatus - use a secondary load
  const [projectDetails, setProjectDetails] = useState([]);
  useEffect(() => {
    if (typeof ProjectStorage === 'undefined') return;
    let cancelled = false;
    async function loadDetails() {
      const metas = await ProjectStorage.listProjects();
      const details = [];
      for (const m of metas) {
        const p = await ProjectStorage.get(m.id);
        if (p) details.push({ id: p.id, name: p.name, finishStatus: p.finishStatus || 'active', completedAt: p.completedAt, startedAt: p.startedAt });
      }
      if (!cancelled) setProjectDetails(details);
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
      let info = null;
      if (parsed.brand === 'anchor' && typeof ANCHOR !== 'undefined') info = ANCHOR.find(d => d.id === parsed.id);
      else if (typeof DMC !== 'undefined') info = DMC.find(d => d.id === parsed.id);
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

  // SABLE headline
  const sableHeadline = useMemo(() => {
    if (sableData.length < 3) return null;
    const totalAdded = sableData.reduce((s, d) => s + d.added, 0);
    const totalUsed = sableData.reduce((s, d) => s + d.used, 0);
    if (totalUsed === 0 && totalAdded === 0) return null;
    const ratio = totalUsed > 0 ? totalAdded / totalUsed : totalAdded > 0 ? Infinity : 1;
    if (ratio > 1.5) return { text: `Adding ${Math.round(ratio * 10) / 10}× the rate of using`, color: '#f59e0b' };
    if (ratio >= 0.8) return { text: 'About balanced', color: '#0d9488' };
    return { text: 'Using more than adding', color: '#0d9488' };
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
        let info = null;
        if (parsed.brand === 'anchor' && typeof ANCHOR !== 'undefined') info = ANCHOR.find(d => d.id === parsed.id);
        else if (typeof DMC !== 'undefined') info = DMC.find(d => d.id === parsed.id);
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
          if (p.brand === 'anchor' && typeof ANCHOR !== 'undefined') return ANCHOR.find(d => d.id === p.id);
          return typeof DMC !== 'undefined' ? DMC.find(d => d.id === p.id) : null;
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

  // ── Shared tab bar (built after all hooks) ────────────────────
  const tabBar = h('div', { className: 'gsd-tabs', style: { paddingTop: 8 } },
    h('div', { className: 'gsd-tabs-inner' },
      h('button', { className: 'gsd-tab' + (tab === 'stitching' ? ' gsd-tab--on' : ''), onClick: () => switchTab('stitching') }, 'Stitching'),
      h('button', { className: 'gsd-tab' + (tab === 'stash' ? ' gsd-tab--on' : ''), onClick: () => switchTab('stash') }, 'Stash')
    )
  );

  // ── Stitching tab: delegate to GlobalStatsDashboard ──────────
  if (tab === 'stitching') {
    return h('div', null, tabBar, h(GlobalStatsDashboard, { onClose }));
  }

  if (loading) {
    return h('div', { className: 'gsd', style: { padding: 40, textAlign: 'center', color: 'var(--text-secondary)' } },
      tabBar,
      h('div', { style: { padding: 40, textAlign: 'center', color: 'var(--text-secondary)' } },
        h('div', { style: { width: 28, height: 28, border: '2.5px solid #e2e8f0', borderTopColor: '#0d9488', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' } }),
        'Loading stats…'
      )
    );
  }

  // ── Render ──────────────────────────────────────────────────────
  return h('div', { className: 'gsd', style: { paddingBottom: 40 } },
    tabBar,
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'flex-end', padding: '8px 0 4px' } },
      h('button', { onClick: () => setShowCustomise(true), style: { padding: '6px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' } }, 'Customise')
    ),

    // ── Top row: 4 metric cards ──────────────────────────────────
    h('div', { className: 'gsd-metrics' },
      show('lifetimeStitches') && h(StatCard, { title: 'Lifetime Stitches', id: 'stats-lifetimeStitches' },
        lifetimeStitches > 0
          ? h('div', null,
              h('div', { className: 'gsd-metric-value' }, fmtNum(lifetimeStitches)),
              h('div', { className: 'gsd-metric-sub' }, '≈ ' + threadKm(lifetimeStitches) + ' km of thread'),
              h('div', { style: { marginTop: 6, display: 'flex', gap: 6 } },
                h('button', { onClick: e => { e.stopPropagation(); setShowShareCard(true); }, style: { fontSize: 11, padding: '3px 8px', background: 'var(--accent-light)', color: 'var(--accent)', border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontWeight: 600 } }, 'Share card')
              ),
              h('div', { style: { fontSize: 10, color: 'var(--text-tertiary)', marginTop: 4 } }, 'Tracked since April 2026')
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
              h('div', { className: 'gsd-metric-value', style: { color: coverageRatio >= 80 ? '#0d9488' : coverageRatio >= 50 ? '#f59e0b' : '#ef4444' } }, coverageRatio + '%'),
              h('div', { className: 'gsd-metric-sub' }, 'of threads needed are in your stash')
            )
          : h('div', null,
              h('div', { className: 'gsd-metric-value', style: { color: 'var(--text-tertiary)' } }, '—'),
              h('div', { className: 'gsd-metric-sub' }, 'Add a pattern to see how your stash covers it')
            )
      )
    ),

    // ── Middle row: SABLE + Hue Wheel ────────────────────────────
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, margin: '10px 0' } },
      show('sableIndex') && h(StatCard, { title: 'SABLE Index', id: 'stats-sableIndex', style: { minHeight: 200 } },
        sableData.length >= 3
          ? h('div', null,
              sableHeadline && h('div', { style: { fontSize: 14, fontWeight: 600, color: sableHeadline.color, marginBottom: 8 } }, sableHeadline.text),
              h(SableChart, { data: sableData }),
              h('div', { style: { fontSize: 10, color: 'var(--text-tertiary)', marginTop: 6 } }, 'SABLE = Stash Accumulated Beyond Life Expectancy')
            )
          : h('div', { style: { fontSize: 13, color: 'var(--text-secondary)', padding: '20px 0' } },
              'Tracking since April 2026 — check back in a few months for a trend'
            )
      ),
      show('stashComposition') && h(StatCard, { title: 'Stash Composition', id: 'stats-stashComposition', style: { minHeight: 200, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' } },
        (hueData.bins.some(b => b > 0) || hueData.neutral > 0)
          ? h(HueWheel, { bins: hueData.bins, neutral: hueData.neutral })
          : h('div', { style: { fontSize: 13, color: 'var(--text-secondary)', padding: '20px 0' } },
              'Your stash is empty. Add threads to see your palette'
            )
      )
    ),

    // ── Bottom row: Ready to start, Duplicates, Oldest WIP ──────
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 10, margin: '10px 0' } },
      show('readyToStart') && h(StatCard, { title: 'Ready to Start', id: 'stats-readyToStart' },
        (() => {
          const full = readyToStart.filter(p => p.pct === 100);
          const nearly = readyToStart.filter(p => p.pct >= 80 && p.pct < 100);
          if (full.length === 0 && !readyExpanded) return h('div', { style: { fontSize: 13, color: 'var(--text-secondary)' } }, "Nothing fully kitted yet. Check individual patterns to see what's missing");
          const shown = readyExpanded ? readyToStart : full.slice(0, 3);
          return h('div', null,
            shown.map(p => h('div', { key: p.id, onClick: () => navigateToProject(p.id), style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', cursor: 'pointer', fontSize: 13 } },
              h('span', { style: { color: p.pct === 100 ? '#0d9488' : '#f59e0b', fontWeight: 600, minWidth: 36 } }, p.pct + '%'),
              h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, p.title || 'Untitled'),
              h('span', { style: { fontSize: 11, color: 'var(--text-tertiary)' } }, p.totalThreads + ' threads')
            )),
            (nearly.length > 0 || full.length > 3) && !readyExpanded && h('button', { onClick: () => setReadyExpanded(true), style: { fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, padding: 0 } }, 'See all (' + readyToStart.length + ')'),
            readyExpanded && h('button', { onClick: () => setReadyExpanded(false), style: { fontSize: 11, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', marginTop: 4, padding: 0 } }, 'Show less')
          );
        })()
      ),
      show('duplicateRisk') && h(StatCard, { title: 'Duplicate Alerts', id: 'stats-duplicateRisk' },
        duplicates.length > 0
          ? h('div', null,
              duplicates.slice(0, 5).map(d => h('div', { key: d.key, style: { display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 } },
                h(Swatch, { rgb: d.rgb }),
                h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
                  d.brand.toUpperCase() + ' ' + d.id,
                  d.type === 'repeat' && h('span', { style: { fontSize: 11, color: 'var(--text-tertiary)', marginLeft: 4 } }, d.addCount + ' adds'),
                  d.type === 'near' && h('span', { style: { fontSize: 11, color: '#f59e0b', marginLeft: 4 } }, 'near-duplicate')
                ),
                h('span', { style: { fontSize: 11, color: 'var(--text-tertiary)' } }, 'owns ' + d.owned),
                h('button', { onClick: () => handleDismiss(d.key), 'aria-label': 'Dismiss', style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16, padding: '0 4px', lineHeight: 1 } }, '×')
              ))
            )
          : h('div', { style: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: 'var(--text-secondary)' } },
              h('span', { style: { color: '#0d9488', fontSize: 18 } }, '✓'),
              'No duplicates spotted — nicely done'
            )
      ),
      show('oldestWip') && h(StatCard, { title: 'Oldest WIP', id: 'stats-oldestWip', onClick: oldestWip ? () => navigateToProject(oldestWip.id) : undefined },
        oldestWip
          ? h('div', null,
              h('div', { style: { fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 4 } }, oldestWip.name),
              h('div', { style: { fontSize: 12, color: 'var(--text-secondary)' } },
                (() => {
                  const days = Math.floor((Date.now() - new Date(oldestWip.lastTouchedAt).getTime()) / 86400000);
                  return days + ' day' + (days !== 1 ? 's' : '') + ' since last touched';
                })()
              ),
              h('div', { style: { fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 } }, oldestWip.pct + '% complete (' + fmtNum(oldestWip.completedStitches) + ' / ' + fmtNum(oldestWip.totalStitches) + ')')
            )
          : h('div', { style: { fontSize: 13, color: 'var(--text-secondary)' } }, 'No active projects right now')
      )
    ),

    // ── Final row: Stash Age, Most Used Colours ──────────────────
    h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 10, margin: '10px 0' } },
      show('stashAge') && h(StatCard, { title: 'Stash Age', id: 'stats-stashAge' },
        (ageData.bucketUnder1Yr > 0 || ageData.bucket1to3Yr > 0 || ageData.bucket3to5Yr > 0 || ageData.bucketOver5Yr > 0 || ageData.legacy > 0)
          ? h('div', null,
              h(AgeBar, { data: ageData }),
              ageData.oldest && h('div', { style: { fontSize: 11, color: 'var(--text-secondary)', marginTop: 8 } },
                'Oldest tracked: ' + (ageData.oldest.name || ageData.oldest.id) + ' · ' + new Date(ageData.oldest.addedAt).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })
              ),
              ageData.legacy > 0 && !ageData.bucketUnder1Yr && !ageData.bucket1to3Yr && !ageData.bucket3to5Yr && !ageData.bucketOver5Yr &&
                h('div', { style: { fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 } }, 'Most of your stash was added before tracking started. Newly-added threads will appear here')
            )
          : h('div', { style: { fontSize: 13, color: 'var(--text-secondary)' } }, 'Your stash is empty. Add threads to see age data')
      ),
      show('mostUsedColours') && h(StatCard, { title: 'Most-Used Colours', id: 'stats-mostUsedColours' },
        mostUsed.length > 0
          ? h('div', null,
              h('div', { style: { display: 'flex', gap: 8, marginBottom: 8 } },
                h('button', { onClick: () => setMostUsedFilter('year'), style: { fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid ' + (mostUsedFilter === 'year' ? 'var(--accent)' : 'var(--border)'), background: mostUsedFilter === 'year' ? 'var(--accent-light)' : 'var(--surface)', color: mostUsedFilter === 'year' ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 } }, 'This year'),
                h('button', { onClick: () => setMostUsedFilter('all'), style: { fontSize: 11, padding: '2px 8px', borderRadius: 'var(--radius-sm)', border: '1px solid ' + (mostUsedFilter === 'all' ? 'var(--accent)' : 'var(--border)'), background: mostUsedFilter === 'all' ? 'var(--accent-light)' : 'var(--surface)', color: mostUsedFilter === 'all' ? 'var(--accent)' : 'var(--text-secondary)', cursor: 'pointer', fontWeight: 600 } }, 'All time')
              ),
              mostUsed.map((c, i) => h('div', { key: c.id, onClick: () => navigateToStashThread(c.id),
                style: {
                  display: 'flex', alignItems: 'center', gap: 8, padding: '5px 0',
                  borderBottom: i < mostUsed.length - 1 ? '1px solid var(--border-subtle)' : 'none',
                  cursor: 'pointer', fontSize: 13,
                  background: highlightThread && (c.id === highlightThread || c.id === (highlightThread.split(':')[1] || highlightThread)) ? 'var(--accent-light)' : 'transparent',
                  borderRadius: 4, paddingLeft: 4, marginLeft: -4
                } },
                h('span', { style: { fontSize: 11, color: 'var(--text-tertiary)', width: 18, textAlign: 'right' } }, i + 1),
                h(Swatch, { rgb: c.rgb }),
                h('span', { style: { flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, c.id + ' ' + c.name),
                h('span', { style: { fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' } }, fmtNum(c.count) + ' (' + c.pct + '%)')
              ))
            )
          : h('div', { style: { fontSize: 13, color: 'var(--text-secondary)' } }, 'Start stitching in the tracker to see your most-used colours build up')
      )
    ),

    // ── Modals ───────────────────────────────────────────────────
    showCustomise && h(CustomiseModal, { visibility, onChange: handleVisibilityChange, onClose: () => setShowCustomise(false) }),
    showShareCard && h(ShareCardModal, { lifetimeStitches, onClose: () => setShowShareCard(false) })
  );
}

window.StatsPage = StatsPage;
