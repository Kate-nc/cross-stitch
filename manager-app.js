const { useState, useEffect, useMemo, useCallback, useRef } = React;

// ════════════════════════════════════════════════════════════════════
// Stash rules — one definition of "in your stash", "opened" and "low",
// shared by the thread list, its filters, the Low stock panel and the
// attention line. (They used to disagree: the card badge used the global
// threshold with <=, the alerts used each thread's minimum with <.)
// ════════════════════════════════════════════════════════════════════
const OPENED_SKEIN = { "mostly-full": 0.75, "about-half": 0.5, "remnant": 0.25 };
// Order matters: the opened-skein control lists these left to right.
const OPENED_LEVELS = [
  { value: null, label: "None", title: "No opened skein" },
  { value: "mostly-full", label: "¾", title: "About three quarters left" },
  { value: "about-half", label: "½", title: "About half left" },
  { value: "remnant", label: "¼", title: "A remnant left" },
  { value: "used-up", label: "Used up", title: "Used up" }
];
const OPENED_TEXT = { "mostly-full": "¾ left", "about-half": "½ left", "remnant": "Remnant", "used-up": "Used up" };
// The thread list renders this many rows, then offers "Show more".
const STASH_PAGE_SIZE = 200;
// Overview list lengths; each list links to its full view.
const OVERVIEW_BUY_ROWS = 8;
const OVERVIEW_READY_ROWS = 5;
const OVERVIEW_LOW_ROWS = 5;
const EMPTY_THREAD = { owned: 0, tobuy: false, partialStatus: null, min_stock: 0 };
const NO_USES = [];
const NO_TITLES = [];
// "A", "A and B", "A, B and 3 more"
function listJoin(items) {
  if (items.length <= 1) return items.join("");
  if (items.length === 2) return items[0] + " and " + items[1];
  if (items.length === 3) return items[0] + ", " + items[1] + " and " + items[2];
  return items[0] + ", " + items[1] + " and " + (items.length - 2) + " more";
}

function usableSkeins(t) {
  if (!t) return 0;
  return (Number(t.owned) || 0) + (OPENED_SKEIN[t.partialStatus] || 0);
}
function isInStash(t) {
  return !!t && ((Number(t.owned) || 0) > 0 || !!OPENED_SKEIN[t.partialStatus]);
}
function isOpenedSkein(t) { return !!t && !!OPENED_SKEIN[t.partialStatus]; }
function isUsedUp(t) { return !!t && t.partialStatus === "used-up" && !((Number(t.owned) || 0) > 0); }
// A thread's own "Keep at least" value wins; otherwise the Preferences value.
function stashMinimum(t, threshold) {
  const own = t && Number(t.min_stock);
  return own > 0 ? own : threshold;
}
// Low = you have less than the minimum. A thread with its own minimum
// counts even at zero, so using up a thread you keep stocked is flagged.
function isThreadLow(t, threshold) {
  if (!t) return false;
  const tracked = isInStash(t) || (Number(t.min_stock) || 0) > 0;
  return tracked && usableSkeins(t) < stashMinimum(t, threshold);
}
function matchesStashFilter(t, filter, threshold) {
  if (filter === "owned") return isInStash(t);
  if (filter === "low") return isThreadLow(t, threshold);
  if (filter === "opened") return isOpenedSkein(t);
  if (filter === "usedup") return isUsedUp(t);
  return true; // "all": every shade in the catalogue
}
function formatSkeins(n) {
  const v = Number(n) || 0;
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

// Opened-skein level as a small pie. Used up is an empty dashed circle, so it
// can never look fuller than a part-used skein (the old 4-bar gauge filled
// every bar for "used up").
function SkeinLevel({ status }) {
  const f = OPENED_SKEIN[status] || 0;
  const r = 6, c = 8;
  let wedge = null;
  if (f > 0) {
    const a = 2 * Math.PI * f;
    const x = c + r * Math.sin(a), y = c - r * Math.cos(a);
    wedge = <path className="stash-level-fill" d={"M" + c + " " + c + " L" + c + " " + (c - r) + " A" + r + " " + r + " 0 " + (f > 0.5 ? 1 : 0) + " 1 " + x.toFixed(2) + " " + y.toFixed(2) + " Z"} />;
  }
  return (
    <svg className={"stash-level" + (status === "used-up" ? " stash-level--empty" : "")} width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" focusable="false">
      <circle cx={c} cy={c} r={r} />
      {wedge}
    </svg>
  );
}

// Full-skein stepper. The number is an input so a big delivery can be typed
// in one go; owned can be fractional after live deductions, so it keeps
// whatever value is there and steps by whole skeins.
function SkeinStepper({ value, onChange, label, size }) {
  const [draft, setDraft] = useState(null);
  const shown = draft != null ? draft : formatSkeins(value);
  const commit = () => {
    if (draft == null) return;
    const n = Number(draft);
    setDraft(null);
    if (Number.isFinite(n) && n >= 0 && n !== value) onChange(n);
  };
  return (
    <span className={"stash-stepper" + (size === "lg" ? " stash-stepper--lg" : "")} role="group" aria-label={label}>
      <button type="button" aria-label={"One fewer: " + label} disabled={!(value > 0)} onClick={() => onChange(Math.max(0, (Number(value) || 0) - 1))}>{Icons.minus()}</button>
      <input type="number" inputMode="decimal" min="0" step="any" aria-label={label} value={shown}
        onChange={e => setDraft(e.target.value)} onBlur={commit}
        onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); e.currentTarget.blur(); } if (e.key === "Escape") { setDraft(null); e.currentTarget.blur(); } }} />
      <button type="button" aria-label={"One more: " + label} onClick={() => onChange((Number(value) || 0) + 1)}>{Icons.plus()}</button>
    </span>
  );
}

// A small anchored menu (View, Add threads). Closes on outside press and Esc.
function StashMenuButton({ label, ariaLabel, icon, className, children, align }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === "Escape") { setOpen(false); const b = wrapRef.current && wrapRef.current.querySelector("button"); if (b) b.focus(); } };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);
  return (
    <div className={"stash-menu" + (align === "end" ? " stash-menu--end" : "")} ref={wrapRef}>
      <button type="button" className={"stash-btn " + (className || "")} aria-label={ariaLabel || (typeof label === "string" ? label : undefined)} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        {icon}<span>{label}</span>{Icons.chevronDown()}
      </button>
      {open && <div className="stash-menu-panel">{children(() => setOpen(false))}</div>}
    </div>
  );
}

// One thread in the list. Memoised: typing in search re-renders the list,
// and most rows have not changed.
const StashRow = React.memo(function StashRow({ item, state, expanded, owned, uses, short, low, onToggle, onUpdate, onAdd, onShopping, onRemove }) {
  const key = item.compositeKey;
  const brandLabel = item.brand === "anchor" ? "Anchor" : "DMC";
  const title = brandLabel + " " + item.id;
  const bodyId = "stash-row-" + key.replace(/[^a-z0-9]/gi, "-");
  const swatch = <span className="stash-swatch" style={{ background: "rgb(" + item.rgb.join(",") + ")" }} aria-hidden="true" />;
  const identity = (
    <>
      {swatch}
      <span className="stash-id">
        <span className="stash-code">{item.id}</span>
        <span className={"stash-brand stash-brand--" + item.brand}>{brandLabel}</span>
        <span className="stash-name">{item.name}</span>
      </span>
    </>
  );
  if (!owned) {
    // Not in your stash: a compact row with one action.
    return (
      <li className="stash-row stash-row--add">
        <div className="stash-row-main">
          <span className="stash-ident">{identity}</span>
          {uses.length > 0 && <span className="stash-uses">{uses.map(u => <span key={u.title} className="stash-chip">{u.title}</span>)}</span>}
          <span className="stash-status">{short > 0 && <span className="stash-pill stash-pill--short">Need {formatSkeins(short)}</span>}</span>
          <button type="button" className="stash-btn stash-btn--quiet stash-add" onClick={() => onAdd(key)} aria-label={"Add " + title + " to your stash"}>{Icons.plus()}<span>Add</span></button>
        </div>
      </li>
    );
  }
  return (
    <li className={"stash-row" + (expanded ? " is-open" : "")}>
      <div className="stash-row-main">
        <button type="button" className="stash-ident" aria-expanded={expanded} aria-controls={bodyId} onClick={() => onToggle(key)} title={expanded ? "Hide details for " + title : "Show details for " + title}>
          {identity}
        </button>
        <SkeinStepper value={Number(state.owned) || 0} label={"Full skeins of " + title} onChange={v => onUpdate(key, "owned", v)} />
        <span className={"stash-opened" + (state.partialStatus ? "" : " is-none")}>
          <SkeinLevel status={state.partialStatus} />
          <span>{state.partialStatus ? OPENED_TEXT[state.partialStatus] : "Not opened"}</span>
        </span>
        <span className="stash-uses">
          {uses.length ? uses.map(u => <span key={u.title} className="stash-chip">{u.title}</span>) : <span className="stash-muted">Not in any pattern</span>}
        </span>
        <span className="stash-status">
          {short > 0 && <span className="stash-pill stash-pill--short">Short {formatSkeins(short)}</span>}
          {low && <span className="stash-pill stash-pill--low">Low</span>}
          {state.tobuy && <span className="stash-pill stash-pill--list">{Icons.cart()}On list</span>}
        </span>
        <button type="button" className="stash-chev" aria-expanded={expanded} aria-controls={bodyId} aria-label={(expanded ? "Hide details for " : "Show details for ") + title} onClick={() => onToggle(key)}>
          {expanded ? Icons.chevronUp() : Icons.chevronDown()}
        </button>
      </div>
      {expanded && (
        <div className="stash-row-edit" id={bodyId}>
          <div className="stash-field">
            <span className="stash-field-label" id={bodyId + "-opened"}>Opened skein</span>
            <div className="stash-levels" role="radiogroup" aria-labelledby={bodyId + "-opened"}>
              {OPENED_LEVELS.map(l => {
                const on = (state.partialStatus || null) === l.value;
                return <button key={l.value || "none"} type="button" role="radio" aria-checked={on} className={on ? "on" : ""} title={l.title} onClick={() => onUpdate(key, "partialStatus", l.value)}>{l.label}</button>;
              })}
            </div>
          </div>
          <div className="stash-field">
            <span className="stash-field-label">Keep at least</span>
            <SkeinStepper value={Number(state.min_stock) || 0} label={"Minimum skeins of " + title} onChange={v => onUpdate(key, "min_stock", v)} />
            <span className="stash-hint">{(Number(state.min_stock) || 0) > 0 ? "Low below " + formatSkeins(state.min_stock) : "Uses your Preferences default"}</span>
          </div>
          <div className="stash-field stash-field--grow">
            <span className="stash-field-label">Patterns</span>
            {uses.length ? (
              <ul className="stash-needs">
                {uses.map(u => <li key={u.title}><span>{u.title}</span>{u.need != null && <b>{u.need}</b>}</li>)}
              </ul>
            ) : <span className="stash-muted">Not in any pattern</span>}
          </div>
          <div className="stash-field stash-actions">
            {state.tobuy
              ? <button type="button" className="stash-btn" onClick={() => onShopping(key, false)}>{Icons.x()}<span>Remove from shopping list</span></button>
              : <button type="button" className="stash-btn stash-btn--primary" onClick={() => onShopping(key, true, short > 0 ? short : 1)}>{Icons.cart()}<span>{short > 0 ? "Add " + formatSkeins(short) + " to shopping list" : "Add to shopping list"}</span></button>}
            <button type="button" className="stash-btn stash-btn--danger" onClick={() => onRemove(key, title)}>{Icons.trash()}<span>Remove from stash</span></button>
          </div>
        </div>
      )}
    </li>
  );
});

// Presentation only: stable preference keys survive empty alert sets and tab visits.
function StashAlertPanel({ id, title, count, countLabel, icon, tone = "", preferenceKey, children }) {
  const [collapsed, setCollapsed] = useState(() => {
    try { return window.UserPrefs && window.UserPrefs.get(preferenceKey) === true; }
    catch (_) { return false; }
  });
  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    try { if (window.UserPrefs) window.UserPrefs.set(preferenceKey, next); } catch (_) {}
  };
  return (
    <section className={"alert-card stash-alert " + tone + (collapsed ? " is-collapsed" : "")} aria-labelledby={id + "-heading"}>
      <h3 id={id + "-heading"} className="stash-alert-heading">
        <button type="button" className="stash-alert-toggle" aria-expanded={!collapsed} aria-controls={id + "-body"} onClick={toggle}>
          <span className="stash-alert-icon" aria-hidden="true">{icon}</span>
          <span className="stash-alert-title">{title} <span className="stash-alert-count">({countLabel != null ? countLabel : count})</span></span>
          <span className="stash-alert-chevron" aria-hidden="true">{collapsed ? Icons.chevronRight() : Icons.chevronDown()}</span>
        </button>
      </h3>
      <div id={id + "-body"} className="stash-alert-body" hidden={collapsed}>{children}</div>
    </section>
  );
}

function ManagerApp() {
  const [tab, setTab] = useState(() => {
    // Deep links: ?tab=inventory|patterns from the Creator's thread links and
    // Open-Stash button; ?tab=shopping from the Creator's shopping list;
    // ?tab=materials (the old Project materials tab) now lives inside the
    // Shopping list tab.
    try {
      const p = new URLSearchParams(window.location.search).get('tab');
      if (p === 'inventory' || p === 'patterns') return p;
      if (p === 'shopping' || p === 'materials') return 'shopping';
      if (p === 'overview' || p === 'catalogues' || p === 'transfer') return p;
    } catch (_) {}
    // The Overview is the Stash Manager's home page; links that should
    // open the thread list pass ?tab=inventory.
    return "overview";
  }); // 'overview' | 'inventory' | 'shopping' | 'patterns' | 'catalogues' | 'transfer'
  const [modal, setModal] = useState(null); // 'help', 'about', 'add_pattern'
  const [threads, setThreads] = useState({}); // { [id]: { owned: number, tobuy: boolean } }
  // Latest patterns for stable callbacks (the Overview's Ready to start).
  const patternsLatestRef = useRef([]);
  // Latest threads for stable callbacks (Undo needs the values before an edit).
  const latestThreadsRef = useRef(threads);
  latestThreadsRef.current = threads;
  const threadsBaselineRef=useRef({});
  const threadsSaveQueueRef=useRef(Promise.resolve());
  const threadsSavingRef=useRef(false);
  function persistThreadEdits(next) {
    const work=threadsSaveQueueRef.current.catch(()=>{}).then(async()=>{
      threadsSavingRef.current=true;
      try {
        await StashBridge.saveThreadEdits(next,threadsBaselineRef.current);
        threadsBaselineRef.current=next;
      } finally {threadsSavingRef.current=false;}
    });
    threadsSaveQueueRef.current=work;
    return work;
  }
  const [patterns, setPatterns] = useState([]); // Array of pattern objects
  patternsLatestRef.current = patterns;
  const [activeProject, setActiveProject] = useState(null); // From Stitch Tracker IndexedDB
  const [storedProjects, setStoredProjects] = useState([]); // Cross-stitch projects from ProjectStorage
  const [storageUsage, setStorageUsage] = useState(null); // { used, quota, persistent } bytes
  const [searchQuery, setSearchQuery] = useState("");
  // Owned is the default: the list opens on your threads, not on all 1,229
  // catalogue shades. 'owned' | 'low' | 'opened' | 'usedup' | 'all'
  const [threadFilter, setThreadFilter] = useState("owned");
  const [listLimit, setListLimit] = useState(STASH_PAGE_SIZE);
  const [catalogueRecords, setCatalogueRecords] = useState([]);
  // Shopping list rows ticked as bought: { [key]: skeins to add }. Nothing
  // is written until "Add ... to stash".
  const [boughtTicks, setBoughtTicks] = useState({});
  useEffect(() => { ThreadCatalogues.read().then(setCatalogueRecords).catch(e => console.warn('Custom catalogues could not be read:', e)); }, []);
  const [brandFilter, setBrandFilter] = useState("all"); // 'all', 'dmc', 'anchor'
  const [threadSort, setThreadSort] = useState("number"); // 'number', 'colour', 'name', 'owned_desc', 'owned_asc'
  const _UP = (k, fb) => { try { return (window.UserPrefs && window.UserPrefs.get(k)) || fb; } catch (_) { return fb; } };
  const [patternFilter, setPatternFilter] = useState(() => _UP("patternsDefaultFilter", "all")); // 'all', 'wishlist', 'owned', 'inprogress', 'completed'
  const [patternSort, setPatternSort] = useState(() => _UP("patternsDefaultSort", "date_desc")); // 'date_desc', 'date_asc', 'title_asc', 'designer_asc', 'status'
  const [editingPattern, setEditingPattern] = useState(null); // Pattern object currently being added/edited
  const [viewingPattern, setViewingPattern] = useState(null); // Pattern object currently being viewed for details
  // The thread row whose editor is open. It stays listed even if an edit
  // moves it out of the current filter (see filteredThreads).
  const [expandedThread, setExpandedThread] = useState(null);
  const [conflicts, setConflicts] = useState(null);
  // What the stash is short of: { projects, total, shopping } from StashBridge.getToBuy().
  const [toBuy, setToBuy] = useState(null);
  const [readyToStart, setReadyToStart] = useState(null);
  const [lowStockAlerts, setLowStockAlerts] = useState(null);
  // Signature of the attention line the user last dismissed; it comes back
  // when the numbers change.
  const [attentionDismissed, setAttentionDismissed] = useState(() => {
    try { return (window.UserPrefs && window.UserPrefs.get("stashAttentionDismissed")) || ""; } catch (_) { return ""; }
  });
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
  // Global "?" shortcut ? open Help Centre.
  useEffect(() => {
    const h = () => setModal("help");
    window.addEventListener("cs:openHelp", h);
    return () => window.removeEventListener("cs:openHelp", h);
  }, []);
  // Command Palette ? Keyboard Shortcuts modal.
  useEffect(() => {
    const h = () => setModal("shortcuts");
    window.addEventListener("cs:openShortcuts", h);
    return () => window.removeEventListener("cs:openShortcuts", h);
  }, []);
  // Command Palette ? Bulk Add Threads bridge.
  useEffect(() => {
    const h = () => setBulkAddOpen(true);
    window.addEventListener("cs:openBulkAdd", h);
    return () => window.removeEventListener("cs:openBulkAdd", h);
  }, []);
  // Auto-close the detail panel when the screen drops below 900px (portrait)
  // where the panel backdrop is visible but the side panel is gone — prevents
  // a ghost dark overlay after screen rotation.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(max-width: 899px)');
    const onNarrow = () => { if (mql.matches) setPanelOpen(false); };
    if (mql.addEventListener) mql.addEventListener('change', onNarrow);
    else if (mql.addListener) mql.addListener(onNarrow);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onNarrow);
      else if (mql.removeListener) mql.removeListener(onNarrow);
    };
  }, []);
  // Command Palette ? Preferences modal bridge (UX-12 Phase 6 PR #11).
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

  // Global "B" shortcut ? open Bulk Add Threads from anywhere on the Manager
  // page. Registered through the central shortcuts registry.
  // Switch section (nav links, number keys, Overview links).
  const goTab = useCallback(id => { setTab(id); setSearchQuery(""); setPanelOpen(false); }, []);
  // Keep ?tab= in the address, so a reload or a shared link reopens the
  // same section. Other parameters (from=home, action=…) are left alone.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.get('tab') === tab) return;
      u.searchParams.set('tab', tab);
      window.history.replaceState(window.history.state, '', u.pathname + u.search + u.hash);
    } catch (_) {}
  }, [tab]);
  if(typeof window.useShortcuts==='function'){
    const managerKeys = [
      { id: 'manager.section.overview', keys: '1', scope: 'global', description: 'Show Overview', run: () => goTab('overview') },
      { id: 'manager.section.threads', keys: '2', scope: 'global', description: 'Show Thread Stash', run: () => goTab('inventory') },
      { id: 'manager.section.shopping', keys: '3', scope: 'global', description: 'Show Shopping list', run: () => goTab('shopping') },
      { id: 'manager.section.patterns', keys: '4', scope: 'global', description: 'Show Pattern Library', run: () => goTab('patterns') }
    ];
    if (typeof window.BulkAddModal !== 'undefined') managerKeys.push(
      { id: 'global.bulkAdd.manager', keys: 'b', scope: 'global',
        description: 'Open Bulk Add Threads',
        run: ()=>setBulkAddOpen(true) });
    window.useShortcuts(managerKeys,[]);
  }
  // "Show welcome tour again" from HelpCentre ? re-open the wizard.
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
    // Orphan cleanup first: an entry whose linkedProjectId matches no stored
    // project is counted by the Pattern Library badge but never renders a
    // card (linked entries rely on their project's card; see
    // project-library.js manualPatterns). Sync used to manufacture these when
    // a remote stash carried entries for projects this device declined.
    //   • auto-synced orphans are dropped — reconcile re-creates them if the
    //     project ever arrives;
    //   • manually curated orphans keep their user data and become
    //     manual-only entries, so they at least render with the
    //     "Stash Manager only" badge.
    const metaIds = new Set(allMeta.map(m => m.id));
    let cleaned = basePatterns;
    if (basePatterns.some(p => p.linkedProjectId && !metaIds.has(p.linkedProjectId))) {
      cleaned = [];
      for (const p of basePatterns) {
        if (!p.linkedProjectId || metaIds.has(p.linkedProjectId)) { cleaned.push(p); continue; }
        if (p.tags && p.tags.includes('auto-synced')) continue;
        const manualCopy = { ...p };
        delete manualCopy.linkedProjectId;
        cleaned.push(manualCopy);
      }
    }

    // Build a map of linkedProjectId ? index for fast lookup.
    const linkedIdxMap = new Map(
      cleaned.map((p, i) => p.linkedProjectId ? [p.linkedProjectId, i] : null).filter(Boolean)
    );
    const unlinked = allMeta.filter(m => !linkedIdxMap.has(m.id));

    // For each project that already has a library entry, check whether its name
    // changed (e.g. renamed on another device via sync). If so, update title only —
    // leave user-set fields (designer, tags, status) untouched.
    let reconciled = updateTitleIfChanged(cleaned, allMeta, linkedIdxMap);

    if (unlinked.length === 0) return reconciled;
    return await addUnlinkedPatterns(reconciled, cleaned, unlinked);
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

  // Per-store gate so the debounced auto-save effects below skip the synthetic
  // setState that fires once on mount with the initial empty value, AND skip
  // re-write when an external listener (cs:stashChanged, cs:patternsChanged,
  // visibilitychange) reloads a slice from IDB. Without these gates the
  // listener -> setState -> auto-save -> dispatch -> listener cycle would loop
  // and (worse) clobber concurrent writes from StashBridge by writing the
  // stale React copy back over IDB.
  const initialLoadDoneRef = React.useRef({ threads: false, patterns: false, profile: false });

  // Storage initialization
  useEffect(() => {
    // Load Manager Data
    const loadManagerData = async () => {
      try {
        if (typeof window.loadAnchorData === 'function') {
          await window.loadAnchorData({ failMessage: 'Could not load the Anchor catalogue for the Stash Manager. Reload and try again.' });
        }
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

        // Version 4 already has composite keys and per-thread minima; do not re-migrate it.
        if (threadsData && versionData !== 2 && versionData !== 3 && versionData !== 4) {
          // Backup
          store.put(threadsData, "threads_backup_v1");

          // Migrate v1 ? v3
          finalThreads = {};
          for (const [id, t] of Object.entries(threadsData)) {
            finalThreads[id] = { ...t, partialStatus: t.partialStatus || null, min_stock: 0 };
          }
          store.put(finalThreads, "threads");
          store.put(3, "stashDataVersion");
        } else if (threadsData && versionData === 2) {
          // Migrate v2 ? v3: add min_stock
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

        // v3 ? v4: convert bare DMC keys to composite keys and add Anchor threads
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

        threadsBaselineRef.current=finalThreads;
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
          // Suppress the auto-save that this setPatterns would otherwise trigger;
          // IDB is already up-to-date (we just read from it). Without this, the
          // write-back would race with concurrent Creator-side syncProjectToLibrary
          // calls and could clobber a freshly-written entry from another tab.
          initialLoadDoneRef.current.patterns = false;
          setPatterns(reconciled);
        } catch (e) {
          // Fallback: reconcile with current state only
          setPatterns(prev => {
            (async () => {
              const reconciled = await reconcileAutoSyncedPatterns(prev, meta);
              if (reconciled !== prev) {
                initialLoadDoneRef.current.patterns = false;
                setPatterns(reconciled);
              }
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

    // Live refresh when other tabs/components mutate projects, the auto-synced
    // pattern library, or the stash. Without these the Manager only refreshes
    // on visibilitychange — so a pattern just generated in the Creator wouldn't
    // appear here until the user clicked away and back.
    const handleProjectsOrPatternsChanged = () => {
      handleVisibilityChange();
    };
    window.addEventListener('cs:projectsChanged', handleProjectsOrPatternsChanged);
    window.addEventListener('cs:patternsChanged', handleProjectsOrPatternsChanged);

    // External writers (StashBridge.setToBuyQty, markBought, etc.) mutate
    // manager_state.threads directly and dispatch cs:stashChanged. We must
    // re-load the threads slice from IDB so the React copy doesn't go stale —
    // otherwise the next debounced auto-save will write the stale React state
    // back over IDB and silently wipe the bridge's mutation.
    const handleStashChanged = async () => {
      if(threadsSavingRef.current)return;
      const baselineAtRead=threadsBaselineRef.current;
      try {
        const db = await openManagerDB();
        const fresh = await new Promise((resolve, reject) => {
          const tx = db.transaction("manager_state", "readonly");
          const req = tx.objectStore("manager_state").get("threads");
          req.onsuccess = () => resolve(req.result || {});
          req.onerror = () => reject(req.error);
        });
        // Discard a refresh whose baseline advanced during the IDB read.
        if(threadsSavingRef.current||threadsBaselineRef.current!==baselineAtRead)return;
        threadsBaselineRef.current=fresh;
        setThreads(current=>{
          const merged={...fresh};
          for(const key of Object.keys(current)) {
            const before=baselineAtRead[key]||{},after=current[key]||{};
            const edits=Object.keys(after).filter(f=>JSON.stringify(after[f])!==JSON.stringify(before[f]));
            if(!edits.length)continue;
            merged[key]={...(fresh[key]||{})};
            edits.forEach(f=>{merged[key][f]=f==='owned'?Math.max(0,(Number(fresh[key]&&fresh[key].owned)||0)+(Number(after.owned)||0)-(Number(before.owned)||0)):after[f];});
          }
          return merged;
        });
      } catch (e) { console.warn('cs:stashChanged reload failed:', e); }
    };
    window.addEventListener('cs:stashChanged', handleStashChanged);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('cs:backupRestored', handleBackupRestored);
      window.removeEventListener('cs:projectsChanged', handleProjectsOrPatternsChanged);
      window.removeEventListener('cs:patternsChanged', handleProjectsOrPatternsChanged);
      window.removeEventListener('cs:stashChanged', handleStashChanged);
    };
  }, []);

  // Auto-save Manager Data
  // Split per store so a debounced write of one slice (e.g. patterns) cannot
  // overwrite another slice (e.g. threads) with the React copy that has gone
  // stale because StashBridge mutated the IDB directly behind our back. The
  // canonical bug this prevents: clicking "Add to My list" in the per-pattern
  // ShoppingListModal calls StashBridge.setToBuyQtyMany which writes
  // tobuy:true straight into manager_state.threads. If the React `threads`
  // copy is then re-written wholesale by a patterns-triggered auto-save, the
  // tobuy flag is silently wiped within ~1 s.
  useEffect(() => {
    if (!initialLoadDoneRef.current.threads) { initialLoadDoneRef.current.threads = true; return; }
    const saveTimer = setTimeout(async () => {
      try {
        await persistThreadEdits(threads);
      } catch (err) { console.error("Threads auto-save failed:", err); }
    }, 1000);
    return () => clearTimeout(saveTimer);
  }, [threads]);
  useEffect(() => {
    if (!initialLoadDoneRef.current.patterns) { initialLoadDoneRef.current.patterns = true; return; }
    const saveTimer = setTimeout(async () => {
      try {
        const db = await openManagerDB();
        const tx = db.transaction(["manager_state"], "readwrite");
        tx.objectStore("manager_state").put(patterns, "patterns");
        tx.oncomplete = () => {
          try { window.dispatchEvent(new CustomEvent('cs:patternsChanged')); } catch (_) {}
        };
      } catch (err) { console.error("Patterns auto-save failed:", err); }
    }, 1000);
    return () => clearTimeout(saveTimer);
  }, [patterns]);
  useEffect(() => {
    if (!initialLoadDoneRef.current.profile) { initialLoadDoneRef.current.profile = true; return; }
    const saveTimer = setTimeout(async () => {
      try {
        const db = await openManagerDB();
        const tx = db.transaction(["manager_state"], "readwrite");
        tx.objectStore("manager_state").put(userProfile, "userProfile");
      } catch (err) { console.error("Profile auto-save failed:", err); }
      // VER-EL-SCR-031-01-01: mirror profile fields to UserPrefs so Creator's
      // defaults (which read from cs_pref_*) stay in sync. UserPrefs.set
      // already dispatches cs:prefchange; cs:prefsChanged is dispatched as well
      // (as preferences-modal.js does) so its live listeners react without
      // requiring a reload.
      try {
        if (window.UserPrefs && typeof window.UserPrefs.set === "function") {
          const map = {
            creatorDefaultFabricCount: userProfile.fabric_count,
            stitchStrandsUsed: userProfile.strands_used,
            stashDefaultBrand: userProfile.thread_brand,
            stitchWasteFactor: userProfile.waste_factor
          };
          Object.keys(map).forEach((key) => {
            const value = map[key];
            if (value == null) return;
            try {
              const prev = window.UserPrefs.get(key);
              if (prev === value) return;
              window.UserPrefs.set(key, value);
              window.dispatchEvent(new CustomEvent("cs:prefsChanged", { detail: { key, value } }));
            } catch (_) {}
          });
        }
      } catch (_) {}
    }, 1000);
    return () => clearTimeout(saveTimer);
  }, [userProfile]);

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
        // Versionless open via the canonical helper: a hard-coded version 1
        // fails with VersionError once the database has been repaired to 2.
        window.openManagerDB().then((db) => {
          const tx = db.transaction(["manager_state"], "readwrite");
          const store = tx.objectStore("manager_state");
          persistThreadEdits(threadsRef.current).catch(err=>console.warn("Threads unload save failed:",err));
          store.put(patternsRef.current, "patterns");
          store.put(profileRef.current, "userProfile");
        }).catch(() => {});
      } catch (err) {}
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [threads, patterns, userProfile]);

  // Smart Stash Hub: refresh conflicts, ready-to-start, and low-stock alerts
  useEffect(() => {
    if (typeof StashBridge === "undefined") return;
    StashBridge.detectConflicts().then(setConflicts).catch(e => console.warn('detectConflicts failed:', e));
    refreshToBuy();
    StashBridge.whatCanIStart().then(setReadyToStart).catch(e => console.warn('whatCanIStart failed:', e));
    // Low stock uses the shared rule (isThreadLow): opened skeins count
    // towards what you have, and a thread's own minimum beats the default.
    const alerts = Object.entries(threads)
      .filter(([, t]) => isThreadLow(t, lowStockThreshold))
      .map(([compositeKey, t]) => {
        const { brand, bareId } = extractBrandAndId(compositeKey);
        const info = typeof getThreadByKey === 'function' ? getThreadByKey(compositeKey) : findThreadInCatalog('dmc', bareId);
        return { id: compositeKey, brand, bareId, name: info ? info.name : bareId, rgb: info ? info.rgb : [128,128,128], owned: usableSkeins(t), min_stock: stashMinimum(t, lowStockThreshold) };
      });
    alerts.sort((a, b) => (b.min_stock - b.owned) - (a.min_stock - a.owned));
    setLowStockAlerts(alerts);
  }, [threads, patterns]);

  // Latest-wins: a slow read must not overwrite a newer one.
  const toBuyReadRef = useRef(0);
  function refreshToBuy() {
    if (typeof StashBridge === "undefined") return Promise.resolve();
    const read = ++toBuyReadRef.current;
    return StashBridge.getToBuy()
      .then(result => { if (read === toBuyReadRef.current) setToBuy(result); })
      .catch(e => console.warn('getToBuy failed:', e));
  }

  function addToShoppingList(project) {
    const rows = project.threads.filter(t => !(threads[t.key] && threads[t.key].tobuy));
    if (!rows.length) return;
    const qtyMap = {};
    rows.forEach(t => { qtyMap[t.key] = t.toBuy; });
    StashBridge.markManyToBuy(rows.map(t => t.key), true, qtyMap).then(changed => {
      refreshToBuy();
      if (window.Toast) window.Toast.show({ message: changed > 0 ? plural(changed, 'thread') + ' added to your shopping list' : 'Already on your shopping list', type: 'success' });
    }).catch(() => {
      if (window.Toast) window.Toast.show({ message: 'Could not update your shopping list', type: 'error' });
    });
  }

  function extractBrandAndId(compositeKey) {
    if (compositeKey.indexOf(':') < 0) return { brand: 'dmc', bareId: compositeKey };
    const parts = compositeKey.split(':');
    return { brand: parts[0], bareId: parts.slice(1).join(':') };
  }


  // Split low-stock alerts into those needed by active projects vs. not
  const { lowStockNeeded, lowStockNotNeeded } = useMemo(() => {
    if (!lowStockAlerts) return { lowStockNeeded: null, lowStockNotNeeded: null };
    const activeIds = new Set();
    patterns.forEach(pat => {
      if (pat.status === 'completed') return;
      if (pat.threads) pat.threads.forEach(t => {
        activeIds.add(t.id);
        if (t.is_blended && t.blend_id) activeIds.add(t.blend_id);
      });
    });
    return {
      lowStockNeeded: lowStockAlerts.filter(a => activeIds.has(a.bareId || a.id)),
      lowStockNotNeeded: lowStockAlerts.filter(a => !activeIds.has(a.bareId || a.id)),
    };
  }, [lowStockAlerts, patterns]);

  // Delegates to the canonical opener in helpers.js. A hard-coded
  // open(name, 1) cannot create manager_state on a database that already
  // exists at version 1 without it (onupgradeneeded never fires), and would
  // fail with VersionError once that database has been repaired to 2.
  function openManagerDB() {
    ensurePersistence();
    return window.openManagerDB();
  }

  const handleBackupDownload = async () => {
    try {
      setBackupStatus({ type: "success", message: "Creating backup..." });
      // Loaded on demand — see lazy-modules.js.
      await (await window.loadBackupRestore()).downloadBackup();
      setBackupStatus({ type: "success", message: "Backup download requested. Check that the file was saved." });
      try { window.Toast && window.Toast.show && window.Toast.show({ message: "Backup download requested. Check that the file was saved.", type: "success" }); } catch (_) {}
      setTimeout(() => setBackupStatus(null), 3000);
    } catch (e) {
      setBackupStatus({ type: "error", message: "Backup failed: " + e.message });
      try { window.Toast && window.Toast.show && window.Toast.show({ message: "Backup failed: " + e.message, type: "error" }); } catch (_) {}
    }
  };

  const handleRestoreFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    if (file.size > 64 * 1024 * 1024) { setBackupStatus({ type: "error", message: "Backup exceeds the 64 MiB file limit." }); e.target.value = ""; return; }
    const reader = new FileReader();
    reader.onload = async () => {
      let BackupRestore;
      try {
        // parseBackupText and validate return synchronously, so the lazily
        // loaded module has to be in place before either runs. onConfirm below
        // closes over this binding for the restore call.
        BackupRestore = await window.loadBackupRestore();
      } catch (err) {
        setBackupStatus({ type: "error", message: "Could not load backup tools. Check your connection and try again." });
        return;
      }
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
          message: `Restore backup from ${check.summary.createdAt ? new Date(check.summary.createdAt).toLocaleString('en-GB') : "unknown date"}? ${check.summary.completeness}. Existing projects are retained; identical records are skipped and conflicting IDs stop the import. Portable settings replace your current choices.`,
          summary: check.summary,
          onConfirm: async () => {
            try {
              setBackupStatus({ type: "success", message: "Restoring..." });
              const summary = await BackupRestore.restore(backup);
              setBackupStatus({ type: "success", message: summary.unchanged ? "Backup already present; nothing changed." : "Restored! Reloading..." });
              try {
                const parts = [];
                if (summary && summary.projectCount) parts.push(summary.projectCount + " project" + (summary.projectCount === 1 ? "" : "s"));
                if (summary && summary.threadCount) parts.push(summary.threadCount + " thread" + (summary.threadCount === 1 ? "" : "s"));
                if (summary && summary.patternCount) parts.push(summary.patternCount + " pattern" + (summary.patternCount === 1 ? "" : "s"));
                const msg = parts.length ? ("Restore complete: " + parts.join(", ")) : "Restore complete";
                window.Toast && window.Toast.show && window.Toast.show({ message: msg, type: "success" });
              } catch (_) {}
              if (summary.requiresReload) window.location.reload();
            } catch (err) {
              setBackupStatus({ type: "error", message: "Restore failed: " + err.message });
              try { window.Toast && window.Toast.show && window.Toast.show({ message: "Restore failed: " + err.message, type: "error" }); } catch (_) {}
            }
          }
        });
      } catch (err) {
        setBackupStatus({ type: "error", message: "Invalid backup: " + err.message });
      }
    };
    reader.onerror = () => setBackupStatus({ type: "error", message: "Could not read the backup file." });
    reader.readAsText(file);
    e.target.value = "";
  };

  const updateThread = (id, field, value) => {
    setThreads(prev => {
      const prevEntry = prev[id] || {};
      const updated = {
        ...prevEntry,
        [field]: value
      };

      // If setting "used-up", auto-zero the skeins
      if (field === "partialStatus" && value === "used-up") {
        updated.owned = 0;
      }
      // If setting skeins to > 0 while "used-up" is selected, clear "used-up" to prevent conflicting states
      if (field === "owned" && value > 0 && prevEntry.partialStatus === "used-up") {
        updated.partialStatus = null;
      }

      // V3 acquisition/history tracking — mirrors the logic in StashBridge.updateThreadOwned.
      // Only runs when the entry already has V3 fields (addedAt defined), meaning the
      // migrateSchemaToV3 auto-migration has already stamped the record.
      if (prevEntry.addedAt !== undefined) {
        const LEGACY_EP = '2020-01-01T00:00:00Z';
        const prevOwned = prevEntry.owned || 0;
        // Compute the new owned count: direct when field='owned'; implicit zero when partialStatus='used-up'
        const newOwned = field === 'owned' ? value
          : (field === 'partialStatus' && value === 'used-up') ? 0
          : prevOwned;
        const delta = newOwned - prevOwned;
        if (delta !== 0) {
          const now = new Date().toISOString();
          // Re-acquisition: thread was legacy (at zero) and is now first owned — tag with today's date.
          if (prevOwned === 0 && newOwned > 0 && prevEntry.addedAt === LEGACY_EP) {
            updated.addedAt = now;
            updated.acquisitionSource = null;
          }
          updated.lastAdjustedAt = now;
          const newHistory = [...(prevEntry.history || []), { date: now, delta }];
          updated.history = newHistory.length > 500 ? newHistory.slice(-500) : newHistory;
        }
      }

      return {
        ...prev,
        [id]: updated
      };
    });
  };

  // The whole catalogue: DMC then Anchor. Anchor's list loads on demand (see
  // loadManagerData), so rebuild once it arrives or owned Anchor threads
  // would be missing from the list.
  const anchorLoaded = typeof ANCHOR !== 'undefined' && ANCHOR.length > 0;
  const catalogueItems = useMemo(() => {
    const dmcItems = DMC.map(d => ({ ...d, brand: 'dmc', compositeKey: threadKey('dmc', d.id) }));
    const anchorItems = typeof ANCHOR !== 'undefined' ? ANCHOR.map(a => ({ ...a, brand: 'anchor', compositeKey: threadKey('anchor', a.id) })) : [];
    return dmcItems.concat(anchorItems);
  }, [anchorLoaded]);

  const filteredThreads = useMemo(() => {
    const allItems = brandFilter === 'all' ? catalogueItems : catalogueItems.filter(d => d.brand === brandFilter);
    const q = searchQuery.trim().toLowerCase();
    const searched = q ? allItems.filter(d => d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)) : allItems;

    const filtered = searched.filter(d => {
      if (d.compositeKey === expandedThread) return true;
      return matchesStashFilter(threads[d.compositeKey], threadFilter, lowStockThreshold);
    });

    if (threadSort === 'number') return filtered;
    const sorted = filtered.slice();
    const owned = d => usableSkeins(threads[d.compositeKey]);
    if (threadSort === 'colour') {
      sorted.sort((a, b) => rgbToHue(a.rgb) - rgbToHue(b.rgb));
    } else if (threadSort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (threadSort === 'owned_desc') {
      sorted.sort((a, b) => owned(b) - owned(a));
    } else if (threadSort === 'owned_asc') {
      sorted.sort((a, b) => owned(a) - owned(b));
    }
    return sorted;
  }, [catalogueItems, searchQuery, threads, threadFilter, brandFilter, expandedThread, threadSort, lowStockThreshold]);

  // Searching from a stash view also offers shades you don't own yet, so the
  // search box doubles as "add a thread".
  const searchAdditions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q || threadFilter === 'all') return [];
    const listed = new Set(filteredThreads.map(d => d.compositeKey));
    const pool = brandFilter === 'all' ? catalogueItems : catalogueItems.filter(d => d.brand === brandFilter);
    const out = [];
    for (const d of pool) {
      if (listed.has(d.compositeKey) || isInStash(threads[d.compositeKey])) continue;
      if (d.id.toLowerCase().includes(q) || d.name.toLowerCase().includes(q)) {
        out.push(d);
        if (out.length >= 24) break;
      }
    }
    // Exact number matches first: typing "72" should show 720 before 3072.
    out.sort((a, b) => (b.id.toLowerCase().startsWith(q) ? 1 : 0) - (a.id.toLowerCase().startsWith(q) ? 1 : 0));
    return out;
  }, [catalogueItems, searchQuery, threadFilter, brandFilter, threads, filteredThreads]);

  // Reset paging whenever the list changes shape.
  useEffect(() => { setListLimit(STASH_PAGE_SIZE); }, [threadFilter, brandFilter, searchQuery, threadSort]);

  // Counts for the filter control and the tab badge.
  const stashCounts = useMemo(() => {
    const c = { owned: 0, low: 0, opened: 0, usedup: 0, dmc: 0, anchor: 0, fullSkeins: 0 };
    for (const k in threads) {
      if (!Object.prototype.hasOwnProperty.call(threads, k)) continue;
      const t = threads[k];
      if (isInStash(t)) {
        c.owned++;
        if (k.indexOf('anchor:') === 0) c.anchor++; else c.dmc++;
        c.fullSkeins += Number(t.owned) || 0;
      }
      if (isThreadLow(t, lowStockThreshold)) c.low++;
      if (isOpenedSkein(t)) c.opened++;
      if (isUsedUp(t)) c.usedup++;
    }
    return c;
  }, [threads, lowStockThreshold]);

  // Which active patterns use each thread, keyed by composite key.
  const usesByKey = useMemo(() => {
    const map = {};
    patterns.forEach(p => {
      if (!p || p.status === 'completed' || !Array.isArray(p.threads)) return;
      p.threads.forEach(t => {
        const k = typeof libraryThreadKey === 'function' ? libraryThreadKey(t) : normaliseStashKey(t.id);
        const list = map[k] || (map[k] = []);
        if (list.some(u => u.title === (p.title || 'Untitled'))) return;
        const isSkeins = !t.unit || t.unit === 'skeins';
        list.push({ title: p.title || 'Untitled', need: isSkeins && t.qty ? plural(t.qty, 'skein') : null });
      });
    });
    return map;
  }, [patterns]);

  // How many skeins short each thread is across all active patterns.
  const shortByKey = useMemo(() => {
    const map = {};
    if (toBuy && toBuy.total) toBuy.total.forEach(t => { map[t.key] = t.toBuy; });
    return map;
  }, [toBuy]);

  function rgbToHue(rgb) {
    const r = rgb[0] / 255, g = rgb[1] / 255, b = rgb[2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d < 0.05) return 361; // near-grey/white/black sort to the end
    let h;
    if (max === r) h = ((g - b) / d + 6) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    return h * 60;
  }

  // Row callbacks are stable so React.memo can skip unchanged rows.
  const toggleRow = useCallback(key => setExpandedThread(cur => cur === key ? null : key), []);
  const updateThreadCb = useCallback((key, field, value) => updateThread(key, field, value), []);
  const addThreadToStash = useCallback(key => {
    updateThread(key, "owned", 1);
    setExpandedThread(key);
  }, []);
  const removeFromStash = useCallback((key, label) => {
    const prev = latestThreadsRef.current[key] || {};
    const prevOwned = prev.owned || 0, prevPartial = prev.partialStatus || null;
    updateThread(key, "owned", 0);
    updateThread(key, "partialStatus", null);
    if (window.Toast) {
      window.Toast.show({
        message: label + " removed from stash",
        type: "info",
        undoAction: () => {
          updateThread(key, "owned", prevOwned);
          updateThread(key, "partialStatus", prevPartial);
        }
      });
    }
  }, []);
  const setOnShoppingList = useCallback((key, add, qty) => {
    if (typeof StashBridge === "undefined") return;
    const work = add ? StashBridge.markManyToBuy([key], true, { [key]: qty || 1 }) : StashBridge.updateThreadToBuy(key, false);
    Promise.resolve(work).then(() => {
      refreshToBuy();
      if (window.Toast) window.Toast.show({ message: add ? "Added to your shopping list" : "Removed from your shopping list", type: "success" });
    }).catch(() => {
      if (window.Toast) window.Toast.show({ message: "Could not update your shopping list", type: "error" });
    });
  }, []);
  // Overview tiles and links: open Thread Stash on a filter, optionally with
  // a search and the search box focused (typing on the Overview carries on
  // in Thread Stash's own search box).
  const [searchFocusTick, setSearchFocusTick] = useState(0);
  const goToThreads = useCallback((filter, query, focus) => {
    setTab("inventory");
    setThreadFilter(filter || "owned");
    setSearchQuery(query || "");
    setExpandedThread(null);
    if (focus) setSearchFocusTick(n => n + 1);
  }, []);
  useEffect(() => {
    if (!searchFocusTick || tab !== "inventory") return;
    const raf = requestAnimationFrame(() => {
      const el = document.querySelector('.stash-toolbar .stash-search input');
      if (el) { el.focus(); const n = el.value.length; try { el.setSelectionRange(n, n); } catch (_) {} }
    });
    return () => cancelAnimationFrame(raf);
  }, [searchFocusTick, tab]);
  // Ready to start: open the pattern's details in the Pattern Library.
  const openPattern = useCallback(id => {
    const p = patternsLatestRef.current.find(x => String(x.id) === String(id));
    setTab("patterns");
    setSearchQuery("");
    if (p) { setViewingPattern(p); setPanelOpen(true); }
  }, []);
  // Jump from anywhere (Shopping list rows, pattern details) to one thread.
  const openThread = useCallback(key => {
    const parts = String(key).split(':');
    setTab("inventory");
    setBrandFilter("all");
    setThreadFilter("all");
    setSearchQuery(parts.length > 1 ? parts.slice(1).join(':') : parts[0]);
    setExpandedThread(key);
  }, []);

  const totalOwnedCount = useMemo(() => {
    return Object.values(threads).reduce((sum, t) => sum + (t.owned || 0), 0);
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

  // VER-EL-SCR-030-06-01: per-pattern duplicate action. Clones the record with
  // a fresh id, suffixes the title with "(copy)" (or "(copy N)" if duplicates
  // already exist), and clears any linkedProjectId so the copy is independent
  // of the original's Creator/Tracker project.
  const duplicatePattern = (id) => {
    const src = patterns.find(p => p.id === id);
    if (!src) return null;
    const baseTitle = (src.title || "Pattern").replace(/\s*\(copy(?:\s+\d+)?\)$/i, "");
    let suffix = " (copy)";
    let n = 2;
    while (patterns.some(p => p.title === baseTitle + suffix)) {
      suffix = " (copy " + (n++) + ")";
    }
    const copy = Object.assign({}, src, {
      id: "patt_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 7),
      title: baseTitle + suffix,
      linkedProjectId: null,
      status: src.status === "completed" ? "wishlist" : src.status
    });
    setPatterns(prev => [...prev, copy]);
    setViewingPattern(copy);
    if (window.Toast) window.Toast.show({ message: "\"" + copy.title + "\" created", type: "success" });
    return copy;
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

  // One navigation entry: a real link (so it opens in a new tab), handled
  // in place for an ordinary click.
  // opts: { countTitle, "data-onboard" } (the walkthrough's targets).
  function navLink(id, icon, label, count, opts) {
    const on = tab === id;
    const { countTitle, ...attrs } = opts || {};
    return (
      <a key={id} {...attrs} href={"manager.html?from=home&tab=" + id} className={"mgr-tab" + (on ? " on" : "")} aria-current={on ? "page" : undefined}
        onClick={e => { if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); goTab(id); }}>
        <span className="icon">{icon}</span><span className="mgr-tab-label">{label}</span>{count != null && <span className="cnt" title={countTitle || undefined}>{count}</span>}
      </a>
    );
  }

  // Attention line and Shopping list tab.
  const shoppingCount = toBuy ? toBuy.shopping.length : 0;
  const shoppingSkeins = toBuy ? toBuy.shopping.reduce((n, r) => n + (r.tobuyQty || 1), 0) : 0;
  const projectTitles = toBuy ? toBuy.projects.map(p => p.title || "Untitled") : [];
  const conflictCount = conflicts ? conflicts.length : 0;
  const attentionSig = shoppingCount + "|" + projectTitles.join(",") + "|" + (conflicts || []).map(c => c.key).join(",");
  const showAttention = (shoppingCount > 0 || conflictCount > 0) && attentionSig !== attentionDismissed;
  // Which patterns each shopping-list thread is for. A thread short only
  // because two patterns share it is in no single pattern's list, so fall
  // back to the patterns named in its conflict.
  const projectsByKey = {};
  if (toBuy) toBuy.projects.forEach(p => p.threads.forEach(t => { (projectsByKey[t.key] || (projectsByKey[t.key] = [])).push(p.title || "Untitled"); }));
  (conflicts || []).forEach(c => { if (!projectsByKey[c.key]) projectsByKey[c.key] = c.patterns.map(p => p.title || "Untitled"); });
  // Ticked rows still on the list (a row can leave the list while ticked,
  // for example when a pattern is completed in another tab).
  const tickedRows = toBuy ? toBuy.shopping.filter(r => boughtTicks[r.key] != null) : [];
  const tickedSkeins = tickedRows.reduce((n, r) => n + boughtTicks[r.key], 0);
  function toggleBought(r) {
    setBoughtTicks(prev => {
      const next = { ...prev };
      if (next[r.key] != null) delete next[r.key];
      else next[r.key] = Math.max(1, Math.round(r.tobuyQty || 1));
      return next;
    });
  }
  function setBoughtQty(key, qty) {
    setBoughtTicks(prev => prev[key] == null ? prev : { ...prev, [key]: Math.max(1, Math.round(Number(qty) || 1)) });
  }
  // Phase 1 of docs/stash-redesign/hub-and-stock-take-plan.md: one write adds
  // the skeins and clears the list flags; Undo takes back exactly those
  // skeins and puts hand-added threads back on the list.
  async function addTickedToStash() {
    if (typeof StashBridge === "undefined" || !tickedRows.length) return;
    const qtyMap = {};
    const handAdded = {};
    tickedRows.forEach(r => {
      qtyMap[r.key] = boughtTicks[r.key];
      const t = threads[r.key];
      if (t && t.tobuy) handAdded[r.key] = { tobuyQty: Number(t.tobuy_qty) > 0 ? Number(t.tobuy_qty) : (r.tobuyQty || 1), tobuyAddedAt: t.tobuy_added_at || r.tobuyAddedAt || null };
    });
    const results = await StashBridge.markBoughtMany(qtyMap);
    if (!results || !results.length) {
      if (window.Toast) window.Toast.show({ message: "Could not add these threads to your stash", type: "error" });
      return;
    }
    setBoughtTicks({});
    refreshToBuy();
    const added = results.reduce((n, r) => n + r.addedSkeins, 0);
    if (window.Toast) {
      window.Toast.show({
        message: plural(added, 'skein') + " of " + plural(results.length, 'thread') + " added to your stash",
        type: "success",
        undoAction: () => {
          StashBridge.unmarkBoughtMany(results.map(r => Object.assign({ key: r.key, addedSkeins: r.addedSkeins }, handAdded[r.key] || {})))
            .then(() => refreshToBuy());
        }
      });
    }
  }
  // One Shopping list row, shared by the Shopping list tab and the
  // Overview's Buy next list (the Bought ticks are shared too).
  function renderShopRow(r) {
    const label = formatThread(r, { variant: 'short' });
    const forTitles = projectsByKey[r.key] || NO_TITLES;
    const byHand = !!(threads[r.key] && threads[r.key].tobuy);
    const ticked = boughtTicks[r.key] != null;
    return (
      <li key={r.key} className={"stash-shop-row" + (ticked ? " is-ticked" : "")}>
        <label className="stash-tick" title={"Bought " + label}>
          <input type="checkbox" checked={ticked} onChange={() => toggleBought(r)} aria-label={"Bought " + label} />
        </label>
        <button type="button" className="stash-ident" onClick={() => openThread(r.key)} title={"Show " + label + " in Thread Stash"}>
          <span className="stash-swatch" style={{ background: "rgb(" + r.rgb.join(",") + ")" }} aria-hidden="true" />
          <span className="stash-id">
            <span className="stash-code">{label}</span>
            <span className="stash-name">{r.name}</span>
          </span>
        </button>
        <span className="stash-uses">
          {forTitles.map(t => <span key={t} className="stash-chip">{t}</span>)}
          {byHand && forTitles.length === 0 && <span className="stash-chip stash-chip--quiet">Added by you</span>}
        </span>
        {ticked
          ? <span className="stash-shop-qty"><SkeinStepper value={boughtTicks[r.key]} label={"Skeins bought of " + label} onChange={v => setBoughtQty(r.key, v)} /></span>
          : <span className="stash-shop-qty">{plural(r.tobuyQty || 1, 'skein')}</span>}
        {byHand
          ? <button type="button" className="stash-btn stash-btn--quiet stash-btn--icon" aria-label={"Remove " + label + " from your shopping list"} title="Remove from shopping list" onClick={() => setOnShoppingList(r.key, false)}>{Icons.x()}</button>
          : <span className="stash-btn--icon" aria-hidden="true" />}
      </li>
    );
  }
  const addTickedButton = (
    <button type="button" className="stash-btn stash-btn--primary" disabled={!tickedRows.length} onClick={addTickedToStash}>
      {Icons.box()}<span>{tickedRows.length ? "Add " + plural(tickedSkeins, 'skein') + " to stash" : "Add ticked to stash"}</span>
    </button>
  );
  function copyShoppingList() {
    if (!toBuy || !toBuy.shopping.length) return;
    const text = toBuy.shopping.map(r => formatThread(r, { variant: 'short' }) + " " + r.name + " \u00D7 " + (r.tobuyQty || 1)).join("\n");
    const done = ok => { if (window.Toast) window.Toast.show({ message: ok ? "Shopping list copied" : "Could not copy the list", type: ok ? "success" : "error" }); };
    try { navigator.clipboard.writeText(text).then(() => done(true), () => done(false)); } catch (_) { done(false); }
  }

  const statusColors = {
    wishlist: { bg: "var(--warning-soft)", text: "var(--accent-ink)", label: "Wishlist" },
    owned: { bg: "#e0e7ff", text: "#4338ca", label: "Owned" },
    inprogress: { bg: "var(--warning-soft)", text: "#c2410c", label: "In Progress" },
    completed: { bg: "#dcfce3", text: "var(--success)", label: "Completed" }
  };

  return (
    <>
      <Header page="manager" setModal={setModal} onBackupDownload={handleBackupDownload} onRestoreFile={handleRestoreFile} onOpenProject={typeof window.ProjectStorage!=='undefined'?()=>{window.location.href='home.html';}:undefined} onPreferences={typeof window.PreferencesModal!=='undefined'?()=>setPreferencesOpen(true):undefined} storageUsage={storageUsage} />
      {preferencesOpen && typeof window.PreferencesModal!=='undefined' && React.createElement(window.PreferencesModal,{onClose:()=>setPreferencesOpen(false)})}
      {backupStatus && (
        <div style={{ padding: "8px 20px 0" }}>
          <div style={{ padding: "10px 14px", borderRadius: 8, fontSize: 12, background: backupStatus.type === "error" ? "var(--danger-soft)" : backupStatus.type === "confirm" ? "var(--warning-soft)" : "var(--success-soft)", border: `1px solid ${backupStatus.type === "error" ? "var(--danger-soft)" : backupStatus.type === "confirm" ? "var(--warning)" : "#C4DCB6"}`, color: backupStatus.type === "error" ? "var(--danger)" : backupStatus.type === "confirm" ? "var(--accent-ink)" : "var(--success)" }}>
            <div>{backupStatus.message}</div>
            {backupStatus.summary && (
              <div style={{ fontSize: 11, marginTop: 4, color: "var(--text-secondary)" }}>
                {plural(backupStatus.summary.projectCount, 'project')}, {plural(backupStatus.summary.threadCount, 'owned thread')}, {plural(backupStatus.summary.patternCount, 'pattern')}
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

      {/* Stash Manager navigation (hub plan, Phase 3). One <nav>: a left side
          menu from 1024px, the tab bar below that. The tabs are links, so
          they open in a new tab and the address tracks the section. On a
          phone the row scrolls inside itself and can never widen the page
          (the Showcase link once pushed the layout to 482px on a 390px
          screen, cutting off the editor). */}
      <div className="mgr-shell">
      <nav className="mgr-tab-bar mgr-nav" aria-label="Stash Manager">
        <div className="mgr-tabs">
          {navLink("overview", Icons.layers(), "Overview", null, { "data-onboard": "mgr-overview-tab" })}
          {navLink("inventory", Icons.thread(), <><span className="lbl-long">Thread Stash</span><span className="lbl-short" aria-hidden="true">Threads</span></>, stashCounts.owned, { "data-onboard": "mgr-stash-tab", countTitle: plural(stashCounts.owned, 'thread') + " in your stash" })}
          {navLink("shopping", Icons.cart(), <>Shopping<span className="lbl-long"> list</span></>, shoppingCount > 0 ? shoppingCount : null, { countTitle: plural(shoppingCount, 'thread') + " to buy" })}
          {navLink("patterns", Icons.clipboard(), <><span className="lbl-long">Pattern </span>Library</>, patterns.length, { "data-onboard": "mgr-patterns-tab" })}
        </div>
        <div className="mgr-nav-secondary">
          <span className="mgr-nav-sep" aria-hidden="true" />
          {navLink("catalogues", Icons.document(), "Custom catalogues", catalogueRecords.length || null)}
          {navLink("transfer", Icons.download(), "Import and export")}
        </div>
        <button
          type="button"
          className="mgr-showcase"
          onClick={() => { window.location.href = "index.html?mode=stats&tab=showcase&from=home"; }}
          title="See your stitching journey"
          aria-label="Open Showcase view"
        >
          {Icons.sparkles()}<span className="mgr-showcase-label">Showcase</span>
        </button>
      </nav>
      <div className="mgr-shell-main">

      {tab === "catalogues" && (
        <div className="stash-page">
          <section className="stash-card" aria-labelledby="stash-catalogues-heading">
            <div className="stash-card-head">
              <h2 id="stash-catalogues-heading">{Icons.document()}<span>Custom thread catalogues</span></h2>
            </div>
            <CataloguePanel records={catalogueRecords} onRecords={setCatalogueRecords} />
          </section>
        </div>
      )}

      {tab === "transfer" && (
        <div className="stash-page">
          <h2 className="stash-page-title">Import and export</h2>
          <div className="stash-transfer">
            <section className="stash-card" aria-labelledby="stash-tr-bulk">
              <h3 id="stash-tr-bulk" className="stash-card-title">{Icons.listComfortable()}<span>Add threads in bulk</span></h3>
              <p className="stash-muted">Paste a list of thread numbers, such as 310, 550, 3821, or start from a starter kit.</p>
              <div className="stash-form-row">
                {typeof window.BulkAddModal !== 'undefined'
                  ? <button type="button" className="stash-btn stash-btn--primary" onClick={() => setBulkAddOpen(true)}>{Icons.plus()}<span>Bulk add</span></button>
                  : <span className="stash-muted">Bulk add is not available on this page.</span>}
              </div>
            </section>
            <section className="stash-card" aria-labelledby="stash-tr-cat">
              <h3 id="stash-tr-cat" className="stash-card-title">{Icons.document()}<span>Custom thread catalogues</span></h3>
              <p className="stash-muted">{plural(catalogueRecords.length, 'record') + ". Import your own CSV of thread references, or export them."}</p>
              <div className="stash-form-row">
                <button type="button" className="stash-btn" onClick={() => goTab("catalogues")}>{Icons.upload()}<span>Import a catalogue</span></button>
                <button type="button" className="stash-btn" disabled={!catalogueRecords.length} onClick={() => downloadCatalogueCSV(catalogueRecords)}>{Icons.download()}<span>Export custom CSV</span></button>
              </div>
            </section>
            <section className="stash-card" aria-labelledby="stash-tr-shop">
              <h3 id="stash-tr-shop" className="stash-card-title">{Icons.cart()}<span>Shopping list</span></h3>
              <p className="stash-muted">{shoppingCount > 0 ? plural(shoppingCount, 'thread') + " to buy. Copy the list to paste into a message or a shop's order form, or export the project materials plan as JSON." : "Nothing to buy. You can still export the project materials plan as JSON."}</p>
              <div className="stash-form-row">
                <button type="button" className="stash-btn" disabled={!shoppingCount} onClick={copyShoppingList}>{Icons.copy()}<span>Copy list</span></button>
                <button type="button" className="stash-btn" onClick={() => downloadProjectShoppingList().catch(e => { if (window.Toast) window.Toast.show({ message: e.message, type: "error" }); })}>{Icons.download()}<span>Export shopping list JSON</span></button>
              </div>
            </section>
            <section className="stash-card" aria-labelledby="stash-tr-backup">
              <h3 id="stash-tr-backup" className="stash-card-title">{Icons.save()}<span>Back up everything</span></h3>
              <p className="stash-muted">One file with every project, your stash and your preferences. To restore it, use File &gt; Restore from Backup.</p>
              <div className="stash-form-row">
                <button type="button" className="stash-btn" onClick={handleBackupDownload}>{Icons.download()}<span>Download backup</span></button>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* Overview: the Stash Manager's home page (hub plan, Phase 2). */}
      {tab === "overview" && (
        <div className="stash-page stash-overview">
          <div className="stash-overview-head">
            <h2 id="stash-overview-heading">Your stash</h2>
            <label className="stash-search">
              {Icons.magnify()}
              <input
                type="search"
                aria-label="Find a thread"
                enterKeyHint="search"
                placeholder="Find a thread, or type a number to add one"
                value=""
                onChange={e => { goToThreads("owned", e.target.value, true); }}
              />
            </label>
          </div>

          {stashCounts.owned === 0 && (
            <section className="stash-card stash-start" aria-labelledby="stash-start-heading">
              <h2 id="stash-start-heading">{Icons.thread()}<span>Start your stash</span></h2>
              <p className="stash-muted">Record the DMC and Anchor threads you own. Your patterns are then checked against them, so you can see what to buy and which patterns you could start.</p>
              <div className="stash-form-row">
                <button type="button" className="stash-btn stash-btn--primary" onClick={() => goToThreads("owned", "", true)}>{Icons.magnify()}<span>Find a thread to add</span></button>
                {typeof window.BulkAddModal !== 'undefined' && <button type="button" className="stash-btn" onClick={() => setBulkAddOpen(true)}>{Icons.listComfortable()}<span>Bulk add</span></button>}
              </div>
            </section>
          )}

          <div className="stash-tiles">
            <button type="button" className="stash-tile" onClick={() => goToThreads("owned")}>
              <span className="stash-tile-k">Threads</span>
              <span className="stash-tile-v">{stashCounts.owned}</span>
              <span className="stash-tile-s">{stashCounts.anchor > 0 ? stashCounts.dmc + " DMC, " + stashCounts.anchor + " Anchor" : "in your stash"}</span>
            </button>
            <button type="button" className="stash-tile" onClick={() => goToThreads("opened")}>
              <span className="stash-tile-k">Full skeins</span>
              <span className="stash-tile-v">{formatSkeins(stashCounts.fullSkeins)}</span>
              <span className="stash-tile-s">{stashCounts.opened > 0 ? "plus " + plural(stashCounts.opened, 'opened skein') : "No opened skeins"}</span>
            </button>
            <button type="button" className={"stash-tile" + (shoppingCount > 0 ? " stash-tile--accent" : "")} onClick={() => { setTab("shopping"); setSearchQuery(""); }}>
              <span className="stash-tile-k">To buy</span>
              <span className="stash-tile-v">{shoppingSkeins}</span>
              <span className="stash-tile-s">{shoppingCount > 0 ? (shoppingSkeins === 1 ? "skein" : "skeins") + " across " + plural(shoppingCount, 'thread') : "Nothing to buy"}</span>
            </button>
            <button type="button" className={"stash-tile" + (stashCounts.low > 0 ? " stash-tile--warn" : "")} onClick={() => goToThreads("low")}>
              <span className="stash-tile-k">Running low</span>
              <span className="stash-tile-v">{stashCounts.low}</span>
              <span className="stash-tile-s">{stashCounts.low > 0 ? "below their minimum" : "Nothing is running low"}</span>
            </button>
          </div>

          <div className="stash-overview-cols">
            <section className="stash-card" aria-labelledby="stash-buynext-heading">
              <div className="stash-card-head">
                <h2 id="stash-buynext-heading">{Icons.cart()}<span>Buy next</span></h2>
                {shoppingCount > 0 && <span className="stash-muted">{plural(shoppingCount, 'thread')}</span>}
                {shoppingCount > 0 && <div className="stash-card-action">{addTickedButton}</div>}
              </div>
              {toBuy === null
                ? <p className="stash-muted">Checking your patterns against your stash…</p>
                : shoppingCount === 0
                  ? <p className="stash-muted">Nothing to buy. Anything your patterns need that your stash doesn't cover appears here.</p>
                  : <>
                      <ul className="stash-shop-list">{toBuy.shopping.slice(0, OVERVIEW_BUY_ROWS).map(renderShopRow)}</ul>
                      {shoppingCount > OVERVIEW_BUY_ROWS && (
                        <button type="button" className="stash-btn stash-btn--quiet stash-see-all" onClick={() => { setTab("shopping"); setSearchQuery(""); }}>
                          {"See all " + shoppingCount + " threads"}{Icons.chevronRight()}
                        </button>
                      )}
                    </>}
            </section>

            <div className="stash-overview-side">
              <section className="stash-card" aria-labelledby="stash-ready-heading">
                <div className="stash-card-head">
                  <h2 id="stash-ready-heading">{Icons.clipboard()}<span>Ready to start</span></h2>
                </div>
                {readyToStart === null
                  ? <p className="stash-muted">Checking your patterns…</p>
                  : readyToStart.length === 0
                    ? <p className="stash-muted">Patterns you haven't started appear here with how many of their threads you own. Save a pattern in the Pattern Creator, or add one in the Pattern Library.</p>
                    : (
                      <ul className="stash-ready-list">
                        {readyToStart.slice(0, OVERVIEW_READY_ROWS).map(r => (
                          <li key={r.id}>
                            <button type="button" className="stash-ready-row" onClick={() => openPattern(r.id)} title={"Open " + (r.title || "Untitled") + " in the Pattern Library"}>
                              <span className="stash-ready-top"><b>{r.title || "Untitled"}</b><span className="stash-ready-pct">{r.pct + "%"}</span></span>
                              <span className="stash-progress" aria-hidden="true"><span className={r.pct === 100 ? "is-full" : ""} style={{ width: r.pct + "%" }} /></span>
                              <span className="stash-muted">{r.pct === 100 ? "All " + plural(r.totalThreads, 'thread') + " in your stash" : "Short of " + listJoin(r.missing.map(m => String(m.id)))}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
              </section>

              <section className="stash-card" aria-labelledby="stash-needs-heading">
                <div className="stash-card-head">
                  <h2 id="stash-needs-heading">{Icons.warning()}<span>Needs attention</span></h2>
                </div>
                {conflictCount === 0 && !(lowStockAlerts && lowStockAlerts.length)
                  ? <p className="stash-muted">Nothing needs attention. No thread is running low, and no two patterns are competing for the same thread.</p>
                  : (
                    <ul className="stash-alert-list stash-alert-list--flat">
                      {(conflicts || []).map(c => (
                        <li key={"c-" + c.key}>
                          <button type="button" className="stash-alert-row" title={"Show " + formatThread(c, { variant: 'title' }) + " in Thread Stash"} onClick={() => openThread(c.key)}>
                            <span className="stash-swatch stash-swatch--sm" style={{ background: "rgb(" + c.rgb.join(",") + ")" }} aria-hidden="true" />
                            <b>{formatThread(c, { variant: 'short' })}</b>
                            <span className="stash-name">{"Needed by " + listJoin(c.patterns.map(p => p.title || "Untitled"))}</span>
                            <span className="stash-pill stash-pill--short">{"Short " + formatSkeins(c.totalNeeded - c.owned)}</span>
                          </button>
                        </li>
                      ))}
                      {(lowStockAlerts || []).slice(0, OVERVIEW_LOW_ROWS).map(a => (
                        <li key={"l-" + a.id}>
                          <button type="button" className="stash-alert-row" title={"Show " + formatBrandLabel(a.brand) + " " + (a.bareId || a.id) + " in Thread Stash"} onClick={() => openThread(a.id)}>
                            <span className="stash-swatch stash-swatch--sm" style={{ background: "rgb(" + a.rgb.join(",") + ")" }} aria-hidden="true" />
                            <b>{formatBrandLabel(a.brand) + " " + (a.bareId || a.id)}</b>
                            <span className="stash-name">{"Have " + formatSkeins(a.owned) + ", minimum " + formatSkeins(a.min_stock)}</span>
                            <span className="stash-pill stash-pill--low">Low</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                {lowStockAlerts && lowStockAlerts.length > OVERVIEW_LOW_ROWS && (
                  <button type="button" className="stash-btn stash-btn--quiet stash-see-all" onClick={() => goToThreads("low")}>
                    {"See all " + lowStockAlerts.length + " running low"}{Icons.chevronRight()}
                  </button>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {tab === "inventory" && (
        <div className="stash-page">
          <div className="stash-toolbar">
            <label className="stash-search">
              {Icons.magnify()}
              <input
                type="search"
                aria-label="Search threads"
                enterKeyHint="search"
                placeholder="Find a thread, or type a number to add one"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </label>
            <div className="stash-seg" role="radiogroup" aria-label="Show threads">
              {[
                { id: "owned", label: "Owned", count: stashCounts.owned },
                { id: "low", label: "Running low", short: "Low", count: stashCounts.low },
                { id: "opened", label: "Opened", count: stashCounts.opened },
                (stashCounts.usedup > 0 || threadFilter === "usedup") && { id: "usedup", label: "Used up", count: stashCounts.usedup },
                { id: "all", label: "Every shade", short: "All", count: null }
              ].filter(Boolean).map(f => (
                <button key={f.id} type="button" role="radio" aria-checked={threadFilter === f.id} className={threadFilter === f.id ? "on" : ""} onClick={() => setThreadFilter(f.id)}>
                  {f.short ? <><span className="lbl-long">{f.label}</span><span className="lbl-short" aria-hidden="true">{f.short}</span></> : f.label}{f.count != null && <span className="n">{f.count}</span>}
                </button>
              ))}
            </div>
            <div className="stash-toolbar-end">
              <StashMenuButton
                align="end"
                className="stash-view-btn"
                icon={Icons.sliders()}
                label={({ number: "Number", colour: "Colour", name: "Name", owned_desc: "Most owned", owned_asc: "Fewest owned" }[threadSort] || "Number") + ", " + (brandFilter === "dmc" ? "DMC" : brandFilter === "anchor" ? "Anchor" : "all brands")}
              >
                {() => (
                  <div className="stash-view-panel">
                    {/* Styling lives in .mgr-sort-select, not inline: an inline
                        font-size outranks the coarse-pointer 16px rule that stops iOS
                        zooming the whole page when the field takes focus. */}
                    <label>
                      <span>Sort by</span>
                      <select aria-label="Sort threads" className="mgr-sort-select" value={threadSort} onChange={e => setThreadSort(e.target.value)}>
                        <option value="number">Number</option>
                        <option value="colour">Colour</option>
                        <option value="name">Name (A-Z)</option>
                        <option value="owned_desc">Owned: most first</option>
                        <option value="owned_asc">Owned: fewest first</option>
                      </select>
                    </label>
                    <label>
                      <span>Brand</span>
                      <select aria-label="Thread brand" className="mgr-sort-select" value={brandFilter} onChange={e => setBrandFilter(e.target.value)}>
                        <option value="all">All brands</option>
                        <option value="dmc">DMC</option>
                        <option value="anchor">Anchor</option>
                      </select>
                    </label>
                  </div>
                )}
              </StashMenuButton>
              <StashMenuButton align="end" icon={Icons.plus()} ariaLabel="Add threads" label={<><span className="lbl-long">Add threads</span><span className="lbl-short">Add</span></>} className="stash-btn--primary">
                {close => (
                  <div className="stash-menu-list">
                    {typeof window.BulkAddModal !== 'undefined' && (
                      <button type="button" onClick={() => { close(); setBulkAddOpen(true); }}>
                        {Icons.listComfortable()}<span><b>Bulk add</b><small>Paste a list of numbers, or choose a starter kit</small></span>
                      </button>
                    )}
                    <button type="button" onClick={() => { close(); goTab("catalogues"); }}>
                      {Icons.document()}<span><b>Custom thread catalogues</b><small>{"Import or export your own thread references (" + plural(catalogueRecords.length, 'record') + ")"}</small></span>
                    </button>
                    <button type="button" onClick={() => { close(); goTab("transfer"); }}>
                      {Icons.download()}<span><b>Import and export</b><small>Bulk add, catalogue CSV, shopping list and backup</small></span>
                    </button>
                  </div>
                )}
              </StashMenuButton>
            </div>
          </div>

          {showAttention && (
            <div className="stash-attention" role="status">
              <span className="stash-attention-icon" aria-hidden="true">{conflictCount > 0 ? Icons.warning() : Icons.cart()}</span>
              <p>
                {shoppingCount > 0 && <><b>{plural(shoppingCount, 'thread')} to buy</b>{projectTitles.length > 0 && <>{" for " + listJoin(projectTitles)}</>}{". "}</>}
                {conflictCount > 0 && <>{listJoin(conflicts.map(c => formatThread(c, { variant: 'short' })))} {conflictCount === 1 ? "is" : "are"} needed by more than one pattern.</>}
              </p>
              <button type="button" className="stash-btn" onClick={() => { setTab("shopping"); setSearchQuery(""); }}>Open shopping list{Icons.chevronRight()}</button>
              <button type="button" className="stash-btn stash-btn--quiet stash-btn--icon" aria-label="Hide this until something changes" title="Hide this until something changes" onClick={() => {
                setAttentionDismissed(attentionSig);
                try { if (window.UserPrefs) window.UserPrefs.set("stashAttentionDismissed", attentionSig); } catch (_) {}
              }}>{Icons.x()}</button>
            </div>
          )}

          {filteredThreads.length > 0 && (
            <div className="stash-list-wrap">
              <div className="stash-list-head" aria-hidden="true">
                <span>Thread</span><span>Full skeins</span><span>Opened skein</span><span>Used in</span><span>Status</span>
              </div>
              <ul className="stash-list" aria-label="Threads">
                {filteredThreads.slice(0, listLimit).map(d => {
                  const st = threads[d.compositeKey] || EMPTY_THREAD;
                  const expanded = expandedThread === d.compositeKey;
                  const full = expanded || isInStash(st) || st.partialStatus === "used-up" || (Number(st.min_stock) || 0) > 0;
                  return (
                    <StashRow key={d.compositeKey} item={d} state={st} expanded={expanded} owned={full}
                      uses={usesByKey[d.compositeKey] || NO_USES} short={shortByKey[d.compositeKey] || 0}
                      low={isThreadLow(st, lowStockThreshold)}
                      onToggle={toggleRow} onUpdate={updateThreadCb} onAdd={addThreadToStash}
                      onShopping={setOnShoppingList} onRemove={removeFromStash} />
                  );
                })}
              </ul>
              {filteredThreads.length > listLimit && (
                <button type="button" className="stash-btn stash-more" onClick={() => setListLimit(n => n + STASH_PAGE_SIZE)}>
                  {"Show " + Math.min(STASH_PAGE_SIZE, filteredThreads.length - listLimit) + " more (" + (filteredThreads.length - listLimit) + " left)"}
                </button>
              )}
            </div>
          )}

          {filteredThreads.length === 0 && (
            stashCounts.owned === 0 && threadFilter === "owned" && !searchQuery.trim() && window.EmptyState
              ? <div className="stash-empty-wrap">
                  {React.createElement(window.EmptyState, {
                    icon: Icons.thread(),
                    title: "Your stash is empty",
                    description: "Record the DMC and Anchor threads you own so you can plan projects and see what you still need. Type a thread number in the search box to add it, or add several at once.",
                    ctaLabel: "Bulk add threads",
                    ctaAction: () => setBulkAddOpen(true)
                  })}
                </div>
              : <p className="stash-empty">
                  {searchQuery.trim()
                    ? (threadFilter === "all" ? "No shades match “" + searchQuery.trim() + "”." : "Nothing in this view matches “" + searchQuery.trim() + "”.")
                    : threadFilter === "low" ? "Nothing is running low."
                    : threadFilter === "opened" ? "No opened skeins. Open a thread's details to record a part-used skein."
                    : threadFilter === "usedup" ? "No used-up threads."
                    : "No threads found."}
                </p>
          )}

          {searchAdditions.length > 0 && (
            <div className="stash-list-wrap">
              <h2 className="stash-group">Not in your stash</h2>
              <ul className="stash-list" aria-label="Threads you could add">
                {searchAdditions.map(d => (
                  <StashRow key={d.compositeKey} item={d} state={threads[d.compositeKey] || EMPTY_THREAD} expanded={false} owned={false}
                    uses={usesByKey[d.compositeKey] || NO_USES} short={shortByKey[d.compositeKey] || 0} low={false}
                    onToggle={toggleRow} onUpdate={updateThreadCb} onAdd={addThreadToStash}
                    onShopping={setOnShoppingList} onRemove={removeFromStash} />
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {tab === "shopping" && (
        <div className="stash-page stash-shop">
          <section className="stash-card" aria-labelledby="stash-shop-heading">
            <div className="stash-card-head">
              <h2 id="stash-shop-heading">{Icons.cart()}<span>To buy</span></h2>
              {shoppingCount > 0 && <span className="stash-muted">{plural(shoppingCount, 'thread') + ", " + plural(shoppingSkeins, 'skein')}</span>}
              <div className="stash-card-action stash-form-row">
                <button type="button" className="stash-btn" disabled={!shoppingCount} onClick={copyShoppingList}>{Icons.copy()}<span>Copy list</span></button>
                {shoppingCount > 0 && addTickedButton}
              </div>
            </div>
            {shoppingCount > 0 && <p className="stash-muted stash-shop-hint">Tick the threads you've bought, check the number of skeins, then add them to your stash.</p>}
            {toBuy === null
              ? <p className="stash-muted">Checking your patterns against your stash…</p>
              : shoppingCount === 0
                ? <p className="stash-empty">Nothing to buy. Patterns in your library are checked against your stash, and anything they need appears here.</p>
                : (
                  <ul className="stash-shop-list">
                    {toBuy.shopping.map(renderShopRow)}
                  </ul>
                )}
          </section>

          {/* A thread two or more patterns compete for. One pattern's own
              shortfall is a neutral shopping list (the panels below), not a
              conflict. */}
          {conflicts && conflicts.length > 0 && (
            <StashAlertPanel id="stash-conflicts" title="Thread Conflicts" count={conflicts.length} countLabel={plural(conflicts.length, 'thread')} icon={Icons.warning()} tone="danger" preferenceKey="stashConflictsCollapsed">
              <p className="stash-alert-desc">More than one pattern needs these threads, and your stash can't cover them all.</p>
              <ul className="stash-alert-list">
                {conflicts.map(c => (
                  <li key={c.key}>
                    <button type="button" className="stash-alert-row" title={"Show " + formatThread(c, { variant: 'title' }) + " in Thread Stash"} onClick={() => openThread(c.key)}>
                      <span className="stash-swatch stash-swatch--sm" style={{ background: "rgb(" + c.rgb.join(",") + ")" }} aria-hidden="true" />
                      <b>{formatThread(c, { variant: 'short' })}</b>
                      <span className="stash-name">{formatThread(c, { variant: 'name' })}</span>
                      <span className="stash-alert-qty">{"own " + formatSkeins(c.owned) + ", need " + formatSkeins(c.totalNeeded)}</span>
                      <span className="stash-alert-who">{c.patterns.map(p => p.title).join(", ")}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </StashAlertPanel>
          )}

          {toBuy && toBuy.projects.map((p, i) => {
            const unflagged = p.threads.filter(t => !(threads[t.key] && threads[t.key].tobuy)).length;
            return (
              <StashAlertPanel key={p.id} id={"stash-tobuy-" + i} title={"To buy for " + (p.title || "Untitled")} count={p.threads.length} countLabel={plural(p.threads.length, 'thread')} icon={Icons.cart()} preferenceKey="stashToBuyCollapsed">
                <p className="stash-alert-desc">Threads this pattern needs that your stash doesn't cover.</p>
                <ul className="stash-alert-list">
                  {p.threads.map(t => (
                    <li key={t.key}>
                      <button type="button" className="stash-alert-row" title={"Show " + formatThread(t, { variant: 'title' }) + " in Thread Stash"} onClick={() => openThread(t.key)}>
                        <span className="stash-swatch stash-swatch--sm" style={{ background: "rgb(" + t.rgb.join(",") + ")" }} aria-hidden="true" />
                        <b>{formatThread(t, { variant: 'short' })}</b>
                        <span className="stash-name">{formatThread(t, { variant: 'name' })}</span>
                        <span className="stash-alert-qty">{"own " + formatSkeins(t.owned) + ", need " + formatSkeins(t.need)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="stash-alert-foot">
                  {unflagged > 0
                    ? <button type="button" className="stash-btn" onClick={() => addToShoppingList(p)}>{Icons.cart()}<span>Add to shopping list</span></button>
                    : <span className="stash-muted">All of these are on your shopping list.</span>}
                </div>
              </StashAlertPanel>
            );
          })}

          {lowStockNeeded && lowStockNeeded.length > 0 && (
            <StashAlertPanel id="stash-low-needed" title="Low stock: needed" count={lowStockNeeded.length} icon={Icons.box()} tone="warn" preferenceKey="stashLowStockNeededCollapsed">
              <p className="stash-alert-desc">Threads your active patterns use that are below their minimum.</p>
              <ul className="stash-alert-list">
                {lowStockNeeded.map(a => (
                  <li key={a.id}>
                    <button type="button" className="stash-alert-row" title={"Show " + formatBrandLabel(a.brand) + " " + (a.bareId || a.id) + " in Thread Stash"} onClick={() => openThread(a.id)}>
                      <span className="stash-swatch stash-swatch--sm" style={{ background: "rgb(" + a.rgb.join(",") + ")" }} aria-hidden="true" />
                      <b>{formatBrandLabel(a.brand)} {a.bareId || a.id}</b>
                      <span className="stash-name">{a.name}</span>
                      <span className="stash-alert-qty">{"have " + formatSkeins(a.owned) + ", minimum " + formatSkeins(a.min_stock)}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </StashAlertPanel>
          )}

          <ProjectMaterials catalogues={catalogueRecords} />
        </div>
      )}

        {tab === "patterns" && (
          <><div className="mgr-filter-bar">
            <input
              type="search"
              aria-label="Search patterns"
              enterKeyHint="search"
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
            <div className="stat">{Icons.clipboard()} <span className="val">{patterns.length}</span> {patterns.length === 1 ? 'pattern' : 'patterns'}</div>
            <div className="stat">{Icons.check()} <span className="val">{readyToStart ? readyToStart.filter(r => r.pct === 100).length : 0}</span> ready to start</div>
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
                    window.__navigatingAway = true;
                    window.location.href = (target === "creator" ? "create.html" : "stitch.html") + "?from=home&source=manager&id=" + encodeURIComponent(proj.id);
                  },
                  onAddNew: () => { window.location.href = "home.html?tab=create"; },
                  onOpenGlobalStats: () => { window.location.href = "index.html?mode=stats&from=home"; },
                  onOpenManagerOnly: (proj) => {
                    // Scroll to the matching pattern card in the grid below.
                    const realId = proj && proj._managerPatternId;
                    if (!realId) return;
                    const match = patterns.find(p => p.id === realId);
                    if (match) setViewingPattern(match);
                  },
                  // Per-card extras: missing-thread badge so the legacy
                  // detail grid is no longer required.
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
                      const k = libraryThreadKey(t);
                      return !((threads[k] || {}).owned > 0);
                    });
                    // Pull progress + weekly sparkline data from the linked
                    // ProjectStorage meta (the auto-synced manager pattern row
                    // itself doesn't carry these fields).
                    const meta = pat.linkedProjectId
                      ? storedProjects.find(s => s.id === pat.linkedProjectId)
                      : null;
                    // Progress is not repeated here: the card itself shows it once, as the bar and its percentage.
                    // 7-day sparkline (oldest ? newest, ending today). Only
                    // rendered when there's actual activity to show.
                    const weekly = (meta && Array.isArray(meta.weeklyStitches)) ? meta.weeklyStitches : null;
                    const weeklyMax = weekly ? Math.max.apply(null, weekly) : 0;
                    const weeklyTotal = weekly ? weekly.reduce((a, b) => a + b, 0) : 0;
                    const SPARK_W = 56, SPARK_H = 16, BAR_W = 6, GAP = 2;
                    return (
                      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11 }}>
                        {weekly && weeklyTotal > 0 && (
                          <span
                            title={"Last 7 days: " + weeklyTotal.toLocaleString('en-GB') + " stitches"}
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
                            ? <span style={{ padding: "2px 8px", borderRadius: 12, background: "var(--success-soft)", color: "var(--success)", fontWeight: 700, display: "inline-flex", alignItems: "center", gap: 4 }} title="All required threads are in your stash">{Icons.check()} Ready to start</span>
                            : <span
                                onClick={e => { e.stopPropagation(); setViewingPattern(pat); setPanelOpen(true); }}
                                style={{ padding: "2px 8px", borderRadius: 12, background: "var(--warning-soft)", color: "#c2410c", fontWeight: 700, cursor: "pointer" }}
                                title={"Missing: " + missing.map(t => t.id).join(", ")}
                              >{plural(missing.length, 'thread')} needed</span>
                        )}
                        {pat.linkedProjectId && (
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              try { ProjectStorage.setActiveProject(pat.linkedProjectId); } catch (_) {}
                              try {
                                localStorage.setItem("cs_pref_creator.lastPage", JSON.stringify("materials"));
                                localStorage.setItem("cs_pref_creator.materialsTab", JSON.stringify("output"));
                              } catch (_) {}
                              window.__navigatingAway = true;
                              window.location.href = "create.html?from=manager&source=stash&id=" + encodeURIComponent(pat.linkedProjectId);
                            }}
                            style={{ padding: "3px 10px", borderRadius: 6, background: "var(--accent)", color: "var(--accent-ink)", fontWeight: 700, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4, fontSize: 11, border: "none" }}
                            title="Open in Pattern Creator and go to Export"
                          >{Icons.download ? Icons.download() : null} Export pattern</button>
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
                  <a href="stitch.html" style={{ color: "#065f46", fontWeight: 600, fontSize: 11, display: "inline-flex", alignItems: "center", gap: 4 }}>Go to Tracker {Icons.chevronRight()}</a>
                </div>
              </div>
            )}
            {/* Smart Hub: Ready to Start */}
            {readyToStart && readyToStart.length > 0 && (
              <div style={{ background: "var(--success-soft)", border: "1px solid #C4DCB6", borderRadius: 10, padding: "14px 16px" }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#4F7D3F", marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>{Icons.check()} Ready to Start</div>
                <div style={{ fontSize: 12, color: "var(--text-secondary)", marginBottom: 10 }}>Patterns you can start now with the threads in your stash.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 200, overflow: "auto" }}>
                  {readyToStart.map(r => (
                    <div key={r.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", borderRadius: 8, background: "var(--surface)", border: "1px solid " + (r.pct === 100 ? "#C4DCB6" : "var(--border)") }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#1B1814" }}>{r.title || "Untitled"}</div>
                        <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>{r.totalThreads} threads, {r.coveredThreads} covered ({r.pct}%)</div>
                      </div>
                      {r.pct === 100 ? (
                        <span style={{ padding: "3px 10px", borderRadius: 12, fontSize: 11, fontWeight: 700, background: "var(--success-soft)", color: "#4F7D3F" }}>All threads in stash</span>
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
                    const pct = p.pct != null ? p.pct : (p.totalStitches > 0 ? ProgressUnits.percent(p.completedStitches,p.totalStitches) : 0);
                    const isActive = ProjectStorage.getActiveProjectId() === p.id;
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: isActive ? "var(--success-soft)" : "var(--surface)", border: `1px solid ${isActive ? "#C4DCB6" : "var(--border)"}`, borderRadius: 8, padding: "10px 14px" }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13, fontWeight: 600, color: "#1B1814", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: "var(--text-secondary)", marginTop: 2 }}>
                            {p.dimensions.width}x{p.dimensions.height} - {pct}% done - {p.source === "tracker" ? "Tracked" : "Created"} - {p.updatedAt ? new Date(p.updatedAt).toLocaleDateString('en-GB') : ""}
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 6, flexShrink: 0, marginLeft: 12 }}>
                          <button
                            onClick={() => { ProjectStorage.setActiveProject(p.id); window.__navigatingAway = true; window.location.href = "create.html?from=home&source=manager&id=" + encodeURIComponent(p.id); }}
                            title="Open in Pattern Creator"
                            style={{ padding: "5px 10px", fontSize: 12, fontWeight: 600, background: "var(--surface)", color: "var(--text-primary)", border: "1px solid var(--border)", borderRadius: 6, cursor: "pointer" }}
                          >Edit</button>
                          <button
                            onClick={() => { ProjectStorage.setActiveProject(p.id); window.__navigatingAway = true; window.location.href = "stitch.html?from=home&source=manager&id=" + encodeURIComponent(p.id); }}
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

            {/* Detailed pattern grid removed — missing-thread badges now
                live on the unified "Your Projects" cards above (see the
                cardExtras callback on ProjectLibrary). If no patterns exist
                yet, surface an empty-state nudge. */}
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
                ? Math.round(p.threads.filter(t => { const k = libraryThreadKey(t); return (threads[k] || {}).owned > 0; }).length / p.threads.length * 100)
                : 0;
              const missingThreads = p.threads ? p.threads.filter(t => { const k = libraryThreadKey(t); return !(threads[k] || {}).owned; }) : [];
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
                  <div style={{ fontSize: 11, color: "var(--text-tertiary)" }}>{p.threads ? p.threads.filter(t => { const k = libraryThreadKey(t); return (threads[k] || {}).owned > 0; }).length : 0} of {p.threads ? p.threads.length : 0} threads in your stash. {missingThreads.length} missing.</div>
                </div>
                {missingThreads.length > 0 && (
                  <div className="rp-s">
                    <div className="rp-h">Missing Threads</div>
                    <div className="used-in">
                      {missingThreads.map(t => {
                        // PERF (perf-4 #1): O(1) map lookup vs O(n) DMC.find
                        const dmc = findThreadInCatalog(libraryThreadBrand(t), t.id);
                        const compositeKey = libraryThreadKey(t);
                        return (
                          <div key={t.id} className="ui-row" style={{ cursor: "pointer" }} title={"Open thread card for " + threadBrandLabel(libraryThreadBrand(t)) + " " + t.id}
                            onClick={() => openThread(compositeKey)}>
                            <div style={{ width: 12, height: 12, borderRadius: 3, background: dmc ? `rgb(${dmc.rgb})` : "#ccc", border: "1px solid var(--border)" }} />
                            {t.id} {dmc ? dmc.name : ""} <span className="need">{t.qty ? t.qty + " sk" : ""}</span>
                          </div>
                        );
                      })}
                    </div>
                    {typeof StashBridge !== 'undefined' && (
                      <button
                        className="g-btn"
                        style={{ width: "100%", justifyContent: "center", marginTop: 8 }}
                        onClick={() => {
                          const keys = missingThreads.map(t => libraryThreadKey(t));
                          StashBridge.markManyToBuy(keys, true).then(changed => {
                            if (window.Toast) {
                              const alreadyPresent = Math.max(0, missingThreads.length - changed);
                              window.Toast.show({
                                message: changed > 0
                                  ? changed + ' thread' + (changed !== 1 ? 's' : '') + ' added to shopping list' + (alreadyPresent > 0 ? '; ' + alreadyPresent + ' already on your shopping list' : '')
                                  : 'Already on your shopping list',
                                type: 'success'
                              });
                            }
                          }).catch(() => {
                            if (window.Toast) window.Toast.show({ message: 'Could not update shopping list', type: 'error' });
                          });
                        }}
                        title={"Add " + missingThreads.length + " missing thread" + (missingThreads.length !== 1 ? "s" : "") + " to your shopping list"}
                      >
                        {Icons.cart()} Add {missingThreads.length} to shopping list
                      </button>
                    )}
                  </div>
                )}
                <div className="rp-s">
                  <div className="rp-h">Actions</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <button className="g-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => { setEditingPattern(p); }}>{Icons.pencil()} Edit Pattern</button>
                    {p.linkedProjectId && (
                      <button className="g-btn" style={{ width: "100%", justifyContent: "center", color: "var(--accent)", borderColor: "var(--accent)" }} onClick={() => {
                        try { ProjectStorage.setActiveProject(p.linkedProjectId); } catch (_) {}
                        try {
                          localStorage.setItem('cs_pref_creator.lastPage', JSON.stringify('materials'));
                          localStorage.setItem('cs_pref_creator.materialsTab', JSON.stringify('output'));
                        } catch (_) {}
                        window.__navigatingAway = true;
                        window.location.href = 'create.html?from=manager&source=stash&id=' + encodeURIComponent(p.linkedProjectId);
                      }}>{Icons.download ? Icons.download() : null} Export pattern</button>
                    )}
                    <button className="g-btn" style={{ width: "100%", justifyContent: "center" }} onClick={() => { duplicatePattern(p.id); }}>{Icons.copy()} Duplicate</button>
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
      </div>
      </div>
      {editingPattern && (
        <PatternModal
          pattern={editingPattern}
          onSave={(p) => { addOrUpdatePattern(p); if(viewingPattern) setViewingPattern(p); }}
          onClose={() => { setEditingPattern(null); if(viewingPattern) setViewingPattern(viewingPattern); }}
          inventoryThreads={threads}
          userProfile={userProfile}
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
    if (pattern.linkedProjectId) {
      // Pattern is linked to a CrossStitchDB project — activate it directly so
      // the tracker can load the full project via ProjectStorage.getActiveProject().
      // Never use the crossstitch_handoff for library entries: they are metadata-
      // only objects (no pattern cell array) and will fail to load silently.
      ProjectStorage.setActiveProject(pattern.linkedProjectId);
      window.__navigatingAway = true;
      window.location.href = "stitch.html?from=home&source=manager&id=" + encodeURIComponent(pattern.linkedProjectId);
    } else {
      // Standalone library entry — no cross-stitch project data to track.
      // Redirect to the project hub so the user can select or import a project.
      window.location.href = "home.html";
    }
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
    // PERF (perf-4 #1): cached case-insensitive map lookup
    let match = (typeof getDmcByIdCI === 'function') ? getDmcByIdCI(threadInput) : DMC.find(d => d.id.toLowerCase() === threadInput.toLowerCase());

    if (!match && autocompleteResults.length > 0) {
      match = autocompleteResults[0];
    }

    if (match) {
      let blendMatch = null;
      if (isBlended) {
        // PERF (perf-4 #1): cached case-insensitive map lookup
        blendMatch = (typeof getDmcByIdCI === 'function') ? getDmcByIdCI(blendColorInput) : DMC.find(d => d.id.toLowerCase() === blendColorInput.toLowerCase());
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
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "inline-flex", alignItems: "center", padding: 4 }}>{Icons.x ? Icons.x() : "\u00D7"}</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>Title</label>
              <input type="text" aria-label="Pattern title" value={edited.title} onChange={e => setEdited({ ...edited, title: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13 }} placeholder="Pattern Name" />
            </div>
            <div>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>Designer</label>
              <input type="text" aria-label="Pattern designer" value={edited.designer} onChange={e => setEdited({ ...edited, designer: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13 }} placeholder="Creator/Shop" />
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
              <input type="text" aria-label="Fabric and dimensions" value={edited.fabric} onChange={e => setEdited({ ...edited, fabric: e.target.value })} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13 }} placeholder="e.g. 14ct Aida, 100x100" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ display: "block", fontSize: 12, fontWeight: 600, color: "var(--text-secondary)", marginBottom: 4 }}>Tags (Press Enter to add)</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
                {edited.tags.map(tag => (
                  <span key={tag} style={{ padding: "4px 8px", background: "#EFE7D6", borderRadius: 6, fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                    {tag} <button onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", padding: 0, display: "inline-flex", alignItems: "center" }}>{Icons.x ? Icons.x() : "\u00D7"}</button>
                  </span>
                ))}
              </div>
              <input type="text" aria-label="Add tag" value={tagInput} onChange={e => setTagInput(e.target.value)} onKeyDown={handleAddTag} style={{ width: "100%", padding: "8px 12px", borderRadius: 8, border: "0.5px solid var(--border)", fontSize: 13 }} placeholder="Add tag..." />
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
                const info = findThreadInCatalog(libraryThreadBrand(t), t.id);
                // Backward compatibility for old format
                const unit = t.unit || "skeins";
                const displayUnit = unit === "stitches" ? "st" : "sk";

                return (
                  <div key={idx} style={{ display: "flex", alignItems: "center", gap: 12, padding: "8px 12px", background: "#FBF8F3", borderRadius: 8, border: "1px solid var(--border)" }}>
                    <div style={{ width: 20, height: 20, borderRadius: 4, background: info ? `rgb(${info.rgb})` : "#ccc", border: "1px solid var(--border)" }} />
                    <div style={{ flex: 1, minWidth: 0, fontSize: 13, fontWeight: 600, overflowWrap: "anywhere" }} title={formatThread(t, { variant: "title" })}>
                       {formatThread(t)}
                       {t.is_blended && <div style={{ fontSize: 11, fontWeight: 400, color: "var(--text-secondary)" }}>{formatThread(t, { variant: "name" })} {"\u00B7"} {blendStrandsPhrase(t.blend_ratio)}</div>}
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

                    <button onClick={() => removeThread(idx)} aria-label="Remove thread" style={{ background: "none", border: "none", color: "var(--text-tertiary)", cursor: "pointer", padding: "4px", display: "inline-flex", alignItems: "center" }}>{Icons.x ? Icons.x() : "\u00D7"}</button>
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
          <button onClick={handleTrack} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--accent-ink)", color: "var(--surface)", cursor: "pointer", fontWeight: 600, display: "inline-flex", alignItems: "center", gap: 6 }}>Start Tracking {Icons.chevronRight()}</button>
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
        fabricCount: pattern.project_overrides?.fabric_count ?? pattern.fabricCt ?? userProfile?.fabric_count ?? 14,
        strandsUsed: pattern.project_overrides?.strands_used ?? (pattern.linkedProjectId ? 2 : userProfile?.strands_used) ?? 2,
        threadBrand: pattern.project_overrides?.thread_brand || userProfile?.thread_brand || "DMC",
        wasteFactor: pattern.project_overrides?.waste_factor ?? (pattern.linkedProjectId ? 0.20 : userProfile?.waste_factor) ?? 0.20
    };

    return pattern.threads.map(t => {
       const info = findThreadInCatalog(libraryThreadBrand(t), t.id);
       const key = libraryThreadKey(t), colon = key.indexOf(':');
       const entry = {...t,id:key.slice(colon+1),brand:key.slice(0,colon),unit:t.unit||'skeins',count:t.qty};
       const isBlend = threadConstituents(entry).length > 1;
       const keyUsage = t.unit === 'stitches' ? threadKeyUsage(entry, settings) : null;
       let stApprox = 0, isApprox = false;
       if (t.unit === 'skeins' && !isBlend) {
         const inverse = skeinsToStitches({skeinCount:t.qty,fabricCount:settings.fabricCount,
           strandsUsed:settings.strandsUsed,skeinLengthM:skeinLengthForBrand(t.brand || settings.threadBrand),wasteFactor:settings.wasteFactor});
         stApprox = inverse.stitchesApprox; isApprox = true;
       }

       return {
           ...t,
           name: t.name || info?.name || "Unknown",
           keyUsage,
           rgb: info ? info.rgb : [128,128,128],
           isApprox,
           stApprox,
           settings
       };
    });
  }, [pattern.threads, pattern.fabricCt, pattern.linkedProjectId, pattern.project_overrides, userProfile]);

  const missingThreadsCount = useMemo(() => {
    const entries = derivedThreads.map(t=>{
      const key=libraryThreadKey(t), colon=key.indexOf(':');
      return {...t,id:key.slice(colon+1),brand:key.slice(0,colon),unit:t.unit||'skeins',count:t.qty};
    });
    const settings=derivedThreads[0]?.settings || {};
    return threadDemandRows(entries,{...settings,stash:inventoryThreads}).filter(r=>r.missing>0).length;
  }, [derivedThreads, inventoryThreads]);

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="pattern-detail-title" onClick={onClose} style={{ zIndex: 1000 }}>
      <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 600, width: "100%", maxHeight: "90vh", display: "flex", flexDirection: "column", padding: 0 }}>
        <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <h2 id="pattern-detail-title" style={{ margin: 0, fontSize: 20, marginBottom: 4 }}>{pattern.title || "Untitled"}</h2>
            {pattern.designer && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>by {pattern.designer}</div>}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "inline-flex", alignItems: "center", padding: 4 }}>{Icons.x ? Icons.x() : "\u00D7"}</button>
        </div>

        <div style={{ padding: 20, overflowY: "auto", flex: 1, display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <span style={{ padding: "4px 10px", borderRadius: 12, fontSize: 11, fontWeight: 600, background: statusColors[pattern.status].bg, color: statusColors[pattern.status].text }}>
              {statusColors[pattern.status].label}
            </span>
              {pattern.fabric && <span style={{ fontSize: 13, color: "var(--text-secondary)" }}>- {pattern.fabric}</span>}
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
                  // The one thread label (helpers.js), then the amount. A blend says how to stitch it.
                  const label = formatThread(t);
                  const isBlendRow = threadParts(t).isBlend;
                  const amount = t.unit === "stitches"
                    ? `${t.qty.toLocaleString('en-GB')} stitches`
                    : (t.unit === "skeins" && t.isApprox && !isBlendRow
                        ? `${t.qty} skein(s) (~${t.stApprox.toLocaleString('en-GB')} stitches)`
                        : `${t.qty} skein(s)`);
                  const text = `${label} \u2014 ${amount}`;
                  let subtext = "";
                  if (t.keyUsage) {
                      subtext = threadUsageText(t.keyUsage);
                  } else if (isBlendRow) {
                      subtext = `Stitch estimate not available for blended entries stored as skeins.`;
                  }

                  const settingsUsed = t.settings;
                  const isOverride = !!pattern.project_overrides;
                  const settingsBadge = `Based on: ${settingsUsed.fabricCount}ct · ${settingsUsed.strandsUsed} default strands · ${settingsUsed.threadBrand} · ${Math.round(settingsUsed.wasteFactor * 100)}% waste ${isOverride ? "(project settings)" : ""}`;

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
          <button onClick={onClose} aria-label="Close" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", display: "inline-flex", alignItems: "center", padding: 4 }}>{Icons.x ? Icons.x() : "\u00D7"}</button>
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

ReactDOM.createRoot(document.getElementById("root")).render(<ManagerApp />);
if (typeof SyncEngine !== 'undefined') SyncEngine.registerBeforeUnloadSnapshot();


// Downloads used by the Custom catalogues and Import and export pages.
function downloadFile(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadCatalogueCSV(records) {
  downloadFile('custom-thread-catalogues.csv', new Blob([ThreadCatalogues.exportCSV(records)], { type: 'text/csv;charset=utf-8' }));
}
// The project materials plan (reservations and combined shortage) as JSON.
async function downloadProjectShoppingList() {
  const current = await StashBridge.projectMaterials();
  downloadFile('stitchx-project-shopping-list.json', new Blob([JSON.stringify(current, null, 2)], { type: 'application/json' }));
  return current;
}

// Custom thread catalogues: user-owned reference records, kept apart from the
// manufacturer matching palettes. Its own page (nav > Custom catalogues, or
// Thread Stash > Add threads).
function CataloguePanel({ records, onRecords }) {
  const [text, setText] = useState('');
  const [preview, setPreview] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function importCatalogue() {
    setBusy(true);
    try { onRecords(await ThreadCatalogues.commit(text)); setText(''); setPreview(null); setMessage('Catalogue imported. Projects and matching palettes are unchanged.'); }
    catch (e) { setMessage(e.message); }
    finally { setBusy(false); }
  }
  function exportCatalogue() { downloadCatalogueCSV(records); }
  return (
    <div className="stash-dialog-body">
      <p className="stash-muted">Your own reference catalogues stay separate from the DMC and Anchor matching palettes and from project colours. Colours are optional screen approximations. Substitutions are suggestions and are never applied automatically. Built-in DMC and Anchor data cannot be overwritten.</p>
      <details className="stash-details">
        <summary>CSV format</summary>
        <p>Columns: brand,code,name,rgb,status,substitute,provenance. Use a lowercase custom brand slug, #RRGGBB or an empty colour, active, discontinued or unknown status, and an optional brand:code substitution.</p>
      </details>
      <div className="stash-form-row">
        <label className="stash-file">
          <span>Choose a CSV file</span>
          <input type="file" accept=".csv,text/csv" disabled={busy} onChange={async e => {
            const file = e.target.files[0]; if (!file) return;
            try { if (file.size > 5000000) throw Error('CSV must be under 5 MB.'); const t = await file.text(); setText(t); setPreview(ThreadCatalogues.preview(t, records)); setMessage(''); }
            catch (err) { setMessage(err.message); }
            e.target.value = '';
          }} />
        </label>
        <span className="stash-muted">or paste it below</span>
      </div>
      <label className="stash-textarea">
        <span>Catalogue CSV</span>
        <textarea aria-label="Catalogue CSV" rows={5} value={text} disabled={busy} onChange={e => { setText(e.target.value); setPreview(null); }} />
      </label>
      <div className="stash-form-row">
        <button type="button" className="stash-btn" disabled={busy || !text.trim()} onClick={() => setPreview(ThreadCatalogues.preview(text, records))}>Preview import</button>
        <button type="button" className="stash-btn" disabled={busy || !records.length} onClick={exportCatalogue}>{Icons.download()}<span>Export custom CSV</span></button>
      </div>
      {preview && (
        <div className="stash-preview">
          <p>{preview.records.length} valid records; {preview.errors.length} errors; {preview.duplicates.length} duplicates. Imports with errors or duplicates save nothing.</p>
          {(preview.errors.length + preview.duplicates.length) > 0 && <ul className="stash-preview-errors">{[...preview.errors, ...preview.duplicates].map((m, i) => <li key={i}>{m}</li>)}</ul>}
          {preview.records.length > 0 && <ul className="stash-preview-list">{preview.records.map(t => <li key={t.key}><b>{t.brand} {t.code}</b> {t.name}: {t.status}; {t.rgb ? 'approximate RGB ' + t.rgb.join(',') : 'no colour approximation'}; substitute: {t.substitute || 'none'}; provenance (user supplied): {t.provenance}</li>)}</ul>}
          <button type="button" className="stash-btn stash-btn--primary" disabled={busy || !preview.records.length || !!preview.errors.length || !!preview.duplicates.length} onClick={importCatalogue}>Import catalogue</button>
        </div>
      )}
      <p role="status" className="stash-status-msg">{message}</p>
      <h3 className="stash-subhead">{"Saved records (" + records.length + ")"}</h3>
      {records.length
        ? <ul className="stash-preview-list">{records.map(t => <li key={t.key}><b>{t.brand} {t.code}</b> {t.name}: {t.status}; substitute: {t.substitute || 'none'}; provenance (user supplied): {t.provenance}</li>)}</ul>
        : <p className="stash-muted">No custom records yet.</p>}
    </div>
  );
}

// Project material reservations. Lives at the foot of the Shopping list tab
// (it used to be its own unstyled "Project materials" tab). Labels and
// controls are unchanged; the rules moved under "How reservations work".
function ProjectMaterials({catalogues}) {
  const [plan,setPlan]=useState(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const refresh=useCallback(async()=>{
    try {const next=await StashBridge.projectMaterials();setPlan(next);setError('');}catch(e){setError(e.message);}
  },[]);
  useEffect(()=>{
    refresh();
    const visible=()=>{if(document.visibilityState==='visible')refresh();};
    // Stash reads also announce changes, so do not subscribe to our own writes.
    window.addEventListener('focus',refresh);document.addEventListener('visibilitychange',visible);
    window.addEventListener('cs:stashChanged',refresh);window.addEventListener('cs:projectsChanged',refresh);
    return ()=>{window.removeEventListener('focus',refresh);document.removeEventListener('visibilitychange',visible);window.removeEventListener('cs:stashChanged',refresh);window.removeEventListener('cs:projectsChanged',refresh);};
  },[refresh]);
  async function change(g,patch) {
    setBusy(true);
    try{setPlan(await StashBridge.projectMaterials(g.id,{...g.request,...patch}));setError('');}
    catch(e){setError(e.message);await refresh();setError(e.message);}
    finally{setBusy(false);}
  }
  async function exportList() {
    try {setPlan(await downloadProjectShoppingList());}
    catch(e){setError(e.message);}
  }
  const fmt=n=>n.toLocaleString('en-GB',{maximumFractionDigits:2});
  return <section className="stash-card stash-materials" aria-labelledby="stash-materials-heading">
    <div className="stash-card-head">
      <h2 id="stash-materials-heading">{Icons.box()}<span>Project materials</span></h2>
      <div className="stash-card-action stash-form-row">
        <button type="button" className="stash-btn" onClick={refresh} disabled={busy}>{Icons.refresh()}<span>Refresh estimates</span></button>
        <button type="button" className="stash-btn" onClick={exportList} disabled={busy||!plan}>{Icons.download()}<span>Export shopping list JSON</span></button>
      </div>
    </div>
    <p className="stash-muted">Reserve stash for a project so other patterns don't count on it. Reserving never uses up thread.</p>
    <details className="stash-details">
      <summary>How reservations work</summary>
      <p>Owned is usable stash, including opened skeins. Reserved is held for a project; available excludes every reservation. Earlier project IDs have allocation priority.</p>
      <p>Needs cover unfinished chart units using the same planning model as Materials: project fabric count, two strands for crosses and 20% allowance unless project settings specify otherwise. Skein lengths follow each thread brand. Outlines use one strand unless specified. Estimates include fractional stitches and approximate knot and specialty-stitch lengths. Fabric and beads are excluded. Recorded consumption and stock balances are unchanged.</p>
      <p>Shortages share remaining free stock once in project order. Buy from the combined list: individual lists must not be rounded and added together. After purchasing, add the quantity to your stash and refresh; this list records no orders. Changed estimates adjust claims automatically. Completed, archived, abandoned (UFO) and deleted projects release their claims.</p>
    </details>
    {error&&<p role="alert" className="stash-error">{error}</p>}
    {!plan&&!error&&<p role="status" className="stash-muted">Loading materials…</p>}
    {plan&&<>
      <h3 className="stash-subhead">Combined shortage</h3>
      {!plan.combined.length?<p className="stash-muted">No shortages.</p>:<ul className="stash-plain-list">{plan.combined.map(r=><li key={r.key}><b>{r.key}</b>: short {fmt(r.shortage)} skeins; buy {plural(r.buySkeins,'whole skein')}</li>)}</ul>}
      {!plan.groups.length&&<p className="stash-muted">No active saved projects.</p>}
      {plan.groups.map(g=><section key={g.id} aria-label={g.name} className="stash-material-group">
        <div className="stash-material-head">
          <h3>{g.name}</h3>
          <button type="button" className={"stash-btn"+(g.enabled?"":" stash-btn--primary")} disabled={busy} onClick={()=>change(g,{enabled:!g.enabled})}>{g.enabled?'Release reservations':'Reserve estimated needs'}</button>
        </div>
        {Object.entries(g.substitutions).map(([from,s])=><p key={from} className="stash-sub-note">Confirmed substitution: {from} to {s.key}. <button type="button" className="stash-btn stash-btn--quiet" disabled={busy} onClick={()=>{const subs={...g.request.substitutions};delete subs[from];change(g,{substitutions:subs});}}>Remove substitution</button></p>)}
        <div className="stash-table-wrap"><table className="stash-table"><caption>Quantities in skeins</caption><thead><tr>{['Thread','Owned','Estimated needed','Reserved','Available to any project','Shortage','Reservation limit','Substitution'].map(t=><th key={t} scope="col">{t}</th>)}</tr></thead>
        <tbody>{g.rows.map(r=><tr key={r.key}><th scope="row">{r.key}</th><td>{fmt(r.owned)}</td><td>{fmt(r.estimatedNeeded)}</td><td>{fmt(r.reserved)}</td><td>{fmt(r.available)}</td><td className={r.shortage>0?'is-short':''}>{fmt(r.shortage)}</td>
        <td><form className="stash-inline-form" onSubmit={e=>{e.preventDefault();const n=Number(new FormData(e.currentTarget).get('limit'));if(!Number.isFinite(n)||n<0){setError('Enter a non-negative skein quantity');return;}change(g,{limits:{...g.request.limits,[r.key]:n}});}}><input key={g.request.revision} aria-label={'Reservation limit for '+g.name+' '+r.key} name="limit" type="number" min="0" step="any" required defaultValue={g.request.limits[r.key]??r.estimatedNeeded}/><button className="stash-btn" disabled={busy}>Set limit</button></form></td>
        <td>{Object.values(g.substitutions).some(s=>s.key===r.key)?<span className="stash-muted">Remove the confirmed substitution to change it.</span>:<form className="stash-inline-form" onSubmit={e=>{e.preventDefault();const input=String(new FormData(e.currentTarget).get('substitute')).trim();const colon=input.indexOf(':'),brand=input.slice(0,colon).toLowerCase(),id=input.slice(colon+1);const catalogue=brand==='dmc'?DMC:brand==='anchor'&&typeof ANCHOR!=='undefined'?ANCHOR:[];const match=catalogue.find(t=>String(t.id).toLowerCase()===id.toLowerCase())||(catalogues||[]).find(t=>t.brand===brand&&t.code===id);const key=match?brand+':'+(match.id??match.code):input;if(!match||key===r.key){setError('Choose a different catalogue thread as brand:number, for example anchor:403.');return;}change(g,{substitutions:{...g.request.substitutions,[r.key]:{key,confirmed:true}}});}}><input name="substitute" required aria-label={'Substitute for '+g.name+' '+r.key} placeholder="anchor:403"/><button className="stash-btn" disabled={busy}>Confirm substitution</button></form>}</td>
        </tr>)}</tbody></table></div>
      </section>)}
    </>}
  </section>;
}
