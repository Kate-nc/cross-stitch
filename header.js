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
                title: 'Click to rename'
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

function Header({ page, tab, onPageChange, onOpen, onSave, onTrack, onExportPDF, onNewProject, onOpenProject, onPreferences, onBulkAddThreads, setModal, activeProject, onBackupDownload, onRestoreFile, storageUsage, projectName: propProjectName, projectPct: propProjectPct, onNameChange, showAutosaved }) {
  const [pageDrop, setPageDrop] = React.useState(false);
  const dropRef = React.useRef(null);

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
  const [syncStatus, setSyncStatus] = React.useState(function() {
    try { return typeof SyncEngine !== 'undefined' ? SyncEngine.getSyncStatus() : null; }
    catch (e) { return null; }
  });
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
        if (!window.confirm(msg)) return;
        BackupRestore.restore(backup)
          .then(function () { window.location.reload(); })
          .catch(function (err) { (window.Toast ? window.Toast.show({ message: 'Restore failed: ' + err.message, type: 'error' }) : alert('Restore failed: ' + err.message)); });
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
    { id: 'creator', label: 'Create', href: 'index.html?action=new-from-image' },
    { id: 'editor', label: 'Edit', href: 'index.html?action=open' },
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
          title: page === 'home' ? 'Cross Stitch Studio' : 'Back to home',
          onClick: () => {
            if (page === 'home') { window.scrollTo(0, 0); return; }
            window.location.href = 'home.html';
          },
          onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.currentTarget.click(); } }
        }, '×∕× Cross Stitch'),

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
          showAutosaved && React.createElement('span', {
            className: 'tb-proj-badge-pct tb-proj-badge-saved',
            title: 'Your work auto-saves to this device. Use Download to export a .json file.'
          },
            (window.Icons && window.Icons.check) ? window.Icons.check() : null,
            'All changes saved'
          )
        ),

        React.createElement('div', { className: 'tb-sep' }),

        // Sync status indicator
        typeof SyncEngine !== 'undefined' && React.createElement('button', {
          className: 'tb-nav-link tb-sync-indicator' + (syncStatus && syncStatus.hasWatchDir && syncStatus.autoSync
            ? ' tb-sync-indicator--active'
            : (syncStatus && syncStatus.hasWatchDir ? ' tb-sync-indicator--folder' : '')),
          onClick: () => {
            if (typeof window.__goHome === 'function') window.__goHome();
            else window.location.href = 'home.html';
          },
          'aria-label': 'Sync status',
          title: (function() {
            var parts = [];
            if (syncStatus && syncStatus.hasWatchDir) parts.push('Sync folder connected' + (syncStatus.autoSync ? ' (auto-sync on)' : ''));
            if (syncStatus && syncStatus.lastExportAt) parts.push('Last export: ' + new Date(syncStatus.lastExportAt).toLocaleString());
            if (syncStatus && syncStatus.lastImportAt) parts.push('Last import: ' + new Date(syncStatus.lastImportAt).toLocaleString());
            return parts.length ? parts.join('\n') : 'Sync \u2014 not yet configured';
          })()
        },
          (function() {
            if (syncStatus && syncStatus.hasWatchDir && syncStatus.autoSync) return Icons.cloudCheck();
            if (syncStatus && syncStatus.hasWatchDir) return Icons.cloudSync();
            if (syncStatus && (syncStatus.lastExportAt || syncStatus.lastImportAt)) return Icons.cloudCheck();
            return Icons.cloudOff();
          })()
        ),

        // Command palette trigger — touch users have no Ctrl/Cmd+K affordance.
        // Mirrors the keyboard shortcut by calling window.CommandPalette.open().
        window.CommandPalette ? React.createElement('button', {
          className: 'tb-nav-link',
          onClick: () => { try { window.CommandPalette.open(); } catch (_) {} },
          'aria-label': 'Open command palette (Ctrl/Cmd+K)',
          title: 'Open command palette (Ctrl/Cmd+K)'
        }, window.Icons && window.Icons.magnify ? window.Icons.magnify() : 'Search') : null,
        React.createElement('button', { className: 'tb-nav-link', onClick: () => { if (window.HelpDrawer) window.HelpDrawer.open({ tab: 'shortcuts' }); else setModal('shortcuts'); }, 'aria-label': 'Keyboard shortcuts', title: 'Keyboard shortcuts' }, window.Icons && window.Icons.keyboard ? window.Icons.keyboard() : 'Shortcuts'),
        React.createElement('button', {
          className: 'tb-nav-link tb-help-btn',
          onClick: () => { if (window.HelpDrawer) window.HelpDrawer.open({ tab: 'help' }); else setModal('help'); },
          'aria-label': 'Open help (?)',
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
            typeof SyncEngine !== 'undefined' && React.createElement('label', {
              className: 'tb-page-dropdown-item',
              style: { display: 'block', cursor: 'pointer' }
            },
              Icons.cloudSync(), ' Import Sync (.csync)\u2026',
              React.createElement('input', {
                type: 'file',
                accept: '.csync',
                style: { display: 'none' },
                onChange: function(e) {
                  setFileMenuOpen(false);
                  var file = e.target.files && e.target.files[0];
                  if (!file) return;
                  e.target.value = '';
                  SyncEngine.readSyncFile(file).then(function(syncObj) {
                    return SyncEngine.prepareImport(syncObj);
                  }).then(function(plan) {
                    // If home screen is mounted it listens for this event
                    var evt = new CustomEvent('sync-plan-ready', { detail: plan, cancelable: true });
                    var handled = !window.dispatchEvent(evt);
                    // Fallback for tracker/manager pages: if no listener handled it,
                    // show a simple confirm dialog
                    if (!handled && page !== 'home') {
                      var n = plan.newRemote.length;
                      var m = plan.mergeTracking.length;
                      var c = plan.conflicts.length;
                      var parts = [];
                      if (n) parts.push(n + ' new');
                      if (m) parts.push(m + ' to merge');
                      if (c) parts.push(c + ' conflict' + (c !== 1 ? 's' : ''));
                      if (plan.stashMerge) parts.push('stash update');
                      if (parts.length === 0) { (window.Toast ? window.Toast.show({ message: 'Nothing to sync \u2014 all projects are identical.', type: 'info' }) : alert('Nothing to sync — all projects are identical.')); return; }
                      var msg = 'Import sync file?\n\n' + parts.join(', ');
                      if (c > 0) msg += '\n\nConflicts will keep local versions. For detailed control, import from the home screen.';
                      if (!window.confirm(msg)) return;
                      var resolutions = {};
                      plan.conflicts.forEach(function(entry) { resolutions[entry.id] = 'keep-local'; });
                      SyncEngine.executeImport(plan, resolutions).then(function(result) {
                        (window.Toast ? window.Toast.show({ message: 'Sync complete: ' + result.imported + ' imported, ' + result.merged + ' merged.', type: 'success' }) : alert('Sync complete: ' + result.imported + ' imported, ' + result.merged + ' merged.'));
                        window.location.reload();
                      }).catch(function(err) { (window.Toast ? window.Toast.show({ message: 'Sync failed: ' + err.message, type: 'error' }) : alert('Sync failed: ' + err.message)); });
                    }
                  }).catch(function(err) {
                    (window.Toast ? window.Toast.show({ message: 'Sync import failed: ' + err.message, type: 'error' }) : alert('Sync import failed: ' + err.message));
                  });
                }
              })
            )
          )
        )
      )
    )
  );
}
