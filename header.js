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
          style: { color:'#16a34a', fontSize:11, display:'inline-flex', alignItems:'center', gap:4 },
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
          React.createElement('button', { className: 'tb-context-btn', onClick: onEdit }, Icons.pencil(), ' Edit Pattern'),
        page === 'creator' && onTrack &&
          React.createElement('button', { className: 'tb-context-btn tb-context-btn--primary', onClick: onTrack }, 'Track ›'),
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

  // App-section nav tabs — include Edit between Create and Track
  const appSections = [
    { id: 'creator', label: 'Create', href: 'index.html' },
    { id: 'editor', label: 'Edit', href: 'index.html' },
    { id: 'tracker', label: 'Track',  href: 'stitch.html' },
    { id: 'manager', label: 'Stash',  href: 'manager.html' },
    { id: 'stats', label: 'Stats', href: 'index.html?mode=stats' },
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
        // Logo
        React.createElement('span', {
          className: 'tb-logo',
          onClick: () => { if (typeof window.__goHome === 'function') { window.__goHome(); } else if (page === 'creator') { window.scrollTo(0, 0); } else { window.location.href = 'index.html'; } }
        }, '×∕× Cross Stitch'),

        // App-section navigation tabs
        React.createElement('nav', { className: 'tb-app-nav', 'aria-label': 'App sections' },
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
            React.createElement('span', { style: { fontSize: 9, opacity: 0.6, marginLeft: 1 } }, '▾')
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
                  style: { display: 'inline-flex', alignItems: 'center', gap: 4 }
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
            style: { background:'transparent', color:'#16a34a', fontWeight:600, fontSize:10, padding:'0 4px', display:'inline-flex', alignItems:'center', gap:3 },
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
            else window.location.href = 'index.html';
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

        React.createElement('button', { className: 'tb-nav-link', onClick: () => { if (window.HelpDrawer) window.HelpDrawer.open({ tab: 'shortcuts' }); else setModal('shortcuts'); }, 'aria-label': 'Keyboard shortcuts', title: 'Keyboard shortcuts' }, window.Icons && window.Icons.keyboard ? window.Icons.keyboard() : 'Shortcuts'),
        React.createElement('button', { className: 'tb-nav-link', onClick: () => { if (window.HelpDrawer) window.HelpDrawer.open({ tab: 'help' }); else setModal('help'); } }, 'Help'),

        // File menu dropdown — shown on all pages
        React.createElement('div', { ref: fileMenuRef, style: { position: 'relative', flexShrink: 0 } },
          React.createElement('button', { className: 'tb-page-btn', onClick: () => setFileMenuOpen(o => !o) },
            'File',
            React.createElement('span', { style: { fontSize: 9, opacity: 0.6, marginLeft: 3 } }, '▾')
          ),
          fileMenuOpen && React.createElement('div', { className: 'tb-page-dropdown', style: { right: 0, left: 'auto', minWidth: 210 } },
            // Storage usage summary
            storageUsage && React.createElement('div', { style: { padding: '8px 14px 6px', fontSize: 11, color: '#475569', borderBottom: '1px solid #f1f5f9' } },
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
              React.createElement('div', { style: { height: 1, background: '#f1f5f9', margin: '4px 0' } }),
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
            typeof SyncEngine !== 'undefined' && React.createElement('div', { style: { height: 1, background: '#f1f5f9', margin: '4px 0' } }),
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
