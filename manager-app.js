const { useState, useEffect, useMemo, useCallback } = React;

// Hoisted out of PartialGauge so the lookup table isn't reallocated each render.
const PARTIAL_GAUGE_SEGMENTS = {
  "null": { count: 0, color: "var(--border)", text: "No partial", textColor: "var(--text-tertiary)" },
  "mostly-full": { count: 3, color: "#378ADD", text: "Mostly full", textColor: "#378ADD" },
  "about-half": { count: 2, color: "#378ADD", text: "About half", textColor: "#378ADD" },
  "remnant": { count: 1, color: "#EF9F27", text: "Remnant", textColor: "#EF9F27" },
  "used-up": { count: 4, color: "#888780", text: "Used up", textColor: "#888780" }
};

function PartialGauge({ status }) {
  const current = PARTIAL_GAUGE_SEGMENTS[status || "null"];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex", gap: 2, width: 52 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            background: i < current.count ? current.color : "var(--border)"
          }} />
        ))}
      </div>
      <div style={{ fontSize: 10, color: current.textColor, fontWeight: status ? 600 : 400, whiteSpace: "nowrap" }}>
        {current.text}
      </div>
    </div>
  );
}

function ManagerApp() {
  const [tab, setTab] = useState("inventory"); // 'inventory' or 'patterns'
  const [modal, setModal] = useState(null); // 'help', 'about', 'add_pattern'
  const [threads, setThreads] = useState({}); // { [id]: { owned: number, tobuy: boolean } }
  const [patterns, setPatterns] = useState([]); // Array of pattern objects
  const [activeProject, setActiveProject] = useState(null); // From Stitch Tracker IndexedDB
  const [storedProjects, setStoredProjects] = useState([]); // Cross-stitch projects from ProjectStorage
  const [storageUsage, setStorageUsage] = useState(null); // { used, quota, persistent } bytes
  const [searchQuery, setSearchQuery] = useState("");
  const [threadFilter, setThreadFilter] = useState("all"); // 'all', 'owned', 'tobuy', 'lowstock'
  const [brandFilter, setBrandFilter] = useState("all"); // 'all', 'dmc', 'anchor'
  const _UP = (k, fb) => { try { return (window.UserPrefs && window.UserPrefs.get(k)) || fb; } catch (_) { return fb; } };
  const [patternFilter, setPatternFilter] = useState(() => _UP("patternsDefaultFilter", "all")); // 'all', 'wishlist', 'owned', 'inprogress', 'completed'
  const [patternSort, setPatternSort] = useState(() => _UP("patternsDefaultSort", "date_desc")); // 'date_desc', 'date_asc', 'title_asc', 'designer_asc', 'status'
  const [editingPattern, setEditingPattern] = useState(null); // Pattern object currently being added/edited
  const [viewingPattern, setViewingPattern] = useState(null); // Pattern object currently being viewed for details
  const [selectedPatternsForList, setSelectedPatternsForList] = useState(new Set());
  const [shoppingListModalOpen, setShoppingListModalOpen] = useState(false);
  const [expandedThread, setExpandedThread] = useState(null);
  const [selectedThread, setSelectedThread] = useState(null);
  const [conflicts, setConflicts] = useState(null);
  const [readyToStart, setReadyToStart] = useState(null);
  const [lowStockAlerts, setLowStockAlerts] = useState(null);
  const [userProfile, setUserProfile] = useState(() => {
    const get = (k, fb) => { try { var v = window.UserPrefs && window.UserPrefs.get(k); return (v == null) ? fb : v; } catch (_) { return fb; } };
    return {
      fabric_count: get("creatorDefaultFabricCount", 14),
      strands_used: get("stitchStrandsUsed", 2),
      thread_brand: get("stashDefaultBrand", "DMC"),
      waste_factor: get("stitchWasteFactor", 0.20)
    };
  });
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null); // { type: 'success'|'error'|'confirm', message, summary?, onConfirm? }
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [panelOpen, setPanelOpen] = useState(false);
  // First-visit welcome wizard. Use lazy initialiser so it only runs once.
  const [welcomeOpen, setWelcomeOpen] = useState(() => {
    try { return !!(window.WelcomeWizard && window.WelcomeWizard.shouldShow('manager')); } catch (_) { return false; }
  });
  // Global "?" shortcut → open Help Centre.
  useEffect(() => {
    const h = () => setModal("help");
    window.addEventListener("cs:openHelp", h);
    return () => window.removeEventListener("cs:openHelp", h);
  }, []);
  // Command Palette → Keyboard Shortcuts modal.
  useEffect(() => {
    const h = () => setModal("shortcuts");
    window.addEventListener("cs:openShortcuts", h);
    return () => window.removeEventListener("cs:openShortcuts", h);
  }, []);
  // Command Palette → Bulk Add Threads bridge.
  useEffect(() => {
    const h = () => setBulkAddOpen(true);
    window.addEventListener("cs:openBulkAdd", h);
    return () => window.removeEventListener("cs:openBulkAdd", h);
  }, []);
  // Command Palette → Preferences modal bridge (UX-12 Phase 6 PR #11).
  useEffect(() => {
    const h = () => { if (typeof window.PreferencesModal !== 'undefined') setPreferencesOpen(true); };
    window.addEventListener("cs:openPreferences", h);
    return () => window.removeEventListener("cs:openPreferences", h);
  }, []);
  // Register manager-specific palette actions.
  useEffect(() => {
    if (!window.CommandPalette) return;
    window.CommandPalette.registerPage('manager', [
      {
        id: 'mgr_bulk_add', label: 'Bulk Add Threads', section: 'action',
        keywords: ['bulk', 'add', 'thread', 'inventory', 'stash'],
        action: () => setBulkAddOpen(true)
      },
      {
        id: 'mgr_preferences', label: 'Open Preferences', section: 'settings',
        keywords: ['preferences', 'settings', 'profile'],
        action: () => setPreferencesOpen(true)
      }
    ]);
    return () => { if (window.CommandPalette) window.CommandPalette.registerPage('manager', []); };
  }, []);

  // Global "B" shortcut → open Bulk Add Threads from anywhere on the Manager
  // page. Registered through the central shortcuts registry.
  if(typeof window.useShortcuts==='function'){
    window.useShortcuts(typeof window.BulkAddModal==='undefined'?[]:[
      { id: 'global.bulkAdd.manager', keys: 'b', scope: 'global',
        description: 'Open Bulk Add Threads',
        run: ()=>setBulkAddOpen(true) }
    ],[]);
  }
  // "Show welcome tour again" from HelpCentre → re-open the wizard.
  useEffect(() => {
    const h = (e) => { if (!e || !e.detail || e.detail.page === "manager") setWelcomeOpen(true); };
    window.addEventListener("cs:showWelcome", h);
    return () => window.removeEventListener("cs:showWelcome", h);
  }, []);
  const lowStockThreshold = (() => { try { var v = window.UserPrefs && window.UserPrefs.get("stashLowStockThreshold"); return (typeof v === "number" && v >= 0) ? v : 1; } catch (_) { return 1; } })();
  const formatBrandLabel = (brand) => {
    const b = (brand || "dmc").toString().toLowerCase();
    return b === "anchor" ? "Anchor" : b === "dmc" ? "DMC" : (brand || "DMC");
  };
  const getPatternTitleFromProject = (meta, full) => {
    if (meta && meta.name) return meta.name;
    if (full && full.settings && Number.isFinite(full.settings.sW) && Number.isFinite(full.settings.sH)) return `${full.settings.sW}\u00D7${full.settings.sH} pattern`;
    return 'Pattern';
  };
  const makeAutoSyncedPatternId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return Date.now().toString() + Math.random().toString(36).slice(2);
  };
  const buildAutoSyncedPattern = (meta, full) => {
    if (!full || !full.pattern) return null;
    const counts = {};
    for (const cell of full.pattern) {
      if (!cell || !cell.id || cell.id === '__skip__' || cell.id === '__empty__') continue;
      counts[cell.id] = (counts[cell.id] || 0) + 1;
    }
    const threadList = Object.entries(counts).map(([id, stitches]) => {
      const dmcEntry = typeof findThreadInCatalog === 'function' ? findThreadInCatalog('dmc', id) : null;
      return { id, name: dmcEntry ? dmcEntry.name : id, qty: stitches, unit: 'stitches', brand: 'DMC' };
    });
    return {
      id: makeAutoSyncedPatternId(),
      linkedProjectId: meta.id,
      title: getPatternTitleFromProject(meta, full),
      designer: '',
      status: 'inprogress',
      tags: ['auto-synced'],
      threads: threadList
    };
  };
  const reconcileAutoSyncedPatterns = useCallback(async (basePatterns, allMeta) => {
    // Build a map of linkedProjectId → index for fast lookup.
    const linkedIdxMap = new Map(
      basePatterns.map((p, i) => p.linkedProjectId ? [p.linkedProjectId, i] : null).filter(Boolean)
    );
    const unlinked = allMeta.filter(m => !linkedIdxMap.has(m.id));

    // For each project that already has a library entry, check whether its name
    // changed (e.g. renamed on another device via sync). If so, update title only —
    // leave user-set fields (designer, tags, status) untouched.
    let reconciled = updateTitleIfChanged(basePatterns, allMeta, linkedIdxMap);

    if (unlinked.length === 0) return reconciled;
    return await addUnlinkedPatterns(reconciled, basePatterns, unlinked);
  }, []);

  function updateTitleIfChanged(basePatterns, allMeta, linkedIdxMap) {
    let reconciled = basePatterns;
    for (const meta of allMeta) {
      const idx = linkedIdxMap.get(meta.id);
      if (idx === undefined) continue;
      const existing = reconciled[idx];
      const expectedTitle = getPatternTitleFromProject(meta, null);
      if (existing.title !== expectedTitle && existing.tags && existing.tags.includes('auto-synced')) {
        if (reconciled === basePatterns) reconciled = [...basePatterns];
        reconciled[idx] = { ...reconciled[idx], title: expectedTitle };
      }
    }
    return reconciled;
  }

  async function addUnlinkedPatterns(reconciled, basePatterns, unlinked) {
    // PERF (perf-5 #5): fetch all unlinked projects in parallel.
    let fulls;
    try {
      fulls = await Promise.all(unlinked.map(m => ProjectStorage.get(m.id).catch(() => null)));
    } catch (e) { fulls = []; }
    for (let i = 0; i < unlinked.length; i++) {
      const meta = unlinked[i];
      const full = fulls[i];
      try {
        const autoPattern = buildAutoSyncedPattern(meta, full);
        if (autoPattern) {
          if (reconciled === basePatterns) reconciled = [...basePatterns];
          reconciled.push(autoPattern);
        }
      } catch (e) {
        console.warn('Manager: failed to reconcile project', meta && meta.id, e);
      }
    }
    return reconciled;
  }


  // Storage initialization
  useEffect(() => {
    // Load Manager Data
    const loadManagerData = async () => {
      try {
        await ensurePersistence();
        const db = await openManagerDB();
        const tx = db.transaction(["manager_state"], "readwrite");
        const store = tx.objectStore("manager_state");

        const getRequest = (req) => new Promise((resolve, reject) => {
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });

        const threadsData = await getRequest(store.get("threads"));
        const patternsData = await getRequest(store.get("patterns"));
        const versionData = await getRequest(store.get("stashDataVersion"));
        const profileData = await getRequest(store.get("userProfile"));

        if (profileData) {
          setUserProfile(profileData);
        }

        let finalThreads = threadsData;

        if (threadsData && versionData !== 2 && versionData !== 3) {
          // Backup
          store.put(threadsData, "threads_backup_v1");

          // Migrate v1 → v3
          finalThreads = {};
          for (const [id, t] of Object.entries(threadsData)) {
            finalThreads[id] = { ...t, partialStatus: t.partialStatus || null, min_stock: 0 };
          }
          store.put(finalThreads, "threads");
          store.put(3, "stashDataVersion");
        } else if (threadsData && versionData === 2) {
          // Migrate v2 → v3: add min_stock
          finalThreads = {};
          for (const [id, t] of Object.entries(threadsData)) {
            finalThreads[id] = { ...t, min_stock: t.min_stock || 0 };
          }
          store.put(finalThreads, "threads");
          store.put(3, "stashDataVersion");
        } else if (!threadsData) {
          finalThreads = {};
          DMC.forEach(d => {
              finalThreads[threadKey('dmc', d.id)] = { owned: 0, tobuy: false, partialStatus: null, min_stock: 0 };
          });
          if (typeof ANCHOR !== 'undefined') {
            ANCHOR.forEach(a => {
              finalThreads[threadKey('anchor', a.id)] = { owned: 0, tobuy: false, partialStatus: null, min_stock: 0 };
            });
          }
          store.put(finalThreads, "threads");
          store.put(4, "stashDataVersion");
        }

        // v3 → v4: convert bare DMC keys to composite keys and add Anchor threads
        if (threadsData && versionData === 3) {
          const migrated = {};
          for (const [key, val] of Object.entries(finalThreads)) {
            migrated[normaliseStashKey(key)] = val;
          }
          if (typeof ANCHOR !== 'undefined') {
            ANCHOR.forEach(a => {
              const aKey = threadKey('anchor', a.id);
              if (!migrated[aKey]) migrated[aKey] = { owned: 0, tobuy: false, partialStatus: null, min_stock: 0 };
            });
          }
          finalThreads = migrated;
          store.put(finalThreads, "threads");
          store.put(4, "stashDataVersion");
        }

        setThreads(finalThreads);

        // Reconcile pattern library against CrossStitchDB.
        // Projects added via backup restore or JSON import never go through
        // syncProjectToLibrary, so they won't appear in the Patterns tab unless
        // we explicitly check here.
        let finalPatterns = patternsData || [];
        if (typeof ProjectStorage !== 'undefined') {
          try {
            const allMeta = await ProjectStorage.listProjects();
            finalPatterns = await reconcileAutoSyncedPatterns(finalPatterns, allMeta);
          } catch (e) {
            console.warn('Manager: pattern reconciliation failed', e);
          }
        }
        setPatterns(finalPatterns);
      } catch (err) {
        console.error("Failed to load manager data:", err);
      }
    };

    // Load the currently active project. Prefers the canonical ProjectStorage active
    // pointer (proj_* key) over the legacy "auto_save" key, which may be stale if
    // the user only uses the Tracker without navigating through the Creator.
    const loadActiveProject = async () => {
      try {
        let proj = null;
        if (typeof ProjectStorage !== 'undefined') {
          proj = await ProjectStorage.getActiveProject();
        }
        if (!proj) proj = await loadProjectFromDB(); // fallback to legacy auto_save
        if (proj) {
            setActiveProject(proj);
        }
      } catch (err) {
        console.error("Failed to load active project:", err);
      }
    };

    // Await loadManagerData so ensurePersistence() has settled before we read the
    // storage estimate — otherwise the persistent flag races and shows false.
    loadManagerData().then(() => {
      ProjectStorage.getStorageEstimate().then(setStorageUsage).catch(e => console.warn('getStorageEstimate failed:', e));
    });
    loadActiveProject();
    ProjectStorage.listProjects().then(setStoredProjects).catch(err => console.error("Failed to list projects:", err));

    // Re-reconcile when the user switches back to this tab, so projects synced
    // by the Creator or Tracker while the Manager was in the background appear
    // without requiring a page reload. Patterns are reloaded from DB so that
    // name changes made in the Creator (via syncProjectToLibrary) are reflected
    // immediately rather than showing stale cached titles.
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      ProjectStorage.listProjects().then(async meta => {
        setStoredProjects(meta);
        try {
          const db = await openManagerDB();
          const freshPatterns = await new Promise((resolve, reject) => {
            const tx = db.transaction("manager_state", "readonly");
            const req = tx.objectStore("manager_state").get("patterns");
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => reject(req.error);
          });
          const reconciled = await reconcileAutoSyncedPatterns(freshPatterns, meta);
          setPatterns(reconciled);
        } catch (e) {
          // Fallback: reconcile with current state only
          setPatterns(prev => {
            (async () => {
              const reconciled = await reconcileAutoSyncedPatterns(prev, meta);
              if (reconciled !== prev) setPatterns(reconciled);
            })();
            return prev;
          });
        }
      }).catch(() => {});
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // After a backup restore, the underlying IndexedDB stores have been replaced.
    // Re-load threads and patterns so the UI doesn't keep showing stale state.
    const handleBackupRestored = () => {
      loadManagerData();
      loadActiveProject();
      ProjectStorage.listProjects().then(setStoredProjects).catch(e => console.warn('listProjects failed:', e));
    };
    window.addEventListener('cs:backupRestored', handleBackupRestored);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('cs:backupRestored', handleBackupRestored);
    };
  }, []);

  // Auto-save Manager Data
  useEffect(() => {
    const saveTimer = setTimeout(async () => {
      try {
        const db = await openManagerDB();
        const tx = db.transaction(["manager_state"], "readwrite");
        const store = tx.objectStore("manager_state");
        store.put(threads, "threads");
        store.put(patterns, "patterns");
        store.put(userProfile, "userProfile");
      } catch (err) {
        console.error("Auto-save failed:", err);
      }
    }, 1000);
    return () => clearTimeout(saveTimer);
  }, [threads, patterns, userProfile]);

  // Flush pending state to IDB on page unload so navigation doesn't lose recent changes
  useEffect(() => {
    const threadsRef = { current: threads };
    const patternsRef = { current: patterns };
    const profileRef = { current: userProfile };
    // Keep refs up to date
    threadsRef.current = threads;
    patternsRef.current = patterns;
    profileRef.current = userProfile;
    const handleBeforeUnload = () => {
      try {
        const req = indexedDB.open("stitch_manager_db", 1);
        req.onsuccess = (e) => {
          const db = e.target.result;
          const tx = db.transaction(["manager_state"], "readwrite");
          const store = tx.objectStore("manager_state");
          store.put(threadsRef.current, "threads");
          store.put(patternsRef.current, "patterns");
          store.put(profileRef.current, "userProfile");
        };
      } catch (err) {}
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [threads, patterns, userProfile]);

  // Smart Stash Hub: refresh conflicts, ready-to-start, and low-stock alerts
  useEffect(() => {
    if (typeof StashBridge === "undefined") return;
    StashBridge.detectConflicts().then(setConflicts).catch(e => console.warn('detectConflicts failed:', e));
    StashBridge.whatCanIStart().then(setReadyToStart).catch(e => console.warn('whatCanIStart failed:', e));
    // Low-stock: threads where owned > 0 but below min_stock (explicit), or below the
    // global lowStockThreshold (1 skein) when no per-thread minimum has been set.
    const alerts = Object.entries(threads)
      .filter(([, t]) => t.owned && t.owned > 0)
      .filter(([compositeKey, t]) => isThreadLowStock(t, lowStockThreshold))
      .map(([compositeKey, t]) => {
        const { brand, bareId } = extractBrandAndId(compositeKey);
        const effectiveMin = calculateEffectiveMinStock(t, lowStockThreshold);
        const info = typeof getThreadByKey === 'function' ? getThreadByKey(compositeKey) : findThreadInCatalog('dmc', bareId);
        return { id: compositeKey, brand, bareId, name: info ? info.name : bareId, rgb: info ? info.rgb : [128,128,128], owned: t.owned, min_stock: effectiveMin };
      });
    alerts.sort((a, b) => (a.min_stock - a.owned) - (b.min_stock - b.owned));
    setLowStockAlerts(alerts);
  }, [threads, patterns]);

  function extractBrandAndId(compositeKey) {
    if (compositeKey.indexOf(':') < 0) return { brand: 'dmc', bareId: compositeKey };
    const parts = compositeKey.split(':');
    return { brand: parts[0], bareId: parts.slice(1).join(':') };
  }

  function calculateEffectiveMinStock(thread, lowStockThreshold) {
    const minStock = thread.min_stock || 0;
    return minStock > 0 ? minStock : lowStockThreshold;
  }

  function isThreadLowStock(thread, lowStockThreshold) {
    return thread.owned < calculateEffectiveMinStock(thread, lowStockThreshold);
  }


  // Split low-stock alerts into those needed by active projects vs. not
  const { lowStockNeeded, lowStockNotNeeded } = useMemo(() => {
    if (!lowStockAlerts) return { lowStockNeeded: null, lowStockNotNeeded: null };
    const activeIds = new Set();
    patterns.forEach(pat => {
      if (pat.status === 'completed') return;
      if (pat.threads) pat.threads.forEach(t => activeIds.add(t.id));
    });
    return {
      lowStockNeeded: lowStockAlerts.filter(a => activeIds.has(a.bareId || a.id)),
      lowStockNotNeeded: lowStockAlerts.filter(a => !activeIds.has(a.bareId || a.id)),
    };
  }, [lowStockAlerts, patterns]);

  function openManagerDB() {
    return new Promise((resolve, reject) => {
      ensurePersistence();
      const req = indexedDB.open("stitch_manager_db", 1);
      req.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains("manager_state")) {
          db.createObjectStore("manager_state");
        }
      };
      req.onsuccess = (e) => resolve(e.target.result);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  const handleBackupDownload = async () => {
    try {
      setBackupStatus({ type: "success", message: "Creating backup..." });
      await BackupRestore.downloadBackup();
      setBackupStatus({ type: "success", message: "Backup downloaded!" });
      setTimeout(() => setBackupStatus(null), 3000);
    } catch (e) {
      setBackupStatus({ type: "error", message: "Backup failed: " + e.message });
    }
  };

  const handleRestoreFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        // PERF (deferred-2): handles both legacy JSON and CSB1\n compressed.
        const backup = BackupRestore.parseBackupText(reader.result);
        const check = BackupRestore.validate(backup);
        if (!check.valid) {
          setBackupStatus({ type: "error", message: check.error });
          return;
        }
        setBackupStatus({
          type: "confirm",
          message: `Restore backup from ${check.summary.createdAt ? new Date(check.summary.createdAt).toLocaleString() : "unknown date"}? This will replace all current data.`,
          summary: check.summary,
          onConfirm: async () => {
            try {
              setBackupStatus({ type: "success", message: "Restoring..." });
              await BackupRestore.restore(backup);
              setBackupStatus({ type: "success", message: "Restored! Reloading..." });
              setTimeout(() => window.location.reload(), 1000);
            } catch (err) {
              setBackupStatus({ type: "error", message: "Restore failed: " + err.message });
            }
          }
        });
      } catch (err) {
        setBackupStatus({ type: "error", message: "Invalid file: could not parse JSON." });
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const updateThread = (id, field, value) => {
    setThreads(prev => {
      const updated = {
        ...prev[id],
        [field]: value
      };

      // If setting "used-up", auto-zero the skeins
      if (field === "partialStatus" && value === "used-up") {
        updated.owned = 0;
      }
      // If setting skeins to > 0 while "used-up" is selected, clear "used-up" to prevent conflicting states
      if (field === "owned" && value > 0 && prev[id]?.partialStatus === "used-up") {
        updated.partialStatus = null;
      }

      return {
        ...prev,
        [id]: updated
      };
    });
  };

  const filteredThreads = useMemo(() => {
    const dmcItems = DMC.map(d => ({ ...d, brand: 'dmc', compositeKey: threadKey('dmc', d.id) }));
    const anchorItems = typeof ANCHOR !== 'undefined' ? ANCHOR.map(a => ({ ...a, brand: 'anchor', compositeKey: threadKey('anchor', a.id) })) : [];
    const allItems = brandFilter === 'dmc' ? dmcItems
      : brandFilter === 'anchor' ? anchorItems
      : [...dmcItems, ...anchorItems];

    const q = searchQuery.toLowerCase();
    const searched = q ? allItems.filter(d => d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)) : allItems;

    return searched.filter(d => {
      if (d.compositeKey === expandedThread) return true;
      const t = threads[d.compositeKey] || { owned: 0, tobuy: false, partialStatus: null };
      return matchesThreadFilter(t, threadFilter, lowStockThreshold);
    });
  }, [searchQuery, threads, threadFilter, brandFilter, expandedThread]);

  function matchesThreadFilter(t, filter, lowStockThreshold) {
    if (filter === 'owned') return t.owned > 0 || ["mostly-full", "about-half", "remnant"].includes(t.partialStatus);
    if (filter === 'tobuy') return t.tobuy;
    if (filter === 'lowstock') return (t.owned > 0 && t.owned <= lowStockThreshold) || (t.owned === 0 && ["about-half", "remnant"].includes(t.partialStatus));
    if (filter === 'remnants') return t.partialStatus === "remnant";
    if (filter === 'usedup') return t.partialStatus === "used-up" && t.owned === 0;
    return true;
  }


  const totalOwnedCount = useMemo(() => {
    return Object.values(threads).reduce((sum, t) => sum + (t.owned || 0), 0);
  }, [threads]);

  const toBuyCount = useMemo(() => {
    return Object.values(threads).filter(t => t.tobuy).length;
  }, [threads]);

  const patternsUsingThread = useCallback((threadId) => {
    return patterns.filter(p => p.threads && p.threads.some(t => t.id === threadId));
  }, [patterns]);

  const filteredPatterns = useMemo(() => {
    const q = searchQuery.toLowerCase();
    return patterns
      .filter(p => matchesSearch(p, q))
      .filter(p => matchesPatternFilter(p, patternFilter))
      .sort((a, b) => comparePatterns(a, b, patternSort));
  }, [patterns, searchQuery, patternFilter, patternSort]);

  function matchesSearch(p, q) {
    if (!q) return true;
    return p.title.toLowerCase().includes(q) ||
      (p.designer && p.designer.toLowerCase().includes(q)) ||
      (p.tags && p.tags.some(tag => tag.toLowerCase().includes(q)));
  }

  function matchesPatternFilter(p, filter) {
    return filter === "all" || p.status === filter;
  }

  function comparePatterns(a, b, sortKey) {
    const statusOrder = { wishlist: 0, owned: 1, inprogress: 2, completed: 3 };
    if (sortKey === "date_desc") return (b.id || 0) - (a.id || 0);
    if (sortKey === "date_asc") return (a.id || 0) - (b.id || 0);
    if (sortKey === "title_asc") return (a.title || "").localeCompare(b.title || "");
    if (sortKey === "designer_asc") return (a.designer || "").localeCompare(b.designer || "");
    if (sortKey === "status") {
      if (statusOrder[a.status] !== statusOrder[b.status]) {
        return statusOrder[a.status] - statusOrder[b.status];
      }
      return (a.title || "").localeCompare(b.title || "");
    }
    return 0;
  }


  const addOrUpdatePattern = (patt) => {
    setPatterns(prev => {
      const idx = prev.findIndex(p => p.id === patt.id);
      if (idx >= 0) {
        let newArr = [...prev];
        newArr[idx] = patt;
        return newArr;
      }
      return [...prev, patt];
    });
    setEditingPattern(null);
    if (viewingPattern && viewingPattern.id === patt.id) {
        setViewingPattern(patt);
    }
  };

  const deletePattern = (id) => {
    // Capture the pattern before removal so Undo can restore it.
    const deletedPattern = patterns.find(p => p.id === id);
    if (!deletedPattern) return;
    const wasViewing = viewingPattern && viewingPattern.id === id;
    setPatterns(prev => {
      const updated = prev.filter(p => p.id !== id);
      // Write immediately so navigation before the debounced auto-save cannot lose the deletion
      openManagerDB().then(db => {
        const tx = db.transaction(["manager_state"], "readwrite");
        tx.objectStore("manager_state").put(updated, "patterns");
      }).catch(err => console.error("Immediate pattern delete save failed:", err));
      return updated;
    });
    if (wasViewing) setViewingPattern(null);
    if (window.Toast) {
      window.Toast.show({
        message: `\"${deletedPattern.title || "Pattern"}\" deleted`,
        type: "info",
        undoAction: () => {
          setPatterns(prev => prev.some(p => p.id === deletedPattern.id) ? prev : [...prev, deletedPattern]);
        }
      });
    }
  };

  const togglePatternSelection = (id) => {
    const next = new Set(selectedPatternsForList);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedPatternsForList(next);
  };

  const statusColors = {
    wishlist: { bg: "var(--warning-soft)", text: "var(--accent-ink)", label: "Wishlist" },
    owned: { bg: "#e0e7ff", text: "#4338ca", label: "Owned" },
    inprogress: { bg: "var(--warning-soft)", text: "#c2410c", label: "In Progress" },
    completed: { bg: "#dcfce3", text: "var(--success)", label: "Completed" }
  };

  return (
    <>
      <Header page="manager" setModal={setModal} onBackupDownload={handleBackupDownload} onRestoreFile={handleRestoreFile} onOpenProject={typeof window.ProjectStorage!=='undefined'?()=>{window.location.href='index.html';}:undefined} onPreferences={typeof window.PreferencesModal!=='undefined'?()=>setPreferencesOpen(true):undefined} storageUsage={storageUsage} />
      {preferencesOpen && typeof window.PreferencesModal!=='undefined' && React.createElement(window.PreferencesModal,{onClose:()=>setPreferencesOpen(false)})}
      {backupStatus && (
        <div style={{ padding: "8px 20px 0" }}>
          <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 12, background: backupStatus.type === "error" ? "var(--danger-soft)" : backupStatus.type === "confirm" ? "var(--warning-soft)" : "var(--success-soft)", border: `1px solid ${backupStatus.type === "error" ? "var(--danger-soft)" : backupStatus.type === "confirm" ? "var(--warning)" : "#C4DCB6"}`, color: backupStatus.type === "error" ? "var(--danger)" : backupStatus.type === "confirm" ? "var(--accent-ink)" : "var(--success)" }}>
            <div>{backupStatus.message}</div>
            {backupStatus.summary && (
              <div style={{ fontSize: 11, marginTop: 4, color: "var(--text-secondary)" }}>
                {backupStatus.summary.projectCount} projects, {backupStatus.summary.threadCount} owned threads, {backupStatus.summary.patternCount} patterns
              </div>
            )}
            {backupStatus.type === "confirm" && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={backupStatus.onConfirm} style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, background: "var(--accent-ink)", color: "var(--surface)", border: "none", borderRadius: 6, cursor: "pointer" }}>Yes, Restore</button>
                <button onClick={() => setBackupStatus(null)} style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, background: "var(--surface)", color: "var(--text-secondary)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-tab bar */}
      <div className="mgr-tab-bar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex" }}>
          <button data-onboard="mgr-stash-tab" className={"mgr-tab" + (tab === "inventory" ? " on" : "")} onClick={() => { setTab("inventory"); setSearchQuery(""); setSelectedThread(null); setPanelOpen(false); }}>
            <span className="icon">{Icons.thread()}</span> Thread Stash <span className="cnt">{totalOwnedCount}</span>
          </button>
          <button data-onboard="mgr-patterns-tab" className={"mgr-tab" + (tab === "patterns" ? " on" : "")} onClick={() => { setTab("patterns"); setSearchQuery(""); setSelectedThread(null); setPanelOpen(false); }}>
            <span className="icon">{Icons.clipboard()}</span> Pattern Library <span className="cnt">{patterns.length}</span>
          </button>
          <button data-onboard="mgr-shopping-tab" className={"mgr-tab" + (tab === "shopping" ? " on" : "")} onClick={() => { setTab("shopping"); setSearchQuery(""); setSelectedThread(null); setPanelOpen(false); }}>
            <span className="icon">{Icons.shoppingCart ? Icons.shoppingCart() : Icons.cart()}</span> Shopping
          </button>
        </div>
        <button
          onClick={() => { window.location.href = "index.html?mode=stats&tab=showcase"; }}
          title="See your stitching journey"
          style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", background: "none", border: "none", cursor: "pointer", padding: "0 14px", fontFamily: "inherit", flexShrink: 0, whiteSpace: "nowrap" }}
          aria-label="Open Showcase view"
        >
          ✦ Showcase
        </button>
      </div>

      {/* Filter bar — threads */}
      {tab === "inventory" && (
        <div className="mgr-filter-bar">
          <input
            type="text"
            placeholder="Search thread number or name..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {[
            {id: "all", label: "All"},
            {id: "tobuy", label: "To Buy"},
            {id: "owned", label: "Owned"},
            {id: "lowstock", label: "Low Stock"},
            {id: "remnants", label: "Remnants"},
            {id: "usedup", label: "Used Up"}
          ].map(f => (
            <button key={f.id} className={"mgr-chip" + (threadFilter === f.id ? " on" : "")} onClick={() => setThreadFilter(f.id)}>{f.label}</button>
          ))}
          <span style={{marginLeft:4,marginRight:2,color:'var(--text-tertiary)',fontSize:11}}>Brand:</span>
          {[
            {id: "all", label: "All"},
            {id: "dmc", label: "DMC"},
            {id: "anchor", label: "Anchor"}
          ].map(f => (
            <button key={'brand-' + f.id} className={"mgr-chip" + (brandFilter === f.id ? " on" : "")} onClick={() => setBrandFilter(f.id)}>{f.label}</button>
          ))}
          {typeof window.BulkAddModal !== 'undefined' && (
            <button
              onClick={() => setBulkAddOpen(true)}
              style={{marginLeft:'auto',padding:'5px 12px',fontSize:12,fontWeight:600,background:'var(--surface-secondary)',color:'var(--accent)',border:'1px solid #bfdbfe',borderRadius:6,cursor:'pointer',whiteSpace:'nowrap'}}
              title="Bulk-add threads to your stash by pasting a list or choosing a starter kit"
            >+ Bulk Add</button>
          )}
        </div>
      )}

      {/* Stats strip — threads */}
      {tab === "inventory" && (
        <div className="mgr-stats-strip">
          <div className="stat">{Icons.check()} <span className="val">{totalOwnedCount}</span> skeins owned</div>
          <div className="stat">{Icons.cart()} <span className="val">{toBuyCount}</span> to buy</div>
          {lowStockNeeded && lowStockNeeded.length > 0 && <div className="stat">{Icons.warning()} <span className="val">{lowStockNeeded.length}</span> low stock (needed)</div>}
        </div>
      )}

      {tab === "inventory" && (
        <div className="mgr-main"><div className="mgr-content">

            {/* Smart Hub: Conflicts */}
            {conflicts && conflicts.length > 0 && (
              <div className="alert-card danger">
                <div className="at">{Icons.warning()} Thread Conflicts ({conflicts.length})</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>These threads are needed by multiple patterns but you don't have enough.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflow: "auto" }}>
                  {conflicts.map(c => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: "var(--surface)", border: "1px solid var(--danger-soft)", cursor: "pointer" }}
                      title={"Open thread card for " + formatBrandLabel(c.brand) + " " + c.id}
                      onClick={() => { setTab("inventory"); setThreadFilter("all"); setBrandFilter("all"); setSearchQuery(""); setSelectedThread(c.key); setPanelOpen(true); }}>
                      <span style={{ width: 14, height: 14, borderRadius: 3, background: `rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`, border: "1px solid var(--border)", flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{formatBrandLabel(c.brand)} {c.id}</span>
                      <span style={{ fontSize: 11, color: "var(--text-secondary)", flex: 1 }}>{c.name}</span>
                      <span style={{ fontSize: 11, color: "var(--danger)", fontWeight: 600 }}>own {c.owned}, need {c.totalNeeded}</span>
                      <span style={{ fontSize: 10, color: "var(--text-tertiary)" }}>{c.patterns.map(p => p.title).join(", ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Smart Hub: Low-Stock Alerts — needed by active projects */}
            {lowStockNeeded && lowStockNeeded.length > 0 && (
              <div className="alert-card warn" style={{ marginBottom: 16 }}>
                <div className="at">{Icons.box()} Low Stock — Needed ({lowStockNeeded.length})</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>Threads below your minimum stock level that are used by active projects.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflow: "auto" }}>
                  {lowStockNeeded.map(a => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: "var(--surface)", border: "1px solid var(--warning)", cursor: "pointer" }}
                      title={"Open thread card for " + formatBrandLabel(a.brand) + " " + (a.bareId || a.id)}
                      onClick={() => { setTab("inventory"); setThreadFilter("all"); setBrandFilter("all"); setSearchQuery(""); setSelectedThread(a.id); setPanelOpen(true); }}>
                      <span style={{ width: 14, height: 14, borderRadius: 3, background: `rgb(${a.rgb[0]},${a.rgb[1]},${a.rgb[2]})`, border: "1px solid var(--border)", flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{formatBrandLabel(a.brand)} {a.bareId || a.id}</span>
                      <span style={{ fontSize: 11, color: "var(--text-secondary)", flex: 1 }}>{a.name}</span>
                      <span style={{ fontSize: 11, color: "var(--accent-ink)", fontWeight: 600 }}>have {a.owned}, min {a.min_stock}</span>
                      <button onClick={(e) => { e.stopPropagation(); updateThread(a.id, "tobuy", true); }} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid var(--warning)", background: "var(--warning-soft)", color: "var(--accent-ink)", cursor: "pointer", fontWeight: 600 }}>Add to buy</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Smart Hub: Low-Stock — not currently needed */}
            {lowStockNotNeeded && lowStockNotNeeded.length > 0 && (
              <div className="alert-card" style={{ marginBottom: 16, background: "#f8fafc", border: "1px solid var(--border)" }}>
                <div className="at" style={{ color: "var(--text-tertiary)" }}>{Icons.box()} Low stash — not currently needed ({lowStockNotNeeded.length})</div>
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", marginBottom: 10 }}>These threads are below minimum stock but aren't used by any active project.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflow: "auto" }}>
                  {lowStockNotNeeded.map(a => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: "var(--surface)", border: "1px solid var(--border)" }}>
                      <span style={{ width: 14, height: 14, borderRadius: 3, background: `rgb(${a.rgb[0]},${a.rgb[1]},${a.rgb[2]})`, border: "1px solid var(--border)", flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, fontSize: 12 }}>{formatBrandLabel(a.brand)} {a.bareId || a.id}</span>
                      <span style={{ fontSize: 11, color: "var(--text-secondary)", flex: 1 }}>{a.name}</span>
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)", fontWeight: 600 }}>have {a.owned}, min {a.min_stock}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="thread-grid">
              {filteredThreads.map(d => {
                const state = threads[d.compositeKey] || { owned: 0, tobuy: false, partialStatus: null };
                const isSelected = selectedThread === d.compositeKey;
                const isLowStock = state.owned > 0 && state.owned <= lowStockThreshold;

                const gaugeLevel = !state.partialStatus ? 0 : state.partialStatus === "mostly-full" ? 3 : state.partialStatus === "about-half" ? 2 : state.partialStatus === "remnant" ? 1 : state.partialStatus === "used-up" ? 4 : 0;

                return (
                  <div key={d.compositeKey} className={"tcard" + (isSelected ? " on" : "")} onClick={() => { const next = isSelected ? null : d.compositeKey; setSelectedThread(next); if (next) setPanelOpen(true); }}>
                    <div className="sw" style={{ background: `rgb(${d.rgb})` }} />
                    <div className="info">
                      <div className="tid">{d.id}{d.brand === 'anchor' && <span style={{fontSize:9,fontWeight:700,background:'#e0f2fe',color:'#0369a1',borderRadius:3,padding:'0 3px',marginLeft:4,verticalAlign:'middle'}}>A</span>}</div>
                      <div className="tnm">{d.name}</div>
                    </div>
                    {isLowStock && <span className="badge-low">Low</span>}
                    <div className="owned">{state.owned}</div>
                    <div className="gauge">
                      {[0,1,2,3].map(s => (
                        <div key={s} className={"seg" + (s < gaugeLevel && gaugeLevel < 4 ? " full" : "") + (gaugeLevel === 1 && s === 0 ? " warn" : "") + (gaugeLevel === 4 ? " full" : "")} />
                      ))}
                    </div>
                  </div>
                );
              })}
              {filteredThreads.length === 0 && (
                totalOwnedCount === 0 && threadFilter === 'all' && window.EmptyState
                  ? <div style={{ gridColumn: "1 / -1", padding: "20px 0" }}>
                      {React.createElement(window.EmptyState, {
                        icon: Icons.thread(),
                        title: "Your stash is empty",
                        description: "Track which DMC and Anchor threads you own so you can plan projects and see what you still need.",
                        ctaLabel: "Bulk add threads",
                        ctaAction: () => setBulkAddOpen(true)
                      })}
                    </div>
                  : <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 20px", color: "var(--text-secondary)", fontSize: 14 }}>
                      {threadFilter === 'remnants' ? "Threads marked as remnants will appear here. You can change a thread's status from its entry in the All tab." :
                       threadFilter === 'usedup' ? "Threads marked as used up will appear here." :
                       "No threads found."}
                    </div>
              )}
            </div>
          </div>

          {/* Right Panel — Thread Detail */}
          {panelOpen && <div className="rpanel-backdrop" onClick={() => setPanelOpen(false)} />}
          <div className={"mgr-rpanel" + (panelOpen ? " mgr-rpanel--open" : "")}>
            <div className="mgr-panel-handle" onClick={() => setPanelOpen(o => !o)}>
              <div className="rpanel-handle-bar" />
              <span style={{fontSize:10,color:"var(--text-tertiary)",marginTop:2}}>{selectedThread ? "Thread Detail" : "Thread Detail"}</span>
            </div>
            {selectedThread ? (() => {
              const d = typeof getThreadByKey === 'function' ? getThreadByKey(selectedThread) : findThreadInCatalog('dmc', selectedThread);
              if (!d) return <div className="rp-s" style={{ color: "var(--text-tertiary)", textAlign: "center", padding: 20 }}>Thread not found</div>;
              const selBrand = selectedThread.indexOf(':') < 0 ? 'dmc' : selectedThread.split(':')[0];
              const brandLabel = selBrand === 'anchor' ? 'Anchor' : 'DMC';
              const state = threads[selectedThread] || { owned: 0, tobuy: false, partialStatus: null, min_stock: 0 };
              return <>
                <div className="rp-s" style={{ textAlign: "center" }}>
                  <div className="td-swatch" style={{ background: `rgb(${d.rgb})` }} />
                  <div className="td-title">
                    <div className="dmc">{brandLabel} {d.id}{selBrand === 'anchor' && <span style={{fontSize:9,fontWeight:700,background:'#e0f2fe',color:'#0369a1',borderRadius:3,padding:'0 3px',marginLeft:4}}>A</span>}</div>
                    <div className="tnm">{d.name}</div>
                  </div>
                </div>
                <div className="rp-s">
                  <div className="rp-h">Stash</div>
                  <div className="td-row">
                    <span className="lbl">Full skeins</span>
                    <div className="qty-ctrl">
                      <button onClick={() => updateThread(selectedThread, "owned", Math.max(0, state.owned - 1))}>−</button>
                      <span className="num">{state.owned}</span>
                      <button onClick={() => updateThread(selectedThread, "owned", state.owned + 1)}>+</button>
                    </div>
                  </div>
                  <div className="td-row">
                    <span className="lbl">Min stock</span>
                    <div className="qty-ctrl">
                      <button onClick={() => updateThread(selectedThread, "min_stock", Math.max(0, (state.min_stock || 0) - 1))}>−</button>
                      <span className="num">{state.min_stock || 0}</span>
                      <button onClick={() => updateThread(selectedThread, "min_stock", (state.min_stock || 0) + 1)}>+</button>
                    </div>
                  </div>
                  <div className="td-row">
                    <span className="lbl">Opened skein</span>
                    <span className="val" style={{ fontSize: 11 }}>
                      {!state.partialStatus ? "None" : state.partialStatus === "mostly-full" ? "Mostly full" : state.partialStatus === "about-half" ? "About half" : state.partialStatus === "remnant" ? "Remnant" : "Used up"}
                    </span>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 10, color: "var(--text-tertiary)", marginBottom: 4, textAlign: "center" }}>Opened skein level</div>
                    <div className="gauge-lg">
                      {[
                        { val: null, label: "—" },
                        { val: "mostly-full", label: "¾" },
                        { val: "about-half", label: "½" },
                        { val: "remnant", label: "¼" }
                      ].map(opt => {
                        const isActive = state.partialStatus === opt.val || (opt.val === null && !state.partialStatus);
                        return <div key={opt.val || "none"} className={"seg" + (isActive ? " full" : "")} title={opt.val || "None"} onClick={() => updateThread(selectedThread, "partialStatus", opt.val)}>{opt.label}</div>;
                      })}
                    </div>
                  </div>
                </div>
                <div className="rp-s">
                  <div className="rp-h">Used In</div>
                  <div className="used-in">
                    {patternsUsingThread(d.id).length > 0
                      ? patternsUsingThread(d.id).map(p => (
                        <div key={p.id || p.title} className="ui-row">{Icons.clipboard()} {p.title} <span className="need">{p.threads.find(t => t.id === d.id) ? `need ${p.threads.find(t => t.id === d.id).qty} sk` : ""}</span></div>
                      ))
                      : <div style={{ fontSize: 11, color: "var(--text-tertiary)", padding: "4px 6px" }}>Not used in any patterns</div>
                    }
                  </div>
                </div>
                <div className="rp-s">
                  <div className="rp-h">Actions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <button className="g-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => updateThread(selectedThread, "tobuy", !state.tobuy)}>
                      {state.tobuy ? <>{Icons.check()} On shopping list</> : <>{Icons.cart()} Add to shopping list</>}
                    </button>
                    <button className="g-btn" style={{ width: "100%", justifyContent: "center", color: "#B85555", borderColor: "var(--danger-soft)" }} onClick={() => {
                      // Capture current values so Undo can restore them.
                      const prevOwned = state.owned;
                      const prevPartial = state.partialStatus;
                      const prevTobuy = state.tobuy;
                      const threadKey = selectedThread;
                      updateThread(threadKey, "owned", 0);
                      updateThread(threadKey, "partialStatus", null);
                      updateThread(threadKey, "tobuy", false);
                      if (window.Toast) {
                        window.Toast.show({
                          message: `${brandLabel} ${d.id} removed from stash`,
                          type: "info",
                          undoAction: () => {
                            updateThread(threadKey, "owned", prevOwned);
                            updateThread(threadKey, "partialStatus", prevPartial);
                            updateThread(threadKey, "tobuy", prevTobuy);
                          }
                        });
                      }
                    }}>
                      {Icons.trash()} Remove from stash
                    </button>
                  </div>
                </div>
              </>;
            })() : (
              <div className="rp-s" style={{ color: "var(--text-tertiary)", textAlign: "center", padding: "40px 16px", fontSize: 13 }}>
                Click a thread to view details
              </div>
            )}
          </div>
        </div>
        )}

        {tab === "shopping" && (
          window.ManagerShopping
            ? React.createElement(window.ManagerShopping, null)
            : <div style={{ padding: 24, fontSize: 13, color: "var(--text-tertiary)" }}>Shopping list module unavailable.</div>
        )}

        {tab === "patterns" && (
          <><div className="mgr-filter-bar">
            <input
              type="text"
              placeholder="Search title, designer, or tags..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {[
              {id: "all", label: "All"},
              {id: "wishlist", label: "Wishlist"},
              {id: "owned", label: "Owned"},
              {id: "inprogress", label: "In Progress"},
              {id: "completed", label: "Completed"}
            ].map(f => (
              <button key={f.id} className={"mgr-chip" + (patternFilter === f.id ? " on" : "")} onClick={() => setPatternFilter(f.id)}>{f.label}</button>
            ))}
            <select
              value={patternSort}
              onChange={e => setPatternSort(e.target.value)}
              style={{ padding: "5px 10px", fontSize: 11, border: "1px solid var(--border)", borderRadius: 8, background: "var(--surface)", color: "var(--text-secondary)", marginLeft: "auto", fontFamily: "inherit" }}
            >
              <option value="date_desc">Sort: Recent</option>
              <option value="date_asc">Sort: Oldest</option>
              <option value="title_asc">Sort: Name</option>
              <option value="designer_asc">Sort: Designer</option>
              <option value="status">Sort: Status</option>
            </select>
          </div>
          <div className="mgr-stats-strip">
            <div className="stat">{Icons.clipboard()} <span className="val">{patterns.length}</span> patterns</div>
            <div className="stat">{Icons.check()} <span className="val">{readyToStart ? readyToStart.filter(r => r.pct === 100).length : 0}</span> fully kitted</div>
          </div>
          <div className="mgr-main"><div className="mgr-content">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <button onClick={() => setProfileModalOpen(true)} style={{ padding: "6px 12px", fontSize: 12, borderRadius: 6, border: "1px solid var(--border)", background: "var(--surface)", cursor: "pointer", color: "var(--text-secondary)", fontFamily: "inherit" }}>
                {Icons.gear()} Thread Settings
              </button>
              <button
                onClick={() => setEditingPattern({ id: Date.now().toString(), title: "", designer: "", status: "wishlist", tags: [], threads: [] })}
                style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, background: "#B85C38", color: "var(--surface)", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}
              >
                + Add Pattern
              </button>
            </div>
            {/* Unified Project Library — same card view as Home dashboard so users
                see one consistent picture of their work across pages. */}
            {window.ProjectLibrary && (
              <div className="mgr-project-library" style={{ marginBottom: 16, padding: 12, border: "1px solid var(--border)", borderRadius: 12, background: "#fafafa" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" }}>Your Projects</div>
                  <div style={{ fontSize: 11, color: "#71717a" }}>Linked Creator/Tracker projects + Stash Manager-only entries</div>
                </div>
                {React.createElement(window.ProjectLibrary, {
                  mode: "manager",
                  onOpenProject: (proj, target) => {
                    if (!proj || !proj.id || proj.managerOnly) return;
                    try { ProjectStorage.setActiveProject(proj.id); } catch (e) {}
                    window.location.href = (target === "creator" ? "index.html" : "stitch.html") + "?source=manager";
                  },
                  onAddNew: () => { window.location.href = "index.html"; },
                  onOpenGlobalStats: () => { window.location.href = "index.html?stats=1"; },
                  onOpenManagerOnly: (proj) => {
                    // Scroll to the matching pattern card in the grid below.
                    const realId = proj && proj._managerPatternId;
                    if (!realId) return;
                    const match = patterns.find(p => p.id === realId);
                    if (match) setViewingPattern(match);
                  },
                  // Per-card extras: shopping-list checkbox + missing-thread badge
                  // so the legacy detail grid is no longer required.
                  cardExtras: (proj) => {
                    // Resolve the matching Manager pattern row for this project.
                    let pat = null;
                    if (proj.managerOnly && proj._managerPatternId) {
                      pat = patterns.find(p => p.id === proj._managerPatternId);
                    } else if (proj.id) {
                      pat = patterns.find(p => p.linkedProjectId === proj.id);
                    }
                    if (!pat) return null;
                    const reqThreads = pat.threads || [];
                    const missing = reqThreads.filter(t => {
                      const k = normaliseStashKey(t.id);
                      return !((threads[k] || {}).owned > 0);
                    });
                    const isSel = selectedPatternsForList.has(pat.id);
                    // Pull progress + weekly sparkline data from the linked
                    // ProjectStorage meta (the auto-synced manager pattern row
                    // itself doesn't carry these fields).
                    const meta = pat.linkedProjectId
                      ? storedProjects.find(s => s.id === pat.linkedProjectId)
                      : null;
                    const total = (meta && meta.totalStitches) || pat.totalStitches || 0;
                    const completed = (meta && meta.completedStitches) || pat.completedStitches || 0;
                    const pct = total > 0 ? Math.round(completed / total * 100) : null;
                    const pctBg = pct === null ? null : (pct >= 100 ? "var(--success-soft)" : pct > 0 ? "#dbeafe" : "#EFE7D6");
                    const pctFg = pct === null ? null : (pct >= 100 ? "var(--success)" : pct > 0 ? "var(--accent)" : "var(--text-tertiary)");
                    // 7-day sparkline (oldest → newest, ending today). Only
                    // rendered when there's actual activity to show.
                    const weekly = (meta && Array.isArray(meta.weeklyStitches)) ? meta.weeklyStitches : null;
                    const weeklyMax = weekly ? Math.max.apply(null, weekly) : 0;
                    const weeklyTotal = weekly ? weekly.reduce((a, b) => a + b, 0) : 0;
                    const SPARK_W = 56, SPARK_H = 16, BAR_W = 6, GAP = 2;
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11 }}>
                        <label
                          onClick={e => e.stopPropagation()}
                          style={{ display: "flex", alignItems: "center", gap: 4, padding: "2px 8px", border: "1px solid " + (isSel ? "#4F7D3F" : "var(--border)"), borderRadius: 12, background: isSel ? "var(--success-soft)" : "var(--surface)", color: isSel ? "var(--success)" : "var(--text-secondary)", cursor: "pointer", fontWeight: 600 }}
                          title={isSel ? "Remove from shopping list selection" : "View shopping list for this pattern"}
                        >
                          <input
                            type="checkbox"
                            checked={isSel}
                            onChange={e => {
                              e.stopPropagation();
                              togglePatternSelection(pat.id);
                              if (!isSel) {
                                // When newly selected, immediately open the shopping list modal
                                setSelectedPatternsForList(new Set([pat.id]));
                                setShoppingListModalOpen(true);
                              }
                            }}
                            style={{ margin: 0 }}
                          />
                          Shopping list
                        </label>
                        {pct !== null && (
                          <span style={{ padding: "2px 8px", borderRadius: 12, background: pctBg, color: pctFg, fontWeight: 700 }} title={completed.toLocaleString() + " of " + total.toLocaleString() + " stitches"}>{pct}% stitched</span>
                        )}
                        {weekly && weeklyTotal > 0 && (
                          <span
                            title={"Last 7 days: " + weeklyTotal.toLocaleString() + " stitches"}
                            style={{ display: "inline-flex", alignItems: "flex-end", height: SPARK_H, gap: GAP, padding: "2px 6px", borderRadius: 8, background: "#EFE7D6" }}
                          >
                            {weekly.map((v, i) => {
                              const ratio = weeklyMax > 0 ? v / weeklyMax : 0;
                              const h = Math.max(2, Math.round(ratio * SPARK_H));
                              return <span key={i} style={{ width: BAR_W, height: h, background: v > 0 ? "#B85C38" : "var(--border)", borderRadius: 1, display: "inline-block" }} />;
                            })}
                          </span>
                        )}
                        {reqThreads.length > 0 && (
                          missing.length === 0
                            ? <span style={{ padding: "2px 8px", borderRadius: 12, background: "var(--success-soft)", color: "var(--success)", fontWeight: 700 }} title="All required threads are in your stash">✓ Fully kitted</span>
                            : <span
                                onClick={e => { e.stopPropagation(); setViewingPattern(pat); setPanelOpen(true); }}
                                style={{ padding: "2px 8px", borderRadius: 12, background: "var(--warning-soft)", color: "#c2410c", fontWeight: 700, cursor: "pointer" }}
                                title={"Missing: " + missing.map(t => t.id).join(", ")}
                              >{missing.length} threads needed</span>
                        )}
                      </div>
                    );
                  }
                })}
              </div>
            )}
            {activeProject && (
              <div className="alert-card success" style={{ marginBottom: 12 }}>
                <div className="at">{Icons.dot()} Currently Tracking</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{activeProject.name || (activeProject.pattern && activeProject.pattern.length > 0 ? "Active Project" : "Unnamed Project")}</span>
                  <a href="stitch.html" style={{ color: "#065f46", fontWeight: 600, fontSize: 11 }}>Go to Tracker →</a>
                </div>
              </div>
            )}
            {/* Smart Hub: Ready to Start */}
            {readyToStart && readyToStart.length > 0 && (
              <div style={{ background: "var(--success-soft)", border: "1px solid #C4DCB6", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#4F7D3F", marginBottom: 8 }}>✓ Ready to Start</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>Patterns you can fully kit from your current stash.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflow: "auto" }}>
                  {readyToStart.map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid " + (r.pct === 100 ? "#C4DCB6" : "var(--border)") }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1B1814" }}>{r.title || "Untitled"}</div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{r.totalThreads} threads, {r.coveredThreads} covered ({r.pct}%)</div>
                      </div>
                      {r.pct === 100 ? (
                        <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: "var(--success-soft)", color: "#4F7D3F" }}>100% kitted</span>
                      ) : (
                        <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: "var(--warning-soft)", color: "var(--accent-ink)" }}>{r.pct}% — {r.missing.length} missing</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {storedProjects.length > 0 && (
              <div style={{ background: "#f8fafc", border: "1px solid var(--border)", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1B1814" }}>Saved Cross-Stitch Projects ({storedProjects.length})</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {storedProjects.map(p => {
                    const pct = p.totalStitches > 0 ? Math.round(p.completedStitches / p.totalStitches * 100) : 0;
                    const isActive = ProjectStorage.getActiveProjectId() === p.id;
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: isActive ? "var(--success-soft)" : "var(--surface)", border: `1px solid ${isActive ? "#C4DCB6" : "var(--border)"}`, borderRadius: 8, padding: "10px 14px" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1B1814", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                            {p.dimensions.width}×{p.dimensions.height} · {pct}% done · {p.source === "tracker" ? "Tracked" : "Created"} · {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 12 }}>
                          <button
                            onClick={() => { ProjectStorage.setActiveProject(p.id); window.location.href = "stitch.html?source=manager"; }}
                            style={{ padding: "5px 10px", fontSize: 12, fontWeight: 600, background: "var(--accent-ink)", color: "var(--surface)", border: "none", borderRadius: 6, cursor: "pointer" }}
                          >Track</button>
                          <button
                            onClick={async () => {
                              const activeProjectId = ProjectStorage.getActiveProjectId();
                              const wasActive = activeProjectId === p.id;
                              // Capture full project data + any linked pattern library entries
                              // so Undo can fully restore both IndexedDB and React state.
                              let fullProject = null;
                              try { fullProject = await ProjectStorage.get(p.id); } catch (err) {
                                console.error("Capture before delete failed:", err);
                                try { window.Toast && window.Toast.show && window.Toast.show({message: 'Could not capture project before delete \u2014 aborting.', type: 'error'}); } catch(_){}
                                return;
                              }
                              const removedPatterns = patterns.filter(pat => pat.linkedProjectId === p.id);
                              const projectName = p.name;
                              try {
                                await ProjectStorage.delete(p.id);
                              } catch (err) {
                                console.error("Project delete failed:", err);
                                return;
                              }
                              if (wasActive) ProjectStorage.clearActiveProject();
                              setStoredProjects(prev => prev.filter(x => x.id !== p.id));
                              setPatterns(prev => {
                                const updated = prev.filter(pat => pat.linkedProjectId !== p.id);
                                if (updated.length !== prev.length) {
                                  openManagerDB().then(db => {
                                    const tx = db.transaction(["manager_state"], "readwrite");
                                    tx.objectStore("manager_state").put(updated, "patterns");
                                  }).catch(err => console.error("Cascade pattern library cleanup failed:", err));
                                }
                                return updated;
                              });
                              if (window.Toast) {
                                window.Toast.show({
                                  message: `\"${projectName}\" deleted`,
                                  type: "info",
                                  undoAction: async () => {
                                    if (!fullProject) return;
                                    try {
                                      // Reverse the deletion-guard so the auto-save layer accepts the restore.
                                      // _deletedIds is intentionally cleared here because Undo legitimately
                                      // needs to revive a project that was deleted in this session.
                                      if (ProjectStorage._deletedIds && typeof ProjectStorage._deletedIds.delete === "function") {
                                        ProjectStorage._deletedIds.delete(fullProject.id);
                                      }
                                      await ProjectStorage.save(fullProject);
                                      const meta = await ProjectStorage.listProjects();
                                      const restored = meta.find(m => m.id === fullProject.id);
                                      if (restored) {
                                        setStoredProjects(prev => prev.some(x => x.id === restored.id) ? prev : [...prev, restored]);
                                      }
                                      if (removedPatterns.length) {
                                        setPatterns(prev => {
                                          const have = new Set(prev.map(x => x.id));
                                          const merged = prev.concat(removedPatterns.filter(x => !have.has(x.id)));
                                          openManagerDB().then(db => {
                                            const tx = db.transaction(["manager_state"], "readwrite");
                                            tx.objectStore("manager_state").put(merged, "patterns");
                                          }).catch(err => console.error("Pattern restore save failed:", err));
                                          return merged;
                                        });
                                      }
                                      if (wasActive) ProjectStorage.setActiveProject(fullProject.id);
                                    } catch (err) {
                                      console.error("Undo project delete failed:", err);
                                    }
                                  }
                                });
                              }
                            }}
                            style={{ padding: "5px 10px", fontSize: 12, background: "none", color: "#B85555", border: "1px solid var(--danger-soft)", borderRadius: 6, cursor: "pointer" }}
                          >Delete</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ padding: "12px 16px", background: selectedPatternsForList.size > 0 ? "var(--success-soft)" : "#FBF8F3", borderRadius: 8, border: selectedPatternsForList.size > 0 ? "1px solid #C4DCB6" : "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              {selectedPatternsForList.size > 0 ? (
                <div style={{ fontSize: 13, color: "#4F7D3F", fontWeight: 600 }}>{selectedPatternsForList.size} pattern(s) selected</div>
              ) : (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Select patterns with checkboxes to generate a shopping list</div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                {selectedPatternsForList.size > 0 && <button onClick={() => setSelectedPatternsForList(new Set())} style={{ padding: "6px 12px", fontSize: 12, borderRadius: 6, border: "1px solid #C4DCB6", background: "var(--surface)", cursor: "pointer", color: "#4F7D3F" }}>Clear</button>}
                <button onClick={() => { if(selectedPatternsForList.size === 0) { alert("Select at least one pattern using the checkboxes on the pattern cards."); return; } setShoppingListModalOpen(true); }} style={{ padding: "6px 12px", fontSize: 12, borderRadius: 6, border: "none", background: selectedPatternsForList.size > 0 ? "#4F7D3F" : "var(--text-tertiary)", color: "var(--surface)", cursor: "pointer", fontWeight: 600 }}>Generate Shopping List</button>
              </div>
            </div>

            {/* Detailed pattern grid removed — shopping-list checkboxes and
                missing-thread badges now live on the unified "Your Projects"
                cards above (see the cardExtras callback on ProjectLibrary).
                If no patterns exist yet, surface an empty-state nudge. */}
            {filteredPatterns.length === 0 && (
              patterns.length === 0 && patternFilter === 'all' && window.EmptyState
                ? React.createElement(window.EmptyState, {
                    icon: Icons.clipboard(),
                    title: "No patterns yet",
                    description: "Build your library by adding patterns you own, want to stitch, or have completed.",
                    ctaLabel: "Add your first pattern",
                    ctaAction: () => setEditingPattern({})
                  })
                : <div style={{ textAlign: "center", padding: "30px 20px", color: "var(--text-secondary)", fontSize: 13, background: "#fafafa", border: "1px dashed var(--border)", borderRadius: 8 }}>
                    {patterns.length === 0
                      ? 'No patterns yet. Click "+ Add Pattern" to start your library, or generate one in the Pattern Creator.'
                      : "No patterns match your filters."}
                  </div>
            )}
          </div>

          {/* Right Panel — Pattern Detail */}
          {panelOpen && <div className="rpanel-backdrop" onClick={() => setPanelOpen(false)} />}
          <div className={"mgr-rpanel" + (panelOpen ? " mgr-rpanel--open" : "")}>
            <div className="mgr-panel-handle" onClick={() => setPanelOpen(o => !o)}>
              <div className="rpanel-handle-bar" />
              <span style={{fontSize:10,color:"var(--text-tertiary)",marginTop:2}}>{viewingPattern ? "Pattern Detail" : "Pattern Detail"}</span>
            </div>
            {viewingPattern ? (() => {
              const p = viewingPattern;
              const coverage = p.threads && p.threads.length > 0
                ? Math.round(p.threads.filter(t => { const k = normaliseStashKey(t.id); return (threads[k] || {}).owned > 0; }).length / p.threads.length * 100)
                : 0;
              const missingThreads = p.threads ? p.threads.filter(t => { const k = normaliseStashKey(t.id); return !(threads[k] || {}).owned; }) : [];
              return <>
                <div className="rp-s">
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>{p.title || "Untitled"}</div>
                  {p.designer && <div style={{ fontSize: 11, color: "var(--text-tertiary)", marginBottom: 8 }}>by {p.designer}</div>}
                  {p.tags && p.tags.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                      {p.tags.map(tag => (
                        <span key={tag} style={{ fontSize: 10, padding: "2px 8px", background: "#EFE7D6", borderRadius: 10, color: "var(--text-secondary)" }}>{tag}</span>
                      ))}
                    </div>
                  )}
                  <span className={"status " + (p.status || "wishlist")} style={{ display: "inline-block" }}>
                    {statusColors[p.status] ? statusColors[p.status].label : p.status}
                  </span>
                </div>
                <div className="rp-s">
                  <div className="rp-h">Thread Coverage <span className="badge">{coverage}%</span></div>
                  <div style={{ height: 6, background: "#EFE7D6", borderRadius: 3, overflow: "hidden", border: "1px solid var(--border)", marginBottom: 8 }}>
                    <div style={{ height: "100%", width: coverage + "%", background: "#B85C38", borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{p.threads ? p.threads.filter(t => { const k = normaliseStashKey(t.id); return (threads[k] || {}).owned > 0; }).length : 0} of {p.threads ? p.threads.length : 0} threads in your stash. {missingThreads.length} missing.</div>
                </div>
                {missingThreads.length > 0 && (
                  <div className="rp-s">
                    <div className="rp-h">Missing Threads</div>
                    <div className="used-in">
                      {missingThreads.map(t => {
                        const dmc = DMC.find(x => x.id === t.id);
                        const compositeKey = normaliseStashKey(t.id);
                        return (
                          <div key={t.id} className="ui-row" style={{ cursor: "pointer" }} title={"Open thread card for DMC " + t.id}
                            onClick={() => { setTab("inventory"); setThreadFilter("all"); setBrandFilter("all"); setSearchQuery(""); setSelectedThread(compositeKey); }}>
                            <div style={{ width: 12, height: 12, borderRadius: 3, background: dmc ? `rgb(${dmc.rgb})` : "#ccc", border: "1px solid var(--border)" }} />
                            {t.id} {dmc ? dmc.name : ""} <span className="need">{t.qty ? t.qty + " sk" : ""}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="rp-s">
                  <div className="rp-h">Actions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <button className="g-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => { setEditingPattern(p); }}>{Icons.pencil()} Edit Pattern</button>
                    <button className="g-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => { setSelectedPatternsForList(new Set([p.id])); setShoppingListModalOpen(true); }}>{Icons.cart()} Shopping List</button>
                    <button className="g-btn" style={{ width: "100%", justifyContent: "center", color: "#B85555", borderColor: "var(--danger-soft)" }} onClick={() => { deletePattern(p.id); setViewingPattern(null); }}>{Icons.trash()} Delete</button>
                  </div>
                </div>
              </>;
            })() : (
              <div className="rp-s" style={{ color: "var(--text-tertiary)", textAlign: "center", padding: "40px 16px", fontSize: 13 }}>
                Click a pattern to view details
              </div>
            )}
          </div>
        </div></>
        )}
      {editingPattern && (
        <PatternModal
          pattern={editingPattern}
          onSave={(p) => { addOrUpdatePattern(p); if(viewingPattern) setViewingPattern(p); }}
          onClose={() => { setEditingPattern(null); if(viewingPattern) setViewingPattern(viewingPattern); }}
          inventoryThreads={threads}
          userProfile={userProfile}
        />
      )}
      {shoppingListModalOpen && (
        <ShoppingListModal
          patterns={patterns.filter(p => selectedPatternsForList.has(p.id))}
          inventoryThreads={threads}
          userProfile={userProfile}
          onClose={() => setShoppingListModalOpen(false)}
        />
      )}
      {profileModalOpen && (
        <UserProfileModal
          profile={userProfile}
          onSave={(p) => { setUserProfile(p); setProfileModalOpen(false); }}
          onClose={() => setProfileModalOpen(false)}
        />
      )}
      {bulkAddOpen && window.BulkAddModal && React.createElement(window.BulkAddModal, {onClose: () => setBulkAddOpen(false)})}
      {modal === "help" && <SharedModals.Help defaultTab="manager" onClose={() => setModal(null)} />}
      {modal === "shortcuts" && <SharedModals.Help defaultTab="shortcuts" onClose={() => setModal(null)} />}
      {welcomeOpen && window.WelcomeWizard && <window.WelcomeWizard page="manager" onClose={() => setWelcomeOpen(false)} />}
      {window.HelpHintBanner && <window.HelpHintBanner />}
      {modal === "about" && <SharedModals.About onClose={() => setModal(null)} />}

    </>
  );
}

function PatternModal({ pattern, onSave, onClose, inventoryThreads, userProfile }) {
  function handleTrack() {
    localStorage.setItem("crossstitch_handoff", JSON.stringify(pattern));
    window.location.href = "stitch.html?source=manager";
  }
  const [edited, setEdited] = useState({ ...pattern, threads: pattern.threads || [], fabric: pattern.fabric || "", project_overrides: pattern.project_overrides || null });
  const [threadInput, setThreadInput] = useState("");
  const [threadQty, setThreadQty] = useState(1);
  const [threadUnit, setThreadUnit] = useState("stitches");
  const [threadBrand, setThreadBrand] = useState(userProfile?.thread_brand || "DMC");
  const [isBlended, setIsBlended] = useState(false);
  const [blendColorInput, setBlendColorInput] = useState("");
  const [blendRatio, setBlendRatio] = useState("1:1");
  const [tagInput, setTagInput] = useState("");
  const [showAutocomplete, setShowAutocomplete] = useState(false);
  const [showBlendAutocomplete, setShowBlendAutocomplete] = useState(false);

  const autocompleteResults = useMemo(() => {
    if (!threadInput) return [];
    const q = threadInput.toLowerCase();
    return DMC.filter(d => d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)).slice(0, 10);
  }, [threadInput]);

  const blendAutocompleteResults = useMemo(() => {
    if (!blendColorInput) return [];
    const q = blendColorInput.toLowerCase();
    return DMC.filter(d => d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)).slice(0, 10);
  }, [blendColorInput]);

  const handleAddThread = (e) => {
    e.preventDefault();
    let match = DMC.find(d => d.id.toLowerCase() === threadInput.toLowerCase());

    if (!match && autocompleteResults.length > 0) {
      match = autocompleteResults[0];
    }

    if (match) {
      let blendMatch = null;
      if (isBlended) {
        blendMatch = DMC.find(d => d.id.toLowerCase() === blendColorInput.toLowerCase());
        if (!blendMatch && blendAutocompleteResults.length > 0) {
           blendMatch = blendAutocompleteResults[0];
        }
        if (!blendMatch) {
            alert("Invalid blend color.");
            return;
        }
      }

      // Check if duplicate entry (if we want to allow it, maybe fine, but for now we update if exists or add new)
      // Actually instructions say: "Duplicate color codes: A user might accidentally add DMC 310 twice... allow override, don't block. But entry form should warn."
      // For simplicity, we just add it to the list.
      const newThread = {
          id: match.id,
          name: match.name,
          qty: parseInt(threadQty) || 1,
          unit: threadUnit,
          brand: threadBrand,
          is_blended: isBlended,
          blend_id: blendMatch ? blendMatch.id : null,
          blend_name: blendMatch ? blendMatch.name : null,
          blend_ratio: isBlended ? blendRatio.split(':').map(Number) : null
      };

      setEdited({ ...edited, threads: [...edited.threads, newThread] });

      setThreadInput("");
      setThreadQty(1);
      setThreadUnit("stitches");
      setIsBlended(false);
      setBlendColorInput("");
      setShowAutocomplete(false);
      setShowBlendAutocomplete(false);
    }
  };

  const handleUnitToggle = (newUnit) => {
    if (newUnit !== threadUnit) {
      setThreadUnit(newUnit);
      setThreadQty(""); // clear quantity on toggle
    }
  };

  const handleAddTag = (e) => {
    if (e.key === 'Enter' && tagInput.trim()) {
      e.preventDefault();
      if (!edited.tags.includes(tagInput.trim())) {
        setEdited({ ...edited, tags: [...edited.tags, tagInput.trim()] });
      }
      setTagInput("");
    }
  };

  const removeTag = (tagToRemove) => {
    setEdited({ ...edited, tags: edited.tags.filter(t => t !== tagToRemove) });
  };

  const removeThread = (indexToRemove) => {
    setEdited({ ...edited, threads: edited.threads.filter((_, i) => i !== indexToRemove) });
  };

  const updateThreadQty = (idx, newQty) => {
    setEdited({
      ...edited,
      threads: edited.threads.map((t, i) => i === idx ? { ...t, qty: Math.max(0, newQty) } : t)
    });
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pattern-edit-title" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 id="pattern-edit-title" style={{ margin: 0, fontSize: 18 }}>{pattern.title ? "Edit Pattern" : "Add Pattern"}</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "var(--text-tertiary)" }}>×</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>Title</label>
              <input type="text" value={edited.title} onChange={e => setEdited({ ...edited, title: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13 }} placeholder="Pattern Name" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>Designer</label>
              <input type="text" value={edited.designer} onChange={e => setEdited({ ...edited, designer: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13 }} placeholder="Creator/Shop" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>Status</label>
              <select value={edited.status} onChange={e => setEdited({ ...edited, status: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
                <option value="wishlist">Wishlist</option>
                <option value="owned">Owned</option>
                <option value="inprogress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>Fabric & Dimensions</label>
              <input type="text" value={edited.fabric} onChange={e => setEdited({ ...edited, fabric: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13 }} placeholder="e.g. 14ct Aida, 100x100" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>Tags (Press Enter to add)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {edited.tags.map(tag => (
                  <span key={tag} style={{ padding: "4px 8px", background: "#EFE7D6", borderRadius: 6, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    {tag} <button onClick={() => removeTag(tag)} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
              <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleAddTag} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13 }} placeholder="Add tag..." />
            </div>
          </div>

          <div style={{ borderTop: "1px solid #EFE7D6", paddingTop: 16 }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1B1814", marginBottom: 8 }}>Thread Requirements</label>

            <form onSubmit={handleAddThread} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, background: "#f9fafb", padding: 12, borderRadius: 8, border: "1px solid var(--border)" }}>
              <div style={{ display: "flex", gap: 8, position: "relative", alignItems: "center" }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <input
                    type="text"
                    value={threadInput}
                    onChange={e => { setThreadInput(e.target.value); setShowAutocomplete(true); }}
                    onFocus={() => setShowAutocomplete(true)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13 }}
                    placeholder="Colour code or name..."
                    required
                  />
                  {showAutocomplete && autocompleteResults.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
                      {autocompleteResults.map(res => (
                        <div
                          key={res.id}
                          onClick={() => { setThreadInput(res.id); setShowAutocomplete(false); }}
                          style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #EFE7D6", display: "flex", alignItems: "center", gap: 8 }}
                        >
                          <div style={{ width: 16, height: 16, borderRadius: 4, background: `rgb(${res.rgb})`, border: "1px solid var(--border)" }} />
                          <span style={{ fontWeight: 600 }}>{res.id}</span>
                          <span style={{ color: "var(--text-secondary)" }}>{res.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <select value={threadBrand} onChange={e => setThreadBrand(e.target.value)} style={{ padding: "8px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
                  {Object.keys(BRAND_SKEIN_LENGTH).map(b => <option key={b} value={b}>{b}</option>)}
                </select>

                <input
                  type="number"
                  inputMode="numeric"
                  enterKeyHint="done"
                  min={1}
                  value={threadQty}
                  onChange={e => setThreadQty(e.target.value)}
                  style={{ width: 70, padding: "8px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13, textAlign: "center" }}
                  required
                />

                <div style={{ display: "flex", background: "#EFE7D6", borderRadius: 8, padding: 2, border: "1px solid var(--border)" }}>
                  <button type="button" onClick={() => handleUnitToggle("stitches")} style={{ padding: "6px 10px", fontSize: 12, borderRadius: 6, border: "none", background: threadUnit === "stitches" ? "var(--surface)" : "transparent", fontWeight: threadUnit === "stitches" ? 600 : 400, cursor: "pointer", boxShadow: threadUnit === "stitches" ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}>Stitches</button>
                  <button type="button" onClick={() => handleUnitToggle("skeins")} style={{ padding: "6px 10px", fontSize: 12, borderRadius: 6, border: "none", background: threadUnit === "skeins" ? "var(--surface)" : "transparent", fontWeight: threadUnit === "skeins" ? 600 : 400, cursor: "pointer", boxShadow: threadUnit === "skeins" ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}>Skeins</button>
                </div>
              </div>

              {threadQty === "" && <div style={{ fontSize: 11, color: "#A06F2D" }}>Quantity cleared — please enter the value in {threadUnit}.</div>}

              <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 4 }}>
                <label style={{ fontSize: 12, display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input type="checkbox" checked={isBlended} onChange={e => setIsBlended(e.target.checked)} />
                  Blended Thread
                </label>
              </div>

              {isBlended && (
                <div style={{ display: "flex", gap: 8, position: "relative", alignItems: "center", paddingLeft: 20 }}>
                  <div style={{ flex: 1, position: "relative" }}>
                    <input
                      type="text"
                      value={blendColorInput}
                      onChange={e => { setBlendColorInput(e.target.value); setShowBlendAutocomplete(true); }}
                      onFocus={() => setShowBlendAutocomplete(true)}
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13 }}
                      placeholder="Second color code..."
                      required
                    />
                    {showBlendAutocomplete && blendAutocompleteResults.length > 0 && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
                        {blendAutocompleteResults.map(res => (
                          <div
                            key={res.id}
                            onClick={() => { setBlendColorInput(res.id); setShowBlendAutocomplete(false); }}
                            style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #EFE7D6", display: "flex", alignItems: "center", gap: 8 }}
                          >
                            <div style={{ width: 16, height: 16, borderRadius: 4, background: `rgb(${res.rgb})`, border: "1px solid var(--border)" }} />
                            <span style={{ fontWeight: 600 }}>{res.id}</span>
                            <span style={{ color: "var(--text-secondary)" }}>{res.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <select value={blendRatio} onChange={e => setBlendRatio(e.target.value)} style={{ padding: "8px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
                     <option value="1:1">1:1 Ratio</option>
                     <option value="2:1">2:1 Ratio</option>
                     <option value="1:2">1:2 Ratio</option>
                     <option value="3:1">3:1 Ratio</option>
                     <option value="1:3">1:3 Ratio</option>
                  </select>
                </div>
              )}

              <button type="submit" style={{ padding: "8px 16px", background: "#B85C38", color: "var(--surface)", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, alignSelf: "flex-end", marginTop: 4 }}>Add Thread</button>
            </form>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 250, overflowY: "auto" }}>
              {edited.threads.map((t, idx) => {
                const info = findThreadInCatalog('dmc', t.id);
                // Backward compatibility for old format
                const unit = t.unit || "skeins";
                const displayUnit = unit === "stitches" ? "st" : "sk";

                return (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#FBF8F3", borderRadius: 8, border: "1px solid var(--border)" }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: info ? `rgb(${info.rgb})` : "#ccc", border: "1px solid var(--border)" }} />
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{t.id}</div>
                    <div style={{ flex: 1, fontSize: 12, color: "var(--text-secondary)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                       {t.is_blended ? `${t.name || info?.name || ""} + ${t.blend_name || t.blend_id} [${t.blend_ratio ? t.blend_ratio.join(':') : '1:1'}]` : (t.name || info?.name || "")}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={t.qty}
                        onChange={e => updateThreadQty(idx, parseInt(e.target.value))}
                        style={{ width: 50, padding: "4px", borderRadius: 4, border: "1px solid var(--border)", fontSize: 12, textAlign: "center" }}
                      />
                      <span style={{ fontSize: 11, color: "var(--text-tertiary)", width: 16 }}>{displayUnit}</span>
                    </div>

                    <button onClick={() => removeThread(idx)} style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "4px" }}>×</button>
                  </div>
                );
              })}
              {edited.threads.length === 0 && (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", padding: "10px 0" }}>No threads added yet.</div>
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 10, background: "#FBF8F3", borderRadius: "0 0 8px 8px" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
          <button onClick={handleTrack} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent-ink)", color: "var(--surface)", cursor: "pointer", fontWeight: 600 }}>Start Tracking →</button>
          <button onClick={() => onSave(edited)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#B85C38", color: "var(--surface)", cursor: "pointer", fontWeight: 600 }}>Save Pattern</button>
        </div>
      </div>
    </div>
  );
}

function PatternDetailsModal({ pattern, onClose, onEdit, inventoryThreads, userProfile }) {
  const statusColors = {
    wishlist: { bg: "var(--warning-soft)", text: "var(--accent-ink)", label: "Wishlist" },
    owned: { bg: "#e0e7ff", text: "#4338ca", label: "Owned" },
    inprogress: { bg: "var(--warning-soft)", text: "#c2410c", label: "In Progress" },
    completed: { bg: "#dcfce3", text: "var(--success)", label: "Completed" }
  };

  const derivedThreads = useMemo(() => {
    if (!pattern.threads) return [];

    // Default fallback settings
    const settings = {
        fabricCount: pattern.project_overrides?.fabric_count || userProfile?.fabric_count || 14,
        strandsUsed: pattern.project_overrides?.strands_used || userProfile?.strands_used || 2,
        threadBrand: pattern.project_overrides?.thread_brand || userProfile?.thread_brand || "DMC",
        wasteFactor: pattern.project_overrides?.waste_factor || userProfile?.waste_factor || 0.20
    };

    return pattern.threads.map(t => {
       const info = findThreadInCatalog('dmc', t.id);
       let skExact = 0;
       let skToBuy = 0;
       let skBExact = 0;
       let skBToBuy = 0;
       let isApprox = false;
       let stApprox = 0;

       if (t.unit === "stitches") {
           const res = stitchesToSkeins({
               stitchCount: t.qty,
               fabricCount: settings.fabricCount,
               strandsUsed: settings.strandsUsed,
               skeinLengthM: BRAND_SKEIN_LENGTH[t.brand || settings.threadBrand] || 8.0,
               wasteFactor: settings.wasteFactor,
               isBlended: t.is_blended,
               blendRatio: t.blend_ratio
           });

           if (!t.is_blended) {
               skExact = res.skeinsExact;
               skToBuy = res.skeinsToBuy;
           } else {
               skExact = res.colorA.skeinsExact;
               skToBuy = res.colorA.skeinsToBuy;
               skBExact = res.colorB.skeinsExact;
               skBToBuy = res.colorB.skeinsToBuy;
           }
       } else if (t.unit === "skeins" && !t.is_blended) {
           skToBuy = t.qty;
           skExact = t.qty;
           const res = skeinsToStitches({
               skeinCount: t.qty,
               fabricCount: settings.fabricCount,
               strandsUsed: settings.strandsUsed,
               skeinLengthM: BRAND_SKEIN_LENGTH[t.brand || settings.threadBrand] || 8.0,
               wasteFactor: settings.wasteFactor
           });
           stApprox = res.stitchesApprox;
           isApprox = res.isApproximate;
       } else if (t.unit === "skeins" && t.is_blended) {
           skToBuy = t.qty;
           skExact = t.qty;
       } else {
           // Fallback for older projects that had no unit but were implicit skeins
           skToBuy = t.qty;
           skExact = t.qty;
       }

       return {
           ...t,
           name: t.name || info?.name || "Unknown",
           rgb: info ? info.rgb : [128,128,128],
           skExact,
           skToBuy,
           skBExact,
           skBToBuy,
           isApprox,
           stApprox,
           settings
       };
    });
  }, [pattern.threads, pattern.project_overrides, userProfile]);

  const missingThreadsCount = useMemo(() => {
    if (!derivedThreads) return 0;
    let missingCount = 0;

    // We only accurately check non-blended ones for simple missing display, or check both sides
    const requiredColors = {};
    derivedThreads.forEach(t => {
        if (!requiredColors[t.id]) requiredColors[t.id] = 0;
        requiredColors[t.id] += t.skToBuy;
        if (t.is_blended && t.blend_id) {
             if (!requiredColors[t.blend_id]) requiredColors[t.blend_id] = 0;
             requiredColors[t.blend_id] += t.skBToBuy;
        }
    });

    Object.entries(requiredColors).forEach(([id, qty]) => {
         const invState = inventoryThreads[id] || { owned: 0 };
         if (invState.owned < qty) {
             missingCount++;
         }
    });

    return missingCount;
  }, [derivedThreads, inventoryThreads]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pattern-detail-title" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 id="pattern-detail-title" style={{ margin: 0, fontSize: 20, marginBottom: 4 }}>{pattern.title || "Untitled"}</h2>
            {pattern.designer && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>by {pattern.designer}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "var(--text-tertiary)" }}>×</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: statusColors[pattern.status].bg, color: statusColors[pattern.status].text }}>
              {statusColors[pattern.status].label}
            </span>
            {pattern.fabric && <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>• {pattern.fabric}</span>}
          </div>

          {pattern.tags && pattern.tags.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {pattern.tags.map(tag => (
                <span key={tag} style={{ padding: "2px 6px", background: "#EFE7D6", color: "var(--text-secondary)", borderRadius: 4, fontSize: 11 }}>{tag}</span>
              ))}
            </div>
          )}

          <div style={{ borderTop: "1px solid #EFE7D6", paddingTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1B1814" }}>Thread Requirements ({pattern.threads ? pattern.threads.length : 0})</label>
              {missingThreadsCount > 0 ? (
                <span style={{ fontSize: 12, color: "#B85555", fontWeight: 600, background: "var(--danger-soft)", padding: "4px 8px", borderRadius: 6, border: "1px solid var(--danger-soft)" }}>Missing {missingThreadsCount} threads</span>
              ) : (
                <span style={{ fontSize: 12, color: "#4F7D3F", fontWeight: 600, background: "var(--success-soft)", padding: "4px 8px", borderRadius: 6, border: "1px solid #C4DCB6" }}>Have all threads</span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {derivedThreads.length === 0 ? (
                <div style={{ fontSize: 12, color: "var(--text-tertiary)", textAlign: "center", padding: "10px 0" }}>No threads specified.</div>
              ) : (
                derivedThreads.map((t, idx) => {
                  let text = "";
                  let subtext = "";

                  if (t.is_blended) {
                      const rA = t.blend_ratio ? t.blend_ratio[0] : 1;
                      const rB = t.blend_ratio ? t.blend_ratio[1] : 1;
                      text = `DMC ${t.id} + DMC ${t.blend_id} [${rA}:${rB}] — ${t.unit === "stitches" ? t.qty + " stitches" : t.qty + " skeins"}`;
                      if (t.unit === "stitches") {
                          if (rA === rB) {
                              subtext = `~${t.skToBuy} skein(s) each`;
                          } else {
                              subtext = `→ DMC ${t.id}: ~${t.skToBuy} skeins · DMC ${t.blend_id}: ~${t.skBToBuy} skeins`;
                          }
                      } else {
                          subtext = `Stitch estimate not available for blended entries stored as skeins.`;
                      }
                  } else {
                      if (t.unit === "stitches") {
                          text = `DMC ${t.id} (${t.name}) — ${t.qty.toLocaleString()} stitches (~${t.skToBuy} skeins)`;
                      } else {
                          // Is skeins or fallback
                          if (t.unit === "skeins" && t.isApprox) {
                              text = `DMC ${t.id} (${t.name}) — ${t.qty} skein(s) (~${t.stApprox.toLocaleString()} stitches)`;
                          } else {
                              text = `DMC ${t.id} (${t.name}) — ${t.qty} skein(s)`;
                          }
                      }
                  }

                  const settingsUsed = t.settings;
                  const isOverride = !!pattern.project_overrides;
                  const settingsBadge = `Based on: ${settingsUsed.fabricCount}ct · ${settingsUsed.strandsUsed} strands · ${settingsUsed.threadBrand} · ${Math.round(settingsUsed.wasteFactor * 100)}% waste ${isOverride ? "(project settings)" : ""}`;

                  return (
                    <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 16px", background: "#FBF8F3", borderRadius: 8, border: "1px solid var(--border)" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ display: "flex", gap: -4 }}>
                               <div style={{ width: 16, height: 16, borderRadius: 4, background: `rgb(${t.rgb})`, border: "1px solid var(--border)", position: "relative", zIndex: 2 }} />
                               {t.is_blended && <div style={{ width: 16, height: 16, borderRadius: 4, background: "#ccc", border: "1px solid var(--border)", position: "relative", zIndex: 1, marginLeft: -6 }} />}
                            </div>
                            <div style={{ flex: 1, fontSize: 13, color: "#1B1814", fontWeight: 500 }}>
                                {text}
                            </div>
                        </div>
                        {subtext && <div style={{ fontSize: 12, color: "var(--text-secondary)", paddingLeft: 28 }}>{subtext}</div>}
                        <div style={{ fontSize: 10, color: "var(--text-tertiary)", paddingLeft: 28, marginTop: 2 }}>{settingsBadge}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", gap: 10, background: "#FBF8F3", borderRadius: "0 0 8px 8px" }}>
          <button onClick={onEdit} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontWeight: 600 }}>Edit Pattern</button>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#1B1814", color: "var(--surface)", cursor: "pointer", fontWeight: 600 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

function UserProfileModal({ profile, onSave, onClose }) {
  const [edited, setEdited] = useState({ ...profile });

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="user-profile-title" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 id="user-profile-title" style={{ margin: 0, fontSize: 18 }}>Default Thread Settings</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "var(--text-tertiary)" }}>×</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 13, color: "var(--text-secondary)", marginBottom: 8 }}>
            These settings are used to estimate the number of skeins required for your patterns based on stitch counts. You can override these for individual projects.
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>Fabric Count</label>
            <select value={edited.fabric_count} onChange={e => setEdited({ ...edited, fabric_count: parseInt(e.target.value) })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
               {[11, 14, 16, 18, 20, 22, 25, 28, 32].map(ct => <option key={ct} value={ct}>{ct} count</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>Strands Used</label>
            <select value={edited.strands_used} onChange={e => setEdited({ ...edited, strands_used: parseInt(e.target.value) })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
               {[1, 2, 3, 4, 5, 6].map(st => <option key={st} value={st}>{st} strand{st > 1 ? "s" : ""}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>Preferred Thread Brand</label>
            <select value={edited.thread_brand} onChange={e => setEdited({ ...edited, thread_brand: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
                {Object.keys(BRAND_SKEIN_LENGTH).map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>Waste Factor</label>
            <select value={edited.waste_factor} onChange={e => setEdited({ ...edited, waste_factor: parseFloat(e.target.value) })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13, background: "var(--surface)" }}>
               <option value={0.10}>Low (10% - Efficient stitching, few mistakes)</option>
               <option value={0.20}>Average (20% - Normal amount of travelling/mistakes)</option>
               <option value={0.30}>High (30% - Lots of confetti stitches/parking)</option>
            </select>
          </div>
        </div>

        <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "flex-end", gap: 10, background: "#FBF8F3", borderRadius: "0 0 8px 8px" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
          <button onClick={() => onSave(edited)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#B85C38", color: "var(--surface)", cursor: "pointer", fontWeight: 600 }}>Save Settings</button>
        </div>
      </div>
    </div>
  );
}

function ShoppingListModal({ patterns, inventoryThreads, userProfile, onClose }) {
  const [copied, setCopied] = useState(false);
  const [sort, setSort] = useState('number');

  const allThreads = useMemo(() => {
    const required = {};
    const addRequired = (id, qty) => {
      if (!id) return;
      const n = Number(qty) || 0;
      if (!required[id]) required[id] = 0;
      required[id] += n;
    };
    patterns.forEach(p => {
      if (!p.threads) return;
      const settings = {
        fabricCount: p.project_overrides?.fabric_count || userProfile?.fabric_count || 14,
        strandsUsed: p.project_overrides?.strands_used || userProfile?.strands_used || 2,
        threadBrand: p.project_overrides?.thread_brand || userProfile?.thread_brand || "DMC",
        wasteFactor: p.project_overrides?.waste_factor || userProfile?.waste_factor || 0.20
      };
      p.threads.forEach(t => {
        const blendParts = typeof t.id === "string" && t.id.includes("+")
          ? splitBlendId(t.id)
          : null;
        const isBlend = !!t.is_blended || (blendParts && blendParts.length === 2);
        let qtyA = 0, qtyB = 0;
        if (t.unit === "stitches") {
          const res = stitchesToSkeins({
            stitchCount: t.qty, fabricCount: settings.fabricCount,
            strandsUsed: settings.strandsUsed,
            skeinLengthM: BRAND_SKEIN_LENGTH[t.brand || settings.threadBrand] || 8.0,
            wasteFactor: settings.wasteFactor, isBlended: isBlend, blendRatio: t.blend_ratio
          });
          if (isBlend) {
            qtyA = (res.colorA && res.colorA.skeinsToBuy) || 0;
            qtyB = (res.colorB && res.colorB.skeinsToBuy) || 0;
          }
          else { qtyA = res.skeinsToBuy; }
        } else if (isBlend) {
          qtyA = (Number(t.qty) || 0) / 2;
          qtyB = (Number(t.qty) || 0) / 2;
        } else { qtyA = t.qty; }
        if (isBlend) {
          const idA = blendParts ? blendParts[0] : t.id;
          const idB = blendParts ? blendParts[1] : t.blend_id;
          addRequired(idA, qtyA);
          addRequired(idB, qtyB);
        } else {
          addRequired(t.id, qtyA);
        }
      });
    });
    return Object.entries(required).map(([id, totalNeeded]) => {
      const k = normaliseStashKey(id);
      const invState = inventoryThreads[k] || inventoryThreads[id] || { owned: 0 };
      const owned = invState.owned || 0;
      const info = findThreadInCatalog('dmc', id);
      const status = owned >= totalNeeded ? 'owned' : owned > 0 ? 'partial' : 'needed';
      return { id, name: info ? info.name : "", rgb: info ? info.rgb : [128,128,128],
               needed: totalNeeded, owned, status, missing: Math.max(0, totalNeeded - owned) };
    });
  }, [patterns, inventoryThreads, userProfile]);

  const sortedThreads = useMemo(() => {
    const copy = allThreads.slice();
    const compareThreadIds = (a, b) => {
      const aId = String(a.id);
      const bId = String(b.id);
      const aIsNumeric = /^\d+$/.test(aId);
      const bIsNumeric = /^\d+$/.test(bId);
      if (aIsNumeric && bIsNumeric) {
        const diff = Number(aId) - Number(bId);
        return diff || aId.localeCompare(bId, undefined, { numeric: true, sensitivity: 'base' });
      }
      if (aIsNumeric !== bIsNumeric) return aIsNumeric ? -1 : 1;
      return aId.localeCompare(bId, undefined, { numeric: true, sensitivity: 'base' });
    };
    if (sort === 'number') copy.sort(compareThreadIds);
    else if (sort === 'skeins') copy.sort((a, b) => b.needed - a.needed);
    else if (sort === 'status') {
      const o = { needed: 0, partial: 1, owned: 2 };
      copy.sort((a, b) => o[a.status] - o[b.status]);
    }
    return copy;
  }, [allThreads, sort]);

  const totalColours = allThreads.length;
  const ownedColours = allThreads.filter(t => t.status === 'owned').length;
  const partialColours = allThreads.filter(t => t.status === 'partial').length;
  const totalMissingColours = allThreads.filter(t => t.status !== 'owned').length;
  const totalMissingSkeins = allThreads.reduce((acc, t) => acc + t.missing, 0);

  const copyList = () => {
    const header = `Shopping List — ${patterns.map(p => p.title).join(', ')}\n`;
    const lines = sortedThreads.map(t => {
      const own = t.owned > 0 ? ` (own ${t.owned})` : '';
      const mark = t.status === 'owned' ? '\u2713' : t.status === 'partial' ? '~' : '\u25cb';
      return `${mark} DMC ${t.id} ${t.name} \u2014 need ${t.needed} skein${t.needed !== 1 ? 's' : ''}${own}`;
    });
    const footer = `\nTotal: ${ownedColours}/${totalColours} colours in stash`;
    const text = header + lines.join('\n') + footer;
    const onCopySuccess = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(onCopySuccess).catch(() => {});
      return;
    }
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      const copiedOk = document.execCommand && document.execCommand('copy');
      document.body.removeChild(textarea);
      if (copiedOk) onCopySuccess();
    } catch (_) {}
  };

  const handleShare = () => {
    if (!navigator.share) return;
    const missingOnly = sortedThreads.filter(t => t.status !== 'owned');
    const text = `Shopping List\n` + missingOnly.map(t => {
      const own = t.owned > 0 ? ` (own ${t.owned})` : '';
      return `DMC ${t.id} ${t.name} \u2014 ${t.missing} skein${t.missing !== 1 ? 's' : ''}${own}`;
    }).join('\n');
    navigator.share({ title: 'Cross Stitch Shopping List', text }).catch(() => {});
  };

  const statusBadge = (status, owned, needed) => {
    if (status === 'owned') return <span style={{ fontSize: 10, fontWeight: 600, color: '#4F7D3F', background: 'var(--success-soft)', padding: '2px 7px', borderRadius: 10 }}>In stash</span>;
    if (status === 'partial') return <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent-ink)', background: 'var(--warning-soft)', padding: '2px 7px', borderRadius: 10 }}>Partial ({owned}/{needed})</span>;
    return <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--danger)', background: 'var(--danger-soft)', padding: '2px 7px', borderRadius: 10 }}>Need to buy</span>;
  };

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="shopping-list-title" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 540, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 id="shopping-list-title" style={{ margin: 0, fontSize: 18 }}>Shopping List</h2>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "var(--text-tertiary)" }}>×</button>
        </div>
        <div style={{ padding: "10px 20px", background: ownedColours === totalColours ? "var(--success-soft)" : "var(--warning-soft)", borderBottom: "1px solid var(--border)", fontSize: 12, display: "flex", flexWrap: "wrap", gap: 10, alignItems: "center" }}>
          <span style={{ fontWeight: 600, color: ownedColours === totalColours ? "#4F7D3F" : "var(--accent-ink)" }}>
            {ownedColours === totalColours
              ? `\u2713 You have all ${totalColours} colours!`
              : `You own ${ownedColours} of ${totalColours} colours.`}
          </span>
          {partialColours > 0 && <span style={{ color: "var(--accent-ink)" }}>{partialColours} partial.</span>}
          {totalMissingColours > 0 && <span style={{ color: "var(--danger)" }}>Still need: {totalMissingColours} colours, ~{totalMissingSkeins} skeins.</span>}
        </div>
        <div style={{ padding: "8px 20px", borderBottom: "1px solid #EFE7D6", display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
          <span style={{ color: "var(--text-secondary)" }}>Sort:</span>
          {[['number','Thread #'],['skeins','Skeins'],['status','Status']].map(([id, label]) => (
            <button key={id} onClick={() => setSort(id)} style={{
              padding: "3px 10px", borderRadius: 6, cursor: "pointer", fontSize: 11,
              border: "0.5px solid " + (sort === id ? "#B85C38" : "var(--border)"),
              background: sort === id ? "#F4DDCF" : "var(--surface)",
              color: sort === id ? "#B85C38" : "var(--text-secondary)", fontWeight: sort === id ? 600 : 400
            }}>{label}</button>
          ))}
        </div>
        <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>
          {allThreads.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", color: "var(--text-tertiary)" }}>No threads in selected patterns.</div>
          ) : ownedColours === totalColours ? (
            <div style={{ padding: 30, textAlign: "center", background: "var(--success-soft)", border: "1px solid #C4DCB6", borderRadius: 8, color: "#4F7D3F", fontWeight: 600 }}>
              You have all the required threads!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sortedThreads.map(t => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: t.status === 'owned' ? "var(--success-soft)" : "#FBF8F3", borderRadius: 8, border: "1px solid " + (t.status === 'owned' ? "#C4DCB6" : "var(--border)") }}>
                  <div style={{ width: 18, height: 18, borderRadius: 4, background: `rgb(${t.rgb})`, border: "1px solid var(--border)", flexShrink: 0 }} />
                  <div style={{ width: 38, fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{t.id}</div>
                  <div style={{ flex: 1, fontSize: 12, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.name}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#1B1814", flexShrink: 0 }}>{t.needed} sk</div>
                  {statusBadge(t.status, t.owned, t.needed)}
                </div>
              ))}
            </div>
          )}
        </div>
        <div style={{ padding: "14px 20px", borderTop: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#FBF8F3", borderRadius: "0 0 8px 8px", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 12, color: "#4F7D3F", fontWeight: 600, opacity: copied ? 1 : 0, transition: "opacity 0.2s" }}>Copied!</span>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button onClick={onClose} style={{ padding: "7px 14px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Close</button>
            {typeof navigator !== 'undefined' && navigator.share && totalMissingColours > 0 && (
              <button onClick={handleShare} style={{ padding: "7px 14px", borderRadius: 8, border: "0.5px solid var(--border)", background: "var(--surface)", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>Share</button>
            )}
            {allThreads.length > 0 && (
              <button onClick={copyList} style={{ padding: "7px 14px", borderRadius: 8, border: "none", background: "#B85C38", color: "var(--surface)", cursor: "pointer", fontWeight: 600, fontSize: 13 }}>{copied ? "\u2713 Copied" : "Copy List"}</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
ReactDOM.createRoot(document.getElementById("root")).render(<ManagerApp />);
