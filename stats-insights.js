// stats-insights.js — Brief E
// Insights tab content. Lazy-loaded by stats-page.js (window.loadStatsInsights),
// exposes window.StatsInsights as the main React component.
// Uses h = React.createElement convention (no JSX), Babel-compiled at runtime.

(function () {
  if (typeof React === 'undefined') return;
  const { useState, useEffect, useMemo, useCallback } = React;
  const h = React.createElement;

  // ── Constants ────────────────────────────────────────────────────────────
  const DISMISS_KEY = 'cs_dismissed_insights';
  const DISMISS_TTL_MS = 30 * 86400000; // 30 days
  const HEATMAP_RAMP = ['var(--border)', '#9FE1CB', '#5DCAA5', '#1D9E75', '#0F6E56'];
  const TONE_COLOURS = {
    celebrate: 'var(--success)',
    encourage: 'var(--warning)',
    inform: 'var(--accent)',
    nudge: '#8b5cf6'
  };
  const DAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const DAY_LABELS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

  // ── Helpers ──────────────────────────────────────────────────────────────
  function fmtNum(n) { return (n || 0).toLocaleString('en-GB'); }
  function fmtHour(h) {
    if (h === 0) return '12am';
    if (h === 12) return '12pm';
    return h < 12 ? h + 'am' : (h - 12) + 'pm';
  }
  function loadDismissed() {
    try {
      const raw = localStorage.getItem(DISMISS_KEY);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      const now = Date.now();
      const fresh = {};
      for (const k of Object.keys(parsed)) {
        if (typeof parsed[k] === 'number' && now - parsed[k] < DISMISS_TTL_MS) fresh[k] = parsed[k];
      }
      return fresh;
    } catch (e) { return {}; }
  }
  function saveDismissed(map) {
    try { localStorage.setItem(DISMISS_KEY, JSON.stringify(map)); } catch (e) {}
  }
  function heatmapColor(count, max) {
    if (!count || max === 0) return HEATMAP_RAMP[0];
    const ratio = count / max;
    if (ratio < 0.25) return HEATMAP_RAMP[1];
    if (ratio < 0.50) return HEATMAP_RAMP[2];
    if (ratio < 0.75) return HEATMAP_RAMP[3];
    return HEATMAP_RAMP[4];
  }
  function getSessionSeconds(s) {
    return s.durationSeconds != null ? s.durationSeconds : (s.durationMinutes || 0) * 60;
  }
  function ymd(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function mondayOf(d) {
    const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const dow = x.getDay() === 0 ? 6 : x.getDay() - 1;
    x.setDate(x.getDate() - dow);
    return x;
  }

  // ── Icon resolver ─────────────────────────────────────────────────────────
  function resolveIcon(name) {
    const I = window.Icons || {};
    if (name === 'fire' && I.fire) return I.fire();
    if (name === 'star' && I.star) return I.star();
    if (name === 'lightbulb' && I.lightbulb) return I.lightbulb();
    if (name === 'barChart' && I.barChart) return I.barChart();
    return null;
  }

  // ── Data hook ─────────────────────────────────────────────────────────────
  function useInsightsData() {
    const [state, setState] = useState({
      loading: true, summaries: [], allSessions: [], stash: null,
      mostUsed: [], totalColours: 0, error: null
    });
    useEffect(() => {
      let cancelled = false;
      async function load() {
        try {
          if (typeof ProjectStorage === 'undefined') {
            if (!cancelled) setState(s => Object.assign({}, s, { loading: false, error: 'Storage unavailable' }));
            return;
          }
          const summaries = await ProjectStorage.getAllStatsSummaries();
          // Flatten allSessions and tag each with sourceProjectId for later lookups.
          const allSessions = [];
          for (const s of summaries) {
            const ss = Array.isArray(s.statsSessions) ? s.statsSessions : [];
            for (const sess of ss) allSessions.push(Object.assign({}, sess, { _projectId: s.id }));
          }
          // Most-used colours (cap requested 50, page may show 50)
          let mostUsed = [];
          let totalColours = 0;
          if (typeof ProjectStorage.getMostUsedColours === 'function') {
            mostUsed = await ProjectStorage.getMostUsedColours(50);
            // We don't get total count back from getMostUsedColours; estimate
            // from palette uniqueness in summaries.
            const allIds = new Set();
            for (const s of summaries) {
              for (const c of (s.palette || [])) {
                if (c && c.id && c.id !== '__skip__' && c.id !== '__empty__') allIds.add(c.id);
              }
            }
            totalColours = allIds.size;
          }
          // Stash (optional — Brief D)
          let stash = null;
          if (typeof StashBridge !== 'undefined' && StashBridge.getGlobalStash) {
            try { stash = await StashBridge.getGlobalStash(); } catch (e) { stash = null; }
          }
          if (!cancelled) {
            setState({ loading: false, summaries, allSessions, stash, mostUsed, totalColours, error: null });
          }
        } catch (e) {
          console.error('Insights load failed:', e);
          if (!cancelled) setState(s => Object.assign({}, s, { loading: false, error: String(e) }));
        }
      }
      load();
      return () => { cancelled = true; };
    }, []);
    return state;
  }

  // ── Week comparison computation (mirrors GlobalStatsDashboard logic) ─────
  function computeWeekComparison(allSessions) {
    const today = new Date();
    const thisWeekStart = mondayOf(today);
    const thisWeekStartStr = ymd(thisWeekStart);
    const lastWeekStart = new Date(thisWeekStart); lastWeekStart.setDate(lastWeekStart.getDate() - 7);
    const lastWeekStartStr = ymd(lastWeekStart);
    const lastWeekEndStr = ymd(new Date(thisWeekStart.getTime() - 86400000));
    function wk(sessions) {
      // PERF (perf-7 #10): fused three independent passes (two reduces + a map+Set)
      // into a single loop over the sessions array.
      let stitches = 0, seconds = 0;
      const dayKeys = new Set();
      for (let i = 0; i < sessions.length; i++) {
        const x = sessions[i];
        stitches += (x.netStitches || 0);
        seconds += getSessionSeconds(x);
        if (x.date) dayKeys.add(x.date);
      }
      const speed = seconds > 0 ? Math.round(stitches / (seconds / 3600)) : 0;
      return { stitches, seconds, speed, activeDays: dayKeys.size };
    }
    const tw = wk(allSessions.filter(s => s.date >= thisWeekStartStr));
    const lw = wk(allSessions.filter(s => s.date >= lastWeekStartStr && s.date <= lastWeekEndStr));
    return { thisWeek: tw, lastWeek: lw };
  }

  // ── Sub-components ───────────────────────────────────────────────────────
  function WeeklySummaryCard({ thisWeek, lastWeek }) {
    const text = useMemo(() => {
      if (typeof InsightsEngine === 'undefined') return '';
      return InsightsEngine.generateWeeklySummary(thisWeek, lastWeek);
    }, [thisWeek, lastWeek]);
    return h('div', {
      style: {
        background: 'linear-gradient(135deg, var(--accent-light) 0%, #ecfeff 100%)',
        border: '1px solid var(--accent-border)', borderRadius: 'var(--radius-lg)',
        padding: '16px 20px', marginBottom:'var(--s-4)'
      }
    },
      h('div', {
        style: { fontSize:'var(--text-xs)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.06, color: 'var(--accent)', marginBottom:'var(--s-2)' }
      }, 'This week'),
      h('p', {
        style: { margin: 0, fontSize:'var(--text-lg)', lineHeight: 1.6, color: 'var(--text-primary)' }
      }, text || 'Nothing to summarise yet \u2014 stitch a few sessions to see your weekly story.')
    );
  }

  function ProjectionCard({ p }) {
    const isComplete = p.status === 'complete';
    const isPaused = p.status === 'paused';
    const accent = p.projectColor || 'var(--accent)';
    return h('div', {
      className: 'gsd-project-card',
      style: {
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)', padding: 14, minWidth: 200
      }
    },
      h('div', { style: { fontSize:'var(--text-lg)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, p.name),
      // Progress bar
      h('div', { style: { height: 6, background: 'var(--border-subtle)', borderRadius: 3, overflow: 'hidden', marginBottom: 6 } },
        h('div', { style: { height: '100%', width: p.percent + '%', background: accent, transition: 'width 0.3s' } })
      ),
      h('div', { style: { fontSize:'var(--text-sm)', color: 'var(--text-secondary)', marginBottom: 6 } },
        p.percent + '% complete' + (isComplete ? '' : ' \u00b7 ' + fmtNum(p.remaining) + ' to go')
      ),
      isComplete
        ? h('div', { style: { fontSize:'var(--text-sm)', color: 'var(--success)', fontWeight: 600 } }, '\u2713 Complete!')
        : isPaused
          ? h('div', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)', fontStyle: 'italic' } }, p.projectedText)
          : h('div', null,
              h('div', { style: { fontSize:'var(--text-sm)', color: accent, fontWeight: 600 } }, p.projectedText),
              p.stitchesPerHour > 0 && h('div', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)', marginTop: 2 } }, p.stitchesPerHour + ' st/hr recently')
            )
    );
  }

  function InsightCard({ insight, onDismiss }) {
    const colour = TONE_COLOURS[insight.tone] || 'var(--accent)';
    return h('div', {
      style: {
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '10px 12px', marginBottom:'var(--s-2)',
        background: 'var(--surface)', border: '1px solid var(--border-subtle)',
        borderLeft: '3px solid ' + colour, borderRadius: 'var(--radius-md)'
      }
    },
      h('div', { style: { color: colour, flexShrink: 0, display: 'flex', alignItems: 'center', height: 20 } },
        resolveIcon(insight.iconName) || h('span', { style: { fontSize:'var(--text-lg)' } }, '\u2022')
      ),
      h('div', { style: { flex: 1, fontSize:'var(--text-md)', color: 'var(--text-primary)', lineHeight: 1.45 } }, insight.text),
      h('button', {
        onClick: () => onDismiss(insight.id),
        'aria-label': 'Dismiss insight',
        style: { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 18, padding: '0 4px', lineHeight: 1, flexShrink: 0 }
      }, '\u00d7')
    );
  }

  function ColourHeatmap({ mostUsed, totalColours, stash }) {
    const [expanded, setExpanded] = useState(false);
    if (!mostUsed || mostUsed.length === 0) {
      return h('div', { style: { fontSize:'var(--text-md)', color: 'var(--text-secondary)', padding: '20px 0' } },
        'Start stitching to see which colours you reach for most.'
      );
    }
    const visible = expanded ? mostUsed : mostUsed.slice(0, 50);
    const max = Math.max.apply(null, mostUsed.map(c => c.count));
    // Blend ids look like "310+550"; treat as owned only if every component is in stash.
    function isOwned(id) {
      if (!stash) return false;
      const ids = String(id).indexOf('+') !== -1
        ? splitBlendId(id)
        : [id];
      return ids.length > 0 && ids.every(sub => stash['dmc:' + sub] && (stash['dmc:' + sub].owned || 0) > 0);
    }
    return h('div', null,
      h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 6 } },
        visible.map(c => {
          const opacity = 0.15 + 0.85 * (c.count / Math.max(1, max));
          const owned = isOwned(c.id);
          const labelPrefix = String(c.id).indexOf('+') !== -1 ? 'Blend ' : 'DMC ';
          return h('div', {
            key: c.id,
            title: labelPrefix + c.id + ' \u2014 ' + c.name + ' \u2014 ' + fmtNum(c.count) + ' stitches (' + c.pct + '%)' + (stash ? (owned ? ' \u2014 in stash' : ' \u2014 not in stash') : ''),
            'aria-label': labelPrefix + c.id + ', ' + c.name + ', ' + fmtNum(c.count) + ' stitches' + (stash ? (owned ? ', in stash' : ', not in stash') : ''),
            style: {
              position: 'relative',
              width: 24, height: 24, borderRadius: 4,
              background: 'rgb(' + c.rgb.join(',') + ')',
              opacity: opacity,
              border: stash ? (owned ? '2px solid var(--success)' : '1px solid var(--border)') : '1px solid var(--border)',
              cursor: 'help', boxSizing: 'border-box'
            }
          },
          // Redundant non-colour cue for owned threads (M5 a11y).
          stash && owned && h('span', {
            'aria-hidden': 'true',
            style: { position: 'absolute', top: -4, right: -4, fontSize: 10, lineHeight: '12px', width: 12, height: 12, background: 'var(--success)', color: 'var(--surface)', borderRadius: '50%', textAlign: 'center', fontWeight: 700, pointerEvents: 'none' }
          }, '\u2713')
          );
        })
      ),
      mostUsed.length >= 50 && totalColours > mostUsed.length && !expanded &&
        h('button', {
          onClick: () => setExpanded(true),
          style: { marginTop:'var(--s-2)', fontSize:'var(--text-xs)', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }
        }, '+' + (totalColours - mostUsed.length) + ' more'),
      stash && h('div', { style: { fontSize:'var(--text-xs)', color: 'var(--text-tertiary)', marginTop:'var(--s-2)' } },
        h('span', { style: { display: 'inline-block', width: 10, height: 10, border: '2px solid var(--success)', borderRadius: 2, marginRight:'var(--s-1)', verticalAlign: 'middle' } }),
        'Threads in your stash'
      )
    );
  }

  function RhythmHeatmap({ allSessions }) {
    const data = useMemo(() => {
      if (typeof InsightsEngine === 'undefined') return { grid: [], max: 0, total: 0 };
      return InsightsEngine.buildRhythmMatrix(allSessions);
    }, [allSessions]);
    if (!allSessions || allSessions.length < 5) {
      return h('div', { style: { fontSize:'var(--text-md)', color: 'var(--text-secondary)', padding: '20px 0' } },
        'Stitch across a few more sessions to see your rhythm pattern emerge.'
      );
    }
    const cellSize = 14;
    const gap = 2;
    // Build a screen-reader summary for the heatmap using the engine's
    // getPeakCell helper.
    let peak = null;
    if (typeof InsightsEngine !== 'undefined' && InsightsEngine.getPeakCell) {
      peak = InsightsEngine.getPeakCell(data.grid);
    }
    const ariaSummary = peak
      ? 'Stitching rhythm heatmap. Peak time: ' + DAY_LABELS_FULL[peak.dow] + ' at ' + fmtHour(peak.hr) + ', ' + fmtNum(peak.count) + ' stitches.'
      : 'Stitching rhythm heatmap covering 7 days and 24 hours.';
    return h('div', { style: { overflowX: 'auto' }, role: 'img', 'aria-label': ariaSummary },
      h('div', { style: { display: 'inline-block', minWidth: 24 * (cellSize + gap) + 30 } },
        // Hour labels
        h('div', { style: { display: 'flex', gap: gap, marginLeft: 22, marginBottom: 2 } },
          [0,3,6,9,12,15,18,21].map(hr => h('div', {
            key: hr,
            style: { width: 3 * cellSize + 2 * gap, fontSize: 9, color: 'var(--text-tertiary)', textAlign: 'left' }
          }, fmtHour(hr)))
        ),
        // Rows
        data.grid.map((row, dow) => h('div', {
          key: dow,
          style: { display: 'flex', alignItems: 'center', gap: gap, marginBottom: gap }
        },
          h('div', { style: { width: 18, fontSize: 10, color: 'var(--text-tertiary)', textAlign: 'right', marginRight:'var(--s-1)' }, 'aria-hidden': 'true' }, DAY_LABELS[dow]),
          row.map((count, hr) => h('div', {
            key: hr,
            title: DAY_LABELS_FULL[dow] + ' ' + fmtHour(hr) + ' \u2014 ' + fmtNum(count) + ' stitches',
            'aria-label': count > 0 ? DAY_LABELS_FULL[dow] + ' ' + fmtHour(hr) + ', ' + fmtNum(count) + ' stitches' : null,
            style: {
              width: cellSize, height: cellSize, borderRadius: 2,
              background: heatmapColor(count, data.max),
              cursor: count > 0 ? 'help' : 'default'
            }
          }))
        ))
      )
    );
  }

  // ── Main component ──────────────────────────────────────────────────────
  function StatsInsights() {
    const data = useInsightsData();
    const [dismissed, setDismissed] = useState(loadDismissed);

    const weekComp = useMemo(() => computeWeekComparison(data.allSessions || []), [data.allSessions]);
    const projections = useMemo(() => {
      if (typeof InsightsEngine === 'undefined') return [];
      return InsightsEngine.generateProjections(
        (data.summaries || []).filter(s => !s.isComplete && (s.totalStitches || 0) > 0)
      );
    }, [data.summaries]);
    const insights = useMemo(() => {
      if (typeof InsightsEngine === 'undefined') return [];
      return InsightsEngine.generateInsights({
        summaries: data.summaries,
        allSessions: data.allSessions,
        thisWeek: weekComp.thisWeek,
        lastWeek: weekComp.lastWeek,
        stash: data.stash,
        dismissed: Object.keys(dismissed)
      });
    }, [data.summaries, data.allSessions, weekComp, data.stash, dismissed]);

    const dismissInsight = useCallback(id => {
      setDismissed(prev => {
        const next = Object.assign({}, prev, { [id]: Date.now() });
        saveDismissed(next);
        return next;
      });
    }, []);
    const resetDismissed = useCallback(() => {
      saveDismissed({});
      setDismissed({});
    }, []);
    const dismissedCount = Object.keys(dismissed).length;

    if (data.loading) {
      return h('div', { style: { padding: '60px 0', textAlign: 'center', color: 'var(--text-tertiary)' } },
        h('div', { style: { width: 28, height: 28, border: '2.5px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' } }),
        'Building your insights\u2026'
      );
    }
    if (data.error) {
      return h('div', { style: { padding: 30, textAlign: 'center', color: 'var(--text-secondary)' } }, data.error);
    }

    const isEmpty = (data.allSessions || []).length === 0 && (data.summaries || []).length === 0;
    if (isEmpty) {
      const lampIcon = window.Icons && window.Icons.lightbulb ? window.Icons.lightbulb() : null;
      // With zero projects AND zero sessions, the useful next step is to
      // create a pattern \u2014 not open an empty Tracker.
      if (window.EmptyState) {
        return h(window.EmptyState, {
          icon: lampIcon,
          title: 'Create your first pattern',
          description: 'Design a pattern in the Creator, then start stitching \u2014 your insights will appear here as you make progress.',
          ctaLabel: 'Open the creator',
          ctaAction: () => { window.location.href = 'home.html?tab=create'; }
        });
      }
      return h('div', { style: { padding: '40px 20px', textAlign: 'center', color: 'var(--text-secondary)' } },
        'No insights yet \u2014 stitch a few sessions to start your story.'
      );
    }

    return h('div', { style: { padding: '12px 0 40px' } },
      // Weekly summary
      h(WeeklySummaryCard, { thisWeek: weekComp.thisWeek, lastWeek: weekComp.lastWeek }),

      // Projects section
      projections.length > 0 && h('div', null,
        h('div', { className: 'gsd-section-label', style: { marginTop:'var(--s-4)' } }, 'Your projects'),
        h('div', { style: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, margin: '8px 0 16px' } },
          projections.map(p => h(ProjectionCard, { key: p.id, p: p }))
        )
      ),

      // Insights list
      h('div', { className: 'gsd-section-label', style: { marginTop:'var(--s-4)' } }, 'Insights'),
      insights.length > 0
        ? h('div', { style: { margin: '8px 0 16px' } },
            insights.map(i => h(InsightCard, { key: i.id, insight: i, onDismiss: dismissInsight }))
          )
        : h('div', { style: { fontSize:'var(--text-md)', color: 'var(--text-secondary)', padding: '16px 0' } },
            dismissedCount > 0
              ? 'No active insights right now \u2014 you may have dismissed them all.'
              : 'No insights yet \u2014 keep stitching and check back soon!'
          ),
      dismissedCount > 0 && h('button', {
        onClick: resetDismissed,
        title: 'Hidden insights reappear after 30 days. Click to show them now.',
        style: { fontSize:'var(--text-xs)', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600, marginBottom:'var(--s-4)' }
      }, 'Show all insights (' + dismissedCount + ' hidden)'),

      // Colour heatmap
      h('div', { className: 'gsd-section-label', style: { marginTop:'var(--s-4)' } }, 'Colour usage'),
      h('div', { style: { background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 14, margin: '8px 0 16px' } },
        h(ColourHeatmap, { mostUsed: data.mostUsed, totalColours: data.totalColours, stash: data.stash })
      ),

      // Rhythm heatmap
      h('div', { className: 'gsd-section-label', style: { marginTop:'var(--s-4)' } }, 'Stitching rhythm'),
      h('div', { style: { background: 'var(--surface)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 14, margin: '8px 0 16px' } },
        h(RhythmHeatmap, { allSessions: data.allSessions })
      )
    );
  }

  window.StatsInsights = StatsInsights;
})();
