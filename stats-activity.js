// stats-activity.js — Tier B Activity Page
// Exposes window.StatsActivity as the main component.
// Uses h = React.createElement convention, compiled via Babel at runtime.

const { useState, useEffect, useMemo, useCallback, useRef } = React;
const h = React.createElement;

// ── Constants ────────────────────────────────────────────────────
const STITCHES_PER_HOUR = 400;
const TEAL_RAMP = ['var(--surface-secondary)', 'var(--success-soft)', '#A8C594', '#88B077', 'var(--success)'];
const CELL = 11; // 8px cell + 3px gap
const DAY_LABELS = ['', 'Mon', '', 'Wed', '', 'Fri', ''];
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// ── Data helpers ─────────────────────────────────────────────────
function todayStr() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function getPeriodStart(period) {
  const today = new Date();
  if (period === '6m') { const d = new Date(today); d.setMonth(d.getMonth() - 6); return d.toISOString().slice(0, 10); }
  if (period === 'year') return today.getFullYear() + '-01-01';
  if (period === 'all') return '2000-01-01';
  const d = new Date(today); d.setFullYear(d.getFullYear() - 1); return d.toISOString().slice(0, 10);
}

// fmtNum is a shared global from helpers.js

function fmtHours(h) {
  const hr = Math.floor(h);
  const min = Math.round((h - hr) * 60);
  if (hr === 0) return min + 'm';
  if (min === 0) return hr + 'h';
  return hr + 'h ' + min + 'm';
}

// Load all stitch log data from all projects (or a single project if filtered)
async function loadStitchData(filterProjectId) {
  if (typeof ProjectStorage === 'undefined') return { byDay: {}, durationByDay: {}, projects: [], trackingStart: null };
  const metas = await ProjectStorage.listProjects();
  const byDay = {}; // { 'YYYY-MM-DD': { total: number, projects: { id: count } } }
  const durationByDay = {}; // { 'YYYY-MM-DD': number } — real stitching seconds per day
  const projectNames = {};
  let trackingStart = null;
  // PERF (perf-5 #6): parallel fetch of all projects rather than sequential awaits.
  const fulls = await Promise.all(metas.map(m => ProjectStorage.get(m.id).catch(() => null)));
  for (const proj of fulls) {
    if (!proj) continue;
    projectNames[proj.id] = proj.name || 'Untitled';
    if (filterProjectId && proj.id !== filterProjectId) continue;
    // Build stitchLog from statsSessions (derived, same as tracker's buildSnapshot)
    if (proj.statsSessions && proj.statsSessions.length > 0) {
      for (const s of proj.statsSessions) {
        if (!s || !s.date) continue;
        if (!trackingStart || s.date < trackingStart) trackingStart = s.date;
        if (!byDay[s.date]) byDay[s.date] = { total: 0, projects: {} };
        byDay[s.date].total += (s.netStitches || 0);
        byDay[s.date].projects[proj.id] = (byDay[s.date].projects[proj.id] || 0) + (s.netStitches || 0);
        const secs = s.durationSeconds != null ? s.durationSeconds : (s.durationMinutes || 0) * 60;
        durationByDay[s.date] = (durationByDay[s.date] || 0) + secs;
      }
    } else if (proj.stitchLog && proj.stitchLog.length > 0) {
      // Fallback for old projects that only have stitchLog and no statsSessions
      for (const entry of proj.stitchLog) {
        if (!trackingStart || entry.date < trackingStart) trackingStart = entry.date;
        if (!byDay[entry.date]) byDay[entry.date] = { total: 0, projects: {} };
        byDay[entry.date].total += entry.count;
        byDay[entry.date].projects[proj.id] = (byDay[entry.date].projects[proj.id] || 0) + entry.count;
      }
    }
  }
  return { byDay, durationByDay, projects: Object.entries(projectNames).map(([id, name]) => ({ id, name })), trackingStart };
}

// Build the heatmap grid aligned to Sun-start weeks
function buildGrid(byDay, periodStart, today, trackingStart) {
  const startDate = new Date(periodStart + 'T00:00:00');
  const dow = startDate.getDay();
  const gridStart = new Date(startDate);
  gridStart.setDate(gridStart.getDate() - dow);

  const todayDate = new Date(today + 'T00:00:00');
  const endDow = todayDate.getDay();
  const gridEnd = new Date(todayDate);
  gridEnd.setDate(gridEnd.getDate() + (6 - endDow));

  const days = [];
  const cursor = new Date(gridStart);
  while (cursor <= gridEnd) {
    const ds = cursor.toISOString().slice(0, 10);
    const inPeriod = ds >= periodStart && ds <= today;
    const preTracking = trackingStart && ds < trackingStart;
    const entry = byDay[ds];
    const count = (entry && inPeriod) ? entry.total : 0;
    days.push({ date: ds, count, inPeriod, preTracking });
    cursor.setDate(cursor.getDate() + 1);
  }

  // Percentile-based colour bins for non-zero days
  const nonZero = days.filter(d => d.inPeriod && !d.preTracking && d.count > 0).map(d => d.count).sort((a, b) => a - b);
  const p25 = nonZero[Math.floor(nonZero.length * 0.25)] || 0;
  const p50 = nonZero[Math.floor(nonZero.length * 0.5)] || 0;
  const p75 = nonZero[Math.floor(nonZero.length * 0.75)] || 0;

  return days.map(d => {
    let bin = 0;
    if (d.inPeriod && !d.preTracking && d.count > 0) {
      if (d.count <= p25) bin = 1;
      else if (d.count <= p50) bin = 2;
      else if (d.count <= p75) bin = 3;
      else bin = 4;
    }
    return Object.assign({}, d, { bin });
  });
}

// Calendar-correlated insights (suppress if < 3 active days)
function computeInsights(grid, isFiltered) {
  const active = grid.filter(d => d.inPeriod && !d.preTracking && d.count > 0);
  if (active.length < 3) return [];
  const insights = [];

  // Day-of-week
  const dowTotals = new Array(7).fill(0);
  active.forEach(d => { dowTotals[new Date(d.date + 'T00:00:00').getDay()] += d.count; });
  const total = dowTotals.reduce((s, v) => s + v, 0);
  if (total > 0) {
    const maxDow = dowTotals.indexOf(Math.max(...dowTotals));
    const DOW = ['Sundays','Mondays','Tuesdays','Wednesdays','Thursdays','Fridays','Saturdays'];
    const weekendPct = Math.round((dowTotals[0] + dowTotals[6]) / total * 100);
    const pct = Math.round(dowTotals[maxDow] / total * 100);
    let text = (isFiltered ? 'This project sees most' : 'You stitch most') + ' on ' + DOW[maxDow];
    if (weekendPct >= 40) text += ' — ' + weekendPct + '% of stitches happen at weekends';
    else text += ' — ' + pct + '% of stitches fall on ' + DOW[maxDow];
    insights.push({ id: 'dow', label: 'Favourite Day', text: text + '.' });
  }

  // Cadence
  const inPeriodDays = grid.filter(d => d.inPeriod && !d.preTracking);
  const totalDays = inPeriodDays.length;
  if (totalDays >= 7) {
    const daysPerWeek = Math.round(active.length / (totalDays / 7) * 10) / 10;
    const freq = daysPerWeek < 1.5 ? 'about once a week' : daysPerWeek < 2.5 ? 'about twice a week' : Math.round(daysPerWeek) + ' days a week';
    const text = (isFiltered ? "You've worked on this project" : "You've stitched") + ' on ' + active.length + ' of the last ' + totalDays + ' days — ' + freq + '.';
    insights.push({ id: 'cadence', label: 'Cadence', text });
  }

  // Best day
  const maxDay = active.reduce((best, d) => d.count > (best ? best.count : 0) ? d : best, null);
  if (maxDay) {
    const dateLabel = new Date(maxDay.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    insights.push({ id: 'bestday', label: 'Biggest Day', text: (isFiltered ? 'Best session on this project was' : 'Your biggest day was') + ' ' + dateLabel + ' — ' + fmtNum(maxDay.count) + ' stitches.', date: maxDay.date });
  }

  return insights;
}

// Busiest weeks or months (top 5)
function computeBusiestPeriods(grid, groupBy) {
  const map = {};
  for (const day of grid) {
    if (!day.inPeriod || day.preTracking || day.count === 0) continue;
    let key;
    if (groupBy === 'month') {
      key = day.date.slice(0, 7);
    } else {
      const d = new Date(day.date + 'T00:00:00');
      const sunday = new Date(d);
      sunday.setDate(d.getDate() - d.getDay());
      key = sunday.toISOString().slice(0, 10);
    }
    if (!map[key]) map[key] = { key, total: 0, days: {} };
    map[key].total += day.count;
    map[key].days[day.date] = (map[key].days[day.date] || 0) + day.count;
  }
  return Object.values(map).sort((a, b) => b.total - a.total).slice(0, 5);
}

// ── Sparkline ────────────────────────────────────────────────────
function Sparkline({ days }) {
  const W = 60, H = 18;
  const entries = Object.entries(days).sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return null;
  const values = entries.map(([, v]) => v);
  const maxV = Math.max(...values, 1);
  const pts = values.map((v, i) => {
    const x = entries.length > 1 ? (i / (entries.length - 1)) * W : W / 2;
    const y = H - (v / maxV) * H;
    return x + ',' + y;
  }).join(' ');
  return h('svg', { width: W, height: H, style: { display: 'block', flexShrink: 0 } },
    h('polyline', { points: pts, fill: 'none', stroke: 'var(--accent)', strokeWidth: 1.5, strokeLinejoin: 'round', strokeLinecap: 'round' })
  );
}

// ── Heatmap SVG ──────────────────────────────────────────────────
function ActivityHeatmap({ grid, byDay, onCellHover, onCellLeave, onCellClick, highlightDate }) {
  const weeks = [];
  for (let i = 0; i < grid.length; i += 7) weeks.push(grid.slice(i, i + 7));

  const LEFT = 28;
  const SVG_H = 7 * CELL + 20;
  const SVG_W = LEFT + weeks.length * CELL + 4;

  // Month labels: first week whose Sunday starts on or after the 1st of a new month
  const monthLabels = [];
  let lastMonth = -1;
  weeks.forEach((week, wi) => {
    if (!week[0]) return;
    const d = new Date(week[0].date + 'T00:00:00');
    const m = d.getMonth();
    if (m !== lastMonth) {
      monthLabels.push({ text: MONTH_ABBR[m], x: LEFT + wi * CELL });
      lastMonth = m;
    }
  });

  return h('div', { style: { overflowX: 'auto', WebkitOverflowScrolling: 'touch' } },
    h('svg', {
      viewBox: '0 0 ' + SVG_W + ' ' + (SVG_H + 20),
      style: { display: 'block', minWidth: SVG_W, height: SVG_H + 20 },
      'aria-label': 'Stitching activity heatmap'
    },
      // Month labels
      monthLabels.map((ml, i) =>
        h('text', { key: i, x: ml.x, y: 12, fontSize: 9, fill: 'var(--text-tertiary)' }, ml.text)
      ),
      // Day-of-week labels
      DAY_LABELS.map((label, di) =>
        label ? h('text', { key: di, x: LEFT - 4, y: 20 + di * CELL + CELL * 0.75, textAnchor: 'end', fontSize: 9, fill: 'var(--text-tertiary)' }, label) : null
      ),
      // Cells
      weeks.map((week, wi) =>
        week.map((day, di) => {
          const x = LEFT + wi * CELL;
          const y = 20 + di * CELL;
          const isHighlighted = day.date === highlightDate;
          let fill, stroke, opacity;
          if (!day.inPeriod) {
            fill = 'none'; stroke = 'none'; opacity = 0;
          } else if (day.preTracking) {
            fill = 'var(--surface-secondary)'; stroke = 'var(--border)'; opacity = 0.5;
          } else {
            fill = day.count > 0 ? TEAL_RAMP[day.bin] : TEAL_RAMP[0];
            stroke = isHighlighted ? 'var(--accent)' : 'none';
            opacity = 1;
          }
          return h('rect', {
            key: day.date,
            x, y,
            width: CELL - 3,
            height: CELL - 3,
            rx: 2,
            fill,
            stroke,
            strokeWidth: isHighlighted ? 2 : 0,
            opacity,
            style: { cursor: day.inPeriod && !day.preTracking ? 'pointer' : 'default' },
            onMouseEnter: (day.inPeriod && !day.preTracking) ? (e => onCellHover && onCellHover(day, byDay[day.date], e)) : undefined,
            onMouseLeave: (day.inPeriod && !day.preTracking) ? (() => onCellLeave && onCellLeave()) : undefined,
            onClick: (day.inPeriod && !day.preTracking) ? (() => onCellClick && onCellClick(day)) : undefined,
            'aria-label': (day.inPeriod && !day.preTracking) ? day.date + ': ' + fmtNum(day.count) + ' stitches' : undefined
          });
        })
      ),
      // Legend
      h('g', { transform: 'translate(' + LEFT + ',' + (SVG_H + 8) + ')' },
        h('text', { x: 0, y: 8, fontSize: 9, fill: 'var(--text-tertiary)' }, 'Less'),
        TEAL_RAMP.map((color, i) =>
          h('rect', { key: i, x: 28 + i * (CELL - 1), y: 0, width: CELL - 3, height: CELL - 3, rx: 2, fill: color })
        ),
        h('text', { x: 28 + 5 * (CELL - 1) + 4, y: 8, fontSize: 9, fill: 'var(--text-tertiary)' }, 'More')
      )
    )
  );
}

// ── Main StatsActivity component ─────────────────────────────────
function StatsActivity({ onNavigateToDashboard, onNavigateToShowcase }) {
  const premium = typeof isPremium === 'function' ? isPremium() : true;

  const urlParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const filterProjectId = urlParams.get('project') || null;

  const [loading, setLoading] = useState(true);
  const [byDay, setByDay] = useState({});
  const [durationByDay, setDurationByDay] = useState({});
  const [projects, setProjects] = useState([]);
  const [trackingStart, setTrackingStart] = useState(null);
  const [filteredProjectName, setFilteredProjectName] = useState(null);
  const [filterWarning, setFilterWarning] = useState(null);
  const [period, setPeriod] = useState('12m');
  const [tooltip, setTooltip] = useState(null); // { day, entry, x, y }
  const [selectedDay, setSelectedDay] = useState(null);
  const [highlightPeriod, setHighlightPeriod] = useState(null);

  const today = useMemo(() => todayStr(), []);
  const periodStart = useMemo(() => getPeriodStart(period), [period]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      const data = await loadStitchData(filterProjectId);
      if (cancelled) return;
      setByDay(data.byDay);
      setDurationByDay(data.durationByDay || {});
      setProjects(data.projects);
      setTrackingStart(data.trackingStart);
      if (filterProjectId) {
        const found = data.projects.find(p => p.id === filterProjectId);
        if (found) setFilteredProjectName(found.name);
        else setFilterWarning("That project couldn't be found — showing all activity.");
      }
      setLoading(false);
    }
    load();
    return () => { cancelled = true; };
  }, [filterProjectId]);

  const grid = useMemo(() => {
    if (loading) return [];
    return buildGrid(byDay, periodStart, today, trackingStart);
  }, [byDay, periodStart, today, trackingStart, loading]);

  const paceStats = useMemo(() => {
    if (!grid.length) return null;
    const active = grid.filter(d => d.inPeriod && !d.preTracking && d.count > 0);
    const totalStitches = active.reduce((s, d) => s + d.count, 0);
    if (active.length === 0) return null;
    const avgPerSession = Math.round(totalStitches / active.length);
    // Use real stitching seconds when available; fall back to estimate
    const realSeconds = active.reduce((s, d) => s + (durationByDay[d.date] || 0), 0);
    const estHours = realSeconds > 0
      ? realSeconds / 3600
      : totalStitches / STITCHES_PER_HOUR;
    const estHoursRounded = Math.round(estHours);
    const totalDays = grid.filter(d => d.inPeriod && !d.preTracking).length;
    return { totalStitches, sessionCount: active.length, avgPerSession, estHours: estHoursRounded, sessionHours: estHours / active.length, totalDays, hasRealDuration: realSeconds > 0 };
  }, [grid, durationByDay]);

  const insights = useMemo(() => {
    if (!grid.length) return [];
    return computeInsights(grid, !!filterProjectId && !filterWarning);
  }, [grid, filterProjectId, filterWarning]);

  const groupBy = period === 'all' ? 'month' : 'week';
  const busiestPeriods = useMemo(() => {
    if (!grid.length) return [];
    return computeBusiestPeriods(grid, groupBy);
  }, [grid, groupBy]);

  const handleCellHover = useCallback((day, entry, e) => {
    setTooltip({ day, entry, x: e.clientX, y: e.clientY });
  }, []);
  const handleCellLeave = useCallback(() => setTooltip(null), []);
  const handleCellClick = useCallback((day) => {
    setSelectedDay(prev => prev && prev.date === day.date ? null : day);
  }, []);
  const handleDismissFilter = useCallback(() => {
    const url = new URL(window.location.href);
    url.searchParams.delete('project');
    window.history.pushState({}, '', url.toString());
    window.location.reload();
  }, []);
  const handlePeriodChange = useCallback(p => {
    setPeriod(p);
    setSelectedDay(null);
    setTooltip(null);
    setHighlightPeriod(null);
  }, []);

  const lnk = { fontSize:'var(--text-sm)', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600, fontFamily: 'inherit' };
  const wrap = { maxWidth: 700, margin: '0 auto', padding: '0 16px 80px' };

  if (!premium) {
    return h('div', { style: wrap },
      h('div', { style: { paddingTop: 60, textAlign: 'center' } },
        h('div', { style: { fontSize: 32, marginBottom:'var(--s-3)' } }, '🔒'),
        h('h2', { style: { fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' } }, 'Activity'),
        h('p', { style: { color: 'var(--text-secondary)', fontSize:'var(--text-lg)' } }, 'Activity tracking is a premium feature.')
      )
    );
  }

  if (loading) {
    return h('div', { style: Object.assign({}, wrap, { paddingTop: 60, textAlign: 'center', color: 'var(--text-tertiary)' }) },
      h('div', { style: { width: 28, height: 28, border: '2.5px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 14px' } }),
      'Loading your activity\u2026'
    );
  }

  const PERIODS = [
    { value: '12m', label: 'Last 12 months' },
    { value: '6m', label: 'Last 6 months' },
    { value: 'year', label: 'This year' },
    { value: 'all', label: 'All time' },
  ];

  function buildTooltipText(day, entry) {
    const d = new Date(day.date + 'T00:00:00');
    const dateLabel = d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
    const projCount = entry ? Object.keys(entry.projects || {}).length : 0;
    const suffix = projCount > 1 ? ' across ' + projCount + ' project' + (projCount === 1 ? '' : 's') : '';
    return dateLabel + ' \u00b7 ' + fmtNum(day.count) + ' stitch' + (day.count === 1 ? '' : 'es') + suffix;
  }

  const hasData = paceStats !== null;

  return h('div', { style: wrap },
    // ── Page header ───────────────────────────────────────────────
    h('div', { style: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', paddingTop: 24, paddingBottom: 12 } },
      h('div', null,
        h('div', { style: { fontSize:'var(--text-xs)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom: 2 } }, 'your stitching'),
        h('h2', { style: { fontSize: 24, fontWeight: 700, margin: 0, color: 'var(--text-primary)' } }, 'Activity')
      ),
      h('div', { style: { display: 'flex', alignItems: 'center', gap:'var(--s-3)' } },
        onNavigateToShowcase && h('button', { onClick: onNavigateToShowcase, style: lnk }, 'Showcase \u2192'),
        onNavigateToDashboard && h('button', { onClick: onNavigateToDashboard, style: lnk }, 'Full dashboard \u2192')
      )
    ),

    // ── Filter warning ────────────────────────────────────────────
    filterWarning && h('div', { role: 'alert', style: { background: 'var(--warning-soft)', border: '1px solid #D9B055', borderRadius:'var(--radius-md)', padding: '8px 12px', marginBottom:'var(--s-3)', fontSize:'var(--text-md)', color: 'var(--accent-ink)' } }, filterWarning),
    filterProjectId && filteredProjectName && h('div', {
      style: { background: 'var(--accent-light)', border: '1px solid var(--accent-border)', borderRadius:'var(--radius-md)', padding: '8px 12px', marginBottom:'var(--s-3)', fontSize:'var(--text-md)', color: 'var(--accent-hover)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
    },
      h('span', null, 'Filtered to ', h('strong', null, filteredProjectName)),
      h('button', { onClick: handleDismissFilter, style: Object.assign({}, lnk, { fontSize:'var(--text-sm)', color: 'var(--accent-hover)' }) }, 'Clear filter \u2192')
    ),

    // ── Heatmap ───────────────────────────────────────────────────
    h('div', { style: { background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius:'var(--radius-xl)', padding: '16px 16px 12px', marginBottom:'var(--s-3)' } },
      h(ActivityHeatmap, {
        grid,
        byDay,
        onCellHover: handleCellHover,
        onCellLeave: handleCellLeave,
        onCellClick: handleCellClick,
        highlightDate: selectedDay ? selectedDay.date : null
      })
    ),

    // ── Tooltip (fixed, follows cursor) ──────────────────────────
    tooltip && h('div', {
      style: {
        position: 'fixed', left: tooltip.x + 14, top: tooltip.y + 14,
        background: 'var(--surface, #fff)', border: '1px solid var(--border)',
        borderRadius:'var(--radius-sm)', padding: '6px 10px', fontSize:'var(--text-sm)', color: 'var(--text-primary)',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 9999
      },
      'aria-hidden': 'true'
    }, buildTooltipText(tooltip.day, tooltip.entry)),

    // ── Selected day panel (mobile-friendly) ──────────────────────
    selectedDay && h('div', {
      style: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius:'var(--radius-md)', padding: '10px 14px', marginBottom:'var(--s-3)', fontSize:'var(--text-md)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }
    },
      h('span', null,
        h('strong', null, new Date(selectedDay.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })),
        h('span', { style: { color: 'var(--text-secondary)', marginLeft:'var(--s-2)' } }, fmtNum(selectedDay.count) + ' stitches')
      ),
      h('button', { onClick: () => setSelectedDay(null), 'aria-label': 'Dismiss', style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 18, padding: '0 4px', lineHeight: 1 } }, '\xd7')
    ),

    // ── Period selector ───────────────────────────────────────────
    h('div', { style: { display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' } },
      PERIODS.map(p => h('button', {
        key: p.value,
        onClick: () => handlePeriodChange(p.value),
        style: {
          padding: '5px 12px', borderRadius: 20, fontSize:'var(--text-sm)', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
          background: period === p.value ? 'var(--accent)' : 'var(--surface, #fff)',
          color: period === p.value ? 'var(--surface)' : 'var(--text-secondary)',
          border: '1px solid ' + (period === p.value ? 'var(--accent)' : 'var(--border)')
        }
      }, p.label))
    ),

    // ── Insights ──────────────────────────────────────────────────
    insights.length > 0 && h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 10, marginBottom: 20 } },
      insights.map(ins => h('div', {
        key: ins.id,
        onClick: ins.date ? () => {
          const found = grid.find(d => d.date === ins.date);
          if (found) setSelectedDay(prev => prev && prev.date === ins.date ? null : found);
        } : undefined,
        style: {
          background: 'var(--surface, #fff)', border: '1px solid var(--border)',
          borderRadius:'var(--radius-lg)', padding: '12px 14px', fontSize:'var(--text-md)', color: 'var(--text-primary)',
          lineHeight: 1.5, cursor: ins.date ? 'pointer' : 'default'
        }
      },
        h('div', { style: { fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-tertiary)', marginBottom:'var(--s-1)' } }, ins.label),
        ins.text
      ))
    ),

    // ── Pace stats (4 cards) ──────────────────────────────────────
    paceStats && h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 20 } },
      h('div', { className: 'gsd-metric', style: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius:'var(--radius-lg)', padding: '12px 14px' } },
        h('div', { className: 'gsd-metric-label' }, 'Avg. per Session'),
        h('div', { className: 'gsd-metric-value' }, fmtNum(paceStats.avgPerSession)),
        h('div', { className: 'gsd-metric-sub' }, 'stitches per active day')
      ),
      h('div', { className: 'gsd-metric', style: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius:'var(--radius-lg)', padding: '12px 14px' } },
        h('div', { className: 'gsd-metric-label' }, 'Est. Hours'),
        h('div', { className: 'gsd-metric-value' }, '\u2248 ' + paceStats.estHours),
        h('div', { className: 'gsd-metric-sub' }, 'based on ~400 stitches/hour')
      ),
      h('div', { className: 'gsd-metric', style: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius:'var(--radius-lg)', padding: '12px 14px' } },
        h('div', { className: 'gsd-metric-label' }, 'Avg. Session'),
        h('div', { className: 'gsd-metric-value' }, '~' + fmtHours(paceStats.sessionHours)),
        h('div', { className: 'gsd-metric-sub' }, 'per active day')
      ),
      h('div', { className: 'gsd-metric', style: { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius:'var(--radius-lg)', padding: '12px 14px' } },
        h('div', { className: 'gsd-metric-label' }, 'Active Days'),
        h('div', { className: 'gsd-metric-value' }, paceStats.sessionCount),
        h('div', { className: 'gsd-metric-sub' }, 'of ' + paceStats.totalDays + ' in period')
      )
    ),

    // ── Busiest periods ───────────────────────────────────────────
    busiestPeriods.length > 0 && h('div', {
      style: { background: 'var(--surface, #fff)', border: '1px solid var(--border)', borderRadius:'var(--radius-xl)', overflow: 'hidden', marginBottom: 20 }
    },
      h('div', { style: { padding: '12px 16px', borderBottom: '1px solid var(--border)', fontSize:'var(--text-xs)', fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--text-tertiary)' } },
        groupBy === 'month' ? 'Busiest Months' : 'Busiest Weeks'
      ),
      busiestPeriods.map((p, i) => {
        const label = groupBy === 'month'
          ? new Date(p.key + '-01T00:00:00').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })
          : 'Week of ' + new Date(p.key + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
        const isHL = highlightPeriod === p.key;
        return h('div', {
          key: p.key,
          onClick: () => setHighlightPeriod(prev => prev === p.key ? null : p.key),
          style: {
            display: 'flex', alignItems: 'center', gap:'var(--s-3)', padding: '10px 16px',
            borderBottom: i < busiestPeriods.length - 1 ? '1px solid var(--border-subtle, var(--surface-tertiary))' : 'none',
            cursor: 'pointer', fontSize:'var(--text-md)',
            background: isHL ? 'var(--accent-light)' : 'transparent'
          }
        },
          h('span', { style: { width: 20, textAlign: 'right', color: 'var(--text-tertiary)', fontWeight: 600, fontSize:'var(--text-xs)', flexShrink: 0 } }, '#' + (i + 1)),
          h('span', { style: { flex: 1, color: 'var(--text-primary)' } }, label),
          h('span', { style: { color: 'var(--accent)', fontWeight: 600, whiteSpace: 'nowrap', fontSize:'var(--text-md)' } }, fmtNum(p.total)),
          h('div', { style: { width: 60, flexShrink: 0 } }, h(Sparkline, { days: p.days }))
        );
      })
    ),

    // ── Empty state ───────────────────────────────────────────────
    !hasData && h('div', { style: { textAlign: 'center', padding: '40px 0', color: 'var(--text-tertiary)', fontSize:'var(--text-lg)' } },
      'No stitching activity recorded yet in this period.',
      h('br'),
      'Mark stitches in the tracker to build your history here.'
    )
  );
}

window.StatsActivity = StatsActivity;
