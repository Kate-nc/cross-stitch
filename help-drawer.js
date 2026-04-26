// help-drawer.js — Unified Help, Shortcuts, and Getting Started side drawer.
//
// MIGRATED FROM help-content.js + shortcuts.js (display) + onboarding.js
// (replacement) — original wording in git history. Replaces F3 🔴 dual
// onboarding by collapsing the legacy step-by-step tour into evergreen
// "Getting Started" hints inside the drawer.
//
// Public API:
//   window.HelpDrawer.open({ tab, context, query })
//   window.HelpDrawer.close()
//   window.HelpDrawer.toggle(opts)
//   window.HelpDrawer.isOpen() → boolean
//   window.HelpDrawer._filter(items, query) → filtered subset (test hook)
//
// Behaviours:
//   • Slides in from the right; 380px desktop / 100vw mobile (≤480px).
//   • role="dialog" aria-modal="false" — page behind remains scrollable
//     and interactive. Click outside or press Escape to close.
//   • Global "?" toggles the drawer.
//   • Listens for cs:openHelp, cs:openHelpDesign, cs:openShortcuts events
//     so existing dispatchers (command-palette, page header) still work.
//   • Persists last-open tab in localStorage["cs_help_drawer_tab"].
//
// This file owns no state outside its own module. The drawer mounts once
// into a body-level <div id="cs-help-drawer-root"> and renders via a
// tiny subscribe-render loop — no JSX, no Babel needed.

(function () {
  if (typeof window === "undefined") return;
  if (typeof document === "undefined") return;
  if (typeof React === "undefined" || typeof ReactDOM === "undefined") return;

  var h = React.createElement;
  var TAB_KEY = "cs_help_drawer_tab";

  // ── Help topics — migrated from help-content.js HELP_TOPICS ────────────
  var HELP_TOPICS = [
    {
      id: "creator", area: "Pattern Creator",
      sections: [
        {
          heading: "Generating a pattern from an image",
          body: "Convert any image into a cross-stitch pattern. Adjust dimensions, palette size, and apply filters to get the perfect design.",
          bullets: [
            ["Palette Control", "Limit the maximum number of colours to keep the project manageable."],
            ["Minimum stitches per colour", "Drops colours that are only used a few times — useful for tidying up speckled areas."],
            ["Remove background colour", "Pick a colour from your image to treat as empty fabric. Click 'Pick' then click on the image."]
          ]
        },
        {
          heading: "Editing the generated pattern",
          body: "Once generated, you can manually edit the pattern:",
          bullets: [
            ["Paint & Fill", "Select a colour from the palette below the canvas, then use the Paint or Fill tools to modify individual stitches or areas."],
            ["Backstitch", "Draw lines between grid corners. Use the 'Erase Line' tool to remove them."],
            ["Half-stitches", "Toggle the half-stitch overlay to mark partial coverage."]
          ]
        },
        {
          heading: "Creator tools",
          bullets: [
            ["Hand (H)", "Pan the canvas without painting."],
            ["Magic Wand (W)", "Select a colour region by clicking; refine with the side panel."],
            ["Lasso (L)", "Draw a freeform selection."],
            ["Undo / Redo (Ctrl+Z / Ctrl+Y)", "Step through your edit history."]
          ]
        }
      ]
    },
    {
      id: "tracker", area: "Stitch Tracker",
      sections: [
        {
          heading: "Tracking progress",
          body: "Load a saved project to track your stitching progress interactively.",
          bullets: [
            ["Track Mode", "Click or drag across the pattern to mark stitches as complete. Use the timer to estimate your completion date."],
            ["Navigate Mode", "Place a guide crosshair on the canvas. If you select a colour, you can click to place parking markers."],
            ["Colours Drawer", "Open the drawer at the bottom to see your progress per colour. Click a colour to highlight only those stitches on the canvas."]
          ]
        },
        {
          heading: "Sessions and timer",
          bullets: [
            ["Start / Stop", "The timer auto-pauses after 5 minutes of inactivity."],
            ["Sessions", "Each timer run is logged with start / end times and stitch deltas, used by the Stats page."]
          ]
        }
      ]
    },
    {
      id: "manager", area: "Stash Manager",
      sections: [
        {
          heading: "Thread stash",
          body: "Track which DMC and Anchor threads you own, what's running low, and where each one came from.",
          bullets: [
            ["Bulk Add", "Paste a list of thread IDs to mark them owned in one go."],
            ["Brand toggle", "Switch between DMC and Anchor (or both) — composite keys keep duplicates apart."]
          ]
        },
        {
          heading: "Pattern Library",
          body: "Auto-synced from any project you save in the Creator / Tracker, plus any pattern you add manually here.",
          bullets: [
            ["Shopping list", "Tick patterns to compute the threads you'd need to buy."],
            ["Coverage", "Each card shows how many of its required threads you already own."],
            ["Stash Manager only", "Patterns added here without a linked project are flagged so you don't expect Tracker progress."]
          ]
        }
      ]
    },
    {
      id: "saving", area: "Saving and Backup",
      sections: [
        {
          heading: "Project files",
          bullets: [
            ["Save Project (.json)", "The recommended way to save. Keeps your generated pattern, edits, and tracking progress in one file. Loadable in either Creator or Tracker."],
            ["Export PDF", "Generates a printable multi-page chart with a thread legend."],
            ["Open in Stitch Tracker (Link)", "Creates a sharable URL that opens the pattern directly in the Tracker without needing a file (only works for smaller patterns)."]
          ]
        },
        {
          heading: "Full-app backup",
          body: "Use File → Download all data to export every project, your stash, and your settings as a .csbackup file. Restore with File → Restore from backup. Backups are encrypted with the local app key only — share intentionally.",
          bullets: [
            ["Folder sync (optional)", "Choose a folder once and the app writes incremental updates there so you can sync via Dropbox / iCloud / OneDrive."],
            ["Auto-export", "Toggle in the File menu to write to your sync folder after each save."]
          ]
        }
      ]
    },
    {
      id: "glossary", area: "Glossary",
      sections: [
        {
          heading: "Core concepts",
          bullets: [
            ["Project", "An end-to-end stitching effort: a pattern + progress + history. What you open and stitch."],
            ["Pattern", "The chart / design itself. Lives inside a Project, or as a stand-alone entry in the Stash Manager library."],
            ["Stash", "Your physical thread collection (DMC + Anchor). Tracked in the Stash Manager."],
            ["Skein", "One physical bundle of thread (315 inches by default)."],
            ["Active project", "The single project currently open in the Tracker (autosaves apply to this slot)."]
          ]
        },
        {
          heading: "Save vs. Download vs. Export",
          bullets: [
            ["Save", "Write to the app's internal storage (no file appears). Used for autosave and pattern edits."],
            ["Download", "Write a file to your device (e.g. backup, JSON project)."],
            ["Export", "Generate a share-ready artefact (PDF chart, OXS)."],
            ["Open / Import", "Read from a file or URL into the app."],
            ["Sync (folder)", "Optional incremental writes to a chosen folder for cross-device sync."]
          ]
        }
      ]
    }
  ];

  // ── Shortcut catalogue — migrated from help-content.js (canonical for
  // display). Runtime shortcut registration still lives in shortcuts.js;
  // when window.Shortcuts.list() is populated we merge in any runtime
  // entries that aren't already covered here.
  // Each entry: { id, scope, keys: ['Ctrl+S'] | ['1'], description }.
  var SHORTCUTS = [
    // Global
    { id: "g.esc",  scope: "global", keys: ["Esc"], description: "Close the topmost open panel, modal, or menu" },
    { id: "g.help", scope: "global", keys: ["?"],   description: "Open this help and shortcuts drawer" },
    { id: "g.cmd",  scope: "global", keys: ["Ctrl+K", "⌘K"], description: "Open the command palette" },

    // Creator
    { id: "c.tool1", scope: "creator", keys: ["1"], description: "Cross stitch tool (or switch highlight view to Isolate)" },
    { id: "c.tool2", scope: "creator", keys: ["2"], description: "Half stitch / forward (or Outline mode)" },
    { id: "c.tool3", scope: "creator", keys: ["3"], description: "Half stitch \\ back (or Tint mode)" },
    { id: "c.tool4", scope: "creator", keys: ["4"], description: "Backstitch tool (or Spotlight mode)" },
    { id: "c.tool5", scope: "creator", keys: ["5"], description: "Erase tool" },
    { id: "c.paint", scope: "creator", keys: ["P"], description: "Paint brush" },
    { id: "c.fill",  scope: "creator", keys: ["F"], description: "Fill bucket" },
    { id: "c.wand",  scope: "creator", keys: ["W"], description: "Magic wand (toggle)" },
    { id: "c.eye",   scope: "creator", keys: ["I"], description: "Eyedropper" },
    { id: "c.view",  scope: "creator", keys: ["V"], description: "Cycle view: colour / symbol / both" },
    { id: "c.split", scope: "creator", keys: ["\\"], description: "Toggle split-pane preview" },
    { id: "c.zoomIn",  scope: "creator", keys: ["+", "="], description: "Zoom in" },
    { id: "c.zoomOut", scope: "creator", keys: ["-"], description: "Zoom out" },
    { id: "c.zoomFit", scope: "creator", keys: ["0"], description: "Zoom to fit" },
    { id: "c.undo",  scope: "creator", keys: ["Ctrl+Z", "⌘Z"], description: "Undo" },
    { id: "c.redo",  scope: "creator", keys: ["Ctrl+Y", "Ctrl+Shift+Z"], description: "Redo" },
    { id: "c.save",  scope: "creator", keys: ["Ctrl+S", "⌘S"], description: "Save project" },
    { id: "c.selAll", scope: "creator", keys: ["Ctrl+A", "⌘A"], description: "Select all stitches" },
    { id: "c.invert", scope: "creator", keys: ["Ctrl+Shift+I", "⌘⇧I"], description: "Invert selection" },
    { id: "c.bulk",   scope: "creator", keys: ["B"], description: "Open Bulk Add Threads" },

    // Tracker
    { id: "t.track",   scope: "tracker", keys: ["T"], description: "Switch to Track mode (mark stitches done)" },
    { id: "t.nav",     scope: "tracker", keys: ["N"], description: "Switch to Navigate mode (crosshair and parking markers)" },
    { id: "t.view",    scope: "tracker", keys: ["V"], description: "Cycle view: symbol / colour / highlight" },
    { id: "t.full",    scope: "tracker", keys: ["F"], description: "Toggle full-stitch layer visibility" },
    { id: "t.half",    scope: "tracker", keys: ["H"], description: "Toggle half-stitch layer visibility" },
    { id: "t.knot",    scope: "tracker", keys: ["K"], description: "Toggle French-knot layer visibility" },
    { id: "t.bs",      scope: "tracker", keys: ["L"], description: "Toggle backstitch layer visibility" },
    { id: "t.allLay",  scope: "tracker", keys: ["Shift+A"], description: "Toggle all layers on / off" },
    { id: "t.drawer",  scope: "tracker", keys: ["D"], description: "Toggle the colours drawer" },
    { id: "t.count",   scope: "tracker", keys: ["C"], description: "Toggle counting aids" },
    { id: "t.pause",   scope: "tracker", keys: ["P"], description: "Pause / resume session timer" },
    { id: "t.pan",     scope: "tracker", keys: ["Space (hold)"], description: "Hold to pan the canvas freely" },
    { id: "t.zoomIn",  scope: "tracker", keys: ["+", "="], description: "Zoom in" },
    { id: "t.zoomOut", scope: "tracker", keys: ["-"], description: "Zoom out" },
    { id: "t.zoomFit", scope: "tracker", keys: ["0"], description: "Zoom to fit" },
    { id: "t.undo",    scope: "tracker", keys: ["Ctrl+Z", "⌘Z"], description: "Undo" },
    { id: "t.redo",    scope: "tracker", keys: ["Ctrl+Y", "Ctrl+Shift+Z"], description: "Redo" },
    { id: "t.save",    scope: "tracker", keys: ["Ctrl+S", "⌘S"], description: "Save project" },

    // Tracker — Highlight view
    { id: "th.prev", scope: "tracker", keys: ["[", "←"], description: "Highlight: focus the previous colour" },
    { id: "th.next", scope: "tracker", keys: ["]", "→"], description: "Highlight: focus the next colour" },
    { id: "th.iso",  scope: "tracker", keys: ["1"], description: "Highlight: Isolate — grey out everything except the focused colour" },
    { id: "th.out",  scope: "tracker", keys: ["2"], description: "Highlight: Outline — draw outlines around the focused colour" },
    { id: "th.tint", scope: "tracker", keys: ["3"], description: "Highlight: Tint — dim other colours while the focused one stays vivid" },
    { id: "th.spot", scope: "tracker", keys: ["4"], description: "Highlight: Spotlight — blend between Isolate and Tint" },

    // Manager
    { id: "m.bulk", scope: "manager", keys: ["B"], description: "Open Bulk Add Threads" }
  ];
  var SCOPE_LABEL = {
    global:  "Global",
    creator: "Pattern Creator",
    tracker: "Stitch Tracker",
    manager: "Stash Manager"
  };

  // ── Getting Started — replaces onboarding.js step-by-step tour with a
  // short, evergreen list. The persona / style picker is intentionally
  // dropped (its UI surface no longer exists). Per-page WelcomeWizard
  // replays remain available via the Replay buttons below each section.
  var GETTING_STARTED = [
    {
      id: "make-pattern",
      heading: "Make your first pattern",
      body: "The Pattern Creator turns any image into a cross-stitch chart. Drop a photo, set the dimensions, pick a palette size, and the app does the heavy lifting. From there you can hand-edit, preview a realistic render, and export to PDF.",
      action: { label: "Try a sample pattern", kind: "sample" }
    },
    {
      id: "track",
      heading: "Track your stitches",
      body: "Open any saved project in the Stitch Tracker to mark progress, log session time, and see per-colour completion. Use Highlight view when you're working a single thread to grey out everything else.",
      action: { label: "Replay the Tracker walkthrough", kind: "wizard", page: "tracker" }
    },
    {
      id: "stash",
      heading: "Manage your stash",
      body: "The Stash Manager keeps a tally of every DMC and Anchor skein you own, alongside a pattern library that auto-syncs from your saved projects. Tick patterns to build a shopping list of just the threads you're missing.",
      action: { label: "Replay the Stash walkthrough", kind: "wizard", page: "manager" }
    },
    {
      id: "creator-walkthrough",
      heading: "Take the Creator walkthrough",
      body: "A short guided tour of the Pattern Creator's main controls — generation, editing, and export.",
      action: { label: "Replay the Creator walkthrough", kind: "wizard", page: "creator" }
    },
    {
      id: "shortcuts",
      heading: "Learn the shortcuts",
      body: "Press ? anytime to open this drawer on the Shortcuts tab. Most tools have a single-letter shortcut, and undo / redo / save use the standard Ctrl (or ⌘) combinations.",
      action: null
    }
  ];

  // ── Search filter (pure helper — exposed for tests) ────────────────────
  // items: array of { searchText: string, ... }. Returns subset where
  // searchText (lowercased) contains the query. Empty / short query
  // returns all items unchanged.

  // C11 — American → British spelling alias map. The help drawer index is
  // authored in British English, but many users will type the American
  // form. We expand the user's query so either spelling matches. Mapping
  // is bidirectional and applied to both the query and every alias key
  // discovered inside it.
  var SPELLING_ALIASES = {
    "color": "colour",     "colour": "color",
    "colors": "colours",   "colours": "colors",
    "gray": "grey",        "grey": "gray",
    "customize": "customise", "customise": "customize",
    "organize": "organise",   "organise": "organize",
    "organizer": "organiser", "organiser": "organizer",
    "analyze": "analyse",   "analyse": "analyze",
    "center": "centre",     "centre": "center",
    "behavior": "behaviour", "behaviour": "behavior",
    "realize": "realise",   "realise": "realize",
    "favorite": "favourite", "favourite": "favorite",
    "favorites": "favourites", "favourites": "favorites",
    "neighbor": "neighbour", "neighbour": "neighbor"
  };

  // Returns an array of search terms to try in OR fashion: the original
  // query plus, for each known alias word it contains, a copy of the query
  // with that word substituted for its counterpart. Always lowercased.
  function expandAliases(query) {
    var q = (query == null ? "" : String(query)).trim().toLowerCase();
    if (!q) return [];
    var out = [q];
    for (var alias in SPELLING_ALIASES) {
      if (!Object.prototype.hasOwnProperty.call(SPELLING_ALIASES, alias)) continue;
      // Word-boundary regex avoids substituting "colorize" → "colourize" etc.
      var re = new RegExp("\\b" + alias + "\\b", "g");
      if (re.test(q)) {
        var sub = q.replace(re, SPELLING_ALIASES[alias]);
        if (out.indexOf(sub) === -1) out.push(sub);
      }
    }
    return out;
  }

  function filterItems(items, query) {
    if (!Array.isArray(items)) return [];
    var queries = expandAliases(query);
    if (queries.length === 0) return items.slice();
    return items.filter(function (it) {
      if (!it || typeof it.searchText !== "string") return false;
      for (var i = 0; i < queries.length; i++) {
        if (it.searchText.indexOf(queries[i]) !== -1) return true;
      }
      return false;
    });
  }

  // Build flat search-friendly arrays once.
  function buildHelpItems() {
    var out = [];
    HELP_TOPICS.forEach(function (t) {
      t.sections.forEach(function (s) {
        var bulletText = (s.bullets || []).map(function (b) { return b[0] + " " + b[1]; }).join(" ");
        out.push({
          area: t.area,
          heading: s.heading,
          body: s.body || "",
          bullets: s.bullets || [],
          searchText: (t.area + " " + s.heading + " " + (s.body || "") + " " + bulletText).toLowerCase()
        });
      });
    });
    return out;
  }
  function buildShortcutItems() {
    return SHORTCUTS.map(function (s) {
      var keysStr = s.keys.join(" ");
      return {
        id: s.id,
        scope: s.scope,
        scopeLabel: SCOPE_LABEL[s.scope] || s.scope,
        keys: s.keys,
        description: s.description,
        searchText: (s.scope + " " + keysStr + " " + s.description).toLowerCase()
      };
    });
  }

  var HELP_ITEMS = buildHelpItems();
  var SHORTCUT_ITEMS = buildShortcutItems();

  // ── Drawer state (subscribe / render store) ────────────────────────────
  var state = {
    open: false,
    tab: "help",        // 'help' | 'shortcuts' | 'getting-started'
    context: null,      // 'creator' | 'tracker' | 'manager' | null
    query: ""
  };
  var subscribers = [];
  function setState(patch) {
    var changed = false;
    for (var k in patch) {
      if (Object.prototype.hasOwnProperty.call(patch, k) && state[k] !== patch[k]) {
        state[k] = patch[k]; changed = true;
      }
    }
    if (changed) subscribers.forEach(function (fn) { try { fn(); } catch (_) {} });
  }
  function subscribe(fn) {
    subscribers.push(fn);
    return function () {
      var i = subscribers.indexOf(fn);
      if (i !== -1) subscribers.splice(i, 1);
    };
  }

  function readPersistedTab() {
    try {
      var v = localStorage.getItem(TAB_KEY);
      if (v === "help" || v === "shortcuts" || v === "getting-started") return v;
      if (v != null) localStorage.removeItem(TAB_KEY);
    } catch (_) {}
    return null;
  }
  function persistTab(v) {
    try { localStorage.setItem(TAB_KEY, v); } catch (_) {}
  }

  // ── Public API ─────────────────────────────────────────────────────────
  function open(opts) {
    opts = opts || {};
    var tab;
    if (opts.tab === "help" || opts.tab === "shortcuts" || opts.tab === "getting-started") {
      tab = opts.tab;
    } else if (opts.context === "creator" || opts.context === "tracker" || opts.context === "manager") {
      tab = "shortcuts";
    } else {
      tab = readPersistedTab() || "help";
    }
    var ctx = (opts.context === "creator" || opts.context === "tracker" || opts.context === "manager")
      ? opts.context : null;
    setState({
      open: true,
      tab: tab,
      context: ctx,
      query: typeof opts.query === "string" ? opts.query : ""
    });
    persistTab(tab);
  }
  function close() { setState({ open: false }); }
  function toggle(opts) {
    if (state.open) close();
    else open(opts);
  }
  function isOpen() { return !!state.open; }

  window.HelpDrawer = {
    open: open,
    close: close,
    toggle: toggle,
    isOpen: isOpen,
    _filter: filterItems,
    _expandAliases: expandAliases,
    _SPELLING_ALIASES: SPELLING_ALIASES,
    _helpItems: HELP_ITEMS,
    _shortcutItems: SHORTCUT_ITEMS,
    _gettingStarted: GETTING_STARTED
  };

  // Back-compat shim: anything that still tries to render the old
  // HelpCentre component just opens the drawer instead.
  window.HelpCentre = function HelpCentreShim(props) {
    React.useEffect(function () {
      var t = props && props.defaultTab;
      var ctx = null, tab = "help";
      if (t === "shortcuts") { tab = "shortcuts"; }
      else if (t === "creator") { ctx = "creator"; tab = "help"; }
      else if (t === "tracker") { ctx = "tracker"; tab = "help"; }
      else if (t === "manager") { ctx = "manager"; tab = "help"; }
      open({ tab: tab, context: ctx });
      if (props && typeof props.onClose === "function") props.onClose();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  };
  window.HELP_TOPICS = HELP_TOPICS;

  // ── Drawer view (no JSX — plain React.createElement) ───────────────────
  function kbd(label, key) {
    return h("kbd", {
      key: key,
      style: {
        display: "inline-block", padding: "1px 6px", marginRight:'var(--s-1)',
        fontFamily: "ui-monospace, 'SF Mono', Menlo, monospace",
        fontSize:'var(--text-xs)', lineHeight: 1.4,
        background: "var(--surface)", border: "1px solid #CFC4AC",
        borderRadius: 4, color: "var(--text-primary)",
        boxShadow: "0 1px 0 rgba(0,0,0,0.05)"
      }
    }, label);
  }

  function HelpSection(props) {
    var items = props.items;
    if (!items.length) {
      return h("p", { style: { color: "var(--text-tertiary)", fontSize:'var(--text-md)', padding: "8px 4px" } }, "No matches.");
    }
    // Group by area, preserving first-seen order.
    var order = [];
    var groups = {};
    items.forEach(function (it) {
      if (!groups[it.area]) { groups[it.area] = []; order.push(it.area); }
      groups[it.area].push(it);
    });
    return h("div", null, order.map(function (area) {
      var sections = groups[area];
      return h("div", { key: area, style: { marginBottom: 18 } },
        h("div", {
          style: {
            fontSize:'var(--text-xs)', textTransform: "uppercase", letterSpacing: 0.5,
            color: "var(--text-tertiary)", fontWeight: 700, marginBottom:'var(--s-2)',
            paddingBottom: 4, borderBottom: "1px solid var(--border)"
          }
        }, area),
        sections.map(function (s, i) {
          return h("div", { key: i, style: { marginBottom: 14 } },
            h("h4", { style: { margin: "0 0 4px 0", fontSize:'var(--text-lg)', color: "var(--text-primary)" } }, s.heading),
            s.body && h("p", {
              style: { margin: "0 0 6px 0", color: "var(--text-secondary)", fontSize:'var(--text-md)', lineHeight: 1.55 }
            }, s.body),
            s.bullets && s.bullets.length > 0 && h("ul", {
              style: { margin: 0, paddingLeft: 18, color: "var(--text-secondary)", fontSize:'var(--text-md)', lineHeight: 1.55 }
            }, s.bullets.map(function (b, j) {
              return h("li", { key: j }, h("strong", null, b[0] + ":"), " " + b[1]);
            }))
          );
        })
      );
    }));
  }

  function ShortcutsSection(props) {
    var items = props.items;
    var contextScope = props.context;
    if (!items.length) {
      return h("p", { style: { color: "var(--text-tertiary)", fontSize:'var(--text-md)', padding: "8px 4px" } }, "No matches.");
    }
    var order = ["global", "creator", "tracker", "manager"];
    if (contextScope && order.indexOf(contextScope) !== -1) {
      order = [contextScope].concat(order.filter(function (x) { return x !== contextScope; }));
    }
    var groups = {};
    items.forEach(function (it) {
      (groups[it.scope] = groups[it.scope] || []).push(it);
    });
    return h("div", null, order.filter(function (s) { return groups[s] && groups[s].length; }).map(function (scope) {
      return h("div", { key: scope, style: { marginBottom: 18 } },
        h("div", {
          style: {
            fontSize:'var(--text-xs)', textTransform: "uppercase", letterSpacing: 0.5,
            color: "var(--text-tertiary)", fontWeight: 700, marginBottom:'var(--s-2)',
            paddingBottom: 4, borderBottom: "1px solid var(--border)"
          }
        }, SCOPE_LABEL[scope] || scope),
        groups[scope].map(function (s) {
          return h("div", {
            key: s.id,
            style: {
              display: "flex", gap:'var(--s-3)', padding: "5px 0",
              borderBottom: "0.5px solid var(--surface-tertiary)",
              alignItems: "baseline"
            }
          },
            h("div", { style: { minWidth: 130, flexShrink: 0 } },
              s.keys.map(function (k, i) {
                return h(React.Fragment, { key: i },
                  i > 0 && h("span", { style: { color: "var(--text-tertiary)", fontSize: 10, margin: "0 3px" } }, "/"),
                  kbd(k, "k" + i)
                );
              })
            ),
            h("div", { style: { fontSize:'var(--text-md)', color: "var(--text-secondary)" } }, s.description)
          );
        })
      );
    }));
  }

  function GettingStartedSection() {
    function handleAction(act) {
      if (!act) return;
      if (act.kind === "sample") {
        try {
          if (typeof window.buildSampleProject === "function" && window.ProjectStorage) {
            var p = window.buildSampleProject();
            window.ProjectStorage.save(p).then(function () {
              try { window.ProjectStorage.setActiveProject && window.ProjectStorage.setActiveProject(p.id); } catch (_) {}
              window.location.href = "stitch.html";
            });
            close();
            return;
          }
        } catch (_) {}
        // Fallback: navigate to home with Creator open.
        window.location.href = "index.html";
        close();
      } else if (act.kind === "wizard") {
        try {
          if (window.WelcomeWizard && window.WelcomeWizard.reset) {
            window.WelcomeWizard.reset(act.page);
          }
          window.dispatchEvent(new CustomEvent("cs:showWelcome", { detail: { page: act.page } }));
        } catch (_) {}
        close();
      }
    }
    return h("div", null,
      GETTING_STARTED.map(function (item) {
        return h("div", { key: item.id, style: { marginBottom: 18 } },
          h("h4", { style: { margin: "0 0 4px 0", fontSize:'var(--text-lg)', color: "var(--text-primary)" } }, item.heading),
          h("p", { style: { margin: "0 0 8px 0", color: "var(--text-secondary)", fontSize:'var(--text-md)', lineHeight: 1.55 } }, item.body),
          item.action && h("button", {
            onClick: function () { handleAction(item.action); },
            style: {
              padding: "6px 12px", fontSize:'var(--text-sm)', borderRadius:'var(--radius-sm)',
              border: "1px solid #CFC4AC", background: "var(--surface)",
              color: "var(--accent)", cursor: "pointer", fontWeight: 600,
              fontFamily: "inherit"
            }
          }, item.action.label)
        );
      }),
      // ── C8: Restart guided tours (Phase 1) ────────────────────────────
      h("div", {
        style: {
          marginTop: 18, paddingTop: 14,
          borderTop: "1px solid var(--border)"
        }
      },
        h("h4", { style: { margin: "0 0 4px 0", fontSize:'var(--text-lg)', color: "var(--text-primary)" } }, "Guided tours"),
        h("p", { style: { margin: "0 0 8px 0", color: "var(--text-secondary)", fontSize:'var(--text-md)', lineHeight: 1.55 } },
          "Replay the in-app coachmarks the next time you start a new project."),
        h("button", {
          type: "button",
          "data-action": "restart-tours",
          onClick: function () {
            try { if (typeof window.resetCoaching === "function") window.resetCoaching(); } catch (_) {}
          },
          style: {
            padding: "6px 12px", fontSize:'var(--text-sm)', borderRadius:'var(--radius-sm)',
            border: "1px solid #CFC4AC", background: "var(--surface)",
            color: "var(--accent)", cursor: "pointer", fontWeight: 600,
            fontFamily: "inherit",
            display: "inline-flex", alignItems: "center", gap: 6
          }
        },
          (window.Icons && typeof window.Icons.replay === "function")
            ? h("span", { "aria-hidden": "true", style: { display: "inline-flex" } }, window.Icons.replay())
            : null,
          "Restart guided tours"
        )
      )
    );
  }

  function TabButton(props) {
    var active = props.active;
    return h("button", {
      onClick: props.onClick,
      role: "tab",
      "aria-selected": active ? "true" : "false",
      style: {
        flex: 1, padding: "8px 6px", fontSize:'var(--text-md)', fontWeight: active ? 700 : 500,
        background: active ? "var(--surface)" : "transparent",
        color: active ? "var(--accent)" : "var(--text-secondary)",
        border: "none",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        cursor: "pointer", fontFamily: "inherit",
        display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6
      }
    },
      props.icon && h("span", { "aria-hidden": "true", style: { display: "inline-flex" } }, props.icon),
      props.label
    );
  }

  // ── Focus trap helper ──────────────────────────────────────────────────
  function focusableIn(root) {
    if (!root) return [];
    var sel = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    var nodes = root.querySelectorAll(sel);
    var out = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i];
      if (n.disabled) continue;
      if (n.getAttribute && n.getAttribute("aria-hidden") === "true") continue;
      if (n.offsetParent === null && n.tagName !== "INPUT") continue;
      out.push(n);
    }
    return out;
  }

  function Drawer() {
    var _t = React.useState(0);
    var rerender = _t[1];
    React.useEffect(function () {
      return subscribe(function () { rerender(function (n) { return n + 1; }); });
    }, []);
    var rootRef = React.useRef(null);
    var searchRef = React.useRef(null);

    React.useEffect(function () {
      if (!state.open) return;
      // Focus the search input when opening.
      var t = setTimeout(function () {
        if (searchRef.current) {
          try { searchRef.current.focus(); } catch (_) {}
        }
      }, 30);
      return function () { clearTimeout(t); };
    }, [state.open, state.tab]);

    React.useEffect(function () {
      if (!state.open) return;
      function onKey(e) {
        if (e.key === "Escape") {
          if (!e.defaultPrevented) {
            e.preventDefault(); e.stopPropagation();
            close();
          }
        } else if (e.key === "Tab" && rootRef.current) {
          var f = focusableIn(rootRef.current);
          if (!f.length) return;
          var first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) {
            e.preventDefault(); last.focus();
          } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault(); first.focus();
          }
        }
      }
      document.addEventListener("keydown", onKey, true);
      return function () { document.removeEventListener("keydown", onKey, true); };
    }, [state.open]);

    if (!state.open) return null;

    var helpFiltered = filterItems(HELP_ITEMS, state.query);
    var shortcutsFiltered = filterItems(SHORTCUT_ITEMS, state.query);
    if (state.context && shortcutsFiltered.length) {
      shortcutsFiltered = shortcutsFiltered.slice().sort(function (a, b) {
        var ax = a.scope === state.context ? 0 : 1;
        var bx = b.scope === state.context ? 0 : 1;
        return ax - bx;
      });
    }

    var Icons = window.Icons || {};
    var hasIcon = function (n) { return typeof Icons[n] === "function"; };

    return h(React.Fragment, null,
      // Click-outside catcher — semi-transparent edge tint, but does NOT
      // block scroll on the page behind. Pointer events go through except
      // on the catcher itself (a thin transparent strip).
      h("div", {
        onClick: close,
        "aria-hidden": "true",
        style: {
          position: "fixed", top: 0, right: 380,
          width: "calc(100vw - 380px)", height: "100vh",
          background: "transparent",
          zIndex: 9998,
          pointerEvents: "auto"
        },
        className: "cs-help-drawer-scrim"
      }),
      h("aside", {
        ref: rootRef,
        role: "dialog",
        "aria-modal": "false",
        "aria-label": "Help and shortcuts",
        className: "cs-help-drawer",
        style: {
          position: "fixed", top: 0, right: 0,
          width: 380, maxWidth: "100vw", height: "100vh",
          background: "var(--surface)",
          boxShadow: "-4px 0 16px rgba(15, 23, 42, 0.12)",
          borderLeft: "1px solid var(--border)",
          display: "flex", flexDirection: "column",
          zIndex: 9999,
          fontFamily: "inherit"
        }
      },
        // Header
        h("div", {
          style: {
            padding: "12px 14px 8px",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0
          }
        },
          h("div", {
            style: {
              display: "flex", alignItems: "center", justifyContent: "space-between",
              gap:'var(--s-2)', marginBottom:'var(--s-2)'
            }
          },
            h("strong", { style: { fontSize: 15, color: "var(--text-primary)" } }, "Help"),
            h("button", {
              onClick: close,
              "aria-label": "Close help drawer",
              title: "Close",
              style: {
                background: "transparent", border: "none", cursor: "pointer",
                padding: 4, color: "var(--text-secondary)", display: "inline-flex",
                alignItems: "center", justifyContent: "center"
              }
            }, hasIcon("x") ? Icons.x() : h("span", { "aria-hidden": "true" }, "Close"))
          ),
          h("input", {
            ref: searchRef,
            type: "search",
            inputMode: "search",
            enterKeyHint: "search",
            autoComplete: "off",
            "aria-label": "Search help and shortcuts",
            placeholder: "Search help…",
            value: state.query,
            onChange: function (e) { setState({ query: e.target.value }); },
            style: {
              width: "100%", padding: "7px 10px", fontSize:'var(--text-md)',
              border: "1px solid var(--border)", borderRadius:'var(--radius-sm)',
              boxSizing: "border-box"
            }
          })
        ),
        // Tabs
        h("div", {
          role: "tablist",
          style: {
            display: "flex", borderBottom: "1px solid var(--border)",
            background: "var(--surface-secondary)", flexShrink: 0
          }
        },
          h(TabButton, {
            label: "Help",
            icon: hasIcon("info") ? Icons.info() : null,
            active: state.tab === "help",
            onClick: function () { setState({ tab: "help" }); persistTab("help"); }
          }),
          h(TabButton, {
            label: "Shortcuts",
            icon: hasIcon("keyboard") ? Icons.keyboard() : null,
            active: state.tab === "shortcuts",
            onClick: function () { setState({ tab: "shortcuts" }); persistTab("shortcuts"); }
          }),
          h(TabButton, {
            label: "Getting Started",
            icon: hasIcon("lightbulb") ? Icons.lightbulb() : null,
            active: state.tab === "getting-started",
            onClick: function () { setState({ tab: "getting-started" }); persistTab("getting-started"); }
          })
        ),
        // Body
        h("div", {
          style: { flex: 1, overflowY: "auto", padding: "14px 16px" }
        },
          state.tab === "help"
            ? h(HelpSection, { items: helpFiltered })
            : state.tab === "shortcuts"
              ? h(ShortcutsSection, { items: shortcutsFiltered, context: state.context })
              : h(GettingStartedSection, null)
        )
      )
    );
  }

  // ── Mount once on DOM ready ────────────────────────────────────────────
  function mountDrawer() {
    if (document.getElementById("cs-help-drawer-root")) return;
    var root = document.createElement("div");
    root.id = "cs-help-drawer-root";
    document.body.appendChild(root);
    try {
      ReactDOM.createRoot(root).render(h(Drawer));
    } catch (e) {
      // React 17 fallback (shouldn't happen — repo uses React 18).
      try { ReactDOM.render(h(Drawer), root); } catch (_) {}
    }
  }
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountDrawer);
  } else {
    mountDrawer();
  }

  // ── Event bridges (preserve existing dispatchers) ──────────────────────
  function pageContextFromBody() {
    try {
      var b = document.body;
      if (!b) return null;
      if (b.classList.contains("page-creator")) return "creator";
      if (b.classList.contains("page-tracker")) return "tracker";
      if (b.classList.contains("page-manager")) return "manager";
    } catch (_) {}
    // Best-effort fallback by URL.
    try {
      var p = (window.location && window.location.pathname || "").toLowerCase();
      if (p.indexOf("stitch") !== -1) return "tracker";
      if (p.indexOf("manager") !== -1) return "manager";
      return "creator";
    } catch (_) {}
    return null;
  }
  window.addEventListener("cs:openHelp", function () { open({ tab: "help", context: pageContextFromBody() }); });
  window.addEventListener("cs:openHelpDesign", function () { open({ tab: "help", context: "creator" }); });
  window.addEventListener("cs:openShortcuts", function () { open({ tab: "shortcuts", context: pageContextFromBody() }); });

  // Global "?" toggle — shortcuts.js registry doesn't claim "?", and
  // command-palette.js only handled it on the manager page. Now drawer
  // owns it everywhere.
  document.addEventListener("keydown", function (e) {
    if (e.defaultPrevented) return;
    if (e.key !== "?") return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable || t.tagName === "SELECT")) return;
    e.preventDefault(); e.stopPropagation();
    toggle({ tab: "shortcuts", context: pageContextFromBody() });
  });
})();
