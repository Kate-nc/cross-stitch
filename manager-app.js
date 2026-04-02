const { useState, useEffect, useMemo, useCallback } = React;


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

  const lowStockThreshold = 1;

  // Storage initialization
  useEffect(() => {
    // Load Manager Data
    const loadManagerData = async () => {
      try {
        const db = await openManagerDB();
        const tx = db.transaction(["manager_state"], "readonly");
        const store = tx.objectStore("manager_state");
        const getThreads = store.get("threads");
        const getPatterns = store.get("patterns");

        getThreads.onsuccess = () => {
          if (getThreads.result) {
            setThreads(getThreads.result);
          } else {
            // Initialize with standard DMC empty state if not found
            let initialThreads = {};
            DMC.forEach(d => {
                initialThreads[d.id] = { owned: 0, tobuy: false };
            });
            setThreads(initialThreads);
          }
        };
        getPatterns.onsuccess = () => {
          if (getPatterns.result) setPatterns(getPatterns.result);
        };

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
      } catch (err) {
        console.error("Auto-save failed:", err);
      }
    }, 1000);
    return () => clearTimeout(saveTimer);
  }, [threads, patterns]);

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
    setThreads(prev => ({
      ...prev,
      [id]: {
        ...prev[id],
        [field]: value
      }
    }));

  };

  const filteredThreads = useMemo(() => {
    let list = DMC.filter(d => {
      const q = searchQuery.toLowerCase();
      return d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q);
    });

    return list.filter(d => {
      const t = threads[d.id] || { owned: 0, tobuy: false };
      if (threadFilter === 'owned') return t.owned > 0;
      if (threadFilter === 'tobuy') return t.tobuy;
      if (threadFilter === 'lowstock') return t.owned <= lowStockThreshold && t.owned > 0;
      return true;
    });
  }, [searchQuery, threads, threadFilter]);


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
                  {id: "owned", label: "Owned"},
                  {id: "tobuy", label: "To Buy"},
                  {id: "lowstock", label: "Low Stock"}

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

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 10 }}>
              {filteredThreads.map(d => {
                const state = threads[d.id] || { owned: 0, tobuy: false };
                const isLowStock = state.owned > 0 && state.owned <= lowStockThreshold;

                return (
                  <div key={d.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderRadius: 8, border: "1px solid #e4e4e7", background: state.owned > 0 ? "#fafafa" : "#fff" }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, background: `rgb(${d.rgb})`, border: "1px solid #d4d4d8", flexShrink: 0 }} />
                    <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#18181b" }}>DMC {d.id}</div>
                      <div style={{ fontSize: 11, color: "#71717a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{d.name}</div>
                    </div>

                    {isLowStock && <div style={{ fontSize: 10, color: "#ea580c", background: "#fff7ed", padding: "2px 6px", borderRadius: 4, fontWeight: 600 }}>Low</div>}

                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <button
                        onClick={() => {
                          const usedIn = patternsUsingThread(d.id);
                          if (usedIn.length > 0) {
                            alert(`Thread DMC ${d.id} is used in:\n\n${usedIn.map(p => `- ${p.title} (needs ${p.threads.find(t=>t.id===d.id).qty})`).join('\n')}`);
                          } else {
                            alert(`Thread DMC ${d.id} is not currently used in any of your patterns.`);
                          }
                        }}
                        style={{ padding: "6px", borderRadius: 6, border: "1px solid #e4e4e7", background: "#f4f4f5", color: "#71717a", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
                        title="What uses this thread?"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                      </button>

                      <div style={{ display: "flex", alignItems: "center", border: "1px solid #e4e4e7", borderRadius: 6, overflow: "hidden", background: "#fff" }}>
                        <button onClick={() => updateThread(d.id, "owned", Math.max(0, state.owned - 1))} style={{ padding: "4px 8px", background: "none", border: "none", cursor: "pointer", color: "#71717a" }}>-</button>
                        <input
                          type="number"
                          min={0}
                          value={state.owned}
                          onChange={(e) => updateThread(d.id, "owned", Math.max(0, parseInt(e.target.value) || 0))}
                          style={{ width: 30, textAlign: "center", border: "none", background: "none", fontSize: 12, padding: 0 }}
                        />
                        <button onClick={() => updateThread(d.id, "owned", state.owned + 1)} style={{ padding: "4px 8px", background: "none", border: "none", cursor: "pointer", color: "#71717a" }}>+</button>
                      </div>
                      <button
                        onClick={() => updateThread(d.id, "tobuy", !state.tobuy)}
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
                    </div>

                  </div>
                );
              })}
              {filteredThreads.length === 0 && (
                <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "40px 20px", color: "#71717a", fontSize: 14 }}>
                  No threads found.

                </div>
              )}
            </div>
          </div>
        )}

        {tab === "patterns" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
        />
      )}
      {shoppingListModalOpen && (
        <ShoppingListModal
          patterns={patterns.filter(p => selectedPatternsForList.has(p.id))}
          inventoryThreads={threads}
          onClose={() => setShoppingListModalOpen(false)}
        />
      )}
      {modal === "help" && <SharedModals.Help onClose={() => setModal(null)} />}
      {modal === "about" && <SharedModals.About onClose={() => setModal(null)} />}
    </>
  );
}

function PatternModal({ pattern, onSave, onClose, inventoryThreads }) {
  const [edited, setEdited] = useState({ ...pattern, threads: pattern.threads || [], fabric: pattern.fabric || "" });
  const [threadInput, setThreadInput] = useState("");
  const [threadQty, setThreadQty] = useState(1);
  const [tagInput, setTagInput] = useState("");
  const [showAutocomplete, setShowAutocomplete] = useState(false);

  const autocompleteResults = useMemo(() => {
    if (!threadInput) return [];
    const q = threadInput.toLowerCase();
    return DMC.filter(d => d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)).slice(0, 10);
  }, [threadInput]);

  const handleAddThread = (e) => {
    e.preventDefault();
    let match = DMC.find(d => d.id.toLowerCase() === threadInput.toLowerCase());

    // If no exact match by ID, check if there's an autocomplete result by name and use the first one
    if (!match && autocompleteResults.length > 0) {
      match = autocompleteResults[0];
    }

    if (match) {
      if (!edited.threads.find(t => t.id === match.id)) {
        setEdited({ ...edited, threads: [...edited.threads, { id: match.id, qty: parseInt(threadQty) || 1 }] });
      }
      setThreadInput("");
      setThreadQty(1);
      setShowAutocomplete(false);
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

  const updateThreadQty = (id, newQty) => {
    setEdited({
      ...edited,
      threads: edited.threads.map(t => t.id === id ? { ...t, qty: Math.max(1, newQty) } : t)
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

            <form onSubmit={handleAddThread} style={{ display: "flex", gap: 8, marginBottom: 16, position: "relative" }}>
              <div style={{ flex: 1, position: "relative" }}>
                <input
                  type="text"
                  value={threadInput}
                  onChange={e => { setThreadInput(e.target.value); setShowAutocomplete(true); }}
                  onFocus={() => setShowAutocomplete(true)}
                  style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 13 }}
                  placeholder="Type DMC number or color..."
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
              <input
                type="number"
                min={1}
                value={threadQty}
                onChange={e => setThreadQty(e.target.value)}
                style={{ width: 60, padding: "8px", borderRadius: 8, border: "0.5px solid #e4e4e7", fontSize: 13, textAlign: "center" }}
              />
              <button type="submit" style={{ padding: "8px 16px", background: "#f4f4f5", border: "0.5px solid #e4e4e7", borderRadius: 8, cursor: "pointer", fontWeight: 600 }}>Add</button>
            </form>

            <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 250, overflowY: "auto" }}>
              {edited.threads.map(t => {
                const info = DMC.find(d => d.id === t.id);
                const invState = inventoryThreads[t.id] || { owned: 0 };
                const missing = t.qty - invState.owned;

                return (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#fafafa", borderRadius: 8, border: "1px solid #e4e4e7" }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: info ? `rgb(${info.rgb})` : "#ccc", border: "1px solid #d4d4d8" }} />
                    <div style={{ width: 40, fontWeight: 700, fontSize: 13 }}>{t.id}</div>
                    <div style={{ flex: 1, fontSize: 12, color: "#71717a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{info ? info.name : ""}</div>

                    {missing <= 0 ? (
                      <span title="Owned" style={{ color: "#16a34a", fontSize: 12 }}>✅</span>
                    ) : invState.owned > 0 ? (
                      <span title={`Owned ${invState.owned}, need ${t.qty}`} style={{ color: "#ea580c", fontSize: 12 }}>⚠️</span>
                    ) : (
                      <span title="Missing" style={{ color: "#ef4444", fontSize: 12 }}>❌</span>
                    )}

                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input
                        type="number"
                        min={1}
                        value={t.qty}
                        onChange={e => updateThreadQty(t.id, parseInt(e.target.value))}
                        style={{ width: 40, padding: "4px", borderRadius: 4, border: "1px solid #e4e4e7", fontSize: 12, textAlign: "center" }}
                      />
                      <span style={{ fontSize: 11, color: "#a1a1aa" }}>sk</span>
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

function PatternDetailsModal({ pattern, onClose, onEdit, inventoryThreads }) {
  const statusColors = {
    wishlist: { bg: "#fef3c7", text: "#b45309", label: "Wishlist" },
    owned: { bg: "#e0e7ff", text: "#4338ca", label: "Owned" },
    inprogress: { bg: "#ffedd5", text: "#c2410c", label: "In Progress" },
    completed: { bg: "#dcfce3", text: "#15803d", label: "Completed" }
  };

  const missingThreadsCount = useMemo(() => {
    if (!pattern.threads) return 0;
    return pattern.threads.filter(t => {
      const invState = inventoryThreads[t.id] || { owned: 0 };
      return invState.owned < t.qty;
    }).length;
  }, [pattern.threads, inventoryThreads]);

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
              {(!pattern.threads || pattern.threads.length === 0) ? (
                <div style={{ fontSize: 12, color: "#a1a1aa", textAlign: "center", padding: "10px 0" }}>No threads specified.</div>
              ) : (
                pattern.threads.map(t => {
                  const info = DMC.find(d => d.id === t.id);
                  const invState = inventoryThreads[t.id] || { owned: 0 };
                  const missing = t.qty - invState.owned;

                  return (
                    <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#fafafa", borderRadius: 8, border: "1px solid #e4e4e7" }}>
                      <div style={{ width: 20, height: 20, borderRadius: 4, background: info ? `rgb(${info.rgb})` : "#ccc", border: "1px solid #d4d4d8" }} />
                      <div style={{ width: 40, fontWeight: 700, fontSize: 13 }}>{t.id}</div>
                      <div style={{ flex: 1, fontSize: 12, color: "#71717a", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{info ? info.name : ""}</div>
                      <div style={{ fontSize: 12, color: "#71717a", width: 40, textAlign: "right" }}>{t.qty} sk</div>
                      <div style={{ display: "flex", alignItems: "center", width: 80, justifyContent: "flex-end" }}>
                        {missing <= 0 ? (
                          <span style={{ color: "#16a34a", fontSize: 12, background: "#f0fdf4", padding: "2px 6px", borderRadius: 4, fontWeight: 600, border: "1px solid #bbf7d0" }}>Owned ✅</span>
                        ) : invState.owned > 0 ? (
                          <span style={{ color: "#ea580c", fontSize: 12, background: "#fff7ed", padding: "2px 6px", borderRadius: 4, fontWeight: 600, border: "1px solid #fed7aa" }}>Need {missing} ⚠️</span>
                        ) : (
                          <span style={{ color: "#ef4444", fontSize: 12, background: "#fef2f2", padding: "2px 6px", borderRadius: 4, fontWeight: 600, border: "1px solid #fecaca" }}>Missing ❌</span>
                        )}
                      </div>
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

function ShoppingListModal({ patterns, inventoryThreads, onClose }) {
  const [copied, setCopied] = useState(false);

  const missingThreads = useMemo(() => {
    // Aggregate required threads across all selected patterns
    const required = {};
    patterns.forEach(p => {
      if (!p.threads) return;
      p.threads.forEach(t => {
        if (!required[t.id]) required[t.id] = 0;
        // Option: we could take the max across patterns, or sum. Summing is safer if doing both.
        // Assuming user might stitch both, we sum.
        required[t.id] += t.qty;
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
  }, [patterns, inventoryThreads]);

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
