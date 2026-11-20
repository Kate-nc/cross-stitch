// home-screen.js
// Dashboard hub — unified entry point for the cross-stitch app.
// Renders when showHome === true or no current project is active.
//
// NOTE: /home (home.html + home-app.js) is the default landing surface
// (UX-12 Phase 7/8). The Creator-mount path (mode === 'home') has been
// removed. This file is still required because manager.html loads it for
// window.MultiProjectDashboard, consumed by project-library.js. Do not
// delete it without refactoring those consumers.

function timeAgo(date) {
  if (!date) return '';
  var d = typeof date === 'string' ? new Date(date) : date;
  var now = Date.now();
  var diff = now - d.getTime();
  if (diff < 0) return 'just now';
  var sec = Math.floor(diff / 1000);
  if (sec < 60) return 'just now';
  var min = Math.floor(sec / 60);
  if (min < 60) return min + ' min ago';
  var hr = Math.floor(min / 60);
  if (hr < 24) return hr + 'h ago';
  var days = Math.floor(hr / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return days + ' days ago';
  var months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return months[d.getMonth()] + ' ' + d.getDate();
}

function getGreeting() {
  var h = new Date().getHours();
  if (h >= 5 && h <= 11) return 'Good morning';
  if (h >= 12 && h <= 16) return 'Good afternoon';
  return 'Good evening';
}
// UX-12 Phase 7: expose helpers so home-app.js (the new /home landing) can reuse them.
if (typeof window !== 'undefined') {
  window.timeAgo = timeAgo;
  window.getGreeting = getGreeting;
}

// ─────────────────────────────────────────────────────────────────
// Helpers used by the multi-project dashboard
// ─────────────────────────────────────────────────────────────────

function daysBetween(dateStrOrDate) {
  if (!dateStrOrDate) return null;
  var d = typeof dateStrOrDate === 'string' ? new Date(dateStrOrDate) : dateStrOrDate;
  return Math.floor((Date.now() - d.getTime()) / 86400000);
}

// Derive a project state from metadata when no override is stored.
// active  = has at least one completed stitch and is not 100% done
// complete = 100% done
// queued  = no stitches yet
// design  = source is 'creator' only (no tracking data)
function inferProjectState(proj) {
  var cs = proj.completedStitches || 0;
  var ts = proj.totalStitches || 0;
  if (ts > 0 && cs >= ts) return 'complete';
  if (cs > 0) return 'active';
  if (proj.source === 'creator' && proj.sessionCount === 0) return 'design';
  return 'queued';
}

// Get the effective state for a project (override wins over inferred).
function getProjectState(proj, overrides) {
  if (overrides && overrides[proj.id]) return overrides[proj.id];
  return inferProjectState(proj);
}

// Estimate remaining hours for a project. A project with no stitching history yet uses the default speed, the one the
// Creator and Tracker start with, so a card and the Creator give the same figure for the same chart.
function estimateRemainingHours(proj) {
  var remaining = (proj.totalStitches || 0) - (proj.completedStitches || 0);
  if (remaining <= 0) return 0;
  var fallback = typeof DEFAULT_STITCH_SPEED !== 'undefined' ? DEFAULT_STITCH_SPEED : 40;
  var speed = proj.stitchesPerHour > 0 ? proj.stitchesPerHour : fallback;
  return remaining / speed;
}

// The card's estimate in the one wording (helpers.js estimateText): "about 424 hours, about 4 weeks at your pace". The
// calendar part needs the project's recent pace (paceDaily on its row), so it is left out until there is some.
function estimateRemainingText(proj) {
  var hours = estimateRemainingHours(proj);
  if (!(hours > 0)) return '';
  var days = 0;
  if (proj.paceDaily && typeof estimateFromPace === 'function' && typeof paceFromDaily === 'function') {
    var today = getStitchingDate(new Date(), getDayEndHour());
    var pace = paceFromDaily(proj.paceDaily, proj.firstActiveDate, today, proj.activeDaysTotal);
    var remaining = (proj.totalStitches || 0) - (proj.completedStitches || 0);
    var est = estimateFromPace(pace, remaining, { today: today, percent: ProgressUnits.percent(proj.completedStitches || 0, proj.totalStitches || 0) });
    if (est.enough) days = est.calendarDaysRemaining;
  }
  return estimateText(hours, days);
}

// ─────────────────────────────────────────────────────────────────
// Suggestion algorithm
// ─────────────────────────────────────────────────────────────────
function getSuggestion(activeProjects, stashMap) {
  if (!activeProjects || activeProjects.length === 0) return null;
  var now = new Date();
  var hour = now.getHours();

  var scored = activeProjects.map(function(proj) {
    var score = 0;
    var cs = proj.completedStitches || 0;
    var ts = proj.totalStitches || 1;
    var pct = cs / ts;

    // Recency boost: each day since last stitch adds points
    var days = daysBetween(proj.lastSessionDate || proj.updatedAt);
    if (days != null) score += Math.min(days * 3, 30);

    // Near-completion boost
    if (pct >= 0.8) score += 20;
    else if (pct >= 0.5) score += 5;

    // Evening suggestion boost (relaxing, large blocks)
    // We can't know block size without full pattern data, so skip that nuance.

    // Stash readiness
    if (stashMap && stashMap[proj.id]) score += 10;

    return { proj: proj, score: score, days: days, pct: ProgressUnits.percent(cs,ts) };
  });

  scored.sort(function(a, b) { return b.score - a.score; });
  var top = scored[0];
  if (!top) return null;

  var reason = '';
  if (top.days != null && top.days >= 5) {
    reason = "You haven\u2019t stitched this in " + top.days + " day" + (top.days === 1 ? '' : 's') + '.';
  } else if (top.pct >= 80) {
    reason = "You\u2019re " + top.pct + "% done \u2014 so close to the finish line!";
  } else {
    reason = "Keep the momentum going \u2014 you\u2019re " + top.pct + "% done.";
  }
  return { proj: top.proj, reason: reason };
}

// ─────────────────────────────────────────────────────────────────
// ProjectCard
// ─────────────────────────────────────────────────────────────────
function ProjectCard({ proj, onOpen, onChangeState, stashOk, stashMsg, cardExtras,
                       selectionMode, selected, onToggleSelect, onLongPress,
                       payloadCache }) {
  var h = React.createElement;
  var cs = proj.completedStitches || 0;
  var ts = proj.totalStitches || 0;
  var pct = ts > 0 ? ProgressUnits.percent(cs, ts) : 0;
  var days = daysBetween(proj.lastSessionDate || proj.updatedAt);
  var isNeglected = days != null && days >= 13;
  var remText = estimateRemainingText(proj);
  var weekSt = proj.stitchesThisWeek || 0;
  var weekSess = 0; // not stored in meta, skip for now
  var dim = proj.dimensions ? (proj.dimensions.width + '\u00D7' + proj.dimensions.height) : '';
  var fabricCt = proj.fabricCt ? proj.fabricCt + '-count' : '';
  // Thread count — meta sometimes carries it as `colourCount` or `threadCount`.
  var threadCount = proj.colourCount || proj.threadCount || (proj.threads && proj.threads.length) || 0;
  // Difficulty — proxy computation from metadata (no pattern scan available here).
  var diff = (typeof calcDifficulty === 'function' && threadCount > 0)
    ? calcDifficulty(threadCount, 0, proj.totalStitches || 0, { fabricCt: proj.fabricCt || 14 })
    : null;
  var stashColor = stashOk === true ? 'var(--success)' : stashOk === false ? 'var(--accent-ink)' : '#a1a1aa';
  var stashIconEl = stashOk === true ? (window.Icons && window.Icons.check && window.Icons.check())
    : stashOk === false ? (window.Icons && window.Icons.warning && window.Icons.warning())
    : (window.Icons && window.Icons.info && window.Icons.info());

  // ── PERF NOTE (B5 Option A): lazy-load full project payload for the
  // PartialStitchThumb only after the card mounts. The dashboard meta store
  // intentionally omits `pattern`/`done` so listProjects() stays cheap; we
  // fetch each project's payload once and memoise it on a Map ref shared at
  // the dashboard level (`payloadCache`) so re-renders never refetch.
  // Falls back to the static `proj.thumbnail` while loading.
  var _payload = React.useState(function() {
    if (payloadCache && payloadCache.has(proj.id)) return payloadCache.get(proj.id);
    return null;
  });
  var payload = _payload[0], setPayload = _payload[1];
  React.useEffect(function() {
    if (payload || proj.managerOnly) return;
    if (typeof ProjectStorage === 'undefined' || !ProjectStorage.get) return;
    var cancelled = false;
    ProjectStorage.get(proj.id).then(function(full) {
      if (cancelled || !full) return;
      var p = { pattern: full.pattern, done: full.done, w: full.w, h: full.h };
      if (payloadCache) payloadCache.set(proj.id, p);
      setPayload(p);
    }).catch(function() {});
    return function() { cancelled = true; };
  }, [proj.id]);

  // ── Long-press / multi-select interaction ──
  var pressTimerRef = React.useRef(null);
  var pressMovedRef = React.useRef(false);
  var pressStartRef = React.useRef({ x: 0, y: 0 });
  function clearPressTimer() {
    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }
  }
  function onTouchStart(e) {
    if (!e.touches || e.touches.length !== 1) return;
    pressMovedRef.current = false;
    pressStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    clearPressTimer();
    pressTimerRef.current = setTimeout(function() {
      pressTimerRef.current = null;
      if (!pressMovedRef.current && onLongPress) onLongPress(proj);
    }, 500);
  }
  function onTouchMove(e) {
    if (!e.touches || e.touches.length !== 1) return;
    var dx = e.touches[0].clientX - pressStartRef.current.x;
    var dy = e.touches[0].clientY - pressStartRef.current.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
      pressMovedRef.current = true;
      clearPressTimer();
    }
  }
  function onTouchEnd() { clearPressTimer(); }

  function handleCardClick(e) {
    // Cmd/Ctrl-click toggles selection without entering selection mode.
    if ((e.metaKey || e.ctrlKey) && onToggleSelect) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect(proj.id);
      return true;
    }
    if (selectionMode && onToggleSelect) {
      e.preventDefault();
      e.stopPropagation();
      onToggleSelect(proj.id);
      return true;
    }
    return false;
  }
  function thumbClick(e) {
    if (handleCardClick(e)) return;
    onOpen(proj, 'tracker');
  }
  function nameClick(e) {
    if (handleCardClick(e)) return;
    onOpen(proj, 'tracker');
  }

  var cardClassName = 'mpd-card'
    + (selected ? ' mpd-card--selected' : '')
    + (selectionMode ? ' mpd-card--selectable' : '');

  return h('div', {
      className: cardClassName,
      onTouchStart: onTouchStart,
      onTouchMove: onTouchMove,
      onTouchEnd: onTouchEnd,
      onTouchCancel: onTouchEnd
    },
    // Selection checkbox (top-left, visible in selection mode or on hover)
    h('button', {
      type: 'button',
      className: 'mpd-card-select' + (selected ? ' mpd-card-select--checked' : ''),
      'aria-label': selected ? 'Deselect project' : 'Select project',
      'aria-pressed': !!selected,
      onClick: function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (onToggleSelect) onToggleSelect(proj.id);
      }
    }, selected && window.Icons && window.Icons.check ? window.Icons.check() : null),

    // Thumbnail
    // --ar (pattern width / height) lets the CSS zoom the preview to fill the
    // strip, cropping at most half of it.
    h('div', {
      className: 'mpd-card-thumb', onClick: thumbClick,
      style: (payload && payload.w && payload.h) ? { '--ar': payload.w / payload.h } : undefined
    },
      (payload && payload.pattern && window.PartialStitchThumb)
        ? h(window.PartialStitchThumb, {
            pattern: payload.pattern,
            done: payload.done,
            w: payload.w,
            h: payload.h,
            size: 320,
            projectId: proj.id,
            className: 'mpd-card-thumb-img mpd-card-thumb-img--pattern',
            alt: ''
          })
        : (proj.thumbnail
            ? h('img', { src: proj.thumbnail, alt: '', className: 'mpd-card-thumb-img', loading: 'lazy', decoding: 'async' })
            : h('div', { className: 'mpd-card-thumb-placeholder' }))
    ),
    // Body
    h('div', { className: 'mpd-card-body' },
      // Top row: name + progress
      h('div', { className: 'mpd-card-top' },
        h('div', { className: 'mpd-card-name', onClick: nameClick },
          proj.name || 'Untitled'
        )
      ),
      // Stash-Manager-only badge — surfaced on entries that exist in the
      // Manager pattern library but have no linked Creator/Tracker project.
      proj.managerOnly && h('div', { className: 'mpd-card-badge mpd-card-badge--manager-only',
        title: 'This entry was added directly in the Stash Manager and has no Creator/Tracker project linked.',
        style: { display: 'inline-block', fontSize: 10, padding: '2px 8px', borderRadius:'var(--radius-lg)', background: 'var(--warning-soft)', color: 'var(--accent-ink)', fontWeight: 600, marginBottom: 6 } },
        'Stash Manager only'),
      // Stash-Adapt: pill linking back to the source project for adapted patterns.
      proj.adaptation && proj.adaptation.fromName && window.AdaptedBadge && h('div', { style: { marginBottom: 6 } },
        h(window.AdaptedBadge, {
          fromName: proj.adaptation.fromName,
          compact: true,
          onClick: proj.adaptation.fromProjectId && onOpen ? function () {
            onOpen(Object.assign({}, proj, { id: proj.adaptation.fromProjectId, name: proj.adaptation.fromName }));
          } : null
        })
      ),
      // Optional per-card extras supplied by the parent (e.g. Manager
      // shopping-list checkbox + missing-thread badge).
      cardExtras ? h('div', { className: 'mpd-card-extras', style: { marginBottom:'var(--s-2)' } }, cardExtras(proj)) : null,
      // Progress, shown once: the bar with its percentage beside it (the stitch counts are the hover text). A manager-only
      // entry has no tracked stitches, so it has no progress to show.
      ts > 0 && h('div', { className: 'mpd-card-progress', title: ProgressUnits.formatUnits(cs) + ' of ' + ProgressUnits.formatUnits(ts) + ' stitches' },
        h('div', { className: 'mpd-card-progress-track', role: 'progressbar', 'aria-label': 'Progress', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuetext': pct + '% stitched' },
          h('div', { className: 'mpd-card-progress-fill', style: { width: Math.min(100, pct) + '%' } })
        ),
        h('span', { className: 'mpd-card-pct' + (pct >= 100 ? ' mpd-card-pct--done' : ''), 'aria-hidden': 'true' }, pct + '%')
      ),
      // Metadata row
      (dim || fabricCt || threadCount > 0) ? h('div', { className: 'mpd-card-meta' },
        dim && h('span', null, dim),
        dim && fabricCt && h('span', { className: 'mpd-card-sep' }, '\u00B7'),
        fabricCt && h('span', null, fabricCt),
        threadCount > 0 && (dim || fabricCt) && h('span', { className: 'mpd-card-sep' }, '\u00B7'),
        threadCount > 0 && h('span', null, threadCount + ' colour' + (threadCount === 1 ? '' : 's')),
        diff && h('span', { className: 'mpd-card-sep' }, '\u00B7'),
        diff && h('span', {
          className: 'mpd-card-difficulty',
          style: { color: diff.color, borderColor: diff.color },
          title: 'Difficulty: ' + diff.label + (diff.score != null ? ' \u00B7 ' + diff.score + ' / 100' : '')
        }, diff.label)
      ) : null,
      // Recency
      h('div', { className: 'mpd-card-recency' + (isNeglected ? ' mpd-card-recency--warn' : '') },
        days === 0 ? 'Last stitched today' :
        days === 1 ? 'Last stitched yesterday' :
        days != null ? 'Last stitched ' + days + ' days ago' : 'Not started'
      ),
      // Session summary
      weekSt > 0 && h('div', { className: 'mpd-card-session' },
        'This week: ' + weekSt.toLocaleString('en-GB') + ' stitches'
      ),
      // Time estimate
      remText && h('div', { className: 'mpd-card-estimate' },
        'Est. remaining: ' + remText
      ),
      // Footer row: stash + continue
      h('div', { className: 'mpd-card-footer' },
        h('div', { className: 'mpd-card-stash', style: { color: stashColor, display: 'inline-flex', alignItems: 'center', gap:'var(--s-1)' }, title: stashMsg || '' },
          stashIconEl,
          h('span', null, stashMsg || (stashOk === true ? 'Ready' : stashOk === false ? 'Need threads' : 'Stash not checked'))
        ),
        h('div', { className: 'mpd-card-actions' },
          h('button', {
            type: 'button',
            className: 'mpd-btn mpd-btn--primary',
            onClick: function() { onOpen(proj, 'tracker'); }
          }, 'Continue'),
          h('button', {
            type: 'button',
            className: 'mpd-btn mpd-btn--ghost mpd-card-menu-btn',
            title: 'Change project state',
            'aria-label': 'Change project state',
            onClick: function(e) {
              e.stopPropagation();
              onChangeState(proj);
            }
          }, '\u2026')
        )
      )
    )
  );
}

// ─────────────────────────────────────────────────────────────────
// CompactProjectRow (for queued / paused / completed lists)
// ─────────────────────────────────────────────────────────────────
function CompactProjectRow({ proj, state, onOpen, onChangeState }) {
  var h = React.createElement;
  var cs = proj.completedStitches || 0;
  var ts = proj.totalStitches || 0;
  var pct = ts > 0 ? ProgressUnits.percent(cs, ts) : 0;
  var dim = proj.dimensions ? proj.dimensions.width + '\u00D7' + proj.dimensions.height : '';
  var since = proj.lastSessionDate || proj.updatedAt;
  var daysAgo = daysBetween(since);

  var detail = '';
  if (state === 'paused') {
    detail = (daysAgo != null ? 'Paused ' + (daysAgo < 2 ? 'recently' : daysAgo + ' days ago') : '') +
             (pct > 0 ? (detail ? ' \u00B7 ' : '') + pct + '% complete' : '');
  } else if (state === 'complete') {
    var completedAt = proj.updatedAt;
    detail = completedAt ? 'Completed ' + new Date(completedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Completed';
    if (proj.totalMinutes > 0) detail += ' \u00B7 ' + (typeof fmtTimeL === 'function' ? fmtTimeL(proj.totalMinutes * 60) : Math.round(proj.totalMinutes / 60) + ' hours');
  } else {
    detail = dim;
  }

  return h('div', { className: 'mpd-compact-row' },
    h('div', { className: 'mpd-compact-thumb', onClick: function() { onOpen(proj, state === 'design' ? 'creator' : 'tracker'); } },
      proj.thumbnail
        ? h('img', { src: proj.thumbnail, alt: '', className: 'mpd-compact-thumb-img', loading: 'lazy', decoding: 'async' })
        : h('div', { className: 'mpd-compact-thumb-placeholder' })
    ),
    h('div', { className: 'mpd-compact-info', onClick: function() { onOpen(proj, state === 'design' ? 'creator' : 'tracker'); } },
      h('span', { className: 'mpd-compact-name' }, proj.name || 'Untitled'),
      proj.managerOnly && h('span', {
        className: 'mpd-compact-badge',
        title: 'Stash Manager only',
        style: { fontSize: 10, padding: '1px 6px', borderRadius:'var(--radius-md)', background: 'var(--warning-soft)', color: 'var(--accent-ink)', fontWeight: 600, marginLeft: 6 }
      }, 'Stash Manager only'),
      detail && h('span', { className: 'mpd-compact-detail' }, detail)
    ),
    h('button', {
      type: 'button',
      className: 'mpd-btn mpd-btn--ghost mpd-compact-menu-btn',
      title: 'Change project state',
      'aria-label': 'Change project state',
      onClick: function(e) { e.stopPropagation(); onChangeState(proj); }
    }, '\u2026')
  );
}

// ─────────────────────────────────────────────────────────────────
// StateChangeMenu — inline popover for moving a project to a new state
// ─────────────────────────────────────────────────────────────────
function StateChangeMenu({ proj, currentState, onSelect, onClose, onEditDetails, onDeleteSingle }) {
  var h = React.createElement;
  var options = [
    { value: 'active',   label: 'Mark as Active' },
    { value: 'queued',   label: 'Move to Queue' },
    { value: 'paused',   label: 'Pause project' },
    { value: 'complete', label: 'Mark as Complete' },
    { value: 'design',   label: 'Design only (no tracking)' },
  ].filter(function(o) { return o.value !== currentState; });

  React.useEffect(function() {
    function handler(e) { onClose(); }
    document.addEventListener('click', handler);
    return function() { document.removeEventListener('click', handler); };
  }, []);

  return h('div', { className: 'mpd-state-menu', onClick: function(e) { e.stopPropagation(); } },
    onEditDetails && h('button', {
      type: 'button',
      className: 'mpd-state-menu-item mpd-state-menu-item--edit',
      onClick: function() { onClose(); onEditDetails(proj); }
    }, Icons.pencil(), ' Edit details…'),
    onEditDetails && h('div', { className: 'mpd-state-menu-sep' }),
    h('div', { className: 'mpd-state-menu-title' }, 'Move to\u2026'),
    options.map(function(o) {
      return h('button', {
        type: 'button',
        key: o.value,
        className: 'mpd-state-menu-item',
        onClick: function() { onSelect(proj, o.value); onClose(); }
      }, o.label);
    }),
    // VER-FB-002 / VER-EL-SCR-052-08-02 — single-project delete via styled
    // BulkDeleteModal (one preselected). window.confirm() is NOT used here.
    onDeleteSingle && h('div', { className: 'mpd-state-menu-sep' }),
    onDeleteSingle && h('button', {
      type: 'button',
      className: 'mpd-state-menu-item mpd-state-menu-item--danger',
      onClick: function() { onClose(); onDeleteSingle(proj); }
    }, Icons.trash ? Icons.trash() : null, ' Delete project…')
  );
}

// ─────────────────────────────────────────────────────────────────
// BulkDeleteModal (fix-3.5) — styled confirmation replacing
// window.confirm. Lists up to 5 project names so the user can
// double-check before destroying records.
// ─────────────────────────────────────────────────────────────────
function BulkDeleteModal({ projectIds, projectsById, onConfirm, onCancel }) {
  var h = React.createElement;
  var useEffect = React.useEffect;
  var useRef = React.useRef;
  var cancelRef = useRef(null);
  useEffect(function () {
    if (cancelRef.current && cancelRef.current.focus) cancelRef.current.focus();
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      if (e.key === 'Enter' && e.target && e.target.classList && e.target.classList.contains('mpd-confirm-delete-btn')) {
        e.preventDefault(); onConfirm();
      }
    }
    window.addEventListener('keydown', onKey);
    return function () { window.removeEventListener('keydown', onKey); };
  }, []);
  var ids = projectIds || [];
  var n = ids.length;
  var SHOW_MAX = 5;
  var visible = ids.slice(0, SHOW_MAX);
  var extra = Math.max(0, n - SHOW_MAX);
  return h('div', {
    className: 'modal-overlay mpd-bulk-delete-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-labelledby': 'mpd-bulk-delete-title',
    onClick: function (e) { if (e.target === e.currentTarget) onCancel(); },
    style: { position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding:'var(--s-4)' }
  },
    h('div', {
      className: 'modal-content mpd-bulk-delete-modal',
      style: { background: 'var(--surface)', borderRadius:'var(--radius-xl)', padding: 20, maxWidth: 440, width: '100%', boxShadow: '0 20px 60px rgba(15, 23, 42, 0.3)' },
    },
      h('h3', { id: 'mpd-bulk-delete-title' }, 'Delete ' + n + ' project' + (n === 1 ? '' : 's') + '?'),
      h('p', null, 'This permanently removes the selected project' + (n === 1 ? '' : 's') + ' and ' + (n === 1 ? 'its' : 'their') + ' progress, palettes, and stitch history. You will have a few seconds to undo after confirming.'),
      h('ul', null,
        visible.map(function (id) {
          var name = (projectsById && projectsById[id]) || id;
          return h('li', { key: id }, name);
        }),
        extra > 0 ? h('li', { key: '__more', style: { listStyle: 'none', marginLeft: -18, color: 'var(--text-tertiary)' } }, '\u2026 and ' + extra + ' more') : null
      ),
      h('div', { className: 'mpd-bulk-delete-actions' },
        h('button', { type: 'button', ref: cancelRef, className: 'mpd-cancel-btn', onClick: onCancel }, 'Cancel'),
        h('button', { type: 'button', className: 'mpd-confirm-delete-btn', onClick: onConfirm }, 'Delete ' + n + ' project' + (n === 1 ? '' : 's'))
      )
    )
  );
}

// ─────────────────────────────────────────────────────────────────
// MultiProjectDashboard — shown on home screen when >1 project exists
// ─────────────────────────────────────────────────────────────────
function MultiProjectDashboard({ projects, stash, onOpenProject, onOpenGlobalStats, onAddNew, cardExtras }) {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;

  var _states = useState(function() {
    return typeof ProjectStorage !== 'undefined' ? ProjectStorage.getProjectStates() : {};
  });
  var states = _states[0], setStates = _states[1];

  // [{ proj, id }] for the state change popover
  var _menuProj = useState(null);
  var menuProj = _menuProj[0], setMenuProj = _menuProj[1];

  // Project currently open in the Edit Details modal
  var _editingProj = useState(null);
  var editingProj = _editingProj[0], setEditingProj = _editingProj[1];

  // collapsed sections
  var _pausedOpen = useState(false);
  var pausedOpen = _pausedOpen[0], setPausedOpen = _pausedOpen[1];
  var _completedOpen = useState(false);
  var completedOpen = _completedOpen[0], setCompletedOpen = _completedOpen[1];
  var _designOpen = useState(false);
  var designOpen = _designOpen[0], setDesignOpen = _designOpen[1];

  // ── Multi-select dashboard state (B5) ──
  // `selected` is a Set<projectId>. `selectionMode` flips the bulk-action bar
  // on; cards expose checkboxes and clicks toggle selection rather than open.
  var _selected = useState(function() { return new Set(); });
  var selected = _selected[0], setSelected = _selected[1];
  var _selectionMode = useState(false);
  var selectionMode = _selectionMode[0], setSelectionMode = _selectionMode[1];
  // confirmDelete is null when closed, or an array of project IDs to delete.
  // Bulk-delete sets it to Array.from(selected); single-card delete sets [id].
  var _confirmDelete = useState(null);
  var confirmDelete = _confirmDelete[0], setConfirmDelete = _confirmDelete[1];

  // Lazy-loaded project payload cache, shared across all rendered cards so
  // re-renders never refetch. PERF NOTE (Option A): only loads when a card
  // actually mounts — avoids the full-payload fan-out that would re-introduce
  // the perf problem the meta store was designed to solve.
  var payloadCacheRef = React.useRef(null);
  if (!payloadCacheRef.current) payloadCacheRef.current = new Map();

  // Reset / intersect the selection set whenever the project list changes
  // (e.g. after a bulk delete or archive) so the bulk bar never references
  // ghost IDs.
  useEffect(function() {
    var ids = new Set(projects.map(function(p) { return p.id; }));
    setSelected(function(prev) {
      var next = new Set();
      prev.forEach(function(id) { if (ids.has(id)) next.add(id); });
      if (next.size === prev.size) return prev;
      return next;
    });
    if (selectionMode && projects.length === 0) setSelectionMode(false);
  }, [projects]);

  // Escape exits selection mode (mounts/unmounts with the mode).
  useEffect(function() {
    if (!selectionMode) return;
    function onKey(e) {
      if (e.key === 'Escape') {
        setSelectionMode(false);
        setSelected(new Set());
      }
    }
    window.addEventListener('keydown', onKey);
    return function() { window.removeEventListener('keydown', onKey); };
  }, [selectionMode]);

  function toggleSelect(id) {
    setSelected(function(prev) {
      var next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      // Auto-exit selection mode when nothing is selected.
      if (next.size === 0) setSelectionMode(false);
      else if (!selectionMode) setSelectionMode(true);
      return next;
    });
  }
  function enterSelectionMode(proj) {
    setSelectionMode(true);
    setSelected(function(prev) {
      var next = new Set(prev);
      next.add(proj.id);
      return next;
    });
  }
  function selectAll() {
    var ids = new Set(projects.filter(function(p) { return !p.managerOnly; }).map(function(p) { return p.id; }));
    setSelected(ids);
  }
  function clearSelection() {
    setSelected(new Set());
    setSelectionMode(false);
  }

  // Stash readiness lookup: { projectId → true/false/null }
  var stashReadiness = useMemo(function() {
    if (!stash) return {};
    var out = {};
    projects.forEach(function(proj) {
      // We don't have per-project thread requirements in metadata — fall back to null (not checked).
      out[proj.id] = null;
    });
    return out;
  }, [projects, stash]);

  // Compute global summary stats from metadata
  var summary = useMemo(function() {
    var monthStr = new Date().toISOString().slice(0, 7);
    var monthSt = 0;
    projects.forEach(function(p) { monthSt += (p.stitchesThisMonth || 0); });
    // Streak from localStorage (written by tracker)
    var streak = 0;
    try {
      var streakData = JSON.parse(localStorage.getItem(LOCAL_STORAGE_KEYS.globalStreak) || 'null');
      if (streakData && typeof streakData === 'object' && typeof streakData.current === 'number' && streakData.current > 0) streak = streakData.current;
    } catch(e) {}
    var activeCount = projects.filter(function(p) { return getProjectState(p, states) === 'active'; }).length;
    return { activeCount: activeCount, monthStitches: monthSt, streak: streak };
  }, [projects, states]);

  // Categorise projects
  var categorised = useMemo(function() {
    var active = [], queued = [], paused = [], complete = [], design = [];
    projects.forEach(function(p) {
      var s = getProjectState(p, states);
      if (s === 'active') active.push(p);
      else if (s === 'queued') queued.push(p);
      else if (s === 'paused') paused.push(p);
      else if (s === 'complete') complete.push(p);
      else design.push(p);
    });
    // Sort active by most recently touched
    active.sort(function(a, b) {
      var da = a.lastSessionDate || a.updatedAt || '';
      var db = b.lastSessionDate || b.updatedAt || '';
      return db > da ? 1 : -1;
    });
    return { active: active, queued: queued, paused: paused, complete: complete, design: design };
  }, [projects, states]);

  // If every project sits in a collapsed section, the library renders as
  // empty even though the counts say otherwise — the canonical case is a
  // fresh sync import of Creator-authored patterns, which all infer state
  // 'design'. Expand the non-empty collapsed sections once so newly arrived
  // patterns are actually visible; after that the user's toggles win.
  var autoExpandedRef = React.useRef(false);
  useEffect(function() {
    if (autoExpandedRef.current) return;
    if (projects.length === 0) return;
    autoExpandedRef.current = true;
    if (categorised.active.length + categorised.queued.length > 0) return;
    if (categorised.design.length > 0) setDesignOpen(true);
    if (categorised.paused.length > 0) setPausedOpen(true);
    if (categorised.complete.length > 0) setCompletedOpen(true);
  }, [categorised, projects]);

  // Suggestion
  var suggestion = useMemo(function() {
    return getSuggestion(categorised.active, null);
  }, [categorised.active]);

  function handleChangeState(proj, newState) {
    if (typeof ProjectStorage !== 'undefined') {
      ProjectStorage.setProjectState(proj.id, newState);
    }
    setStates(function(prev) {
      var next = Object.assign({}, prev);
      next[proj.id] = newState;
      return next;
    });
  }

  // ── Bulk handlers (B5) ──
  function showToast(message, type) {
    if (window.Toast && typeof window.Toast.show === 'function') {
      window.Toast.show({ message: message, type: type || 'success' });
    }
  }
  function handleBulkArchive() {
    var ids = Array.from(selected);
    if (ids.length === 0) return;
    if (typeof ProjectStorage !== 'undefined' && ProjectStorage.setStateMany) {
      ProjectStorage.setStateMany(ids, 'paused');
    }
    setStates(function(prev) {
      var next = Object.assign({}, prev);
      ids.forEach(function(id) { next[id] = 'paused'; });
      return next;
    });
    setSelected(new Set());
    setSelectionMode(false);
    showToast(ids.length + ' project' + (ids.length === 1 ? '' : 's') + ' archived', 'success');
  }
  function handleBulkDelete() {
    var ids = Array.from(selected);
    if (ids.length === 0) return;
    // fix-3.5 — open the styled BulkDelete confirmation modal instead of
    // the native browser dialog. Actual deletion happens in doBulkDelete().
    setConfirmDelete(ids);
  }
  // VER-FB-002 / VER-EL-SCR-052-08-02 — single-card delete reuses the same
  // BulkDeleteModal preselected with one id; window.confirm() is NOT used.
  function handleSingleDelete(proj) {
    if (!proj || !proj.id) return;
    setConfirmDelete([proj.id]);
  }
  function doBulkDelete() {
    var ids = Array.isArray(confirmDelete) ? confirmDelete.slice() : [];
    setConfirmDelete(null);
    if (ids.length === 0) return;
    if (typeof ProjectStorage !== 'undefined' && ProjectStorage.deleteMany) {
      // VER-FB-017 — snapshot full project objects before deletion so the
      // toast Undo button can restore them. ProjectStorage.save() is the
      // inverse of delete, so re-saving each snapshot reinstates the
      // project, its meta, and any stats summary.
      Promise.all(ids.map(function (id) {
        return ProjectStorage.get(id).catch(function () { return null; });
      })).then(function (snapshots) {
        var restorable = snapshots.filter(Boolean);
        return ProjectStorage.deleteMany(ids).then(function () {
          var msg = ids.length + ' project' + (ids.length === 1 ? '' : 's') + ' deleted';
          if (restorable.length > 0 && window.Toast && window.Toast.show) {
            window.Toast.show({
              message: msg,
              type: 'success',
              duration: 6000,
              undoLabel: 'Undo',
              undoAction: function () {
                Promise.all(restorable.map(function (p) {
                  // DEL-BUG-002 fix: clear the deletion guard so ProjectStorage.save()
                  // does not silently swallow the restore. Without this, save() returns
                  // early because the ID is still in _deletedIds from the delete call above.
                  if (ProjectStorage._deletedIds && typeof ProjectStorage._deletedIds.delete === 'function') {
                    ProjectStorage._deletedIds.delete(p.id);
                  }
                  return ProjectStorage.save(p).catch(function (err) {
                    console.error('Project restore failed:', err);
                    return null;
                  });
                })).then(function () {
                  if (window.Toast && window.Toast.show) {
                    window.Toast.show({ message: 'Restored ' + restorable.length + ' project' + (restorable.length === 1 ? '' : 's'), type: 'success' });
                  }
                });
              }
            });
          } else {
            showToast(msg, 'success');
          }
        });
      }).catch(function () {
        showToast('Delete failed', 'error');
      });
    }
    // Clear bulk selection state if this was a multi-delete, otherwise leave
    // it alone (single-card delete does not enter selection mode).
    if (selected.size > 0) {
      setSelected(new Set());
      setSelectionMode(false);
    }
  }
  function handleBulkExport() {
    // Bulk export lands in B4 — surface a placeholder toast for now.
    showToast('Bulk export coming in B4', 'info');
  }

  function openMenu(proj) {
    setMenuProj(proj.id);
  }

  function openEditDetails(proj) {
    setEditingProj(proj);
  }

  function handleOpenProject(proj, mode) {
    if (onOpenProject) onOpenProject(proj, mode || 'tracker');
  }

  var stashForMap = stash ? {} : null;

  // Most recently touched non-complete project for the sticky "Continue
  // stitching" bar. Prefer 'active' (in-progress) projects, but fall back to
  // queued/design so a brand-new sample project still surfaces here.
  function _continueCandidate(list) {
    for (var i = 0; i < list.length; i++) {
      var cp = list[i];
      if (!cp || cp.managerOnly) continue;
      if (typeof ProjectStorage !== 'undefined' && ProjectStorage.isDeleted && ProjectStorage.isDeleted(cp.id)) continue;
      return cp;
    }
    return null;
  }
  var continueProj = _continueCandidate(categorised.active)
    || _continueCandidate(categorised.queued || [])
    || _continueCandidate(categorised.design || []);
  var continuePct = continueProj && continueProj.totalStitches > 0
    ? ProgressUnits.percent(continueProj.completedStitches || 0,continueProj.totalStitches)
    : 0;

  return h('div', { className: 'mpd' + (selectionMode ? ' mpd--selection-mode' : '') },
    // ── Bulk action bar (B5) — only when in selection mode ──
    selectionMode && h('div', {
      className: 'mpd-bulk-bar',
      role: 'toolbar',
      'aria-label': 'Bulk project actions'
    },
      h('div', { className: 'mpd-bulk-bar-left' },
        h('span', { className: 'mpd-bulk-count' },
          selected.size + ' selected'),
        h('button', {
          type: 'button',
          className: 'mpd-btn mpd-btn--ghost',
          onClick: selectAll
        }, 'Select all'),
        h('button', {
          type: 'button',
          className: 'mpd-btn mpd-btn--ghost',
          onClick: clearSelection,
          'aria-label': 'Cancel selection mode'
        }, 'Cancel selection')
      ),
      h('div', { className: 'mpd-bulk-bar-right' },
        h('button', {
          type: 'button',
          className: 'mpd-btn mpd-btn--ghost',
          onClick: handleBulkArchive,
          disabled: selected.size === 0,
          title: 'Move selected projects to Paused'
        },
          window.Icons && window.Icons.archive ? window.Icons.archive() : null,
          h('span', null, ' Archive')
        ),
        h('button', {
          type: 'button',
          className: 'mpd-btn mpd-btn--ghost mpd-bulk-delete',
          onClick: handleBulkDelete,
          disabled: selected.size === 0,
          title: 'Delete selected projects'
        },
          window.Icons && window.Icons.trash ? window.Icons.trash() : null,
          h('span', null, ' Delete')
        ),
        h('button', {
          type: 'button',
          className: 'mpd-btn mpd-btn--ghost',
          onClick: handleBulkExport,
          disabled: selected.size === 0,
          title: 'Export selected projects'
        }, 'Export')
      )
    ),

    // fix-3.7 — persistent "Selection mode active" banner replacing the
    // Continue bar slot. Gives a constant visible affordance to leave
    // selection mode without scrolling back to the top toolbar.
    selectionMode && h('div', {
      className: 'mpd-selection-cancel-bar',
      role: 'status',
      'aria-live': 'polite',
    },
      h('span', null, 'Selection mode active \u2014 ' + selected.size + ' selected'),
      h('button', { type: 'button', onClick: clearSelection, 'aria-label': 'Cancel selection mode' }, 'Cancel selection')
    ),

    // ── Sticky Continue bar (most recent active project) ──
    // Hidden while selection mode is active to keep the bulk bar uncluttered.
    !selectionMode && continueProj && h('div', {
      className: 'mpd-continue-bar',
      style: {
        background: 'var(--accent-light)', border: '1px solid var(--accent-border)',
        borderRadius: 'var(--radius-lg)', padding: '8px 14px',
        display: 'flex', alignItems: 'center', gap:'var(--s-3)', marginBottom:'var(--s-3)', minHeight: 48
      }
    },
      h('div', {
        style: { width: 32, height: 32, borderRadius:'var(--radius-sm)', overflow: 'hidden', flexShrink: 0, background: 'var(--surface)', border: '1px solid var(--border)' }
      },
        continueProj.thumbnail
          ? h('img', { src: continueProj.thumbnail, alt: '', loading: 'lazy', decoding: 'async', style: { width: '100%', height: '100%', objectFit: 'cover', display: 'block' } })
          : null
      ),
      h('div', { style: { flex: 1, minWidth: 0 } },
        h('div', { style: { fontSize:'var(--text-md)', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' } }, continueProj.name || 'Untitled'),
        h('div', { style: { fontSize:'var(--text-xs)', color: 'var(--text-secondary)' } }, continuePct + '% complete')
      ),
      h('button', {
        className: 'mpd-btn mpd-btn--primary',
        style: { fontSize:'var(--text-sm)', padding: '6px 12px', flexShrink: 0 },
        onClick: function() { handleOpenProject(continueProj, 'tracker'); }
      }, 'Continue \u2192')
    ),

    // ── Summary bar ──
    h('div', { className: 'mpd-summary-bar' },
      h('span', null, summary.activeCount + ' active project' + (summary.activeCount !== 1 ? 's' : '')),
      summary.monthStitches > 0 && h('span', null, '\u00B7 ' + summary.monthStitches.toLocaleString('en-GB') + ' stitches this month'),
      summary.streak > 1 && getMotivationPrefs().daily && h('span', { className: 'mpd-streak', style: { display: 'inline-flex', alignItems: 'center', gap:'var(--s-1)' } },
        window.Icons && window.Icons.fire ? window.Icons.fire() : null,
        h('span', null, summary.streak + '-day streak')
      )
    ),

    // ── Suggestion card (suppressed when it duplicates the Continue bar) ──
    suggestion && (!continueProj || suggestion.proj.id !== continueProj.id) && h('div', { className: 'mpd-suggestion' },
      h('div', { className: 'mpd-suggestion-title', style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
        window.Icons && window.Icons.lightbulb ? window.Icons.lightbulb() : null,
        h('span', null, 'Suggestion: pick up \u201C' + suggestion.proj.name + '\u201D')
      ),
      h('div', { className: 'mpd-suggestion-reason' }, suggestion.reason),
      h('button', {
        className: 'mpd-btn mpd-btn--primary',
        onClick: function() { handleOpenProject(suggestion.proj, 'tracker'); }
      }, 'Start now')
    ),

    // ── Active projects ──
    categorised.active.length === 0
      ? h('div', { className: 'mpd-empty-active' }, 'No active projects \u2014 move one from the queue or start something new.')
      : h('div', { className: 'mpd-cards' },
          categorised.active.map(function(proj) {
            return h('div', { key: proj.id, style: { position: 'relative' } },
              h(ProjectCard, {
                proj: proj,
                onOpen: handleOpenProject,
                onChangeState: openMenu,
                stashOk: stashReadiness[proj.id],
                stashMsg: stashReadiness[proj.id] === true ? 'Ready (all in stash)' : stashReadiness[proj.id] === false ? 'Need threads' : null,
                cardExtras: cardExtras,
                selectionMode: selectionMode,
                selected: selected.has(proj.id),
                onToggleSelect: toggleSelect,
                onLongPress: enterSelectionMode,
                payloadCache: payloadCacheRef.current
              }),
              menuProj === proj.id && h(StateChangeMenu, {
                proj: proj,
                currentState: getProjectState(proj, states),
                onSelect: handleChangeState,
                onClose: function() { setMenuProj(null); },
                onEditDetails: openEditDetails,
                onDeleteSingle: handleSingleDelete
              })
            );
          })
        ),

    // ── Up next (queued) ──
    h('div', { className: 'mpd-section' },
      h('div', { className: 'mpd-section-header' },
        h('span', null, 'Up next'),
        h('span', { className: 'mpd-section-count' }, categorised.queued.length),
        h('button', {
          className: 'mpd-btn mpd-btn--ghost mpd-section-add',
          onClick: onAddNew,
          title: 'Add to queue'
        }, '+ Add')
      ),
      categorised.queued.length === 0
        ? h('div', { className: 'mpd-empty-msg' }, 'Nothing queued yet \u2014 add a project to plan what to stitch next.')
        : categorised.queued.map(function(proj) {
            return h('div', { key: proj.id, style: { position: 'relative' } },
              h(CompactProjectRow, {
                proj: proj, state: 'queued',
                onOpen: handleOpenProject,
                onChangeState: openMenu
              }),
              menuProj === proj.id && h(StateChangeMenu, {
                proj: proj, currentState: 'queued',
                onSelect: handleChangeState,
                onClose: function() { setMenuProj(null); },
                onEditDetails: openEditDetails,
                onDeleteSingle: handleSingleDelete
              })
            );
          })
    ),

    // ── Paused ──
    categorised.paused.length > 0 && h('div', { className: 'mpd-section' },
      h('button', {
        className: 'mpd-section-collapse-hdr',
        onClick: function() { setPausedOpen(function(o) { return !o; }); },
        'aria-expanded': pausedOpen
      },
        h('span', { className: 'mpd-collapse-arrow' }, pausedOpen ? '\u25BC' : '\u25B6'),
        ' Paused (',
        categorised.paused.length,
        ' project',
        categorised.paused.length !== 1 ? 's' : '',
        ')'
      ),
      pausedOpen && categorised.paused.map(function(proj) {
        return h('div', { key: proj.id, style: { position: 'relative' } },
          h(CompactProjectRow, {
            proj: proj, state: 'paused',
            onOpen: handleOpenProject,
            onChangeState: openMenu
          }),
          menuProj === proj.id && h(StateChangeMenu, {
            proj: proj, currentState: 'paused',
            onSelect: handleChangeState,
            onClose: function() { setMenuProj(null); },
            onEditDetails: openEditDetails,
            onDeleteSingle: handleSingleDelete
          })
        );
      })
    ),

    // ── Completed ──
    categorised.complete.length > 0 && h('div', { className: 'mpd-section' },
      h('button', {
        className: 'mpd-section-collapse-hdr',
        onClick: function() { setCompletedOpen(function(o) { return !o; }); },
        'aria-expanded': completedOpen
      },
        h('span', { className: 'mpd-collapse-arrow' }, completedOpen ? '\u25BC' : '\u25B6'),
        ' Completed (',
        categorised.complete.length,
        ' project',
        categorised.complete.length !== 1 ? 's' : '',
        ')'
      ),
      completedOpen && categorised.complete.map(function(proj) {
        return h('div', { key: proj.id, style: { position: 'relative' } },
          h(CompactProjectRow, {
            proj: proj, state: 'complete',
            onOpen: handleOpenProject,
            onChangeState: openMenu
          }),
          menuProj === proj.id && h(StateChangeMenu, {
            proj: proj, currentState: 'complete',
            onSelect: handleChangeState,
            onClose: function() { setMenuProj(null); },
            onEditDetails: openEditDetails,
            onDeleteSingle: handleSingleDelete
          })
        );
      })
    ),

    // ── Designs (creator only, no tracking) ──
    categorised.design.length > 0 && h('div', { className: 'mpd-section' },
      h('button', {
        className: 'mpd-section-collapse-hdr',
        onClick: function() { setDesignOpen(function(o) { return !o; }); },
        'aria-expanded': designOpen
      },
        h('span', { className: 'mpd-collapse-arrow' }, designOpen ? '\u25BC' : '\u25B6'),
        ' My designs (',
        categorised.design.length,
        ')'
      ),
      designOpen && categorised.design.map(function(proj) {
        return h('div', { key: proj.id, style: { position: 'relative' } },
          h(CompactProjectRow, {
            proj: proj, state: 'design',
            onOpen: handleOpenProject,
            onChangeState: openMenu
          }),
          menuProj === proj.id && h(StateChangeMenu, {
            proj: proj, currentState: 'design',
            onSelect: handleChangeState,
            onClose: function() { setMenuProj(null); },
            onEditDetails: openEditDetails,
            onDeleteSingle: handleSingleDelete
          })
        );
      })
    ),

    // ── Stats link ──
    onOpenGlobalStats && h('button', {
      className: 'mpd-stats-link',
      onClick: onOpenGlobalStats,
      style: { display: 'inline-flex', alignItems: 'center', gap: 6 }
    },
      window.Icons && window.Icons.barChart ? window.Icons.barChart() : null,
      h('span', null, 'View detailed stats across all projects \u2192')
    ),

    // ── Edit Project Details modal ──
    editingProj && typeof EditProjectDetailsModal !== 'undefined' && h(EditProjectDetailsModal, {
      projectId: editingProj.id,
      name: editingProj.name || '',
      designer: editingProj.designer || '',
      description: editingProj.description || '',
      onSave: function(updated) {
        // Refresh the local project entry name so the card updates immediately
        // (the cs:projectsChanged event from ProjectStorage.save will trigger
        // a full reload shortly after, but this avoids a visible flash).
        setEditingProj(null);
      },
      onClose: function() { setEditingProj(null); }
    }),

    // fix-3.5 / VER-FB-002 — Delete confirmation modal (replaces window.confirm).
    // Used by both bulk delete (multiple ids) and single-card delete (one id).
    confirmDelete && h(BulkDeleteModal, {
      projectIds: confirmDelete,
      projectsById: (function () {
        var m = {};
        for (var i = 0; i < projects.length; i++) {
          var p = projects[i] || {};
          if (p.id) m[p.id] = p.name || p.id;
        }
        return m;
      })(),
      onConfirm: doBulkDelete,
      onCancel: function () { setConfirmDelete(null); },
    })
  );
}

// Expose components for project-library.js (shared between Home + Manager)
if (typeof window !== 'undefined') {
  window.MultiProjectDashboard = MultiProjectDashboard;
  window.ProjectCard = ProjectCard;
  window.CompactProjectRow = CompactProjectRow;
  window.StateChangeMenu = StateChangeMenu;
  window.HomeProjectHelpers = { daysBetween, inferProjectState, getProjectState, estimateRemainingHours, estimateRemainingText, getSuggestion };
}
