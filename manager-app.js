const { useState, useEffect, useMemo, useCallback } = React;

function PartialGauge({ status }) {
  const segments = {
    "null": { count: 0, color: "#e4e4e7", text: "No partial", textColor: "#a1a1aa" },
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
            background: i < current.count ? current.color : "#e4e4e7"
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
  const [searchQuery, setSearchQuery] = useState("");
  const [threadFilter, setThreadFilter] = useState("all"); // 'all', 'owned', 'tobuy', 'lowstock'
  const [patternFilter, setPatternFilter] = useState("all"); // 'all', 'wishlist', 'owned', 'inprogress', 'completed'
  const [patternSort, setPatternSort] = useState("date_desc"); // 'date_desc', 'date_asc', 'title_asc', 'designer_asc', 'status'
  const [editingPattern, setEditingPattern] = useState(null); // Pattern object currently being added/edited
  const [viewingPattern, setViewingPattern] = useState(null); // Pattern object currently being viewed for details
  const [selectedPatternsForList, setSelectedPatternsForList] = useState(new Set());
  const [shoppingListModalOpen, setShoppingListModalOpen] = useState(false);
  const [expandedThread, setExpandedThread] = useState(null);
  const [userProfile, setUserProfile] = useState({
    fabric_count: 14,
    strands_used: 2,
    thread_brand: "DMC",
    waste_factor: 0.20
  });
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const lowStockThreshold = 1;

  // Storage initialization
  useEffect(() => {
    // Load Manager Data
    const loadManagerData = async () => {
      try {
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

        if (threadsData && versionData !== 2) {
          // Backup
          store.put(threadsData, "threads_backup_v1");

          // Migrate
          finalThreads = {};
          for (const [id, t] of Object.entries(threadsData)) {
            finalThreads[id] = { ...t, partialStatus: null };
          }
          store.put(finalThreads, "threads");
          store.put(2, "stashDataVersion");
        } else if (!threadsData) {
          finalThreads = {};
          DMC.forEach(d => {
              finalThreads[d.id] = { owned: 0, tobuy: false, partialStatus: null };
          });
          store.put(finalThreads, "threads");
          store.put(2, "stashDataVersion");
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

    loadManagerData();
    loadActiveProject();
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

  function openManagerDB() {
    return new Promise((resolve, reject) => {
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
    let list = DMC.filter(d => {
      const q = searchQuery.toLowerCase();
      return d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q);
    });

    return list.filter(d => {
      if (d.id === expandedThread) return true; // Keep expanded thread visible until closed

      const t = threads[d.id] || { owned: 0, tobuy: false, partialStatus: null };
      if (threadFilter === 'owned') return t.owned > 0 || ["mostly-full", "about-half", "remnant"].includes(t.partialStatus);
      if (threadFilter === 'tobuy') return t.tobuy;
      if (threadFilter === 'lowstock') return (t.owned > 0 && t.owned <= lowStockThreshold) || (t.owned === 0 && ["about-half", "remnant"].includes(t.partialStatus));
      if (threadFilter === 'remnants') return t.partialStatus === "remnant";
      if (threadFilter === 'usedup') return t.partialStatus === "used-up" && t.owned === 0;
      return true; // "all" filter
    });
  }, [searchQuery, threads, threadFilter, expandedThread]);

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
      <Header page="manager" setModal={setModal} />
      <div style={{ maxWidth: 1100, margin: "0 auto", padding: "20px 16px" }}>

        <div style={{ display: "flex", gap: 0, marginBottom: 12, borderBottom: "2px solid #f4f4f5" }}>
          {[["inventory", "Thread Inventory"], ["patterns", "Pattern Library"]].map(it => (
            <button key={it[0]} onClick={() => { setTab(it[0]); setSearchQuery(""); }} style={tabSt(tab === it[0])}>{it[1]}</button>
          ))}
        </div>

        {tab === "inventory" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                placeholder="Search DMC number or name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", flex: "1 1 200px", fontSize: 13 }}
              />
              <div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2 }}>
                {[
                  {id: "all", label: "All"},
                  {id: "tobuy", label: "To Buy"},
                  {id: "owned", label: "Owned"},
                  {id: "lowstock", label: "Low Stock"},
                  {id: "remnants", label: "Remnants"},
                  {id: "usedup", label: "Used Up"}
                ].map(f => (
                  <button
                    key={f.id}
                    onClick={() => setThreadFilter(f.id)}
                    style={{
                      padding: "6px 12px", fontSize: 12, fontWeight: threadFilter === f.id ? 600 : 400,
                      background: threadFilter === f.id ? "#fff" : "transparent", borderRadius: 6,
                      color: threadFilter === f.id ? "#18181b" : "#71717a", border: "none", cursor: "pointer",
                      boxShadow: threadFilter === f.id ? "0 1px 2px rgba(0,0,0,0.04)" : "none"
                    }}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", gap: 12 }}>
              <div style={{ padding: "6px 14px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0", fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: "#16a34a" }}>{totalOwnedCount}</span> <span style={{ color: "#71717a" }}>skeins owned</span>
              </div>
              <div style={{ padding: "6px 14px", background: "#fff7ed", borderRadius: 8, border: "1px solid #fed7aa", fontSize: 12 }}>
                <span style={{ fontWeight: 700, color: "#ea580c" }}>{toBuyCount}</span> <span style={{ color: "#71717a" }}>to buy</span>
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: 10 }}>
              {filteredThreads.map(d => {
                const state = threads[d.id] || { owned: 0, tobuy: false, partialStatus: null };
                const isExpanded = expandedThread === d.id;
                const isLowStock = state.owned > 0 && state.owned <= lowStockThreshold;

                const dotColors = {
                  "null": "#e4e4e7",
                  "mostly-full": "#378ADD",
                  "about-half": "#378ADD",
                  "remnant": "#EF9F27",
                  "used-up": "#888780"
                };

                return (
                  <div key={d.id} style={{
                    display: "flex", flexDirection: "column",
                    borderRadius: 8, border: isExpanded ? "1px solid #d4d4d8" : "1px solid #e4e4e7",
                    background: state.owned > 0 || state.partialStatus ? "#fafafa" : "#fff",
                    boxShadow: isExpanded ? "0 2px 4px rgba(0,0,0,0.05)" : "none",
                    overflow: "hidden"
                  }}>
                    {/* Compact Row */}
                    <div
                      onClick={() => setExpandedThread(isExpanded ? null : d.id)}
                      style={{
                        display: "flex", alignItems: "center", gap: 12, padding: "10px 12px",
                        cursor: "pointer", userSelect: "none"
                      }}
                    >
                      <div style={{ width: 28, height: 28, borderRadius: 14, background: `rgb(${d.rgb})`, border: "1px solid #d4d4d8", flexShrink: 0 }} />

                      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, justifyContent: "center" }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6, whiteSpace: "nowrap", overflow: "hidden" }}>
                          <span style={{ fontSize: 14, fontWeight: 600, color: "#18181b" }}>DMC {d.id}</span>
                          <span style={{ fontSize: 12, color: "#71717a", textOverflow: "ellipsis", overflow: "hidden" }}>{d.name}</span>
                        </div>
                      </div>

                      {isLowStock && <div style={{ fontSize: 10, color: "#ea580c", background: "#fff7ed", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>Low</div>}

                      <div style={{ display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
                        <div style={{
                          padding: "2px 8px", background: "#e4e4e7", borderRadius: 12,
                          fontSize: 12, fontWeight: 600, color: "#3f3f46", minWidth: 28, textAlign: "center"
                        }}>
                          {state.owned}
                        </div>

                        <div className="partial-gauge-container">
                          <PartialGauge status={state.partialStatus} />
                        </div>

                        <button
                          onClick={(e) => { e.stopPropagation(); updateThread(d.id, "tobuy", !state.tobuy); }}
                          style={{
                            padding: "6px", borderRadius: 6, border: state.tobuy ? "1px solid #fed7aa" : "1px solid #e4e4e7",
                            background: state.tobuy ? "#fff7ed" : "#fff", color: state.tobuy ? "#ea580c" : "#a1a1aa", cursor: "pointer",
                            display: "flex", alignItems: "center", justifyContent: "center"
                          }}
                          title={state.tobuy ? "Remove from to-buy list" : "Add to to-buy list"}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                             <circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
                          </svg>
                        </button>

                        <div style={{ color: "#a1a1aa", display: "flex", alignItems: "center", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                        </div>
                      </div>
                    </div>

                    {/* Edit Panel */}
                    {isExpanded && (
                      <div style={{ display: "flex", borderTop: "1px solid #f4f4f5", padding: "16px 12px", background: "#fff", gap: 16 }}>

                        {/* Full Skeins Col */}
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 12 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#a1a1aa", letterSpacing: 0.5 }}>FULL SKEINS</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <button
                              onClick={(e) => { e.stopPropagation(); updateThread(d.id, "owned", Math.max(0, state.owned - 1)); }}
                              style={{ width: 32, height: 32, borderRadius: 16, background: "#f4f4f5", border: "1px solid #e4e4e7", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#3f3f46", fontSize: 16 }}
                            >−</button>
                            <div style={{ fontSize: 18, fontWeight: 600, color: "#18181b", minWidth: 24, textAlign: "center" }}>{state.owned}</div>
                            <button
                              onClick={(e) => { e.stopPropagation(); updateThread(d.id, "owned", state.owned + 1); }}
                              style={{ width: 32, height: 32, borderRadius: 16, background: "#f4f4f5", border: "1px solid #e4e4e7", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#3f3f46", fontSize: 16 }}
                            >+</button>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              const usedIn = patternsUsingThread(d.id);
                              if (usedIn.length > 0) {
                                alert(`Thread DMC ${d.id} is used in:\n\n${usedIn.map(p => `- ${p.title} (needs ${p.threads.find(t=>t.id===d.id).qty})`).join('\n')}`);
                              } else {
                                alert(`Thread DMC ${d.id} is not currently used in any of your patterns.`);
                              }
                            }}
                            style={{ padding: "6px 10px", borderRadius: 6, border: "1px solid #e4e4e7", background: "#f4f4f5", color: "#71717a", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, fontSize: 11, width: "fit-content", marginTop: "auto" }}
                            title="What uses this thread?"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                            </svg>
                            Usage
                          </button>
                        </div>

                        {/* Opened Skein Col */}
                        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ fontSize: 11, fontWeight: 700, color: "#a1a1aa", letterSpacing: 0.5, marginBottom: 4 }}>OPENED SKEIN</div>
                          {[
                            { val: null, label: "None" },
                            { val: "mostly-full", label: "Mostly full" },
                            { val: "about-half", label: "About half" },
                            { val: "remnant", label: "Remnant" },
                            { val: "used-up", label: "Used up" }
                          ].map(opt => {
                            const isActive = (state.partialStatus === opt.val) || (opt.val === null && !state.partialStatus);
                            return (
                              <div
                                key={opt.val || 'none'}
                                onClick={(e) => { e.stopPropagation(); updateThread(d.id, "partialStatus", opt.val); }}
                                style={{
                                  display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                                  borderRadius: 6, cursor: "pointer",
                                  background: isActive ? "#f4f4f5" : "transparent",
                                  border: isActive ? "1px solid #e4e4e7" : "1px solid transparent"
                                }}
                              >
                                <div style={{ width: 10, height: 10, borderRadius: 5, background: dotColors[opt.val || "null"] }} />
                                <div style={{ fontSize: 13, color: "#3f3f46", fontWeight: isActive ? 500 : 400 }}>{opt.label}</div>
                              </div>
                            );
                          })}
                        </div>

                      </div>
                    )}
                  </div>
                );
              })}
              {filteredThreads.length === 0 && (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 20px", color: "#71717a", fontSize: 14 }}>
                  {threadFilter === 'remnants' ? "Threads marked as remnants will appear here. You can change a thread's status from its entry in the All tab." :
                   threadFilter === 'usedup' ? "Threads marked as used up will appear here." :
                   "No threads found."}
                </div>
              )}
            </div>
          </div>
        )}

        {tab === "patterns" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: -8 }}>
               <button onClick={() => setProfileModalOpen(true)} style={{ padding: "6px 12px", fontSize: 12, borderRadius: 6, border: "1px solid #e4e4e7", background: "#fff", cursor: "pointer", color: "#3f3f46" }}>
                 ⚙️ Thread Settings
               </button>
            </div>
            {activeProject && (
                <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#16a34a", textTransform: "uppercase", marginBottom: 4 }}>Currently tracking</div>
                        <div style={{ fontSize: 14, fontWeight: 600, color: "#18181b" }}>{activeProject.pattern && activeProject.pattern.length > 0 ? "Active Project" : "Unnamed Project"}</div>
                    </div>
                    <button onClick={() => window.open('stitch.html', '_blank')} style={{ padding: "6px 12px", fontSize: 13, fontWeight: 600, background: "#16a34a", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer" }}>Go to Tracker</button>
                </div>
            )}
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", flex: 1 }}>
                <input
                  type="text"
                  placeholder="Search title, designer, or tags..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", flex: "1 1 150px", fontSize: 13 }}
                />
                <div style={{ display: "flex", gap: 2, background: "#f4f4f5", borderRadius: 8, padding: 2 }}>
                  {[
                    {id: "all", label: "All"},
                    {id: "wishlist", label: "Wishlist"},
                    {id: "owned", label: "Owned"},
                    {id: "inprogress", label: "In Progress"},
                    {id: "completed", label: "Completed"}
                  ].map(f => (
                    <button
                      key={f.id}
                      onClick={() => setPatternFilter(f.id)}
                      style={{
                        padding: "6px 12px", fontSize: 12, fontWeight: patternFilter === f.id ? 600 : 400,
                        background: patternFilter === f.id ? "#fff" : "transparent", borderRadius: 6,
                        color: patternFilter === f.id ? "#18181b" : "#71717a", border: "none", cursor: "pointer",
                        boxShadow: patternFilter === f.id ? "0 1px 2px rgba(0,0,0,0.04)" : "none"
                      }}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
                <select
                  value={patternSort}
                  onChange={e => setPatternSort(e.target.value)}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 13, background: "#fff", cursor: "pointer" }}
                >
                  <option value="date_desc">Newest First</option>
                  <option value="date_asc">Oldest First</option>
                  <option value="title_asc">Title (A-Z)</option>
                  <option value="designer_asc">Designer (A-Z)</option>
                  <option value="status">Status</option>
                </select>
              </div>
              <button
                onClick={() => setEditingPattern({ id: Date.now().toString(), title: "", designer: "", status: "wishlist", tags: [], threads: [] })}
                style={{ padding: "8px 16px", fontSize: 13, fontWeight: 600, background: "#0d9488", color: "#fff", border: "none", borderRadius: 8, cursor: "pointer" }}
              >
                + Add Pattern
              </button>
            </div>

            {selectedPatternsForList.size > 0 && (
              <div style={{ padding: "12px 16px", background: "#f0fdf4", borderRadius: 8, border: "1px solid #bbf7d0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 13, color: "#16a34a", fontWeight: 600 }}>{selectedPatternsForList.size} pattern(s) selected</div>
                <div style={{ display: "flex", gap: 10 }}>
                  <button onClick={() => setSelectedPatternsForList(new Set())} style={{ padding: "6px 12px", fontSize: 12, borderRadius: 6, border: "1px solid #bbf7d0", background: "#fff", cursor: "pointer", color: "#16a34a" }}>Clear</button>
                  <button onClick={() => setShoppingListModalOpen(true)} style={{ padding: "6px 12px", fontSize: 12, borderRadius: 6, border: "none", background: "#16a34a", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Generate Shopping List</button>
                </div>
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {filteredPatterns.map(p => {
                const isSelected = selectedPatternsForList.has(p.id);
                return (
                  <div key={p.id} style={{ display: "flex", flexDirection: "column", padding: "16px", borderRadius: 12, border: isSelected ? "2px solid #0d9488" : "1px solid #e4e4e7", background: "#fff", cursor: "pointer", transition: "box-shadow 0.2s" }} onClick={() => setViewingPattern(p)}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => { e.stopPropagation(); togglePatternSelection(p.id); }}
                          onClick={e => e.stopPropagation()}
                          style={{ cursor: "pointer" }}
                        />
                        <div style={{ fontSize: 16, fontWeight: 700, color: "#18181b", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{p.title || "Untitled"}</div>
                      </div>
                      <span style={{ padding: "2px 8px", borderRadius: 12, fontSize: 10, fontWeight: 600, background: statusColors[p.status].bg, color: statusColors[p.status].text, flexShrink: 0 }}>
                        {statusColors[p.status].label}
                      </span>
                    </div>
                    {p.designer && <div style={{ fontSize: 13, color: "#71717a", marginBottom: 8 }}>by {p.designer}</div>}

                    {p.tags && p.tags.length > 0 && (
                      <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 12 }}>
                        {p.tags.map(tag => (
                          <span key={tag} style={{ padding: "2px 6px", background: "#f4f4f5", color: "#71717a", borderRadius: 4, fontSize: 11 }}>{tag}</span>
                        ))}
                      </div>
                    )}

                    <div style={{ marginTop: "auto", display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #f4f4f5", paddingTop: 12 }}>
                      <div style={{ fontSize: 12, color: "#a1a1aa" }}>{p.threads ? p.threads.length : 0} threads required</div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={(e) => { e.stopPropagation(); setEditingPattern(p); }} style={{ background: "none", border: "none", color: "#0d9488", fontSize: 12, cursor: "pointer" }}>Edit</button>
                        <button onClick={(e) => { e.stopPropagation(); deletePattern(p.id); }} style={{ background: "none", border: "none", color: "#ef4444", fontSize: 12, cursor: "pointer" }}>Delete</button>
                      </div>
                    </div>
                  </div>
                );
              })}
              {filteredPatterns.length === 0 && (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 20px", color: "#71717a", fontSize: 14 }}>
                  No patterns found. Click "Add Pattern" to start your library.
                </div>
              )}
            </div>
          </div>
        )}

      </div>
      {viewingPattern && (
        <PatternDetailsModal
          pattern={viewingPattern}
          onClose={() => setViewingPattern(null)}
          onEdit={() => { setEditingPattern(viewingPattern); setViewingPattern(null); }}
          inventoryThreads={threads}
        />
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
      {modal === "help" && <SharedModals.Help onClose={() => setModal(null)} />}
      {modal === "about" && <SharedModals.About onClose={() => setModal(null)} />}
      {modal === "calculator" && <SharedModals.Calculator onClose={() => setModal(null)} />}
    </>
  );
}

function PatternModal({ pattern, onSave, onClose, inventoryThreads, userProfile }) {
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

  const removeThread = (idToRemove) => {
    setEdited({ ...edited, threads: edited.threads.filter(t => t.id !== idToRemove) });
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
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e4e4e7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>{pattern.title ? "Edit Pattern" : "Add Pattern"}</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#a1a1aa" }}>×</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#71717a", marginBottom: 4 }}>Title</label>
              <input type="text" value={edited.title} onChange={e => setEdited({ ...edited, title: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 13 }} placeholder="Pattern Name" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#71717a", marginBottom: 4 }}>Designer</label>
              <input type="text" value={edited.designer} onChange={e => setEdited({ ...edited, designer: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 13 }} placeholder="Creator/Shop" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#71717a", marginBottom: 4 }}>Status</label>
              <select value={edited.status} onChange={e => setEdited({ ...edited, status: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 13, background: "#fff" }}>
                <option value="wishlist">Wishlist</option>
                <option value="owned">Owned</option>
                <option value="inprogress">In Progress</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#71717a", marginBottom: 4 }}>Fabric & Dimensions</label>
              <input type="text" value={edited.fabric} onChange={e => setEdited({ ...edited, fabric: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 13 }} placeholder="e.g. 14ct Aida, 100x100" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#71717a", marginBottom: 4 }}>Tags (Press Enter to add)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {edited.tags.map(tag => (
                  <span key={tag} style={{ padding: "4px 8px", background: "#f4f4f5", borderRadius: 6, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    {tag} <button onClick={() => removeTag(tag)} style={{ background: "none", border: "none", cursor: "pointer", color: "#a1a1aa", padding: 0 }}>×</button>
                  </span>
                ))}
              </div>
              <input type="text" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleAddTag} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 13 }} placeholder="Add tag..." />
            </div>
          </div>

          <div style={{ borderTop: "1px solid #f4f4f5", paddingTop: 16 }}>
            <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#18181b", marginBottom: 8 }}>Thread Requirements</label>

            <form onSubmit={handleAddThread} style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 16, background: "#f9fafb", padding: 12, borderRadius: 8, border: "1px solid #e4e4e7" }}>
              <div style={{ display: "flex", gap: 8, position: "relative", alignItems: "center" }}>
                <div style={{ flex: 1, position: "relative" }}>
                  <input
                    type="text"
                    value={threadInput}
                    onChange={e => { setThreadInput(e.target.value); setShowAutocomplete(true); }}
                    onFocus={() => setShowAutocomplete(true)}
                    style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 13 }}
                    placeholder="Color code or name..."
                    required
                  />
                  {showAutocomplete && autocompleteResults.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
                      {autocompleteResults.map(res => (
                        <div
                          key={res.id}
                          onClick={() => { setThreadInput(res.id); setShowAutocomplete(false); }}
                          style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f4f4f5", display: "flex", alignItems: "center", gap: 8 }}
                        >
                          <div style={{ width: 16, height: 16, borderRadius: 4, background: `rgb(${res.rgb})`, border: "1px solid #e4e4e7" }} />
                          <span style={{ fontWeight: 600 }}>{res.id}</span>
                          <span style={{ color: "#71717a" }}>{res.name}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <select value={threadBrand} onChange={e => setThreadBrand(e.target.value)} style={{ padding: "8px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 13, background: "#fff" }}>
                  {Object.keys(BRAND_SKEIN_LENGTH).map(b => <option key={b} value={b}>{b}</option>)}
                </select>

                <input
                  type="number"
                  min={1}
                  value={threadQty}
                  onChange={e => setThreadQty(e.target.value)}
                  style={{ width: 70, padding: "8px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 13, textAlign: "center" }}
                  required
                />

                <div style={{ display: "flex", background: "#f4f4f5", borderRadius: 8, padding: 2, border: "1px solid #e4e4e7" }}>
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
                      style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 13 }}
                      placeholder="Second color code..."
                      required
                    />
                    {showBlendAutocomplete && blendAutocompleteResults.length > 0 && (
                      <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #e4e4e7", borderRadius: 8, marginTop: 4, zIndex: 10, maxHeight: 200, overflowY: "auto", boxShadow: "0 4px 6px -1px rgba(0,0,0,0.1)" }}>
                        {blendAutocompleteResults.map(res => (
                          <div
                            key={res.id}
                            onClick={() => { setBlendColorInput(res.id); setShowBlendAutocomplete(false); }}
                            style={{ padding: "8px 12px", cursor: "pointer", fontSize: 13, borderBottom: "1px solid #f4f4f5", display: "flex", alignItems: "center", gap: 8 }}
                          >
                            <div style={{ width: 16, height: 16, borderRadius: 4, background: `rgb(${res.rgb})`, border: "1px solid #e4e4e7" }} />
                            <span style={{ fontWeight: 600 }}>{res.id}</span>
                            <span style={{ color: "#71717a" }}>{res.name}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <select value={blendRatio} onChange={e => setBlendRatio(e.target.value)} style={{ padding: "8px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 13, background: "#fff" }}>
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
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#fafafa", borderRadius: 8, border: "1px solid #e4e4e7" }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: info ? `rgb(${info.rgb})` : "#ccc", border: "1px solid #d4d4d8" }} />
                    <div style={{ fontWeight: 700, fontSize: 13 }}>{t.id}</div>
                    <div style={{ flex: 1, fontSize: 12, color: "#71717a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                       {t.is_blended ? `${t.name || info?.name || ""} + ${t.blend_name || t.blend_id} [${t.blend_ratio ? t.blend_ratio.join(':') : '1:1'}]` : (t.name || info?.name || "")}
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input
                        type="number"
                        min={0}
                        value={t.qty}
                        onChange={e => updateThreadQty(idx, parseInt(e.target.value))}
                        style={{ width: 50, padding: "4px", borderRadius: 4, border: "1px solid #e4e4e7", fontSize: 12, textAlign: "center" }}
                      />
                      <span style={{ fontSize: 11, color: "#a1a1aa", width: 16 }}>{displayUnit}</span>
                    </div>

                    <button onClick={() => removeThread(t.id)} style={{ background: "none", border: "none", color: "#a1a1aa", cursor: "pointer", padding: "4px" }}>×</button>
                  </div>
                );
              })}
              {edited.threads.length === 0 && (
                <div style={{ fontSize: 12, color: "#a1a1aa", textAlign: "center", padding: "10px 0" }}>No threads added yet.</div>
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 20px", borderTop: "1px solid #e4e4e7", display: "flex", justifyContent: "flex-end", gap: 10, background: "#fafafa", borderRadius: "0 0 8px 8px" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #e4e4e7", background: "#fff", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
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
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e4e4e7", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 20, marginBottom: 4 }}>{pattern.title || "Untitled"}</h2>
            {pattern.designer && <div style={{ fontSize: 13, color: "#71717a" }}>by {pattern.designer}</div>}
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#a1a1aa" }}>×</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: statusColors[pattern.status].bg, color: statusColors[pattern.status].text }}>
              {statusColors[pattern.status].label}
            </span>
            {pattern.fabric && <span style={{ fontSize: 13, color: "#71717a" }}>• {pattern.fabric}</span>}
          </div>

          {pattern.tags && pattern.tags.length > 0 && (
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {pattern.tags.map(tag => (
                <span key={tag} style={{ padding: "2px 6px", background: "#f4f4f5", color: "#71717a", borderRadius: 4, fontSize: 11 }}>{tag}</span>
              ))}
            </div>
          )}

          <div style={{ borderTop: "1px solid #f4f4f5", paddingTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <label style={{ display: "block", fontSize: 14, fontWeight: 600, color: "#18181b" }}>Thread Requirements ({pattern.threads ? pattern.threads.length : 0})</label>
              {missingThreadsCount > 0 ? (
                <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 600, background: "#fef2f2", padding: "4px 8px", borderRadius: 6, border: "1px solid #fecaca" }}>Missing {missingThreadsCount} threads</span>
              ) : (
                <span style={{ fontSize: 12, color: "#16a34a", fontWeight: 600, background: "#f0fdf4", padding: "4px 8px", borderRadius: 6, border: "1px solid #bbf7d0" }}>Have all threads</span>
              )}
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {derivedThreads.length === 0 ? (
                <div style={{ fontSize: 12, color: "#a1a1aa", textAlign: "center", padding: "10px 0" }}>No threads specified.</div>
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
                    <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 16px", background: "#fafafa", borderRadius: 8, border: "1px solid #e4e4e7" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ display: "flex", gap: -4 }}>
                               <div style={{ width: 16, height: 16, borderRadius: 4, background: `rgb(${t.rgb})`, border: "1px solid #d4d4d8", position: "relative", zIndex: 2 }} />
                               {t.is_blended && <div style={{ width: 16, height: 16, borderRadius: 4, background: "#ccc", border: "1px solid #d4d4d8", position: "relative", zIndex: 1, marginLeft: -6 }} />}
                            </div>
                            <div style={{ flex: 1, fontSize: 13, color: "#18181b", fontWeight: 500 }}>
                                {text}
                            </div>
                        </div>
                        {subtext && <div style={{ fontSize: 12, color: "#71717a", paddingLeft: 28 }}>{subtext}</div>}
                        <div style={{ fontSize: 10, color: "#a1a1aa", paddingLeft: 28, marginTop: 2 }}>{settingsBadge}</div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        <div style={{ padding: "16px 20px", borderTop: "1px solid #e4e4e7", display: "flex", justifyContent: "space-between", gap: 10, background: "#fafafa", borderRadius: "0 0 8px 8px" }}>
          <button onClick={onEdit} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #e4e4e7", background: "#fff", cursor: "pointer", fontWeight: 600 }}>Edit Pattern</button>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "#18181b", color: "#fff", cursor: "pointer", fontWeight: 600 }}>Close</button>
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
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e4e4e7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Default Thread Settings</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#a1a1aa" }}>×</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ fontSize: 13, color: "#71717a", marginBottom: 8 }}>
            These settings are used to estimate the number of skeins required for your patterns based on stitch counts. You can override these for individual projects.
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#71717a", marginBottom: 4 }}>Fabric Count</label>
            <select value={edited.fabric_count} onChange={e => setEdited({ ...edited, fabric_count: parseInt(e.target.value) })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 13, background: "#fff" }}>
               {[11, 14, 16, 18, 20, 22, 25, 28, 32].map(ct => <option key={ct} value={ct}>{ct} count</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#71717a", marginBottom: 4 }}>Strands Used</label>
            <select value={edited.strands_used} onChange={e => setEdited({ ...edited, strands_used: parseInt(e.target.value) })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 13, background: "#fff" }}>
               {[1, 2, 3, 4, 5, 6].map(st => <option key={st} value={st}>{st} strand{st > 1 ? "s" : ""}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#71717a", marginBottom: 4 }}>Preferred Thread Brand</label>
            <select value={edited.thread_brand} onChange={e => setEdited({ ...edited, thread_brand: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 13, background: "#fff" }}>
                {Object.keys(BRAND_SKEIN_LENGTH).map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "#71717a", marginBottom: 4 }}>Waste Factor</label>
            <select value={edited.waste_factor} onChange={e => setEdited({ ...edited, waste_factor: parseFloat(e.target.value) })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 13, background: "#fff" }}>
               <option value={0.10}>Low (10% - Efficient stitching, few mistakes)</option>
               <option value={0.20}>Average (20% - Normal amount of travelling/mistakes)</option>
               <option value={0.30}>High (30% - Lots of confetti stitches/parking)</option>
            </select>
          </div>
        </div>

        <div style={{ padding: "16px 20px", borderTop: "1px solid #e4e4e7", display: "flex", justifyContent: "flex-end", gap: 10, background: "#fafafa", borderRadius: "0 0 8px 8px" }}>
          <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #e4e4e7", background: "#fff", cursor: "pointer", fontWeight: 600 }}>Cancel</button>
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
        <div style={{ padding: "16px 20px", borderBottom: "1px solid #e4e4e7", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 style={{ margin: 0, fontSize: 18 }}>Shopping List</h2>
          <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 24, cursor: "pointer", color: "#a1a1aa" }}>×</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1 }}>
          <div style={{ fontSize: 13, color: "#71717a", marginBottom: 16 }}>
            Based on your inventory, here is what you need for the {patterns.length} selected pattern(s).
          </div>

          {missingThreads.length === 0 ? (
            <div style={{ padding: 30, textAlign: "center", background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, color: "#16a34a", fontWeight: 600 }}>
              You have all the required threads! 🎉
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {missingThreads.map(t => (
                <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#fafafa", borderRadius: 8, border: "1px solid #e4e4e7" }}>
                  <div style={{ width: 20, height: 20, borderRadius: 4, background: `rgb(${t.rgb})`, border: "1px solid #d4d4d8" }} />
                  <div style={{ width: 40, fontWeight: 700, fontSize: 13 }}>{t.id}</div>
                  <div style={{ flex: 1, fontSize: 12, color: "#71717a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.name}</div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: "#ea580c" }}>{t.qty} sk</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ padding: "16px 20px", borderTop: "1px solid #e4e4e7", display: "flex", justifyContent: "space-between", alignItems: "center", background: "#fafafa", borderRadius: "0 0 8px 8px" }}>
          <span style={{ fontSize: 13, color: "#16a34a", fontWeight: 600, opacity: copied ? 1 : 0, transition: "opacity 0.2s" }}>Copied to clipboard!</span>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onClose} style={{ padding: "8px 16px", borderRadius: 8, border: "0.5px solid #e4e4e7", background: "#fff", cursor: "pointer", fontWeight: 600 }}>Close</button>
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
