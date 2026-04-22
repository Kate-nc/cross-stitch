// home-screen.js
// Dashboard hub — unified entry point for the cross-stitch app.
// Renders when showHome === true or no current project is active.

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

// Estimate remaining hours for a project.
function estimateRemainingHours(proj) {
  var remaining = (proj.totalStitches || 0) - (proj.completedStitches || 0);
  if (remaining <= 0) return 0;
  var speed = proj.stitchesPerHour > 0 ? proj.stitchesPerHour : 100;
  return remaining / speed;
}

function fmtHours(h) {
  if (h < 1) return '<1 hr';
  if (h < 100) return Math.round(h) + ' hrs';
  var days = Math.round(h / 6); // assume ~6hr/day
  if (days < 30) return '\u2248' + days + ' days';
  return '\u2248' + Math.round(days / 7) + ' weeks';
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

    return { proj: proj, score: score, days: days, pct: Math.round(pct * 100) };
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
function ProjectCard({ proj, onOpen, onChangeState, stashOk, stashMsg }) {
  var h = React.createElement;
  var cs = proj.completedStitches || 0;
  var ts = proj.totalStitches || 0;
  var pct = ts > 0 ? Math.round(cs / ts * 100) : 0;
  var days = daysBetween(proj.lastSessionDate || proj.updatedAt);
  var isNeglected = days != null && days > 13;
  var remHours = estimateRemainingHours(proj);
  var weekSt = proj.stitchesThisWeek || 0;
  var weekSess = 0; // not stored in meta, skip for now
  var dim = proj.dimensions ? (proj.dimensions.width + '\u00D7' + proj.dimensions.height) : '';
  var fabricCt = proj.fabricCt ? proj.fabricCt + '-count' : '';
  var stashColor = stashOk === true ? '#16a34a' : stashOk === false ? '#b45309' : '#a1a1aa';
  var stashIcon = stashOk === true ? '\u2713' : stashOk === false ? '!' : '\u25CB';

  return h('div', { className: 'mpd-card' },
    // Thumbnail
    h('div', { className: 'mpd-card-thumb', onClick: function() { onOpen(proj, 'tracker'); } },
      proj.thumbnail
        ? h('img', { src: proj.thumbnail, alt: '', className: 'mpd-card-thumb-img' })
        : h('div', { className: 'mpd-card-thumb-placeholder' })
    ),
    // Body
    h('div', { className: 'mpd-card-body' },
      // Top row: name + progress
      h('div', { className: 'mpd-card-top' },
        h('div', { className: 'mpd-card-name', onClick: function() { onOpen(proj, 'tracker'); } },
          proj.name || 'Untitled'
        ),
        h('div', { className: 'mpd-card-pct' + (pct >= 100 ? ' mpd-card-pct--done' : '') },
          pct + '%'
        )
      ),
      // Progress bar
      h('div', { className: 'mpd-card-progress-track', role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 },
        h('div', { className: 'mpd-card-progress-fill', style: { width: Math.min(100, pct) + '%' } })
      ),
      // Metadata row
      dim || fabricCt ? h('div', { className: 'mpd-card-meta' },
        dim && h('span', null, dim),
        dim && fabricCt && h('span', { className: 'mpd-card-sep' }, '\u00B7'),
        fabricCt && h('span', null, fabricCt)
      ) : null,
      // Recency
      h('div', { className: 'mpd-card-recency' + (isNeglected ? ' mpd-card-recency--warn' : '') },
        days === 0 ? 'Last stitched today' :
        days === 1 ? 'Last stitched yesterday' :
        days != null ? 'Last stitched ' + days + ' days ago' + (isNeglected ? ' \u26A0\uFE0F' : '') : 'Not started'
      ),
      // Session summary
      weekSt > 0 && h('div', { className: 'mpd-card-session' },
        'This week: ' + weekSt.toLocaleString() + ' stitches'
      ),
      // Time estimate
      remHours > 0 && h('div', { className: 'mpd-card-estimate' },
        'Est. remaining: ' + fmtHours(remHours)
      ),
      // Footer row: stash + continue
      h('div', { className: 'mpd-card-footer' },
        h('div', { className: 'mpd-card-stash', style: { color: stashColor }, title: stashMsg || '' },
          stashIcon + ' ' + (stashMsg || (stashOk === true ? 'Ready' : stashOk === false ? 'Need threads' : 'Stash not checked'))
        ),
        h('div', { className: 'mpd-card-actions' },
          h('button', {
            className: 'mpd-btn mpd-btn--primary',
            onClick: function() { onOpen(proj, 'tracker'); }
          }, 'Continue'),
          h('button', {
            className: 'mpd-btn mpd-btn--ghost mpd-card-menu-btn',
            title: 'Change project state',
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
  var pct = ts > 0 ? Math.round(cs / ts * 100) : 0;
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
    if (proj.totalMinutes > 0) detail += ' \u00B7 ' + Math.round(proj.totalMinutes / 60) + ' hrs';
  } else {
    detail = dim;
  }

  return h('div', { className: 'mpd-compact-row' },
    h('div', { className: 'mpd-compact-thumb', onClick: function() { onOpen(proj, state === 'design' ? 'creator' : 'tracker'); } },
      proj.thumbnail
        ? h('img', { src: proj.thumbnail, alt: '', className: 'mpd-compact-thumb-img' })
        : h('div', { className: 'mpd-compact-thumb-placeholder' })
    ),
    h('div', { className: 'mpd-compact-info', onClick: function() { onOpen(proj, state === 'design' ? 'creator' : 'tracker'); } },
      h('span', { className: 'mpd-compact-name' }, proj.name || 'Untitled'),
      detail && h('span', { className: 'mpd-compact-detail' }, detail)
    ),
    h('button', {
      className: 'mpd-btn mpd-btn--ghost mpd-compact-menu-btn',
      title: 'Change project state',
      onClick: function(e) { e.stopPropagation(); onChangeState(proj); }
    }, '\u2026')
  );
}

// ─────────────────────────────────────────────────────────────────
// StateChangeMenu — inline popover for moving a project to a new state
// ─────────────────────────────────────────────────────────────────
function StateChangeMenu({ proj, currentState, onSelect, onClose }) {
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
    h('div', { className: 'mpd-state-menu-title' }, 'Move to\u2026'),
    options.map(function(o) {
      return h('button', {
        key: o.value,
        className: 'mpd-state-menu-item',
        onClick: function() { onSelect(proj, o.value); onClose(); }
      }, o.label);
    })
  );
}

// ─────────────────────────────────────────────────────────────────
// MultiProjectDashboard — shown on home screen when >1 project exists
// ─────────────────────────────────────────────────────────────────
function MultiProjectDashboard({ projects, stash, onOpenProject, onOpenGlobalStats, onAddNew }) {
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

  // collapsed sections
  var _pausedOpen = useState(false);
  var pausedOpen = _pausedOpen[0], setPausedOpen = _pausedOpen[1];
  var _completedOpen = useState(false);
  var completedOpen = _completedOpen[0], setCompletedOpen = _completedOpen[1];
  var _designOpen = useState(false);
  var designOpen = _designOpen[0], setDesignOpen = _designOpen[1];

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
      var streakData = JSON.parse(localStorage.getItem('cs_globalStreak') || 'null');
      if (streakData && streakData.current) streak = streakData.current;
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

  function openMenu(proj) {
    setMenuProj(proj.id);
  }

  function handleOpenProject(proj, mode) {
    if (onOpenProject) onOpenProject(proj, mode || 'tracker');
  }

  var stashForMap = stash ? {} : null;

  return h('div', { className: 'mpd' },
    // ── Summary bar ──
    h('div', { className: 'mpd-summary-bar' },
      h('span', null, summary.activeCount + ' active project' + (summary.activeCount !== 1 ? 's' : '')),
      summary.monthStitches > 0 && h('span', null, '\u00B7 ' + summary.monthStitches.toLocaleString() + ' stitches this month'),
      summary.streak > 1 && h('span', { className: 'mpd-streak' }, '\uD83D\uDD25 ' + summary.streak + '-day streak')
    ),

    // ── Suggestion card ──
    suggestion && h('div', { className: 'mpd-suggestion' },
      h('div', { className: 'mpd-suggestion-title' }, '\uD83D\uDCA1 Suggestion: pick up \u201C' + suggestion.proj.name + '\u201D'),
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
                stashMsg: stashReadiness[proj.id] === true ? 'Ready (all in stash)' : stashReadiness[proj.id] === false ? 'Need threads' : null
              }),
              menuProj === proj.id && h(StateChangeMenu, {
                proj: proj,
                currentState: getProjectState(proj, states),
                onSelect: handleChangeState,
                onClose: function() { setMenuProj(null); }
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
                onClose: function() { setMenuProj(null); }
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
            onClose: function() { setMenuProj(null); }
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
            onClose: function() { setMenuProj(null); }
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
            onClose: function() { setMenuProj(null); }
          })
        );
      })
    ),

    // ── Stats link ──
    onOpenGlobalStats && h('button', {
      className: 'mpd-stats-link',
      onClick: onOpenGlobalStats
    }, '\uD83D\uDCCA View detailed stats across all projects \u2192')
  );
}

function HomeScreen({ onOpenCreatorWithImage, onOpenCreatorBlank, onOpenFile, onImportPattern, onOpenProject, onNavigateToStash, onOpenGlobalStats, onOpenShowcase }) {
  var h = React.createElement;
  var useState = React.useState;
  var useEffect = React.useEffect;
  var useMemo = React.useMemo;

  var _projects = useState([]);
  var projects = _projects[0], setProjects = _projects[1];
  var _stash = useState(null);
  var stash = _stash[0], setStash = _stash[1];
  var _patterns = useState([]);
  var patterns = _patterns[0], setPatterns = _patterns[1];
  var _loading = useState(true);
  var loading = _loading[0], setLoading = _loading[1];

  // Sync state
  var _syncStatus = useState(null);
  var syncStatus = _syncStatus[0], setSyncStatus = _syncStatus[1];
  var _syncBusy = useState(false);
  var syncBusy = _syncBusy[0], setSyncBusy = _syncBusy[1];
  var _syncResult = useState(null);
  var syncResult = _syncResult[0], setSyncResult = _syncResult[1];
  var _syncPlan = useState(null);
  var syncPlan = _syncPlan[0], setSyncPlan = _syncPlan[1];
  var _editingDeviceName = useState(false);
  var editingDeviceName = _editingDeviceName[0], setEditingDeviceName = _editingDeviceName[1];
  var _deviceNameDraft = useState('');
  var deviceNameDraft = _deviceNameDraft[0], setDeviceNameDraft = _deviceNameDraft[1];
  var cancelDeviceNameBlurSaveRef = React.useRef(false);
  var syncFileRef = React.useRef(null);

  // Folder watch state
  var _watchDirName = useState(null);
  var watchDirName = _watchDirName[0], setWatchDirName = _watchDirName[1];
  var _folderUpdates = useState(null);
  var folderUpdates = _folderUpdates[0], setFolderUpdates = _folderUpdates[1];
  var _autoSync = useState(false);
  var autoSync = _autoSync[0], setAutoSync = _autoSync[1];

  // Hidden file inputs
  var imageInputRef = React.useRef(null);
  var openFileInputRef = React.useRef(null);
  var importInputRef = React.useRef(null);

  useEffect(function() {
    var cancelled = false;
    Promise.all([
      typeof ProjectStorage !== 'undefined' ? ProjectStorage.listProjects() : Promise.resolve([]),
      typeof StashBridge !== 'undefined' ? StashBridge.getGlobalStash().catch(function() { return null; }) : Promise.resolve(null),
      typeof StashBridge !== 'undefined' ? (function() {
        // Try to get patterns from stash manager DB
        return new Promise(function(resolve) {
          try {
            var req = indexedDB.open("stitch_manager_db", 1);
            req.onsuccess = function(e) {
              var db = e.target.result;
              if (!db.objectStoreNames.contains("manager_state")) { resolve([]); return; }
              var tx = db.transaction("manager_state", "readonly");
              var store = tx.objectStore("manager_state");
              var r = store.get("patterns");
              r.onsuccess = function() { resolve(r.result || []); };
              r.onerror = function() { resolve([]); };
            };
            req.onerror = function() { resolve([]); };
          } catch(e) { resolve([]); }
        });
      })() : Promise.resolve([])
    ]).then(function(results) {
      if (cancelled) return;
      setProjects(results[0] || []);
      setStash(results[1]);
      setPatterns(results[2] || []);
      setLoading(false);
    });
    return function() { cancelled = true; };
  }, []);

  // Load sync status + folder watch state
  useEffect(function() {
    if (typeof SyncEngine !== 'undefined') {
      var st = SyncEngine.getSyncStatus();
      setSyncStatus(st);
      setDeviceNameDraft(st.deviceName || '');
      setAutoSync(st.autoSync || false);
      // Restore folder watch handle and check for updates
      SyncEngine.getWatchDirectory().then(function(handle) {
        if (handle) {
          setWatchDirName(handle.name || 'Sync folder');
          // Update the status since hasWatchDir may have changed
          setSyncStatus(SyncEngine.getSyncStatus());
          // Auto-check for updates on page load
          SyncEngine.checkForUpdates(handle).then(function(updates) {
            if (updates && updates.length > 0) setFolderUpdates(updates);
          }).catch(function() {});
        }
      }).catch(function() {});
    }
  }, []);

  // Listen for sync-plan-ready events dispatched by the header File menu
  useEffect(function() {
    function handler(e) {
      if (e.detail) {
        e.preventDefault();
        setSyncPlan(e.detail);
      }
    }
    window.addEventListener('sync-plan-ready', handler);
    return function() { window.removeEventListener('sync-plan-ready', handler); };
  }, []);

  // Sync handlers
  function handleExportSync() {
    if (typeof SyncEngine === 'undefined') return;
    setSyncBusy(true);
    setSyncResult(null);
    SyncEngine.downloadSync().then(function() {
      setSyncResult({ type: 'success', message: 'Sync file exported successfully.' });
      setSyncStatus(SyncEngine.getSyncStatus());
    }).catch(function(err) {
      setSyncResult({ type: 'error', message: 'Export failed: ' + err.message });
    }).finally(function() { setSyncBusy(false); });
  }

  function handleSyncFileSelect(e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    if (syncFileRef.current) syncFileRef.current.value = '';
    setSyncBusy(true);
    setSyncResult(null);
    SyncEngine.readSyncFile(file).then(function(syncObj) {
      return SyncEngine.prepareImport(syncObj);
    }).then(function(plan) {
      setSyncBusy(false);
      setSyncPlan(plan);
    }).catch(function(err) {
      setSyncBusy(false);
      setSyncResult({ type: 'error', message: 'Import failed: ' + err.message });
    });
  }

  function handleApplySync(conflictResolutions) {
    if (!syncPlan) return;
    setSyncBusy(true);
    setSyncPlan(null);
    SyncEngine.executeImport(syncPlan, conflictResolutions).then(function(result) {
      var parts = [];
      if (result.imported > 0) parts.push(result.imported + ' imported');
      if (result.merged > 0) parts.push(result.merged + ' merged');
      if (result.conflictsResolved > 0) parts.push(result.conflictsResolved + ' resolved');
      if (result.stashUpdated) parts.push('stash updated');
      setSyncResult({ type: 'success', message: 'Sync complete: ' + (parts.join(', ') || 'no changes') + '.' });
      setSyncStatus(SyncEngine.getSyncStatus());
      // Refresh project list
      if (typeof ProjectStorage !== 'undefined') {
        ProjectStorage.listProjects().then(function(p) { setProjects(p || []); });
      }
    }).catch(function(err) {
      setSyncResult({ type: 'error', message: 'Sync failed: ' + err.message });
    }).finally(function() { setSyncBusy(false); });
  }

  function handleSaveDeviceName() {
    setEditingDeviceName(false);
    var trimmed = (deviceNameDraft || '').trim().slice(0, 60);
    if (typeof SyncEngine !== 'undefined') {
      SyncEngine.setDeviceName(trimmed);
      setSyncStatus(SyncEngine.getSyncStatus());
    }
  }

  // Folder watch handlers
  function handleChooseSyncFolder() {
    if (typeof window.showDirectoryPicker !== 'function') return;
    window.showDirectoryPicker({ mode: 'readwrite' }).then(function(dirHandle) {
      return SyncEngine.setWatchDirectory(dirHandle).then(function() {
        setWatchDirName(dirHandle.name || 'Sync folder');
        setSyncStatus(SyncEngine.getSyncStatus());
        setSyncResult({ type: 'success', message: 'Sync folder set: ' + (dirHandle.name || 'folder') });
        // Check for updates immediately
        return SyncEngine.checkForUpdates(dirHandle).then(function(updates) {
          if (updates && updates.length > 0) setFolderUpdates(updates);
          else setFolderUpdates(null);
        });
      });
    }).catch(function(err) {
      if (err.name !== 'AbortError') {
        setSyncResult({ type: 'error', message: 'Could not set sync folder: ' + err.message });
      }
    });
  }

  function handleDisconnectFolder() {
    if (typeof SyncEngine === 'undefined') return;
    SyncEngine.clearWatchDirectory().then(function() {
      setWatchDirName(null);
      setFolderUpdates(null);
      setAutoSync(false);
      setSyncStatus(SyncEngine.getSyncStatus());
      setSyncResult({ type: 'success', message: 'Sync folder disconnected.' });
    });
  }

  function handleExportToFolder() {
    if (typeof SyncEngine === 'undefined') return;
    setSyncBusy(true);
    setSyncResult(null);
    SyncEngine.exportToFolder().then(function(result) {
      setSyncResult({ type: 'success', message: 'Exported to folder: ' + result.fileName });
      setSyncStatus(SyncEngine.getSyncStatus());
    }).catch(function(err) {
      setSyncResult({ type: 'error', message: 'Folder export failed: ' + err.message });
    }).finally(function() { setSyncBusy(false); });
  }

  function handleCheckForUpdates() {
    if (typeof SyncEngine === 'undefined') return;
    setSyncBusy(true);
    setSyncResult(null);
    SyncEngine.checkForUpdates().then(function(updates) {
      if (updates && updates.length > 0) {
        setFolderUpdates(updates);
        setSyncResult({ type: 'success', message: updates.length + ' update' + (updates.length !== 1 ? 's' : '') + ' found from other devices.' });
      } else {
        setFolderUpdates(null);
        setSyncResult({ type: 'success', message: 'No updates \u2014 everything is up to date.' });
      }
    }).catch(function(err) {
      setSyncResult({ type: 'error', message: 'Check failed: ' + err.message });
    }).finally(function() { setSyncBusy(false); });
  }

  function handleImportFromFolder(update) {
    setSyncBusy(true);
    setSyncResult(null);
    SyncEngine.prepareImport(update.syncObj).then(function(plan) {
      setSyncBusy(false);
      setSyncPlan(plan);
    }).catch(function(err) {
      setSyncBusy(false);
      setSyncResult({ type: 'error', message: 'Import failed: ' + err.message });
    });
  }

  function handleToggleAutoSync() {
    if (typeof SyncEngine === 'undefined') return;
    var newVal = !autoSync;
    setAutoSync(newVal);
    SyncEngine.setAutoSyncEnabled(newVal);
    setSyncStatus(SyncEngine.getSyncStatus());
  }

  // Computed data
  var projectCount = projects.length;
  var stashEntries = stash ? Object.keys(stash) : [];
  // Only count threads the user actually owns (owned > 0); the stash is pre-populated
  // with all DMC/Anchor threads at owned:0, so counting all entries is misleading.
  var skeinCount = stashEntries.filter(function(k) { return stash[k].owned > 0; }).length;
  var hasStash = skeinCount > 0;

  // Average progress across all projects
  var avgProgress = useMemo(function() {
    if (!projects.length) return 0;
    var totalSt = 0, completedSt = 0;
    projects.forEach(function(p) {
      totalSt += (p.totalStitches || 0);
      completedSt += (p.completedStitches || 0);
    });
    return totalSt > 0 ? Math.round(completedSt / totalSt * 100) : 0;
  }, [projects]);

  // Total stitch time (estimated from completed stitches at ~200/hr)
  var totalStitchHours = useMemo(function() {
    if (!projects.length) return 0;
    var totalDone = 0;
    projects.forEach(function(p) { totalDone += (p.completedStitches || 0); });
    return totalDone > 0 ? Math.round(totalDone / 200) : 0;
  }, [projects]);

  // Most recent project (hero card)
  var heroProject = projects.length > 0 ? projects[0] : null;

  // Rest of projects for recent list (exclude hero)
  var recentProjects = projects.length > 1 ? projects.slice(1, 6) : [];

  // Stash alerts
  var stashAlerts = useMemo(function() {
    if (!hasStash) return null;
    // Normalise a bare DMC id like '310' to the composite stash key 'dmc:310'.
    // Pattern threads are stored with bare ids; stash keys are always composite.
    function normKey(id) { return id && id.indexOf(':') < 0 ? 'dmc:' + id : id; }
    // Build set of thread IDs required by any non-completed pattern
    var activeIds = new Set();
    if (patterns && patterns.length > 0) {
      patterns.forEach(function(pat) {
        if (pat.status === 'completed') return;
        if (pat.threads) pat.threads.forEach(function(t) { activeIds.add(normKey(t.id)); });
      });
    }
    var lowCount = 0;
    stashEntries.forEach(function(id) {
      var thread = stash[id];
      // Match Manager's low-stock logic: use min_stock when explicitly set above 0,
      // otherwise fall back to 1 (warn when only 1 skein remains).
      var threshold = (thread.min_stock != null && thread.min_stock > 0) ? thread.min_stock : 1;
      // Only warn if the thread is actually needed by an active project
      if (thread.owned > 0 && thread.owned <= threshold && activeIds.has(id)) lowCount++;
    });
    // Projects needing thread — check patterns that have thread requirements unmet by stash
    var projectsNeedThread = 0;
    if (patterns && patterns.length > 0) {
      patterns.forEach(function(pat) {
        if (!pat.threads || pat.status === 'completed' || pat.status === 'wishlist') return;
        var patFabricCt = Number(pat.fabricCt);
        if (!(patFabricCt > 0)) patFabricCt = 14;
        var needsThread = pat.threads.some(function(t) {
          var s = stash[normKey(t.id)];
          if (!s) return true;
          // Pattern threads from auto-sync store qty as raw stitches; convert to skeins.
          var neededSkeins = (t.unit === 'stitches' && typeof skeinEst === 'function')
            ? skeinEst(t.qty, patFabricCt)
            : (t.qty || 1);
          return s.owned < neededSkeins;
        });
        if (needsThread) projectsNeedThread++;
      });
    }
    if (lowCount === 0 && projectsNeedThread === 0) return null;
    return { lowCount: lowCount, projectsNeedThread: projectsNeedThread };
  }, [stash, hasStash, stashEntries, patterns]);

  // Stats cards
  var showSkeins = hasStash;
  var showStitchTime = totalStitchHours > 0;
  var statsCards = [];
  statsCards.push({ value: projectCount, label: 'projects', key: 'projects' });
  if (showSkeins) statsCards.push({ value: skeinCount, label: 'skeins', key: 'skeins' });
  statsCards.push({ value: avgProgress + '%', label: 'active progress', key: 'progress', accent: true });
  if (showStitchTime) statsCards.push({ value: totalStitchHours + 'h', label: 'stitched', key: 'stitched' });

  var hasNoProjects = projectCount === 0;
  var isEmptyState = hasNoProjects && !hasStash;

  var _isDragging = useState(false);
  var isDragging = _isDragging[0], setIsDragging = _isDragging[1];

  // File input handlers
  function handleImageSelect(e) {
    var f = e.target.files[0];
    if (f && onOpenCreatorWithImage) onOpenCreatorWithImage(f);
    if (imageInputRef.current) imageInputRef.current.value = '';
  }
  function handleOpenFileSelect(e) {
    var f = e.target.files[0];
    if (f && onOpenFile) onOpenFile(f);
    if (openFileInputRef.current) openFileInputRef.current.value = '';
  }
  function handleImportSelect(e) {
    var f = e.target.files[0];
    if (f && onImportPattern) onImportPattern(f);
    if (importInputRef.current) importInputRef.current.value = '';
  }

  // Hero card progress
  var heroPct = 0;
  if (heroProject) {
    heroPct = heroProject.totalStitches > 0
      ? Math.round(heroProject.completedStitches / heroProject.totalStitches * 100)
      : 0;
  }
  var heroIsPrimaryTracker = heroProject && (heroProject.source === 'tracker' || heroProject.source === 'unknown');

  if (loading) return null;

  // When multiple projects exist, show the rich multi-project dashboard instead of the simple hero layout.
  var showDashboard = projectCount > 1;

  // --- Render ---
  return h('div', { className: 'home-screen' },
    // Hidden file inputs
    h('input', { ref: imageInputRef, type: 'file', accept: 'image/jpeg,image/png', onChange: handleImageSelect, style: { display: 'none' }, 'aria-hidden': 'true' }),
    h('input', { ref: openFileInputRef, type: 'file', accept: '.json,.oxs,.pdf,.png', onChange: handleOpenFileSelect, style: { display: 'none' }, 'aria-hidden': 'true' }),
    h('input', { ref: importInputRef, type: 'file', accept: '.oxs,.pdf', onChange: handleImportSelect, style: { display: 'none' }, 'aria-hidden': 'true' }),

    // Greeting
    h('h1', { className: 'home-greeting' },
      getGreeting() + ', stitcher ',
      h('span', { 'aria-hidden': 'true' }, Icons.star())
    ),

    // ── Multi-project dashboard (>1 project) ──
    showDashboard && h(MultiProjectDashboard, {
      projects: projects,
      stash: stash,
      onOpenProject: onOpenProject,
      onOpenGlobalStats: onOpenGlobalStats,
      onAddNew: function() { imageInputRef.current && imageInputRef.current.click(); }
    }),

    // ── Single / empty layout (0 or 1 project) ──
    !showDashboard && !isEmptyState && projectCount > 0 && h('div', {
      className: 'home-stats-row' + (statsCards.length <= 2 ? ' home-stats-row--narrow' : ''),
      role: 'group',
      'aria-label': 'Project statistics',
      onClick: onOpenGlobalStats || undefined,
      style: onOpenGlobalStats ? { cursor: 'pointer' } : undefined,
      title: onOpenGlobalStats ? 'View detailed stats' : undefined
    },
      statsCards.map(function(card) {
        return h('div', {
          key: card.key,
          className: 'home-stat-card',
          'aria-label': card.value + ' ' + card.label
        },
          h('div', { className: 'home-stat-value' + (card.accent ? ' home-stat-value--accent' : '') }, card.value),
          h('div', { className: 'home-stat-label' }, card.label)
        );
      })
    ),

    // Showcase entry tile (shown alongside stats row when projects exist)
    !showDashboard && !isEmptyState && projectCount > 0 && onOpenShowcase && h('div', {
      style: { display: 'flex', justifyContent: 'flex-end', marginTop: -8, marginBottom: 4, paddingRight: 2 }
    },
      h('button', {
        onClick: onOpenShowcase,
        title: 'See your stitching journey',
        'aria-label': 'Open Showcase view',
        style: { fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit' }
      }, '✦ See your Showcase →')
    ),

    // Hero card (only if projects exist, and not using multi-project dashboard)
    !showDashboard && heroProject && h('div', { className: 'home-hero-card' },
      h('div', { className: 'home-hero-inner' },
        // Thumbnail
        h('div', { className: 'home-hero-thumb' },
          heroProject.thumbnail
            ? h('img', { src: heroProject.thumbnail, alt: '', className: 'home-hero-thumb-img' })
            : h('div', { className: 'home-hero-thumb-placeholder' })
        ),
        // Content
        h('div', { className: 'home-hero-content' },
          h('div', { className: 'home-hero-label' }, 'Continue stitching'),
          h('div', { className: 'home-hero-name' }, heroProject.name || 'Untitled'),
          h('div', { className: 'home-hero-progress-row' },
            h('div', { className: 'home-hero-progress-track', role: 'progressbar', 'aria-valuenow': heroPct, 'aria-valuemin': '0', 'aria-valuemax': '100' },
              h('div', { className: 'home-hero-progress-fill', style: { width: Math.min(100, Math.max(0, heroPct)) + '%' } })
            ),
            h('span', { className: 'home-hero-progress-text' },
              heroPct + '% · ' + timeAgo(heroProject.updatedAt)
            )
          ),
          h('div', { className: 'home-hero-actions' },
            heroIsPrimaryTracker
              ? [
                  h('button', { key: 'track', className: 'home-btn home-btn--primary', onClick: function() { onOpenProject(heroProject, 'tracker'); } }, 'Track'),
                  h('button', { key: 'edit', className: 'home-btn home-btn--secondary', onClick: function() { onOpenProject(heroProject, 'creator'); } }, 'Edit')
                ]
              : [
                  h('button', { key: 'edit', className: 'home-btn home-btn--primary', onClick: function() { onOpenProject(heroProject, 'creator'); } }, 'Edit'),
                  h('button', { key: 'track', className: 'home-btn home-btn--secondary', onClick: function() { onOpenProject(heroProject, 'tracker'); } }, 'Track')
                ]
          )
        )
      )
    ),

    // Start New + Recent (shown below dashboard as an actions strip, or as main layout when 0-1 projects)
    h('div', { className: 'home-panels' + (isEmptyState ? ' home-panels--full' : '') + (showDashboard ? ' home-panels--dashboard-footer' : '') },
      // Start New panel
      h('div', {
          className: 'home-panel',
          style: { border: isDragging ? "2px dashed #0d9488" : undefined, background: isDragging ? "#f0fdfa" : undefined, transition: "all 0.2s" },
          onDragOver: function(e) { e.preventDefault(); setIsDragging(true); },
          onDragEnter: function(e) { e.preventDefault(); setIsDragging(true); },
          onDragLeave: function(e) { e.preventDefault(); setIsDragging(false); },
          onDrop: function(e) {
            e.preventDefault();
            setIsDragging(false);
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
              if (onOpenCreatorWithImage) onOpenCreatorWithImage(e.dataTransfer.files[0]);
              e.dataTransfer.clearData();
            }
          }
        },
        h('div', { className: 'home-panel-header' }, 'START NEW (OR DROP IMAGE HERE)'),
        h('div', { className: 'home-panel-list' },
          h('button', {
            className: 'home-action-row',
            onClick: function() { imageInputRef.current.click(); }
          },
            h('span', { className: 'home-action-icon', 'aria-hidden': 'true' },
              h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
                h('rect', { x: 3, y: 3, width: 18, height: 18, rx: 2, ry: 2 }),
                h('circle', { cx: 8.5, cy: 8.5, r: 1.5 }),
                h('polyline', { points: '21 15 16 10 5 21' })
              )
            ),
            h('span', null, 'From image')
          ),
          h('button', { className: 'home-action-row', onClick: function() { if (onOpenCreatorBlank) onOpenCreatorBlank(); } },
            h('span', { className: 'home-action-icon', 'aria-hidden': 'true' },
              h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
                h('path', { d: 'M12 20h9' }),
                h('path', { d: 'M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z' })
              )
            ),
            h('span', null, 'From scratch')
          ),
          h('button', { className: 'home-action-row', onClick: function() { openFileInputRef.current.click(); } },
            h('span', { className: 'home-action-icon', 'aria-hidden': 'true' },
              h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
                h('path', { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' })
              )
            ),
            h('span', null, 'Open file')
          ),
          h('button', { className: 'home-action-row', onClick: function() { importInputRef.current.click(); } },
            h('span', { className: 'home-action-icon', 'aria-hidden': 'true' },
              h('svg', { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round' },
                h('path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }),
                h('polyline', { points: '7 10 12 15 17 10' }),
                h('line', { x1: 12, y1: 15, x2: 12, y2: 3 })
              )
            ),
            h('span', null, 'Import .oxs / .pdf')
          )
        )
      ),

      // Recent panel (hidden in empty state or when the multi-project dashboard is showing)
      !isEmptyState && !showDashboard && h('div', { className: 'home-panel' },
        h('div', { className: 'home-panel-header' }, 'RECENT'),
        h('div', { className: 'home-panel-list' },
          recentProjects.length === 0
            ? h('div', { className: 'home-empty-msg' },
                projects.length === 1 ? 'No other projects yet' : 'No projects yet \u2014 start one above!'
              )
            : recentProjects.map(function(proj) {
                var pct = proj.totalStitches > 0
                  ? Math.round(proj.completedStitches / proj.totalStitches * 100)
                  : 0;
                var isDone = pct >= 100;
                var mode = proj.source === 'creator' ? 'creator' : 'tracker';
                return h('button', {
                  key: proj.id,
                  className: 'home-recent-row',
                  onClick: function() { onOpenProject(proj, mode); }
                },
                  h('div', { className: 'home-recent-swatch' },
                    proj.thumbnail
                      ? h('img', { src: proj.thumbnail, alt: '', className: 'home-recent-swatch-img' })
                      : h('div', { className: 'home-recent-swatch-placeholder' })
                  ),
                  h('span', { className: 'home-recent-name' }, proj.name || 'Untitled'),
                  h('span', { className: 'home-recent-progress' + (isDone ? ' home-recent-progress--done' : '') },
                    isDone ? 'Done' : pct + '%'
                  )
                );
              }),
          projects.length > 6 && h('button', {
            className: 'home-view-all',
            onClick: onNavigateToStash
          }, 'View all \u2192')
        )
      )
    ),

    // Empty state message for first-time users
    isEmptyState && h('div', { className: 'home-empty-state' },
      'No projects yet \u2014 start your first one above!'
    ),

    // Stash alert bar
    stashAlerts && h('div', { className: 'home-stash-alert' },
      h('span', { className: 'home-stash-alert-text' },
        '\u26A0 ',
        stashAlerts.lowCount > 0 && (stashAlerts.lowCount + ' thread' + (stashAlerts.lowCount !== 1 ? 's' : '') + ' running low'),
        stashAlerts.lowCount > 0 && stashAlerts.projectsNeedThread > 0 && '  \u00B7  ',
        stashAlerts.projectsNeedThread > 0 && (stashAlerts.projectsNeedThread + ' project' + (stashAlerts.projectsNeedThread !== 1 ? 's' : '') + ' need thread')
      ),
      h('button', { className: 'home-stash-alert-link', onClick: onNavigateToStash }, 'Open stash manager \u2192')
    ),

    // Sync section
    typeof SyncEngine !== 'undefined' && h('div', { className: 'home-panel sync-panel' },
      h('div', { className: 'home-panel-header' }, Icons.cloudSync(), ' SYNC'),
      h('div', { className: 'sync-panel-body' },
        // Device name row
        h('div', { className: 'sync-device-row' },
          h('span', { className: 'sync-device-label' }, 'Device name:'),
          editingDeviceName
            ? h('input', {
                className: 'sync-device-input',
                value: deviceNameDraft,
                maxLength: 60,
                placeholder: 'e.g. Katie\u2019s laptop',
                onChange: function(e) { setDeviceNameDraft(e.target.value); },
                onBlur: function() {
                  if (cancelDeviceNameBlurSaveRef.current) {
                    cancelDeviceNameBlurSaveRef.current = false;
                    return;
                  }
                  handleSaveDeviceName();
                },
                onKeyDown: function(e) {
                  if (e.key === 'Enter') e.target.blur();
                  if (e.key === 'Escape') {
                    cancelDeviceNameBlurSaveRef.current = true;
                    setDeviceNameDraft(syncStatus ? syncStatus.deviceName || '' : '');
                    setEditingDeviceName(false);
                  }
                },
                autoFocus: true
              })
            : h('button', {
                className: 'sync-device-name-btn',
                onClick: function() { setEditingDeviceName(true); },
                title: 'Click to edit device name'
              }, syncStatus && syncStatus.deviceName ? syncStatus.deviceName : 'Set device name\u2026')
        ),

        // Folder watch section with help
        syncStatus && syncStatus.hasFolderWatch && h('div', { className: 'sync-folder-section' },
          h('div', { className: 'sync-folder-row' },
            h('span', { className: 'sync-device-label' }, 'Sync folder:'),
            h('button', {
              className: 'sync-help-icon',
              title: 'Choose a folder in your cloud drive (OneDrive, Google Drive, Dropbox, etc). The app will automatically export .csync files here after each save, and notify you when updates are available from other devices.',
              'aria-label': 'Help: Setting up folder sync'
            }, 'ⓘ')
          ),
          h('div', { className: 'sync-folder-row' },
            watchDirName
              ? h('span', { className: 'sync-folder-name' },
                  Icons.cloudCheck(), ' ', watchDirName,
                  h('button', {
                    className: 'sync-folder-disconnect',
                    onClick: handleDisconnectFolder,
                    title: 'Disconnect sync folder',
                    'aria-label': 'Disconnect sync folder'
                  }, '\u00D7')
                )
              : h('button', {
                  className: 'home-btn home-btn--secondary sync-folder-btn',
                  onClick: handleChooseSyncFolder,
                  disabled: syncBusy
                }, 'Choose folder\u2026')
          ),
          // Auto-sync toggle (only shown when folder is set)
          watchDirName && h('div', { className: 'sync-autosync-row' },
            h('label', { className: 'sync-autosync-label' },
              h('input', {
                type: 'checkbox',
                checked: autoSync,
                onChange: handleToggleAutoSync
              }),
              ' Auto-sync on save'
            ),
            h('span', { className: 'sync-autosync-hint' }, 'Automatically exports to this folder when you save a project')
          )
        ),

        // Folder updates banner
        folderUpdates && folderUpdates.length > 0 && h('div', { className: 'sync-folder-updates' },
          h('div', { className: 'sync-folder-updates-title' },
            Icons.cloudAlert(), ' ',
            folderUpdates.length + ' update' + (folderUpdates.length !== 1 ? 's' : '') + ' available'
          ),
          folderUpdates.map(function(update, idx) {
            return h('div', { key: idx, className: 'sync-folder-update-row' },
              h('span', { className: 'sync-folder-update-info' },
                (update.deviceName || 'Unknown device') + ' \u00B7 ' +
                update.projectCount + ' project' + (update.projectCount !== 1 ? 's' : '') +
                (update.createdAt ? ' \u00B7 ' + timeAgo(update.createdAt) : '')
              ),
              h('button', {
                className: 'home-btn home-btn--primary sync-folder-update-btn',
                onClick: function() { handleImportFromFolder(update); },
                disabled: syncBusy
              }, 'Review & import')
            );
          })
        ),

        // Last sync times
        syncStatus && (syncStatus.lastExportAt || syncStatus.lastImportAt) && h('div', { className: 'sync-timestamps' },
          syncStatus.lastExportAt && h('div', { className: 'sync-timestamp' },
            Icons.cloudSync(), ' Last export: ' + timeAgo(syncStatus.lastExportAt)
          ),
          syncStatus.lastImportAt && h('div', { className: 'sync-timestamp' },
            Icons.cloudCheck(), ' Last import: ' + timeAgo(syncStatus.lastImportAt)
          )
        ),

        // Result message
        syncResult && h('div', { className: 'sync-result sync-result--' + syncResult.type }, syncResult.message),

        // Action buttons
        h('div', { className: 'sync-actions' },
          watchDirName && h('button', {
            className: 'home-btn home-btn--primary sync-action-btn',
            onClick: handleExportToFolder,
            disabled: syncBusy
          }, syncBusy ? 'Working\u2026' : 'Export to folder'),
          watchDirName && h('button', {
            className: 'home-btn home-btn--secondary sync-action-btn',
            onClick: handleCheckForUpdates,
            disabled: syncBusy
          }, 'Check for updates'),
          h('button', {
            className: 'home-btn' + (watchDirName ? ' home-btn--secondary' : ' home-btn--primary') + ' sync-action-btn',
            onClick: handleExportSync,
            disabled: syncBusy
          }, syncBusy && !watchDirName ? 'Working\u2026' : 'Download .csync'),
          h('label', {
            className: 'home-btn home-btn--secondary sync-action-btn',
            style: { cursor: syncBusy ? 'not-allowed' : 'pointer' }
          },
            'Import .csync',
            h('input', {
              ref: syncFileRef,
              type: 'file',
              accept: '.csync',
              style: { display: 'none' },
              onChange: handleSyncFileSelect,
              disabled: syncBusy
            })
          )
        ),

        h('p', { className: 'sync-hint' },
          watchDirName
            ? 'Your sync folder is connected. Files are synced via your cloud drive automatically.'
            : SyncEngine.hasFolderWatchSupport()
              ? 'Choose a sync folder for automatic syncing, or manually export/import .csync files.'
              : 'Export a .csync file and place it in a shared folder (OneDrive, Google Drive, Dropbox) to sync between devices.'
        )
      )
    ),

    // Sync summary modal
    syncPlan && h(SyncSummaryModal, {
      plan: syncPlan,
      onApply: handleApplySync,
      onCancel: function() { setSyncPlan(null); }
    })
  );
}
