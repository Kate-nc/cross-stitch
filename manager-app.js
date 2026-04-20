const { useState, useEffect, useMemo, useCallback } = React;

function PartialGauge({ status }) {
  const segments = {
    "null": { count: 0, color: "#e2e8f0", text: "No partial", textColor: "#94a3b8" },
    "mostly-full": { count: 3, color: "#378ADD", text: "Mostly full", textColor: "#378ADD" },
    "about-half": { count: 2, color: "#378ADD", text: "About half", textColor: "#378ADD" },
    "remnant": { count: 1, color: "#EF9F27", text: "Remnant", textColor: "#EF9F27" },
    "used-up": { count: 4, color: "#888780", text: "Used up", textColor: "#888780" }
  };

  const current = segments[status || "null"];

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ display: "flex", gap: 2, width: 52 }}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{
            flex: 1,
            height: 4,
            borderRadius: 2,
            background: i < current.count ? current.color : "#e2e8f0"
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
  const [patternFilter, setPatternFilter] = useState("all"); // 'all', 'wishlist', 'owned', 'inprogress', 'completed'
  const [patternSort, setPatternSort] = useState("date_desc"); // 'date_desc', 'date_asc', 'title_asc', 'designer_asc', 'status'
  const [editingPattern, setEditingPattern] = useState(null); // Pattern object currently being added/edited
  const [viewingPattern, setViewingPattern] = useState(null); // Pattern object currently being viewed for details
  const [selectedPatternsForList, setSelectedPatternsForList] = useState(new Set());
  const [shoppingListModalOpen, setShoppingListModalOpen] = useState(false);
  const [expandedThread, setExpandedThread] = useState(null);
  const [selectedThread, setSelectedThread] = useState(null);
  const [conflicts, setConflicts] = useState(null);
  const [readyToStart, setReadyToStart] = useState(null);
  const [lowStockAlerts, setLowStockAlerts] = useState(null);
  const [userProfile, setUserProfile] = useState({
    fabric_count: 14,
    strands_used: 2,
    thread_brand: "DMC",
    waste_factor: 0.20
  });
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [bulkAddOpen, setBulkAddOpen] = useState(false);
  const [backupStatus, setBackupStatus] = useState(null); // { type: 'success'|'error'|'confirm', message, summary?, onConfirm? }
  const lowStockThreshold = 1;

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
              finalThreads['dmc:' + d.id] = { owned: 0, tobuy: false, partialStatus: null, min_stock: 0 };
          });
          if (typeof ANCHOR !== 'undefined') {
            ANCHOR.forEach(a => {
              finalThreads['anchor:' + a.id] = { owned: 0, tobuy: false, partialStatus: null, min_stock: 0 };
            });
          }
          store.put(finalThreads, "threads");
          store.put(4, "stashDataVersion");
        }

        // v3 → v4: convert bare DMC keys to composite keys and add Anchor threads
        if (threadsData && versionData === 3) {
          const migrated = {};
          for (const [key, val] of Object.entries(finalThreads)) {
            migrated[key.indexOf(':') < 0 ? 'dmc:' + key : key] = val;
          }
          if (typeof ANCHOR !== 'undefined') {
            ANCHOR.forEach(a => {
              const aKey = 'anchor:' + a.id;
              if (!migrated[aKey]) migrated[aKey] = { owned: 0, tobuy: false, partialStatus: null, min_stock: 0 };
            });
          }
          finalThreads = migrated;
          store.put(finalThreads, "threads");
          store.put(4, "stashDataVersion");
        }

        setThreads(finalThreads);
        if (patternsData) setPatterns(patternsData);
      } catch (err) {
        console.error("Failed to load manager data:", err);
      }
    };

    // Load Active Tracker Project (using helpers.js loadProjectFromDB which targets CrossStitchDB -> projects -> auto_save)
    const loadActiveProject = async () => {
      try {
        const proj = await loadProjectFromDB();
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
      ProjectStorage.getStorageEstimate().then(setStorageUsage).catch(() => {});
    });
    loadActiveProject();
    ProjectStorage.listProjects().then(setStoredProjects).catch(err => console.error("Failed to list projects:", err));
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

  // Smart Stash Hub: refresh conflicts, ready-to-start, and low-stock alerts
  useEffect(() => {
    if (typeof StashBridge === "undefined") return;
    StashBridge.detectConflicts().then(setConflicts).catch(() => {});
    StashBridge.whatCanIStart().then(setReadyToStart).catch(() => {});
    // Low-stock: threads where owned > 0 but below min_stock
    const alerts = [];
    for (const [id, t] of Object.entries(threads)) {
      const minStock = t.min_stock || 0;
      if (minStock > 0 && t.owned < minStock) {
        const info = DMC.find(d => d.id === id);
        alerts.push({ id, name: info ? info.name : id, rgb: info ? info.rgb : [128,128,128], owned: t.owned, min_stock: minStock });
      }
    }
    alerts.sort((a, b) => (a.min_stock - a.owned) - (b.min_stock - b.owned));
    setLowStockAlerts(alerts);
  }, [threads, patterns]);

  // Split low-stock alerts into those needed by active projects vs. not
  const { lowStockNeeded, lowStockNotNeeded } = useMemo(() => {
    if (!lowStockAlerts) return { lowStockNeeded: null, lowStockNotNeeded: null };
    const activeIds = new Set();
    patterns.forEach(pat => {
      if (pat.status === 'completed') return;
      if (pat.threads) pat.threads.forEach(t => activeIds.add(t.id));
    });
    return {
      lowStockNeeded: lowStockAlerts.filter(a => activeIds.has(a.id)),
      lowStockNotNeeded: lowStockAlerts.filter(a => !activeIds.has(a.id)),
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
        const backup = JSON.parse(reader.result);
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
    const dmcItems = DMC.map(d => ({ ...d, brand: 'dmc', compositeKey: 'dmc:' + d.id }));
    const anchorItems = typeof ANCHOR !== 'undefined' ? ANCHOR.map(a => ({ ...a, brand: 'anchor', compositeKey: 'anchor:' + a.id })) : [];
    const allItems = brandFilter === 'dmc' ? dmcItems
      : brandFilter === 'anchor' ? anchorItems
      : [...dmcItems, ...anchorItems];

    const q = searchQuery.toLowerCase();
    const searched = q ? allItems.filter(d => d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)) : allItems;

    return searched.filter(d => {
      if (d.compositeKey === expandedThread) return true;

      const t = threads[d.compositeKey] || { owned: 0, tobuy: false, partialStatus: null };
      if (threadFilter === 'owned') return t.owned > 0 || ["mostly-full", "about-half", "remnant"].includes(t.partialStatus);
      if (threadFilter === 'tobuy') return t.tobuy;
      if (threadFilter === 'lowstock') return (t.owned > 0 && t.owned <= lowStockThreshold) || (t.owned === 0 && ["about-half", "remnant"].includes(t.partialStatus));
      if (threadFilter === 'remnants') return t.partialStatus === "remnant";
      if (threadFilter === 'usedup') return t.partialStatus === "used-up" && t.owned === 0;
      return true;
    });
  }, [searchQuery, threads, threadFilter, brandFilter, expandedThread]);

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
    const statusOrder = { wishlist: 0, owned: 1, inprogress: 2, completed: 3 };

    let result = patterns.filter(p => {
      const q = searchQuery.toLowerCase();
      const matchesSearch = p.title.toLowerCase().includes(q) ||
                            (p.designer && p.designer.toLowerCase().includes(q)) ||
                            (p.tags && p.tags.some(tag => tag.toLowerCase().includes(q)));

      const matchesFilter = patternFilter === "all" || p.status === patternFilter;

      return matchesSearch && matchesFilter;
    });

    result.sort((a, b) => {
      if (patternSort === "date_desc") return (b.id || 0) - (a.id || 0); // Using ID as timestamp
      if (patternSort === "date_asc") return (a.id || 0) - (b.id || 0);
      if (patternSort === "title_asc") return (a.title || "").localeCompare(b.title || "");
      if (patternSort === "designer_asc") return (a.designer || "").localeCompare(b.designer || "");
      if (patternSort === "status") {
        if (statusOrder[a.status] !== statusOrder[b.status]) {
            return statusOrder[a.status] - statusOrder[b.status];
        }
        return (a.title || "").localeCompare(b.title || "");
      }
      return 0;
    });

    return result;
  }, [patterns, searchQuery, patternFilter, patternSort]);

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
    if (confirm("Are you sure you want to delete this pattern?")) {
      setPatterns(prev => prev.filter(p => p.id !== id));
      if (viewingPattern && viewingPattern.id === id) {
          setViewingPattern(null);
      }
    }
  };

  const togglePatternSelection = (id) => {
    const next = new Set(selectedPatternsForList);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedPatternsForList(next);
  };

  const statusColors = {
    wishlist: { bg: "#fef3c7", text: "#b45309", label: "Wishlist" },
    owned: { bg: "#e0e7ff", text: "#4338ca", label: "Owned" },
    inprogress: { bg: "#ffedd5", text: "#c2410c", label: "In Progress" },
    completed: { bg: "#dcfce3", text: "#15803d", label: "Completed" }
  };

  return (
    <>
      <Header page="manager" setModal={setModal} onBackupDownload={handleBackupDownload} onRestoreFile={handleRestoreFile} storageUsage={storageUsage} />
      {backupStatus && (
        <div style={{ padding: "8px 20px 0" }}>
          <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 12, background: backupStatus.type === "error" ? "#fef2f2" : backupStatus.type === "confirm" ? "#fffbeb" : "#f0fdf4", border: `1px solid ${backupStatus.type === "error" ? "#fecaca" : backupStatus.type === "confirm" ? "#fde68a" : "#bbf7d0"}`, color: backupStatus.type === "error" ? "#dc2626" : backupStatus.type === "confirm" ? "#92400e" : "#15803d" }}>
            <div>{backupStatus.message}</div>
            {backupStatus.summary && (
              <div style={{ fontSize: 11, marginTop: 4, color: "#475569" }}>
                {backupStatus.summary.projectCount} projects, {backupStatus.summary.threadCount} owned threads, {backupStatus.summary.patternCount} patterns
              </div>
            )}
            {backupStatus.type === "confirm" && (
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button onClick={backupStatus.onConfirm} style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, background: "#ea580c", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>Yes, Restore</button>
                <button onClick={() => setBackupStatus(null)} style={{ padding: "5px 12px", fontSize: 12, fontWeight: 600, background: "#fff", color: "#3f3f46", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer" }}>Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Sub-tab bar */}
      <div className="mgr-tab-bar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex" }}>
          <button className={"mgr-tab" + (tab === "inventory" ? " on" : "")} onClick={() => { setTab("inventory"); setSearchQuery(""); setSelectedThread(null); }}>
            <span className="icon">{Icons.thread()}</span> Thread Inventory <span className="cnt">{totalOwnedCount}</span>
          </button>
          <button className={"mgr-tab" + (tab === "patterns" ? " on" : "")} onClick={() => { setTab("patterns"); setSearchQuery(""); setSelectedThread(null); }}>
            <span className="icon">{Icons.clipboard()}</span> Pattern Library <span className="cnt">{patterns.length}</span>
          </button>
        </div>
        <button
          onClick={() => { window.location.href = "index.html?mode=showcase"; }}
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
          <span style={{marginLeft:4,marginRight:2,color:'#94a3b8',fontSize:11}}>Brand:</span>
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
              style={{marginLeft:'auto',padding:'5px 12px',fontSize:12,fontWeight:600,background:'#eff6ff',color:'#1d4ed8',border:'1px solid #bfdbfe',borderRadius:6,cursor:'pointer',whiteSpace:'nowrap'}}
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
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>These threads are needed by multiple patterns but you don't have enough.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 200, overflow: "auto" }}>
                  {conflicts.map(c => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: "#fff", border: "1px solid #fecaca" }}>
                      <span style={{ width: 14, height: 14, borderRadius: 3, background: `rgb(${c.rgb[0]},${c.rgb[1]},${c.rgb[2]})`, border: "1px solid #cbd5e1", flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, fontSize: 12 }}>DMC {c.id}</span>
                      <span style={{ fontSize: 11, color: "#475569", flex: 1 }}>{c.name}</span>
                      <span style={{ fontSize: 11, color: "#dc2626", fontWeight: 600 }}>own {c.owned}, need {c.totalNeeded}</span>
                      <span style={{ fontSize: 10, color: "#94a3b8" }}>{c.patterns.map(p => p.title).join(", ")}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Smart Hub: Low-Stock Alerts — needed by active projects */}
            {lowStockNeeded && lowStockNeeded.length > 0 && (
              <div className="alert-card warn" style={{ marginBottom: 16 }}>
                <div className="at">{Icons.box()} Low Stock — Needed ({lowStockNeeded.length})</div>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>Threads below your minimum stock level that are used by active projects.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflow: "auto" }}>
                  {lowStockNeeded.map(a => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: "#fff", border: "1px solid #fde68a" }}>
                      <span style={{ width: 14, height: 14, borderRadius: 3, background: `rgb(${a.rgb[0]},${a.rgb[1]},${a.rgb[2]})`, border: "1px solid #cbd5e1", flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, fontSize: 12 }}>DMC {a.id}</span>
                      <span style={{ fontSize: 11, color: "#475569", flex: 1 }}>{a.name}</span>
                      <span style={{ fontSize: 11, color: "#b45309", fontWeight: 600 }}>have {a.owned}, min {a.min_stock}</span>
                      <button onClick={() => { updateThread(a.id, "tobuy", true); }} style={{ fontSize: 10, padding: "2px 8px", borderRadius: 4, border: "1px solid #fed7aa", background: "#fff7ed", color: "#ea580c", cursor: "pointer", fontWeight: 600 }}>Add to buy</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Smart Hub: Low-Stock — not currently needed */}
            {lowStockNotNeeded && lowStockNotNeeded.length > 0 && (
              <div className="alert-card" style={{ marginBottom: 16, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                <div className="at" style={{ color: "#64748b" }}>{Icons.box()} Low stash — not currently needed ({lowStockNotNeeded.length})</div>
                <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 10 }}>These threads are below minimum stock but aren't used by any active project.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 160, overflow: "auto" }}>
                  {lowStockNotNeeded.map(a => (
                    <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 6, background: "#fff", border: "1px solid #e2e8f0" }}>
                      <span style={{ width: 14, height: 14, borderRadius: 3, background: `rgb(${a.rgb[0]},${a.rgb[1]},${a.rgb[2]})`, border: "1px solid #cbd5e1", flexShrink: 0 }} />
                      <span style={{ fontWeight: 600, fontSize: 12 }}>DMC {a.id}</span>
                      <span style={{ fontSize: 11, color: "#475569", flex: 1 }}>{a.name}</span>
                      <span style={{ fontSize: 11, color: "#94a3b8", fontWeight: 600 }}>have {a.owned}, min {a.min_stock}</span>
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
                  <div key={d.compositeKey} className={"tcard" + (isSelected ? " on" : "")} onClick={() => setSelectedThread(isSelected ? null : d.compositeKey)}>
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
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 20px", color: "#475569", fontSize: 14 }}>
                  {threadFilter === 'remnants' ? "Threads marked as remnants will appear here. You can change a thread's status from its entry in the All tab." :
                   threadFilter === 'usedup' ? "Threads marked as used up will appear here." :
                   "No threads found."}
                </div>
              )}
            </div>
          </div>

          {/* Right Panel — Thread Detail */}
          <div className="mgr-rpanel">
            {selectedThread ? (() => {
              const d = typeof getThreadByKey === 'function' ? getThreadByKey(selectedThread) : DMC.find(x => x.id === selectedThread);
              if (!d) return <div className="rp-s" style={{ color: "#94a3b8", textAlign: "center", padding: 20 }}>Thread not found</div>;
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
                  <div className="rp-h">Inventory</div>
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
                    <div style={{ fontSize: 10, color: "#94a3b8", marginBottom: 4, textAlign: "center" }}>Opened skein level</div>
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
                      : <div style={{ fontSize: 11, color: "#94a3b8", padding: "4px 6px" }}>Not used in any patterns</div>
                    }
                  </div>
                </div>
                <div className="rp-s">
                  <div className="rp-h">Actions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <button className="g-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => updateThread(selectedThread, "tobuy", !state.tobuy)}>
                      {state.tobuy ? <>{Icons.check()} On shopping list</> : <>{Icons.cart()} Add to shopping list</>}
                    </button>
                    <button className="g-btn" style={{ width: "100%", justifyContent: "center", color: "#ef4444", borderColor: "#fecaca" }} onClick={() => { if(confirm(`Remove ${brandLabel} ${d.id} from inventory?`)) { updateThread(selectedThread, "owned", 0); updateThread(selectedThread, "partialStatus", null); updateThread(selectedThread, "tobuy", false); } }}>
                      {Icons.trash()} Remove from inventory
                    </button>
                  </div>
                </div>
              </>;
            })() : (
              <div className="rp-s" style={{ color: "#94a3b8", textAlign: "center", padding: "40px 16px", fontSize: 13 }}>
                Click a thread to view details
              </div>
            )}
          </div>
        </div>
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
              style={{ padding: "5px 10px", fontSize: 11, border: "1px solid #e2e8f0", borderRadius: 8, background: "#fff", color: "#475569", marginLeft: "auto", fontFamily: "inherit" }}
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
              <button onClick={() => setProfileModalOpen(true)} style={{ padding: "6px 12px", fontSize: 12, borderRadius: 6, border: "1px solid #e2e8f0", background: "#fff", cursor: "pointer", color: "#3f3f46", fontFamily: "inherit" }}>
                {Icons.gear()} Thread Settings
              </button>
              <button
                onClick={() => setEditingPattern({ id: Date.now().toString(), title: "", designer: "", status: "wishlist", tags: [], threads: [] })}
                style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, background: "#0d9488", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontFamily: "inherit" }}
              >
                + Add Pattern
              </button>
            </div>
            {activeProject && (
              <div className="alert-card success" style={{ marginBottom: 12 }}>
                <div className="at">{Icons.dot()} Currently Tracking</div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span>{activeProject.pattern && activeProject.pattern.length > 0 ? "Active Project" : "Unnamed Project"}</span>
                  <a href="stitch.html" style={{ color: "#065f46", fontWeight: 600, fontSize: 11 }}>Go to Tracker →</a>
                </div>
              </div>
            )}
            {/* Smart Hub: Ready to Start */}
            {readyToStart && readyToStart.length > 0 && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#16a34a", marginBottom: 8 }}>✓ Ready to Start</div>
                <div style={{ fontSize: 12, color: "#475569", marginBottom: 10 }}>Patterns you can fully kit from your current stash.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflow: "auto" }}>
                  {readyToStart.map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "#fff", border: "1px solid " + (r.pct === 100 ? "#bbf7d0" : "#e2e8f0") }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b" }}>{r.title || "Untitled"}</div>
                        <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>{r.totalThreads} threads, {r.coveredThreads} covered ({r.pct}%)</div>
                      </div>
                      {r.pct === 100 ? (
                        <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: "#dcfce7", color: "#16a34a" }}>100% kitted</span>
                      ) : (
                        <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: "#fff7ed", color: "#ea580c" }}>{r.pct}% — {r.missing.length} missing</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {storedProjects.length > 0 && (
              <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10, padding: "14px 16px", marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Saved Cross-Stitch Projects ({storedProjects.length})</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {storedProjects.map(p => {
                    const pct = p.totalStitches > 0 ? Math.round(p.completedStitches / p.totalStitches * 100) : 0;
                    const isActive = ProjectStorage.getActiveProjectId() === p.id;
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: isActive ? "#f0fdf4" : "#fff", border: `1px solid ${isActive ? "#bbf7d0" : "#e2e8f0"}`, borderRadius: 8, padding: "10px 14px" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1e293b", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: "#475569", marginTop: 2 }}>
                            {p.dimensions.width}×{p.dimensions.height} · {pct}% done · {p.source === "tracker" ? "Tracked" : "Created"} · {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 12 }}>
                          <button
                            onClick={() => { ProjectStorage.setActiveProject(p.id); window.location.href = "stitch.html?source=manager"; }}
                            style={{ padding: "5px 10px", fontSize: 12, fontWeight: 600, background: "#ea580c", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}
                          >Track</button>
                          <button
                            onClick={() => {
                              if (confirm(`Delete "${p.name}"? This cannot be undone.`)) {
                                const activeProjectId = ProjectStorage.getActiveProjectId();
                                ProjectStorage.delete(p.id).then(() => {
                                  if (activeProjectId === p.id) {
                                    ProjectStorage.clearActiveProject();
                                  }
                                  setStoredProjects(prev => prev.filter(x => x.id !== p.id));
                                });
                              }
                            }}
                            style={{ padding: "5px 10px", fontSize: 12, background: "none", color: "#ef4444", border: "1px solid #fecaca", borderRadius: 6, cursor: "pointer" }}
                          >Delete</button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div style={{ padding: "12px 16px", background: selectedPatternsForList.size > 0 ? "#f0fdf4" : "#f8f9fa", borderRadius: 8, border: selectedPatternsForList.size > 0 ? "1px solid #bbf7d0" : "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              {selectedPatternsForList.size > 0 ? (
                <div style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>{selectedPatternsForList.size} pattern(s) selected</div>
              ) : (
                <div style={{ fontSize: 12, color: "#94a3b8" }}>Select patterns with checkboxes to generate a shopping list</div>
              )}
              <div style={{ display: "flex", gap: 10 }}>
                {selectedPatternsForList.size > 0 && <button onClick={() => setSelectedPatternsForList(new Set())} style={{ padding: "6px 12px", fontSize: 12, borderRadius: 6, border: "1px solid #bbf7d0", background: "#fff", cursor: "pointer", color: "#16a34a" }}>Clear</button>}
                <button onClick={() => { if(selectedPatternsForList.size === 0) { alert("Select at least one pattern using the checkboxes on the pattern cards."); return; } setShoppingListModalOpen(true); }} style={{ padding: "6px 12px", fontSize: 12, borderRadius: 6, border: "none", background: selectedPatternsForList.size > 0 ? "#16a34a" : "#94a3b8", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Generate Shopping List</button>
              </div>
            </div>

            <div className="pat-grid">
              {filteredPatterns.map(p => {
                const isSelected = selectedPatternsForList.has(p.id);
                return (
                  <div key={p.id} className={"pcard" + (viewingPattern && viewingPattern.id === p.id ? " on" : "")} onClick={() => setViewingPattern(viewingPattern && viewingPattern.id === p.id ? null : p)}>
                    <div className="ptitle">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => { e.stopPropagation(); togglePatternSelection(p.id); }}
                        onClick={e => e.stopPropagation()}
                        style={{ cursor: "pointer" }}
                      />
                      {p.title || "Untitled"}
                      <span className={"status " + (p.status || "wishlist")} style={{ marginLeft: "auto" }}>
                        {statusColors[p.status] ? statusColors[p.status].label : p.status}
                      </span>
                    </div>
                    {p.designer && <div className="pdesigner">by {p.designer}</div>}
                    {p.tags && p.tags.length > 0 && (
                      <div className="ptags">
                        {p.tags.filter(tag => tag !== "auto-synced").map(tag => (
                          <span key={tag} className="tag">{tag}</span>
                        ))}
                        {(p.tags.includes("auto-synced") || p.linkedProjectId) && (
                          <span className="tag" style={{ background: "#f0fdfa", color: "#0d9488", fontWeight: 600 }}>Auto-synced</span>
                        )}
                      </div>
                    )}
                    <div className="pmeta">
                      <span>{p.threads ? p.threads.length : 0} threads required</span>
                    </div>
                  </div>
                );
              })}
              {filteredPatterns.length === 0 && (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 20px", color: "#475569", fontSize: 14 }}>
                  No patterns found. Click "+ Add Pattern" to start your library.
                </div>
              )}
            </div>
          </div>

          {/* Right Panel — Pattern Detail */}
          <div className="mgr-rpanel">
            {viewingPattern ? (() => {
              const p = viewingPattern;
              const coverage = p.threads && p.threads.length > 0
                ? Math.round(p.threads.filter(t => (threads[t.id] || {}).owned > 0).length / p.threads.length * 100)
                : 0;
              const missingThreads = p.threads ? p.threads.filter(t => !(threads[t.id] || {}).owned) : [];
              return <>
                <div className="rp-s">
                  <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 2 }}>{p.title || "Untitled"}</div>
                  {p.designer && <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 8 }}>by {p.designer}</div>}
                  {p.tags && p.tags.length > 0 && (
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 8 }}>
                      {p.tags.map(tag => (
                        <span key={tag} style={{ fontSize: 10, padding: "2px 8px", background: "#f1f5f9", borderRadius: 10, color: "#475569" }}>{tag}</span>
                      ))}
                    </div>
                  )}
                  <span className={"status " + (p.status || "wishlist")} style={{ display: "inline-block" }}>
                    {statusColors[p.status] ? statusColors[p.status].label : p.status}
                  </span>
                </div>
                <div className="rp-s">
                  <div className="rp-h">Thread Coverage <span className="badge">{coverage}%</span></div>
                  <div style={{ height: 6, background: "#f1f5f9", borderRadius: 3, overflow: "hidden", border: "1px solid #e2e8f0", marginBottom: 8 }}>
                    <div style={{ height: "100%", width: coverage + "%", background: "#0d9488", borderRadius: 3 }} />
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8" }}>{p.threads ? p.threads.filter(t => (threads[t.id] || {}).owned > 0).length : 0} of {p.threads ? p.threads.length : 0} threads in your stash. {missingThreads.length} missing.</div>
                </div>
                {missingThreads.length > 0 && (
                  <div className="rp-s">
                    <div className="rp-h">Missing Threads</div>
                    <div className="used-in">
                      {missingThreads.map(t => {
                        const dmc = DMC.find(x => x.id === t.id);
                        return (
                          <div key={t.id} className="ui-row">
                            <div style={{ width: 12, height: 12, borderRadius: 3, background: dmc ? `rgb(${dmc.rgb})` : "#ccc", border: "1px solid #e2e8f0" }} />
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
                    <button className="g-btn" style={{ width: "100%", justifyContent: "center", color: "#ef4444", borderColor: "#fecaca" }} onClick={() => { deletePattern(p.id); setViewingPattern(null); }}>{Icons.trash()} Delete</button>
                  </div>
                </div>
              </>;
            })() : (
              <div className="rp-s" style={{ color: "#94a3b8", textAlign: "center", padding: "40px 16px", fontSize: 13 }}>
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
      {modal === "help" && <SharedModals.Help onClose={() => setModal(null)} />}
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
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{pattern.title ? "Edit Pattern" : "Add Pattern"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Title</label>
              <input type="text" value={edited.title} onChange={e => setEdited({ ...edited, title: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e2e8f0", fontSize: 13 }} placeholder="Pattern Name" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Designer</label>
              <input type="text" value={edited.designer} onChange={e => setEdited({ ...edited, designer: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e2e8f0", fontSize: 13 }} placeholder="Creator/Shop" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Status</label>
              <select value={edited.status} onChange={e => setEdited({ ...edited, status: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e2e8f0", fontSize: 13, background: "#fff" }}>
                <option value="wishlist">Wishlist</option>
                <option value="owned">Owned</option>
                <option value="inprogress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Fabric & Dimensions</label>
              <input type="text" value={edited.fabric} onChange={e => setEdited({ ...edited, fabric: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e2e8f0", fontSize: 13 }} placeholder="e.g. 14ct Aida, 100x100" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Tags (Press Enter to add)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {edited.tags.map(tag => (
                  <span key={tag} style={{ padding: "4px 8px", background: "#f1f5f9", borderRadius: 6, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    {tag} <button onClick={() => removeTag(tag)} style={{ background: "none", border: "none", cursor: "pointer", color: "#94a3b8", padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
              <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleAddTag} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e2e8f0", fontSize: 13 }} placeholder="Add tag..." />
            </div>
          </div>

          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1e293b", marginBottom: 8 }}>Thread Requirements</label>

            <form onSubmit={handleAddThread} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, background: "#f9fafb", padding: 12, borderRadius: 8, border: "1px solid #e2e8f0" }}>
              <div style={{ display: "flex", gap: 8, position: "relative", alignItems: "center" }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <input
                    type="text"
                    value={threadInput}
                    onChange={e => { setThreadInput(e.target.value); setShowAutocomplete(true); }}
                    onFocus={() => setShowAutocomplete(true)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e2e8f0", fontSize: 13 }}
                    placeholder="Color code or name..."
                    required
                  />
                  {showAutocomplete && autocompleteResults.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
                      {autocompleteResults.map(res => (
                        <div
                          key={res.id}
                          onClick={() => { setThreadInput(res.id); setShowAutocomplete(false); }}
                          style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 8 }}
                        >
                          <div style={{ width: 16, height: 16, borderRadius: 4, background: `rgb(${res.rgb})`, border: "1px solid #e2e8f0" }} />
                          <span style={{ fontWeight: 600 }}>{res.id}</span>
                          <span style={{ color: "#475569" }}>{res.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <select value={threadBrand} onChange={e => setThreadBrand(e.target.value)} style={{ padding: "8px", borderRadius: 8, border: "0.5px solid #e2e8f0", fontSize: 13, background: "#fff" }}>
                  {Object.keys(BRAND_SKEIN_LENGTH).map(b => <option key={b} value={b}>{b}</option>)}
                </select>

                <input
                  type="number"
                  min={1}
                  value={threadQty}
                  onChange={e => setThreadQty(e.target.value)}
                  style={{ width: 70, padding: "8px", borderRadius: 8, border: "0.5px solid #e2e8f0", fontSize: 13, textAlign: "center" }}
                  required
                />

                <div style={{ display: "flex", background: "#f1f5f9", borderRadius: 8, padding: 2, border: "1px solid #e2e8f0" }}>
                  <button type="button" onClick={() => handleUnitToggle("stitches")} style={{ padding: "6px 10px", fontSize: 12, borderRadius: 6, border: "none", background: threadUnit === "stitches" ? "#fff" : "transparent", fontWeight: threadUnit === "stitches" ? 600 : 400, cursor: "pointer", boxShadow: threadUnit === "stitches" ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}>Stitches</button>
                  <button type="button" onClick={() => handleUnitToggle("skeins")} style={{ padding: "6px 10px", fontSize: 12, borderRadius: 6, border: "none", background: threadUnit === "skeins" ? "#fff" : "transparent", fontWeight: threadUnit === "skeins" ? 600 : 400, cursor: "pointer", boxShadow: threadUnit === "skeins" ? "0 1px 2px rgba(0,0,0,0.05)" : "none" }}>Skeins</button>
                </div>
              </div>

              {threadQty === "" && <div style={{ fontSize: 11, color: "#d97706" }}>Quantity cleared — please enter the value in {threadUnit}.</div>}

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
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e2e8f0", fontSize: 13 }}
                      placeholder="Second color code..."
                      required
                    />
                    {showBlendAutocomplete && blendAutocompleteResults.length > 0 && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
                        {blendAutocompleteResults.map(res => (
                          <div
                            key={res.id}
                            onClick={() => { setBlendColorInput(res.id); setShowBlendAutocomplete(false); }}
                            style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f1f5f9", display: "flex", alignItems: "center", gap: 8 }}
                          >
                            <div style={{ width: 16, height: 16, borderRadius: 4, background: `rgb(${res.rgb})`, border: "1px solid #e2e8f0" }} />
                            <span style={{ fontWeight: 600 }}>{res.id}</span>
                            <span style={{ color: "#475569" }}>{res.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <select value={blendRatio} onChange={e => setBlendRatio(e.target.value)} style={{ padding: "8px", borderRadius: 8, border: "0.5px solid #e2e8f0", fontSize: 13, background: "#fff" }}>
                     <option value="1:1">1:1 Ratio</option>
                     <option value="2:1">2:1 Ratio</option>
                     <option value="1:2">1:2 Ratio</option>
                     <option value="3:1">3:1 Ratio</option>
                     <option value="1:3">1:3 Ratio</option>
                  </select>
                </div>
              )}

              <button type="submit" style={{ padding: "8px 16px", background: "#0d9488", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 600, alignSelf: "flex-end", marginTop: 4 }}>Add Thread</button>
            </form>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 250, overflowY: "auto" }}>
              {edited.threads.map((t, idx) => {
                const info = DMC.find(d => d.id === t.id);
                // Backward compatibility for old format
                const unit = t.unit || "skeins";
                const displayUnit = unit === "stitches" ? "st" : "sk";

                return (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#f8f9fa", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: info ? `rgb(${info.rgb})` : "#ccc", border: "1px solid #cbd5e1" }} />
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{t.id}</div>
                    <div style={{ flex: 1, fontSize: 12, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                       {t.is_blended ? `${t.name || info?.name || ""} + ${t.blend_name || t.blend_id} [${t.blend_ratio ? t.blend_ratio.join(':') : '1:1'}]` : (t.name || info?.name || "")}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input
                        type="number"
                        min={0}
                        value={t.qty}
                        onChange={e => updateThreadQty(idx, parseInt(e.target.value))}
                        style={{ width: 50, padding: "4px", borderRadius: 4, border: "1px solid #e2e8f0", fontSize: 12, textAlign: "center" }}
                      />
                      <span style={{ fontSize: 11, color: "#94a3b8", width: 16 }}>{displayUnit}</span>
                    </div>

                    <button onClick={() => removeThread(idx)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", padding: "4px" }}>×</button>
                  </div>
                );
              })}
              {edited.threads.length === 0 && (
                <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "10px 0" }}>No threads added yet.</div>
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 10, background: "#f8f9fa", borderRadius: "0 0 8px 8px" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
          <button onClick={handleTrack} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#ea580c", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Start Tracking →</button>
          <button onClick={() => onSave(edited)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#0d9488", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Save Pattern</button>
        </div>
      </div>
    </div>
  );
}

function PatternDetailsModal({ pattern, onClose, onEdit, inventoryThreads, userProfile }) {
  const statusColors = {
    wishlist: { bg: "#fef3c7", text: "#b45309", label: "Wishlist" },
    owned: { bg: "#e0e7ff", text: "#4338ca", label: "Owned" },
    inprogress: { bg: "#ffedd5", text: "#c2410c", label: "In Progress" },
    completed: { bg: "#dcfce3", text: "#15803d", label: "Completed" }
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
       const info = DMC.find(d => d.id === t.id);
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
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, marginBottom: 4 }}>{pattern.title || "Untitled"}</h2>
            {pattern.designer && <div style={{ fontSize: 13, color: "#475569" }}>by {pattern.designer}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: statusColors[pattern.status].bg, color: statusColors[pattern.status].text }}>
              {statusColors[pattern.status].label}
            </span>
            {pattern.fabric && <span style={{ fontSize: 13, color: "#475569" }}>• {pattern.fabric}</span>}
          </div>

          {pattern.tags && pattern.tags.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {pattern.tags.map(tag => (
                <span key={tag} style={{ padding: "2px 6px", background: "#f1f5f9", color: "#475569", borderRadius: 4, fontSize: 11 }}>{tag}</span>
              ))}
            </div>
          )}

          <div style={{ borderTop: "1px solid #f1f5f9", paddingTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#1e293b" }}>Thread Requirements ({pattern.threads ? pattern.threads.length : 0})</label>
              {missingThreadsCount > 0 ? (
                <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 600, background: "#fef2f2", padding: "4px 8px", borderRadius: 6, border: "1px solid #fecaca" }}>Missing {missingThreadsCount} threads</span>
              ) : (
                <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600, background: "#f0fdf4", padding: "4px 8px", borderRadius: 6, border: "1px solid #bbf7d0" }}>Have all threads</span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {derivedThreads.length === 0 ? (
                <div style={{ fontSize: 12, color: "#94a3b8", textAlign: "center", padding: "10px 0" }}>No threads specified.</div>
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
                    <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 16px", background: "#f8f9fa", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ display: "flex", gap: -4 }}>
                               <div style={{ width: 16, height: 16, borderRadius: 4, background: `rgb(${t.rgb})`, border: "1px solid #cbd5e1", position: "relative", zIndex: 2 }} />
                               {t.is_blended && <div style={{ width: 16, height: 16, borderRadius: 4, background: "#ccc", border: "1px solid #cbd5e1", position: "relative", zIndex: 1, marginLeft: -6 }} />}
                            </div>
                            <div style={{ flex: 1, fontSize: 13, color: "#1e293b", fontWeight: 500 }}>
                                {text}
                            </div>
                        </div>
                        {subtext && <div style={{ fontSize: 12, color: "#475569", paddingLeft: 28 }}>{subtext}</div>}
                        <div style={{ fontSize: 10, color: "#94a3b8", paddingLeft: 28, marginTop: 2 }}>{settingsBadge}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", gap: 10, background: "#f8f9fa", borderRadius: "0 0 8px 8px" }}>
          <button onClick={onEdit} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontWeight: 600 }}>Edit Pattern</button>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#1e293b", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Close</button>
        </div>
      </div>
    </div>
  );
}

function UserProfileModal({ profile, onSave, onClose }) {
  const [edited, setEdited] = useState({ ...profile });

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Default Thread Settings</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 8 }}>
            These settings are used to estimate the number of skeins required for your patterns based on stitch counts. You can override these for individual projects.
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Fabric Count</label>
            <select value={edited.fabric_count} onChange={e => setEdited({ ...edited, fabric_count: parseInt(e.target.value) })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e2e8f0", fontSize: 13, background: "#fff" }}>
               {[11, 14, 16, 18, 20, 22, 25, 28, 32].map(ct => <option key={ct} value={ct}>{ct} count</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Strands Used</label>
            <select value={edited.strands_used} onChange={e => setEdited({ ...edited, strands_used: parseInt(e.target.value) })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e2e8f0", fontSize: 13, background: "#fff" }}>
               {[1, 2, 3, 4, 5, 6].map(st => <option key={st} value={st}>{st} strand{st > 1 ? "s" : ""}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Preferred Thread Brand</label>
            <select value={edited.thread_brand} onChange={e => setEdited({ ...edited, thread_brand: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e2e8f0", fontSize: 13, background: "#fff" }}>
                {Object.keys(BRAND_SKEIN_LENGTH).map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#475569", marginBottom: 4 }}>Waste Factor</label>
            <select value={edited.waste_factor} onChange={e => setEdited({ ...edited, waste_factor: parseFloat(e.target.value) })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e2e8f0", fontSize: 13, background: "#fff" }}>
               <option value={0.10}>Low (10% - Efficient stitching, few mistakes)</option>
               <option value={0.20}>Average (20% - Normal amount of travelling/mistakes)</option>
               <option value={0.30}>High (30% - Lots of confetti stitches/parking)</option>
            </select>
          </div>
        </div>

        <div style={{ padding: "16px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "flex-end", gap: 10, background: "#f8f9fa", borderRadius: "0 0 8px 8px" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
          <button onClick={() => onSave(edited)} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#0d9488", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Save Settings</button>
        </div>
      </div>
    </div>
  );
}

function ShoppingListModal({ patterns, inventoryThreads, userProfile, onClose }) {
  const [copied, setCopied] = useState(false);

  const missingThreads = useMemo(() => {
    // Aggregate required threads across all selected patterns
    const required = {};
    patterns.forEach(p => {
      if (!p.threads) return;

      const settings = {
          fabricCount: p.project_overrides?.fabric_count || userProfile?.fabric_count || 14,
          strandsUsed: p.project_overrides?.strands_used || userProfile?.strands_used || 2,
          threadBrand: p.project_overrides?.thread_brand || userProfile?.thread_brand || "DMC",
          wasteFactor: p.project_overrides?.waste_factor || userProfile?.waste_factor || 0.20
      };

      p.threads.forEach(t => {
        let qtyA = 0;
        let qtyB = 0;

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
             if (t.is_blended) {
                 qtyA = res.colorA.skeinsToBuy;
                 qtyB = res.colorB.skeinsToBuy;
             } else {
                 qtyA = res.skeinsToBuy;
             }
        } else {
             // skeins
             qtyA = t.qty; // Note: we can't accurately split skeins in blends, so apply all to primary
        }

        if (!required[t.id]) required[t.id] = 0;
        required[t.id] += qtyA;

        if (t.is_blended && t.blend_id) {
            if (!required[t.blend_id]) required[t.blend_id] = 0;
            required[t.blend_id] += qtyB;
        }
      });
    });

    const missing = [];
    Object.entries(required).forEach(([id, totalQtyReq]) => {
      const invState = inventoryThreads[id] || { owned: 0 };
      const missingQty = totalQtyReq - invState.owned;
      if (missingQty > 0) {
        const info = DMC.find(d => d.id === id);
        missing.push({
          id,
          name: info ? info.name : "",
          rgb: info ? info.rgb : [128,128,128],
          qty: missingQty
        });
      }
    });

    return missing.sort((a, b) => parseInt(a.id) - parseInt(b.id));
  }, [patterns, inventoryThreads, userProfile]);

  const copyList = () => {
    const text = missingThreads.map(t => `DMC ${t.id} ${t.name} x${t.qty}`).join('\n');
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="modal-overlay" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Shopping List</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#94a3b8" }}>×</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          <div style={{ fontSize: 13, color: "#475569", marginBottom: 16 }}>
            Based on your inventory, here is what you need for the {patterns.length} selected pattern(s).
          </div>

          {missingThreads.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, color: "#16a34a", fontWeight: 600 }}>
              You have all the required threads!
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {missingThreads.map(t => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#f8f9fa", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, background: `rgb(${t.rgb})`, border: "1px solid #cbd5e1" }} />
                  <div style={{ width: 40, fontWeight: 700, fontSize: 13 }}>{t.id}</div>
                  <div style={{ flex: 1, fontSize: 12, color: "#475569", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#ea580c" }}>{t.qty} sk</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: "16px 20px", borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#f8f9fa", borderRadius: "0 0 8px 8px" }}>
          <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600, opacity: copied ? 1 : 0, transition: "opacity 0.2s" }}>Copied to clipboard!</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #e2e8f0", background: "#fff", cursor: "pointer", fontWeight: 600 }}>Close</button>
            {missingThreads.length > 0 && (
              <button onClick={copyList} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#0d9488", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Copy List</button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ManagerApp />);
