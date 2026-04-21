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
  var hasStash = stash && stashEntries.length > 0;
  var skeinCount = hasStash ? stashEntries.length : 0;

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
      var threshold = thread.min_stock != null ? thread.min_stock : 1;
      // Only warn if the thread is actually needed by an active project
      if (thread.owned <= threshold && activeIds.has(id)) lowCount++;
    });
    // Projects needing thread — check patterns that have thread requirements unmet by stash
    var projectsNeedThread = 0;
    if (patterns && patterns.length > 0) {
      patterns.forEach(function(pat) {
        if (!pat.threads || pat.status === 'completed' || pat.status === 'wishlist') return;
        var needsThread = pat.threads.some(function(t) {
          var s = stash[normKey(t.id)];
          if (!s) return true;
          return s.owned < (t.qty || 1);
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

    // Stats row (hidden if empty state)
    !isEmptyState && projectCount > 0 && h('div', {
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
    !isEmptyState && projectCount > 0 && onOpenShowcase && h('div', {
      style: { display: 'flex', justifyContent: 'flex-end', marginTop: -8, marginBottom: 4, paddingRight: 2 }
    },
      h('button', {
        onClick: onOpenShowcase,
        title: 'See your stitching journey',
        'aria-label': 'Open Showcase view',
        style: { fontSize: 12, fontWeight: 600, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', fontFamily: 'inherit' }
      }, '✦ See your Showcase →')
    ),

    // Hero card (only if projects exist)
    heroProject && h('div', { className: 'home-hero-card' },
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

    // Start New + Recent
    h('div', { className: 'home-panels' + (isEmptyState ? ' home-panels--full' : '') },
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

      // Recent panel (hidden in empty state — message shown below instead)
      !isEmptyState && h('div', { className: 'home-panel' },
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
