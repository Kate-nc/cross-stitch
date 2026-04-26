// stats-showcase.js — Stats Showcase (Layout A)
// Exposes window.StatsShowcase as the main component.
// Uses h = React.createElement convention, compiled via Babel at runtime.
// Design philosophy: ritual, not dashboard. Photo album, not bathroom scale.

const { useState, useEffect, useMemo, useCallback, useRef } = React;
const h = React.createElement;

// ── Constants ────────────────────────────────────────────────────
const LEGACY_EPOCH = '2020-01-01T00:00:00Z';
const THREE_MONTHS_MS = 90 * 24 * 60 * 60 * 1000;
const BANNER_DISMISSED_KEY = 'showcase_tracking_banner_v1';

// ── Helpers ──────────────────────────────────────────────────────
function fmtNum(n) { return (n || 0).toLocaleString(); }

function threadKm(stitches) {
  // Each cross stitch uses ~3.2cm of thread at 14ct
  const cm = stitches * 3.2;
  const km = Math.round(cm / 1000 * 10) / 10;
  return km;
}

function fmtMonthShort(yyyyMm) {
  const [y, m] = yyyyMm.split('-');
  return new Date(+y, +m - 1, 1).toLocaleString('default', { month: 'short' });
}

function daysBetween(dateA, dateB) {
  return Math.floor((dateB - dateA) / 86400000);
}

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

function isBannerDismissed() {
  try { return localStorage.getItem(BANNER_DISMISSED_KEY) === '1'; } catch(e) { return false; }
}
function persistBannerDismissed() {
  try { localStorage.setItem(BANNER_DISMISSED_KEY, '1'); } catch(e) {}
}

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

function hasMeaningfulAgeData(ageData) {
  return ((ageData.bucketUnder1Yr || 0) + (ageData.bucket1to3Yr || 0) +
          (ageData.bucket3to5Yr || 0) + (ageData.bucketOver5Yr || 0)) > 0;
}

function sableSentence(sableData) {
  if (!sableData || sableData.length < 3) return null;
  const totalAdded = sableData.reduce((s, d) => s + d.added, 0);
  const totalUsed = sableData.reduce((s, d) => s + d.used, 0);
  if (totalUsed === 0 && totalAdded === 0) return null;
  const ratio = totalUsed > 0 ? totalAdded / totalUsed : totalAdded > 0 ? Infinity : 1;
  if (!isFinite(ratio) || ratio > 1.5)
    return `You're adding thread ${isFinite(ratio) ? Math.round(ratio * 10) / 10 + '×' : 'much'} faster than you're using it.`;
  if (ratio >= 0.8) return 'Your stash is beautifully balanced — adding and using in equal measure.';
  return "You're making real progress through your stash.";
}

// ── SABLE Line Chart ─────────────────────────────────────────────
function SableLineChart({ data }) {
  if (!data || data.length < 2) return null;
  const W = 600, H = 160, PAD = { top: 16, right: 12, bottom: 32, left: 36 };
  const IW = W - PAD.left - PAD.right;
  const IH = H - PAD.top - PAD.bottom;
  const maxVal = Math.max(...data.map(d => Math.max(d.added, d.used)), 1);

  function x(i) { return PAD.left + (i / (data.length - 1)) * IW; }
  function y(v) { return PAD.top + IH - (v / maxVal) * IH; }

  const addedPts = data.map((d, i) => `${x(i)},${y(d.added)}`).join(' ');
  const usedPts = data.map((d, i) => `${x(i)},${y(d.used)}`).join(' ');

  // Show every other label to avoid crowding
  const labels = data.map((d, i) => {
    if (i % 2 !== 0 && i !== data.length - 1) return null;
    return h('text', { key: i, x: x(i), y: H - 4, textAnchor: 'middle', fontSize: 10, fill: 'var(--text-tertiary)' }, fmtMonthShort(d.month));
  });

  return h('div', { style: { marginTop:'var(--s-4)' } },
    h('svg', {
      viewBox: `0 0 ${W} ${H}`,
      style: { width: '100%', maxWidth: W, display: 'block' },
      role: 'img',
      'aria-label': `Line chart showing thread acquisition and usage over the past ${data.length} months`
    },
      // Grid lines
      [0.25, 0.5, 0.75, 1].map(f =>
        h('line', { key: f, x1: PAD.left, x2: W - PAD.right, y1: PAD.top + IH * (1 - f), y2: PAD.top + IH * (1 - f), stroke: 'var(--border)', strokeWidth: 1 })
      ),
      // Added line (teal)
      h('polyline', { points: addedPts, fill: 'none', stroke: 'var(--accent)', strokeWidth: 2.5, strokeLinejoin: 'round', strokeLinecap: 'round' }),
      // Used line (muted green)
      h('polyline', { points: usedPts, fill: 'none', stroke: '#6ee7b7', strokeWidth: 2, strokeLinejoin: 'round', strokeLinecap: 'round', strokeDasharray: '5 3' }),
      // Dots — added
      data.map((d, i) => h('circle', { key: 'a' + i, cx: x(i), cy: y(d.added), r: 3, fill: 'var(--accent)' })),
      // Dots — used
      data.map((d, i) => d.used > 0 && h('circle', { key: 'u' + i, cx: x(i), cy: y(d.used), r: 2.5, fill: '#6ee7b7' })),
      // X-axis labels
      ...labels
    ),
    // Legend
    h('div', { style: { display: 'flex', gap: 20, marginTop: 6, fontSize:'var(--text-xs)', color: 'var(--text-tertiary)' } },
      h('span', { style: { display: 'flex', alignItems: 'center', gap: 5 } },
        h('span', { style: { display: 'inline-block', width: 20, height: 2.5, background: 'var(--accent)', borderRadius: 2 } }),
        'Added'
      ),
      h('span', { style: { display: 'flex', alignItems: 'center', gap: 5 } },
        h('span', { style: { display: 'inline-block', width: 20, height: 2, background: '#6ee7b7', borderRadius: 2 } }),
        'Used'
      )
    )
  );
}

// ── Stash age bar ────────────────────────────────────────────────
function AgeBar({ ageData }) {
  const buckets = [
    { key: 'bucketUnder1Yr', label: '<1 yr', color: '#88B077' },
    { key: 'bucket1to3Yr',   label: '1–3 yr', color: '#38bdf8' },
    { key: 'bucket3to5Yr',   label: '3–5 yr', color: '#818cf8' },
    { key: 'bucketOver5Yr',  label: '5+ yr',  color: 'var(--accent-light)' },
  ];
  const total = buckets.reduce((s, b) => s + (ageData[b.key] || 0), 0);
  if (total === 0) return null;
  const ariaText = buckets.map(b => {
    const pct = Math.round((ageData[b.key] || 0) / total * 100);
    return `${pct}% ${b.label}`;
  }).join(', ');
  return h('div', null,
    h('div', {
      style: { display: 'flex', borderRadius:'var(--radius-md)', overflow: 'hidden', height: 28 },
      role: 'img',
      'aria-label': `Stash age distribution: ${ariaText}`
    },
      buckets.map(b => {
        const pct = (ageData[b.key] || 0) / total * 100;
        if (pct === 0) return null;
        return h('div', { key: b.key, style: { width: pct + '%', background: b.color }, title: `${b.label}: ${ageData[b.key]}` });
      })
    ),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: '8px 20px', marginTop: 10, fontSize:'var(--text-sm)', color: 'var(--text-tertiary)' } },
      buckets.filter(b => (ageData[b.key] || 0) > 0).map(b => {
        const pct = Math.round((ageData[b.key] || 0) / total * 100);
        return h('span', { key: b.key, style: { display: 'flex', alignItems: 'center', gap: 5 } },
          h('span', { style: { width: 10, height: 10, borderRadius: 2, background: b.color, display: 'inline-block' } }),
          `${b.label} — ${pct}%`
        );
      })
    )
  );
}

// ── Pattern chip ─────────────────────────────────────────────────
function PatternChip({ pattern }) {
  return h('div', { style: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius:'var(--radius-xl)', padding: '10px 14px', minWidth: 0 } },
    h('div', { style: { fontSize:'var(--text-md)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, pattern.title || 'Untitled'),
    h('div', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)' } }, `${pattern.coveredThreads}/${pattern.totalThreads} threads ready`)
  );
}

// ── Section divider ──────────────────────────────────────────────
function Divider() {
  return h('hr', { style: { border: 'none', borderTop: '1px solid var(--border)', opacity: 0.3, margin: '40px 0' } });
}

// ── Section label ────────────────────────────────────────────────
function SectionLabel({ children }) {
  return h('div', { style: { fontSize:'var(--text-xs)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 10 } }, children);
}

// ── Share button ─────────────────────────────────────────────────
function ShareBtn({ onClick }) {
  return h('button', {
    onClick,
    'aria-label': 'Share this section',
    title: 'Share this section',
    style: { background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', color: 'var(--text-tertiary)', fontSize:'var(--text-lg)', borderRadius:'var(--radius-sm)', display: 'inline-flex', alignItems: 'center', gap:'var(--s-1)' }
  },
    h('svg', { width: 15, height: 15, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true' },
      h('circle', { cx: 18, cy: 5, r: 3 }),
      h('circle', { cx: 6, cy: 12, r: 3 }),
      h('circle', { cx: 18, cy: 19, r: 3 }),
      h('line', { x1: 8.59, y1: 13.51, x2: 15.42, y2: 17.49 }),
      h('line', { x1: 15.41, y1: 6.51, x2: 8.59, y2: 10.49 })
    )
  );
}

// ── Canvas share modal ───────────────────────────────────────────
function ShareModal({ title, drawFn, onClose }) {
  const canvasRef = useRef(null);
  const closeBtnRef = useRef(null);
  const [rendered, setRendered] = useState(false);
  const [copied, setCopied] = useState(false);

  // Use the global ESC stack so this share modal cooperates with any nested
  // dialog that might open above it. Falls back to the inline listener if
  // keyboard-utils.js wasn't loaded.
  if (window.useEscape) {
    window.useEscape(onClose);
  } else {
    useEffect(() => {
      const handler = e => { if (e.key === 'Escape') onClose(); };
      document.addEventListener('keydown', handler);
      return () => document.removeEventListener('keydown', handler);
    }, [onClose]);
  }

  useEffect(() => {
    if (closeBtnRef.current) closeBtnRef.current.focus();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const go = () => {
      drawFn(canvas);
      setRendered(true);
    };
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(go);
    } else {
      go();
    }
  }, [drawFn]);

  const handleClose = useCallback(() => onClose(), [onClose]);

  const handleDownload = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const a = document.createElement('a');
    a.download = (title || 'share').toLowerCase().replace(/\s+/g, '-') + '.png';
    a.href = canvas.toDataURL('image/png');
    a.click();
  }, [title]);

  const handleCopy = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      const blob = await new Promise(r => canvas.toBlob(r, 'image/png'));
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch(e) { console.warn('Copy failed:', e); }
  }, []);

  return h('div', { className: 'modal-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'showcase-share-title', onClick: handleClose },
    h('div', { className: 'modal-content', onClick: e => e.stopPropagation(), style: { maxWidth: 500, textAlign: 'center' } },
      h('button', { ref: closeBtnRef, className: 'modal-close', onClick: handleClose, 'aria-label': 'Close share modal' }, '×'),
      h('h3', { id: 'showcase-share-title', style: { marginTop: 0, marginBottom:'var(--s-3)', fontSize: 18, color: 'var(--text-primary)' } }, title || 'Share'),
      h('canvas', { ref: canvasRef, style: { width: '100%', maxWidth: 420, borderRadius:'var(--radius-md)', border: '1px solid var(--border)', marginBottom:'var(--s-3)', display: 'block', margin: '0 auto 12px' } }),
      rendered && h('div', { style: { display: 'flex', gap:'var(--s-2)', justifyContent: 'center', flexWrap: 'wrap' } },
        h('button', { onClick: handleDownload, style: { padding: '8px 18px', background: 'var(--accent)', color: 'var(--surface)', border: 'none', borderRadius: 'var(--radius-md)', fontSize:'var(--text-md)', fontWeight: 600, cursor: 'pointer' } }, 'Download PNG'),
        h('button', { onClick: handleCopy, style: { padding: '8px 18px', background: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', fontSize:'var(--text-md)', fontWeight: 600, cursor: 'pointer' } }, copied ? 'Copied!' : 'Copy to clipboard')
      )
    )
  );
}

// ── Canvas draw helpers ──────────────────────────────────────────
const CARD_BG = '#faf9f7';
const CARD_ACCENT = '#B85C38';
const CARD_TEXT_PRI = '#1B1814';
const CARD_TEXT_SEC = '#8A8270';
const CARD_BORDER = '#E5DCCB';

function drawCardBase(ctx, W, H) {
  ctx.fillStyle = CARD_BG;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = CARD_BORDER;
  ctx.lineWidth = 1;
  ctx.strokeRect(0.5, 0.5, W - 1, H - 1);
  // subtle cross-stitch pattern along top
  ctx.fillStyle = '#E5DCCB';
  for (let x = 20; x < W - 20; x += 22) {
    ctx.fillRect(x, 10, 5, 5);
  }
}

function drawLabel(ctx, text, x, y, size, color) {
  ctx.fillStyle = color || CARD_TEXT_SEC;
  ctx.font = `600 ${size || 14}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text.toUpperCase(), x, y);
}

function drawText(ctx, text, x, y, size, weight, color) {
  ctx.fillStyle = color || CARD_TEXT_PRI;
  ctx.font = `${weight || 400} ${size || 14}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
}

function drawWatermark(ctx, W, H) {
  ctx.fillStyle = '#CFC4AC';
  ctx.font = '400 16px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('cross stitch pattern generator', W / 2, H - 20);
}

function makeLifetimeCanvas(canvas, stitches) {
  const W = 1080, H = 1080;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawCardBase(ctx, W, H);
  drawLabel(ctx, 'lifetime stitches', W / 2, 200, 24, CARD_TEXT_SEC);
  ctx.fillStyle = CARD_TEXT_PRI;
  ctx.font = '800 120px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(fmtNum(stitches), W / 2, 400);
  ctx.fillStyle = CARD_ACCENT;
  ctx.font = '500 36px Inter, system-ui, sans-serif';
  ctx.fillText(`≈ ${threadKm(stitches)} km of thread`, W / 2, 480);
  drawWatermark(ctx, W, H);
}

function makeSableCanvas(canvas, sableData, headline) {
  const W = 1080, H = 1080;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawCardBase(ctx, W, H);
  drawLabel(ctx, 'stash vs. use', W / 2, 150, 22, CARD_TEXT_SEC);
  if (headline) {
    ctx.fillStyle = CARD_TEXT_PRI;
    ctx.font = '600 32px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const words = headline.split(' ');
    let line = '', lines = [], maxW = 900;
    ctx.font = '500 30px Inter, system-ui, sans-serif';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxW) { lines.push(line); line = w; }
      else line = test;
    }
    if (line) lines.push(line);
    lines.forEach((l, i) => { ctx.fillText(l, W / 2, 220 + i * 42); });
  }
  // Draw simplified line chart
  if (sableData && sableData.length >= 2) {
    const chartX = 80, chartY = 350, chartW = W - 160, chartH = 300;
    const maxV = Math.max(...sableData.map(d => Math.max(d.added, d.used)), 1);
    const px = i => chartX + (i / (sableData.length - 1)) * chartW;
    const py = v => chartY + chartH - (v / maxV) * chartH;
    // Grid
    ctx.strokeStyle = '#E5DCCB'; ctx.lineWidth = 1;
    [0.25, 0.5, 0.75, 1].forEach(f => {
      ctx.beginPath(); ctx.moveTo(chartX, chartY + chartH * (1 - f)); ctx.lineTo(chartX + chartW, chartY + chartH * (1 - f)); ctx.stroke();
    });
    // Added
    ctx.strokeStyle = CARD_ACCENT; ctx.lineWidth = 4; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.beginPath();
    sableData.forEach((d, i) => { i === 0 ? ctx.moveTo(px(i), py(d.added)) : ctx.lineTo(px(i), py(d.added)); });
    ctx.stroke();
    // Used
    ctx.strokeStyle = '#6ee7b7'; ctx.lineWidth = 3; ctx.setLineDash([14, 8]);
    ctx.beginPath();
    sableData.forEach((d, i) => { i === 0 ? ctx.moveTo(px(i), py(d.used)) : ctx.lineTo(px(i), py(d.used)); });
    ctx.stroke(); ctx.setLineDash([]);
    // Labels
    sableData.forEach((d, i) => {
      if (i % 2 === 0 || i === sableData.length - 1) {
        ctx.fillStyle = CARD_TEXT_SEC; ctx.font = '400 20px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(fmtMonthShort(d.month), px(i), chartY + chartH + 36);
      }
    });
    // Legend
    ctx.fillStyle = CARD_ACCENT; ctx.fillRect(chartX, chartY + chartH + 70, 40, 6);
    ctx.fillStyle = CARD_TEXT_SEC; ctx.font = '400 22px Inter, system-ui, sans-serif'; ctx.textAlign = 'left';
    ctx.fillText('Added', chartX + 50, chartY + chartH + 80);
    ctx.fillStyle = '#6ee7b7'; ctx.fillRect(chartX + 160, chartY + chartH + 70, 40, 6);
    ctx.fillStyle = CARD_TEXT_SEC;
    ctx.fillText('Used', chartX + 210, chartY + chartH + 80);
  }
  drawWatermark(ctx, W, H);
}

function makeAgeCanvas(canvas, ageData) {
  const W = 1080, H = 1080;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawCardBase(ctx, W, H);
  drawLabel(ctx, 'stash age', W / 2, 150, 22, CARD_TEXT_SEC);
  const buckets = [
    { key: 'bucketUnder1Yr', label: '<1 yr', color: '#88B077' },
    { key: 'bucket1to3Yr',   label: '1–3 yr', color: '#38bdf8' },
    { key: 'bucket3to5Yr',   label: '3–5 yr', color: '#818cf8' },
    { key: 'bucketOver5Yr',  label: '5+ yr',  color: 'var(--accent-light)' },
  ];
  const total = buckets.reduce((s, b) => s + (ageData[b.key] || 0), 0);
  if (total > 0) {
    const barX = 80, barY = 400, barW = W - 160, barH = 60;
    let cx = barX;
    buckets.forEach(b => {
      const w = (ageData[b.key] || 0) / total * barW;
      if (w > 0) {
        ctx.fillStyle = b.color;
        ctx.fillRect(cx, barY, w, barH);
        cx += w;
      }
    });
    let lx = barX;
    buckets.filter(b => (ageData[b.key] || 0) > 0).forEach(b => {
      ctx.fillStyle = b.color; ctx.fillRect(lx, barY + 90, 24, 24);
      ctx.fillStyle = CARD_TEXT_SEC; ctx.font = '400 24px Inter, system-ui, sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(`${b.label} — ${Math.round((ageData[b.key] || 0) / total * 100)}%`, lx + 34, barY + 108);
      lx += 220;
    });
  }
  if (ageData.oldest) {
    ctx.fillStyle = CARD_TEXT_SEC; ctx.font = '400 24px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(`Oldest: ${ageData.oldest.name} · in stash since ${fmtDate(ageData.oldest.addedAt)}`, W / 2, 650);
  }
  drawWatermark(ctx, W, H);
}

function makeOldestCanvas(canvas, wip) {
  const W = 1080, H = 1080;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawCardBase(ctx, W, H);
  drawLabel(ctx, 'your longest companion', W / 2, 200, 22, CARD_TEXT_SEC);
  ctx.fillStyle = CARD_TEXT_PRI;
  ctx.font = '700 64px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(wip.name || 'Untitled', W / 2, 360);
  const days = daysBetween(new Date(wip.lastTouchedAt).getTime(), Date.now());
  ctx.fillStyle = CARD_TEXT_SEC; ctx.font = '400 34px Inter, system-ui, sans-serif';
  ctx.fillText(`Together for ${days} day${days === 1 ? '' : 's'}, ${wip.pct}% of the way through`, W / 2, 450);
  drawWatermark(ctx, W, H);
}

function makeFullPageCanvas(canvas, data) {
  const { stitches, sableData, headline, readyPatterns, ageData, oldestWip } = data;
  const W = 1080, H = 1920;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = CARD_BG;
  ctx.fillRect(0, 0, W, H);
  // Subtle dot-grid background
  ctx.fillStyle = '#E5DCCB';
  for (let gx = 30; gx < W; gx += 30) for (let gy = 30; gy < H; gy += 30) ctx.fillRect(gx - 1, gy - 1, 2, 2);

  let cy = 80;
  const section = (label, draw) => {
    drawLabel(ctx, label, W / 2, cy, 18, CARD_TEXT_SEC);
    cy += 30;
    draw();
    cy += 24;
    // Divider
    ctx.strokeStyle = CARD_BORDER; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(80, cy); ctx.lineTo(W - 80, cy); ctx.stroke();
    cy += 36;
  };

  // Lifetime
  section('lifetime stitches', () => {
    ctx.fillStyle = CARD_TEXT_PRI; ctx.font = '800 96px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(fmtNum(stitches), W / 2, cy + 90);
    cy += 100;
    ctx.fillStyle = CARD_ACCENT; ctx.font = '500 28px Inter, system-ui, sans-serif';
    ctx.fillText(`≈ ${threadKm(stitches)} km of thread`, W / 2, cy + 10);
    cy += 20;
  });

  // SABLE
  if (sableData && sableData.length >= 3 && headline) {
    section('stash vs. use', () => {
      const words = headline.split(' ');
      let line = '', lines = [];
      ctx.font = '500 24px Inter, system-ui, sans-serif';
      for (const w of words) {
        const test = line ? line + ' ' + w : w;
        if (ctx.measureText(test).width > W - 200) { lines.push(line); line = w; }
        else line = test;
      }
      if (line) lines.push(line);
      lines.forEach(l => { ctx.fillStyle = CARD_TEXT_PRI; ctx.fillText(l, W / 2, cy + 10); cy += 34; });
      // Mini chart
      if (sableData.length >= 2) {
        const chartX = 80, chartW = W - 160, chartH = 140;
        const maxV = Math.max(...sableData.map(d => Math.max(d.added, d.used)), 1);
        const px = i => chartX + (i / (sableData.length - 1)) * chartW;
        const pyc = v => cy + chartH - (v / maxV) * chartH;
        ctx.strokeStyle = CARD_ACCENT; ctx.lineWidth = 3; ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.setLineDash([]);
        ctx.beginPath();
        sableData.forEach((d, i) => { i === 0 ? ctx.moveTo(px(i), pyc(d.added)) : ctx.lineTo(px(i), pyc(d.added)); });
        ctx.stroke();
        ctx.strokeStyle = '#6ee7b7'; ctx.lineWidth = 2; ctx.setLineDash([10, 6]);
        ctx.beginPath();
        sableData.forEach((d, i) => { i === 0 ? ctx.moveTo(px(i), pyc(d.used)) : ctx.lineTo(px(i), pyc(d.used)); });
        ctx.stroke(); ctx.setLineDash([]);
        cy += chartH + 20;
      }
    });
  }

  // Ready to start
  if (readyPatterns && readyPatterns.length > 0) {
    section('ready to start', () => {
      readyPatterns.slice(0, 4).forEach(p => {
        ctx.fillStyle = CARD_TEXT_PRI; ctx.font = '600 26px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
        ctx.fillText(p.title || 'Untitled', W / 2, cy + 20);
        ctx.fillStyle = CARD_TEXT_SEC; ctx.font = '400 20px Inter, system-ui, sans-serif';
        ctx.fillText(`${p.coveredThreads}/${p.totalThreads} threads owned`, W / 2, cy + 48);
        cy += 68;
      });
    });
  }

  // Stash age
  if (ageData && hasMeaningfulAgeData(ageData)) {
    section('stash age', () => {
      const buckets = [
        { key: 'bucketUnder1Yr', label: '<1 yr', color: '#88B077' },
        { key: 'bucket1to3Yr',   label: '1–3 yr', color: '#38bdf8' },
        { key: 'bucket3to5Yr',   label: '3–5 yr', color: '#818cf8' },
        { key: 'bucketOver5Yr',  label: '5+ yr',  color: 'var(--accent-light)' },
      ];
      const total = buckets.reduce((s, b) => s + (ageData[b.key] || 0), 0);
      if (total > 0) {
        const barX = 80, barW = W - 160, barH = 40;
        let bx = barX;
        buckets.forEach(b => {
          const bw = (ageData[b.key] || 0) / total * barW;
          if (bw > 0) { ctx.fillStyle = b.color; ctx.fillRect(bx, cy, bw, barH); bx += bw; }
        });
        cy += barH + 16;
      }
    });
  }

  // Oldest WIP
  if (oldestWip) {
    section('your longest companion', () => {
      ctx.fillStyle = CARD_TEXT_PRI; ctx.font = '700 48px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(oldestWip.name || 'Untitled', W / 2, cy + 40);
      cy += 54;
      const days = daysBetween(new Date(oldestWip.lastTouchedAt).getTime(), Date.now());
      ctx.fillStyle = CARD_TEXT_SEC; ctx.font = '400 26px Inter, system-ui, sans-serif';
      ctx.fillText(`Together for ${days} days, ${oldestWip.pct}% of the way through`, W / 2, cy + 10);
      cy += 24;
    });
  }

  drawWatermark(ctx, W, H);
}

// ── Brand colour map ─────────────────────────────────────────────
const BRAND_COLORS = {
  dmc: '#c41230',
  anchor: '#1b4996',
  cosmo: '#2e7d32',
  other: '#78909c'
};

// Compute brand mix from stash
function computeBrandMix(stash) {
  const brandCounts = {};
  for (const [key, entry] of Object.entries(stash)) {
    if (!entry || !entry.owned || entry.owned <= 0) continue;
    const colon = key.indexOf(':');
    const brand = colon >= 0 ? key.slice(0, colon) : 'dmc';
    brandCounts[brand] = (brandCounts[brand] || 0) + entry.owned;
  }
  const total = Object.values(brandCounts).reduce((s, v) => s + v, 0);
  if (total === 0) return null;
  // Sort by count desc, put 'other' last
  const entries = Object.entries(brandCounts).sort(([ka, a], [kb, b]) => {
    if (ka === 'other') return 1; if (kb === 'other') return -1;
    return b - a;
  });
  return { entries, total };
}

// Brand mix headline sentence
function brandMixSentence(mix) {
  if (!mix) return null;
  const { entries, total } = mix;
  if (entries.length === 1) {
    const [brand, count] = entries[0];
    return 'Your ' + fmtNum(count) + ' threads come entirely from ' + brand.toUpperCase() + '.';
  }
  const topTwo = entries.slice(0, 2);
  const [b1, c1] = topTwo[0];
  const [b2, c2] = topTwo[1];
  const pct1 = Math.round(c1 / total * 100);
  const pct2 = Math.round(c2 / total * 100);
  if (entries.length === 2) {
    return pct1 >= 60
      ? 'Mostly ' + b1.toUpperCase() + ' (' + pct1 + '%), with a dash of ' + b2.toUpperCase() + '.'
      : 'A near-equal split: ' + pct1 + '% ' + b1.toUpperCase() + ', ' + pct2 + '% ' + b2.toUpperCase() + '.';
  }
  return 'Your stash spans ' + entries.length + ' brands \u2014 led by ' + b1.toUpperCase() + ' (' + pct1 + '%) and ' + b2.toUpperCase() + ' (' + pct2 + '%).';
}

// Brand mix donut SVG
function BrandDonut({ mix }) {
  if (!mix) return null;
  const { entries, total } = mix;
  const R = 56, IR = 32, CX = 70, CY = 70;
  const paths = [];
  let angle = -Math.PI / 2;
  for (const [brand, count] of entries) {
    const sweep = (count / total) * 2 * Math.PI;
    if (sweep < 0.01) { angle += sweep; continue; }
    const x1 = CX + R * Math.cos(angle);
    const y1 = CY + R * Math.sin(angle);
    const x2 = CX + R * Math.cos(angle + sweep);
    const y2 = CY + R * Math.sin(angle + sweep);
    const ix1 = CX + IR * Math.cos(angle);
    const iy1 = CY + IR * Math.sin(angle);
    const ix2 = CX + IR * Math.cos(angle + sweep);
    const iy2 = CY + IR * Math.sin(angle + sweep);
    const large = sweep > Math.PI ? 1 : 0;
    const color = BRAND_COLORS[brand] || BRAND_COLORS.other;
    const d = 'M ' + ix1 + ' ' + iy1 + ' L ' + x1 + ' ' + y1 + ' A ' + R + ' ' + R + ' 0 ' + large + ' 1 ' + x2 + ' ' + y2 + ' L ' + ix2 + ' ' + iy2 + ' A ' + IR + ' ' + IR + ' 0 ' + large + ' 0 ' + ix1 + ' ' + iy1 + ' Z';
    paths.push(h('path', { key: brand, d, fill: color }));
    angle += sweep;
  }
  // Brand legend
  const legend = entries.slice(0, 4).map(([brand, count]) => {
    const color = BRAND_COLORS[brand] || BRAND_COLORS.other;
    const pct = Math.round(count / total * 100);
    return h('div', { key: brand, style: { display: 'flex', alignItems: 'center', gap: 6, fontSize:'var(--text-sm)', color: 'var(--text-primary)', marginBottom:'var(--s-1)' } },
      h('span', { style: { width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 } }),
      h('span', null, brand.toUpperCase()),
      h('span', { style: { color: 'var(--text-tertiary)', marginLeft: 'auto', paddingLeft: 8 } }, pct + '%')
    );
  });
  return h('div', { style: { display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap' } },
    h('svg', { viewBox: '0 0 140 140', width: 120, height: 120, 'aria-label': 'Brand mix donut chart' }, ...paths),
    h('div', { style: { flex: 1, minWidth: 120 } }, ...legend)
  );
}

// Brand mix share canvas
function makeBrandMixCanvas(canvas, mix, sentence) {
  const W = 1080, H = 1080;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  drawCardBase(ctx, W, H);
  drawLabel(ctx, 'brand mix', W / 2, 200, 22, CARD_TEXT_SEC);
  if (sentence) {
    ctx.fillStyle = CARD_TEXT_PRI;
    ctx.font = '600 40px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    const words = sentence.split(' ');
    let line = '', lines = [], lineH = 54;
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > 900) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    let ty = 300;
    lines.forEach(l => { ctx.fillText(l, W / 2, ty); ty += lineH; });
  }
  if (mix) {
    const { entries, total } = mix;
    const R = 220, IR = 130, CX = W / 2, CY = 700;
    let angle = -Math.PI / 2;
    for (const [brand, count] of entries) {
      const sweep = (count / total) * 2 * Math.PI;
      if (sweep < 0.01) { angle += sweep; continue; }
      const color = BRAND_COLORS[brand] || BRAND_COLORS.other;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(CX + IR * Math.cos(angle), CY + IR * Math.sin(angle));
      ctx.lineTo(CX + R * Math.cos(angle), CY + R * Math.sin(angle));
      ctx.arc(CX, CY, R, angle, angle + sweep);
      ctx.lineTo(CX + IR * Math.cos(angle + sweep), CY + IR * Math.sin(angle + sweep));
      ctx.arc(CX, CY, IR, angle + sweep, angle, true);
      ctx.closePath();
      ctx.fill();
      angle += sweep;
    }
  }
  drawWatermark(ctx, W, H);
}

// ── Main StatsShowcase component ─────────────────────────────────
function StatsShowcase({ onClose, onNavigateToDashboard, onNavigateToActivity }) {
  // All hooks unconditional
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
      // Run migrations first
      if (typeof StashBridge !== 'undefined' && StashBridge.migrateSchemaToV3) {
        await StashBridge.migrateSchemaToV3();
      }
      if (typeof ProjectStorage !== 'undefined' && ProjectStorage.migrateProjectsToV3) {
        await ProjectStorage.migrateProjectsToV3();
      }
      const results = await Promise.all([
        typeof ProjectStorage !== 'undefined' ? ProjectStorage.getLifetimeStitches() : 0,
        typeof StashBridge !== 'undefined' ? StashBridge.getAcquisitionTimeseries(12) : [],
        typeof ProjectStorage !== 'undefined' ? ProjectStorage.getProjectsReadyToStart() : [],
        typeof StashBridge !== 'undefined' ? StashBridge.getStashAgeDistribution() : {},
        typeof ProjectStorage !== 'undefined' ? ProjectStorage.getOldestWIP() : null,
        typeof StashBridge !== 'undefined' ? StashBridge.getGlobalStash() : {},
      ]);
      if (cancelled) return;
      setLifetimeStitches(results[0]);
      setSableData(results[1]);
      setReadyToStart(results[2]);
      setAgeData(results[3]);
      setOldestWip(results[4]);
      setStash(results[5]);
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, []);

  // Derived
  const earlyUser = useMemo(() => isEarlyUser(stash), [stash]);
  const showBanner = earlyUser && !bannerDismissed;
  const headline = useMemo(() => sableSentence(sableData), [sableData]);
  const showSable = sableData.length >= 3 && headline !== null;
  const readyPatterns = useMemo(() => readyToStart.filter(p => p.pct >= 100).slice(0, 4), [readyToStart]);
  const showReady = readyPatterns.length > 0;
  const showAge = hasMeaningfulAgeData(ageData);
  const showOldest = oldestWip !== null;

  const handleDismissBanner = useCallback(() => {
    persistBannerDismissed();
    setBannerDismissed(true);
  }, []);

  const openShare = useCallback(section => setShareSection(section), []);
  const closeShare = useCallback(() => setShareSection(null), []);

  // Brand mix (derived from stash)
  const brandMix = useMemo(() => computeBrandMix(stash), [stash]);
  const brandSentence = useMemo(() => brandMixSentence(brandMix), [brandMix]);
  const showBrandMix = brandMix !== null;
  const drawBrandMix = useCallback(canvas => makeBrandMixCanvas(canvas, brandMix, brandSentence), [brandMix, brandSentence]);

  // Share draw functions (stable refs via useCallback)
  const drawLifetime = useCallback(canvas => makeLifetimeCanvas(canvas, lifetimeStitches), [lifetimeStitches]);
  const drawSable = useCallback(canvas => makeSableCanvas(canvas, sableData, headline), [sableData, headline]);
  const drawAge = useCallback(canvas => makeAgeCanvas(canvas, ageData), [ageData]);
  const drawOldest = useCallback(canvas => makeOldestCanvas(canvas, oldestWip), [oldestWip]);
  const drawFullPage = useCallback(canvas => makeFullPageCanvas(canvas, {
    stitches: lifetimeStitches, sableData, headline, readyPatterns, ageData, oldestWip
  }), [lifetimeStitches, sableData, headline, readyPatterns, ageData, oldestWip]);

  // Scroll to section from URL
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  useEffect(() => {
    if (loading) return;
    const section = urlParams.get('section');
    if (section) {
      const el = document.getElementById('showcase-' + section);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), 80);
    }
    // Open share modal if ?share=true
    if (urlParams.get('share') === 'true') {
      setShareSection('page');
    }
  }, [loading, urlParams]);

  // ── Render ────────────────────────────────────────────────────
  const pageStyle = { maxWidth: 680, margin: '0 auto', padding: '0 20px 80px', fontFamily: 'inherit' };
  const linkStyle = { fontSize:'var(--text-sm)', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600, fontFamily: 'inherit', textDecoration: 'none' };

  if (loading) {
    return h('div', { style: Object.assign({}, pageStyle, { paddingTop: 60, textAlign: 'center', color: 'var(--text-tertiary)' }) },
      h('div', { style: { width: 28, height: 28, border: '2.5px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' } }),
      'Loading your showcase…'
    );
  }

  return h('div', { style: pageStyle },

    // ── Page header ──────────────────────────────────────────────
    h('div', { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 24, paddingBottom: 8 } },
      h('div', null,
        h('div', { style: { fontSize:'var(--text-xs)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 2 } }, 'your stitching'),
        h('h2', { style: { fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text-primary)' } }, 'Showcase')
      ),
      h('div', { style: { display: 'flex', alignItems: 'center', gap:'var(--s-3)' } },
        h('button', { onClick: () => openShare('page'), style: Object.assign({}, linkStyle, { fontSize:'var(--text-md)' }), 'aria-label': 'Share this page as an image' },
          'Share page ↑'
        ),
        onNavigateToActivity && h('button', { onClick: onNavigateToActivity, style: linkStyle }, 'Activity \u2192'),
        h('button', { onClick: onNavigateToDashboard, style: linkStyle },
          'Full dashboard →'
        )
      )
    ),

    // ── Tracking since banner ────────────────────────────────────
    showBanner && h('div', {
      role: 'status',
      style: { background: 'var(--accent-light)', border: '1px solid var(--accent-border)', borderRadius:'var(--radius-lg)', padding: '10px 14px', marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap:'var(--s-3)', fontSize:'var(--text-md)', color: 'var(--accent-hover)' }
    },
      h('span', null, 'Tracking since ' + (function() {
        let earliest = null;
        for (const e of Object.values(stash)) {
          if (e.addedAt && e.addedAt !== LEGACY_EPOCH) {
            if (!earliest || e.addedAt < earliest) earliest = e.addedAt;
          }
        }
        return earliest ? fmtDate(earliest) : 'recently';
      })() + ' — this page will get richer as your history builds.'),
      h('button', { onClick: handleDismissBanner, style: { background: 'none', border: 'none', cursor: 'pointer', fontSize:'var(--text-xl)', color: 'var(--accent-hover)', padding: '0 4px', lineHeight: 1 }, 'aria-label': 'Dismiss banner' }, '×')
    ),

    // ── Section 1: Lifetime hero ─────────────────────────────────
    h('section', { id: 'showcase-lifetime', style: { marginTop: 20 }, 'aria-labelledby': 'showcase-lifetime-heading' },
      h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' } },
        h(SectionLabel, null, 'Lifetime Stitches'),
        h(ShareBtn, { onClick: () => openShare('lifetime') })
      ),
      h('div', {
        'aria-label': `${fmtNum(lifetimeStitches)} lifetime stitches`,
        role: 'figure'
      },
        h('h2', { id: 'showcase-lifetime-heading', style: { fontSize: 64, fontWeight: 800, margin: 0, color: 'var(--text-primary)', lineHeight: 1.05, letterSpacing: '-0.02em' } }, fmtNum(lifetimeStitches)),
        lifetimeStitches > 0
          ? h('div', null,
              h('div', { style: { fontSize: 18, color: 'var(--accent)', marginTop: 6, fontWeight: 500 } }, `≈ ${threadKm(lifetimeStitches)} km of thread`),
              h('div', { style: { marginTop:'var(--s-2)' } },
                h('button', { onClick: () => openShare('lifetime'), style: Object.assign({}, linkStyle, { fontSize:'var(--text-sm)' }) }, 'Share card →')
              )
            )
          : h('div', { style: { fontSize: 15, color: 'var(--text-secondary)', marginTop: 10, maxWidth: 420, lineHeight: 1.6 } },
              'Your stitches will count here as you mark them off — see you soon.'
            )
      )
    ),

    // ── Section 2: SABLE chart ───────────────────────────────────
    showSable && h('div', null,
      h(Divider),
      h('section', { id: 'showcase-sable', 'aria-labelledby': 'showcase-sable-heading' },
        h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' } },
          h(SectionLabel, null, 'Stash vs. Use'),
          h(ShareBtn, { onClick: () => openShare('sable') })
        ),
        h('h3', { id: 'showcase-sable-heading', style: { fontSize: 20, fontWeight: 600, margin: '0 0 6px', color: 'var(--text-primary)', lineHeight: 1.4 } }, headline),
        h(SableLineChart, { data: sableData })
      )
    ),

    // If SABLE hidden due to early user, show calm placeholder
    !showSable && earlyUser && h('div', null,
      h(Divider),
      h('section', { id: 'showcase-sable', style: { color: 'var(--text-tertiary)', fontSize:'var(--text-lg)', lineHeight: 1.6 } },
        h(SectionLabel, null, 'Stash vs. Use'),
        'Your stash journey will chart here once there\'s a few months to draw from.'
      )
    ),

    // ── Section 2b: Brand Mix ────────────────────────────────────
    showBrandMix && h('div', null,
      h(Divider),
      h('section', { id: 'showcase-brandmix', 'aria-labelledby': 'showcase-brandmix-heading' },
        h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' } },
          h(SectionLabel, null, 'Brand Mix'),
          h(ShareBtn, { onClick: () => openShare('brandmix') })
        ),
        brandSentence && h('h3', { id: 'showcase-brandmix-heading', style: { fontSize: 18, fontWeight: 600, margin: '0 0 14px', color: 'var(--text-primary)', lineHeight: 1.4 } }, brandSentence),
        h(BrandDonut, { mix: brandMix }),
        h('div', { style: { marginTop:'var(--s-2)' } }, h('button', { onClick: () => openShare('brandmix'), style: Object.assign({}, linkStyle, { fontSize:'var(--text-sm)' }) }, 'Share card \u2192'))
      )
    ),

    // ── Section 3: Ready to start ────────────────────────────────
    showReady && h('div', null,
      h(Divider),
      h('section', { id: 'showcase-ready', 'aria-labelledby': 'showcase-ready-heading' },
        h(SectionLabel, null, 'Ready to Start'),
        h('h3', { id: 'showcase-ready-heading', style: { fontSize: 18, fontWeight: 600, margin: '0 0 14px', color: 'var(--text-primary)' } },
          `${readyPatterns.length} pattern${readyPatterns.length === 1 ? '' : 's'} you can begin with what you own.`
        ),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 } },
          readyPatterns.map(p => h(PatternChip, { key: p.id, pattern: p }))
        )
      )
    ),

    // ── Section 4: Stash age ─────────────────────────────────────
    showAge && h('div', null,
      h(Divider),
      h('section', { id: 'showcase-age', 'aria-labelledby': 'showcase-age-heading' },
        h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' } },
          h(SectionLabel, null, 'Stash Age'),
          h(ShareBtn, { onClick: () => openShare('age') })
        ),
        h('h3', { id: 'showcase-age-heading', style: { fontSize: 18, fontWeight: 600, margin: '0 0 14px', color: 'var(--text-primary)' } },
          (() => {
            const total = (ageData.bucketUnder1Yr || 0) + (ageData.bucket1to3Yr || 0) + (ageData.bucket3to5Yr || 0) + (ageData.bucketOver5Yr || 0) + (ageData.legacy || 0);
            return `${fmtNum(total)} thread${total === 1 ? '' : 's'} in your stash.`;
          })()
        ),
        h(AgeBar, { ageData }),
        ageData.oldest && h('div', { style: { marginTop:'var(--s-3)', fontSize:'var(--text-md)', color: 'var(--text-secondary)' } },
          `Oldest: ${ageData.oldest.name} · in stash since ${fmtDate(ageData.oldest.addedAt)}`
        )
      )
    ),

    // ── Section 5: Oldest WIP ────────────────────────────────────
    showOldest && h('div', null,
      h(Divider),
      h('section', { id: 'showcase-oldest', 'aria-labelledby': 'showcase-oldest-heading' },
        h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' } },
          h(SectionLabel, null, 'Your Longest Companion'),
          h(ShareBtn, { onClick: () => openShare('oldest') })
        ),
        h('h3', { id: 'showcase-oldest-heading', style: { fontSize: 28, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-primary)' } }, oldestWip.name || 'Untitled'),
        h('p', { style: { fontSize:'var(--text-xl)', color: 'var(--text-secondary)', margin: '0 0 4px', lineHeight: 1.6 } },
          (() => {
            const days = daysBetween(new Date(oldestWip.lastTouchedAt).getTime(), Date.now());
            return `Together for ${days} day${days === 1 ? '' : 's'}, ${oldestWip.pct}% of the way through.`;
          })()
        ),
        oldestWip.lastTouchedAt && h('p', { style: { fontSize:'var(--text-md)', color: 'var(--text-tertiary)', margin: 0 } },
          `Last worked on ${fmtDaysSince(oldestWip.lastTouchedAt)}.`
        )
      )
    ),

    // ── Share modals ─────────────────────────────────────────────
    shareSection === 'lifetime' && h(ShareModal, { key: 'share-lifetime', title: 'Share — Lifetime Stitches', drawFn: drawLifetime, onClose: closeShare }),
    shareSection === 'sable' && showSable && h(ShareModal, { key: 'share-sable', title: 'Share — Stash vs. Use', drawFn: drawSable, onClose: closeShare }),    shareSection === 'brandmix' && showBrandMix && h(ShareModal, { key: 'share-brandmix', title: 'Share \u2014 Brand Mix', drawFn: drawBrandMix, onClose: closeShare }),    shareSection === 'age' && showAge && h(ShareModal, { key: 'share-age', title: 'Share — Stash Age', drawFn: drawAge, onClose: closeShare }),
    shareSection === 'oldest' && showOldest && h(ShareModal, { key: 'share-oldest', title: 'Share — Longest Companion', drawFn: drawOldest, onClose: closeShare }),
    shareSection === 'page' && h(ShareModal, { key: 'share-page', title: 'Share — Your Showcase', drawFn: drawFullPage, onClose: closeShare })
  );
}

window.StatsShowcase = StatsShowcase;
