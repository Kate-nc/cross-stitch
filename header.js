// Context bar shown below the header when a project is loaded.
// Props:
//   name        – project name string
//   dimensions  – { width, height } or null
//   palette     – palette array (for colour count) or null
//   pct         – 0-100 completion percentage or null
//   page        – 'creator' | 'tracker'
//   onEdit      – callback to navigate to creator (tracker page only)
//   onTrack     – callback to navigate to tracker (creator page only)
//   onSave      – callback to download JSON
//   onNameChange – callback(newName) when user edits the inline name
//   showAutosaved – if true, show a small “Auto-saved” hint next to the name
// ── Sync Review Gate wiring ──────────────────────────────────────────────
// Module-level variable: the most recent plan from the last sync-plan-ready
// event. Used by the "Review sync" manual trigger menu item.
var _lastReceivedPlan = null;
// Counter for generating stable unique IDs for sync popover titles when
// React.useId is unavailable (pre-18 fallback only).
var _syncPopoverIdCounter = 0;

// Listen for sync-plan-ready events dispatched after a .csync file is
// imported via the header's file-picker. Mount the SyncReviewGate for ALL
// pages (replaces the old per-page confirm-dialog fallback).
// stopImmediatePropagation prevents any legacy handler on another page from
// also showing an old SyncSummaryModal.
if (typeof window !== 'undefined') {
  window.addEventListener('sync-plan-ready', function(e) {
    _lastReceivedPlan = e.detail || null;
    // Prevent confirm-dialog fallback in header and home-screen legacy modal
    e.preventDefault();
    e.stopImmediatePropagation();
    if (typeof window.SyncReviewGate !== 'undefined' && window.SyncReviewGate.open) {
      window.SyncReviewGate.open(_lastReceivedPlan, { autoTrigger: false });
    }
  });
  // Sibling event from the watcher (sync-engine _processFolderUpdates).
  // Keeps `_lastReceivedPlan` warm so a manual "Review sync" click on any
  // page surfaces the same plan as /home's banner. Crucially, this does
  // NOT auto-open the gate — that would interrupt the user mid-action.
  // See reports/sync-reference/00_DIAGNOSIS.md fix #1.
  window.addEventListener('cs:syncPlanPending', function(e) {
    var plan = e && e.detail && e.detail.plan;
    _lastReceivedPlan = plan || null;
  });
  // Drop the cached plan once it's been applied or invalidated so a
  // stale plan never resurfaces in "Review sync".
  window.addEventListener('cs:backupRestored', function() {
    _lastReceivedPlan = null;
  });
}

function ContextBar({ name, dimensions, palette, pct, page, onEdit, onTrack, onSave, onHome, onNameChange, showAutosaved }) {
  if (!name) return null;
  const dimStr = dimensions ? `${dimensions.width}×${dimensions.height}` : null;
  const colStr = palette ? `${palette.length} colour${palette.length !== 1 ? 's' : ''}` : null;
  const meta = [dimStr, colStr].filter(Boolean).join(' · ');

  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(name);
  const inputRef = React.useRef(null);

  React.useEffect(() => { setDraft(name); }, [name]);
  React.useEffect(() => { if (editing && inputRef.current) inputRef.current.focus(); }, [editing]);

  function commitName() {
    setEditing(false);
    const trimmed = (draft || '').trim().slice(0, 60);
    if (trimmed && trimmed !== name && onNameChange) onNameChange(trimmed);
    else setDraft(name);
  }

  return React.createElement('div', { className: 'tb-context-bar' },
    React.createElement('div', { className: 'tb-context-bar-inner' },
      React.createElement('div', {
        onClick: !editing ? (onHome || undefined) : undefined,
        style: { display:'flex', alignItems:'center', gap:6, flex:1, cursor: !editing && onHome ? 'pointer' : 'default', minWidth:0 }
      },
        editing
          ? React.createElement('input', {
              ref: inputRef,
              className: 'tb-context-name-input',
              value: draft,
              maxLength: 60,
              onChange: function(e) { setDraft(e.target.value); },
              onBlur: commitName,
              onKeyDown: function(e) {
                if (e.key === 'Enter') { e.target.blur(); }
                else if (e.key === 'Escape') { setDraft(name); setEditing(false); }
              },
              onClick: function(e) { e.stopPropagation(); }
            })
          : onNameChange
            ? React.createElement('button', {
                type: 'button',
                className: 'tb-context-name tb-context-name--editable',
                onClick: function(e) { e.stopPropagation(); setEditing(true); },
                title: 'Click to rename',
                'aria-label': 'Rename project'
              }, name)
            : React.createElement('span', {
                className: 'tb-context-name',
                title: undefined
              }, name),
        meta && React.createElement('span', { className: 'tb-context-meta' }, meta),
        showAutosaved && React.createElement('span', {
          className: 'tb-context-meta',
          style: { color:'var(--success)', fontSize:'var(--text-xs)', display:'inline-flex', alignItems:'center', gap:'var(--s-1)' },
          title: 'Your work auto-saves to this device. Use Download to export a .json file.'
        },
          (window.Icons && window.Icons.check) ? window.Icons.check() : null,
          'All changes saved'
        ),
        pct !== null && React.createElement('span', { className: 'tb-context-pct' },
          React.createElement('span', { className: 'tb-context-pct-bar' },
            React.createElement('span', { className: 'tb-context-pct-fill', style: { width: pct + '%' } })
          ),
          React.createElement('span', { className: 'tb-context-pct-lbl' }, pct + '%')
        )
      ),
      React.createElement('div', { className: 'tb-context-actions' },
        page === 'tracker' && onEdit &&
          React.createElement('button', { className: 'tb-context-btn tb-context-btn--primary tb-context-btn--mode', onClick: onEdit, title: 'Open this pattern in the Pattern Creator' }, Icons.pencil(), ' Edit Pattern'),
        page === 'creator' && onTrack &&
          React.createElement('button', { className: 'tb-context-btn tb-context-btn--primary tb-context-btn--mode', onClick: onTrack, title: 'Switch to Stitch Tracker' }, 'Track ›'),
        onSave &&
          React.createElement('button', {
            className: 'tb-context-btn',
            onClick: onSave,
            title: 'Download a .json copy of this project to your computer (work auto-saves to this device).'
          }, 'Download')
      )
    )
  );
}

// ─── HeaderProjectSwitcher (UX-12 Phase 6 PR #10) ───────────────────────
// Compact button + dropdown showing the active project plus the five
// most recently updated projects, with a fall-through to the existing
// project-picker modal via onOpenAll. Reads from ProjectStorage; no new
// state stores. Mirrors the focus / ARIA pattern from
// creator/ActionBar.js (Escape, click-outside, ArrowUp/Down/Home/End
// roving focus, auto-focus first menuitem on open).
function HeaderProjectSwitcher({ activeProject, projectName, onOpenAll }) {
  var h = React.createElement;
  var Icons = window.Icons || {};
  var openState = React.useState(false);
  var open = openState[0];
  var setOpen = openState[1];
  var listState = React.useState([]);
  var list = listState[0];
  var setList = listState[1];
  var btnRef = React.useRef(null);
  var menuRef = React.useRef(null);
  var wrapRef = React.useRef(null);

  // Load + refresh the recent-project list. Refresh on cs:projectsChanged
  // to stay in step with saves elsewhere in the app (Phase 4 pattern).
  React.useEffect(function () {
    if (typeof window.ProjectStorage === 'undefined' || !window.ProjectStorage.listProjects) return undefined;
    var cancelled = false;
    function load() {
      window.ProjectStorage.listProjects().then(function (l) {
        if (cancelled) return;
        var sorted = (l || []).slice().sort(function (a, b) {
          var at = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
          var bt = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
          return bt - at;
        });
        setList(sorted);
      }).catch(function () { if (!cancelled) setList([]); });
    }
    load();
    window.addEventListener('cs:projectsChanged', load);
    return function () { cancelled = true; window.removeEventListener('cs:projectsChanged', load); };
  }, []);

  // Click-outside / Escape close + roving focus.
  React.useEffect(function () {
    if (!open) return undefined;
    function onDoc(e) {
      if (wrapRef.current && wrapRef.current.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        if (btnRef.current && btnRef.current.focus) btnRef.current.focus();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp' && e.key !== 'Home' && e.key !== 'End') return;
      if (!menuRef.current) return;
      var items = Array.prototype.slice.call(menuRef.current.querySelectorAll('[role="menuitem"]'));
      if (!items.length) return;
      var idx = items.indexOf(document.activeElement);
      var next = idx;
      if (e.key === 'ArrowDown') next = idx < 0 ? 0 : (idx + 1) % items.length;
      else if (e.key === 'ArrowUp') next = idx <= 0 ? items.length - 1 : idx - 1;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = items.length - 1;
      if (items[next] && items[next].focus) { items[next].focus(); e.preventDefault(); }
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    var raf = (typeof requestAnimationFrame === 'function') ? requestAnimationFrame : function (fn) { return setTimeout(fn, 0); };
    var cancel = (typeof cancelAnimationFrame === 'function') ? cancelAnimationFrame : clearTimeout;
    var handle = raf(function () {
      if (!menuRef.current) return;
      var first = menuRef.current.querySelector('[role="menuitem"]');
      if (first && first.focus) first.focus();
    });
    return function () {
      cancel(handle);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  function initials(name) {
    var s = String(name || '').trim();
    if (!s) return '?';
    var parts = s.split(/\s+/);
    if (parts.length === 1) return s.slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  function pctOf(p) {
    if (!p || !p.pattern) return null;
    var total = 0;
    for (var i = 0; i < p.pattern.length; i += 1) {
      var c = p.pattern[i];
      if (c && c.id !== '__skip__' && c.id !== '__empty__') total += 1;
    }
    if (total <= 0) return null;
    var done = 0;
    if (p.done) {
      for (var j = 0; j < p.done.length; j += 1) if (p.done[j] === 1) done += 1;
    }
    return Math.round(done / total * 100);
  }

  var label = projectName || (activeProject && activeProject.name) || 'No project';
  var activeId = (activeProject && activeProject.id) || (typeof window.ProjectStorage !== 'undefined'
    && window.ProjectStorage.getActiveProjectId ? window.ProjectStorage.getActiveProjectId() : null);
  var recents = list.filter(function (p) { return p && p.id !== activeId; }).slice(0, 5);

  function pickProject(id) {
    setOpen(false);
    window.__navigatingAway = true;
    if (typeof window.ProjectStorage !== 'undefined' && window.ProjectStorage.setActiveProject) {
      try { window.ProjectStorage.setActiveProject(id); } catch (_) {}
    }
    // Match command-palette.js: clicking a project means "go track it".
    window.location.href = 'stitch.html';
  }

  return h('div', { className: 'tb-proj-switcher', ref: wrapRef },
    h('button', {
      ref: btnRef,
      type: 'button',
      className: 'tb-proj-switcher__btn',
      'aria-haspopup': 'menu',
      'aria-expanded': open ? 'true' : 'false',
      'aria-label': 'Switch project',
      onClick: function () { setOpen(function (o) { return !o; }); }
    },
      h('span', { className: 'tb-proj-switcher__avatar', 'aria-hidden': 'true' }, initials(label)),
      h('span', { className: 'tb-proj-switcher__name' }, label),
      h('span', { className: 'tb-proj-switcher__chev', 'aria-hidden': 'true' },
        Icons.chevronDown ? Icons.chevronDown() : null)
    ),
    open && h('div', {
      ref: menuRef,
      className: 'tb-proj-switcher__menu',
      role: 'menu',
      'aria-label': 'Recent projects'
    },
      recents.length === 0 && h('div', { className: 'tb-proj-switcher__empty' }, 'No other projects yet'),
      recents.map(function (p) {
        var pct = pctOf(p);
        return h('button', {
          key: p.id,
          type: 'button',
          role: 'menuitem',
          tabIndex: -1,
          className: 'tb-proj-switcher__item',
          onClick: function () { pickProject(p.id); }
        },
          h('span', { className: 'tb-proj-switcher__avatar', 'aria-hidden': 'true' }, initials(p.name)),
          h('span', { className: 'tb-proj-switcher__item-text' },
            h('span', { className: 'tb-proj-switcher__item-name' }, p.name || 'Untitled'),
            pct !== null && h('span', { className: 'tb-proj-switcher__item-pct' }, pct + '%')
          )
        );
      }),
      onOpenAll && h('button', {
        type: 'button',
        role: 'menuitem',
        tabIndex: -1,
        className: 'tb-proj-switcher__item tb-proj-switcher__item--all',
        onClick: function () { setOpen(false); onOpenAll(); }
      }, 'All projects\u2026')
    )
  );
}

// Live save-status badge — replaces the previous static "All changes saved"
// label. Receives saveStatus / savedAt / saveError driven by the Creator's
// auto-save controller (see creator/saveStatus.js). When status is 'saved'
// it shows a relative timestamp ("Saved 5 s ago") that ticks every 15 s so
// the user can trust how fresh the persisted snapshot is.
function SaveStatusBadge({ status, savedAt, error, onRetry }) {
  // Force a re-render every 15 s so the relative "Saved Xs ago" text stays
  // current without flooding React with re-renders. We only run the timer
  // when there is a savedAt to format.
  var _tick = React.useState(0);
  var setTick = _tick[1];
  React.useEffect(function () {
    if (!savedAt) return undefined;
    var id = setInterval(function () { setTick(function (n) { return n + 1; }); }, 15000);
    return function () { clearInterval(id); };
  }, [savedAt]);

  // Default to the legacy "All changes saved" label when no status was
  // supplied — keeps non-Creator pages (Tracker / Manager) rendering the
  // existing copy until they opt in to the new state machine.
  var effective = status || (savedAt ? 'saved' : 'idle');
  var className = 'tb-proj-badge-pct tb-proj-badge-saved';
  var title = 'Your work auto-saves to this device. Use Download to export a .json file.';
  var icon = (window.Icons && window.Icons.check) ? window.Icons.check() : null;
  var label;

  if (effective === 'pending') {
    icon = (window.Icons && window.Icons.pencil) ? window.Icons.pencil() : null;
    label = 'Editing\u2026';
    className += ' tb-proj-badge-saved--pending';
    title = 'Unsaved changes — auto-saving in a moment.';
  } else if (effective === 'saving') {
    icon = (window.Icons && window.Icons.hourglass) ? window.Icons.hourglass() : null;
    label = 'Saving\u2026';
    className += ' tb-proj-badge-saved--saving';
    title = 'Saving to this device\u2026';
  } else if (effective === 'error') {
    icon = (window.Icons && window.Icons.warning) ? window.Icons.warning() : null;
    label = 'Save failed';
    className += ' tb-proj-badge-saved--error';
    title = (error && error.message) ? ('Save failed: ' + error.message) : 'Save failed';
  } else if (effective === 'saved' && savedAt) {
    label = 'Saved ' + formatRelative(savedAt);
  } else {
    label = 'All changes saved';
  }

  var children = [icon, label];
  if (effective === 'error' && typeof onRetry === 'function') {
    children.push(React.createElement('button', {
      key: 'retry',
      type: 'button',
      className: 'tb-proj-badge-retry',
      onClick: function (e) { e.stopPropagation(); onRetry(); },
      style: { marginLeft: 6, background: 'transparent', border: '1px solid currentColor', color: 'inherit', padding: '0 6px', borderRadius: 4, fontSize: 10, cursor: 'pointer' }
    }, 'Retry'));
  }
  return React.createElement('span', { className: className, title: title }, children);
}

// Compact relative-time formatter for the save badge: "just now",
// "5 s ago", "3 min ago", "1 h ago". Returns the absolute clock time
// once the gap exceeds 24 h so we don't show stale numbers.
function formatRelative(date) {
  if (!date) return '';
  var d = (date instanceof Date) ? date : new Date(date);
  var diffMs = Date.now() - d.getTime();
  if (diffMs < 0) diffMs = 0;
  var s = Math.round(diffMs / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return s + ' s ago';
  var m = Math.round(s / 60);
  if (m < 60) return m + ' min ago';
  var h = Math.round(m / 60);
  if (h < 24) return h + ' h ago';
  try { return 'at ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
  catch (_) { return d.toISOString(); }
}

function Header({ page, tab, onPageChange, onOpen, onSave, onTrack, onExportPDF, onNewProject, onOpenProject, onPreferences, onBulkAddThreads, setModal, activeProject, onBackupDownload, onRestoreFile, storageUsage, projectName: propProjectName, projectPct: propProjectPct, onNameChange, showAutosaved, saveStatus, savedAt, saveError, onRetrySave }) {
  const [pageDrop, setPageDrop] = React.useState(false);
  const dropRef = React.useRef(null);
  const [helpOpen, setHelpOpen] = React.useState(function() {
    try { return window.HelpDrawer ? window.HelpDrawer.isOpen() : false; } catch(_) { return false; }
  });
  React.useEffect(function() {
    function onHelpState(e) { if (e && e.detail) setHelpOpen(!!e.detail.open); }
    window.addEventListener('cs:helpStateChange', onHelpState);
    return function() { window.removeEventListener('cs:helpStateChange', onHelpState); };
  }, []);

  // Inline editable project name state (for merged ContextBar)
  const [editingName, setEditingName] = React.useState(false);
  const [nameDraft, setNameDraft] = React.useState(propProjectName || '');
  const nameInputRef = React.useRef(null);
  React.useEffect(() => { setNameDraft(propProjectName || ''); }, [propProjectName]);
  React.useEffect(() => { if (editingName && nameInputRef.current) nameInputRef.current.focus(); }, [editingName]);
  function commitNameEdit() {
    setEditingName(false);
    const trimmed = (nameDraft || '').trim().slice(0, 60);
    if (trimmed && trimmed !== propProjectName && onNameChange) onNameChange(trimmed);
    else setNameDraft(propProjectName || '');
  }
  React.useEffect(() => {
    if (!pageDrop) return;
    function close(e) { if (dropRef.current && !dropRef.current.contains(e.target)) setPageDrop(false); }
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [pageDrop]);

  const [fileMenuOpen, setFileMenuOpen] = React.useState(false);
  const fileMenuRef = React.useRef(null);

  // Theme toggle state — reads current pref; cycles light → dark → system
  const [themeMode, setThemeMode] = React.useState(function() {
    try { return (window.UserPrefs && window.UserPrefs.get('a11yDarkMode')) || 'system'; }
    catch(_) { return 'system'; }
  });
  React.useEffect(() => {
    function onPrefsChanged(e) {
      // Skip events for unrelated keys; always handle legacy events without a detail payload
      if (e && e.detail && e.detail.key !== 'a11yDarkMode') return;
      try {
        const current = (window.UserPrefs && window.UserPrefs.get('a11yDarkMode')) || 'system';
        setThemeMode(current);
      } catch(_) {}
    }
    window.addEventListener('cs:prefsChanged', onPrefsChanged);
    return () => window.removeEventListener('cs:prefsChanged', onPrefsChanged);
  }, []);
  function cycleTheme() {
    const next = themeMode === 'system' ? 'light' : themeMode === 'light' ? 'dark' : 'system';
    setThemeMode(next);
    try {
      if (window.UserPrefs) window.UserPrefs.set('a11yDarkMode', next);
      window.dispatchEvent(new CustomEvent('cs:prefsChanged', { detail: { key: 'a11yDarkMode', value: next } }));
    } catch(_) {}
  }
  function themeIcon() {
    if (themeMode === 'dark') return window.Icons && window.Icons.moon ? window.Icons.moon() : null;
    if (themeMode === 'light') return window.Icons && window.Icons.sun ? window.Icons.sun() : null;
    // system — show sun or moon based on actual resolved theme
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    return isDark ? (window.Icons && window.Icons.moon ? window.Icons.moon() : null)
                  : (window.Icons && window.Icons.sun ? window.Icons.sun() : null);
  }
  function themeLabel() {
    if (themeMode === 'light') return 'Light mode';
    if (themeMode === 'dark') return 'Dark mode';
    return 'System theme';
  }

  const [syncStatus, setSyncStatus] = React.useState(function() {
    try { return typeof SyncEngine !== 'undefined' ? SyncEngine.getSyncStatus() : null; }
    catch (e) { return null; }
  });
  // Sync status popover open/close state
  const [syncPopoverOpen, setSyncPopoverOpen] = React.useState(false);
  const syncPopoverRef = React.useRef(null);
  const syncTriggerRef = React.useRef(null);
  const syncPopoverCloseRef = React.useRef(null);
  // React.useId is available in React 18 (loaded from CDN). Fallback uses a stable
  // counter so multiple Header instances on the same page never share the same id.
  const syncPopoverTitleId = React.useId ? React.useId() : ('sync-popover-title-' + (++_syncPopoverIdCounter));
  // Close the popover when clicking outside it or pressing Escape; restore focus to trigger
  React.useEffect(function() {
    if (!syncPopoverOpen) return;
    // Move focus into the popover (close button) so keyboard users aren't stranded
    if (syncPopoverCloseRef.current) syncPopoverCloseRef.current.focus();
    function onPointerDown(e) {
      if (syncPopoverRef.current && !syncPopoverRef.current.contains(e.target)) {
        setSyncPopoverOpen(false);
      }
    }
    function onKeyDown(e) {
      if (e.key === 'Escape') {
        setSyncPopoverOpen(false);
        if (syncTriggerRef.current) syncTriggerRef.current.focus();
      }
    }
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return function() {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [syncPopoverOpen]);

  // Pending-conflicts badge state. Reflects window.SyncEngine.getPendingPlan()'s
  // conflict count, hidden while SyncReviewGate is currently open. Listens to:
  //   - cs:syncPlanPending  (fired by setPendingPlan / clearPendingPlan)
  //   - cs:syncReviewOpened / cs:syncReviewClosed  (gate lifecycle)
  //   - cs:backupRestored   (any restored state invalidates the plan)
  const [pendingConflicts, setPendingConflicts] = React.useState(0);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  React.useEffect(function () {
    if (typeof window === 'undefined' || typeof SyncEngine === 'undefined') return;
    function readCount() {
      try {
        var p = SyncEngine.getPendingPlan && SyncEngine.getPendingPlan();
        return (p && p.conflicts && p.conflicts.length) || 0;
      } catch (_) { return 0; }
    }
    function refresh() { setPendingConflicts(readCount()); }
    function onPlan(e) {
      var plan = e && e.detail && e.detail.plan;
      if (plan && plan.conflicts) setPendingConflicts(plan.conflicts.length);
      else if (plan === null) setPendingConflicts(0);
      else refresh();
    }
    function onOpened() { setReviewOpen(true); }
    function onClosed() { setReviewOpen(false); refresh(); }
    function onRestored() { setPendingConflicts(0); }
    refresh();
    // Also try to hydrate the persisted plan so a fresh page load shows
    // the badge without waiting for a watcher tick.
    if (SyncEngine.hydratePendingPlan) {
      SyncEngine.hydratePendingPlan().then(refresh).catch(function () {});
    }
    window.addEventListener('cs:syncPlanPending', onPlan);
    window.addEventListener('cs:syncReviewOpened', onOpened);
    window.addEventListener('cs:syncReviewClosed', onClosed);
    window.addEventListener('cs:backupRestored', onRestored);
    return function () {
      window.removeEventListener('cs:syncPlanPending', onPlan);
      window.removeEventListener('cs:syncReviewOpened', onOpened);
      window.removeEventListener('cs:syncReviewClosed', onClosed);
      window.removeEventListener('cs:backupRestored', onRestored);
    };
  }, []);
  const showSyncBadge = pendingConflicts > 0 && !reviewOpen;
  React.useEffect(() => {
    if (!fileMenuOpen) return;
    function close(e) { if (fileMenuRef.current && !fileMenuRef.current.contains(e.target)) setFileMenuOpen(false); }
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [fileMenuOpen]);
  React.useEffect(() => {
    if (typeof SyncEngine === 'undefined' || !SyncEngine.getWatchDirectory) return;
    var cancelled = false;
    SyncEngine.getWatchDirectory().then(function() {
      if (cancelled) return;
      try { setSyncStatus(SyncEngine.getSyncStatus()); } catch (e) {}
    }).catch(function() {});
    // Phase-3 sync-fix #1: start the polling watcher on every page so remote
    // .csync deliveries are picked up regardless of which surface the user
    // is on (Creator, Tracker, Manager, Home). startAutoWatch is a no-op if
    // there is no folder configured or permission isn't already granted.
    if (SyncEngine.startAutoWatch) {
      try { SyncEngine.startAutoWatch(); } catch (e) {}
    }
    return function() { cancelled = true; };
  }, []);

  // Inline backup/restore used by the File dropdown on pages without custom restore handlers
  function handleInlineRestore(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        // PERF (deferred-2): parseBackupText handles both legacy JSON files
        // and the new CSB1\n compressed format.
        var backup = BackupRestore.parseBackupText(reader.result);
        var check = BackupRestore.validate(backup);
        if (!check.valid) { (window.Toast ? window.Toast.show({ message: check.error, type: 'error' }) : alert(check.error)); return; }
        var s = check.summary;
        var when = s.createdAt ? new Date(s.createdAt).toLocaleString() : 'unknown date';
        var msg = 'Restore backup from ' + when + '?\n\n'
          + s.projectCount + ' projects \u00b7 ' + s.threadCount + ' owned threads \u00b7 ' + s.patternCount + ' patterns'
          + '\n\nThis will replace all current data.';
        window.ConfirmDialog.show({
          title: 'Restore from backup?',
          message: msg,
          confirmLabel: 'Restore',
          danger: true
        }).then(function (ok) {
          if (!ok) return;
          BackupRestore.restore(backup)
            .then(function () { window.location.reload(); })
            .catch(function (err) { (window.Toast ? window.Toast.show({ message: 'Restore failed: ' + err.message, type: 'error' }) : alert('Restore failed: ' + err.message)); });
        });
      } catch (err) {
        (window.Toast ? window.Toast.show({ message: 'Invalid file: could not parse JSON.', type: 'error' }) : alert('Invalid file: could not parse JSON.'));
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  }

  // B3: Creator sub-pages collapsed from 5 → 3. Materials/Prepare/Export
  // are now sub-tabs inside the new "Materials & Output" hub. The legacy
  // values 'prepare' / 'legend' / 'export' are mapped to 'materials' by
  // useCreatorState's setTab wrapper.
  const creatorPages = [
    ['pattern', 'Pattern'],
    ['project', 'Project'],
    ['materials', 'Materials & Output'],
  ];
  const activeLabel = (creatorPages.find(p => p[0] === tab) || (tab === 'prepare' || tab === 'legend' || tab === 'export' ? ['materials','Materials & Output'] : null) || ['pattern', 'Pattern'])[1];

  // App-section nav tabs — include Edit between Create and Track.
  // Hrefs use `?action=…` / `?from=home` so the per-tool no-project redirect
  // in index.html / stitch.html / manager.html doesn't bounce users back to
  // /home — Create opens the image picker, Edit opens the project file
  // picker, Track and Stash drop straight into their empty states.
  const appSections = [
    { id: 'creator', label: 'Create', href: 'home.html?tab=create' },
    { id: 'editor', label: 'Edit', href: 'create.html?action=open' },
    { id: 'tracker', label: 'Track',  href: 'stitch.html?from=home' },
    { id: 'manager', label: 'Stash',  href: 'manager.html?from=home' },
    { id: 'stats', label: 'Stats', href: 'index.html?mode=stats&from=home' },
  ];

  // Active project summary for the badge (consumed from prop or read from ProjectStorage if available)
  const [projSummary, setProjSummary] = React.useState(null);
  React.useEffect(() => {
    // Prefer the passed-in activeProject prop; fall back to ProjectStorage if available
    if (activeProject) {
      setProjSummary(activeProject);
      return;
    }
    if (typeof ProjectStorage !== 'undefined') {
      ProjectStorage.getActiveProject().then(p => {
        if (p) setProjSummary(p);
      }).catch(() => {});
    }
  }, [activeProject]);

  const pct = React.useMemo(() => {
    if (!projSummary || !projSummary.settings) return null;

    let total = 0;
    if (projSummary.pattern) {
      for (let i = 0; i < projSummary.pattern.length; i += 1) {
        const c = projSummary.pattern[i];
        if (c && c.id !== '__skip__' && c.id !== '__empty__') total += 1;
      }
    }

    let done = 0;
    if (projSummary.done) {
      for (let i = 0; i < projSummary.done.length; i += 1) {
        if (projSummary.done[i] === 1) done += 1;
      }
    }

    return total > 0 ? Math.round(done / total * 100) : 0;
  }, [projSummary]);
  const projName = projSummary
    ? (projSummary.name || (projSummary.settings
        ? `${projSummary.settings.sW}×${projSummary.settings.sH}`
        : 'Project'))
    : null;

  return React.createElement(React.Fragment, null,
    React.createElement('header', { className: 'tb-topbar' },
      React.createElement('div', { className: 'tb-topbar-inner' },
        // Logo — single source of truth for "go home". On /home itself
        // we just scroll to top; on every tool page we navigate to the
        // canonical landing page (home.html). The legacy in-Creator
        // home-screen mode (window.__goHome) is retired from this entry
        // point so the unified hub is always one click away.
        React.createElement('span', {
          className: 'tb-logo',
          role: 'link',
          tabIndex: 0,
          title: page === 'home' ? 'stitchx' : 'Back to home',
          onClick: () => {
            if (page === 'home') { window.scrollTo(0, 0); return; }
            window.location.href = 'home.html';
          },
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }
        },
          'stitch',
          React.createElement('span', {
            className: 'tb-logo-dot',
            'aria-hidden': 'true',
            style: { color: 'var(--accent)', display: 'inline-flex', alignItems: 'center', lineHeight: 1, marginLeft: 1 }
          }, window.Icons && window.Icons.stitchDot ? window.Icons.stitchDot() : '.')
        ),

        // App-section navigation tabs — suppressed on home page because
        // home.html has its own in-page tab bar (HomeTabBar in home-app.js)
        // covering the same destinations. Shown on all other pages as before.
        page !== 'home' && React.createElement('nav', { className: 'tb-app-nav', 'aria-label': 'App sections' },
          appSections.map(({ id, label, href }) => {
            const switchMap = { tracker: '__switchToTrack', creator: '__switchToCreate', editor: '__switchToEdit', stats: '__switchToStats' };
            const fn = window[switchMap[id]];
            return React.createElement('a', {
              key: id,
              href,
              className: 'tb-app-tab' + (page === id ? ' tb-app-tab--active' : ''),
              onClick: fn ? (e) => { e.preventDefault(); fn(); } : undefined,
              ...(page === id ? { 'aria-current': 'page' } : {}),
            }, label);
          })
        ),

        // Sub-page dropdown (creator and editor modes)
        (page === 'creator' || page === 'editor') && React.createElement('div', { ref: dropRef, style: { position: 'relative', flexShrink: 0, marginLeft: 6 } },
          React.createElement('button', { className: 'tb-page-btn', onClick: () => setPageDrop(o => !o), 'aria-haspopup': 'true', 'aria-expanded': pageDrop },
            activeLabel,
            React.createElement('span', { className: 'tb-page-btn-chev', 'aria-hidden': 'true' },
              window.Icons && window.Icons.chevronDown ? window.Icons.chevronDown() : null)
          ),
          pageDrop && React.createElement('div', { className: 'tb-page-dropdown', role: 'menu' },
            creatorPages.map(([id, label]) =>
              React.createElement('button', {
                key: id,
                role: 'menuitem',
                className: 'tb-page-dropdown-item' + (tab === id ? ' tb-page-dropdown-item--on' : ''),
                onClick: () => { onPageChange(id); setPageDrop(false); }
              }, label)
            )
          )
        ),

        React.createElement('div', { className: 'tb-hgap' }),

        // Project switcher (UX-12 Phase 6 PR #10) — recents dropdown +
        // "All projects…" entry that delegates to the existing project
        // picker. Always present so the active project is identifiable
        // even before the badge has loaded its name.
        React.createElement(HeaderProjectSwitcher, {
          activeProject: projSummary,
          projectName: propProjectName || projName,
          onOpenAll: onOpenProject || undefined
        }),

        // Active project badge — editable when onNameChange is provided
        (propProjectName || projName) && React.createElement('div', { className: 'tb-proj-badge' },
          onNameChange
            ? (editingName
              ? React.createElement('input', {
                  ref: nameInputRef,
                  className: 'tb-proj-badge-input',
                  value: nameDraft,
                  maxLength: 60,
                  onChange: function(e) { setNameDraft(e.target.value); },
                  onBlur: commitNameEdit,
                  onKeyDown: function(e) {
                    if (e.key === 'Enter') { e.target.blur(); }
                    else if (e.key === 'Escape') { setNameDraft(propProjectName || ''); setEditingName(false); }
                  },
                  onClick: function(e) { e.stopPropagation(); }
                })
              : React.createElement('button', {
                  type: 'button',
                  className: 'tb-proj-badge-name tb-proj-badge-name--editable',
                  onClick: function(e) { e.stopPropagation(); setEditingName(true); },
                  title: 'Click to rename',
                  'aria-label': 'Rename project',
                  style: { display: 'inline-flex', alignItems: 'center', gap:'var(--s-1)' }
                },
                propProjectName || projName,
                React.createElement('span', {
                  style: { opacity: 0.45, lineHeight: 1, display: 'inline-flex', alignItems: 'center' },
                  'aria-hidden': 'true'
                }, Icons.pencil())
              ))
            : React.createElement('span', { className: 'tb-proj-badge-name' }, propProjectName || projName),
          (propProjectPct !== undefined && propProjectPct !== null ? propProjectPct : pct) !== null && React.createElement('span', { className: 'tb-proj-badge-pct' }, (propProjectPct !== undefined && propProjectPct !== null ? propProjectPct : pct) + '%'),
          showAutosaved && React.createElement(SaveStatusBadge, {
            status: saveStatus,
            savedAt: savedAt,
            error: saveError,
            onRetry: onRetrySave
          })
        ),

        React.createElement('div', { className: 'tb-sep' }),

        // Sync status indicator + popover
        typeof SyncEngine !== 'undefined' && React.createElement('div', {
          ref: syncPopoverRef,
          className: 'sync-popover-wrap'
        },
          // ── Trigger button ──────────────────────────────────────────────
          React.createElement('button', {
            ref: syncTriggerRef,
            className: 'tb-nav-link tb-sync-indicator' + (syncStatus && syncStatus.hasWatchDir && syncStatus.autoSync
              ? ' tb-sync-indicator--active'
              : (syncStatus && syncStatus.hasWatchDir ? ' tb-sync-indicator--folder' : ''))
              + (showSyncBadge ? ' tb-sync-indicator--has-pending' : ''),
            onClick: () => {
              // Pending conflicts: open the review gate directly (highest priority).
              if (showSyncBadge && window.SyncReviewGate && typeof window.SyncReviewGate.open === 'function') {
                var plan = _lastReceivedPlan;
                if (!plan && SyncEngine.getPendingPlan) {
                  try { plan = SyncEngine.getPendingPlan() || null; } catch (_) {}
                }
                window.SyncReviewGate.open(plan, { autoTrigger: false });
                setSyncPopoverOpen(false);
                return;
              }
              setSyncPopoverOpen(function(o) { return !o; });
            },
            'aria-label': showSyncBadge
              ? ('Sync \u2014 ' + pendingConflicts + ' conflict' + (pendingConflicts === 1 ? '' : 's') + ' pending')
              : 'Sync status',
            'aria-expanded': syncPopoverOpen ? 'true' : 'false',
            title: (function() {
              if (showSyncBadge) {
                return pendingConflicts + ' conflict' + (pendingConflicts === 1 ? '' : 's') + ' pending review';
              }
              var parts = [];
              if (syncStatus && syncStatus.hasWatchDir) parts.push('Sync folder connected' + (syncStatus.autoSync ? ' (auto-sync on)' : ''));
              if (syncStatus && syncStatus.lastExportAt) parts.push('Last export: ' + new Date(syncStatus.lastExportAt).toLocaleString());
              if (syncStatus && syncStatus.lastImportAt) parts.push('Last import: ' + new Date(syncStatus.lastImportAt).toLocaleString());
              return parts.length ? parts.join('\n') : 'Sync status';
            })()
          },
            (function() {
              if (syncStatus && syncStatus.hasWatchDir && syncStatus.autoSync) return Icons.cloudCheck();
              if (syncStatus && syncStatus.hasWatchDir) return Icons.cloudSync();
              if (syncStatus && (syncStatus.lastExportAt || syncStatus.lastImportAt)) return Icons.cloudCheck();
              return Icons.cloudOff();
            })(),
            showSyncBadge ? React.createElement('span', {
              className: 'tb-sync-indicator-badge',
              'aria-hidden': 'true'
            }) : null
          ),

          // ── Status popover ──────────────────────────────────────────────
          syncPopoverOpen && React.createElement('div', {
            className: 'sync-popover',
            role: 'dialog',
            'aria-modal': 'true',
            'aria-labelledby': syncPopoverTitleId
          },
            // Header row
            React.createElement('div', { className: 'sync-popover-header' },
              (function() {
                if (!syncStatus || !syncStatus.hasWatchDir) return Icons.cloudOff();
                if (syncStatus.autoSync) return React.createElement('span', { style: { color: 'var(--success)' } }, Icons.cloudCheck());
                return React.createElement('span', { style: { color: 'var(--accent)' } }, Icons.cloudSync());
              })(),
              React.createElement('span', { id: syncPopoverTitleId, className: 'sync-popover-title' }, 'Sync'),
              React.createElement('button', {
                ref: syncPopoverCloseRef,
                className: 'sync-popover-close',
                onClick: () => { setSyncPopoverOpen(false); if (syncTriggerRef.current) syncTriggerRef.current.focus(); },
                'aria-label': 'Close sync status'
              }, Icons.x())
            ),

            // Status rows
            (function() {
              var rows = [];
              if (!syncStatus || !syncStatus.hasWatchDir) {
                rows.push(React.createElement('div', { key: 'no-folder', className: 'sync-popover-row' },
                  Icons.cloudOff(),
                  React.createElement('span', null, 'No sync folder connected. Set one up on the Home page to sync across devices.')
                ));
              } else {
                var folderName = (syncStatus.watchDirName) || 'Sync folder';
                rows.push(React.createElement('div', { key: 'folder', className: 'sync-popover-row sync-popover-row--ok' },
                  Icons.folder(),
                  React.createElement('span', null, folderName)
                ));
                if (syncStatus.autoSync) {
                  rows.push(React.createElement('div', { key: 'auto', className: 'sync-popover-row sync-popover-row--ok' },
                    Icons.check(),
                    React.createElement('span', null, 'Auto-sync on — updates every few seconds')
                  ));
                } else {
                  rows.push(React.createElement('div', { key: 'no-auto', className: 'sync-popover-row sync-popover-row--warn' },
                    Icons.warning(),
                    React.createElement('span', null, 'Auto-sync is off — enable it in Preferences to sync automatically')
                  ));
                }
                if (syncStatus.lastExportAt) {
                  rows.push(React.createElement('div', { key: 'export', className: 'sync-popover-row' },
                    Icons.cloudSync(),
                    React.createElement('span', null, 'Last sent: ' + new Date(syncStatus.lastExportAt).toLocaleString())
                  ));
                }
                if (syncStatus.lastImportAt) {
                  rows.push(React.createElement('div', { key: 'import', className: 'sync-popover-row' },
                    Icons.cloudSync(),
                    React.createElement('span', null, 'Last received: ' + new Date(syncStatus.lastImportAt).toLocaleString())
                  ));
                }
                if (!syncStatus.lastExportAt && !syncStatus.lastImportAt) {
                  rows.push(React.createElement('div', { key: 'never', className: 'sync-popover-row' },
                    Icons.info ? Icons.info() : Icons.cloudSync(),
                    React.createElement('span', null, 'No sync activity yet this session')
                  ));
                }
              }
              return rows;
            })(),

            React.createElement('div', { className: 'sync-popover-divider' }),

            // Quick actions
            React.createElement('div', { className: 'sync-popover-actions' },
              syncStatus && syncStatus.hasWatchDir && React.createElement('button', {
                className: 'sync-popover-btn sync-popover-btn--primary',
                onClick: () => {
                  setSyncPopoverOpen(false);
                  if (typeof SyncEngine !== 'undefined' && SyncEngine.exportToFolder) {
                    SyncEngine.exportToFolder().catch(function(e) {
                      if (window.Toast) window.Toast.show({ message: 'Sync export failed: ' + e.message, type: 'error' });
                    });
                  }
                }
              }, Icons.cloudSync(), 'Export now'),
              React.createElement('button', {
                className: 'sync-popover-btn',
                onClick: () => {
                  setSyncPopoverOpen(false);
                  if (window.UnifiedSyncImportModal && typeof window.UnifiedSyncImportModal.show === 'function') {
                    window.UnifiedSyncImportModal.show().then(function(res) {
                      if (!res || !res.plan) return;
                      if (typeof window.SyncReviewGate !== 'undefined') {
                        window.SyncReviewGate.open(res.plan, { autoTrigger: false });
                      }
                    }).catch(function(err) {
                      if (window.Toast) window.Toast.show({ message: 'Sync import failed: ' + (err && err.message || err), type: 'error' });
                    });
                  }
                }
              }, Icons.folder(), 'Import file'),
              typeof window !== 'undefined' && window.SyncReviewGate && React.createElement('button', {
                className: 'sync-popover-btn',
                onClick: () => {
                  setSyncPopoverOpen(false);
                  var plan = _lastReceivedPlan;
                  if (!plan && SyncEngine.getPendingPlan) {
                    try { plan = SyncEngine.getPendingPlan() || null; } catch (_) {}
                  }
                  window.SyncReviewGate.open(plan, { autoTrigger: false });
                }
              }, Icons.cloudSync(), 'Review sync')
            ),

            // Help link
            React.createElement('button', {
              className: 'sync-popover-help-link',
              onClick: () => {
                setSyncPopoverOpen(false);
                if (window.HelpDrawer) window.HelpDrawer.open({ tab: 'help', query: 'sync' });
              }
            }, 'What do these icons mean?')
          )
        ),

        // Command palette trigger — touch users have no Ctrl/Cmd+K affordance.
        // Mirrors the keyboard shortcut by calling window.CommandPalette.open().
        window.CommandPalette ? React.createElement('button', {
          className: 'tb-nav-link',
          onClick: () => { try { window.CommandPalette.open(); } catch (_) {} },
          'aria-label': 'Open command palette (Ctrl/Cmd+K)',
          title: 'Open command palette (Ctrl/Cmd+K)'
        }, window.Icons && window.Icons.magnify ? window.Icons.magnify() : 'Search') : null,
        React.createElement('button', { className: 'tb-nav-link', onClick: () => window.HelpDrawer.open({ tab: 'shortcuts' }), 'aria-label': 'Keyboard shortcuts', title: 'Keyboard shortcuts' }, window.Icons && window.Icons.keyboard ? window.Icons.keyboard() : 'Shortcuts'),
        React.createElement('button', {
          className: 'tb-nav-link tb-help-btn',
          onClick: () => window.HelpDrawer.open({ tab: 'help' }),
          'aria-label': 'Open help (?)',
          'aria-expanded': helpOpen ? 'true' : 'false',
          title: 'Open help (?)'
        },
          window.Icons && window.Icons.help ? window.Icons.help() : null,
          React.createElement('span', { className: 'tb-help-btn-label' }, ' Help')
        ),

        // File menu dropdown — shown on all pages
        React.createElement('div', { ref: fileMenuRef, style: { position: 'relative', flexShrink: 0 } },
          React.createElement('button', { className: 'tb-page-btn', onClick: () => setFileMenuOpen(o => !o) },
            'File',
            React.createElement('span', { className: 'tb-page-btn-chev', 'aria-hidden': 'true' },
              window.Icons && window.Icons.chevronDown ? window.Icons.chevronDown() : null)
          ),
          fileMenuOpen && React.createElement('div', { className: 'tb-page-dropdown', style: { right: 0, left: 'auto', minWidth: 210 } },
            // Storage usage summary
            storageUsage && React.createElement('div', { style: { padding: '8px 14px 6px', fontSize:'var(--text-xs)', color: 'var(--text-secondary)', borderBottom: '1px solid var(--surface-tertiary)' } },
              storageUsage.persistent ? React.createElement(React.Fragment, null, Icons.lock(), ' Protected') : React.createElement(React.Fragment, null, Icons.hourglass(), ' Temporary'),
              ' · ',
              (storageUsage.used / 1024 / 1024).toFixed(1) + ' MB'
              + (storageUsage.quota ? ' / ~' + (storageUsage.quota / 1024 / 1024).toFixed(0) + ' MB' : '')
            ),
            // Theme toggle
            React.createElement('button', {
              className: 'tb-page-dropdown-item',
              onClick: () => { cycleTheme(); },
              title: 'Cycle theme: light, dark, or follow system setting',
              style: { display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'space-between' }
            },
              React.createElement('span', { style: { display: 'inline-flex', alignItems: 'center', gap: 6 } },
                themeIcon(), themeLabel()
              ),
              React.createElement('span', { style: { fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontWeight: 400 } },
                themeMode === 'system' ? 'Auto' : themeMode === 'light' ? 'Light' : 'Dark'
              )
            ),
            // Project operations
            onNewProject && React.createElement('button', {
              className: 'tb-page-dropdown-item',
              onClick: () => { onNewProject(); setFileMenuOpen(false); }
            }, 'New Project'),
            onOpenProject && React.createElement('button', {
              className: 'tb-page-dropdown-item',
              onClick: () => { onOpenProject(); setFileMenuOpen(false); }
            }, 'Switch Project\u2026'),
            onPreferences && React.createElement('button', {
              className: 'tb-page-dropdown-item',
              onClick: () => { onPreferences(); setFileMenuOpen(false); }
            }, 'Preferences\u2026'),
            onOpen && React.createElement('button', {
              className: 'tb-page-dropdown-item',
              onClick: () => { onOpen(); setFileMenuOpen(false); }
            }, 'Open…'),
            onSave && React.createElement('button', {
              className: 'tb-page-dropdown-item',
              onClick: () => { onSave(); setFileMenuOpen(false); },
              title: 'Download a .json copy. Your project also auto-saves to this device.'
            }, 'Download (.json)'),
            (page === 'creator' || page === 'editor') && onTrack && React.createElement('button', {
              className: 'tb-page-dropdown-item',
              onClick: () => { onTrack(); setFileMenuOpen(false); }
            }, 'Open in Stitch Tracker'),
            onExportPDF && React.createElement('button', {
              className: 'tb-page-dropdown-item',
              onClick: () => { onExportPDF(); setFileMenuOpen(false); }
            }, 'Export PDF…'),
            // Phase 4: Bulk Add Threads moved to the Home dashboard's STASH panel
            // and the Stash Manager — no longer surfaced in the File menu.
            // Separator before backup/restore
            !!(onNewProject || onOpen || onSave || ((page === 'creator' || page === 'editor') && onTrack) || onExportPDF) &&
              React.createElement('div', { style: { height: 1, background: 'var(--surface-tertiary)', margin: '4px 0' } }),
            // Backup — use prop handler if provided (e.g. manager shows status feedback), else inline
            React.createElement('button', {
              className: 'tb-page-dropdown-item',
              onClick: () => {
                setFileMenuOpen(false);
                if (onBackupDownload) { onBackupDownload(); }
                else { BackupRestore.downloadBackup().catch(function(e) { (window.Toast ? window.Toast.show({ message: 'Backup failed: ' + e.message, type: 'error' }) : alert('Backup failed: ' + e.message)); }); }
              }
            }, Icons.save(), ' Export Backup'),
            // Restore — use prop handler if provided, else inline
            React.createElement('label', {
              className: 'tb-page-dropdown-item',
              style: { display: 'block', cursor: 'pointer' }
            },
              Icons.folder(), ' Restore from Backup…',
              React.createElement('input', {
                type: 'file',
                accept: '.json',
                style: { display: 'none' },
                onChange: function(e) {
                  setFileMenuOpen(false);
                  if (onRestoreFile) { onRestoreFile(e); } else { handleInlineRestore(e); }
                }
              })
            ),
            // Sync separator and options
            typeof SyncEngine !== 'undefined' && React.createElement('div', { style: { height: 1, background: 'var(--surface-tertiary)', margin: '4px 0' } }),
            typeof SyncEngine !== 'undefined' && React.createElement('button', {
              className: 'tb-page-dropdown-item',
              onClick: () => {
                setFileMenuOpen(false);
                SyncEngine.downloadSync().catch(function(e) { (window.Toast ? window.Toast.show({ message: 'Sync export failed: ' + e.message, type: 'error' }) : alert('Sync export failed: ' + e.message)); });
              }
            }, Icons.cloudSync(), ' Export Sync (.csync)'),
            typeof SyncEngine !== 'undefined' && React.createElement('button', {
              className: 'tb-page-dropdown-item',
              onClick: function() {
                setFileMenuOpen(false);
                if (window.UnifiedSyncImportModal && typeof window.UnifiedSyncImportModal.show === 'function') {
                  window.UnifiedSyncImportModal.show().then(function (res) {
                    if (!res || !res.plan) return;
                    // The modal already populated SyncEngine.setPendingPlan,
                    // so other surfaces (badge, sibling tabs) are already in
                    // sync. Open the review gate to walk the user through
                    // the merge / conflict resolution.
                    if (typeof window.SyncReviewGate !== 'undefined') {
                      window.SyncReviewGate.open(res.plan, { autoTrigger: false });
                    }
                  }).catch(function (err) {
                    if (window.Toast) window.Toast.show({ message: 'Sync import failed: ' + (err && err.message || err), type: 'error' });
                  });
                }
              }
            }, Icons.cloudSync(), ' Import Sync (.csync)\u2026'),
            // Review sync — manual trigger to re-open gate for last received plan
            typeof SyncEngine !== 'undefined' && React.createElement('button', {
              className: 'tb-page-dropdown-item',
              onClick: function() {
                setFileMenuOpen(false);
                if (typeof window.SyncReviewGate !== 'undefined') {
                  // Prefer in-tab cache; fall back to the engine's pending
                  // plan (populated by the folder watcher across tabs and
                  // after reloads). Without this fallback, "Review sync"
                  // shows an empty modal even when the watcher has already
                  // queued a plan. See reports/sync-reference fix #1.
                  var plan = _lastReceivedPlan;
                  if (!plan && window.SyncEngine && typeof window.SyncEngine.getPendingPlan === 'function') {
                    try { plan = window.SyncEngine.getPendingPlan() || null; } catch (_) {}
                  }
                  window.SyncReviewGate.open(plan, { autoTrigger: false });
                }
              }
            }, Icons.cloudSync(), ' Review sync')
          )
        )
      )
    )
  );
}
